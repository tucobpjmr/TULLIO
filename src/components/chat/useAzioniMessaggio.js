// src/components/chat/useAzioniMessaggio.js
// Le tre azioni che una riga di messaggio può chiedere: reagire, fissare in
// bacheca, rispondere.
//
// ─── M-5 dell'audit del 10 settembre · PERCHÉ SONO USCITE ──────────────────
// Non per la lunghezza: per i due ref. `msgsRif` e `commandsRif` esistono solo
// perché questi tre callback devono avere IDENTITÀ STABILE pur leggendo dati
// che cambiano a ogni messaggio in arrivo — e in mezzo alla vista sembravano
// due ref della vista. Sono due ref di queste tre funzioni: qui stanno a tre
// righe da chi li usa, e il perché si legge senza cercarlo.
//
// L'identità stabile è la PREMESSA del `memo` su ChatMessage, non un'aggiunta
// accanto: senza, ogni riga riceve tre prop nuove a ogni render del pannello —
// e il pannello si ri-renderizza su un TIMER, ogni 2,5 s mentre un collega
// scrive (TYPING_PING_MS) e ogni 30 s per l'ageing dei pallini di presenza.
// Un `memo` senza callback stabili è un confronto in più che non può mai
// riuscire.
//
// La tecnica del ref è la stessa di `useSyncedDispatch` (stateRef) e di
// `useSalvataggio` (rif.current), per la stessa ragione — e leggere il ref
// DENTRO il callback, mai durante il render, è ciò che la rende sicura.

import { useCallback, useEffect, useRef } from "react";

/**
 * @param {object} opzioni
 * @param {string} opzioni.convId
 * @param {string} opzioni.myId
 * @param {any[]} opzioni.msgs
 * @param {any} opzioni.commands
 * @param {(a: any) => void} opzioni.cvd
 */
export function useAzioniMessaggio({ convId, myId, msgs, commands, cvd }) {
  const msgsRif = useRef(msgs);
  const commandsRif = useRef(commands);
  useEffect(() => { msgsRif.current = msgs; commandsRif.current = commands; });

  const handleReact = useCallback((msgId, emoji) => {
    // Le reazioni PRECEDENTI viaggiano esplicite verso il comando (M-3): il
    // messaggio è già qui in `msgs`, come per `handleTogglePin` qui sotto, e
    // farle estrarre al comando dall'interno di un updater di setState
    // significava dipendere da quante volte React lo esegue.
    const target = msgsRif.current.find(m => m.id === msgId);
    // Toggle atomico via RPC: l'aggiornamento ottimistico e la persistenza
    // stanno nel comando, che evita di scrivere l'intero oggetto `reactions`
    // dal client (race last-write-wins fra utenti che reagiscono insieme).
    // Anche qui c'era un secondo toggle scritto a mano come "ripiego
    // mock/test" (ST-10): faceva la stessa cosa in un posto in cui nessuno
    // l'avrebbe aggiornata insieme all'altra.
    commandsRif.current.toggleReaction(convId, msgId, emoji, target?.reactions || null);
  }, [convId]);

  // Fase 3 pin: stato group-level, condiviso da tutti i partecipanti. Il
  // messaggio è già qui in `msgs`, quindi si sa se si sta fissando o
  // togliendo: il comando riceve `pinned` esplicito invece di dedurlo da un diff.
  const handleTogglePin = useCallback((msgId) => {
    const target = msgsRif.current.find(m => m.id === msgId);
    if (!target) return;
    commandsRif.current.setMessagePinned(convId, msgId, !target.pinned, myId, {
      pinned: !!target.pinned, pinnedBy: target.pinnedBy ?? null, pinnedAt: target.pinnedAt ?? null,
    });
  }, [convId, myId]);

  // Era un'arrow inline nel JSX della riga: nuova a ogni render, quindi da
  // sola bastava a invalidare il `memo` di ogni ChatMessage.
  const handleReply = useCallback((m) => cvd({ type: "REPLYING", v: m }), [cvd]);

  return { handleReact, handleTogglePin, handleReply };
}
