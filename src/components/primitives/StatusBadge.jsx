import { STATUS_COLORS, STATUS_LABELS } from "../../data/mockData.js";

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
const StatusBadge = ({ status }) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
    background: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status]
  }}>{STATUS_LABELS[status]}</span>
);

export default StatusBadge;
