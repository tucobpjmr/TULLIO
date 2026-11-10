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
import { applicaRighe, fondiCorpus, aggiungiPagina } from "../components/chat/messaggiStato.js";
import { useDebouncedTableSubscription } from "./useDebouncedTableSubscription.js";

// A-2 · Tetto del corpus letto all'avvio (i messaggi più recenti di tutte le
// conversazioni). Sotto il tetto in stato c'è tutto; sopra, la storia più
// vecchia si carica a pagine, per conversazione aperta.
export const TETTO_CORPUS = 2000;
export const PAGINA_STORIA = 50;
const RITARDO_RIGHE_MS = 50;
const STORIA_VUOTA = { caricando: false, completa: false, errore: false };

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

// ─── ST-4, secondo passo (A-2 dell'analisi del 10 novembre) ────────────────
// Il corpus (i TETTO_CORPUS messaggi più recenti) si legge all'avvio e alla
// ripresa: serve ad anteprime e non letti. Gli eventi di `messages` si
// applicano riga per riga, e sopra il tetto la storia più vecchia si carica a
// pagine per conversazione (`caricaPrecedenti`). Resta un limite dichiarato: i
// NON LETTI più vecchi del corpus non entrano nel badge finché la
// conversazione non si apre.

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
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
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

  // ─── A-2 · storia per conversazione ────────────────────────────────────────
  // `corpusCompleto`: l'ultima rilettura stava sotto il tetto, quindi in stato
  // c'è tutto e nessuna conversazione ha «precedenti» da caricare. Sopra il
  // tetto, `storia[convId]` dice a che punto è ciascuna.
  const [corpusCompleto, setCorpusCompleto] = useState(true);
  const [storia, setStoria] = useState({});
  const storiaRef = useRef(storia);
  storiaRef.current = storia;
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const segnaStoria = useRef((convId, patch) => {
    setStoria(prev => ({ ...prev, [convId]: { ...STORIA_VUOTA, ...prev[convId], ...patch } }));
  }).current;

  const caricaPrecedenti = useRef(async (convId) => {
    const stato = storiaRef.current[convId] || STORIA_VUOTA;
    if (!convId || stato.caricando || stato.completa) return;
    segnaStoria(convId, { caricando: true, errore: false });
    const piuVecchio = messagesRef.current[convId]?.[0]?.time ?? null;
    let res;
    try {
      res = await MessagesAPI.listForConversation(convId, { fino: piuVecchio, limit: PAGINA_STORIA });
    } catch (e) {
      res = { data: null, error: e };
    }
    if (res.error) {
      console.error("[chat] msgs.precedenti", res.error);
      onErrorRef.current(`Chat: caricamento dei messaggi precedenti fallito: ${res.error.message || ""}`);
      segnaStoria(convId, { caricando: false, errore: true });
      return;
    }
    const pagina = (res.data || []).map(fromDbMessage).filter(Boolean);
    // Contati sullo stato corrente, non dentro l'updater (che può girare dopo).
    const noti = new Set((messagesRef.current[convId] || []).map(m => m.id));
    const nuovi = pagina.filter(m => !noti.has(m.id)).length;
    setMessagesRaw(prev => aggiungiPagina(prev, convId, pagina).mappa);
    // Storia finita: pagina corta, o nessun messaggio che non avessimo già.
    segnaStoria(convId, {
      caricando: false,
      completa: (res.data || []).length < PAGINA_STORIA || nuovi === 0,
    });
  }).current;

  // ─── A-2 · eventi di `messages` applicati riga per riga ────────────────────
  // Prima ogni evento rileggeva il corpus intero. Gli eventi vicini (un
  // «segna letto» tocca molte righe) finiscono in un solo aggiornamento.
  const righeInAttesa = useRef([]);
  const timerRighe = useRef(null);
  const reloadInVolo = useRef(0);
  const convNote = useRef(new Set());
  useEffect(() => () => clearTimeout(timerRighe.current), []);

  const applicaRigaMessaggio = (tbl, payload) => {
    if (tbl !== "messages") return false;
    // Durante una rilettura l'evento passa dal debounce: applicarlo qui
    // scarterebbe la rilettura in volo (vedi `gen` nell'hook), che l'hook
    // farebbe ripartire. Dal debounce l'evento si unisce a lei: un reload solo.
    if (reloadInVolo.current > 0) return false;
    if (payload?.eventType === "DELETE") {
      const id = payload.old?.id;
      if (!id) return false;
      righeInAttesa.current.push({ tipo: "del", id, convId: payload.old.conversation_id ?? null });
    } else {
      const m = fromDbMessage(payload?.new);
      if (!m?.id || !m.conversation_id) return false;
      righeInAttesa.current.push({ tipo: payload.eventType === "INSERT" ? "ins" : "upd", m });
    }
    clearTimeout(timerRighe.current);
    timerRighe.current = setTimeout(() => {
      const righe = righeInAttesa.current;
      righeInAttesa.current = [];
      setMessagesRaw(prev => applicaRighe(prev, righe));
    }, RITARDO_RIGHE_MS);
    return true;
  };

  // Idratazione chat (conversations + messages) + realtime.
  // `tabelle === null`: idratazione iniziale o ripresa, serve tutto.
  // Solo `messages` (un evento che `applicaRigaMessaggio` non ha potuto
  // applicare): si rilegge il corpus, non le conversazioni (ST-4).
  // Solo `conversations`: si rileggono le conversazioni; il corpus solo se ne
  // compare una mai vista, i cui messaggi non sono passati dal canale.
  useDebouncedTableSubscription(["conversations", "messages"], async (isCurrent, tabelle) => {
    const soloMessaggi = tabelle !== null && tabelle.size > 0 && !tabelle.has("conversations");
    const soloConversazioni = tabelle !== null && tabelle.size > 0 && !tabelle.has("messages");
    reloadInVolo.current += 1;
    try {
      /** @type {{data: any[]|null, error: any}} */
      let convsRes = { data: null, error: null };
      /** @type {{data: any[]|null, error: any}|null} */
      let msgsRes = null;
      if (soloConversazioni) {
        convsRes = await ConversationsAPI.listMine();
        const nuova = !convsRes.error && (convsRes.data || []).some(c => !convNote.current.has(c.id));
        if (nuova) msgsRes = await MessagesAPI.listAll(TETTO_CORPUS);
      } else {
        [convsRes, msgsRes] = await Promise.all([
          soloMessaggi ? Promise.resolve({ data: null, error: null }) : ConversationsAPI.listMine(),
          MessagesAPI.listAll(TETTO_CORPUS),
        ]);
      }
      if (!isCurrent()) return;
      if (convsRes.error) {
        console.error("[chat] convs.list", convsRes.error);
        onError(`Chat: caricamento conversazioni fallito: ${convsRes.error.message || ""}`);
      }
      if (msgsRes?.error) {
        console.error("[chat] msgs.list", msgsRes.error);
        onError(`Chat: caricamento messaggi fallito: ${msgsRes.error.message || ""}`);
      }
      // A-1 · Una lettura fallita non sostituisce lo stato: scrivere `[]` e `{}`
      // svuotava la chat proprio al rientro della rete. Resta ciò che c'era.
      if (convsRes.error || msgsRes?.error) {
        setChatLoading(false);
        return;
      }
      if (!soloMessaggi) {
        convNote.current = new Set((convsRes.data || []).map(c => c.id));
        setConversationsRaw((convsRes.data || []).map(fromDbConversation));
      }
      if (msgsRes) {
        const msgsByConv = {};
        for (const r of msgsRes.data || []) {
          const m = fromDbMessage(r);
          if (!m) continue;
          (msgsByConv[m.conversation_id] ||= []).push(m);
        }
        const troncato = (msgsRes.data || []).length >= TETTO_CORPUS;
        // Le righe in attesa sono più vecchie di questa lettura: la contiene già.
        righeInAttesa.current = [];
        // A-2 (14 agosto): un messaggio la cui INSERT è in volo può mancare
        // dalla risposta; `messaggiInVolo` lo tiene a schermo.
        setMessagesRaw(prev => messaggiInVolo(fondiCorpus(prev, msgsByConv, { troncato }), inVoloRef.current));
        setCorpusCompleto(!troncato);
        // Corpus intero: nessuna storia a pagine da ricordare.
        if (!troncato) setStoria(prev => (Object.keys(prev).length ? {} : prev));
      }
      setChatLoading(false);
    } finally {
      reloadInVolo.current -= 1;
    }
  }, { enabled, deps: [enabled], applyRow: applicaRigaMessaggio });

  const storiaMessaggi = useMemo(
    () => ({ corpusCompleto, perConv: storia }),
    [corpusCompleto, storia],
  );
  const comandi = useMemo(
    () => ({ ...chatCommands, caricaPrecedenti: enabled ? caricaPrecedenti : undefined }),
    [chatCommands, enabled, caricaPrecedenti],
  );

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
    commands: comandi,
    storiaMessaggi,
    unreadChat,
    loading: chatLoading,
  };
}
