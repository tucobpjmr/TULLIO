// src/components/admin/tabs/AdminTeamTab.jsx
// Gestione del team: invito, approvazione dei pending, ruoli, attivazione.
import { useState, useEffect } from "react";
import { useViewport } from "../../Viewport.jsx";
import { sectionH, fieldStyle, btnPrimary, btnGold, btnGhost, btnDanger, btnWarning } from "../adminStyles.js";
import {
  DB_ROLES, ROLE_LABELS, SENIORITY_LEVELS, SENIORITY_LABELS, roleLabel, toSeniority,
} from "../../../lib/taskConstants.js";
import { Users } from "../../../lib/api.js";
import { AddTeamMemberModal } from "../../modals/AddTeamMemberModal.jsx";
import { BulkInviteModal } from "../../modals/BulkInviteModal.jsx";
import { ContactActions } from "../../ui/ContactActions.jsx";

// ─── ADMIN TAB: TEAM ───────────────────────────────────────────────────────
export const AdminTeamTab = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  // resendMap: { [memberId]: 'loading' | 'ok' | 'err' | string(errMsg) }
  const [resendMap, setResendMap] = useState({});
  // Rubrica contatti: { [userId]: { email, phone } }. Caricata una volta sola;
  // l'admin ha accesso RLS a tutte le righe di user_contacts.
  const [contactsMap, setContactsMap] = useState({});

  useEffect(() => {
    let alive = true;
    Users.listContacts().then(({ data }) => {
      if (!alive || !data) return;
      const map = {};
      for (const c of data) map[c.user_id] = { email: c.email, phone: c.phone };
      setContactsMap(map);
    });
    return () => { alive = false; };
  }, []);

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

  // seniority normalizzata già nel draft: il <select> qui sotto è controllato e
  // con un valore undefined React lo renderebbe non controllato.
  const startEdit = (m) => { setEditingId(m.id); setDraft({ ...m, seniority: toSeniority(m) }); };
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
        padding: 16, display: "flex",
        flexDirection: isMobile ? "column" : "row",
        alignItems: isMobile ? "stretch" : "center",
        gap: isMobile ? 10 : 14,
        opacity: opts.dim ? 0.65 : 1,
      }}>
        {/* Avatar + Info — sempre su una riga */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flex: 1, minWidth: 0 }}>
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
              <div className="vd-grid-collapse" style={{ display: "grid", gridTemplateColumns: draft.role === "agent" ? "1fr 1fr 1fr 100px" : "1fr 1fr 100px", gap: 8 }}>
                <input value={draft.name} onChange={e => setDraft({...draft, name: e.target.value})}
                  placeholder="Nome" style={fieldStyle} />
                {/* I valori sono quelli dell'enum del database (DB_ROLES), non
                    le etichette: prima il select scriveva "Senior Agent"/"Admin"
                    in una colonna che gli helper RLS confrontano con 'agent' e
                    'admin'. Le label restano solo presentazione. */}
                <select value={draft.role} onChange={e => setDraft({...draft, role: e.target.value})}
                  aria-label="Ruolo" style={fieldStyle}>
                  {DB_ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                {draft.role === "agent" && (
                  <select value={draft.seniority} onChange={e => setDraft({...draft, seniority: e.target.value})}
                    aria-label="Livello" style={fieldStyle}>
                    {SENIORITY_LEVELS.map(s => <option key={s} value={s}>{SENIORITY_LABELS[s]}</option>)}
                  </select>
                )}
                <input type="color" value={draft.color} onChange={e => setDraft({...draft, color: e.target.value})}
                  style={{ ...fieldStyle, padding: 2, height: 32 }} />
              </div>
            ) : (
              <>
                <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{m.name}</div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                  {roleLabel(m)} • {count} task assegnati
                  {seenLabel && <span> • ultimo accesso {seenLabel}</span>}
                </div>
                {(() => {
                  const c = contactsMap[m.id];
                  if (!c || (!c.email && !c.phone)) return null;
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4, fontSize: 12 }}>
                      {c.email && (
                        <a href={`mailto:${c.email}`} style={{ color: "var(--navy)", textDecoration: "none" }}>✉️ {c.email}</a>
                      )}
                      {c.phone && (
                        <ContactActions phone={c.phone} />
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
        {/* Bottoni — a destra su desktop, allineati a destra in seconda riga su mobile */}
        <div style={{ display: "flex", gap: 6, ...(isMobile ? { justifyContent: "flex-end" } : {}) }}>
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
