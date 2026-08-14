// src/hooks/useChatData.js
// Lo stato della chat: conversazioni, messaggi, idratazione+realtime, comandi
// di scrittura e le due derivazioni che servono fuori (lista personale e badge
// dei non letti).
//
// La chat NON passa dal reducer: è l'unico sottosistema con uno stato proprio,
// perché i messaggi arrivano continuamente da realtime e non hanno bisogno del
// registro azioni/undo/log che il reducer garantisce ai task. Questo hook è
// quindi il suo equivalente: un solo posto che tiene insieme stato e
// persistenza, invece di sette pezzi sparsi nell'orchestratore.

import { useState, useMemo, useRef, useEffect } from "react";
import { Conversations as ConversationsAPI, Messages as MessagesAPI } from "../lib/api.js";
import { fromDbConversation, fromDbMessage } from "../lib/mappers.js";
import { scopeConversationsForUser } from "../lib/chatUtils.js";
import { makeChatCommands } from "../components/chat/chatCommands.js";
import { getUnreadCount } from "../components/chat/chatFormat.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";

// A-2 dell'audit del 14 agosto (secondo passaggio). Messaggi la cui INSERT è
// ancora in volo, raggruppati per conversazione — la stessa forma di
// `messages`, così la fusione col risultato del reload è un semplice merge
// per conversazione. È l'equivalente di `pendingWrites` nel reducer del core,
// per la STESSA ragione: fra il dispatch ottimistico e il commit su Supabase
// passano centinaia di ms, e in quella finestra un evento realtime ALTRUI fa
// ripartire `listAll()`. La risposta è più recente per tutti i messaggi tranne
// il nostro, che non c'è ancora — sostituire la mappa intera lo farebbe
// sparire, e nulla verrebbe poi a rimetterlo: l'eco della nostra INSERT porta
// il nostro `origin_client` e viene scartata da `subscribeToTable`.
//
// `sendMessage` normalizza l'id a un uuid PRIMA dell'INSERT (vedi
// chatCommands.js), quindi l'id locale e quello sul database coincidono: la
// fusione è per id, senza euristiche sul contenuto.
const messaggiInVolo = (mappaDalServer, inVolo) => {
  if (!inVolo.size) return mappaDalServer;
  const out = { ...mappaDalServer };
  for (const { convId, msg } of inVolo.values()) {
    const presenti = out[convId] || [];
    if (presenti.some(m => m.id === msg.id)) continue;
    out[convId] = [...presenti, msg];
  }
  return out;
};

