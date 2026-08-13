// Estratto da QueueShell.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// Etichetta che precede una riga di chip ("Ordina:", "Agente:").
export const FilterLabel = ({ children }) => (
  <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginRight: 2 }}>
    {children}
  </span>
);
