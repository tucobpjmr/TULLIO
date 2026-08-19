// ─── CHAT ────────────────────────────────────────────────────────────────────
// Orchestratore del pannello chat: possiede lo stato di navigazione (lista /
// conversazione / nuova / inoltro), il ponte con Supabase e il ChatContext.
// Il resto vive nei moduli accanto — questo file ne aveva 2.238 di righe, con
// tredici componenti dentro: nessuno di loro era testabile o memoizzabile da
// solo, e ogni modifica alla composer toccava lo stesso file di ogni modifica
// alla lista conversazioni.
//
//   chatContext.js      ponte tasks/dispatch/templates verso i figli
//   lib/presenza.js     record utente → stato di presenza (A-3: salito in
//                       lib/, perché lo legge anche il pannello Admin)
//   chatFormat.js       orari, nome conversazione, ultimo messaggio, non letti
//   chatReactions.js    emoji + memoria delle reazioni recenti
//   chatFiles.js        limite upload e classificazione allegati
//   chatReducers.js     i due reducer locali (conversazione / pannello)
//   message/            bolla, testo, reazioni, player e recorder vocali
//   ConversationView    conversazione aperta + composer
//   ConversationList    elenco conversazioni
//   NewConversationView creazione conversazione
//   ForwardPicker       scelta destinatario per l'inoltro
import { memo, useCallback, useReducer, useEffect, useMemo, useRef, useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { Messages as MessagesAPI } from "../../lib/api.js";
import { isUuid, newId } from "../../lib/mappers.js";
import { formatDate, formatTime } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { ChatContext } from "./chatContext.js";
import { PRESENCE_COLORS } from "../../lib/presenza.js";
import { getConversationName } from "./chatFormat.js";
import { syncRecentReactionsFromServer } from "./chatReactions.js";
import { chatPanelInitial, chatPanelReducer } from "./chatReducers.js";
import { makeChatCommands } from "./chatCommands.js";
import { ConversationView } from "./ConversationView.jsx";
import { ConversationList } from "./ConversationList.jsx";
import { NewConversationView } from "./NewConversationView.jsx";
import { ForwardPicker } from "./ForwardPicker.jsx";
import { Z } from "../../styles/tokens.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";
import { btnChiudiSuScuro, rowCenterGap10, rowCenterGap8 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = {
  background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
  padding: "calc(14px + var(--safe-top)) 16px 14px",
  display: "flex", alignItems: "center", justifyContent: "space-between",
  flexShrink: 0, borderBottom: "1px solid rgba(212,168,67,0.2)",
};
const rowCenterMiddle = {
  width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
};
const txtF15Bold = { color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 };
const txtF10Mt2 = { color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 };
const rowCenterGap6 = {
  display: "flex", alignItems: "center", gap: 6,
  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
  color: "#fff", height: 28, padding: "0 10px", borderRadius: 14,
  cursor: "pointer", fontSize: 11, fontWeight: 600,
};
const flex1 = { flex: 1, overflow: "hidden" };
const colCenterMiddle = {
  height: "100%", display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", gap: 12, color: "var(--heading)",
};
const boxW28H28 = {
  width: 28, height: 28, borderRadius: "50%",
  border: "3px solid rgba(15,32,68,0.15)", borderTopColor: "var(--gold)",
  animation: "spin 0.8s linear infinite",
};
const txtF12Op07 = { fontSize: 12, opacity: 0.7, letterSpacing: 1 };

// Fallback del value del contesto, a livello di modulo: `|| {}` scritto dentro
// il useMemo sarebbe un oggetto nuovo a ogni valutazione, cioè esattamente ciò
// che il memo esiste per evitare.
const noop = () => {};
const vuoto = {};
const vuotaLista = [];


// `memo` (A-2 dell'audit del 16 agosto). Il pannello non è una vista fra le
// altre — è montato dal guscio, che si ri-renderizza a ogni toast, a ogni
// carattere digitato nella ricerca globale e a ogni tick di presenza (30 s) —
// e sotto di sé ha l'intera conversazione aperta, messaggio per messaggio,
// nessuno dei quali è memoizzato. Senza questo `memo` quella catena ripartiva
// per intero a ogni render del guscio, per motivi che con la chat non
// c'entravano nulla. Come per le sei viste, il `memo` regge solo se reggono
// anche le prop: `onClose` è ora un `useCallback` nel guscio e `commands` è
// finalmente stabile (vedi la nota su `notif` in VoyageDeskInner.jsx).
export const ChatPanel = memo(function ChatPanel({ open, onClose, conversations: convProp, messages: msgProp, commands: commandsProp, onDeleteConversation, intent, tasks, currentUserId, dispatch, presenceMap, messageTemplates = [], loading = false, myBusy = false, onToggleBusy }) {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const { currentUserId: appUserId, getMember } = useAppData();
  // La prop ha la precedenza sul contesto: i test montano il pannello isolato
  // passando l'utente esplicitamente.
  const me = currentUserId || appUserId;
  // ST-10 · I setter grezzi non attraversano più il confine del componente.
  //
  // Prima `useChatData` ritornava anche `setConversations`/`setMessages`,
  // VoyageDesk li passava qui fra 18 prop e ConversationView li usava in due
  // punti come fallback "eg. test": erano la SECONDA implementazione di segna-
  // letto e toggla-reazione, compilata in produzione, e nessun test verificava
  // che concordasse con la prima. Ora il pannello possiede lo stato del proprio
  // caso degenere (nessun `commands`: modalità mock senza login, test che
  // montano il pannello isolato) e ne costruisce i comandi con la STESSA
  // factory, `enabled: false` — identici aggiornamenti di stato, nessuna
  // chiamata a Supabase. Fuori di qui esistono solo comandi.
  const [convLocali, setConvLocali] = useState(convProp || []);
  const [msgLocali, setMsgLocali] = useState(msgProp || {});
  const commandsLocali = useMemo(
    () => makeChatCommands({
      setConversations: setConvLocali, setMessages: setMsgLocali,
      getCurrentUserId: () => me, enabled: false,
    }),
    [me],
  );
  const commands = commandsProp || commandsLocali;
  // Con `commands` dal genitore la fonte di verità è la sua: lo stato locale
  // esiste solo nell'altro caso, e tenerlo allineato sarebbe una terza copia.
  const conversations = commandsProp ? convProp : convLocali;
  const messages = commandsProp ? msgProp : msgLocali;
  // Nel caso degenere le prop restano comunque la sorgente: quando il genitore
  // ne sostituisce una (idratazione arrivata dopo il montaggio — è il caso
  // dell'apertura da notifica push a lista ancora vuota) lo stato locale
  // riparte da lì. Con `commands` presente questi due effetti non fanno nulla.
  useEffect(() => { if (!commandsProp) setConvLocali(convProp || []); }, [commandsProp, convProp]);
  useEffect(() => { if (!commandsProp) setMsgLocali(msgProp || {}); }, [commandsProp, msgProp]);
  const [ps, pd] = useReducer(chatPanelReducer, chatPanelInitial);
  const { activeConv, newMode, prefillText, prefillTaskRef, forwardingMsg } = ps;

  // Eliminazione conversazione/gruppo: conferma esplicita (azione irreversibile
  // per TUTTI i partecipanti: messaggi in cascade, allegati rimossi dallo
  // storage). Se la conv eliminata è quella aperta, si torna prima alla lista.
  const handleDeleteConv = async (conv) => {
    if (!onDeleteConversation || !conv) return;
    const label = getConversationName(conv, me, getMember);
    const gruppo = conv.type === "group";
    const ok = await conferma({
      title: gruppo ? `Eliminare il gruppo "${label}"?` : `Eliminare la conversazione con ${label}?`,
      body: `Tutti i messaggi e gli allegati verranno eliminati per ${gruppo ? "tutti i partecipanti" : "entrambi"}. Azione irreversibile.`,
      cta: "Elimina", danger: true,
    });
    if (!ok) return;
    if (activeConv?.id === conv.id) pd({ type: "BACK" });
    // La conversazione INTERA, non il solo id (C-1 del terzo passaggio): il
    // comando la rimette in lista se il DELETE non passa. Qui l'oggetto c'è
    // già — è quello su cui è stata mostrata la conferma.
    onDeleteConversation(conv);
  };

  // Se la conversazione aperta sparisce dalla lista (eliminata da un altro
  // client via realtime), torna alla lista invece di restare su una vista
  // orfana. Il ref ricorda l'ultima conv attiva VISTA nella lista: le conv
  // appena create (o i mock dei test, dove la lista non si aggiorna) non vi
  // sono mai comparse e non devono provocare il BACK.
  const seenActiveRef = useRef(null);
  useEffect(() => {
    if (!activeConv) { seenActiveRef.current = null; return; }
    if (conversations.some(c => c.id === activeConv.id)) {
      seenActiveRef.current = activeConv.id;
    } else if (seenActiveRef.current === activeConv.id) {
      seenActiveRef.current = null;
      pd({ type: "BACK" });
    }
  }, [activeConv, conversations]);

  // `useCallback` perché entra nel value del ChatContext qui sotto: una
  // funzione nuova a ogni render renderebbe nuovo anche il value, cioè
  // annullerebbe il `useMemo` che lo protegge. `pd` è il dispatch di
  // useReducer (identità stabile per contratto) e `activeConv` si legge da un
  // ref, così l'identità non si muove quando si apre una conversazione: il
  // valore letto al momento della chiamata è comunque quello corrente.
  const activeConvRef = useRef(activeConv);
  activeConvRef.current = activeConv;
  const handleForwardStart = useCallback((msg) => {
    pd({ type: "FWD_START", payload: { ...msg, __sourceConvId: activeConvRef.current?.id ?? null } });
  }, []);

  const handleForwardPick = async (destConvId) => {
    const src = forwardingMsg;
    pd({ type: "FWD_CLEAR" });
    if (!src || !destConvId) return;
    // Preserva l'autore originale anche su forward chain (A→B→C): se src è
    // già un forward, ereditiamo il suo originalSenderId; altrimenti è src.sender.
    const originalSenderId = src.originalSenderId || src.sender;
    const base = {
      // id provvisorio: commands.sendMessage lo normalizza in UUID quando
      // persiste (vedi chatCommands.js).
      id: "m" + Date.now(),
      sender: me,
      time: new Date().toISOString(),
      readBy: [me],
      originalSenderId,
    };

    let newMsg;
    if (src.type === "voice") {
      // Vocale: copia metadata (duration/waveform). Se ha audio reale su storage
      // lo si copia server-side nella conv destinazione (come gli allegati file);
      // i vocali legacy/simulati (senza fileUrl) restano solo metadata.
      newMsg = { ...base, type: "voice", duration: src.duration, waveform: src.waveform, fileType: src.fileType ?? null, fileUrl: null };
      if (src.fileUrl && isUuid(destConvId)) {
        const voiceName = `voice.${(src.fileUrl.split(".").pop() || "webm").toLowerCase()}`;
        const { path, error } = await MessagesAPI.copyFile(src.fileUrl, destConvId, voiceName);
        if (error || !path) {
          console.error("[chat] forward voice copyFile", error);
          if (dispatch) dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Inoltro vocale fallito: ${error?.message || "errore sconosciuto"}` } });
          return;
        }
        newMsg.fileUrl = path;
      }
    } else if (src.type === "file") {
      newMsg = {
        ...base, type: "file",
        fileName: src.fileName, fileSize: src.fileSize, fileType: src.fileType,
        fileUrl: null,
      };
      // Copia l'allegato nello storage della conv destinazione (solo se la
      // sorgente ha un path reale e la dest è una conv vera, non mock).
      if (src.fileUrl && isUuid(destConvId)) {
        const { path, error } = await MessagesAPI.copyFile(src.fileUrl, destConvId, src.fileName);
        if (error || !path) {
          console.error("[chat] forward copyFile", error);
          if (dispatch) dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Inoltro allegato fallito: ${error?.message || "errore sconosciuto"}` } });
          return;
        }
        newMsg.fileUrl = path;
      }
    } else {
      newMsg = { ...base, type: "text", text: src.text || "" };
    }

    commands.sendMessage(destConvId, newMsg);
    // Se sto inoltrando verso una conv diversa da quella aperta, aprila per
    // mostrare visivamente il messaggio appena inoltrato.
    if (destConvId !== activeConv?.id) {
      const target = conversations.find(c => c.id === destConvId);
      if (target) pd({ type: "ACTIVATE", conv: target });
    }
    if (dispatch) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Messaggio inoltrato" } });
    }
  };

  // Fase 3 — reazioni recenti cross-device: all'apertura della chat allinea la
  // cache locale col server (no-op per utenti non loggati / id mock).
  useEffect(() => {
    if (!open) return;
    syncRecentReactionsFromServer(me);
  }, [open, me]);

  // Intent con conversazione già nota (tap su una notifica di chat, in-app o
  // push): apre direttamente quella conversazione. `conversations` è nelle
  // deps perché al momento del tap la lista può non essere ancora idratata —
  // l'intent resta e la vista si apre appena la conversazione compare.
  useEffect(() => {
    if (!open || !intent?.convId) return;
    const conv = conversations.find(c => c.id === intent.convId);
    if (conv) pd({ type: "ACTIVATE", conv });
  }, [open, intent, conversations]);

  // Gestione intent: apertura chat verso utente specifico con link a task
  useEffect(() => {
    if (!open || !intent || !intent.toUser) return;
    // Cerca conversazione diretta esistente
    let direct = conversations.find(c =>
      c.type === "direct" &&
      c.participants.includes(me) &&
      c.participants.includes(intent.toUser)
    );
    if (!direct) {
      // UUID subito (come in handleCreate): la vista attivata e la riga
      // persistita devono condividere lo stesso id.
      direct = commands.createConversation({
        id: newId(),
        type: "direct",
        participants: [me, intent.toUser],
        name: null,
      });
    }
    pd({ type: "ACTIVATE", conv: direct });
    // Precompila il messaggio con riferimento al task
    if (intent.taskLink) {
      const t = (tasks || []).find(x => x.id === intent.taskLink);
      if (t) {
        const text = `🔗 Riferimento task: "${t.title}"\n📅 Scadenza: ${formatDate(t.dueDate)} ${formatTime(t.dueDate)}\n\n`;
        pd({ type: "PREFILL", text, taskRef: t.id });
      }
    }
    // `commands`, `conversations` e `tasks` sono volutamente fuori dalle deps:
    // questo effetto consuma un INTENT (apri la chat verso X, magari con un
    // link a un task) e deve girare quando l'intent arriva, non quando il
    // realtime aggiorna l'elenco conversazioni o i task. Includendoli,
    // ogni messaggio in arrivo riaprirebbe la conversazione dell'intent e
    // riscriverebbe il prefill sopra quanto l'utente sta digitando.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, intent, me]);

  // Il value del contesto era un oggetto letterale nel JSX: nuovo a ogni
  // render del pannello, quindi OGNI consumatore (la conversazione aperta,
  // l'elenco, ogni bolla di messaggio) si ri-renderizzava anche quando nessuno
  // dei sei campi era cambiato. È lo stesso difetto che la regola
  // no-restricted-syntax chiude per gli `style={{…}}` costanti — qui però il
  // valore non è costante, quindi la risposta è memoizzarlo sulle sue
  // dipendenze vere (A-2 dell'audit del 16 agosto).
  const ctxValue = useMemo(() => ({
    tasks: tasks || [],
    currentUserId: me,
    dispatch: dispatch || noop,
    presenceMap: presenceMap || vuoto,
    messageTemplates: messageTemplates || vuotaLista,
    onForward: handleForwardStart,
  }), [tasks, me, dispatch, presenceMap, messageTemplates, handleForwardStart]);

  if (!open) return null;

  // Le conv nuove nascono in NewConversationView con id locale "c<timestamp>".
  // L'UUID definitivo lo assegna commands.createConversation, che RITORNA la
  // conversazione normalizzata: si attiva quella, non l'originale. Attivare
  // l'oggetto originale lasciava il creatore su un id non-uuid, con
  // typing/markRead saltati (gate isUuid), il primo messaggio INSERTato con
  // conversation_id invalido e le risposte realtime instradate sotto la chiave
  // UUID di una vista che leggeva ancora "c<timestamp>".
  const handleCreate = (conv, addNew = false) => {
    const attiva = addNew ? commands.createConversation(conv) : conv;
    pd({ type: "ACTIVATE", conv: attiva });
  };

  return (
    <ChatContext.Provider value={ctxValue}>
    <>
      <div onClick={onClose} style={{
        position: "fixed", inset: 0, background: "rgba(15,32,68,0.3)", zIndex: Z.chatBackdrop,
      }} />
      <div className="slide-right vd-sheet-full" style={{
        position: "fixed", top: 0, right: 0, width: isMobile ? "100vw" : 420,
        background: "var(--card)", zIndex: Z.chat, boxShadow: "-20px 0 60px rgba(0,0,0,0.2)",
        display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        {/* Header — il pannello è fixed a top:0, quindi su iPhone la sua testata
            finisce sotto la status bar: il padding-top include l'inset così
            "Online", ✏️ e ✕ restano tappabili (lo sfondo navy riempie comunque
            la zona della status bar). */}
        <div style={rowCenterBetween}>
          <div style={rowCenterGap10}>
            <div style={rowCenterMiddle}>💬</div>
            <div>
              <div className="playfair" style={txtF15Bold}>
                Messaggi
              </div>
              <div style={txtF10Mt2}>
                CHAT INTERNA TEAM
              </div>
            </div>
          </div>
          <div style={rowCenterGap8}>
            {onToggleBusy && (
              <button
                onClick={onToggleBusy}
                title={myBusy ? "Sei Occupato — clicca per tornare Online" : "Imposta il tuo stato su Occupato"}
                style={rowCenterGap6}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%",
                  background: myBusy ? PRESENCE_COLORS.busy : PRESENCE_COLORS.online,
                }} />
                {myBusy ? "Occupato" : "Online"}
              </button>
            )}
            {!loading && (
              <button
                onClick={() => pd({ type: "NEW_MODE", v: true })}
                title="Nuova chat — scrivi a un membro del team"
                style={{
                  background: newMode ? "var(--gold)" : "rgba(255,255,255,0.1)",
                  border: "none", color: newMode ? "var(--navy)" : "#fff",
                  width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 15,
                }}>✏️</button>
            )}
            <button onClick={onClose} style={btnChiudiSuScuro}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={flex1}>
          {loading ? (
            <div style={colCenterMiddle}>
              <div style={boxW28H28} />
              <div style={txtF12Op07}>
                Caricamento chat…
              </div>
            </div>
          ) : newMode ? (
            <NewConversationView
              onCreate={handleCreate}
              onCancel={() => pd({ type: "NEW_MODE", v: false })}
              existing={conversations}
            />
          ) : activeConv ? (
            <ConversationView
              conv={activeConv}
              messages={messages}
              // ⚠️ `commands` NON era passato: ConversationView lo riceveva
              // `undefined` e `commands.sendMessage` avrebbe sollevato al primo
              // invio da una conversazione aperta. Nessun test se n'era accorto
              // perché i due percorsi che i test esercitavano — segna-letto e
              // reazioni — avevano ciascuno il proprio fallback che NON passava
              // dai comandi (ST-10): è precisamente il difetto che una seconda
              // implementazione "solo per i test" nasconde.
              commands={commands}
              onBack={() => pd({ type: "BACK" })}
              onDelete={onDeleteConversation ? () => handleDeleteConv(activeConv) : undefined}
              initialInput={prefillText}
              initialTaskRef={prefillTaskRef}
              onInitialInputConsumed={() => pd({ type: "CLEAR_PREFILL" })}
            />
          ) : (
            <ConversationList
              conversations={conversations}
              messages={messages}
              onSelect={(c) => pd({ type: "ACTIVATE", conv: c })}
              onNew={() => pd({ type: "NEW_MODE", v: true })}
              onDelete={onDeleteConversation ? handleDeleteConv : undefined}
            />
          )}
        </div>
      </div>

      {/* Forward picker overlay (Fase 3): sopra il pannello chat (z-index 900
          > pannello 800). Si chiude su click outside o tasto Annulla. */}
      {forwardingMsg && (
        <ForwardPicker
          msg={forwardingMsg}
          conversations={conversations}
          messages={messages}
          onPick={handleForwardPick}
          onClose={() => pd({ type: "FWD_CLEAR" })}
        />
      )}
    </>
    </ChatContext.Provider>
  );
});
