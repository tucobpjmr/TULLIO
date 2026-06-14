// ─── QUICK ADD TASK ──────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { PRIORITIES } from "../../lib/taskConstants.js";
import { CURRENT_USER, getAssignableTeam, getAvailableCategories } from "../../state/appGlobals.js";

export const QuickAddTask = ({ onAdd, onClose, dossiers = [] }) => {
  // Categorie filtrate per il ruolo dell'utente loggato (v0.8)
  const availableCats = getAvailableCategories(CURRENT_USER);
  const firstCatKey = Object.keys(availableCats)[0] || "booking";

  // Pratiche collegabili: escludo quelle annullate (Fase 1, caveat #26)
  const linkableDossiers = dossiers.filter(d => d.status !== "annullata");

  const [form, setForm] = useState({
    title: "", category: firstCatKey, priority: "medium",
    status: "todo", assignees: [], dueDate: "", client: "", dossierId: "", description: ""
  });

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    onAdd({
      id: "t" + Date.now(),
      ...form,
      client: form.client.trim() || null,
      dossierId: form.dossierId || null,
      comments: [],
      estimatedHours: 1,
      dueDate: form.dueDate ? new Date(form.dueDate).toISOString() : null,
    });
    onClose();
  };

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: {
      width: "100%", border: "1px solid var(--border)", borderRadius: 8,
      padding: "8px 10px", fontSize: 13, background: "var(--surface)",
      outline: "none", fontFamily: "inherit",
    }
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(15,32,68,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16
    }}>
      <div className="slide-up" style={{
        background: "#fff", borderRadius: 14, padding: 28, width: 500, maxWidth: "100%",
        maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 30px 80px rgba(0,0,0,0.2)", border: "1px solid var(--border)"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="playfair" style={{ fontSize: 20, fontWeight: 700 }}>Nuovo Task</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>TITOLO *</label>
            <input {...inp("title")} placeholder="Descrivi brevemente il task..." />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CATEGORIA</label>
              <select {...inp("category")} style={{ ...inp("category").style, cursor: "pointer" }}>
                {Object.entries(availableCats).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>PRIORITÀ</label>
              <select {...inp("priority")} style={{ ...inp("priority").style, cursor: "pointer" }}>
                {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>ASSEGNA A</label>
              <select
                value={form.assignees[0] || ""}
                onChange={e => setForm(p => ({ ...p, assignees: e.target.value ? [e.target.value] : [] }))}
                style={{ ...inp("category").style, cursor: "pointer" }}>
                <option value="">— Non assegnato —</option>
                {getAssignableTeam().map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>SCADENZA</label>
              <input type="datetime-local" {...inp("dueDate")} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>CLIENTE</label>
            <input {...inp("client")} placeholder="Es. Famiglia Rossi..." />
          </div>

          {linkableDossiers.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>PRATICA COLLEGATA</label>
              <select {...inp("dossierId")} style={{ ...inp("dossierId").style, cursor: "pointer" }}>
                <option value="">— Nessuna pratica —</option>
                {linkableDossiers.map(d => (
                  <option key={d.id} value={d.id}>{d.number ? `${d.number} — ` : ""}{d.title}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 5 }}>DESCRIZIONE</label>
            <textarea {...inp("description")} rows={3} placeholder="Dettagli del task..." style={{ ...inp("description").style, resize: "vertical" }} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{
            padding: "9px 18px", borderRadius: 8, border: "1px solid var(--border)",
            background: "transparent", cursor: "pointer", fontSize: 13, fontWeight: 500
          }}>Annulla</button>
          <button onClick={handleSubmit} style={{
            padding: "9px 20px", borderRadius: 8, border: "none",
            background: "var(--navy)", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600
          }}>✓ Crea Task</button>
        </div>
      </div>
    </div>
  );
};
