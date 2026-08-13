// src/components/clients/ClienteCard.jsx
// La card di un cliente in griglia, con il chip del conteggio liste viaggio.
import { useState, useMemo } from "react";
import { ContactActions } from "../ui/ContactActions.jsx";
import { notesPreview, parseClientNotes } from "../../lib/clientNotes.js";
import { ListeChip } from "./ListeChip.jsx";

export function ClienteCard({ cliente, onEdit, onDelete, onSelect, selected, liste = null }) {
  const [hovered, setHovered] = useState(false);
  // I dati anagrafici ereditati dall'import (Codice Fiscale, CAP, Provincia…)
  // stanno nelle note ma non sono note: in elenco si contano soltanto, per
  // esteso si leggono nel pannello del cliente.
  const { fields, text } = useMemo(() => parseClientNotes(cliente.notes), [cliente.notes]);
  return (
    <div
      style={{
        background: "var(--card)", borderRadius: 12, padding: "16px 18px",
        border: `2px solid ${selected ? "var(--navy)" : hovered ? "var(--navy-light)" : "var(--border)"}`,
        transition: "all 0.18s", cursor: "default",
        boxShadow: hovered ? "0 4px 16px rgba(15,32,68,0.08)" : "none",
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => onSelect(cliente)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: selected ? "var(--navy)" : "var(--navy-light)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {cliente.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--heading)", fontSize: 15 }}>{cliente.name}</div>
              {cliente.city && <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{cliente.city}</div>}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 }}>
            {cliente.email && (
              <a
                href={`mailto:${cliente.email}`}
                onClick={e => e.stopPropagation()}
                style={{ fontSize: 13, color: "var(--navy-light)", textDecoration: "none" }}
              >
                ✉️ {cliente.email}
              </a>
            )}
            {cliente.phone && (
              <ContactActions phone={cliente.phone} style={{ fontSize: 13 }} />
            )}
          </div>
          {text && (
            <div style={{ marginTop: 6, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
              {notesPreview(cliente.notes)}
            </div>
          )}
          {(fields.length > 0 || (liste?.totali || 0) > 0) && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              <ListeChip liste={liste} />
              {fields.length > 0 && (
                <span
                  title={fields.map(f => `${f.label}: ${f.value}`).join("\n")}
                  style={{
                    fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)",
                    background: "var(--surface2)", border: "1px solid var(--border)",
                    borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap",
                  }}
                >
                  📇 {fields.length} dat{fields.length === 1 ? "o" : "i"} anagrafic{fields.length === 1 ? "o" : "i"}
                </span>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => onEdit(cliente)} style={{
              padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
              background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
            }}>✏️</button>
            <button onClick={() => onDelete(cliente)} style={{
              padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca",
              background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--danger)",
            }}>🗑️</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Task collegati al cliente selezionato (v2.8 Round 9). Dal porting del modulo
// Liste viaggio il pannello contestuale ha due tab: questo è il contenuto del
// primo, la testata e la barra tab stanno in ClienteDetailPanel.
