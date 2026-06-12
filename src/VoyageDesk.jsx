
import { useState, useReducer, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Tasks as TasksAPI, Comments as CommentsAPI, Notices as NoticesAPI,
  Conversations as ConversationsAPI, Messages as MessagesAPI,
  Notifications as NotificationsAPI, Users as UsersAPI,
  subscribeToTable,
} from "./lib/api.js";
import {
  toDbTask, toDbTaskPatch, fromDbTask,
  toDbNotice, toDbNoticePatch, fromDbNotice,
  toDbConversation, fromDbConversation,
  toDbMessage, fromDbMessage,
  fromDbNotification,
  newId, isUuid,
} from "./lib/mappers.js";
// Step O: logout UI — signOut vive in AuthContext, qui viene solo cablato.
import { useAuth } from "./auth/AuthContext.jsx";

// Step P / Fase 2: moduli estratti.
import { ViewportProvider, useViewport } from "./hooks/useViewport.jsx";
import { AppContext, useTeam, useCategories, useCurrentUserId } from "./state/contexts.js";
import { PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS } from "./state/constants.js";
import { NOTIFICATIONS } from "./state/seed.js";
import {
  getMember, getAssignableTeam, canViewTask,
} from "./state/permissions.js";
import { reducer, makeInitialState } from "./state/reducer.js";
import { formatDate, formatTime } from "./utils/formatters.js";
import {
  isOverdue, isActiveTask, getActiveTasks,
} from "./utils/taskFilters.js";

// Atoms condivisi (badges, avatar)
import { Avatar, PriorityBadge, StatusBadge } from "./components/atoms/index.jsx";
// Layout
import { FontLoader } from "./components/layout/FontLoader.jsx";
import { Toast } from "./components/layout/Toast.jsx";
import { FAB } from "./components/layout/FAB.jsx";
import { Topbar } from "./components/layout/Topbar.jsx";
import { Sidebar } from "./components/layout/Sidebar.jsx";
import { BottomNav } from "./components/layout/BottomNav.jsx";
// Dashboard + AI + shared
import { Dashboard } from "./components/dashboard/Dashboard.jsx";
// Calendar
import { CalendarPlanner } from "./components/calendar/CalendarPlanner.jsx";
// Chat
import { ChatPanel } from "./components/chat/ChatPanel.jsx";
import { initialConversations, initialMessages } from "./components/chat/seed.js";
import { getUnreadCount } from "./components/chat/helpers.js";
// Tasks + Trash
import { TaskSlideOver } from "./components/tasks/TaskSlideOver.jsx";
import { QuickAddTask } from "./components/tasks/QuickAddTask.jsx";
import { BulkTaskCreator } from "./components/tasks/BulkTaskCreator.jsx";
import { Trash } from "./components/trash/Trash.jsx";
import { loadXLSX } from "./utils/xlsx.js";





