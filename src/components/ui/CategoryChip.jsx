// ─── CATEGORY CHIP ─────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e).
import { useAppData } from "../../state/AppDataContext.jsx";

export const CategoryChip = ({ category, small }) => {
  const { categories } = useAppData();
  const c = categories[category] || categories.admin || {};
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: small ? 11 : 12, fontWeight: 500,
      padding: small ? "2px 6px" : "3px 8px", borderRadius: 99,
      background: c.bg, color: c.color,
    }}>{c.icon} {c.label}</span>
  );
};
