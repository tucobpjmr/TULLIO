// ─── CONTACT MENU ITEM ─────────────────────────────────────────────────────
// Estratto da ContactActions.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento: una
// voce (Chiama/SMS/WhatsApp) del menu aperto da ContactActions.
export const ContactMenuItem = ({ href, onClick, icon, label, target, rel }) => (
  <a
    href={href}
    target={target}
    rel={rel}
    onClick={onClick}
    style={{
      display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
      borderRadius: 7, textDecoration: "none", color: "var(--text)", fontSize: 13,
      fontFamily: "inherit", whiteSpace: "nowrap",
    }}
    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
  >
    <span style={{ fontSize: 15 }}>{icon}</span>{label}
  </a>
);