const Team = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [selectedMember, setSelectedMember] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const uid = state.currentUserId;
  const team = state.team;
  const categories = state.categories;

  const memberTasks = (memberId) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid, team) && t.assignees?.includes(memberId));

  const filtered = selectedMember
    ? memberTasks(selectedMember).filter(t => !filterStatus || t.status === filterStatus)
    : [];

  const roleColors = { Manager: "#0F2044", "Senior Agent": "#2D7A4F", "Junior Agent": "#C8832A", Driver: "#7B4F9E", Admin: "#C0392B" };

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28 }}>
      <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, marginBottom: 22 }}>Team & Assegnazioni</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginBottom: 28 }}>
        {getAssignableTeam(team).map(m => {
          const tasks = memberTasks(m.id);
          const active = tasks.filter(t => t.status !== "done");
          const done = tasks.filter(t => t.status === "done");
          const pct = Math.min(100, Math.round((active.length / m.capacity) * 100));
          const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
          const isSelected = selectedMember === m.id;

          return (
            <div key={m.id} className="hover-lift" onClick={() => setSelectedMember(isSelected ? null : m.id)} style={{
              background: "#fff", borderRadius: 12, padding: "20px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `2px solid ${isSelected ? m.color : "var(--border)"}`,
              cursor: "pointer", textAlign: "center", transition: "all 0.2s",
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: m.color,
                fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", margin: "0 auto 10px"
              }}>{m.avatar}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
              <div style={{
                fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 99,
                background: roleColors[m.role] + "15", color: roleColors[m.role], marginTop: 4, display: "inline-block"
              }}>{m.role}</div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, marginBottom: 8 }}>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--navy)" }}>{active.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Attivi</div>
                </div>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--success)" }}>{done.length}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Completati</div>
                </div>
              </div>

              <div style={{ height: 5, background: "var(--surface2)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: barColor, borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{active.length}/{m.capacity} capacità</div>
            </div>
          );
        })}
      </div>

      {selectedMember && (() => {
        const m = getMember(selectedMember, team);
        if (!m) return null;
        return (
          <div className="slide-up" style={{ background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Avatar memberId={selectedMember} size={40} />
                <div>
                  <div className="playfair" style={{ fontSize: 16, fontWeight: 700 }}>Task di {m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{m.role}</div>
                </div>
              </div>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{
                border: "1px solid var(--border)", borderRadius: 8, padding: "6px 10px", fontSize: 12, fontFamily: "inherit", cursor: "pointer"
              }}>
                <option value="">Tutti gli stati</option>
                {STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: "var(--text-muted)", fontSize: 14 }}>
                  Nessun task trovato per questo filtro
                </div>
              ) : filtered.map(t => (
                <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                  transition: "background 0.15s"
                }}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <span style={{ fontSize: 18 }}>{categories[t.category]?.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                      {t.client && `👤 ${t.client} • `}📅 {formatDate(t.dueDate)}
                    </div>
                  </div>
                  <PriorityBadge priority={t.priority} />
                  <StatusBadge status={t.status} />
                </div>
              ))}
            </div>
          </div>
        );
      })()}
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

      {/* Tab nav */}
      <div style={{
        display: "flex", gap: 4, marginBottom: 20,
        borderBottom: "1px solid var(--border)",
        overflowX: "auto", whiteSpace: "nowrap",
      }}>
        {tabs.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: "10px 16px", background: "transparent", border: "none",
                borderBottom: `2px solid ${active ? "var(--gold)" : "transparent"}`,
                color: active ? "var(--navy)" : "var(--text-muted)",
                fontWeight: active ? 700 : 500, fontSize: 13,
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                fontFamily: "inherit", marginBottom: -1, flexShrink: 0,
              }}
            >
              <span>{t.icon}</span> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
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
        padding: 16, display: "flex", alignItems: "center", gap: 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: "50%", background: m.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontWeight: 700, fontSize: 16, flexShrink: 0,
        }}>{m.avatar}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px 100px", gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}
                placeholder="Nome" style={fieldStyle} />
              <input value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                placeholder="Ruolo" style={fieldStyle} />
              <input type="number" min="1" max="50" value={draft.capacity}
                onChange={e => setDraft({...draft, capacity: parseInt(e.target.value) || 1})}
                placeholder="Cap" style={fieldStyle} />
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
                <button onClick={() => dispatch({ type: "APPROVE_TEAM_MEMBER", payload: m.id })} style={btnGold}>
                  ✓ Approva
                </button>
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
                if (count > 0) {
                  alert(`Impossibile rimuovere: l'agente ha ${count} task assegnati. Riassegnali prima di procedere.`);
                  return;
                }
                if (window.confirm(`Rimuovere definitivamente "${m.name}"?`)) {
                  dispatch({ type: "REMOVE_TEAM_MEMBER", payload: m.id });
                }
              }} style={btnDanger} title="Rimuovi">🗑️</button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Header con pulsante aggiungi */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 16, fontSize: 13, color: "var(--text-muted)" }}>
          <span>✅ <b>{active.length}</b> attivi</span>
          {pending.length > 0 && <span>⏳ <b style={{ color: "var(--gold-dark)" }}>{pending.length}</b> in attesa</span>}
          {disabled.length > 0 && <span>⏸️ <b>{disabled.length}</b> disabilitati</span>}
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏳ Iscrizioni in attesa di approvazione</div>
          <div style={{ display: "grid", gap: 10 }}>
            {pending.map(m => card(m, { canApprove: true, dim: true }))}
          </div>
        </div>
      )}

      {/* Attivi */}
      <div style={{ marginBottom: 24 }}>
        <div style={sectionH}>✅ Agenti attivi</div>
        <div style={{ display: "grid", gap: 10 }}>
          {active.map(m => card(m))}
        </div>
      </div>

      {/* Disabilitati */}
      {disabled.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={sectionH}>⏸️ Agenti disabilitati</div>
          <div style={{ display: "grid", gap: 10 }}>
            {disabled.map(m => card(m, { dim: true }))}
          </div>
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
    dispatch({
      type: "ADD_TEAM_MEMBER",
      payload: { id, name: name.trim(), role, avatar, color, capacity, active: !pending, pending }
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={modalOverlay}>
      <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
        <h3 className="playfair" style={{ margin: 0, marginBottom: 16, color: "var(--navy)" }}>Aggiungi nuovo agente</h3>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label style={labelStyle}>Nome completo *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Es. Anna Bianchi" style={fieldStyle} autoFocus />
          </div>
          <div>
            <label style={labelStyle}>Ruolo</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={fieldStyle}>
              <option>Manager</option>
              <option>Senior Agent</option>
              <option>Junior Agent</option>
              <option>Driver</option>
              <option>Admin</option>
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Capacità task</label>
              <input type="number" min="1" max="50" value={capacity}
                onChange={e => setCapacity(parseInt(e.target.value) || 8)} style={fieldStyle} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{...fieldStyle, height: 38, padding: 2}} />
            </div>
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
      t.dueDate ? t.dueDate.slice(0,10) : "",
      t.estimatedHours || 0,
      (t.assignees || []).join("|"),
      (t.description || "").replace(/\n/g, " "),
      t.deletedAt ? "Sì" : "No",
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `voyagedesk-task-${new Date().toISOString().slice(0,10)}.csv`);
  };

  const exportExcel = async () => {
    const XLSX = await loadXLSX();
    const data = tasksToExport().map(t => ({
      ID: t.id, Titolo: t.title, Categoria: t.category, Priorità: t.priority,
      Status: t.status, Cliente: t.client || "",
      Scadenza: t.dueDate ? t.dueDate.slice(0,10) : "",
      Ore: t.estimatedHours || 0,
      Assegnati: (t.assignees || []).map(a => getMember(a, state.team)?.name || a).join(", "),
      Descrizione: t.description || "",
      Cestinato: t.deletedAt ? "Sì" : "No",
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Task");
    XLSX.writeFile(wb, `voyagedesk-task-${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const exportBackup = () => {
    const backup = {
      version: "0.5",
      exportedAt: new Date().toISOString(),
      agencyName: state.agencyName,
      tasks: state.tasks,
      team: state.team,
      categories: state.categories,
      notices: state.notices,
    };
    downloadFile(
      new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }),
      `voyagedesk-backup-${new Date().toISOString().slice(0,10)}.json`
    );
  };

  const importBackup = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm("ATTENZIONE: il ripristino sovrascrive tutti i dati correnti (task, team, categorie). Continuare?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!data.tasks || !Array.isArray(data.tasks)) throw new Error("File backup non valido");
        dispatch({ type: "RESTORE_BACKUP", payload: data });
      } catch (err) {
        alert("Errore nel ripristino: " + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const total = tasksToExport().length;

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {/* Export task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📤 Esporta task</h3>
        <p style={cardP}>Scarica i task in formato CSV o Excel per archiviazione, analisi esterna o backup parziale.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 14 }}>
          <input type="checkbox" checked={includeTrashed} onChange={e => setIncludeTrashed(e.target.checked)} />
          Includi task nel cestino
        </label>
        <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 12 }}>
          📦 <b>{total}</b> task pronti per l'export
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={exportCSV} style={btnPrimary}>📄 Scarica CSV</button>
          <button onClick={exportExcel} style={btnPrimary}>📊 Scarica Excel</button>
        </div>
      </div>

      {/* Import task */}
      <div style={cardStyle}>
        <h3 style={cardH}>📥 Importa task</h3>
        <p style={cardP}>Usa il <b>Bulk Task Creator</b> (FAB navy 📑 in basso a destra) → tab <b>Importa</b> per caricare CSV/Excel con mapping automatico.</p>
        <div style={{ fontSize: 12, color: "var(--text-muted)", padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Ore, Descrizione</code><br/>
          Il sistema normalizza automaticamente nomi categoria/priorità in italiano e ID agenti.
        </div>
      </div>

      {/* Backup completo */}
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
      {/* KPI */}
      <div className="vd-grid-kpi" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {kpiCard("Task attivi", active.length, `${trashed.length} nel cestino`)}
        {kpiCard("Completati", done.length, `${completionRate}% completion`, "var(--success)")}
        {kpiCard("Scaduti", overdue.length, "task non chiusi oltre data", "var(--danger)")}
        {kpiCard("Agenti", state.team.filter(m => m.active && !m.pending).length, `${state.team.filter(m => m.pending).length} in attesa`)}
      </div>

      {/* Distribuzione per status */}
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

      {/* Carico team */}
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

      {/* Categorie */}
      <div style={cardStyle}>
        <h3 style={cardH}>🏷️ Distribuzione per categoria</h3>
        <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {byCategory.map(c => (
            <div key={c.k} style={{
              padding: 12, background: "var(--surface2)", borderRadius: 8,
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, fontSize: 16,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "#fff",
              }}>{c.icon}</div>
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
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          🏷️ <b>{Object.keys(state.categories).length}</b> categorie definite
        </div>
        <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi categoria</button>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {Object.entries(state.categories).map(([key, c]) => {
          const isEditing = editingKey === key;
          const count = usageCount(key);
          return (
            <div key={key} style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 10,
              padding: 14, display: "flex", alignItems: "center", gap: 14,
            }}>
              <div style={{
                width: 42, height: 42, borderRadius: 8, fontSize: 22,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: c.bg, color: c.color, flexShrink: 0,
              }}>{isEditing ? draft.icon : c.icon}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {isEditing ? (
                  <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 70px 90px 90px", gap: 8 }}>
                    <input value={draft.label} onChange={e => setDraft({...draft, label: e.target.value})}
                      placeholder="Etichetta" style={fieldStyle} />
                    <input value={draft.icon} onChange={e => setDraft({...draft, icon: e.target.value})}
                      placeholder="Icona" style={fieldStyle} maxLength={2} />
                    <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore primario" />
                    <input type="color" value={draft.bg} onChange={e => setDraft({...draft, bg: e.target.value})}
                      style={{ ...fieldStyle, padding: 2, height: 32 }} title="Colore sfondo" />
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{c.label}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                      Chiave: <code>{key}</code> • {count} task usano questa categoria
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
                    <button onClick={() => startEdit(key, c)} style={btnGhost}>✏️ Modifica</button>
                    <button onClick={() => {
                      if (count > 0) {
                        alert(`Impossibile rimuovere: ${count} task usano questa categoria.`);
                        return;
                      }
                      if (window.confirm(`Rimuovere categoria "${c.label}"?`)) {
                        dispatch({ type: "REMOVE_CATEGORY", payload: key });
                      }
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
          <div>
            <label style={labelStyle}>Nome *</label>
            <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Es. Trasferimenti" style={fieldStyle} autoFocus />
          </div>
          <div className="vd-grid-3col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle}>Icona (emoji)</label>
              <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} style={{ ...fieldStyle, textAlign: "center", fontSize: 18 }} />
            </div>
            <div>
              <label style={labelStyle}>Colore</label>
              <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
            </div>
            <div>
              <label style={labelStyle}>Sfondo</label>
              <input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
            </div>
          </div>
          {/* Preview */}
          <div style={{ padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}>Anteprima</div>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "4px 10px", borderRadius: 999, background: bg, color: color,
              fontSize: 12, fontWeight: 600,
            }}>
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
          {[
            { id: "all", label: "Tutte" },
            { id: "task", label: "Task" },
            { id: "trash", label: "Cestino" },
            { id: "admin", label: "Admin" },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              padding: "6px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: "1px solid var(--border)", cursor: "pointer",
              background: filter === f.id ? "var(--navy)" : "#fff",
              color: filter === f.id ? "#fff" : "var(--text)",
              fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {state.activityLog.length > 0 && (
          <button onClick={() => {
            if (window.confirm("Svuotare il log attività? Non è reversibile.")) {
              dispatch({ type: "CLEAR_ACTIVITY_LOG" });
            }
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
              <div key={l.id} style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "8px 4px", borderBottom: "1px solid var(--surface2)",
              }}>
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

// ─── ROOT APP ──────────────────────────────────────────────────────────────
export default function VoyageDesk({ initialTeam, initialCurrentUserId } = {}) {
  return (
    <ViewportProvider>
      <VoyageDeskInner
        initialTeam={initialTeam}
        initialCurrentUserId={initialCurrentUserId}
      />
    </ViewportProvider>
  );
}

function VoyageDeskInner({ initialTeam, initialCurrentUserId }) {
  const { isDesktop } = useViewport();
  const [state, rawDispatch] = useReducer(
    reducer,
    { team: initialTeam, currentUserId: initialCurrentUserId },
    makeInitialState
  );

  // Modalità DB: attiva solo se AuthContext ha fornito un team reale.
  // Senza, l'app resta sui mock (dev/preview senza login).
  const useSupabase = Array.isArray(initialTeam) && initialTeam.length > 0;

  // Idratazione tasks + notices dal DB al primo mount in modalità Supabase,
  // più subscription realtime: ad ogni evento postgres ricarico la lista
  // intera (debounced) — semplice e robusto al duplicate dell'eco locale.
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    // Generation counter: scarta risposte stale quando un evento realtime
    // ri-triggera reload mentre uno è ancora in volo (caveat #21, finding #2).
    let tasksGen = 0;
    let noticesGen = 0;

    const reloadTasks = () => {
      const my = ++tasksGen;
      TasksAPI.list({ withComments: true }).then(({ data, error }) => {
        if (cancelled || my !== tasksGen) return;
        if (error) {
          console.error("[VoyageDesk] Tasks.list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento task fallito: ${error.message || ""}` } });
          return;
        }
        rawDispatch({ type: "SET_TASKS", payload: (data || []).map(fromDbTask) });
      });
    };
    const reloadNotices = () => {
      const my = ++noticesGen;
      NoticesAPI.list().then(({ data, error }) => {
        if (cancelled || my !== noticesGen) return;
        if (error) {
          console.error("[VoyageDesk] Notices.list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Caricamento avvisi fallito: ${error.message || ""}` } });
          return;
        }
        rawDispatch({ type: "SET_NOTICES", payload: (data || []).map(fromDbNotice) });
      });
    };

    reloadTasks();
    reloadNotices();

    // Debounce: gli eventi arrivano a raffica durante inserimenti bulk.
    let tasksTimer = null;
    let noticesTimer = null;
    const debouncedTasks = () => {
      clearTimeout(tasksTimer);
      tasksTimer = setTimeout(reloadTasks, 200);
    };
    const debouncedNotices = () => {
      clearTimeout(noticesTimer);
      noticesTimer = setTimeout(reloadNotices, 200);
    };

    const unsubTasks = subscribeToTable("tasks", debouncedTasks);
    const unsubComments = subscribeToTable("comments", debouncedTasks);
    const unsubNotices = subscribeToTable("notices", debouncedNotices);

    return () => {
      cancelled = true;
      clearTimeout(tasksTimer);
      clearTimeout(noticesTimer);
      unsubTasks?.();
      unsubComments?.();
      unsubNotices?.();
    };
  }, [useSupabase]);

  // Loading state chat: true finché non completa il primo reload da Supabase.
  // Evita il flash "nessun messaggio" mentre l'idratazione è in volo.
  const [chatLoading, setChatLoading] = useState(useSupabase);

  // Notifiche reali (Step F): in modalità Supabase idratiamo + realtime.
  // Senza login restiamo sui mock NOTIFICATIONS.
  const [notifications, setNotifications] = useState([]);
  useEffect(() => {
    if (!useSupabase) return;
    let cancelled = false;
    let loadGen = 0;
    const reload = () => {
      const my = ++loadGen;
      NotificationsAPI.list({ limit: 100 }).then(({ data, error }) => {
        if (cancelled || my !== loadGen) return;
        if (error) {
          console.error("[notifications] list", error);
          rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: caricamento fallito: ${error.message || ""}` } });
          return;
        }
        setNotifications((data || []).map(fromDbNotification));
      });
    };
    reload();
    let timer = null;
    const debounced = () => { clearTimeout(timer); timer = setTimeout(reload, 200); };
    const unsub = subscribeToTable("notifications", debounced);
    return () => { cancelled = true; clearTimeout(timer); unsub?.(); };
  }, [useSupabase]);

  const markNotificationRead = useCallback((id) => {
    if (!useSupabase) return;
    // Ottimistico
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    NotificationsAPI.markRead(id).then(r => {
      if (r?.error) {
        console.error("[notifications] markRead", r.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifica: aggiornamento fallito` } });
      }
    });
  }, [useSupabase]);

  // currentUserId vivo, per persistere i comments con l'autore giusto.
  const currentUserIdRef = useRef(state.currentUserId);
  useEffect(() => { currentUserIdRef.current = state.currentUserId; }, [state.currentUserId]);

  // Wrapper dispatch: applica al reducer (UI istantanea) e poi sincronizza
  // su Supabase fire-and-forget. Per ADD_TASK normalizza l'id in uuid in
  // modo coerente tra reducer e DB.
  const dispatch = useCallback((action) => {
    if (!useSupabase) { rawDispatch(action); return; }

    let toDispatch = action;
    let dbOps = null;

    switch (action.type) {
      case "ADD_TASK": {
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id };
        toDispatch = { ...action, payload };
        dbOps = () => TasksAPI.create(toDbTask(payload));
        break;
      }
      case "ADD_TASKS_BULK": {
        const payload = (action.payload || []).map(t => ({
          ...t, id: isUuid(t?.id) ? t.id : newId(),
        }));
        toDispatch = { ...action, payload };
        dbOps = () => Promise.all(payload.map(t => TasksAPI.create(toDbTask(t))));
        break;
      }
      case "UPDATE_TASK":
        dbOps = () => TasksAPI.update(action.payload.id, toDbTaskPatch(action.payload));
        break;
      case "MOVE_TASK":
        dbOps = () => TasksAPI.update(action.payload.taskId, { status: action.payload.newStatus });
        break;
      case "DELETE_TASK":
        dbOps = () => TasksAPI.softDelete(action.payload);
        break;
      case "RESTORE_TASK":
        dbOps = () => TasksAPI.restore(action.payload);
        break;
      case "PURGE_TASK":
        dbOps = () => TasksAPI.hardDelete(action.payload);
        break;
      case "EMPTY_TRASH": {
        const ids = state.tasks.filter(t => t.deletedAt).map(t => t.id);
        dbOps = () => Promise.all(ids.map(id => TasksAPI.hardDelete(id)));
        break;
      }
      case "ADD_COMMENT": {
        const uid = currentUserIdRef.current;
        dbOps = () => CommentsAPI.create({
          task_id: action.payload.taskId,
          user_id: uid,
          text: action.payload.comment?.text ?? "",
        });
        break;
      }
      case "ADD_NOTICE": {
        const id = isUuid(action.payload?.id) ? action.payload.id : newId();
        const payload = { ...action.payload, id, author: action.payload.author ?? currentUserIdRef.current };
        toDispatch = { ...action, payload };
        dbOps = () => NoticesAPI.create(toDbNotice(payload));
        break;
      }
      case "UPDATE_NOTICE":
        dbOps = () => NoticesAPI.update(action.payload.id, toDbNoticePatch(action.payload));
        break;
      case "DELETE_NOTICE":
        dbOps = () => NoticesAPI.remove(action.payload);
        break;
      case "TOGGLE_PIN_NOTICE": {
        const prev = state.notices.find(n => n.id === action.payload);
        const pinned = !(prev?.pinned);
        dbOps = () => NoticesAPI.togglePin(action.payload, pinned);
        break;
      }
      default:
        break;
    }

    rawDispatch(toDispatch);
    if (dbOps) {
      Promise.resolve()
        .then(dbOps)
        .then((res) => {
          const err = Array.isArray(res) ? res.find(r => r?.error)?.error : res?.error;
          if (err) {
            console.error(`[VoyageDesk] sync ${action.type}`, err);
            rawDispatch({
              type: "SHOW_TOAST",
              payload: {
                type: "error",
                message: `Salvataggio fallito: ${err.message || "errore sconosciuto"}`,
              },
            });
          }
        })
        .catch((e) => {
          console.error(`[VoyageDesk] sync ${action.type}`, e);
          rawDispatch({
            type: "SHOW_TOAST",
            payload: {
              type: "error",
              message: `Salvataggio fallito: ${e?.message || "errore di rete"}`,
            },
          });
        });
    }
  }, [useSupabase, state.tasks, state.notices]);

  // Step J: navigazione da notifica → TaskSlideOver
  const openTaskById = useCallback((taskId) => {
    if (!taskId) return;
    const t = (state.tasks || []).find(x => x.id === taskId && !x.deletedAt);
    if (t) dispatch({ type: "SET_SELECTED_TASK", payload: t });
  }, [state.tasks, dispatch]);

  const markAllNotificationsRead = useCallback(() => {
    if (!useSupabase) return;
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    NotificationsAPI.markAllRead().then(r => {
      if (r?.error) {
        console.error("[notifications] markAllRead", r.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Notifiche: aggiornamento fallito` } });
      }
    });
  }, [useSupabase]);

  // Presence (Step H): heartbeat + subscribe a users
  // Mappa { userId -> rowDB } (per leggere last_seen_at e status).
  const [presenceMap, setPresenceMap] = useState({});
  useEffect(() => {
    if (!useSupabase) return;
    const myId = initialCurrentUserId;
    let cancelled = false;
    let hbTimer = null;

    // Snapshot iniziale di tutti gli utenti
    const reload = () => {
      // Non passare per UsersAPI.list (filtra active=true): vogliamo tutti
      // gli utenti del team. initialTeam è già lo snapshot completo; uso quello
      // più aggiornamenti via realtime.
      const map = {};
      for (const u of initialTeam || []) map[u.id] = u;
      setPresenceMap(prev => ({ ...map, ...prev }));
    };
    reload();

    const beat = (status = 'online') => {
      if (!myId) return;
      UsersAPI.setPresence(myId, status).then(r => {
        if (r?.error) console.warn("[presence] setPresence", r.error);
        // Aggiorno anche localmente per immediatezza
        setPresenceMap(prev => ({
          ...prev,
          [myId]: { ...(prev[myId] || {}), status, last_seen_at: new Date().toISOString() },
        }));
      });
    };
    beat('online');
    hbTimer = setInterval(() => beat('online'), 45 * 1000);

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') beat('away');
      else beat('online');
    };
    const onBeforeUnload = () => beat('offline');
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('beforeunload', onBeforeUnload);

    // Realtime: aggiorna presenceMap quando un altro utente cambia status
    const unsub = subscribeToTable("users", (payload) => {
      const row = payload?.new || payload?.record;
      if (!row || !row.id) return;
      setPresenceMap(prev => ({ ...prev, [row.id]: { ...(prev[row.id] || {}), ...row } }));
    });

    // Tick di re-render: ogni 30s ricomputo presenza per ageing
    const tick = setInterval(() => {
      if (cancelled) return;
      setPresenceMap(prev => ({ ...prev })); // shallow rerender
    }, 30 * 1000);

    return () => {
      cancelled = true;
      clearInterval(hbTimer);
      clearInterval(tick);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('beforeunload', onBeforeUnload);
      unsub?.();
      // Best-effort: segnala offline
      if (myId) UsersAPI.setPresence(myId, 'offline').then(() => {});
    };
  }, [useSupabase, initialCurrentUserId, initialTeam]);

  // Idratazione chat (conversations + messages) + realtime.
  useEffect(() => {
    if (!useSupabase) { setChatLoading(false); return; }
    let cancelled = false;
    // Generation counter: durante il primo reload può arrivare un evento
    // realtime che fa partire un secondo reload. Senza guardia, l'ordine di
    // completamento delle due fetch non è garantito → un load più vecchio
    // sovrascrive uno più nuovo (caveat #21, finding #2).
    let loadGen = 0;

    const reload = async () => {
      const my = ++loadGen;
      const [convsRes, msgsRes] = await Promise.all([
        ConversationsAPI.listMine(),
        MessagesAPI.listAll(),
      ]);
      if (cancelled || my !== loadGen) return;
      if (convsRes.error) {
        console.error("[chat] convs.list", convsRes.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Chat: caricamento conversazioni fallito: ${convsRes.error.message || ""}` } });
      }
      if (msgsRes.error) {
        console.error("[chat] msgs.list", msgsRes.error);
        rawDispatch({ type: "SHOW_TOAST", payload: { type: "error", message: `Chat: caricamento messaggi fallito: ${msgsRes.error.message || ""}` } });
      }
      const convs = (convsRes.data || []).map(fromDbConversation);
      const msgsByConv = {};
      for (const r of msgsRes.data || []) {
        const m = fromDbMessage(r);
        (msgsByConv[m.conversation_id] ||= []).push(m);
      }
      setConversationsRaw(convs);
      setMessagesRaw(msgsByConv);
      setChatLoading(false);
    };

    reload();

    let timer = null;
    const debouncedReload = () => {
      clearTimeout(timer);
      timer = setTimeout(reload, 200);
    };
    const unsubConvs = subscribeToTable("conversations", debouncedReload);
    const unsubMsgs = subscribeToTable("messages", debouncedReload);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      unsubConvs?.();
      unsubMsgs?.();
    };
  }, [useSupabase]);

  const [showFABModal, setShowFABModal] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null); // { toUser, taskLink } per aprire chat preconfezionata
  const [showBulkModal, setShowBulkModal] = useState(false);
  // In modalità Supabase partiamo da stato vuoto e idratiamo dal DB.
  // Senza login i mock restano per smoke-test rapido.
  const [conversations, setConversationsRaw] = useState(
    useSupabase ? [] : initialConversations
  );
  const [messages, setMessagesRaw] = useState(
    useSupabase ? {} : initialMessages
  );

  // Wrapper di setConversations: diff vs prev e persiste create/update(pinned).
  const setConversations = useCallback((updater) => {
    setConversationsRaw(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      if (!useSupabase) return nextRaw;
      const prevById = new Map(prev.map(c => [c.id, c]));
      return nextRaw.map(c => {
        if (!prevById.has(c.id)) {
          const id = isUuid(c.id) ? c.id : newId();
          const normalized = { ...c, id };
          ConversationsAPI.create(toDbConversation(normalized))
            .then(r => { if (r?.error) { console.error('[chat] conv.create', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: creazione conversazione fallita: ${r.error.message || ''}` } }); } });
          return normalized;
        }
        const prevC = prevById.get(c.id);
        if (prevC.pinned !== c.pinned || prevC.name !== c.name || prevC.icon !== c.icon) {
          ConversationsAPI.update(c.id, {
            pinned: !!c.pinned, name: c.name ?? null, icon: c.icon ?? null,
          }).then(r => { if (r?.error) { console.error('[chat] conv.update', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento conversazione fallito: ${r.error.message || ''}` } }); } });
        }
        return c;
      });
    });
  }, [useSupabase]);

  // Wrapper di setMessages: diff per conv e persiste insert + reactions + readBy.
  const setMessages = useCallback((updater) => {
    setMessagesRaw(prev => {
      const nextRaw = typeof updater === 'function' ? updater(prev) : updater;
      if (!useSupabase) return nextRaw;

      const eqArr = (a, b) => {
        if (a === b) return true;
        if (!Array.isArray(a) || !Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      const eqReactions = (a, b) => {
        const ka = Object.keys(a || {}), kb = Object.keys(b || {});
        if (ka.length !== kb.length) return false;
        for (const k of ka) if (!eqArr(a[k], b[k])) return false;
        return true;
      };

      const next = {};
      for (const convId of Object.keys(nextRaw)) {
        const prevArr = prev[convId] || [];
        const nextArr = nextRaw[convId] || [];
        const prevById = new Map(prevArr.map(m => [m.id, m]));
        next[convId] = nextArr.map(m => {
          if (!prevById.has(m.id)) {
            const id = isUuid(m.id) ? m.id : newId();
            const normalized = { ...m, id };
            MessagesAPI.send(toDbMessage(normalized, convId))
              .then(r => { if (r?.error) { console.error('[chat] msg.send', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: invio messaggio fallito: ${r.error.message || ''}` } }); } });
            return normalized;
          }
          const prevM = prevById.get(m.id);
          if (!eqReactions(prevM.reactions, m.reactions)) {
            MessagesAPI.setReactions(m.id, m.reactions || {})
              .then(r => { if (r?.error) { console.error('[chat] msg.reactions', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento reazione fallito: ${r.error.message || ''}` } }); } });
          }
          if (!eqArr(prevM.readBy, m.readBy)) {
            MessagesAPI.markRead(m.id, m.readBy || [])
              .then(r => { if (r?.error) { console.error('[chat] msg.readBy', r.error); rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } }); } });
          }
          return m;
        });
      }
      return next;
    });
  }, [useSupabase]);

  // Step Q.4: markRead bulk all'apertura conversazione.
  // Bypassa il wrapper setMessages (che farebbe N UPDATE) e fa:
  // 1) update locale ottimistico via setMessagesRaw, 2) una sola RPC che
  // marca letti tutti i messaggi non letti della conv. origin_client è
  // tagged così l'eco realtime viene filtrata sul nostro client.
  const markConversationRead = useCallback((convId) => {
    const uid = currentUserIdRef.current;
    if (!convId || !uid) return;
    setMessagesRaw(prev => {
      const list = prev[convId] || [];
      let changed = false;
      const next = list.map(m => {
        if (m.sender !== uid && !m.readBy?.includes(uid)) {
          changed = true;
          return { ...m, readBy: [...(m.readBy || []), uid] };
        }
        return m;
      });
      return changed ? { ...prev, [convId]: next } : prev;
    });
    if (!useSupabase || !isUuid(convId)) return;
    MessagesAPI.markReadBulk(convId, uid).then(r => {
      if (r?.error) {
        console.error('[chat] markReadBulk', r.error);
        rawDispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Chat: aggiornamento "letto" fallito: ${r.error.message || ''}` } });
      }
    });
  }, [useSupabase]);

  // Conta non letti totali per badge topbar (dallo stato vivo della chat)
  const unreadChat = conversations.reduce(
    (acc, c) => acc + getUnreadCount(messages, c.id, state.currentUserId),
    0
  );

  // Apre la chat verso un utente specifico, opzionalmente con link a task
  const openChatTo = (intent) => {
    if (intent && intent.toUser) {
      setChatIntent(intent);
    }
    setShowChat(true);
  };

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.querySelector("input[placeholder*='Cerca']")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Quando l'utente cambia, se la view corrente non è permessa il reducer la riporta a dashboard.
  // Inoltre chiudo eventuali pannelli aperti.
  useEffect(() => {
    setShowChat(false);
    setShowBulkModal(false);
    setShowFABModal(false);
  }, [state.currentUserId]);

  const renderView = () => {
    switch (state.activeView) {
      case "dashboard": return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
      case "calendar": return <CalendarPlanner state={state} dispatch={dispatch} />;
      case "team": return <Team state={state} dispatch={dispatch} />;
      case "trash": return <Trash state={state} dispatch={dispatch} />;
      case "admin": return <AdminView state={state} dispatch={dispatch} />;
      default: return <Dashboard state={state} dispatch={dispatch} onOpenChat={openChatTo} />;
    }
  };

  // Dati condivisi esposti via AppContext: i componenti li leggono con gli hook
  // useTeam/useCategories/useCurrentUserId invece che da globali mutabili.
  const appData = useMemo(
    () => ({ team: state.team, categories: state.categories, currentUserId: state.currentUserId }),
    [state.team, state.categories, state.currentUserId]
  );

  return (
    <AppContext.Provider value={appData}>
      <FontLoader />
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "var(--surface)", fontFamily: "'DM Sans', sans-serif" }}>
        <Topbar
          state={state}
          dispatch={dispatch}
          onOpenChat={() => { setChatIntent(null); setShowChat(true); }}
          unreadChat={unreadChat}
          notifications={notifications}
          onMarkRead={markNotificationRead}
          onMarkAllRead={markAllNotificationsRead}
          onOpenTask={openTaskById}
        />
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <Sidebar state={state} dispatch={dispatch} />
          <main className="vd-main-scroll" style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            {renderView()}
          </main>
        </div>

        {/* Bottom nav mobile/tablet */}
        <BottomNav state={state} dispatch={dispatch} />

        {/* Slide-over */}
        {state.selectedTask && <TaskSlideOver task={state.selectedTask} dispatch={dispatch} />}

        {/* Chat Panel */}
        <ChatPanel
          open={showChat}
          onClose={() => { setShowChat(false); setChatIntent(null); }}
          conversations={conversations}
          setConversations={setConversations}
          messages={messages}
          setMessages={setMessages}
          markConversationRead={markConversationRead}
          intent={chatIntent}
          tasks={state.tasks}
          currentUserId={state.currentUserId}
          dispatch={dispatch}
          presenceMap={presenceMap}
          loading={chatLoading}
        />

        {/* FAB principale (singolo task) + FAB secondario (bulk) */}
        {state.activeView !== "trash" && state.activeView !== "admin" && (
          <>
            <button
              onClick={() => setShowBulkModal(true)}
              title="Crea più task / Import / Template"
              style={{
                position: "fixed", bottom: isDesktop ? 32 : 84, right: isDesktop ? 92 : 76, width: 44, height: 44,
                borderRadius: "50%", background: "var(--navy)", border: "none",
                boxShadow: "0 6px 20px rgba(15,32,68,0.35)", cursor: "pointer",
                fontSize: 17, display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", zIndex: 400,
                transition: "transform 0.2s ease, box-shadow 0.2s ease",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
            >📑</button>
            <FAB onClick={() => setShowFABModal(true)} />
          </>
        )}
        {showFABModal && <QuickAddTask onAdd={t => dispatch({ type: "ADD_TASK", payload: t })} onClose={() => setShowFABModal(false)} />}

        {/* Bulk Task Creator */}
        {showBulkModal && (
          <BulkTaskCreator
            existingTasks={getActiveTasks(state.tasks)}
            onCreate={(tasks) => dispatch({ type: "ADD_TASKS_BULK", payload: tasks })}
            onClose={() => setShowBulkModal(false)}
          />
        )}

        {/* Toast */}
        <Toast toast={state.toast} dispatch={dispatch} />
      </div>
    </AppContext.Provider>
  );
}
// Step J — touched
