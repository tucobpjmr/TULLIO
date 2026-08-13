// Estratto da ClienteDetailPanel.jsx (B-3 dell'audit del 13 agosto: un file,
// un componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useMemo } from "react";
import { parseClientNotes } from "../../lib/clientNotes.js";

// I campi "Etichetta: valore" ereditati dall'import, resi come scheda invece
// che come blocco di testo. Nessun dato viene riscritto: è solo il modo di
// mostrarlo. Le note vere restano sotto, in chiaro.
export function DatiAnagrafici({ notes }) {
  const { fields, text } = useMemo(() => parseClientNotes(notes), [notes]);
  if (!fields.length && !text) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      {fields.length > 0 && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: "6px 16px", padding: "10px 12px", borderRadius: 10,
          background: "var(--surface2)", border: "1px solid var(--border)",
        }}>
          {fields.map((f, i) => (
            <div key={`${f.label}-${i}`} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-light)", letterSpacing: 0.4, textTransform: "uppercase" }}>{f.label}</div>
              <div style={{ fontSize: 12.5, wordBreak: "break-word" }}>{f.value}</div>
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
