import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { STATUSES, STATUS_LABELS, STATUS_COLORS } from "../data/mockData.js";
import { getMember, getAssignableTeam, isOverdue, isActiveTask } from "../utils/core.js";

// ─── ADMIN: STILI CONDIVISI ────────────────────────────────────────────────
const sectionH = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 };
const cardStyle = { background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 18 };
const cardH = { margin: 0, marginBottom: 6, fontSize: 15, fontWeight: 700, color: "var(--navy)" };
const cardP = { fontSize: 13, color: "var(--text-muted)", marginTop: 0, marginBottom: 14 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 4 };
const fieldStyle = { width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box", background: "#fff", color: "var(--text)" };
const btnPrimary = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--navy)", background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnGold = { padding: "8px 14px", borderRadius: 6, border: "1px solid var(--gold)", background: "var(--gold)", color: "var(--navy)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" };
const btnGhost = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "#fff", color: "var(--text)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" };
const btnDanger = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--danger)", background: "#fff", color: "var(--danger)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const btnWarning = { padding: "8px 12px", borderRadius: 6, border: "1px solid var(--warning)", background: "#fff", color: "var(--warning)", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" };
const modalOverlay = { position: "fixed", inset: 0, background: "rgba(15,32,68,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 600, padding: 16 };
const modalCard = { background: "#fff", borderRadius: 12, padding: 24, width: "90%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" };

// ─── ADMIN TAB: TEAM ───────────────────────────────────────────────────────
const AdminTeamTab = ({ state, dispatch }) => {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const pending = state.team.filter(m => m.pending);
  const active = state.team.filter(m => !m.pending && m.active);
  const disabled = state.team.filter(m => !m.pending && !m.active);

  const taskCount = (id) => state.tasks.filter(t => !t.deletedAt && (t.assignees || []).includes(id)).length;

  const startEdit = (m) => { setEditingId(m.id); setDraft({ ...m }); };
  const cancelEdit = () => { setEditingId(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.name?.trim()) return;
    dispatch({ type: "UPDATE_TEAM_MEMBER", payload: draft });
    cancelEdit();
  };

  const card = (m, opts = {}) => {
    const isEditing = editingId === m.id;
    const count = taskCount(m.id);
    return (
      <div key={m.id} style={{
        background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
        padding: 16, display: "flex", alignItems: "center", gap: 14, opacity: opts.dim ? 0.65 : 1,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: m.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>{m.avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})} placeholder="Nome" style={fieldStyle} />
              <input value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})} placeholder="Ruolo" style={fieldStyle} />
              <input type="number" min="1" max="50" value={draft.capacity}
                onChange={e => setDraft({...draft, capacity: parseInt(e.target.value) || 1})} placeholder="Cap" style={fieldStyle} />
              <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                style={{ ...fieldStyle, padding: 2, height: 32 }} />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {m.role} • Capacità {m.capacity} task • {count} task assegnati
              </div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {isEditing ? (
            <>
              <button onClick={saveEdit} style={btnPrimary}>💾 Salva</button>
              <button onClick={cancelEdit} style={btnGhost}>Annulla</button>
            </>
          ) : (
            <>
              {opts.canApprove && (
                <button onClick={() => dispatch({ type: "APPROVE_TEAM_MEMBER", payload: m.id })} style={btnGold}>✓ Approva</button>
              )}
              {!m.pending && (
                <>
                  <button onClick={() => startEdit(m)} style={btnGhost} title="Modifica">✏️</button>
                  <button onClick={() => dispatch({ type: "TOGGLE_TEAM_MEMBER_ACTIVE", payload: m.id })}
                    style={m.active ? btnWarning : btnPrimary} title={m.active ? "Disattiva" : "Riattiva"}>
                    {m.active ? "⏸️ Disattiva" : "▶️ Riattiva"}
                  </button>
                </>
              )}
              <button onClick={() => {
                if (count > 0) { alert(`Impossibile rimuovere: l'agente ha ${count} task assegnati. Riassegnali prima di procedere.`); return; }
                if (window.confirm(`Rimuovere definitivamente "${m.name}"?`)) dispatch({ type: "REMOVE_TEAM_MEMBER", payload: m.id });
              }} style={btnDanger} title="Rimuovi">🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>✅ <b>{active.length}</b> attivi</span>
          {pending.length > 0 && <span>⏳ <b style={{ color: "var(--gold-dark)" }}>{pending.length}</b> in attesa</span>}
          {disabled.length > 0 && <span>⏸️ <b>{disabled.length}</b> disabilitati</span>}
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
      </div>

      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏳ Iscrizioni in attesa di approvazione</div>
          <div style={{ display: "grid", gap: 10 }}>{pending.map(m => card(m, { canApprove: true, dim: true }))}</div>
        </div>
      )}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionH}>✅ Agenti attivi</div>
        <div style={{ display: "grid", gap: 10 }}>{active.map(m => card(m))}</div>
      </div>
      {disabled.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏸️ Agenti disabilitati</div>
          <div style={{ display: "grid", gap: 10 }}>{disabled.map(m => card(m, { dim: true }))}</div>
        </div>
      )}

      {showAdd && <AddTeamMemberModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingIds={state.team.map(m => m.id)} />}
    </div>
  );
};

