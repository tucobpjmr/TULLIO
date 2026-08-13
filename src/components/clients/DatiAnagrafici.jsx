// Estratto da ClienteDetailPanel.jsx (B-3 dell'audit del 13 agosto: un file,
// un componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useMemo } from "react";
import { parseClientNotes } from "../../lib/clientNotes.js";
import { mb14 } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const gridGapR10 = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
  gap: "6px 16px", padding: "10px 12px", borderRadius: 10,
  background: "var(--surface2)", border: "1px solid var(--border)",
};
const minW0 = { minWidth: 0 };
const txtF10Bold = { fontSize: 10, fontWeight: 700, color: "var(--text-light)", letterSpacing: 0.4, textTransform: "uppercase" };
const txtF125 = { fontSize: 12.5, wordBreak: "break-word" };

// I campi "Etichetta: valore" ereditati dall'import, resi come scheda invece
// che come blocco di testo. Nessun dato viene riscritto: è solo il modo di
// mostrarlo. Le note vere restano sotto, in chiaro.
export function DatiAnagrafici({ notes }) {
  const { fields, text } = useMemo(() => parseClientNotes(notes), [notes]);
  if (!fields.length && !text) return null;
  return (
    <div style={mb14}>
      {fields.length > 0 && (
        <div style={gridGapR10}>
          {fields.map((f, i) => (
            <div key={`${f.label}-${i}`} style={minW0}>
              <div style={txtF10Bold}>{f.label}</div>
              <div style={txtF125}>{f.value}</div>
            </div>
          ))}
        </div>
      )}
      {text && (
        <div style={{ marginTop: fields.length ? 8 : 0, fontSize: 12.5, color: "var(--text-muted)", whiteSpace: "pre-line" }}>
          {text}
        </div>
      )}
    </div>
  );
}
