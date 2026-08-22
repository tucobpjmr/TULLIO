// src/components/chat/message/ChatMessage.jsx
// La singola bolla: testo, allegati, vocali, reazioni, spunte di lettura.
import { memo, useState } from "react";
import { Avatar } from "../../ui/Avatar.jsx";
import { Messages as MessagesAPI } from "../../../lib/api.js";
import { formatDate } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useChatContext } from "../chatContext.js";
import { formatMsgTime } from "../chatFormat.js";
import { formatFileSize } from "../chatFiles.js";
import { ReactionPicker } from "./ReactionPicker.jsx";
import { VoicePlayer } from "./VoicePlayer.jsx";
import { MessageTextContent } from "./MessageTextContent.jsx";
import { Z } from "../../../styles/tokens.js";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const w28 = { width: 28, flexShrink: 0 };
const txtF9 = { fontSize: 9 };
const maxW200Op08 = { opacity: 0.8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 200 };
const txtF13Bold = { fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const txtF11Op07 = { fontSize: 11, opacity: 0.7 };
const txtF16Op07 = { fontSize: 16, opacity: 0.7 };
const rowCenterGap4 = {
  display: "flex", alignItems: "center", gap: 4, justifyContent: "flex-end",
  marginTop: 3, fontSize: 10, opacity: 0.7,
};
const rowCenterGap3 = {
  background: "var(--card)", border: "1px solid var(--border)",
  borderRadius: 99, padding: "2px 7px", fontSize: 11,
  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
  display: "flex", alignItems: "center", gap: 3,
};
const txtBoldMuted = { color: "var(--text-muted)", fontWeight: 600 };

// ─── CHAT: MESSAGE ─────────────────────────────────────────────────────────
// ─── M-2 · `memo`, come TaskRow e TaskCard (audit del 19 agosto) ───────────
// Era l'unico componente di riga di un elenco lungo senza memoizzazione, e
// l'elenco che disegna è l'unico che si ri-renderizza su un TIMER: mentre un
// collega scrive arriva un evento di typing ogni 2,5 secondi (TYPING_PING_MS),
// e ognuno ricostruiva ogni bolla a schermo — avatar, forme d'onda, reazioni,
// spunte di lettura — per far lampeggiare tre puntini.
//
// ⚠️ Il `memo` regge solo perché le prop lo permettono, e le due metà sono
// arrivate insieme: `onReact`/`onReply`/`onTogglePin` hanno identità stabile
// in ConversationView (`useCallback` con `msgs`/`commands` in un ref), e
// `prevMsg` arriva già appaiato invece di essere ricalcolato con un `indexOf`
// dentro la `.map()`. Con una sola delle due si aggiungerebbe un confronto che
// non può mai riuscire — è la nota di docs/CLAUDE.md su TaskCard/TaskRow.
export const ChatMessage = memo(function ChatMessage({ msg, prevMsg, conv, allMessages, onReact, onReply, onTogglePin }) {
  const [showReactions, setShowReactions] = useState(false);
  const [hovered, setHovered] = useState(false);
  const { onForward, currentUserId: me } = useChatContext();
  const { getMember } = useAppData();
  const isMine = msg.sender === me;
  const sender = getMember(msg.sender);
  const showAvatar = !prevMsg || prevMsg.sender !== msg.sender;
  const showName = conv.type === "group" && !isMine && showAvatar;

  const replyMsg = msg.replyTo ? allMessages.find(m => m.id === msg.replyTo) : null;
  const replyAuthor = replyMsg ? getMember(replyMsg.sender) : null;
  // Fase 3 forward: se valorizzato, il messaggio è un inoltro e
  // originalSenderId tiene l'UID dell'autore originale (preservato anche
  // attraverso catene di forward A→B→C).
  const originalSender = msg.originalSenderId ? getMember(msg.originalSenderId) : null;
  // Forwardable: testo, file e vocali. Per i file l'allegato viene copiato
  // nello storage della conv destinazione (path scoped per RLS); i vocali
  // sono simulati (duration + waveform) → si copiano direttamente.
  const canForward = !!onForward && ["text", "file", "voice"].includes(msg.type);

  // Read indicator
  const otherParticipants = conv.participants.filter(p => p !== me);
  const readByAll = isMine && otherParticipants.every(p => msg.readBy?.includes(p));
  const readBySome = isMine && otherParticipants.some(p => msg.readBy?.includes(p));

  const fileIcons = { pdf: "📄", doc: "📝", img: "🖼️", xls: "📊", default: "📎" };

  // Step M: apre l'allegato con una signed URL temporanea dal bucket privato.
  const [fileOpening, setFileOpening] = useState(false);
  const openFile = async () => {
    if (!msg.fileUrl || fileOpening) return;
    setFileOpening(true);
    const { url, error } = await MessagesAPI.getFileUrl(msg.fileUrl);
    setFileOpening(false);
    if (error || !url) { console.error("[chat] signed url", error); return; }
    window.open(url, "_blank", "noopener");
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowReactions(false); }}
      style={{
        display: "flex", flexDirection: isMine ? "row-reverse" : "row",
        gap: 8, marginTop: showAvatar ? 12 : 2, alignItems: "flex-end",
        position: "relative",
      }}>
      {/* Avatar */}
      <div style={w28}>
        {!isMine && showAvatar && <Avatar memberId={msg.sender} size={28} />}
      </div>

      {/* Message bubble */}
      <div style={{ maxWidth: "75%", display: "flex", flexDirection: "column", alignItems: isMine ? "flex-end" : "flex-start", position: "relative" }}>
        {showName && (
          <div style={{ fontSize: 11, fontWeight: 600, color: sender?.color, marginBottom: 3, marginLeft: 12 }}>
            {sender?.name}
          </div>
        )}

        <div style={{
          background: isMine ? "var(--navy)" : "var(--card)",
          color: isMine ? "#fff" : "var(--text)",
          padding: msg.type === "voice" ? "8px 12px" : "8px 12px",
          borderRadius: 14,
          borderTopRightRadius: isMine && showAvatar ? 4 : 14,
          borderTopLeftRadius: !isMine && showAvatar ? 4 : 14,
          boxShadow: "0 1px 2px rgba(0,0,0,0.06)",
          border: isMine ? "none" : "1px solid var(--border)",
          position: "relative",
        }}>
          {/* Pin indicator (Fase 3): chip dorata in alto-fuori dal bubble.
              Visibile sempre quando msg.pinned, anche senza hover, così l'utente
              sa subito quali messaggi sono fissati senza dover aprire il filtro. */}
          {msg.pinned && (() => {
            // Audit (Fase 3 metadata): tooltip "Fissato da {nome} · {data}".
            const pinner = msg.pinnedBy ? getMember(msg.pinnedBy) : null;
            const pinTitle = pinner
              ? `Fissato da ${pinner.name}${msg.pinnedAt ? ` · ${formatDate(msg.pinnedAt)}` : ""}`
              : "Messaggio fissato";
            return (
              <div title={pinTitle} style={{
                position: "absolute", top: -8, [isMine ? "right" : "left"]: 8,
                background: "var(--gold)", color: "var(--navy)",
                fontSize: 10, fontWeight: 700, borderRadius: 99,
                padding: "1px 6px", display: "flex", alignItems: "center", gap: 3,
                boxShadow: "0 1px 3px rgba(0,0,0,0.15)", cursor: "default",
              }}>
                <span style={txtF9}>📌</span>
                <span>FISSATO</span>
              </div>
            );
          })()}
          {/* Forwarded badge (Fase 3): se originalSenderId è valorizzato,
              mostra "Inoltrato da {nome}". Il lookup avviene su TEAM globale
              (non sui partecipanti del conv) → funziona anche se l'autore
              originale non è in questa conversazione. */}
          {originalSender && (
            <div style={{
              display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
              fontSize: 10.5, fontStyle: "italic",
              color: isMine ? "rgba(255,255,255,0.65)" : "var(--text-muted)",
            }}>
              <span>↪</span>
              <span>Inoltrato da {originalSender.name}</span>
            </div>
          )}

          {/* Reply preview */}
          {replyMsg && (
            <div style={{
              borderLeft: `3px solid ${isMine ? "var(--gold)" : replyAuthor?.color || "var(--navy)"}`,
              padding: "4px 8px", marginBottom: 6, borderRadius: 4,
              background: isMine ? "rgba(255,255,255,0.1)" : "var(--surface2)",
              fontSize: 11,
            }}>
              <div style={{ fontWeight: 600, color: isMine ? "var(--gold)" : replyAuthor?.color }}>
                {replyAuthor?.name}
              </div>
              <div style={maxW200Op08}>
                {replyMsg.type === "voice" ? "🎙️ Vocale" : replyMsg.type === "file" ? `📎 ${replyMsg.fileName}` : replyMsg.text}
              </div>
            </div>
          )}

          {/* Content */}
          {msg.type === "text" && (
            <MessageTextContent text={msg.text} isMine={isMine} taskRef={msg.taskRef} />
          )}

          {msg.type === "voice" && (
            <VoicePlayer duration={msg.duration} waveform={msg.waveform} isMine={isMine} fileUrl={msg.fileUrl} />
          )}

          {msg.type === "file" && (
            <div
              onClick={openFile}
              title={msg.fileUrl ? "Scarica file" : "File di esempio (nessun contenuto)"}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "6px 4px",
                minWidth: 220, cursor: msg.fileUrl ? "pointer" : "default",
              }}>
              <div style={{
                width: 40, height: 40, background: isMine ? "rgba(255,255,255,0.15)" : "var(--surface2)",
                borderRadius: 8, display: "flex", alignItems: "center",
                justifyContent: "center", fontSize: 20, flexShrink: 0,
              }}>{fileIcons[msg.fileType] || fileIcons.default}</div>
              <div className="vd-flex-1-min0">
                <div style={txtF13Bold}>{msg.fileName}</div>
                <div style={txtF11Op07}>{formatFileSize(msg.fileSize)}</div>
              </div>
              {msg.fileUrl && <div style={txtF16Op07}>{fileOpening ? "⏳" : "⬇"}</div>}
            </div>
          )}

          {/* Timestamp + read indicator inside bubble */}
          <div style={rowCenterGap4}>
            <span>{formatMsgTime(msg.time)}</span>
            {isMine && (
              <span style={{ fontSize: 12, lineHeight: 1, color: readByAll ? "var(--gold-light)" : "currentColor" }}>
                {readByAll ? "✓✓" : readBySome ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>

        {/* Reactions */}
        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
          <div style={{
            display: "flex", gap: 3, marginTop: 4,
            marginLeft: isMine ? 0 : 4, marginRight: isMine ? 4 : 0,
          }}>
            {Object.entries(msg.reactions).map(([emoji, users]) => (
              <div key={emoji} style={rowCenterGap3}>
                <span style={stiliComuni.txtF13}>{emoji}</span>
                <span style={txtBoldMuted}>{users.length}</span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons (hover) */}
        {hovered && (
          <div style={{
            position: "absolute", top: -8, [isMine ? "left" : "right"]: -8,
            display: "flex", gap: 2, background: "var(--card)",
            border: "1px solid var(--border)", borderRadius: 99,
            padding: "3px 6px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            zIndex: Z.popoverRaised,
          }}>
            <button onClick={() => setShowReactions(s => !s)} style={iconBtn}>😊</button>
            <button onClick={() => onReply(msg)} style={iconBtn}>↩</button>
            {canForward && (
              <button
                onClick={() => onForward(msg)}
                style={iconBtn}
                title="Inoltra a un'altra conversazione"
              >↪</button>
            )}
            {onTogglePin && (
              <button
                onClick={() => onTogglePin(msg.id)}
                style={iconBtn}
                title={msg.pinned ? "Rimuovi fissaggio" : "Fissa nella conversazione"}
              >{msg.pinned ? "📍" : "📌"}</button>
            )}
          </div>
        )}

        {showReactions && (
          <ReactionPicker
            onPick={(e) => onReact(msg.id, e)}
            onClose={() => setShowReactions(false)}
          />
        )}
      </div>
    </div>
  );
});

const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 13, padding: "2px 4px", borderRadius: 4,
};
