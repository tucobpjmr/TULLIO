// src/components/chat/ConversationView.jsx
// La conversazione aperta: testata con presenza, elenco messaggi, composer
// (testo, allegati, vocali, template, indicatore "sta scrivendo").
import { useReducer, useEffect, useRef } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { Messages as MessagesAPI, subscribeToTyping } from "../../lib/api.js";
import { isUuid } from "../../lib/mappers.js";
import {
  applyTypingEvent, pruneTypingMap, typingUserIds, buildTypingLabel,
  TYPING_PING_MS, TYPING_STOP_MS,
} from "../../lib/typingUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useChatContext } from "./chatContext.js";
import { computePresence, PRESENCE_COLORS, PRESENCE_LABELS } from "./chatPresence.js";
import { getConversationName } from "./chatFormat.js";
import { MAX_FILE_SIZE, fileKindFromName } from "./chatFiles.js";
import { convViewInitial, convViewReducer } from "./chatReducers.js";
import { ChatMessage } from "./message/ChatMessage.jsx";
import { randomWaveform } from "./message/VoiceRecorder.jsx";
import { MessageComposer } from "./MessageComposer.jsx";
import { parseTaskLink } from "./message/MessageTextContent.jsx";
import { btnChiudiSuScuro } from "../../styles/common.js";
import {
  animation2, animation3, animation4, boxF13White, boxF16, boxFlex1, boxFlex1F12, boxW6H6,
  boxW6H62, boxW6H63, colHFull, rowCenterGap10, rowCenterGap3, rowCenterGap5, rowCenterGap8,
  rowCenterMiddle, rowEndGap8, txtF11, txtF112, txtF14Bold, txtGoldLight,
} from "./conversationViewStyles.js";

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
export const ConversationView = ({ conv, messages, commands, onBack, onDelete, initialInput, initialTaskRef, onInitialInputConsumed }) => {
  const [cv, cvd] = useReducer(convViewReducer, convViewInitial);
  // Il composer riceve `cv` intero e si destruttura da sé i campi che usa
  // (input, recording, replyingTo, showAttach, showTemplates): qui restano
  // solo quelli che servono alla conversazione.
  const { input, replyingTo, showMsgSearch, msgSearch, showPinnedOnly,
          typingMap, pendingTaskRef, uploading } = cv;
  const { currentUserId, presenceMap } = useChatContext();
  const scrollRef = useRef(null);
  // Step M: upload allegati reale
  const fileInputRef = useRef(null);
  const { dispatch } = useChatContext();
  const { currentUserId: appUserId, getMember } = useAppData();
  // `currentUserId` del ChatContext ha la precedenza (i test montano la vista
  // isolata passandolo esplicitamente); altrimenti vale l'utente dell'app.
  const myId = currentUserId || appUserId;
  // Guardia unmount: setState dopo unmount (utente chiude la chat mid-upload)
  // genera un warning React e perde la callback di errore.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Se è arrivato un prefill (es. da "contatta agente" su urgenti altrui), popolalo
  useEffect(() => {
    if (initialInput) {
      cvd({ type: "PREFILL", text: initialInput, taskRef: initialTaskRef ?? null });
      if (onInitialInputConsumed) onInitialInputConsumed();
    }
    // `onInitialInputConsumed` volutamente fuori: è un callback del genitore,
    // tipicamente ricreato a ogni suo render. Includendolo, questo effetto
    // ri-scriverebbe il prefill sopra il testo che l'utente sta digitando ogni
    // volta che il genitore si ri-renderizza — cioè a ogni messaggio in
    // arrivo. Il prefill si consuma una volta sola, quando cambia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInput, initialTaskRef]);

  const msgs = messages[conv.id] || [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [msgs.length]);

  // Mark as read on open E quando arrivano nuovi messaggi non letti a chat
  // aperta (Step Q.4: 1 RPC bulk invece di N UPDATE per msg).
  // unreadCount nella dep list fa scattare l'effect anche quando il realtime
  // aggiorna `msgs` con un nuovo messaggio altrui non letto, non solo
  // all'apertura. Il guard `unreadCount === 0` evita chiamate ridondanti (sia
  // a chat già "letta" sia dopo che il mark ha azzerato readBy, il che
  // impedisce anche il loop: una volta marcati come letti, unreadCount torna
  // a 0 e l'effect si ferma, senza reinnescarsi da solo).
  const unreadCount = msgs.filter(m => m.sender !== myId && !m.readBy?.includes(myId)).length;
  useEffect(() => {
    if (unreadCount === 0) return;
    // ST-10 · Un percorso solo. Qui c'era un fallback che rifaceva a mano lo
    // stesso aggiornamento di `commands.markConversationRead` per i call site
    // che non passavano il callback ("eg. test"): due implementazioni della
    // stessa regola, mai confrontate fra loro, e a divergere sarebbe stata
    // proprio quella che i test esercitavano. `commands` c'è sempre — ChatPanel
    // costruisce la variante locale senza rete quando il genitore non la passa.
    commands.markConversationRead(conv.id);
    // `commands` volutamente fuori: è un oggetto del genitore e includerlo
    // farebbe ripartire il mark-as-read a ogni suo render, cioè una RPC per
    // messaggio in arrivo. Le condizioni che DEVONO
    // farlo ripartire sono già tutte e tre nelle deps — conversazione aperta,
    // quanti non letti restano, chi sono io — e il guard `unreadCount === 0`
    // chiude comunque il ciclo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id, unreadCount, myId]);

  // ── Typing indicator realtime (broadcast) ────────────────────────────────
  // Stato effimero via canale broadcast per-conversazione (subscribeToTyping):
  // niente DB. Ogni client tiene una mappa { userId: expiresAt } dei typer, con
  // auto-scadenza locale così l'indicatore sparisce anche se un evento "stop"
  // si perde. Gestisce nativamente più typer contemporanei nei gruppi.
  const typingMapRef = useRef({});          // mirror sincrono di cv.typingMap
  const typingChannelRef = useRef(null);    // { send, unsubscribe }
  const lastTypingSentRef = useRef(0);       // anti-flood dei "typing:start"
  const typingStopTimerRef = useRef(null);   // debounce "typing:stop"
  useEffect(() => { typingMapRef.current = typingMap; }, [typingMap]);

  const commitTypingMap = (next) => {
    typingMapRef.current = next;
    cvd({ type: "SET_TYPING_MAP", v: next });
  };

  // Sottoscrizione al canale della conversazione. Solo su conv reali (uuid):
  // i mock/test non hanno realtime → nessuna connessione, nessun crash.
  useEffect(() => {
    if (!isUuid(conv.id)) return;
    let channel;
    try {
      channel = subscribeToTyping(conv.id, (payload) => {
        commitTypingMap(applyTypingEvent(typingMapRef.current, payload, { selfId: myId }));
      });
    } catch (err) {
      console.error("[chat] typing subscribe", err);
      return;
    }
    typingChannelRef.current = channel;
    return () => {
      clearTimeout(typingStopTimerRef.current);
      lastTypingSentRef.current = 0;
      try { channel?.send({ userId: myId, typing: false }); } catch { /* noop */ }
      try { channel?.unsubscribe(); } catch { /* noop */ }
      typingChannelRef.current = null;
      commitTypingMap({});
    };
  }, [conv.id, myId]);

  // Prune periodico: rimuove i typer scaduti (fallback se un "stop" si perde).
  useEffect(() => {
    const t = setInterval(() => {
      const pruned = pruneTypingMap(typingMapRef.current);
      if (Object.keys(pruned).length !== Object.keys(typingMapRef.current).length) {
        commitTypingMap(pruned);
      }
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Segnala che l'utente locale sta scrivendo: pubblica "typing:start" (con
  // anti-flood) e programma un "typing:stop" dopo un po' di inattività.
  const notifyTyping = () => {
    const ch = typingChannelRef.current;
    if (!ch) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > TYPING_PING_MS) {
      lastTypingSentRef.current = now;
      try { ch.send({ userId: myId, typing: true }); } catch { /* noop */ }
    }
    clearTimeout(typingStopTimerRef.current);
    typingStopTimerRef.current = setTimeout(() => {
      lastTypingSentRef.current = 0;
      try { ch.send({ userId: myId, typing: false }); } catch { /* noop */ }
    }, TYPING_STOP_MS);
  };

  // Ferma subito il "sto scrivendo" (all'invio del messaggio).
  const stopTyping = () => {
    clearTimeout(typingStopTimerRef.current);
    lastTypingSentRef.current = 0;
    try { typingChannelRef.current?.send({ userId: myId, typing: false }); } catch { /* noop */ }
  };

  const sendText = () => {
    if (!input.trim()) return;
    // Step K: se il testo che sta partendo contiene un pattern "🔗 Riferimento task: ..."
    // (perché viene da prefill o l'utente l'ha mantenuto), allega taskRef UUID.
    const textOut = input.trim();
    const stillHasLink = parseTaskLink(textOut) !== null;
    const newMsg = {
      id: "m" + Date.now(), sender: myId, type: "text",
      text: textOut, time: new Date().toISOString(),
      readBy: [myId],
      replyTo: replyingTo?.id,
      ...(stillHasLink && pendingTaskRef ? { taskRef: pendingTaskRef } : {}),
    };
    commands.sendMessage(conv.id, newMsg);
    stopTyping();
    cvd({ type: "AFTER_SEND" });
  };

  // Riceve il payload dal VoiceRecorder: { blob, duration, waveform, mimeType }.
  // Carica l'audio reale solo su conversazioni vere (uuid); sui mock o quando il
  // microfono non era disponibile (blob null) resta un vocale simulato.
  const sendVoice = async ({ blob, duration, waveform, mimeType }) => {
    let fileUrl = null;
    let fileType = null;
    if (blob && isUuid(conv.id)) {
      const { path, error } = await MessagesAPI.uploadVoice(blob, conv.id, mimeType || "audio/webm");
      if (!mountedRef.current) return;
      if (error || !path) {
        console.error("[chat] voice upload", error);
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Invio vocale fallito: ${error?.message || "errore sconosciuto"}` } });
        cvd({ type: "RECORDING", v: false });
        return;
      }
      fileUrl = path;
      fileType = mimeType || null;
    }
    const newMsg = {
      id: "m" + Date.now(), sender: myId, type: "voice",
      duration, waveform: waveform || randomWaveform(), fileUrl, fileType,
      time: new Date().toISOString(),
      readBy: [myId],
    };
    commands.sendMessage(conv.id, newMsg);
    cvd({ type: "RECORDING", v: false });
  };

  const sendFile = async (file) => {
    if (!file || uploading) return;
    // Validazione client del limite del bucket (vedi migration
    // 20260611_chat_files_storage.sql): senza, l'utente vede l'errore
    // solo dopo aver caricato fino al rifiuto Storage.
    if (file.size > MAX_FILE_SIZE) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `File troppo grande (max ${MAX_FILE_SIZE / 1024 / 1024} MB)` } });
      return;
    }
    // Conv mock (id non-uuid, smoke-test senza login): nessuno storage,
    // il messaggio resta solo locale senza fileUrl.
    let fileUrl = null;
    if (isUuid(conv.id)) {
      cvd({ type: "UPLOADING", v: true });
      const { path, error } = await MessagesAPI.uploadFile(file, conv.id);
      if (!mountedRef.current) return;
      cvd({ type: "UPLOADING", v: false });
      if (error || !path) {
        console.error("[chat] upload", error);
        dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Upload fallito: ${error?.message || "errore sconosciuto"}` } });
        return;
      }
      fileUrl = path;
    }
    const newMsg = {
      id: "m" + Date.now(), sender: myId, type: "file",
      fileName: file.name, fileSize: file.size,
      fileType: fileKindFromName(file.name), fileUrl,
      time: new Date().toISOString(),
      readBy: [myId],
    };
    commands.sendMessage(conv.id, newMsg);
  };

  const handleReact = (msgId, emoji) => {
    // Toggle atomico via RPC: l'aggiornamento ottimistico e la persistenza
    // stanno nel comando, che evita di scrivere l'intero oggetto `reactions`
    // dal client (race last-write-wins fra utenti che reagiscono insieme).
    // Anche qui c'era un secondo toggle scritto a mano come "fallback
    // mock/test" (ST-10): faceva la stessa cosa in un posto in cui nessuno
    // l'avrebbe aggiornata insieme all'altra.
    commands.toggleReaction(conv.id, msgId, emoji);
  };

  // Fase 3 pin: stato group-level, condiviso da tutti i partecipanti. Il
  // messaggio è già qui in `msgs`, quindi si sa se si sta fissando o togliendo:
  // il comando riceve `pinned` esplicito invece di farlo dedurre da un diff.
  const handleTogglePin = (msgId) => {
    const target = msgs.find(m => m.id === msgId);
    if (!target) return;
    commands.setMessagePinned(conv.id, msgId, !target.pinned, myId);
  };

  const otherTypingMember = conv.participants.find(p => p !== myId);
  // Presenza reale dell'interlocutore (solo conv dirette): guida il pallino
  // colorato + l'etichetta nell'header. computePresence normalizza a 'offline'
  // se il membro è assente o non ha last_seen_at. Prima l'header mostrava un
  // "● Online" fisso, ingannevole quando l'altro era in realtà away/offline.
  const otherPresence = conv.type === "direct" && otherTypingMember
    ? computePresence((presenceMap || {})[otherTypingMember])
    : null;

  // Chi sta DAVVERO scrivendo ora (dal broadcast, self escluso): guida sia
  // l'etichetta sia l'avatar del bubble, gestendo più typer nei gruppi.
  const typingIds = typingUserIds(typingMap, { selfId: myId });
  const isTyping = typingIds.length > 0;
  const typingLabel = buildTypingLabel(typingIds, {
    type: conv.type,
    resolveName: (id) => getMember(id)?.name?.split(" ")[0],
  });

  return (
    <div style={colHFull}>
      {/* Header */}
      <div style={rowCenterGap10}>
        <button onClick={onBack} style={btnChiudiSuScuro}>←</button>

        {conv.type === "direct" ? (
          <Avatar memberId={otherTypingMember} size={36} />
        ) : (
          <div style={rowCenterMiddle}>{conv.icon || "👥"}</div>
        )}

        <div className="vd-flex-1-min0">
          <div style={txtF14Bold}>
            {getConversationName(conv, myId, getMember)}
          </div>
          <div style={txtF11}>
            {isTyping ? (
              <span style={txtGoldLight}>
                {typingLabel}
                <span style={animation2}>.</span>
                <span style={animation3}>.</span>
                <span style={animation4}>.</span>
              </span>
            ) : conv.type === "direct" ? (
              <span style={rowCenterGap5}>
                <span style={{
                  width: 7, height: 7, borderRadius: "50%",
                  background: PRESENCE_COLORS[otherPresence] || PRESENCE_COLORS.offline,
                  display: "inline-block",
                }} />
                {PRESENCE_LABELS[otherPresence] || PRESENCE_LABELS.offline}
              </span>
            ) : (
              `${conv.participants.length} membri`
            )}
          </div>
        </div>

        {/* Pill "📌 N fissati" — visibile solo se ci sono messaggi fissati.
            Click → toggle del filtro showPinnedOnly. Stato premuto evidenziato
            in oro per richiamare visivamente la modalità filtro attiva. */}
        {msgs.some(m => m.pinned) && (() => {
          const pinnedCount = msgs.filter(m => m.pinned).length;
          return (
            <button
              onClick={() => cvd({ type: "TOGGLE_PINNED" })}
              title={showPinnedOnly ? "Mostra tutti i messaggi" : "Mostra solo i messaggi fissati"}
              style={{
                background: showPinnedOnly ? "rgba(212,168,67,0.35)" : "rgba(255,255,255,0.1)",
                border: "none", color: "#fff",
                height: 30, padding: "0 10px", borderRadius: 6, cursor: "pointer",
                fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <span>📌</span>
              <span>{pinnedCount}</span>
            </button>
          );
        })()}
        <button
          onClick={() => cvd({ type: "TOGGLE_SEARCH" })}
          title="Cerca nei messaggi"
          style={{
            background: showMsgSearch ? "rgba(212,168,67,0.25)" : "rgba(255,255,255,0.1)",
            border: "none", color: "#fff",
            width: 30, height: 30, borderRadius: 6, cursor: "pointer", fontSize: 13,
          }}>🔍</button>
        {onDelete && (
          <button
            onClick={onDelete}
            title={conv.type === "group" ? "Elimina gruppo" : "Elimina conversazione"}
            aria-label={conv.type === "group" ? "Elimina gruppo" : "Elimina conversazione"}
            style={boxF13White}>🗑</button>
        )}
      </div>

      {/* Search bar (v2.8 Round 13) */}
      {showMsgSearch && (
        <div style={rowCenterGap8}>
          <input
            autoFocus
            value={msgSearch}
            onChange={e => cvd({ type: "SEARCH", v: e.target.value })}
            placeholder="Cerca nei messaggi…"
            style={boxFlex1F12}
          />
          {msgSearch && (
            <span style={txtF112}>
              {msgs.filter(m => m.text?.toLowerCase().includes(msgSearch.toLowerCase())).length} risultati
            </span>
          )}
          <button onClick={() => cvd({ type: "CLOSE_SEARCH" })} style={boxF16}>✕</button>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} style={boxFlex1}>
        {(() => {
          const q = msgSearch.toLowerCase();
          // Filtro: pinned-only + ricerca testo (AND). Mantengo il riferimento
          // a `msgs` per `prevMsg`/`allMessages` (mostra reply/avatar coerenti
          // con la timeline intera, non solo il sottoinsieme filtrato).
          const visible = msgs.filter(m => {
            if (showPinnedOnly && !m.pinned) return false;
            if (msgSearch && !m.text?.toLowerCase().includes(q)) return false;
            return true;
          });
          return visible.map((m) => {
            const i = msgs.indexOf(m);
            return (
              <ChatMessage
                key={m.id}
                msg={m}
                prevMsg={msgs[i - 1]}
                conv={conv}
                allMessages={msgs}
                onReact={handleReact}
                onReply={(m) => cvd({ type: "REPLYING", v: m })}
                onTogglePin={handleTogglePin}
              />
            );
          });
        })()}
        {isTyping && (
          <div style={rowEndGap8}>
            <Avatar memberId={typingIds[0]} size={28} />
            <div style={rowCenterGap3}>
              <span style={boxW6H6} />
              <span style={boxW6H62} />
              <span style={boxW6H63} />
            </div>
          </div>
        )}
      </div>

      <MessageComposer
        cv={cv}
        cvd={cvd}
        fileInputRef={fileInputRef}
        sendText={sendText}
        sendVoice={sendVoice}
        sendFile={sendFile}
        notifyTyping={notifyTyping}
      />
    </div>
  );
};
