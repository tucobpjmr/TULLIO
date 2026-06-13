// ─── STATUS BADGE ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e).
import { STATUS_LABELS, STATUS_COLORS } from "../../lib/taskConstants.js";

export const StatusBadge = ({ status }) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
    background: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status]
  }}>{STATUS_LABELS[status]}</span>
);
