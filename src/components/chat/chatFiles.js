// src/components/chat/chatFiles.js
// Vincoli e classificazione degli allegati di chat.
//
// Il limite dei 25 MB è quello del bucket Supabase: replicato qui per dirlo
// all'utente PRIMA di iniziare un upload che il server rifiuterebbe.
import { formatFileSize as formatBytes } from "../../lib/fileUtils.js";

// Replicato qui per validazione client prima di iniziare l'upload: rispecchia
// `file_size_limit` del bucket 'chat-files' (26214400 byte, verificato su
// storage.buckets).
//
// DIVERGE DI PROPOSITO da MAX_TASK_FILE_SIZE in lib/fileUtils.js, che vale
// 50 MB perché il bucket 'task-files' ha quel tetto. Due bucket, due limiti:
// allinearli "per coerenza" romperebbe la corrispondenza con il server, che è
// l'unica ragione per cui queste costanti esistono.
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
// Deduce il "kind" UI (icona) dall'estensione del file caricato.
// SVG escluso apposta: nessun bucket lo accetta fra gli allowed_mime_types
// (è un documento eseguibile) — classificarlo "img" prometterebbe
// un'anteprima a un upload che il server rifiuta (B-4, audit 14/8).
export const fileKindFromName = (name = "") => {
  const ext = name.split(".").pop().toLowerCase();
  if (ext === "pdf") return "pdf";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "img";
  if (["xls", "xlsx", "csv"].includes(ext)) return "xls";
  if (["doc", "docx", "txt", "rtf", "odt"].includes(ext)) return "doc";
  return "default";
};

// fileSize reale è in byte (bigint su DB): delego la formattazione all'helper
// puro e testato di fileUtils. I vecchi mock usano stringhe già formattate
// ("245 KB") → passthrough, non toccato da formatBytes (che gestisce solo i number).
export const formatFileSize = (size) =>
  typeof size === "number" ? formatBytes(size) : (size || "");
