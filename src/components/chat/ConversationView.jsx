// src/components/chat/ConversationView.jsx
// La conversazione aperta: testata con presenza, elenco messaggi, composer
// (testo, allegati, vocali, template, indicatore "sta scrivendo").
import { useReducer, useEffect, useRef, useMemo, useCallback } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { Messages as MessagesAPI, subscribeToTyping } from "../../lib/api.js";
import { isUuid } from "../../lib/mappers.js";
import {
  applyTypingEvent, pruneTypingMap, typingUserIds, buildTypingLabel,
  TYPING_PING_MS, TYPING_STOP_MS,
} from "../../lib/typingUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useChatContext } from "./chatContext.js";
import { computePresence, PRESENCE_COLORS, PRESENCE_LABELS, TICK_PRESENZA_MS } from "../../lib/presenza.js";
import { useTickLento } from "../../hooks/useTickLento.js";
import { useFinestra } from "../../hooks/useFinestra.js";
import { MostraAltri } from "../ui/MostraAltri.jsx";
import { getConversationName } from "./chatFormat.js";
import { MAX_FILE_SIZE, fileKindFromName } from "./chatFiles.js";
import { convViewInitial, convViewReducer } from "./chatReducers.js";
import { ChatMessage } from "./message/ChatMessage.jsx";
import { randomWaveform } from "./message/VoiceRecorder.jsx";
import { MessageComposer } from "./MessageComposer.jsx";
import { parseTaskLink } from "./message/MessageTextContent.jsx";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import {
  animation2, animation3, animation4, boxF13White, boxF16, boxFlex1, boxFlex1F12, boxW6H6,
  boxW6H62, boxW6H63, colHFull, rowCenterGap10, rowCenterGap3, rowCenterGap5, rowCenterGap8,
  rowCenterMiddle, rowEndGap8, txtF11, txtF112, txtF14Bold, txtGoldLight,
} from "./conversationViewStyles.js";

