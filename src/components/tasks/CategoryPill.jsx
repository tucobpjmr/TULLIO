// Estratto da TaskCard.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useAppData } from "../../state/AppDataContext.jsx";
import { catMeta } from "./taskCardShared.js";

export const CategoryPill = ({ category }) => {
  const { categories } = useAppData();
  const c = catMeta(categories, category);
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 999,
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 600,
    }}>
      <span>{c.icon}</span> {c.label}
    </div>
  );
};