const AddTeamMemberModal = ({ onClose, dispatch, existingIds }) => {
  const [name, setName] = useState("");
  const [role, setRole] = useState("Junior Agent");
  const [capacity, setCapacity] = useState(8);
  const [color, setColor] = useState("#3B82F6");
  const [pending, setPending] = useState(true);

  const submit = () => {
    if (!name.trim()) return;
    const parts = name.trim().split(/\s+/);
    const avatar = ((parts[0]?.[0] || "") + (parts[1]?.[0] || parts[0]?.[1] || "")).toUpperCase();
    let id = parts[0].toLowerCase().replace(/[^a-z]/g, "");
    let suffix = 0;
    while (existingIds.includes(suffix ? `${id}${suffix}` : id)) suffix++;
    if (suffix) id = `${id}${suffix}`;
    dispatch({ type: "ADD_TEAM_MEMBER", payload: { id, name: name.trim(), role, avatar, color, capacity, active: !pending, pending } });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuovo agente</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={labelStyle}>Nome completo *</label><input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus /></div>
          <div>
            <label style={labelStyle}>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
              <option>Manager</option><option>Senior Agent</option><option>Junior Agent</option><option>Driver</option><option>Admin</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Capacità task</label><input type="number" min="1" max="50" value={capacity} onChange={e => setCapacity(parseInt(e.target.value) || 8)} style={fieldStyle} /></div>
            <div><label style={labelStyle}>Colore</label><input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} /></div>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text)", cursor: "pointer", marginTop: 4 }}>
            <input type="checkbox" checked={pending} onChange={e => setPending(e.target.checked)} />
            Crea come "in attesa di approvazione" (simula iscrizione)
          </label>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annulla</button>
          <button onClick={submit} style={btnPrimary}>Crea agente</button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: IMPORT / EXPORT ────────────────────────────────────────────
