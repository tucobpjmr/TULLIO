// src/components/chat/useComposerPrefill.js
// Le due volte in cui il composer si riempie DA SOLO: un prefill dal genitore
// e un testo che torna indietro perché l'invio è fallito.
//
// M-5 dell'audit del 10 settembre. Sono due effetti che facevano la stessa
// cosa — scrivere nel composer un testo che l'utente non sta digitando ora —
// e stavano a cinquanta righe di distanza l'uno dall'altro, separati da roba
// che non c'entra. Insieme si legge in una schermata la regola che li governa
// entrambi: il composer non si riscrive mai sopra il testo vivo per un
// ri-render del genitore, solo per un evento che porta un testo nuovo.

import { useEffect, useRef } from "react";

/**
 * @param {object} opzioni
 * @param {string} opzioni.convId
 * @param {any} opzioni.commands
 * @param {(a: any) => void} opzioni.cvd
 * @param {string} [opzioni.initialInput]
 * @param {string|null} [opzioni.initialTaskRef]
 * @param {(() => void)|null} [opzioni.onInitialInputConsumed]
 */
export function useComposerPrefill({
  convId, commands, cvd, initialInput, initialTaskRef, onInitialInputConsumed,
}) {
  const montato = useRef(true);
  useEffect(() => {
    montato.current = true;
    return () => { montato.current = false; };
  }, []);

  // Prefill dal genitore (es. «contatta l'agente» su una task urgente altrui).
  useEffect(() => {
    if (!initialInput) return;
    cvd({ type: "PREFILL", text: initialInput, taskRef: initialTaskRef ?? null });
    if (onInitialInputConsumed) onInitialInputConsumed();
    // `onInitialInputConsumed` e `cvd` volutamente fuori: il primo è un
    // callback del genitore, tipicamente ricreato a ogni suo render.
    // Includendolo, questo effetto ri-scriverebbe il prefill sopra il testo che
    // l'utente sta digitando ogni volta che il genitore si ri-renderizza —
    // cioè a ogni messaggio in arrivo. Il prefill si consuma una volta sola,
    // quando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput, initialTaskRef]);

  // A-5 · quando l'invio di un messaggio di QUESTA conversazione fallisce
  // (rigetto di rete o rifiuto silenzioso della RLS), il testo torna nel
  // composer invece di restare perso: `commands.sendMessage` lo cancellava
  // dallo stato e nessuno lo restituiva a nessuno. Solo i messaggi di TESTO
  // hanno un composer da ripopolare — vocali e allegati restano segnalati dal
  // solo toast, che è già ciò che accade oggi per loro.
  useEffect(() => {
    if (!commands.ascoltaInvioFallito) return undefined;
    return commands.ascoltaInvioFallito(convId, (msg) => {
      if (msg.type !== "text" || !montato.current) return;
      cvd({ type: "RESTORE_FALLITO", text: msg.text, taskRef: msg.taskRef ?? null });
    });
  }, [commands, convId, cvd]);
}
