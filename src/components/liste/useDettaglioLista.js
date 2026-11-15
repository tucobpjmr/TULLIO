// src/components/liste/useDettaglioLista.js
// Il dettaglio della lista aperta: lista, movimenti e storico, con la guardia
// contro le risposte arrivate tardi.
//
// M-3 dell'analisi del 14 novembre: era dentro ListeViaggio, che caricava,
// teneva lo stato e disegnava quattro stati diversi in 527 righe. Accanto a
// useListeData, che fa lo stesso per la home.
import { useCallback, useEffect, useRef, useState } from "react";
import { ListeAPI } from "../../lib/api/liste.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

/**
 * @param {string|null} id  la lista aperta, o null se nessuna.
 * @returns {{ detail: { lista: any, movimenti: any[], history: any[] } | null,
 *             ricarica: () => Promise<void> }}
 */
export function useDettaglioLista(id) {
  const dispatch = useDispatch();
  const [detail, setDetail] = useState(/** @type {any} */ (null));

  // Generazione propria, stessa disciplina di useListeData. Senza, il
  // dettaglio di una lista chiusa (o sostituita da un'altra appena aperta) può
  // arrivare in ritardo e sovrascrivere quello della lista che l'utente sta
  // guardando ora: un `setDetail` di A che atterra dopo il passaggio a B.
  const genRef = useRef(0);

  const carica = useCallback(async (daCaricare) => {
    const mia = ++genRef.current;
    const [rLista, rMovs, rHist] = await Promise.all([
      ListeAPI.get(daCaricare), ListeAPI.movimenti(daCaricare), ListeAPI.history(daCaricare),
    ]);
    if (mia !== genRef.current) return; // una carica più recente è già partita
    const failed = [rLista, rMovs, rHist].find((r) => r.error);
    if (failed) {
      console.error("[liste] dettaglio", failed.error);
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Errore: ${failed.error.message}` } });
      return;
    }
    setDetail({ lista: rLista.data, movimenti: rMovs.data || [], history: rHist.data || [] });
  }, [dispatch]);

  useEffect(() => {
    // Chiusura: nessuna carica in volo resta legittima. Bump esplicito
    // (nessuna nuova carica lo farebbe da sola), così una risposta tardiva per
    // la lista appena chiusa non riappare nel dettaglio.
    if (!id) { genRef.current += 1; setDetail(null); return; }
    carica(id);
  }, [id, carica]);

  const ricarica = useCallback(() => (id ? carica(id) : Promise.resolve()), [id, carica]);
  return { detail, ricarica };
}