const AdminIOTab = ({ state, dispatch }) => {
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const fileInputRef = useRef(null);

  const tasksToExport = () => includeTrashed ? state.tasks : state.tasks.filter(t => !t.deletedAt);

  const downloadFile = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 500);
  };

  const escapeCSV = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const exportCSV = () => {
    const headers = ["ID","Titolo","Categoria","Priorità","Status","Cliente","Scadenza","Ore","Assegnati","Descrizione","Cestinato"];
    const rows = tasksToExport().map(t => [
      t.id, t.title, t.category, t.priority, t.status, t.client || "",
      t.dueDate ? t.dueDate.slice(0,10) : "", t.estimatedHours || 0,
      (t.assignees || []).join("|"), (t.description || "").replace(/\n/g, " "), t.deletedAt ? "Sì" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }), `voyagedesk-task-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportExcel = () => {
    const data = tasksToExport().map(t => ({
      ID: t.id, Titolo: t.title, Categoria: t.category, Priorità: t.priority,
      Status: t.status, Cliente: t.client || "", Scadenza: t.dueDate ? t.dueDate.slice(0,10) : "",
      Ore: t.estimatedHours || 0,
      Assegnati: (t.assignees || []).map(a => getMember(a)?.name || a).join(", "),
      Descrizione: t.description || "", Cestinato: t.deletedAt ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `voyagedesk-task-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportBackup = () => {
    const backup = {
      version: "0.5", exportedAt: new Date().toISOString(),
      agencyName: state.agencyName, tasks: state.tasks, team: state.team,
      categories: state.categories, notices: state.notices,
    };
    downloadFile(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }), `voyagedesk-backup-${new Date().toISOString().slice(0,10)}.json`);
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("ATTENZIONE: il ripristino sovrascrive tutti i dati correnti (task, team, categorie). Continuare?")) { e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) throw new Error("File backup non valido");
        dispatch({ type: "RESTORE_BACKUP", payload: data });
      } catch (err) { alert("Errore nel ripristino: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const total = tasksToExport().length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={cardStyle}>
        <h3 style={cardH}>📤 Esporta task</h3>
        <p style={cardP}>Scarica i task in formato CSV o Excel per archiviazione, analisi esterna o backup parziale.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          Includi task nel cestino
        </label>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>📦 <b>{total}</b> task pronti per l'export</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportCSV} style={btnPrimary}>📄 Scarica CSV</button>
          <button onClick={exportExcel} style={btnPrimary}>📊 Scarica Excel</button>
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={cardH}>📥 Importa task</h3>
        <p style={cardP}>Usa il <b>Bulk Task Creator</b> (FAB navy 📑 in basso a destra) → tab <b>Importa</b> per caricare CSV/Excel con mapping automatico.</p>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Ore, Descrizione</code><br/>
          Il sistema normalizza automaticamente nomi categoria/priorità in italiano e ID agenti.
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={cardH}>💾 Backup &amp; Restore completo</h3>
        <p style={cardP}>Esporta o ripristina <b>tutto lo stato dell'applicazione</b> (task, team, categorie, impostazioni) come file JSON.</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportBackup} style={btnPrimary}>⬇️ Esporta backup JSON</button>
          <button onClick={() => fileInputRef.current?.click()} style={btnWarning}>⬆️ Ripristina da backup</button>
          <input ref={fileInputRef} type="file" accept=".json" onChange={importBackup} style={{ display: "none" }} />
        </div>
        <div style={{ fontSize: 11, color: "var(--danger)", marginTop: 10 }}>
          ⚠️ Il ripristino sovrascrive completamente i dati correnti. Esporta prima un backup di sicurezza.
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: SISTEMA / STATS ────────────────────────────────────────────
const AdminStatsTab = ({ state }) => {
  const active = state.tasks.filter(t => !t.deletedAt);
  const trashed = state.tasks.filter(t => t.deletedAt);
  const overdue = active.filter(t => isOverdue(t));
  const done = active.filter(t => t.status === "done");
  const completionRate = active.length ? Math.round((done.length / active.length) * 100) : 0;

  const byStatus = STATUSES.map(s => ({
    s, label: STATUS_LABELS[s], color: STATUS_COLORS[s],
    count: active.filter(t => t.status === s).length,
  }));

  const byCategory = Object.entries(state.categories).map(([k, c]) => ({
    k, label: c.label, color: c.color, icon: c.icon,
    count: active.filter(t => t.category === k).length,
  })).sort((a,b) => b.count - a.count);

  const byMember = state.team.filter(m => !m.pending).map(m => {
    const count = active.filter(t => (t.assignees || []).includes(m.id) && t.status !== "done").length;
    return { m, count, pct: m.capacity ? Math.min(100, Math.round((count / m.capacity) * 100)) : 0 };
  });

  const kpiCard = (label, value, sub, color) => (
    <div style={cardStyle}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 700, color: color || "var(--navy)", marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCard("Task attivi", active.length, `${trashed.length} nel cestino`)}
        {kpiCard("Completati", done.length, `${completionRate}% completion`, "var(--success)")}
        {kpiCard("Scaduti", overdue.length, "task non chiusi oltre data", "var(--danger)")}
        {kpiCard("Agenti", state.team.filter(m => m.active && !m.pending).length, `${state.team.filter(m => m.pending).length} in attesa`)}
      </div>

      <div style={cardStyle}>
        <h3 style={cardH}>📊 Distribuzione per status</h3>
        <div style={{ display: "grid", gap: 8 }}>
          {byStatus.map(s => {
            const pct = active.length ? (s.count / active.length) * 100 : 0;
            return (
              <div key={s.s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 140, fontSize: 13, color: "var(--text)" }}>{s.label}</div>
                <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: s.color, transition: "width 0.3s" }} />
                </div>
                <div style={{ width: 60, textAlign: "right", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>{s.count}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={cardH}>👥 Carico di lavoro per agente</h3>
        <div style={{ display: "grid", gap: 10 }}>
          {byMember.map(({ m, count, pct }) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: m.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{m.avatar}</div>
              <div style={{ width: 160, fontSize: 13 }}>{m.name}</div>
              <div style={{ flex: 1, height: 18, background: "var(--surface2)", borderRadius: 9, overflow: "hidden" }}>
                <div style={{
                  width: `${pct}%`, height: "100%",
                  background: pct > 90 ? "var(--danger)" : pct > 70 ? "var(--warning)" : "var(--success)",
                  transition: "width 0.3s",
                }} />
              </div>
              <div style={{ width: 100, textAlign: "right", fontSize: 12, color: "var(--text-muted)" }}>
                {count}/{m.capacity} • <b style={{ color: "var(--text)" }}>{pct}%</b>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={cardStyle}>
        <h3 style={cardH}>🏷️ Distribuzione per categoria</h3>
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {byCategory.map(c => (
            <div key={c.k} style={{ padding: 12, background: "var(--surface2)", borderRadius: 8, display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.count} task</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: CATEGORIE ──────────────────────────────────────────────────
const AdminCategoriesTab = ({ state, dispatch }) => {
  const [editingKey, setEditingKey] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);

  const usageCount = (key) => state.tasks.filter(t => !t.deletedAt && t.category === key).length;
  const startEdit = (key, c) => { setEditingKey(key); setDraft({ key, ...c }); };
  const cancelEdit = () => { setEditingKey(null); setDraft(null); };
  const saveEdit = () => {
    if (!draft.label?.trim()) return;
    dispatch({ type: "UPDATE_CATEGORY", payload: draft });
    cancelEdit();
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>🏷️ <b>{Object.keys(state.categories).length}</b> categorie definite</div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi categoria</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(state.categories).map(([key, c]) => {
          const isEditing = editingKey === key;
          const count = usageCount(key);
          return (
            <div key={key} style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 10, padding: 14, display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 8, fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center", background: c.bg, color: c.color, flexShrink: 0 }}>{isEditing ? draft.icon : c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 90px", gap: 8 }}>
                    <input value={draft.label} onChange={e => setDraft({...draft, label: e.target.value})} placeholder="Etichetta" style={fieldStyle} />
                    <input value={draft.icon} onChange={e => setDraft({...draft, icon: e.target.value})} placeholder="Icona" style={fieldStyle} maxLength={2} />
                    <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})} style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore primario" />
                    <input type="color" value={draft.bg} onChange={e => setDraft({...draft, bg: e.target.value})} style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore sfondo" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>Chiave: <code>{key}</code> • {count} task usano questa categoria</div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {isEditing ? (
                  <><button onClick={saveEdit} style={btnPrimary}>💾 Salva</button><button onClick={cancelEdit} style={btnGhost}>Annulla</button></>
                ) : (
                  <>
                    <button onClick={() => startEdit(key, c)} style={btnGhost}>✏️ Modifica</button>
                    <button onClick={() => {
                      if (count > 0) { alert(`Impossibile rimuovere: ${count} task usano questa categoria.`); return; }
                      if (window.confirm(`Rimuovere categoria "${c.label}"?`)) dispatch({ type: "REMOVE_CATEGORY", payload: key });
                    }} style={btnDanger}>🗑️</button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showAdd && <AddCategoryModal onClose={() => setShowAdd(false)} dispatch={dispatch} existingKeys={Object.keys(state.categories)} />}
    </div>
  );
};

const AddCategoryModal = ({ onClose, dispatch, existingKeys }) => {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState("#3B82F6");
  const [bg, setBg] = useState("#EFF6FF");

  const submit = () => {
    if (!label.trim()) return;
    let key = label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
    if (!key) key = "custom";
    let suffix = 0;
    while (existingKeys.includes(suffix ? `${key}${suffix}` : key)) suffix++;
    if (suffix) key = `${key}${suffix}`;
    dispatch({ type: "ADD_CATEGORY", payload: { key, label: label.trim(), icon, color, bg } });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuova categoria</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div><label style={labelStyle}>Nome *</label><input value={label} onChange={e => setLabel(e.target.value)} placeholder="Es. Trasferimenti" style={fieldStyle} autoFocus /></div>
          <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div><label style={labelStyle}>Icona (emoji)</label><input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} style={{ ...fieldStyle, textAlign: "center", fontSize: 18 }} /></div>
            <div><label style={labelStyle}>Colore</label><input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} /></div>
            <div><label style={labelStyle}>Sfondo</label><input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} /></div>
          </div>
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Anteprima</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 999, background: bg, color: color, fontSize: 12, fontWeight: 600 }}>
              <span>{icon}</span> {label || "Nome categoria"}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
          <button onClick={onClose} style={btnGhost}>Annulla</button>
          <button onClick={submit} style={btnPrimary}>Crea categoria</button>
        </div>
      </div>
    </div>
  );
};

// ─── ADMIN TAB: LOG ATTIVITÀ ───────────────────────────────────────────────
const AdminLogTab = ({ state, dispatch }) => {
  const [filter, setFilter] = useState("all");

  const groups = {
    all: () => state.activityLog,
    task: () => state.activityLog.filter(l => ["ADD_TASK","ADD_TASKS_BULK","UPDATE_TASK","MOVE_TASK","ADD_COMMENT"].includes(l.type)),
    trash: () => state.activityLog.filter(l => ["DELETE_TASK","RESTORE_TASK","PURGE_TASK","EMPTY_TRASH"].includes(l.type)),
    admin: () => state.activityLog.filter(l => l.type.includes("TEAM_MEMBER") || l.type.includes("CATEGORY") || l.type === "RESTORE_BACKUP"),
  };
  const list = groups[filter]();

  const iconFor = (type) => {
    if (type.includes("DELETE") || type.includes("PURGE") || type.includes("EMPTY")) return "🗑️";
    if (type.includes("RESTORE")) return "↻";
    if (type.includes("ADD_TASK")) return "➕";
    if (type.includes("UPDATE_TASK")) return "✏️";
    if (type === "MOVE_TASK") return "🔄";
    if (type === "ADD_COMMENT") return "💬";
    if (type.includes("TEAM")) return "👤";
    if (type.includes("CATEGORY")) return "🏷️";
    if (type.includes("BACKUP")) return "💾";
    return "•";
  };

  const formatRel = (iso) => {
    const diff = Date.now() - new Date(iso).getTime();
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return "ora";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min} min fa`;
    const h = Math.floor(min / 60);
    if (h < 24) return `${h}h fa`;
    return new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 4 }}>
          {[{ id: "all", label: "Tutte" }, { id: "task", label: "Task" }, { id: "trash", label: "Cestino" }, { id: "admin", label: "Admin" }].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", cursor: "pointer",
              background: filter === f.id ? "var(--navy)" : "#fff",
              color: filter === f.id ? "#fff" : "var(--text)", fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {state.activityLog.length > 0 && (
          <button onClick={() => {
            if (window.confirm("Svuotare il log attività? Non è reversibile.")) dispatch({ type: "CLEAR_ACTIVITY_LOG" });
          }} style={btnDanger}>🔥 Svuota log</button>
        )}
      </div>

      <div style={cardStyle}>
        {list.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
            <div style={{ fontSize: 14 }}>Nessuna attività registrata{filter !== "all" ? " in questo filtro" : " ancora"}</div>
            <div style={{ fontSize: 11, marginTop: 6 }}>Le azioni effettuate appariranno qui (ultime 100)</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 2 }}>
            {list.map(l => (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 4px", borderBottom: "1px solid var(--surface2)" }}>
                <div style={{ fontSize: 16, width: 24, textAlign: "center" }}>{iconFor(l.type)}</div>
                <div style={{ flex: 1, fontSize: 13, color: "var(--text)" }}>{l.text}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", whiteSpace: "nowrap" }}>{formatRel(l.time)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── ADMIN VIEW ────────────────────────────────────────────────────────────
const AdminView = ({ state, dispatch }) => {
  const [tab, setTab] = useState("team");

  const tabs = [
    { id: "team", icon: "👥", label: "Team" },
    { id: "io", icon: "📤", label: "Import / Export" },
    { id: "stats", icon: "📊", label: "Sistema" },
    { id: "cats", icon: "🏷️", label: "Categorie" },
    { id: "log", icon: "📋", label: "Log attività" },
  ];

  return (
    <div className="vd-pad" style={{ padding: 32, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 className="playfair" style={{ fontSize: 28, color: "var(--navy)", margin: 0, fontWeight: 700 }}>
          ⚙️ Amministrazione
        </h1>
        <p style={{ color: "var(--text-muted)", fontSize: 14, marginTop: 4 }}>
          Gestione team, categorie, import/export, statistiche e log attività
        </p>
      </div>

      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid var(--border)", overflowX: "auto", whiteSpace: "nowrap" }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: "10px 16px", background: "transparent", border: "none",
              borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
              color: active ? "var(--navy)" : "var(--text-muted)",
              fontWeight: active ? 700 : 500, fontSize: 13, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "inherit", marginBottom: -1, flexShrink: 0,
            }}>
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      <div className="fade-in" key={tab}>
        {tab === "team" && <AdminTeamTab state={state} dispatch={dispatch} />}
        {tab === "io" && <AdminIOTab state={state} dispatch={dispatch} />}
        {tab === "stats" && <AdminStatsTab state={state} />}
        {tab === "cats" && <AdminCategoriesTab state={state} dispatch={dispatch} />}
        {tab === "log" && <AdminLogTab state={state} dispatch={dispatch} />}
      </div>
    </div>
  );
};

export default AdminView;
