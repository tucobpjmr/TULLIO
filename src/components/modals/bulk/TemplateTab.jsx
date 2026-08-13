// src/components/modals/bulk/TemplateTab.jsx
// Generazione da template: una serie di task a partire dalla data di un evento.
import { useState, useEffect } from "react";
import { PriorityBadge } from "../../ui/PriorityBadge.jsx";
import { TASK_TEMPLATES } from "../../../lib/taskConstants.js";
import { clientContact } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { DateTimePicker } from "../../ui/DateTimePicker.jsx";
import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";
import { useClientSuggestions, ClientSuggestions } from "../../ui/ClientAutocomplete.jsx";
import { dataMedia } from "../../../lib/dates.js";
import {
  btnOutlineMini, colGap14, colGap2F12, grid2ColGap12, relative, rowCenterBetween2,
  rowCenterGap10, rowGap8, txtBoldDanger, txtF10Bold, txtF10Bold2, txtF10Muted, txtF11Muted,
  txtF14,
} from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxR12 = {
  padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)",
  cursor: "pointer", background: "var(--card)",
};
const rowCenterGap102 = { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 };
const txtF28 = { fontSize: 28 };
const txtF14Bold = { fontSize: 14, fontWeight: 700 };
const txtF12Muted = { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 };
const rowCenterBetween = { display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" };
const txtF22 = { fontSize: 22 };
const txtF13Bold = { fontSize: 13, fontWeight: 700 };
const gridGap10 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 };
const boxR8 = { maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 };
const txt = { fontWeight: 500 };


// ─── BULK: TEMPLATE TAB ────────────────────────────────────────────────────
export const TemplateTab = ({ onCreate, onClose, onCancel, onDirty, clients = [] }) => {
  const { categories, getAssignableTeam } = useAppData();
  const [selectedId, setSelectedId] = useState(null);
  const [client, setClient] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [defaultAssignee, setDefaultAssignee] = useState("");
  const [praticaRef, setPraticaRef] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const cli = useClientSuggestions(clients, client);
  const pickClient = (c) => {
    setClient(c.name);
    setContact(prev => prev.trim() ? prev : clientContact(c));
    cli.close();
  };

  useEffect(() => { onDirty?.(!!selectedId); }, [selectedId, onDirty]);

  const tpl = TASK_TEMPLATES.find(t => t.id === selectedId);
  const previewTasks = tpl && eventDate ? tpl.tasks.map(t => {
    const d = new Date(eventDate);
    d.setDate(d.getDate() + t.dayOffset);
    return { ...t, dueDate: d.toISOString() };
  }) : [];

  const handleCreate = async () => {
    if (!tpl || !eventDate || busy) return;
    const tasks = previewTasks.map((t) => ({
      id: crypto.randomUUID(),
      title: t.title,
      category: t.category,
      priority: t.priority,
      status: "todo",
      assignees: defaultAssignee ? [defaultAssignee] : [],
      client: client.trim() || null,
      praticaRef: praticaRef || null,
      contact: contact.trim() || null,
      dueDate: t.dueDate,
      estimatedHours: t.estimatedHours,
      description: "",
      comments: [],
    }));
    if (!tasks.length) return;
    setBusy(true);
    setError("");
    const result = await onCreate(tasks);
    if (result && result.error) {
      setError(`Creazione non riuscita: ${result.error.message || "errore sconosciuto"}. I dati sono ancora qui, riprova.`);
      setBusy(false);
      return;
    }
    setBusy(false);
    onClose();
  };

  return (
    <div style={colGap14}>
      {!selectedId ? (
        <div style={grid2ColGap12}>
          {TASK_TEMPLATES.map(t => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="hover-lift" style={boxR12}>
              <div style={rowCenterGap102}>
                <div style={txtF28}>{t.icon}</div>
                <div>
                  <div style={txtF14Bold}>{t.name}</div>
                  <div style={txtF11Muted}>{t.tasks.length} task</div>
                </div>
              </div>
              <div style={txtF12Muted}>{t.description}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={rowCenterBetween}>
            <div style={rowCenterGap10}>
              <div style={txtF22}>{tpl.icon}</div>
              <div>
                <div style={txtF13Bold}>{tpl.name}</div>
                <div style={txtF11Muted}>{tpl.tasks.length} task</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={btnOutlineMini}>Cambia</button>
          </div>

          <div style={gridGap10}>
            <div>
              <div style={txtF10Bold}>CLIENTE</div>
              <div style={relative}>
                <input
                  value={client}
                  onChange={e => setClient(e.target.value)}
                  placeholder={clients.length ? "Cerca in anagrafica…" : "Es. Famiglia Rossi"}
                  style={bulkInputStyle}
                  {...cli.inputProps}
                />
                <ClientSuggestions matches={cli.matches} visible={cli.visible} onPick={pickClient} compact />
              </div>
            </div>
            <div>
              <div style={txtF10Bold}>DATA EVENTO *</div>
              <DateTimePicker
                value={eventDate || null}
                onChange={iso => setEventDate(iso || "")}
                withTime={false}
                placeholder="gg/mm/aaaa"
              />
            </div>
            <div>
              <div style={txtF10Bold}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <div style={txtF10Bold}>N° PRATICA</div>
              <input value={praticaRef} onChange={e => setPraticaRef(e.target.value)} placeholder="es. PR-2026-001" style={bulkInputStyle} />
            </div>
            <div>
              <div style={txtF10Bold}>CONTATTI</div>
              <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Telefono, email…" style={bulkInputStyle} />
            </div>
          </div>

          {eventDate && (
            <div>
              <div style={txtF10Bold2}>
                ANTEPRIMA — {previewTasks.length} TASK
              </div>
              <div style={boxR8}>
                {previewTasks.map((t, idx) => (
                  <div key={idx} style={{
                    padding: "8px 12px", borderBottom: idx === previewTasks.length - 1 ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  }}>
                    <span style={txtF14}>{categories[t.category]?.icon}</span>
                    <div className="vd-flex-1-min0">
                      <div style={txt}>{t.title}</div>
                      <div style={txtF10Muted}>
                        📅 {dataMedia(t.dueDate)}
                      </div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div style={rowCenterBetween2}>
        <div style={colGap2F12}>
          <span>{previewTasks.length} task pronti</span>
          {error && <span style={txtBoldDanger}>{error}</span>}
        </div>
        <div style={rowGap8}>
          <button onClick={onCancel || onClose} disabled={busy} style={{ ...bulkBtnGhost, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>Annulla</button>
          <button onClick={handleCreate} disabled={!tpl || !eventDate || busy} style={{
            ...bulkBtnPrimary,
            opacity: (!tpl || !eventDate || busy) ? 0.5 : 1,
            cursor: (!tpl || !eventDate || busy) ? "not-allowed" : "pointer",
          }}>{busy ? "⏳ Creazione…" : `✓ Crea ${previewTasks.length} task`}</button>
        </div>
      </div>
    </div>
  );
};
