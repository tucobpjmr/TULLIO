// src/lib/fileUtils.js
// Block 5 — helper puri per gli allegati (task e in generale).
// Funzioni senza side-effect → facilmente testabili (Vitest).

// Limite dimensione per allegato task (coerente col bucket 'task-files': 50 MB).
export const MAX_TASK_FILE_SIZE = 50 * 1024 * 1024;

// Formatta una dimensione in byte in stringa leggibile (B / KB / MB).
export function formatFileSize(bytes) {
  if (bytes == null || typeof bytes !== "number" || Number.isNaN(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

// Emoji-icona dal mime-type o dal nome file (estensione).
export function fileIcon(mimeOrName = "") {
  const s = String(mimeOrName).toLowerCase();
  if (/^image\/|\.(png|jpe?g|gif|webp|svg|heic|bmp)$/.test(s)) return "🖼️";
  if (/^video\/|\.(mp4|mov|avi|mkv|webm)$/.test(s)) return "🎬";
  if (/^audio\/|\.(mp3|wav|ogg|m4a|aac)$/.test(s)) return "🎵";
  if (/pdf|\.pdf$/.test(s)) return "📕";
  if (/word|\.docx?$/.test(s)) return "📘";
  if (/sheet|excel|\.xlsx?$|\.csv$/.test(s)) return "📗";
  if (/zip|rar|7z|tar|gz/.test(s)) return "🗜️";
  return "📎";
}

// Classifica un allegato come media riproducibile/visualizzabile inline.
// Ritorna 'image' | 'video' | 'audio' | null (null = non anteprimabile inline).
// Usa sia il mime-type (file_type) sia, come fallback, l'estensione del nome.
export function mediaKind(mimeOrName = "") {
  const s = String(mimeOrName).toLowerCase();
  if (/^image\/|\.(png|jpe?g|gif|webp|svg|bmp)$/.test(s)) return "image";
  if (/^video\/|\.(mp4|mov|webm|ogv)$/.test(s)) return "video";
  if (/^audio\/|\.(mp3|wav|ogg|m4a|aac)$/.test(s)) return "audio";
  return null;
}

// True se la dimensione rientra nel limite (default: limite task).
export function isWithinSizeLimit(bytes, max = MAX_TASK_FILE_SIZE) {
  return typeof bytes === "number" && bytes >= 0 && bytes <= max;
}

// Badge sorgente allegato: '' per upload manuale, icona per OneDrive/WhatsApp.
export function sourceBadge(source) {
  if (source === "onedrive") return "☁️ OneDrive";
  if (source === "whatsapp") return "🟢 WhatsApp";
  return "";
}
