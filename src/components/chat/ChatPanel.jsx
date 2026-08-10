// ─── CHAT ────────────────────────────────────────────────────────────────────
// Orchestratore del pannello chat: possiede lo stato di navigazione (lista /
// conversazione / nuova / inoltro), il ponte con Supabase e il ChatContext.
// Il resto vive nei moduli accanto — questo file ne aveva 2.238 di righe, con
// tredici componenti dentro: nessuno di loro era testabile o memoizzabile da
// solo, e ogni modifica alla composer toccava lo stesso file di ogni modifica
// alla lista conversazioni.
//
//   chatContext.js      ponte tasks/dispatch/templates verso i figli
//   chatPresence.js     record utente → stato di presenza
//   chatFormat.js       orari, nome conversazione, ultimo messaggio, non letti
//   chatReactions.js    emoji + memoria delle reazioni recenti
//   chatFiles.js        limite upload e classificazione allegati
//   chatReducers.js     i due reducer locali (conversazione / pannello)
//   message/            bolla, testo, reazioni, player e recorder vocali
//   ConversationView    conversazione aperta + composer
//   ConversationList    elenco conversazioni
//   NewConversationView creazione conversazione
//   ForwardPicker       scelta destinatario per l'inoltro
import { useReducer, useEffect, useMemo, useRef } from "react";
import { useViewport } from "../Viewport.jsx";
import { Messages as MessagesAPI } from "../../lib/api.js";
import { isUuid, newId } from "../../lib/mappers.js";
import { formatDate, formatTime } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { ChatContext } from "./chatContext.js";
import { PRESENCE_COLORS } from "./chatPresence.js";
import { getConversationName, getUnreadCount } from "./chatFormat.js";
import { syncRecentReactionsFromServer } from "./chatReactions.js";
import { chatPanelInitial, chatPanelReducer } from "./chatReducers.js";
import { makeChatCommands } from "./chatCommands.js";
import { ConversationView } from "./ConversationView.jsx";
import { ConversationList } from "./ConversationList.jsx";
import { NewConversationView } from "./NewConversationView.jsx";
import { ForwardPicker } from "./ForwardPicker.jsx";
import { Z } from "../../styles/tokens.js";
import { useConfirm } from "../../state/ConfirmContext.jsx";

// Il badge dei non letti in VoyageDesk.jsx importa getUnreadCount da qui:
// ri-esportato per non toccare i punti d'importazione esistenti.
export { getUnreadCount };


export const ChatPanel = ({ open, onClose, conversations, setConversations, messages, setMessages, commands: commandsProp, markConversationRead, onToggleReaction, onDeleteConversation, intent, tasks, currentUserId, dispatch, presenceMap, messageTemplates = [], loading = false, myBusy = false, onToggleBusy }) => {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const { currentUserId: appUserId, getMember } = useAppData();
  // La prop ha la precedenza sul contesto: i test montano il pannello isolato
  // passando l'utente esplicitamente.
  const me = currentUserId || appUserId;
  // Senza `commands` (mock senza login, test che montano il pannello isolato)
  // si usa la variante locale della stessa factory: identici aggiornamenti di
  // stato, nessuna chiamata a Supabase.
  const commands = useMemo(
    () => commandsProp || makeChatCommands({ setConversations, setMessages, enabled: false }),
    [commandsProp, setConversations, setMessages],
  );
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
    onDeleteConversation(conv.id);
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

  const handleForwardStart = (msg) => {
    pd({ type: "FWD_START", payload: { ...msg, __sourceConvId: activeConv?.id ?? null } });
  };

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
    <ChatContext.Provider value={{ tasks: tasks || [], currentUserId: me, dispatch: dispatch || (() => {}), presenceMap: presenceMap || {}, messageTemplates: messageTemplates || [], onForward: handleForwardStart }}>
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
        <div style={{
          background: "linear-gradient(135deg, var(--navy) 0%, var(--navy-light) 100%)",
          padding: "calc(14px + var(--safe-top)) 16px 14px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 32, height: 32, background: "var(--gold)", borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14,
            }}>💬</div>
            <div>
              <div className="playfair" style={{ color: "#fff", fontSize: 15, fontWeight: 700, lineHeight: 1 }}>
                Messaggi
              </div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, letterSpacing: 1.5, marginTop: 2 }}>
                CHAT INTERNA TEAM
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {onToggleBusy && (
              <button
                onClick={onToggleBusy}
                title={myBusy ? "Sei Occupato — clicca per tornare Online" : "Imposta il tuo stato su Occupato"}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.22)",
                  color: "#fff", height: 28, padding: "0 10px", borderRadius: 14,
                  cursor: "pointer", fontSize: 11, fontWeight: 600,
                }}
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
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.1)", border: "none", color: "#fff",
              width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 14,
            }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {loading ? (
            <div style={{
              height: "100%", display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12, color: "var(--heading)",
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                border: "3px solid rgba(15,32,68,0.15)", borderTopColor: "var(--gold)",
                animation: "spin 0.8s linear infinite",
              }} />
              <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1 }}>
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
              setMessages={setMessages}
              markConversationRead={markConversationRead}
              onToggleReaction={onToggleReaction}
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
};
