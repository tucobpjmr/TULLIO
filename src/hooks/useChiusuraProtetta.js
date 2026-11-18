// src/hooks/useChiusuraProtetta.js
// La chiusura di un form che ha qualcosa da perdere.
//
// PERCHÉ ESISTE (A-3 dell'analisi UX del 15 novembre). Esc, ✕ e «Annulla»
// chiudevano i form compilati senza chiedere: `LvOverlay` toglieva il click
// sul velo per proteggere i form sul denaro, ma Esc chiamava `onClose` lo
// stesso, e una tabella di movimenti scritta a mano spariva con un tasto.
// La guardia esisteva in un posto solo (`BulkTaskCreator`), scritta a mano.
//
// ⚠️ `alSuccesso` di `useSalvataggio` riceve l'`onClose` ORIGINALE, non
// questo: dopo un salvataggio riuscito non c'è più niente da perdere, e una
// conferma lì sarebbe una domanda assurda.

import { useCallback, useRef } from "react";
import { useConfirm } from "../state/ConfirmContext.jsx";

const TESTI_PREDEFINITI = {
  title: "Chiudere senza salvare?",
  body: "Quello che hai inserito non è stato salvato: chiudendo va perso.",
  cta: "Chiudi senza salvare",
  annulla: "Continua a modificare",
};

/**
 * @param {() => void} onClose  la chiusura vera e propria.
 * @param {boolean} sporco      true se il form contiene dati non salvati.
 * @param {{title?: string, body?: string, cta?: string, annulla?: string}} [testi]
 * @returns {() => Promise<void>} da passare a overlay, ✕ e «Annulla».
 */
export function useChiusuraProtetta(onClose, sporco, testi) {
  const conferma = useConfirm();
  // Esc premuto due volte non apre due domande.
  const inCorso = useRef(false);
  const rif = useRef({ onClose, sporco, testi });
  rif.current = { onClose, sporco, testi };

  return useCallback(async () => {
    const { onClose: chiudi, sporco: daProteggere, testi: t } = rif.current;
    if (!daProteggere) { chiudi(); return; }
    if (inCorso.current) return;
    inCorso.current = true;
    try {
      const ok = await conferma({ ...TESTI_PREDEFINITI, ...t, danger: true });
      if (ok) rif.current.onClose();
    } finally {
      inCorso.current = false;
    }
  }, [conferma]);
}
