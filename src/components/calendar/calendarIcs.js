// ─── EXPORT ICS ──────────────────────────────────────────────────────────────
// Generazione del file .ics dei task con scadenza. Funzioni pure (più il
// download, che tocca il DOM ma non lo stato): stavano in testa a
// CalendarPlanner.jsx e con il calendario non condividevano nulla.
import { isActiveTask } from "../../lib/taskUtils.js";
import { scaricaBlob } from "../../lib/fileUtils.js";

function pad2(n) { return String(n).padStart(2, "0"); }
function icsDate(d) {
  // YYYYMMDDTHHmmssZ (UTC)
  const u = new Date(d);
  return (
    u.getUTCFullYear() + pad2(u.getUTCMonth() + 1) + pad2(u.getUTCDate()) +
    "T" + pad2(u.getUTCHours()) + pad2(u.getUTCMinutes()) + pad2(u.getUTCSeconds()) + "Z"
  );
}
export function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    // B-1 dell'audit del 14 agosto (secondo passaggio). Una content line RFC
    // 5545 §3.1 non può contenere un ritorno a capo GREZZO: CRLF, CR nudo e LF
    // nudo diventano tutti la stessa sequenza di escape. Prima la regola
    // guardava solo \n — un CR nudo (arriva dai file importati con
    // terminatore Windows, es. un titolo copiato da un CSV/Excel via
    // ImportTab/ClientImportModal) passava indenne, e il testo dopo il CR
    // finiva come contenuto grezzo dentro la content line: un parser stretto
    // la considera non conforme, uno leniente la spezza — la stessa premessa
    // con cui si inietterebbero proprietà nel calendario di chi importa il
    // file. L'ordine conta: va PRIMA delle sostituzioni di virgola/punto e
    // virgola, che non toccano \r\n.
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
// RFC 5545 §3.1 "Content Lines": nessuna riga può superare i 75 OTTETTI (byte
// UTF-8, non caratteri). Le righe più lunghe vanno "foldate": si spezzano con
// CRLF seguito da un singolo spazio di continuazione, che il client rimuove
// per ricomporre la riga originale. Lo split DEVE avvenire su un confine di
// ottetto valido, senza spezzare a metà un carattere UTF-8 multi-byte.
const ICS_FOLD_LIMIT = 75;
const textEncoder = new TextEncoder();
export function foldIcsLine(line) {
  const str = String(line ?? "");
  if (textEncoder.encode(str).length <= ICS_FOLD_LIMIT) return str;

  const segments = [];
  let segment = "";
  let segmentBytes = 0;
  let limit = ICS_FOLD_LIMIT; // la prima porzione ha 75 ottetti disponibili

  for (const ch of str) {
    const chBytes = textEncoder.encode(ch).length;
    if (segmentBytes + chBytes > limit) {
      // Chiude la porzione corrente prima del carattere, mai a metà dei suoi byte
      segments.push(segment);
      segment = "";
      segmentBytes = 0;
      limit = ICS_FOLD_LIMIT - 1; // le continuazioni sono prefissate da uno spazio (1 ottetto)
    }
    segment += ch;
    segmentBytes += chBytes;
  }
  segments.push(segment);

  return segments
    .map((s, i) => (i === 0 ? s : " " + s))
    .join("\r\n");
}
export function buildIcs(tasks) {
  const now = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VoyageDesk//Tasks//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const start = new Date(t.dueDate);
    const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@voyagedesk`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(t.title || "Task")}`,
      `DESCRIPTION:${icsEscape((t.description || "") + (t.priority ? "\nPriorità: " + t.priority : ""))}`,
      `CATEGORIES:${icsEscape(t.category || "task")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join("\r\n");
}
// `canView` è il predicato di visibilità passato dal componente (da
// useAppData): la funzione resta pura e testabile senza montare nulla.
export function exportTasksToIcs(allTasks, canView) {
  const tasks = (allTasks || []).filter(t => isActiveTask(t) && canView(t) && t.dueDate);
  if (tasks.length === 0) return;
  const ics = buildIcs(tasks);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const ts = new Date().toISOString().slice(0, 10);
  // M-3 dell'audit del 14 agosto (secondo passaggio): questo era il terzo
  // call site della stessa "scarica un Blob", e l'unico dei tre a revocare
  // l'object URL nello STESSO TICK del click invece che dopo un margine — su
  // Safari/iOS revocarla subito può far fallire il download. `scaricaBlob`
  // (lib/fileUtils.js) è l'unica implementazione, con il margine di 500ms
  // che gli altri due call site avevano già.
  scaricaBlob(blob, `voyagedesk-tasks-${ts}.ics`);
}


// ── Recurring expansion ─────────────────────────────────────────────────────
