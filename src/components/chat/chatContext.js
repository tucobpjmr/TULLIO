// src/components/chat/chatContext.js
// Context interno alla chat: evita di far scendere tasks/templates attraverso
// cinque livelli di prop per arrivare al singolo messaggio.
//
// M-2 (audit del 25 agosto): `dispatch` NON è più qui dentro. Ci era finito
// perché quattro livelli di prop-drilling erano troppi — cioè per la stessa
// ragione per cui ora esiste state/DispatchContext.jsx, che risponde alla
// domanda per tutta l'app invece che per la sola chat. Tenerne una copia qui
// significherebbe due sorgenti dello stesso dispatch, con la variante locale
// che degrada a `noop` quando il pannello viene montato senza.
//
// Vive in un file suo perché lo consumano sei componenti ormai separati: se
// restasse dentro uno di loro, gli altri cinque importerebbero un modulo che
// monta anche del markup.
import { createContext, useContext } from "react";

// Context per condividere i task (per i messaggi con taskLink — v0.8)
export const ChatContext = createContext({ tasks: [], messageTemplates: [], onForward: () => {} });

export const useChatContext = () => useContext(ChatContext);
