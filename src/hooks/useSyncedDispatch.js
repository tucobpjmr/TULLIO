// src/hooks/useSyncedDispatch.js
// Dispatch che applica l'azione al reducer (UI istantanea) e poi la sincronizza
// su Supabase, seguendo le regole dichiarate in state/persistence.js.
//
// Sostituisce lo `switch` da 283 righe che viveva in VoyageDesk.jsx. Qui resta
// solo l'ORCHESTRAZIONE — sempre uguale per ogni azione; il "cosa fare" sta nel
// registry. Il risultato è che i controlli di permesso non sono più riscritti a
// mano accanto a ogni chiamata DB: guard e reducer invocano le stesse funzioni
// pure di lib/permissions.js sullo stesso state.team.
//
// Oltre a permessi, normalizzazione, scrittura e rollback, qui vive anche il
// CICLO DI VITA di una scrittura in volo: l'id della riga che si sta scrivendo
// viene marcato prima di persist() e liberato quando la promise si chiude (in
// un `finally`, quindi anche quando fallisce). Serve a impedire che un refetch
// concorrente — innescato da un evento realtime di un altro utente — riporti a
// schermo il valore pre-scrittura. Anche questo è ORCHESTRAZIONE: quali id
// siano coinvolti lo dichiara la entry (`entityId`), non questo file.
//
// Ritorna sempre una Promise<{ error }>, così i chiamanti che devono
// concatenare operazioni dipendenti dalla persistenza (es. upload allegati
// subito dopo ADD_TASK, che via RLS richiede la riga task già scritta) possono
// await-arla. L'identità della funzione è STABILE tra i render: i figli
// memoizzati che ricevono `dispatch` non si invalidano a ogni mutazione.

import { useCallback, useRef } from "react";
import { PERSISTENCE } from "../state/persistence.js";
import { ADMIN_ONLY_ACTIONS } from "../state/reducer.js";
import { isAdmin } from "../lib/permissions.js";

export function useSyncedDispatch(state, rawDispatch, { enabled = true } = {}) {
  // Snapshot vivo dello state: leggendolo da un ref invece che dalle deps,
  // `dispatch` resta un'identità stabile. Con [state] nelle deps verrebbe
  // ricreato a ogni mutazione, rompendo la memoizzazione dei figli.
  //
  // Assegnato in RENDER e non in useEffect: l'effetto gira dopo il commit,
  // quindi fra due dispatch nello stesso handler il ref conserverebbe lo stato
  // precedente al PRIMO. I guard non se ne accorgono (sono idempotenti), ma le
  // entry che dal vecchio stato CALCOLANO il valore da scrivere — il
  // `!curr.active` di TOGGLE_TEAM_MEMBER_ACTIVE, il `!prev.pinned` di
  // TOGGLE_PIN_NOTICE — sceglierebbero sul valore sbagliato. Il ref non viene
  // mai letto durante il render, solo dentro il callback: l'assegnazione non
  // rende quindi questo componente impuro.
  const stateRef = useRef(state);
  stateRef.current = state;

  return useCallback((action) => {
    if (!enabled) {
      rawDispatch(action);
      return Promise.resolve({ error: null });
    }

    const s = stateRef.current;
    const uid = s.currentUserId;
    const spec = PERSISTENCE[action.type];

    // Pre-check permessi, in due livelli, PRIMA di costruire qualsiasi
    // operazione DB. Senza, un'azione negata lato reducer (stato locale
    // invariato + toast d'errore) veniva comunque inviata a Supabase,
    // affidando l'unica vera barriera alla RLS lato server — nessuna difesa
    // in profondità lato client. Quando è negata si dispatcha comunque
    // l'azione ORIGINALE: è il reducer a produrre il toast di rifiuto.
    const denied = (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(s.team, uid))
      || (spec?.guard ? !spec.guard(s, action, uid) : false);

    if (denied) {
      rawDispatch(action);
      return Promise.resolve({ error: null });
    }

    const toDispatch = spec?.normalize ? spec.normalize(action, s, uid) : action;
    rawDispatch(toDispatch);

    if (!spec?.persist) return Promise.resolve({ error: null });

    // Ciclo di vita della SCRITTURA IN VOLO. Fra il dispatch ottimistico qui
    // sopra e il commit su Supabase passano centinaia di ms: se in quella
    // finestra un evento realtime altrui fa ri-scaricare la lista, la risposta
    // del server è più recente per tutte le altre righe e più VECCHIA per la
    // nostra, e SET_TASKS riporterebbe a schermo il valore di prima. Peggio: la
    // successiva eco della nostra scrittura porta il nostro origin_client e
    // viene scartata, quindi nessun refetch verrebbe poi a correggere la UI.
    //
    // Quali id siano coinvolti lo sa la entry, non l'orchestratore: le action
    // hanno forme diverse (payload.id, payload.taskId, payload nudo, un array
    // per il bulk) e riconoscerle qui rimetterebbe in questo file la conoscenza
    // di entità specifiche che il registry esiste per togliergli.
    const ids = [].concat(spec.entityId?.(toDispatch) ?? []).filter(Boolean);
    if (ids.length) rawDispatch({ type: "MARK_PENDING_WRITE", payload: ids });

    // Percorso d'errore condiviso: rollback dello stato ottimistico (se
    // previsto) e toast con il messaggio più comprensibile disponibile.
    const fail = (err, fallback) => {
      console.error(`[VoyageDesk] sync ${action.type}`, err);
      const undo = spec.rollback?.(s, toDispatch);
      if (undo) rawDispatch(undo);
      const testo = (spec.mapError ? spec.mapError(err) : err?.message) || fallback;
      rawDispatch({
        type: "SHOW_TOAST",
        payload: { type: "error", message: `Salvataggio fallito: ${testo}` },
      });
      return { error: err };
    };

    return Promise.resolve()
      .then(() => spec.persist(s, toDispatch, uid))
      .then((res) => {
        // supabase-js ritorna { error }; le entry che usano Promise.all
        // ritornano un array di quei risultati.
        const err = Array.isArray(res) ? res.find(r => r?.error)?.error : res?.error;
        return err ? fail(err, "errore sconosciuto") : { error: null };
      })
      .catch((e) => fail(e, "errore di rete"))
      // finally e non .then(): un errore di rete che lasciasse l'id marcato per
      // sempre sarebbe un difetto PEGGIORE di quello che questo meccanismo
      // chiude — quel task smetterebbe di aggiornarsi da realtime per il resto
      // della sessione. Lo smarcamento avviene DOPO il rollback dispatchato da
      // fail(), così nemmeno la compensazione può essere sovrascritta.
      .finally(() => {
        if (ids.length) rawDispatch({ type: "UNMARK_PENDING_WRITE", payload: ids });
      });
  }, [enabled, rawDispatch]);
}
