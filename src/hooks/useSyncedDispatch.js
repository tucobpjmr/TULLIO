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

// C-1 dell'audit del 14 agosto (secondo passaggio): una scrittura respinta
// dalla RLS NON mette nulla in `error`, quindi "è andata bene" non è
// `!res.error`. Il ragionamento e la funzione vivono in lib/esitoScrittura.js —
// spostati lì da A-2 del terzo passaggio, perché il contratto è del data layer
// e non di questo orchestratore: la chat e il modulo Liste scrivono senza
// passare da qui e avevano ciascuno la propria copia cieca del controllo.
//
// M-1 (audit del 25 agosto): la LETTURA di quell'esito — il caso "array di
// risposte" — e il testo utente dell'errore erano invece ancora scritti qui,
// cioè per il solo core. Ora stanno in state/registroScritture.js, che è il
// contratto comune ai due registry a tabella dell'app: da lì arriva anche la
// forma del toast, così i due non dicono più due frasi diverse per lo stesso
// evento davanti allo stesso utente.
import { erroreDiScrittura, testoErrore, toastErrore } from "../state/registroScritture.js";

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
    // `res` (terzo argomento, opzionale) è ciò che `persist()` ha RISOLTO
    // prima di essere riconosciuto come fallimento — non un'eccezione, ma un
    // esito con `error` dentro (es. ADD_CLIENTS_BULK, dove `res.scritti` dice
    // quanti blocchi sono comunque arrivati sul server prima di quello
    // fallito). Un `.catch` non ha un `res` del genere: lì il rollback riceve
    // `undefined`, esattamente come prima di questo parametro.
    const fail = (err, fallback, res) => {
      console.error(`[VoyageDesk] sync ${action.type}`, err);
      const undo = spec.rollback?.(s, toDispatch, res);
      // `meta.compensazione`: i rollback riusano le action di mutazione (l'undo
      // di UPDATE_OWN_PROFILE è un altro UPDATE_OWN_PROFILE con i valori di
      // prima), e il case del reducer accoderebbe il proprio toast di successo
      // accanto all'errore che stiamo per mostrare — "Profilo aggiornato!"
      // sopra "Salvataggio fallito". Il flag lo mette QUI e non nelle entry
      // perché descrive il percorso, non l'azione: la stessa action è una
      // mutazione quando la chiede l'utente e una compensazione quando la
      // chiede questo ramo d'errore. Il reducer lo legge in un punto solo (vedi
      // state/reducer.js): toast invariati e nessuna voce nel log attività.
      if (undo) rawDispatch({ ...undo, meta: { ...undo.meta, compensazione: true } });
      // B-2 (audit performance/UX del 16 agosto, secondo passaggio): l'UI
      // ottimistica accoda il successo nel reducer, cioè PRIMA che la scrittura
      // parta. Se fallisce, «Task aggiornato!» resta a schermo sopra
      // «Salvataggio fallito: …» — due affermazioni contraddittorie, con quella
      // falsa in cima. La compensazione qui sopra ripristina la coda dei toast
      // PRECEDENTE all'azione (vedi il ramo `meta.compensazione` del reducer),
      // ma solo quando un rollback esiste: le azioni senza compensazione — e
      // quelle il cui successo era già stato accodato prima — restano scoperte.
      // Il ritiro va quindi fatto sempre, e DOPO il rollback per non essere
      // riportato indietro da lui.
      rawDispatch({ type: "RETRACT_TOASTS", payload: action.type });
      rawDispatch(toastErrore(testoErrore(spec, err, fallback)));
      return { error: err };
    };

    return Promise.resolve()
      .then(() => spec.persist(s, toDispatch, uid))
      .then((res) => {
        // supabase-js ritorna { error, count? }; le entry che usano
        // Promise.all ritornano un array di quegli esiti, e `erroreDiScrittura`
        // copre entrambe le forme. Tratta "zero righe toccate da una scrittura
        // mirata a una riga" come un rifiuto, non solo un `error` esplicito —
        // vedi il commento sull'import in cima al file.
        const err = erroreDiScrittura(res);
        return err ? fail(err, "errore sconosciuto", res) : { error: null };
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
