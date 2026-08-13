// Estratto da QueueShell.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// Chip di filtro/ordinamento. Esisteva in quattro varianti divergenti; `accent`
// è il colore dello stato attivo, che cambia per coda.
export const FilterChip = ({ active, onClick, accent = "var(--navy)", title, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    style={{
      display: "inline-flex", alignItems: "center", gap: 6,
      padding: "4px 11px", borderRadius: 999, cursor: "pointer",
      fontSize: 11, fontWeight: 600, fontFamily: "inherit",
      border: `1px solid ${active ? accent : "var(--border)"}`,
      background: active ? accent : "var(--card)",
      color: active ? "#fff" : "var(--text-muted)",
      transition: "background 0.15s, color 0.15s",
    }}
  >{children}</button>
);
