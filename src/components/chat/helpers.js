import { getMember } from "../../state/permissions.js";

export const getConversationName = (conv, currentUserId, team) => {
  if (conv.name) return conv.name;
  const other = conv.participants.find(p => p !== currentUserId);
  return getMember(other, team)?.name || "Sconosciuto";
};

export const getLastMessage = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr[arr.length - 1];
};

export const getUnreadCount = (msgs, convId, currentUserId) => {
  const arr = msgs[convId] || [];
  return arr.filter(m => m.sender !== currentUserId && !m.readBy?.includes(currentUserId)).length;
};

// ─── CHAT: REACTIONS POPOVER ───────────────────────────────────────────────
export const EMOJI_REACTIONS = ["👍", "❤️", "😂", "🔥", "✅", "🎉", "💡", "🙌"];

// Parsing task link nel testo dei messaggi (Step H).
// Riconosce il pattern generato da openChatTo+intent.taskLink:
//   🔗 Riferimento task: "TITLE"\n📅 Scadenza: DATE TIME\n\nRESTO
// Ritorna { taskTitle, taskDue, rest } o null se non match.
export const TASK_LINK_RE = /^🔗 Riferimento task: "([^"]+)"\n📅 Scadenza:([^\n]*)\n\n([\s\S]*)$/;
export function parseTaskLink(text) {
  if (typeof text !== "string") return null;
  const m = TASK_LINK_RE.exec(text);
  if (!m) return null;
  return { taskTitle: m[1], taskDue: m[2].trim(), rest: m[3] };
}

export const iconBtn = {
  background: "none", border: "none", cursor: "pointer",
  fontSize: 13, padding: "2px 4px", borderRadius: 4,
};
