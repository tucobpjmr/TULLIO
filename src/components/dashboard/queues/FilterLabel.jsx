// Estratto da QueueShell.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// Etichetta che precede una riga di chip ("Ordina:", "Agente:").

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF11Bold = { fontSize: 11, color: "var(--text-muted)", fontWeight: 600, marginRight: 2 };
export const FilterLabel = ({ children }) => (
  <span style={txtF11Bold}>
    {children}
  </span>
);