// M-2 · Quanti messaggi si disegnano. Cinquanta e non 24 come le altre viste:
// una conversazione si legge a colpo d'occhio scorrendo indietro, e una
// finestra troppo stretta trasformerebbe la lettura normale in una sequenza di
// click. È comunque il tetto che tiene fuori le conversazioni lunghe, che sono
// quelle per cui la finestra esiste.
const PAGINA_MESSAGGI = 50;

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
export const ConversationView = ({ conv, messages, commands, onBack, onDelete, initialInput, initialTaskRef, onInitialInputConsumed }) => {
  const [cv, cvd] = useReducer(convViewReducer, convViewInitial);
  // Il composer riceve `cv` intero e si destruttura da sé i campi che usa
  // (input, recording, replyingTo, showAttach, showTemplates): qui restano
  // solo quelli che servono alla conversazione.
  const { input, replyingTo, showMsgSearch, msgSearch, showPinnedOnly,
          typingMap, pendingTaskRef, uploading } = cv;
  const { currentUserId, presenceMap } = useChatContext();
  const dispatch = useDispatch();
  // B-6 · Come in ConversationList: il pallino nella testata invecchia perché
  // questo componente si ri-renderizza, non perché il guscio lo fa per lui.
  useTickLento(TICK_PRESENZA_MS);
  const scrollRef = useRef(null);
  // Step M: upload allegati reale
  const fileInputRef = useRef(null);
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

  // A-5 · quando l'invio di un messaggio di QUESTA conversazione fallisce
  // (rigetto di rete o rifiuto silenzioso della RLS), il testo torna nel
  // composer invece di restare perso: `commands.sendMessage` lo cancellava
  // dallo stato e nessuno lo restituiva a nessuno. Solo i messaggi di TESTO
  // hanno un composer da ripopolare — vocali e allegati restano segnalati dal
  // solo toast, che è già ciò che accade oggi per loro.
  useEffect(() => {
    if (!commands.ascoltaInvioFallito) return undefined;
    return commands.ascoltaInvioFallito(conv.id, (msg) => {
      if (msg.type !== "text" || !mountedRef.current) return;
      cvd({ type: "RESTORE_FALLITO", text: msg.text, taskRef: msg.taskRef ?? null });
    });
  }, [commands, conv.id]);

  // M-2 · `messages[conv.id] || []` costruiva un array NUOVO a ogni render
  // quando la conversazione è vuota, quindi i memo che ne dipendono non
  // avrebbero mai potuto saltare un giro — e `exhaustive-deps`, che questo
  // progetto tiene a zero warning, lo dice per nome.
  const msgs = useMemo(() => messages[conv.id] || [], [messages, conv.id]);

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

  // ─── M-2 · i callback delle righe hanno identità stabile ─────────────────
  // È la PREMESSA del `memo` su ChatMessage, non un'aggiunta accanto: senza,
  // ogni riga riceve tre prop nuove a ogni render del pannello — e questo
  // pannello si ri-renderizza su un TIMER, ogni 2,5 s mentre un collega scrive
  // (TYPING_PING_MS) e ogni 30 s per l'ageing dei pallini. `memo` senza
  // callback stabili aggiunge un confronto che non può mai riuscire.
  //
  // `msgs` e `commands` vivono in un ref e non nelle dipendenze: cambiano a
  // ogni messaggio in arrivo, cioè proprio quando i callback devono restare
  // fermi. È la stessa tecnica di `useSyncedDispatch` (stateRef) e di
  // `useSalvataggio` (rif.current), per la stessa ragione — e leggere il ref
  // dentro il callback, non durante il render, è ciò che la rende sicura.
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
    // Anche qui c'era un secondo toggle scritto a mano come "fallback
    // mock/test" (ST-10): faceva la stessa cosa in un posto in cui nessuno
    // l'avrebbe aggiornata insieme all'altra.
    commandsRif.current.toggleReaction(conv.id, msgId, emoji, target?.reactions || null);
  }, [conv.id]);

  // Fase 3 pin: stato group-level, condiviso da tutti i partecipanti. Il
  // messaggio è già qui in `msgs`, quindi si sa se si sta fissando o togliendo:
  // il comando riceve `pinned` esplicito invece di farlo dedurre da un diff.
  const handleTogglePin = useCallback((msgId) => {
    const target = msgsRif.current.find(m => m.id === msgId);
    if (!target) return;
    commandsRif.current.setMessagePinned(conv.id, msgId, !target.pinned, myId, {
      pinned: !!target.pinned, pinnedBy: target.pinnedBy ?? null, pinnedAt: target.pinnedAt ?? null,
    });
  }, [conv.id, myId]);

  // Era un'arrow inline nel JSX della riga: nuova a ogni render, quindi da
  // sola bastava a invalidare il `memo` di ogni ChatMessage.
  const handleReply = useCallback((m) => cvd({ type: "REPLYING", v: m }), []);

  // ─── M-2 · l'elenco dei messaggi: niente O(n²), niente array intero ──────
  //
  // Il difetto era `msgs.indexOf(m)` DENTRO la `.map()`: una scansione lineare
  // dell'array completo per ogni riga disegnata, cioè O(n²) per render — su
  // una conversazione da 500 messaggi, 125.000 confronti, ripetuti ogni 2,5
  // secondi mentre un collega scrive. L'indice serviva per `prevMsg`, che deve
  // venire dalla timeline INTERA perché `visible` è filtrato: la coppia
  // (messaggio, precedente) si costruisce quindi una volta sola, dove l'indice
  // ce l'ha già la callback di `map`.
  const conPrecedente = useMemo(
    () => msgs.map((m, i) => ({ m, prev: msgs[i - 1] })),
    [msgs]);

  // ⚠️ Il filtro viene PRIMA della finestra, non dopo. La ricerca dentro la
  // conversazione deve guardare tutti i messaggi: filtrare la sola finestra
  // significherebbe rispondere «non c'è» su un messaggio che c'è ma è più
  // vecchio di cinquanta — cioè la stessa disonestà di A-3 sulla ricerca dei
  // task, in piccolo.
  const filtrati = useMemo(() => {
    if (!showPinnedOnly && !msgSearch) return conPrecedente;
    const q = msgSearch.toLowerCase();
    return conPrecedente.filter(({ m }) => {
      if (showPinnedOnly && !m.pinned) return false;
      if (msgSearch && !m.text?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [conPrecedente, msgSearch, showPinnedOnly]);

  // `useFinestra` taglia i PRIMI N: per avere gli ULTIMI N si rovescia, si
  // finestra, si rimette in ordine. Due `reverse` su un array già memoizzato,
  // contro una libreria di virtualizzazione che il progetto ha deciso di non
  // avere (vedi hooks/useFinestra.js).
  const rovesciati = useMemo(() => [...filtrati].reverse(), [filtrati]);
  const finestra = useFinestra(rovesciati, PAGINA_MESSAGGI,
    [conv.id, msgSearch, showPinnedOnly]);
  const visibili = useMemo(
    () => [...finestra.visibili].reverse(), [finestra.visibili]);

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
        <button onClick={onBack} style={stiliComuni.btnChiudiSuScuro}>←</button>

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
        {/* M-2 · La finestra apre l'elenco IN CODA, e il «mostra altri» risale.
            È l'opposto delle altre nove viste, dove `useFinestra` taglia in
            fondo — e non è un'eccezione alla convenzione ma la stessa
            convenzione applicata a un elenco che si legge dall'ultima riga.
            La meccanica resta una sola: si passa l'array ROVESCIATO. */}
        <MostraAltri
          finestra={finestra}
          azione={`Mostra altri ${Math.min(PAGINA_MESSAGGI, finestra.restanti)} messaggi`}
          conteggio={`${finestra.visibili.length} di ${finestra.totale} messaggi`}
        />
        {visibili.map(({ m, prev }) => (
          <ChatMessage
            key={m.id}
            msg={m}
            prevMsg={prev}
            conv={conv}
            allMessages={msgs}
            onReact={handleReact}
            onReply={handleReply}
            onTogglePin={handleTogglePin}
          />
        ))}
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
