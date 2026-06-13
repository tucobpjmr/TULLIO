// ─── PRIORITY BADGE ────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e).
import { PRIORITIES } from "../../lib/taskConstants.js";

export const PriorityBadge = ({ priority }) => {
  const p = PRIORITIES[priority] || PRIORITIES.medium;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: p.bg, color: p.color, letterSpacing: 0.3
    }}>{p.label}</span>
  );
};
