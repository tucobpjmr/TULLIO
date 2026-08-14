// src/lib/fileUtils.js
// Block 5 — helper puri per gli allegati (task e in generale).
// Funzioni senza side-effect → facilmente testabili (Vitest).
//
// Un'eccezione dichiarata: `scaricaBlob` in fondo al file tocca il DOM per
// costruzione (innesca un download) — vedi il commento lì per il motivo per
// cui vive comunque qui.

// Limite dimensione per allegato task: rispecchia `file_size_limit` del bucket
// 'task-files' (52428800 byte, verificato su storage.buckets), replicato qui
// per rifiutare il file PRIMA di iniziare un upload che il server scarterebbe.
//
// DIVERGE DI PROPOSITO da MAX_FILE_SIZE in components/chat/chatFiles.js, che
// vale 25 MB. Non è una svista da allineare: sono due bucket distinti con due
// `file_size_limit` distinti, e ciascuna costante rispecchia il proprio. Chi
// alza uno dei due deve alzare il bucket corrispondente, non l'altra costante.
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
  // SVG escluso apposta: nessun bucket lo accetta fra gli allowed_mime_types
  // (è un documento eseguibile) — un'icona immagine qui prometterebbe
  // un'anteprima a un upload che il server rifiuta (B-4, audit 14/8).
  if (/^image\/|\.(png|jpe?g|gif|webp|heic|bmp)$/.test(s)) return "🖼️";
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
  // SVG tolto: nessun bucket lo accetta (allowed_mime_types non include
  // image/svg+xml, ed è voluto — un SVG è un documento eseguibile). Tenerlo
  // qui prometteva un'anteprima a un file che l'upload rifiuta (B-4, audit 14/8).
  if (/^image\/|\.(png|jpe?g|gif|webp|bmp)$/.test(s)) return "image";
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

// M-3 dell'audit del 14 agosto (secondo passaggio). Innesca il download lato
// client di un Blob già pronto — CSV/JSON dal pannello Admin, .doc e backup
// JSON del modulo Liste, .ics dal calendario.
//
// Erano TRE copie dello stesso corpo, e avevano già smesso di coincidere:
// `admin/adminExport.js` e `liste/listeApi.js` revocavano l'object URL dopo
// 500ms, `calendar/calendarIcs.js` lo faceva nello stesso tick del click. Il
// RITARDO è l'invariante che conta, non un dettaglio estetico: il browser
// deve avere il tempo di iniziare il download prima che la URL diventi
// invalida — su Safari/iOS revocarla subito lo fa fallire in silenzio.
// Finché il numero era scritto a mano in due punti su tre, i 500ms non erano
// una regola: erano una coincidenza che il terzo call site non condivideva.
const RITARDO_REVOKE_MS = 500;

export function scaricaBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), RITARDO_REVOKE_MS);
}
