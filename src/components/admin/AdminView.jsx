// ─── ADMIN VIEW ──────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f). AdminView + i 5 tab (Team/IO/Stats/
// Categories/Log, module-local). Esporta solo AdminView.
import { useState, useRef } from "react";
import { STATUSES, STATUS_LABELS, STATUS_COLORS } from "../../lib/taskConstants.js";
import { isOverdue } from "../../lib/taskUtils.js";
import { loadXLSX } from "../../lib/xlsx.js";
import { getMember } from "../../state/appGlobals.js";
import { Users } from "../../lib/api.js";
import { AddTeamMemberModal } from "../modals/AddTeamMemberModal.jsx";
import { BulkInviteModal } from "../modals/BulkInviteModal.jsx";
import { AddCategoryModal } from "../modals/AddCategoryModal.jsx";
import {
  sectionH, cardStyle, cardH, cardP, fieldStyle,
  btnPrimary, btnGold, btnGhost, btnDanger, btnWarning,
} from "./adminStyles.js";

// Helper export condivisi dai tab Import/Export e Log (module-local).
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

export const AdminView = ({ state, dispatch }) => {
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
        <h1 className="playfair" style={{ fontSize: 28, color: "var(--heading)", margin: 0, fontWeight: 700 }}>
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
        {tab === "stats" && <AdminStatsTab state={state} dispatch={dispatch} />}
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
  const [showBulk, setShowBulk] = useState(false);
  // resendMap: { [memberId]: 'loading' | 'ok' | 'err' | string(errMsg) }
  const [resendMap, setResendMap] = useState({});

  const resendInvite = async (m) => {
    setResendMap(prev => ({ ...prev, [m.id]: 'loading' }));
    const { data: contacts, error: cErr } = await Users.getContacts(m.id);
    const email = contacts?.email;
    if (cErr || !email) {
      setResendMap(prev => ({ ...prev, [m.id]: 'Email non trovata' }));
      setTimeout(() => setResendMap(prev => { const n = {...prev}; delete n[m.id]; return n; }), 3000);
      return;
    }
    const { error } = await Users.invite({ email, name: m.name, role: m.role, capacity: m.capacity, color: m.color, resend: true });
    if (error) {
      setResendMap(prev => ({ ...prev, [m.id]: error.message || 'Errore' }));
    } else {
      setResendMap(prev => ({ ...prev, [m.id]: 'ok' }));
    }
    setTimeout(() => setResendMap(prev => { const n = {...prev}; delete n[m.id]; return n; }), 3500);
  };

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

  const PRESENCE_COLOR = { online: "#2D7A4F", busy: "#C8832A", offline: "#9999AA" };
  const fmtLastSeen = (ts) => {
    if (!ts) return null;
    const ms = Date.now() - new Date(ts).getTime();
    const min = Math.round(ms / 60000);
    if (min < 2) return "ora";
    if (min < 60) return `${min} min fa`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h}h fa`;
    return `${Math.round(h / 24)}g fa`;
  };

  const card = (m, opts = {}) => {
    const isEditing = editingId === m.id;
    const count = taskCount(m.id);
    const dotColor = PRESENCE_COLOR[m.status] || PRESENCE_COLOR.offline;
    const seenLabel = fmtLastSeen(m.last_seen_at);
    return (
      <div key={m.id} style={{
        background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
        padding: 16, display: "flex", alignItems: "center", gap: 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div style={{
            width: 48, height: 48, borderRadius: "50%", background: m.color,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 700, fontSize: 16,
          }}>{m.avatar}</div>
          {m.status && (
            <div style={{
              position: "absolute", bottom: 1, right: 1,
              width: 11, height: 11, borderRadius: "50%",
              background: dotColor, border: "2px solid var(--card)",
            }} title={m.status === "online" ? "Online" : m.status === "busy" ? "Occupato" : "Offline"} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {isEditing ? (
            <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 100px", gap: 8 }}>
              <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}
                placeholder="Nome" style={fieldStyle} />
              <input value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                placeholder="Ruolo" style={fieldStyle} />
              <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                style={{ ...fieldStyle, padding: 2, height: 32 }} />
            </div>
          ) : (
            <>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                {m.role} • {count} task assegnati
                {seenLabel && <span> • ultimo accesso {seenLabel}</span>}
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
              {opts.canApprove && m.invited_by && (() => {
                const rs = resendMap[m.id];
                return (
                  <button
                    onClick={() => { if (!rs) resendInvite(m); }}
                    disabled={rs === 'loading'}
                    style={{
                      ...btnGhost,
                      fontSize: 12,
                      color: rs === 'ok' ? "var(--success)" : rs && rs !== 'loading' ? "var(--danger)" : "var(--navy)",
                      opacity: rs === 'loading' ? 0.6 : 1,
                    }}
                    title="Reinvia email di invito"
                  >
                    {rs === 'loading' ? '⏳' : rs === 'ok' ? '✅ Inviata' : rs && rs !== 'loading' ? `❌ ${rs}` : '📧 Reinvia'}
                  </button>
                );
              })()}
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
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setShowBulk(true)} style={btnGhost} title="Invita più utenti in un colpo solo">
            ✉️ Invito multiplo
          </button>
          <button onClick={() => setShowAdd(true)} style={btnPrimary}>+ Aggiungi agente</button>
        </div>
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
      {showBulk && (
        <BulkInviteModal
          onClose={() => setShowBulk(false)}
          onInvited={() => dispatch({ type: "SHOW_TOAST", payload: { type: "success", message: "Inviti inviati. I nuovi utenti appariranno nella lista dopo aver accettato." } })}
        />
      )}
    </div>
  );
};

// AddTeamMemberModal → src/components/modals/AddTeamMemberModal.jsx (Step P Phase 2f)

// ─── ADMIN TAB: IMPORT / EXPORT ────────────────────────────────────────────
const AdminIOTab = ({ state, dispatch }) => {
  const [includeTrashed, setIncludeTrashed] = useState(false);
  const fileInputRef = useRef(null);

  const tasksToExport = () => includeTrashed ? state.tasks : state.tasks.filter(t => !t.deletedAt);

  const exportCSV = () => {
    const headers = ["ID","Titolo","Categoria","Priorità","Status","Cliente","Scadenza","Assegnati","Descrizione","Cestinato"];
    const rows = tasksToExport().map(t => [
      t.id, t.title, t.category, t.priority, t.status, t.client || "",
      t.dueDate ? t.dueDate.slice(0,10) : "",
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
      Assegnati: (t.assignees || []).map(a => getMember(a)?.name || a).join(", "),
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
          💡 Colonne supportate: <code>Titolo, Categoria, Priorità, Cliente, Scadenza, Assegnato, Descrizione</code><br/>
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
const AdminStatsTab = ({ state, dispatch }) => {
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
    return { m, count };
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
          {byMember.map(({ m, count }) => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: "50%", background: m.color,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#fff", fontWeight: 700, fontSize: 11, flexShrink: 0,
              }}>{m.avatar}</div>
              <div style={{ flex: 1, fontSize: 13 }}>{m.name}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                {count} task attivi
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
                background: "var(--card)",
              }}>{c.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{c.count} task</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Template messaggi chat (v2.8) */}
      <MessageTemplatesSection state={state} dispatch={dispatch} />
    </div>
  );
};

// ─── TEMPLATE MESSAGGI CHAT (v2.8) ─────────────────────────────────────────
const MessageTemplatesSection = ({ state, dispatch }) => {
  const [editingId, setEditingId] = useState(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftText, setDraftText] = useState("");
  const [creating, setCreating] = useState(false);

  const templates = state.messageTemplates || [];

  const startEdit = (t) => {
    setEditingId(t.id);
    setDraftLabel(t.label);
    setDraftText(t.text);
    setCreating(false);
  };
  const cancel = () => { setEditingId(null); setCreating(false); setDraftLabel(""); setDraftText(""); };
  const save = () => {
    if (!draftLabel.trim() || !draftText.trim()) return;
    if (creating) dispatch({ type: "ADD_MESSAGE_TEMPLATE", payload: { label: draftLabel, text: draftText } });
    else dispatch({ type: "UPDATE_MESSAGE_TEMPLATE", payload: { id: editingId, label: draftLabel.trim(), text: draftText.trim() } });
    cancel();
  };

  return (
    <div style={cardStyle}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ ...cardH, margin: 0 }}>💬 Template messaggi chat</h3>
        {!creating && !editingId && (
          <button
            onClick={() => { setCreating(true); setEditingId(null); setDraftLabel(""); setDraftText(""); }}
            style={{
              padding: "6px 12px", borderRadius: 6, border: "none",
              background: "var(--navy)", color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >+ Nuovo</button>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, marginBottom: 12 }}>
        Frasi ricorrenti riutilizzabili dal composer chat (pulsante 📋). Solo Admin può gestire.
      </p>

      {(creating || editingId) && (
        <div style={{
          padding: 12, background: "var(--surface2)", borderRadius: 8, marginBottom: 12,
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <input
            value={draftLabel}
            onChange={e => setDraftLabel(e.target.value)}
            placeholder="Etichetta (es. Sollecito acconto)"
            maxLength={40}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none" }}
          />
          <textarea
            value={draftText}
            onChange={e => setDraftText(e.target.value)}
            placeholder="Testo completo del messaggio…"
            rows={3}
            maxLength={500}
            style={{ padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none", resize: "vertical" }}
          />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={cancel} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Annulla</button>
            <button onClick={save} disabled={!draftLabel.trim() || !draftText.trim()} style={{
              padding: "6px 14px", borderRadius: 6, border: "none",
              background: draftLabel.trim() && draftText.trim() ? "var(--navy)" : "var(--text-light)",
              color: "#fff", fontSize: 12, fontWeight: 700,
              cursor: draftLabel.trim() && draftText.trim() ? "pointer" : "not-allowed",
              fontFamily: "inherit",
            }}>{creating ? "Crea" : "Salva"}</button>
          </div>
        </div>
      )}

      {templates.length === 0 ? (
        <div style={{ padding: "14px 0", color: "var(--text-muted)", fontSize: 13, fontStyle: "italic", textAlign: "center" }}>
          Nessun template. Crea il primo per velocizzare le risposte ricorrenti.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {templates.map(t => (
            <div key={t.id} style={{
              padding: 12, background: "var(--surface2)", borderRadius: 8,
              display: "flex", alignItems: "flex-start", gap: 10,
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--heading)", marginBottom: 3 }}>{t.label}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{t.text}</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <button onClick={() => startEdit(t)} title="Modifica" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12 }}>✏️</button>
                <button
                  onClick={() => { if (window.confirm(`Rimuovere il template "${t.label}"?`)) dispatch({ type: "DELETE_MESSAGE_TEMPLATE", payload: t.id }); }}
                  title="Elimina"
                  style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, width: 28, height: 28, cursor: "pointer", fontSize: 12, color: "var(--danger)" }}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
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
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
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

// AddCategoryModal → src/components/modals/AddCategoryModal.jsx (Step P Phase 2f)

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

  const exportLogCSV = () => {
    const headers = ["Data/ora", "Tipo", "Descrizione"];
    const rows = list.map(l => [
      new Date(l.time).toLocaleString("it-IT"),
      l.type,
      (l.text || "").replace(/\n/g, " "),
    ]);
    const csv = [headers, ...rows].map(r => r.map(escapeCSV).join(",")).join("\n");
    downloadFile(
      new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }),
      `voyagedesk-log-${filter}-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  };

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
              background: filter === f.id ? "var(--navy)" : "var(--card)",
              color: filter === f.id ? "#fff" : "var(--text)",
              fontFamily: "inherit",
            }}>{f.label}</button>
          ))}
        </div>
        {state.activityLog.length > 0 && (
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={exportLogCSV} disabled={list.length === 0} style={{
              ...btnGhost, opacity: list.length === 0 ? 0.5 : 1,
              cursor: list.length === 0 ? "not-allowed" : "pointer",
            }}>📄 Esporta CSV</button>
            <button onClick={() => {
              if (window.confirm("Svuotare il log attività? Non è reversibile.")) {
                dispatch({ type: "CLEAR_ACTIVITY_LOG" });
              }
            }} style={btnDanger}>🔥 Svuota log</button>
          </div>
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
