import { useState } from "react";

import { PRIORITIES } from "../../state/constants.js";
import { useTeam, useCategories } from "../../state/contexts.js";
import { getAssignableTeam } from "../../state/permissions.js";

import { bulkInputStyle, bulkBtnPrimary, bulkBtnGhost } from "./bulkStyles.js";

// ─── BULK: MANUAL TAB ──────────────────────────────────────────────────────
export const ManualTab = ({ onCreate, onClose }) => {
  const team = useTeam();
  const categories = useCategories();
  const [common, setCommon] = useState({ client: "", category: "booking", priority: "medium", assignee: "" });
  const emptyRow = () => ({ key: Math.random().toString(36).slice(2), title: "", category: "", priority: "", assignee: "", dueDate: "" });
  const [rows, setRows] = useState([emptyRow(), emptyRow(), emptyRow()]);

  const updateRow = (key, field, value) => setRows(rs => rs.map(r => r.key === key ? { ...r, [field]: value } : r));
  const addRow = () => setRows(rs => [...rs, emptyRow()]);
  const removeRow = (key) => setRows(rs => rs.length > 1 ? rs.filter(r => r.key !== key) : rs);

  const validRows = rows.filter(r => r.title.trim());

  const handleCreate = () => {
    const ts = Date.now();
    const tasks = validRows.map((r, idx) => ({
      id: "t" + ts + "-" + idx,
      title: r.title.trim(),
      category: r.category || common.category,
      priority: r.priority || common.priority,
      status: "todo",
      assignees: (r.assignee || common.assignee) ? [r.assignee || common.assignee] : [],
      client: common.client.trim() || null,
      dueDate: r.dueDate ? new Date(r.dueDate).toISOString() : null,
      estimatedHours: 1,
      description: "",
      comments: [],
    }));
    onCreate(tasks);
    onClose();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: "var(--surface2)", borderRadius: 10, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 8 }}>
          IMPOSTAZIONI COMUNI (usate se la riga non specifica)
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
          <input value={common.client} onChange={e => setCommon({ ...common, client: e.target.value })} placeholder="Cliente" style={bulkInputStyle} />
          <select value={common.category} onChange={e => setCommon({ ...common, category: e.target.value })} style={bulkInputStyle}>
            {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
          </select>
          <select value={common.priority} onChange={e => setCommon({ ...common, priority: e.target.value })} style={bulkInputStyle}>
            {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select value={common.assignee} onChange={e => setCommon({ ...common, assignee: e.target.value })} style={bulkInputStyle}>
            <option value="">— Assegna a —</option>
            {getAssignableTeam(team).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, fontSize: 10, fontWeight: 700, color: "var(--text-muted)", padding: "0 4px", letterSpacing: 0.5 }}>
          <div>#</div><div>TITOLO *</div><div>CATEGORIA</div><div>PRIORITÀ</div><div>ASSEGNATO</div><div>SCADENZA</div><div></div>
        </div>
        {rows.map((r, idx) => (
          <div key={r.key} style={{ display: "grid", gridTemplateColumns: "26px 1fr 130px 100px 120px 130px 28px", gap: 6, alignItems: "center" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>{idx + 1}</div>
            <input value={r.title} onChange={e => updateRow(r.key, "title", e.target.value)} placeholder="Titolo task..." style={bulkInputStyle} />
            <select value={r.category} onChange={e => updateRow(r.key, "category", e.target.value)} style={bulkInputStyle}>
              <option value="">— default —</option>
              {Object.entries(categories).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
            </select>
            <select value={r.priority} onChange={e => updateRow(r.key, "priority", e.target.value)} style={bulkInputStyle}>
              <option value="">—</option>
              {Object.entries(PRIORITIES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select value={r.assignee} onChange={e => updateRow(r.key, "assignee", e.target.value)} style={bulkInputStyle}>
              <option value="">—</option>
              {getAssignableTeam(team).map(m => <option key={m.id} value={m.id}>{m.name.split(" ")[0]}</option>)}
            </select>
            <input type="date" value={r.dueDate} onChange={e => updateRow(r.key, "dueDate", e.target.value)} style={bulkInputStyle} />
            <button onClick={() => removeRow(r.key)} disabled={rows.length === 1} style={{
              background: "transparent", border: "none", cursor: rows.length === 1 ? "not-allowed" : "pointer",
              fontSize: 14, color: "var(--text-muted)", opacity: rows.length === 1 ? 0.3 : 1,
            }}>✕</button>
          </div>
        ))}
        <button onClick={addRow} style={{
          background: "transparent", border: "1px dashed var(--border)", borderRadius: 8,
          padding: "9px", cursor: "pointer", fontSize: 12.5, fontWeight: 600,
          color: "var(--text-muted)", marginTop: 4,
        }}>+ Aggiungi riga</button>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 10, borderTop: "1px solid var(--border)" }}>
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{validRows.length} task da creare</div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={bulkBtnGhost}>Annulla</button>
          <button onClick={handleCreate} disabled={validRows.length === 0} style={{
            ...bulkBtnPrimary, opacity: validRows.length === 0 ? 0.5 : 1, cursor: validRows.length === 0 ? "not-allowed" : "pointer",
          }}>✓ Crea {validRows.length} task</button>
        </div>
      </div>
    </div>
  );
};