export function useChatData({ enabled, team, currentUserId, mockConversations, mockMessages, onError, onSuccess, onConversationRead }) {
  // Loading: true finché non completa il primo reload da Supabase. Evita il
  // flash "nessun messaggio" mentre l'idratazione è in volo.
  const [chatLoading, setChatLoading] = useState(enabled);

  // Registro delle scritture in volo (vedi messaggiInVolo qui sopra): id →
  // { convId, msg }. In un ref e non in uno state, perché non deve MAI
  // provocare un render da solo — cambia solo insieme al messaggio che
  // rappresenta, che è già in `messages` via l'aggiornamento ottimistico di
  // sendMessage.
  const inVoloRef = useRef(new Map());
  const marcaInVolo = useRef((convId, msg) => { inVoloRef.current.set(msg.id, { convId, msg }); }).current;
  const smarcaInVolo = useRef((msgId) => { inVoloRef.current.delete(msgId); }).current;

  // currentUserId "vivo": i comandi lo leggono al momento della chiamata invece
  // di riceverlo come dipendenza. Senza il ref, `commands` cambierebbe identità
  // a ogni cambio utente e ChatPanel — che lo memoizza — si invaliderebbe.
  const currentUserIdRef = useRef(currentUserId);
  useEffect(() => { currentUserIdRef.current = currentUserId; }, [currentUserId]);
  // In modalità Supabase partiamo da stato vuoto e idratiamo dal DB.
  // Senza login i mock restano per smoke-test rapido.
  const [conversations, setConversationsRaw] = useState(
    enabled ? [] : mockConversations
  );
  const [messages, setMessagesRaw] = useState(
    enabled ? {} : mockMessages
  );

  // Comandi di scrittura della chat (create/send/pin/markRead/reaction/delete).
  // Prima erano due wrapper di setConversations/setMessages che deducevano
  // l'operazione DIFFERENZIANDO lo stato dentro l'updater di setState, e che
  // quindi facevano chiamate di rete da dentro una funzione che React 18 può
  // invocare due volte (StrictMode) o rieseguire (Concurrent): creare una
  // conversazione produceva due INSERT in sviluppo. Ora l'updater è puro e la
  // rete parte da un comando esplicito — vedi components/chat/chatCommands.js.
  const chatCommands = useMemo(() => makeChatCommands({
    setConversations: setConversationsRaw,
    setMessages: setMessagesRaw,
    enabled,
    getCurrentUserId: () => currentUserIdRef.current,
    onError,
    onSuccess,
    // Aprire una conversazione spegne anche la sua notifica in campanella: è
    // bookkeeping delle notifiche, non della chat, quindi il chiamante lo
    // fornisce dall'esterno.
    onConversationRead,
    // A-2: il registro delle scritture in volo (vedi messaggiInVolo qui
    // sopra). marcaInVolo/smarcaInVolo hanno identità stabile (useRef), quindi
    // comparire nelle deps non fa ricreare `chatCommands` a ogni render.
    marcaInVolo,
    smarcaInVolo,
  }), [enabled, onError, onSuccess, onConversationRead, marcaInVolo, smarcaInVolo]);

  // Idratazione chat (conversations + messages) + realtime.
  // chatLoading parte da `useSupabase`: senza login è già false, quindi non
  // serve azzerarlo qui (l'hook non gira affatto quando enabled=false).
  //
  // ST-4: un messaggio nuovo cambia i MESSAGGI e non l'elenco delle
  // conversazioni (updated_at si muove solo su create/rename/pin, non su ogni
  // invio) — stessa forma della correzione A-1 in useListeData.js. La chat è
  // il sottosistema con la frequenza di scrittura più alta dell'app: prima di
  // questa correzione ogni messaggio inviato da chiunque faceva ricaricare
  // listMine() a ogni client connesso per niente.
  // `tabelle === null` = idratazione iniziale (o ripresa dopo un buco di
  // connessione), dove serve tutto.
  useDebouncedTableSubscription(["conversations", "messages"], async (isCurrent, tabelle) => {
    const soloMessaggi = tabelle !== null && tabelle.size > 0 && !tabelle.has("conversations");
    const [convsRes, msgsRes] = await Promise.all([
      soloMessaggi ? Promise.resolve({ data: null, error: null }) : ConversationsAPI.listMine(),
      MessagesAPI.listAll(),
    ]);
    if (!isCurrent()) return;
    if (convsRes.error) {
      console.error("[chat] convs.list", convsRes.error);
      onError(`Chat: caricamento conversazioni fallito: ${convsRes.error.message || ""}`);
    }
    if (msgsRes.error) {
      console.error("[chat] msgs.list", msgsRes.error);
      onError(`Chat: caricamento messaggi fallito: ${msgsRes.error.message || ""}`);
    }
    const msgsByConv = {};
    for (const r of msgsRes.data || []) {
      const m = fromDbMessage(r);
      (msgsByConv[m.conversation_id] ||= []).push(m);
    }
    // Se `soloMessaggi`, le conversazioni già in stato non sono state
    // invalidate: non chiamare setConversationsRaw le lascia com'erano,
    // invece di sostituirle con `[]` perché qui `convsRes.data` non arriva.
    if (!soloMessaggi) {
      setConversationsRaw((convsRes.data || []).map(fromDbConversation));
    }
    // A-2: un messaggio la cui INSERT è ancora in volo può non essere ancora
    // nella risposta del server. Senza questa fusione, sostituire la mappa
    // qui lo farebbe sparire dallo schermo di chi l'ha appena scritto, fino a
    // quando (se mai) un altro reload arriva dopo il commit — l'eco della
    // nostra stessa INSERT viene invece scartata da subscribeToTable.
    setMessagesRaw(messaggiInVolo(msgsByConv, inVoloRef.current));
    setChatLoading(false);
  }, { enabled, deps: [enabled] });

  // La lista chat è PERSONALE: mostra solo le conversazioni di cui l'utente è
  // davvero partecipante (e scarta le dirette orfane → "Sconosciuto"). Vedi
  // scopeConversationsForUser per il perché (RLS admin-see-all + invio bloccato
  // sulle conversazioni di cui non si è partecipanti).
  const chatConversations = useMemo(() => {
    if (!enabled) return conversations;
    const teamIds = new Set((team || []).map(m => m.id));
    return scopeConversationsForUser(conversations, currentUserId, teamIds);
  }, [conversations, team, currentUserId, enabled]);

  // Conta non letti totali per badge topbar (dallo stato vivo della chat).
  //
  // M-5 · memoizzato. Questo hook vive in VoyageDesk, che ri-renderizza a ogni
  // battuta nella barra di ricerca, a ogni toast, a ogni azione: senza useMemo
  // la riduzione ripartiva da capo ogni volta e attraversava TUTTI i messaggi
  // di TUTTE le conversazioni (fino a ~2000 in memoria) per produrre un numero
  // che cambia solo quando arriva o si legge un messaggio. Le dipendenze sono
  // le tre da cui il conteggio dipende davvero — e `chatConversations` è già
  // memoizzato qui sopra, quindi la sua identità non si muove per conto suo.
  const unreadChat = useMemo(
    () => chatConversations.reduce(
      (acc, c) => acc + getUnreadCount(messages, c.id, currentUserId),
      0
    ),
    [chatConversations, messages, currentUserId]
  );

  // ST-10 · I setter grezzi NON escono di qui. `setConversations`/`setMessages`
  // finivano in VoyageDesk e da lì in ChatPanel, dove ConversationView li usava
  // per riscrivere a mano ciò che i comandi già facevano. Chi deve mutare lo
  // stato della chat passa da `commands`, che è il registry di questo
  // sottosistema — la stessa regola che `state/persistence.js` applica al core.
  return {
    conversations: chatConversations,
    messages,
    commands: chatCommands,
    unreadChat,
    loading: chatLoading,
  };
}
