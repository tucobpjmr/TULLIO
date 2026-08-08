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
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {!selectedId ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {TASK_TEMPLATES.map(t => (
            <div key={t.id} onClick={() => setSelectedId(t.id)} className="hover-lift" style={{
              padding: "16px 18px", borderRadius: 12, border: "1px solid var(--border)",
              cursor: "pointer", background: "var(--card)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ fontSize: 28 }}>{t.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.tasks.length} task</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.4 }}>{t.description}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--surface2)", borderRadius: 8, padding: "10px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 22 }}>{tpl.icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{tpl.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{tpl.tasks.length} task</div>
              </div>
            </div>
            <button onClick={() => setSelectedId(null)} style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: 6, padding: "5px 10px", cursor: "pointer", fontSize: 11, fontWeight: 500 }}>Cambia</button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CLIENTE</div>
              <div style={{ position: "relative" }}>
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
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>DATA EVENTO *</div>
              <DateTimePicker
                value={eventDate || null}
                onChange={iso => setEventDate(iso || "")}
                withTime={false}
                placeholder="gg/mm/aaaa"
              />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>ASSEGNA A</div>
              <select value={defaultAssignee} onChange={e => setDefaultAssignee(e.target.value)} style={bulkInputStyle}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>N° PRATICA</div>
              <input value={praticaRef} onChange={e => setPraticaRef(e.target.value)} placeholder="es. PR-2026-001" style={bulkInputStyle} />
            </div>
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", marginBottom: 4, letterSpacing: 0.5 }}>CONTATTI</div>
              <input value={contact} onChange={e => setContact(e.target.value)} placeholder="Telefono, email…" style={bulkInputStyle} />
            </div>
          </div>

          {eventDate && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
                ANTEPRIMA — {previewTasks.length} TASK
              </div>
              <div style={{ maxHeight: 240, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {previewTasks.map((t, idx) => (
                  <div key={idx} style={{
                    padding: "8px 12px", borderBottom: idx === previewTasks.length - 1 ? "none" : "1px solid var(--border)",
                    display: "flex", alignItems: "center", gap: 10, fontSize: 12,
                  }}>
                    <span style={{ fontSize: 14 }}>{categories[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        📅 {new Date(t.dueDate).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })}
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

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 8, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", flexDirection: "column", gap: 2 }}>
          <span>{previewTasks.length} task pronti</span>
          {error && <span style={{ color: "var(--danger)", fontWeight: 600 }}>{error}</span>}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
