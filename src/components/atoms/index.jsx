import { useTeam, useCategories } from "../../state/contexts.js";
import { getMember } from "../../state/permissions.js";
import { PRIORITIES, STATUS_COLORS, STATUS_LABELS } from "../../state/constants.js";

// ─── AVATAR ────────────────────────────────────────────────────────────────
export const Avatar = ({ memberId, size = 28 }) => {
  const m = getMember(memberId, useTeam());
  if (!m) return null; // hook chiamato sopra, prima di qualsiasi return
  if (m.photoUrl) {
    return (
      <img src={m.photoUrl} alt={m.name} title={m.name} style={{
        width: size, height: size, borderRadius: "50%",
        objectFit: "cover", flexShrink: 0, border: "2px solid white",
      }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: m.color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.36, fontWeight: 600, color: "#fff",
      flexShrink: 0, border: "2px solid white",
    }} title={m.name}>{m.avatar}</div>
  );
};

// ─── PRIORITY BADGE ────────────────────────────────────────────────────────
export const PriorityBadge = ({ priority }) => {
  const p = PRIORITIES[priority] || PRIORITIES.medium;
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
      background: p.bg, color: p.color, letterSpacing: 0.3
    }}>{p.label}</span>
  );
};

// ─── CATEGORY CHIP ─────────────────────────────────────────────────────────
export const CategoryChip = ({ category, small }) => {
  const categories = useCategories();
  const c = categories[category] || categories.admin;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: small ? 11 : 12, fontWeight: 500,
      padding: small ? "2px 6px" : "3px 8px", borderRadius: 99,
      background: c.bg, color: c.color,
    }}>{c.icon} {c.label}</span>
  );
};

// ─── STATUS BADGE ──────────────────────────────────────────────────────────
export const StatusBadge = ({ status }) => (
  <span style={{
    fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 99,
    background: STATUS_COLORS[status] + "20", color: STATUS_COLORS[status]
  }}>{STATUS_LABELS[status]}</span>
);
