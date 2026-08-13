// Estratto da Sidebar.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
// Componente helper per renderizzare il badge numerico, condiviso da
// Sidebar.jsx e BottomNav.jsx.
export const NavBadge = ({ count, collapsed = false, mobile = false }) => {
  if (!count) return null;
  const base = {
    background: "var(--gold)", color: "var(--navy)", fontWeight: 700,
    borderRadius: 999, fontSize: 10, padding: "1px 6px", minWidth: 16,
    height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1,
  };
  if (mobile) {
    return <span style={{
      ...base, position: "absolute", top: 2, right: "calc(50% - 18px)",
    }}>{count > 99 ? "99+" : count}</span>;
  }
  if (collapsed) {
    return <span style={{
      ...base, position: "absolute", top: 4, right: 4,
    }}>{count > 9 ? "9+" : count}</span>;
  }
  return <span style={{ ...base, marginLeft: "auto" }}>{count > 99 ? "99+" : count}</span>;
};
