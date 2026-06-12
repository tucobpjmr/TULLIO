// ─── CHAT: UTILS (formatters) ──────────────────────────────────────────────
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

// ─── CHAT: FILE HELPERS (Step M) ───────────────────────────────────────────
// Limite bucket 'chat-files' (vedi migration 20260611_chat_files_storage.sql).
// Replicato qui per validazione client prima di iniziare l'upload.
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Deduce il "kind" UI (icona) dall'estensione del file caricato.
export const fileKindFromName = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "svg"].includes(ext)) return "img";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  return "default";
};

// fileSize reale è in byte (bigint su DB); i vecchi mock usano stringhe
// già formattate ("245 KB") → passthrough.
export const formatFileSize = (size) => {
  if (typeof size !== "number") return size || "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
};
