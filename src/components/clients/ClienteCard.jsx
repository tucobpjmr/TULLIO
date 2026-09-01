// src/components/clients/ClienteCard.jsx
// La card di un cliente in griglia, con il chip del conteggio liste viaggio.
import { useState, useMemo } from "react";
import { ContactActions } from "../ui/ContactActions.jsx";
import { notesPreview, parseClientNotes } from "../../lib/clientNotes.js";
import { ListeChip } from "./ListeChip.jsx";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowStartBetween = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 };
const flex1MinW0 = { flex: 1, minWidth: 0, cursor: "pointer" };
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, marginBottom: 4 };
const txtF15Bold = { fontWeight: 600, color: "var(--heading)", fontSize: 15 };
const rowGapMt6 = { display: "flex", flexWrap: "wrap", gap: "4px 16px", marginTop: 6 };
const txtF13NavyLight = { fontSize: 13, color: "var(--navy-light)", textDecoration: "none" };
const txtF12Muted2 = { marginTop: 6, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" };
const rowGap6Mt8 = { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 };
const boxF105Bold = {
  fontSize: 10.5, fontWeight: 600, color: "var(--text-muted)",
  background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap",
};
const colEndGap6 = { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 };
const boxF12Muted = {
  padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
  background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--text-muted)",
};
const boxF12Danger = {
  padding: "5px 10px", borderRadius: 6, border: "1px solid #fecaca",
  background: "var(--card)", cursor: "pointer", fontSize: 12, color: "var(--danger)",
};

export function ClienteCard({ cliente, onEdit, onDelete, onSelect, selected, liste = null }) {
  const [hovered, setHovered] = useState(false);
  // I dati anagrafici ereditati dall'import (Codice Fiscale, CAP, Provincia…)
  // stanno nelle note ma non sono note: in elenco si contano soltanto, per
  // esteso si leggono nel pannello del cliente.
  const { fields, text } = useMemo(() => parseClientNotes(cliente.notes), [cliente.notes]);
  const apriScheda = () => onSelect(cliente);
  return (
    // Questo div non è un affordance cliccabile: gestisce solo l'hover
    // (bordo/ombra) dell'intera card. L'apertura della scheda vive sul div
    // figlio subito sotto, con il proprio role/tabIndex/onKeyDown — qui non
    // c'è un'azione da rendere raggiungibile da tastiera.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
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
      <div style={rowStartBetween}>
        <div
          style={flex1MinW0}
          role="button" tabIndex={0}
          onClick={apriScheda} onKeyDown={attivaConTastiera(apriScheda)}
        >
          <div style={rowCenterGap8}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: selected ? "var(--navy)" : "var(--navy-light)",
              color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, flexShrink: 0,
            }}>
              {cliente.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={txtF15Bold}>{cliente.name}</div>
              {cliente.city && <div style={stiliComuni.txtF12Muted}>{cliente.city}</div>}
            </div>
          </div>
          <div style={rowGapMt6}>
            {cliente.email && (
              <a
                href={`mailto:${cliente.email}`}
                onClick={e => e.stopPropagation()}
                style={txtF13NavyLight}
              >
                ✉️ {cliente.email}
              </a>
            )}
            {cliente.phone && (
              <ContactActions phone={cliente.phone} style={stiliComuni.txtF13} />
            )}
          </div>
          {text && (
            <div style={txtF12Muted2}>
              {notesPreview(cliente.notes)}
            </div>
          )}
          {(fields.length > 0 || (liste?.totali || 0) > 0) && (
            <div style={rowGap6Mt8}>
              <ListeChip liste={liste} />
              {fields.length > 0 && (
                <span
                  title={fields.map(f => `${f.label}: ${f.value}`).join("\n")}
                  style={boxF105Bold}
                >
                  📇 {fields.length} dat{fields.length === 1 ? "o" : "i"} anagrafic{fields.length === 1 ? "o" : "i"}
                </span>
              )}
            </div>
          )}
        </div>
        {/* A-1 dell'audit del 14 agosto (secondo passaggio): il chiamante passa
            `null` quando il ruolo corrente non ha il permesso (canEditClient/
            canDeleteClient) — stesso trattamento dei tre pulsanti di
            NoticeBoard. Prima i due bottoni erano mostrati a chiunque e solo
            la RLS decideva davvero, senza che l'utente lo scoprisse. */}
        {(onEdit || onDelete) && (
          <div style={colEndGap6}>
            <div style={stiliComuni.rowGap4}>
              {onEdit && <button onClick={() => onEdit(cliente)} style={boxF12Muted}>✏️</button>}
              {onDelete && <button onClick={() => onDelete(cliente)} style={boxF12Danger}>🗑️</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Task collegati al cliente selezionato (v2.8 Round 9). Dal porting del modulo
// Liste viaggio il pannello contestuale ha due tab: questo è il contenuto del
// primo, la testata e la barra tab stanno in ClienteDetailPanel.
