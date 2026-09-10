// src/hooks/useCodaScritture.js
// Il ciclo di vita della coda offline: accodare, contare, rigiocare.
//
// M-2 dell'audit del 10 settembre. Il "cosa" sta in state/codaScritture.js
// (che non conosce React) e in lib/depositoIdb.js (che non conosce l'app):
// qui c'è solo il QUANDO — al ritorno della rete, e al montaggio, perché la
// coda può essere sopravvissuta a una chiusura dell'app e nessun evento
// `online` arriverà mai a raccontarlo.
//
// ⚠️ L'API restituita ha IDENTITÀ STABILE, e non è un vezzo: la riceve
// `useSyncedDispatch`, la cui `useCallback` deve restare stabile fra i render
// (è il contratto dichiarato in cima a quel file — i figli memoizzati che
// ricevono `dispatch` non devono invalidarsi a ogni mutazione). Il CONTEGGIO
// delle voci in attesa, che invece cambia, viaggia separato: è per questo che
// l'hook torna `{ api, inAttesa }` e non un oggetto solo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { creaDeposito } from "../lib/depositoIdb.js";
import { creaCodaScritture, guastoDiRete, scritturaGiaApplicata } from "../state/codaScritture.js";
import { PERSISTENCE } from "../state/persistence.js";
import { erroreDiScrittura, toastErrore, toastSuccesso } from "../state/registroScritture.js";
import { testoEccezione } from "../lib/errori.js";

const STORE = "coda_scritture";

/**
 * L'API stabile che `useSyncedDispatch` riceve. Solo tre membri, e nessuno
 * porta il conteggio: il conteggio cambia, questa non deve.
 *
 * @typedef {object} ApiCoda
 * @property {(scrittura: {tipo: string, azione: any}) => Promise<boolean>} accoda
 * @property {() => Promise<void>} drena
 * @property {boolean} persistente
 */

const plurale = (n, uno, molti) => (n === 1 ? uno : `${n} ${molti}`);

/**
 * @param {object} opzioni
 * @param {boolean} opzioni.enabled  falso in modalità demo: nessun server, nessuna coda.
 * @param {string|null} opzioni.uid
 * @param {any} opzioni.state        lo stato vivo, per `persist` (letto da un ref).
 * @param {(azione: any) => void} opzioni.rawDispatch
 */
export function useCodaScritture({ enabled, uid, state, rawDispatch }) {
  // Stessa tecnica — e stessa giustificazione — di useSyncedDispatch: lo stato
  // si legge da un ref assegnato in render, così l'API resta stabile. Il ref
  // non viene mai letto DURANTE il render, solo dentro le callback.
  const statoRif = useRef(state);
  statoRif.current = state;
  const uidRif = useRef(uid);
  uidRif.current = uid;

  const coda = useMemo(() => creaCodaScritture(creaDeposito({ store: STORE })), []);
  const [inAttesa, setInAttesa] = useState(0);
  // `useState` per il conteggio (serve a disegnare la striscia) e un ref per
  // il drenaggio in corso (serve a NON ripartire due volte): due cose diverse,
  // e un `useState` per la seconda farebbe partire il secondo giro prima che
  // il primo abbia ri-renderizzato.
  const inCorso = useRef(false);
  const montato = useRef(true);
  useEffect(() => () => { montato.current = false; }, []);

  const aggiornaConteggio = useCallback(async () => {
    const u = uidRif.current;
    const n = u ? await coda.conta(u) : 0;
    if (montato.current) setInAttesa(n);
  }, [coda]);

  const drena = useCallback(async () => {
    const u = uidRif.current;
    if (!enabled || !u || inCorso.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    inCorso.current = true;
    let riuscite = 0;
    const perse = [];
    try {
      const voci = await coda.elenco(u);
      for (const voce of voci) {
        const spec = PERSISTENCE[voce.tipo];
        // Una entry sparita dal registry (o senza `persist`) non è
        // rigiocabile: toglierla è l'unica mossa che non lascia la coda
        // bloccata su di lei per sempre.
        if (!spec?.persist) { await coda.rimuovi(voce.id); continue; }
        try {
          const res = await spec.persist(statoRif.current, voce.azione, u);
          const err = erroreDiScrittura(res);
          if (err && !scritturaGiaApplicata(err)) {
            // Rifiuto del SERVER, non della rete: rigiocarla darebbe lo stesso
            // esito per sempre. Esce dalla coda e l'utente lo deve sapere.
            perse.push({ voce, err });
          } else {
            riuscite += 1;
          }
          await coda.rimuovi(voce.id);
        } catch (e) {
          if (guastoDiRete(e)) {
            // La rete è caduta di nuovo a metà drenaggio: la voce RESTA, e
            // con lei tutte quelle dopo — l'ordine è il contratto della coda.
            return;
          }
          perse.push({ voce, err: e });
          await coda.rimuovi(voce.id);
        }
      }
    } finally {
      inCorso.current = false;
      await aggiornaConteggio();
      if (riuscite > 0) {
        rawDispatch(toastSuccesso(
          `${plurale(riuscite, "La modifica in attesa è stata inviata", "modifiche in attesa sono state inviate")}.`
        ));
      }
      for (const { voce, err } of perse) {
        // Il rollback dell'entry, quando c'è: dopo un reload lo stato viene dal
        // server e il rollback è un no-op — è la forma giusta, perché in quel
        // caso non c'è nulla di ottimistico da annullare. `compensazione` per
        // la stessa ragione di useSyncedDispatch: il case del reducer non deve
        // accodare il proprio toast di successo.
        const undo = PERSISTENCE[voce.tipo]?.rollback?.(statoRif.current, voce.azione);
        if (undo) rawDispatch({ ...undo, meta: { ...undo.meta, compensazione: true } });
        rawDispatch(toastErrore(testoEccezione(err, "modifica in attesa rifiutata dal server")));
      }
    }
  }, [enabled, coda, aggiornaConteggio, rawDispatch]);

  // Al montaggio e a ogni ritorno della rete. Il montaggio NON è ridondante:
  // una coda scritta ieri sera è ancora lì stamattina, e nessun evento
  // `online` la annuncerà — il browser è partito già connesso.
  useEffect(() => {
    if (!enabled) return undefined;
    aggiornaConteggio();
    drena();
    const suOnline = () => { drena(); };
    window.addEventListener("online", suOnline);
    return () => window.removeEventListener("online", suOnline);
  }, [enabled, uid, drena, aggiornaConteggio]);

  const api = useMemo(() => ({
    /**
     * @param {{tipo: string, azione: any}} scrittura
     * @returns {Promise<boolean>} `false` = non accodata (coda piena o
     *   deposito non disponibile): chi chiama deve tornare al rollback.
     */
    accoda: async ({ tipo, azione }) => {
      const u = uidRif.current;
      if (!enabled || !u) return false;
      const fatto = await coda.accoda({ uid: u, tipo, azione });
      if (fatto) await aggiornaConteggio();
      return fatto;
    },
    drena: () => drena(),
    persistente: coda.persistente,
  }), [enabled, coda, aggiornaConteggio, drena]);

  return { api, inAttesa };
}
