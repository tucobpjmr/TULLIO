// src/components/chat/useLetturaConversazione.js
// Cosa succede quando arrivano messaggi mentre la chat è APERTA: si scende in
// fondo, e si segnano come letti.
//
// M-5 dell'audit del 10 settembre. I due effetti erano separati nel corpo
// della vista da un `useMemo` e da un conteggio; sono la stessa regola vista
// da due lati — «la conversazione aperta è la conversazione letta» — e
// l'ordine fra loro non conta perché toccano cose diverse (il DOM e il
// server). Metterli insieme rende evidente ciò che entrambi presumono: che
// questa vista sia visibile.

import { useEffect } from "react";

/**
 * @param {object} opzioni
 * @param {string} opzioni.convId
 * @param {any[]} opzioni.msgs
 * @param {string} opzioni.myId
 * @param {any} opzioni.commands
 * @param {{current: any}} opzioni.scrollRif
 * @returns {number} quanti messaggi non letti restano (serve solo qui, ma è
 *   ciò che fa ripartire il mark-as-read: vale la pena vederlo).
 */
export function useLetturaConversazione({ convId, msgs, myId, commands, scrollRif }) {
  useEffect(() => {
    scrollRif.current?.scrollTo({ top: scrollRif.current.scrollHeight, behavior: "smooth" });
    // `scrollRif` è un ref: la sua identità non cambia mai, e includerlo o no
    // non sposta nulla. Fuori, per non far credere che sia una condizione.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msgs.length]);

  // Mark as read all'apertura E quando arrivano nuovi messaggi non letti a
  // chat aperta (Step Q.4: 1 RPC bulk invece di N UPDATE per messaggio).
  // `nonLetti` nella dep list fa scattare l'effetto anche quando il realtime
  // aggiunge un messaggio altrui, non solo all'apertura. Il guard `=== 0`
  // evita le chiamate ridondanti (sia a chat già letta, sia dopo che il mark
  // ha azzerato readBy) e chiude il ciclo: una volta marcati, `nonLetti` torna
  // a zero e l'effetto si ferma senza reinnescarsi.
  const nonLetti = msgs.filter(m => m.sender !== myId && !m.readBy?.includes(myId)).length;
  useEffect(() => {
    if (nonLetti === 0) return;
    // ST-10 · Un percorso solo. Qui c'era un ripiego che rifaceva a mano lo
    // stesso aggiornamento di `commands.markConversationRead` per i call site
    // che non passavano il callback ("es. i test"): due implementazioni della
    // stessa regola, mai confrontate fra loro, e a divergere sarebbe stata
    // proprio quella che i test esercitavano. `commands` c'è sempre —
    // ChatPanel costruisce la variante locale senza rete quando il genitore
    // non la passa.
    commands.markConversationRead(convId);
    // `commands` volutamente fuori: è un oggetto del genitore, e includerlo
    // farebbe ripartire il mark-as-read a ogni suo render — cioè una RPC per
    // messaggio in arrivo. Le tre condizioni che DEVONO farlo ripartire sono
    // già tutte nelle deps: quale conversazione, quanti non letti, chi sono io.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, nonLetti, myId]);

  return nonLetti;
}
