// src/components/chat/chatFormat.js
// Formattazione e derivazioni di sola lettura sulle conversazioni.
//
// `getUnreadCount` è l'unica funzione della chat usata anche fuori (il badge
// in VoyageDesk.jsx): resta ri-esportata da ChatPanel.jsx per non cambiare i
// punti d'importazione esistenti.
//
// Questo è l'unico modulo NON-componente della chat che aveva bisogno di sapere
// chi è l'utente corrente, e lo leggeva da una variabile globale di modulo. Ora
// sono funzioni pure: l'utente (e, dove serve, il lookup del team) arrivano
// come parametro esplicito dal chiamante, che li prende da useAppData().

export const formatChatTime = (iso) => {
  const d = new Date(iso);
  const now = new Date();
  const diffMin = Math.floor((now - d) / 60000);
  if (diffMin < 1) return "Adesso";
  if (diffMin < 60) return `${diffMin} min fa`;
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

export const formatMsgTime = (iso) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export const formatDuration = (sec) => {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/**
 * Nome da mostrare per una conversazione: quello del gruppo, oppure il nome
 * dell'altro partecipante per le dirette.
 * @param {object}   conv
 * @param {string}   currentUserId
 * @param {function} getMember  (id) => membro, da useAppData()
 */
export const getConversationName = (conv, currentUserId, getMember) => {
  if (conv.name) return conv.name;
  const other = conv.participants.find(p => p !== currentUserId);
  return getMember?.(other)?.name || "Sconosciuto";
};

export const getLastMessage = (msgs, convId) => {
  const arr = msgs[convId] || [];
  return arr[arr.length - 1];
};

export const getUnreadCount = (msgs, convId, currentUserId) => {
  const arr = msgs[convId] || [];
  return arr.filter(m => m.sender !== currentUserId && !m.readBy?.includes(currentUserId)).length;
};
