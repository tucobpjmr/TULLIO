// src/components/chat/ForwardPicker.jsx
// Scelta della conversazione a cui inoltrare un messaggio.
import { useState } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { isUuid } from "../../lib/mappers.js";
import { sortConversationsByRecent } from "../../lib/chatUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { getConversationName, getLastMessage } from "./chatFormat.js";
import { Z } from "../../styles/tokens.js";

// messaggio decrescente) → l'admin trova subito chi ha contattato per ultimo.
export const ForwardPicker = ({ msg, conversations, messages, onPick, onClose }) => {
  const { currentUserId, getMember } = useAppData();
  const [search, setSearch] = useState("");
  const sorted = sortConversationsByRecent(
    conversations.filter(c => c.id !== msg.__sourceConvId && isUuid(c.id)),
    messages,
  );
  const q = search.trim().toLowerCase();
  const filtered = q
    ? sorted.filter(c => {
        if (getConversationName(c, currentUserId, getMember).toLowerCase().includes(q)) return true;
        const partNames = (c.participants || [])
          .map(id => getMember(id)?.name || "")
          .join(" ")
          .toLowerCase();
        return partNames.includes(q);
      })
    : sorted;

  // Preview del messaggio da inoltrare: etichetta dedicata per file/voice,
  // testo troncato altrimenti.
  const preview = msg.type === "file"
    ? `📎 ${msg.fileName || "Allegato"}`
    : msg.type === "voice"
      ? "🎙️ Messaggio vocale"
      : (msg.text?.length > 120 ? msg.text.slice(0, 117) + "…" : (msg.text || ""));

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(8,21,45,0.45)", zIndex: Z.chatForward,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(420px, 96vw)", maxHeight: "78dvh",
        background: "var(--card)", borderRadius: 14, overflow: "hidden",
        display: "flex", flexDirection: "column",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid var(--border)" }}>
          <div className="playfair" style={{ fontSize: 16, fontWeight: 700, color: "var(--heading)", marginBottom: 6 }}>
            ↪ Inoltra a…
          </div>
          {preview && (
            <div style={{
              fontSize: 12, color: "var(--text-muted)", background: "var(--surface2)",
              padding: "6px 10px", borderRadius: 6, borderLeft: "3px solid var(--gold)",
              maxHeight: 56, overflow: "hidden", lineHeight: 1.4,
            }}>{preview}</div>
          )}
        </div>
        <div style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione…"
            autoFocus
            style={{
              width: "100%", padding: "8px 10px", borderRadius: 8,
              border: "1px solid var(--border)", background: "var(--surface)",
              color: "var(--text)", fontSize: 13, fontFamily: "inherit", outline: "none",
            }}
          />
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {filtered.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
              Nessuna conversazione disponibile.
            </div>
          ) : filtered.map(c => {
            const otherUid = c.type === "direct"
              ? (c.participants || []).find(p => p !== currentUserId)
              : null;
            const last = getLastMessage(messages, c.id);
            return (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 10,
                  padding: "10px 14px", background: "none", border: "none",
                  borderBottom: "1px solid var(--border)", cursor: "pointer",
                  fontFamily: "inherit", textAlign: "left",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                {c.type === "direct" && otherUid ? (
                  <Avatar memberId={otherUid} size={32} />
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: "50%", background: "var(--gold)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, flexShrink: 0,
                  }}>{c.icon || "👥"}</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {getConversationName(c, currentUserId, getMember)}
                  </div>
                  {last && (
                    <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
                      {last.type === "text" ? last.text : last.type === "file" ? `📎 ${last.fileName}` : "🎙️ Vocale"}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid var(--border)", textAlign: "right" }}>
          <button onClick={onClose} style={{
            background: "transparent", border: "1px solid var(--border)",
            padding: "6px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12.5,
            color: "var(--text)", fontFamily: "inherit",
          }}>Annulla</button>
        </div>
      </div>
    </div>
  );
};
