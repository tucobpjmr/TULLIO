// ─── CRONOLOGIA TASK ─────────────────────────────────────────────────────────
// Le entry arrivano dal trigger DB log_task_history (sola lettura, mai scritte
// dal client). Formattazione human-readable riusando le stesse label di
// STATUS_LABELS/PRIORITIES usate altrove nell'app.
import { STATUS_LABELS, PRIORITIES } from "../../lib/taskConstants.js";
import { formatDate } from "../../lib/taskUtils.js";

export const HISTORY_ICONS = {
  created: "📝", status: "🔄", priority: "🚦", assignees: "👤",
  due_date: "📅", trashed: "🗑️", restored: "↩️",
};

// `getMember` arriva dal chiamante (che lo prende da useAppData): queste due
// restano funzioni pure di modulo, senza lookup impliciti su stato globale.
function resolveAssigneeNames(csv, getMember) {
  if (!csv) return "Nessuno";
  return csv.split(",").filter(Boolean).map(id => getMember(id)?.name || id).join(", ");
}

export function historyDescribe(h, getMember) {
  switch (h.action) {
    case "created":
      return "Task creata";
    case "status":
      return `Stato: ${STATUS_LABELS[h.oldValue] ?? h.oldValue ?? "—"} → ${STATUS_LABELS[h.newValue] ?? h.newValue ?? "—"}`;
    case "priority":
      return `Priorità: ${PRIORITIES[h.oldValue]?.label ?? h.oldValue ?? "—"} → ${PRIORITIES[h.newValue]?.label ?? h.newValue ?? "—"}`;
    case "assignees":
      return `Assegnatari: ${resolveAssigneeNames(h.oldValue, getMember)} → ${resolveAssigneeNames(h.newValue, getMember)}`;
    case "due_date":
      return `Scadenza: ${h.oldValue ? formatDate(h.oldValue) : "—"} → ${h.newValue ? formatDate(h.newValue) : "—"}`;
    case "trashed":
      return "Spostata nel cestino";
    case "restored":
      return "Ripristinata dal cestino";
    default:
      return h.action;
  }
}
