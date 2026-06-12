// Formatters universali (date/orario). Le formatters chat-specifiche
// (formatChatTime/formatMsgTime/formatDuration/formatFileSize) vivono per ora
// nella sezione chat di VoyageDesk.jsx e verranno estratte con il modulo chat.

export const formatDate = iso => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
};

export const formatTime = iso => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export const getDayKey = iso => iso ? new Date(iso).toDateString() : null;
