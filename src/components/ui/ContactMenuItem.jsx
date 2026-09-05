// ─── CONTACT MENU ITEM ─────────────────────────────────────────────────────
// Estratto da ContactActions.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento: una
// voce (Chiama/SMS/WhatsApp) del menu aperto da ContactActions.
import * as stiliComuni from "../../styles/common.js";
import { conTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap10 = {
  display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
  borderRadius: 7, textDecoration: "none", color: "var(--text)", fontSize: 13,
  fontFamily: "inherit", whiteSpace: "nowrap",
};
export const ContactMenuItem = ({ href, onClick, icon, label, target, rel }) => (
  <a
    href={href}
    target={target}
    rel={rel}
    onClick={onClick}
    style={rowCenterGap10}
    {...conTastiera(
      e => e.currentTarget.style.background = "var(--surface2)",
      e => e.currentTarget.style.background = "transparent",
    )}
  >
    <span style={stiliComuni.txtF15}>{icon}</span>{label}
  </a>
);
