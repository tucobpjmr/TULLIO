// src/components/chat/ConversationList.jsx
// Elenco delle conversazioni: ricerca, ultimo messaggio, non letti, presenza.
import { useState } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { sortConversationsByRecent } from "../../lib/chatUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useChatContext } from "./chatContext.js";
import { computePresence, PRESENCE_COLORS, PRESENCE_LABELS, TICK_PRESENZA_MS } from "../../lib/presenza.js";
import { useTickLento } from "../../hooks/useTickLento.js";
import { formatChatTime, getConversationName, getLastMessage, getUnreadCount } from "./chatFormat.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF10Bold, boxF13WFull, boxF14Muted, colHFull, flex1, padding2, relative2, rowCenterBetween,
  rowCenterBetween2, rowCenterFlex1, rowCenterGap1, rowCenterMiddle, rowCenterMiddle2,
  rowGap6Mt10, txtAbsoluteF13, txtF10Gold, txtF10Muted, txtF40Mb8, txtMutedTxtCenter,
} from "./conversationListStyles.js";

// ─── CHAT: LIST OF CONVERSATIONS ───────────────────────────────────────────
export const ConversationList = ({ conversations, messages, onSelect, onNew, onDelete }) => {
  const { presenceMap, currentUserId: me } = useChatContext();
  const { getMember } = useAppData();
  // B-6 (audit di architettura del 16 agosto) · L'ageing della presenza vive
  // QUI, dove i pallini si vedono, e non più in `usePresence` — che lo faceva
  // sostituendo uno stato del guscio ogni 30 s, cioè un render periodico
  // dell'intera app per una cosa visibile solo a pannello chat aperto.
  // `computePresence` legge `Date.now()`: senza qualcosa che ri-renderizzi,
  // un pallino verde resterebbe verde finché non arriva un evento realtime.
  // Il valore non serve a nessuno: è il render che conta.
  useTickLento(TICK_PRESENZA_MS);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const convName = (c) => getConversationName(c, me, getMember);
  const unreadOf = (convId) => getUnreadCount(messages, convId, me);

  const sorted = sortConversationsByRecent(conversations, messages);

  const matchesSearch = (c) => {
    if (!search) return true;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    // 1) nome conversazione
    if (convName(c).toLowerCase().includes(q)) return true;
    // 2) nomi partecipanti
    const partNames = (c.participants || [])
      .map(id => getMember(id)?.name || "")
      .join(" ")
      .toLowerCase();
    if (partNames.includes(q)) return true;
    // 3) ultimi 30 messaggi della conversazione (testo)
    const msgs = (messages[c.id] || []).slice(-30);
    for (const m of msgs) {
      if (m.type === "text" && m.text && m.text.toLowerCase().includes(q)) return true;
      if (m.type === "file" && m.fileName && m.fileName.toLowerCase().includes(q)) return true;
    }
    return false;
  };

  const filtered = sorted.filter(c => {
    if (filter === "direct" && c.type !== "direct") return false;
    if (filter === "group" && c.type !== "group") return false;
    if (filter === "unread" && unreadOf(c.id) === 0) return false;
    if (!matchesSearch(c)) return false;
    return true;
  });

  const totalUnread = conversations.reduce((acc, c) => acc + unreadOf(c.id), 0);

  return (
    <div style={colHFull}>
      {/* Search */}
      <div style={padding2}>
        <div style={stiliComuni.relative}>
          <div style={txtAbsoluteF13}>🔍</div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cerca conversazione..."
            style={boxF13WFull}
          />
        </div>

        <div style={rowGap6Mt10}>
          {[
            { id: "all", label: "Tutti" },
            { id: "unread", label: `Non letti${totalUnread ? ` (${totalUnread})` : ""}` },
            { id: "direct", label: "Diretti" },
            { id: "group", label: "Gruppi" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "4px 10px", fontSize: 11, fontWeight: 600,
              border: "1px solid var(--border)", borderRadius: 99,
              background: filter === f.id ? "var(--navy)" : "transparent",
              color: filter === f.id ? "#fff" : "var(--text-muted)",
              cursor: "pointer", whiteSpace: "nowrap",
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={flex1}>
        {filtered.map(c => {
          const last = getLastMessage(messages, c.id);
          const unread = unreadOf(c.id);
          // Fase 3: quanti messaggi fissati ha questa conversazione → badge.
          const pinnedCount = (messages[c.id] || []).filter(m => m.pinned).length;
          const lastSender = last ? getMember(last.sender) : null;
          const otherUser = c.type === "direct" ? c.participants.find(p => p !== me) : null;

          return (
            <div key={c.id} onClick={() => onSelect(c)} style={{
              padding: "10px 14px", display: "flex", gap: 10, alignItems: "center",
              borderBottom: "1px solid var(--border)", cursor: "pointer",
              transition: "background 0.15s",
              background: unread > 0 ? "rgba(212,168,67,0.05)" : "transparent",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = unread > 0 ? "rgba(212,168,67,0.05)" : "transparent"}
            >
              {c.type === "direct" ? (
                <div style={relative2}>
                  <Avatar memberId={otherUser} size={42} />
                  {(() => {
                    const u = (presenceMap || {})[otherUser];
                    const p = u ? computePresence(u) : 'offline';
                    return (
                      <div title={PRESENCE_LABELS[p] || p} style={{
                        position: "absolute", bottom: 0, right: 0, width: 11, height: 11,
                        borderRadius: "50%", background: PRESENCE_COLORS[p],
                        border: "2px solid #fff",
                      }} />
                    );
                  })()}
                </div>
              ) : (
                <div style={rowCenterMiddle}>{c.icon || "👥"}</div>
              )}

              <div className="vd-flex-1-min0">
                <div style={rowCenterBetween}>
                  <div style={rowCenterFlex1}>
                    {c.pinned && <span style={txtF10Gold}>📌</span>}
                    <span style={{ fontSize: 13.5, fontWeight: unread > 0 ? 700 : 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {convName(c)}
                    </span>
                  </div>
                  <span style={txtF10Muted}>
                    {last && formatChatTime(last.time)}
                  </span>
                </div>
                <div style={rowCenterBetween2}>
                  <div style={{
                    fontSize: 12, color: unread > 0 ? "var(--text)" : "var(--text-muted)",
                    fontWeight: unread > 0 ? 500 : 400,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: 0,
                  }}>
                    {last ? (
                      <>
                        {last.sender === me && <span style={stiliComuni.txtMuted}>Tu: </span>}
                        {c.type === "group" && last.sender !== me && (
                          <span style={{ color: lastSender?.color, fontWeight: 600 }}>
                            {lastSender?.name.split(" ")[0]}:{" "}
                          </span>
                        )}
                        {last.type === "voice" ? "🎙️ Messaggio vocale" :
                          last.type === "file" ? `📎 ${last.fileName}` :
                            last.text}
                      </>
                    ) : "Nessun messaggio"}
                  </div>
                  {pinnedCount > 0 && (
                    <div title={`${pinnedCount} ${pinnedCount === 1 ? "messaggio fissato" : "messaggi fissati"}`} style={rowCenterGap1}>📌{pinnedCount}</div>
                  )}
                  {unread > 0 && (
                    <div style={boxF10Bold}>{unread}</div>
                  )}
                </div>
              </div>

              {onDelete && (
                <button
                  onClick={e => { e.stopPropagation(); onDelete(c); }}
                  title={c.type === "group" ? "Elimina gruppo" : "Elimina conversazione"}
                  aria-label={c.type === "group" ? "Elimina gruppo" : "Elimina conversazione"}
                  style={boxF14Muted}
                  onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "var(--danger)"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = 0.65; e.currentTarget.style.color = "var(--text-muted)"; }}
                >🗑</button>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div style={txtMutedTxtCenter}>
            <div style={txtF40Mb8}>💬</div>
            <div style={stiliComuni.txtF13}>Nessuna conversazione trovata</div>
          </div>
        )}
      </div>

      <button onClick={onNew} style={rowCenterMiddle2}>✏️ Nuova chat</button>
    </div>
  );
};
