// ─── TEAM ────────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { STATUSES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, isActiveTask } from "../../lib/taskUtils.js";
import { CATEGORIES, getMember, getAssignableTeam, canViewTask, isJuniorAgent, TEAM } from "../../state/appGlobals.js";

// Ruoli distinti presenti nel team (per i chip filtro)
const ROLE_FILTERS = ["Tutti", "Manager", "Senior Agent", "Junior Agent", "Driver", "Admin"];

export const Team = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [selectedMember, setSelectedMember] = useState(null);
  const [filterStatus, setFilterStatus] = useState("");
  const [roleFilter, setRoleFilter] = useState("Tutti"); // v2.8 Round 7
  const uid = state.currentUserId;

  const memberTasks = (memberId) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.assignees?.includes(memberId));

  const filtered = selectedMember
    ? memberTasks(selectedMember).filter(t => !filterStatus || t.status === filterStatus)
    : [];

  const roleColors = { Manager: "#0F2044", "Senior Agent": "#2D7A4F", "Junior Agent": "#C8832A", Driver: "#7B4F9E", Admin: "#C0392B" };

  const allActive = getAssignableTeam();
  const filteredMembers = roleFilter === "Tutti"
    ? allActive
    : allActive.filter(m => m.role === roleFilter);

  // Membri in attesa di approvazione
  const pendingMembers = TEAM.filter(m => m.pending);

  // Ruoli effettivamente presenti (per non mostrare filtri vuoti)
  const presentRoles = new Set(allActive.map(m => m.role));
  const activeRoleFilters = ROLE_FILTERS.filter(r => r === "Tutti" || presentRoles.has(r));

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700 }}>Team & Assegnazioni</div>
        {pendingMembers.length > 0 && (
          <span style={{ fontSize: 12, background: "#FFF3CD", color: "#856404", padding: "3px 10px", borderRadius: 99, fontWeight: 600 }}>
            {pendingMembers.length} in attesa di approvazione
          </span>
        )}
      </div>

      {/* Filtro per ruolo (v2.8) */}
      {activeRoleFilters.length > 2 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
          {activeRoleFilters.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => { setRoleFilter(r); setSelectedMember(null); }}
              style={{
                padding: "5px 12px", borderRadius: 999, cursor: "pointer",
                fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                border: `1px solid ${roleFilter === r ? (roleColors[r] || "var(--navy)") : "var(--border)"}`,
                background: roleFilter === r ? ((roleColors[r] || "var(--navy)") + "18") : "var(--card)",
                color: roleFilter === r ? (roleColors[r] || "var(--navy)") : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >{r}{r !== "Tutti" && ` (${allActive.filter(m => m.role === r).length})`}</button>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 16, marginBottom: 28 }}>
        {filteredMembers.map(m => {
          const tasks = memberTasks(m.id);
          const active = tasks.filter(t => t.status !== "done");
          const done = tasks.filter(t => t.status === "done");
          const pct = Math.min(100, Math.round((active.length / m.capacity) * 100));
          const barColor = pct > 85 ? "var(--danger)" : pct > 65 ? "var(--warning)" : "var(--success)";
          const isSelected = selectedMember === m.id;
          const overloaded = pct > 85;

          return (
            <div key={m.id} className="hover-lift" onClick={() => setSelectedMember(isSelected ? null : m.id)} style={{
              background: "var(--card)", borderRadius: 12, padding: "20px 16px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: `2px solid ${isSelected ? m.color : overloaded ? "rgba(192,57,43,0.3)" : "var(--border)"}`,
              cursor: "pointer", textAlign: "center", transition: "all 0.2s", position: "relative",
            }}>
              {overloaded && (
                <div style={{
                  position: "absolute", top: 8, right: 8,
                  fontSize: 11, fontWeight: 700, color: "var(--danger)",
                  background: "rgba(192,57,43,0.08)", padding: "2px 7px", borderRadius: 99,
                }} title="Sovraccarico di lavoro">⚠ Sovraccarico</div>
              )}
              <div style={{
                width: 56, height: 56, borderRadius: "50%", background: m.color,
                fontSize: 18, fontWeight: 700, display: "flex", alignItems: "center",
                justifyContent: "center", color: "#fff", margin: "0 auto 10px"
              }}>{m.avatar}</div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{m.name}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 5, marginTop: 4 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 99,
                  background: roleColors[m.role] + "15", color: roleColors[m.role],
                }}>{m.role}</span>
                {isJuniorAgent(m.id) && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "#FFF3CD", color: "#856404" }}>JR</span>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 12, marginBottom: 8 }}>
                <div style={{ background: "var(--surface2)", borderRadius: 8, padding: "6px 4px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)" }}>{active.length}</div>
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

      {/* Sezione "In attesa" (v2.8 Round 7) */}
      {pendingMembers.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-muted)", letterSpacing: 1, marginBottom: 12, textTransform: "uppercase" }}>
            In attesa di approvazione ({pendingMembers.length})
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12 }}>
            {pendingMembers.map(m => (
              <div key={m.id} style={{
                background: "var(--card)", borderRadius: 12, padding: "16px",
                border: "1px dashed var(--border)", textAlign: "center", opacity: 0.75,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", background: m.color + "44",
                  color: m.color, fontSize: 14, fontWeight: 700, display: "flex",
                  alignItems: "center", justifyContent: "center", margin: "0 auto 8px",
                }}>{m.avatar}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>{m.role}</div>
                <div style={{ fontSize: 11, color: "var(--warning)", fontWeight: 600, marginTop: 6 }}>⏳ In attesa</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedMember && (() => {
        const m = getMember(selectedMember);
        if (!m) return null;
        return (
          <div className="slide-up" style={{ background: "var(--card)", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
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
                  <span style={{ fontSize: 18 }}>{CATEGORIES[t.category]?.icon}</span>
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
