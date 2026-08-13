// Estratto da QueueShell.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// Riga contenitore dei filtri, sotto la testata.
export const FilterRow = ({ divider = false, accentRgb, children }) => (
  <div style={{
    display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 12,
    ...(divider ? { paddingBottom: 12, borderBottom: `1px solid rgba(${accentRgb},0.2)` } : null),
  }}>{children}</div>
);
