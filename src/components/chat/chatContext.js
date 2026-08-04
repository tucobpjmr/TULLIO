// src/components/chat/chatContext.js
// Context interno alla chat: evita di far scendere tasks/dispatch/templates
// attraverso cinque livelli di prop per arrivare al singolo messaggio.
//
// Vive in un file suo perché lo consumano sei componenti ormai separati: se
// restasse dentro uno di loro, gli altri cinque importerebbero un modulo che
// monta anche del markup.
import { createContext, useContext } from "react";

// Context per condividere tasks/dispatch (per messaggi con taskLink — v0.8)
export const ChatContext = createContext({ tasks: [], dispatch: () => {}, messageTemplates: [], onForward: () => {} });

export const useChatContext = () => useContext(ChatContext);
