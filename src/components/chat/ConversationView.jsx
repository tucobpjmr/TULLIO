// src/components/chat/ConversationView.jsx
// La conversazione aperta: testata con presenza, elenco messaggi, composer
// (testo, allegati, vocali, template, indicatore "sta scrivendo").
//
// ─── M-5 dell'audit del 10 settembre · COSA C'ERA QUI, E DOV'È ANDATO ───────
// Il file era 530 righe con 9 useEffect e 6 ref di coordinamento, e il rilievo
// diceva la cosa giusta: i ref erano il SINTOMO, non il difetto. Esistevano
// per far parlare effetti che stavano nello stesso file perché stavano nello
// stesso file — non perché avessero qualcosa da dirsi. Separati per ciò di cui
// si occupano, i ref restano solo dove servono davvero, a tre righe da chi li
// legge:
//
//   useTypingConversazione   canale broadcast, mappa dei typer, anti-flood
//   useElencoMessaggi        coppia col precedente, filtro, finestra
//   useInvioMessaggi         testo, vocale, file (e l'unico await che rischia
//                            di tornare a chat chiusa)
//   useComposerPrefill       il composer che si riempie da solo
//   useLetturaConversazione  scendere in fondo, segnare come letto
//   useAzioniMessaggio       reagire, fissare, rispondere — a identità stabile
//
// Qui restano la composizione e il JSX, e due ref soli: `scrollRef` e
// `fileInputRef`, che sono ref a NODI DEL DOM — cioè l'unico tipo di ref che
// una vista ha ragione di avere.
import { useReducer, useRef, useMemo } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { typingUserIds, buildTypingLabel } from "../../lib/typingUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useChatContext } from "./chatContext.js";
import { computePresence, PRESENCE_COLORS, PRESENCE_LABELS, TICK_PRESENZA_MS } from "../../lib/presenza.js";
import { useTickLento } from "../../hooks/useTickLento.js";
import { MostraAltri } from "../ui/MostraAltri.jsx";
import { getConversationName } from "./chatFormat.js";
import { convViewInitial, convViewReducer } from "./chatReducers.js";
import { useTypingConversazione } from "./useTypingConversazione.js";
import { useElencoMessaggi, PAGINA_MESSAGGI } from "./useElencoMessaggi.js";
import { useInvioMessaggi } from "./useInvioMessaggi.js";
import { useComposerPrefill } from "./useComposerPrefill.js";
import { useLetturaConversazione } from "./useLetturaConversazione.js";
import { useAzioniMessaggio } from "./useAzioniMessaggio.js";
import { ChatMessage } from "./message/ChatMessage.jsx";
import { MessageComposer } from "./MessageComposer.jsx";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import {
  animation2, animation3, animation4, boxF13White, boxF16, boxFlex1, boxFlex1F12, boxW6H6,
  boxW6H62, boxW6H63, colHFull, rowCenterGap10, rowCenterGap3, rowCenterGap5, rowCenterGap8,
  rowCenterMiddle, rowEndGap8, txtF11, txtF112, txtF14Bold, txtGoldLight,
} from "./conversationViewStyles.js";

// ─── CHAT: CONVERSATION VIEW ───────────────────────────────────────────────
export const ConversationView = ({ conv, messages, commands, onBack, onDelete, initialInput, initialTaskRef, onInitialInputConsumed }) => {
  const [cv, cvd] = useReducer(convViewReducer, convViewInitial);
  // Il composer riceve `cv` intero e si destruttura da sé i campi che usa
  // (input, recording, replyingTo, showAttach, showTemplates); da M-5
  // dell'audit del 10 settembre lo fa anche useInvioMessaggi, che di quei
  // campi ha bisogno per COSTRUIRE il messaggio. Qui restano i tre che
  // riguardano la vista: la ricerca dentro la conversazione e il filtro dei
  // fissati.
  const { showMsgSearch, msgSearch, showPinnedOnly } = cv;
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
  // Il composer che si riempie da solo (prefill dal genitore, testo restituito
  // da un invio fallito): due effetti che facevano la stessa cosa a cinquanta
  // righe di distanza, ora insieme (M-5 dell'audit del 10 settembre).
  useComposerPrefill({
    convId: conv.id, commands, cvd, initialInput, initialTaskRef, onInitialInputConsumed,
  });

  // `messages[conv.id] || []` costruiva un array NUOVO a ogni render quando la
  // conversazione è vuota, quindi i memo che ne dipendono non avrebbero mai
  // potuto saltare un giro — e `exhaustive-deps`, che questo progetto tiene a
  // zero warning, lo dice per nome (M-2 dell'audit del 25 agosto).
  const msgs = useMemo(() => messages[conv.id] || [], [messages, conv.id]);

  // Scendere in fondo e segnare come letto: la stessa regola vista da due
  // lati, «la conversazione aperta è la conversazione letta».
  useLetturaConversazione({ convId: conv.id, msgs, myId, commands, scrollRif: scrollRef });

  // ── Typing indicator realtime (broadcast) ────────────────────────────────
  // Tre effetti, quattro ref e la mappa dei typer stavano qui: sono usciti
  // interi in useTypingConversazione (M-5 dell'audit del 10 settembre), che è
  // dove si vede che si parlavano solo fra loro.
  const { typingMap, notifyTyping, stopTyping } = useTypingConversazione({
    convId: conv.id, myId,
  });

  // Testo, vocale, file: le tre funzioni — e la guardia di unmount che serviva
  // solo a due di loro — stanno in useInvioMessaggi (M-5 dell'audit del 10
  // settembre).
  const { sendText, sendVoice, sendFile } = useInvioMessaggi({
    conv, myId, cv, cvd, commands, dispatch, stopTyping,
  });

  // Reagire, fissare, rispondere: tre callback a identità stabile, che è la
  // PREMESSA del `memo` su ChatMessage. Stanno in useAzioniMessaggio con i due
  // ref che glielo permettono (M-5 dell'audit del 10 settembre).
  const { handleReact, handleTogglePin, handleReply } = useAzioniMessaggio({
    convId: conv.id, myId, msgs, commands, cvd,
  });

  // L'elenco da disegnare — coppia con il precedente, filtro, finestra — sta
  // in useElencoMessaggi: erano cinque memo incatenati, ognuno lì solo per
  // alimentare il successivo (M-5 dell'audit del 10 settembre).
  const { visibili, finestra } = useElencoMessaggi({
    msgs, convId: conv.id, msgSearch, showPinnedOnly,
  });

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
