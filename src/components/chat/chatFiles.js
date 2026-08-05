// src/components/chat/chatFiles.js
// Vincoli e classificazione degli allegati di chat.
//
// Il limite dei 25 MB è quello del bucket Supabase: replicato qui per dirlo
// all'utente PRIMA di iniziare un upload che il server rifiuterebbe.
import { formatFileSize as formatBytes } from "../../lib/fileUtils.js";

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

// fileSize reale è in byte (bigint su DB): delego la formattazione all'helper
// puro e testato di fileUtils. I vecchi mock usano stringhe già formattate
// ("245 KB") → passthrough, non toccato da formatBytes (che gestisce solo i number).
export const formatFileSize = (size) =>
  typeof size === "number" ? formatBytes(size) : (size || "");
