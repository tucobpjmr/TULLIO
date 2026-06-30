// ─── ARCHIVIO ──────────────────────────────────────────────────────────────
// Vista che raccoglie le task completate (status "done", non cestinate).
// Il sistema convoglia qui le task chiuse: spariscono dalle code attive della
// Dashboard e restano consultabili/riapribili in questa sezione.
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { formatDate, getArchivedTasks } from "../../lib/taskUtils.js";
import { CATEGORIES, getVisibleTasks, canEditTask } from "../../state/appGlobals.js";

const PERIOD_OPTIONS = [
  { key: "all",       label: "Sempre" },
  { key: "week",      label: "Ultimi 7 gg" },
  { key: "month",     label: "Questo mese" },
  { key: "lastMonth", label: "Mese scorso" },
];

// Filtra le task per data di completamento (completedAt). Le task completate
// prima dell'introduzione di completed_at (completedAt null) restano fuori dai
// filtri temporali ma compaiono in "Sempre".
const filterByPeriod = (tasks, period) => {
  if (period === "all") return tasks;
  const now = new Date();
  return tasks.filter(t => {
    if (!t.completedAt) return false;
    const d = new Date(t.completedAt);
    if (period === "week") {
      const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }
    if (period === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === "lastMonth") {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end   = new Date(now.getFullYear(), now.getMonth(), 1);
      return d >= start && d < end;
    }
    return true;
  });
};

export const Archive = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const me = state.currentUserId;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [period, setPeriod] = useState("all");

  // Solo le task completate che l'utente può vedere (rispetta i permessi).
  // Ordinate per data di completamento (completedAt) decrescente; fallback su
  // dueDate per task completate prima dell'introduzione di completed_at.
  const archived = getVisibleTasks(getArchivedTasks(state.tasks), me)
    .sort((a, b) => new Date(b.completedAt || b.dueDate || 0) - new Date(a.completedAt || a.dueDate || 0));

  const visible = filterByPeriod(archived, period).filter(t => {
    if (category !== "all" && t.category !== category) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${t.title} ${t.client || ""} ${t.praticaRef || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const hasActiveFilter = category !== "all" || query.trim() || period !== "all";
  const resetFilters = () => { setCategory("all"); setQuery(""); setPeriod("all"); };

  const handleReopen = (task) => {
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi riaprire questa task" } });
      return;
    }
    dispatch({ type: "UPDATE_TASK", payload: { id: task.id, status: "inprogress" } });
  };

  const handleTrash = (task) => {
    if (window.confirm(`Spostare "${task.title}" nel cestino?`)) {
      dispatch({ type: "DELETE_TASK", payload: task.id });
    }
  };

  // Categorie effettivamente presenti tra le task archiviate (per il filtro).
  const presentCats = Array.from(new Set(archived.map(t => t.category)));

  const pad = isMobile ? "16px" : "24px 32px";

  return (
    <div className="vd-pad" style={{ padding: pad, maxWidth: 1200, margin: "0 auto", boxSizing: "border-box" }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <div className="playfair" style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
          📦 Archivio
        </div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          {archived.length === 0
            ? "Nessuna task completata"
            : hasActiveFilter
              ? `${visible.length} di ${archived.length} task — filtrate`
              : `${archived.length} task ${archived.length === 1 ? "completata" : "completate"}. Riaprile o spostale nel cestino.`
          }
        </div>
      </div>

      {/* Filtri — solo se ci sono task */}
      {archived.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per titolo, cliente, pratica…"
            style={{
              flex: "1 1 100%", minWidth: 0, padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit",
              outline: "none", boxSizing: "border-box",
            }}
            onFocus={e => e.target.style.borderColor = "var(--gold)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <button type="button" onClick={() => setCategory("all")} style={chipStyle(category === "all")}>Tutte</button>
          {presentCats.map(k => (
            <button key={k} type="button" onClick={() => setCategory(k)} style={chipStyle(category === k)}>
              {CATEGORIES[k]?.icon} {CATEGORIES[k]?.label || k}
            </button>
          ))}
        </div>
      )}

      {/* Filtro periodo (per data di completamento) — solo se ci sono task */}
      {archived.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Completate:</span>
          {PERIOD_OPTIONS.map(opt => (
            <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)} style={chipStyle(period === opt.key)}>
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {archived.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: 12, padding: "60px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.3 }}>📦</div>
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--heading)", marginBottom: 6 }}>Archivio vuoto</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            Le task completate verranno raccolte qui. Potrai riaprirle o cestinarle.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          background: "var(--card)", borderRadius: 12, padding: "40px 20px",
          textAlign: "center", border: "1px solid var(--border)",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📭</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: "var(--heading)", marginBottom: 4 }}>
            Nessuna task per i filtri selezionati
          </div>
          <button type="button" onClick={resetFilters} style={{
            marginTop: 8, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--card)",
            color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Azzera filtri</button>
        </div>
      ) : isMobile ? (
        /* Mobile: card list — no horizontal overflow */
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map(task => (
            <div
              key={task.id}
              onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: task })}
              style={{
                background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)",
                padding: "14px 16px", cursor: "pointer",
              }}
            >
              <div style={{ fontWeight: 600, color: "var(--heading)", fontSize: 14, marginBottom: 6 }}>
                {task.title}
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <PriorityBadge priority={task.priority} />
                <CategoryChip category={task.category} />
                <span style={{ fontSize: 11, color: "var(--success)", fontWeight: 600 }}>✓ Completata</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {task.client && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{task.client}</span>
                  )}
                  {task.completedAt && (
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{formatDate(task.completedAt)}</span>
                  )}
                  {task.assignees?.length > 0 && (
                    <div style={{ display: "flex", gap: 3 }}>
                      {task.assignees.map(id => <Avatar key={id} memberId={id} size={20} />)}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button onClick={() => handleReopen(task)} style={{
                    background: "var(--navy)", color: "#fff", border: "none",
                    padding: "5px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                    fontWeight: 600, fontFamily: "inherit",
                  }}>↩ Riapri</button>
                  <button onClick={() => handleTrash(task)} style={{
                    background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
                    padding: "5px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                    fontWeight: 600, fontFamily: "inherit",
                  }}>🗑️</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Desktop: table */
        <div style={{ background: "var(--card)", borderRadius: 12, border: "1px solid var(--border)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                <th style={thStyle("left", "16px")}>TASK</th>
                <th style={thStyle("left")}>CATEGORIA</th>
                <th style={thStyle("left")}>CLIENTE</th>
                <th style={thStyle("left")}>ASSEGNATI</th>
                <th style={thStyle("left")}>COMPLETATA</th>
                <th style={thStyle("right", "16px")}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(task => (
                <tr key={task.id} style={{ borderBottom: "1px solid var(--border)", transition: "background 0.15s", cursor: "pointer" }}
                  onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: task })}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ fontWeight: 600, color: "var(--heading)", marginBottom: 2 }}>{task.title}</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: "var(--text-muted)" }}>
                      <PriorityBadge priority={task.priority} />
                      <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Completata</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px" }}><CategoryChip category={task.category} /></td>
                  <td style={{ padding: "12px 8px", color: "var(--text)" }}>
                    {task.client || <span style={{ color: "var(--text-muted)" }}>—</span>}
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      {task.assignees?.length
                        ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                        : <span style={{ fontSize: 12, color: "var(--text-muted)" }}>—</span>
                      }
                    </div>
                  </td>
                  <td style={{ padding: "12px 8px", color: "var(--text-muted)", fontSize: 12 }}>
                    {task.completedAt ? formatDate(task.completedAt) : "—"}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button onClick={() => handleReopen(task)} title="Riapri (rimetti in lavorazione)" style={{
                        background: "var(--navy)", color: "#fff", border: "none",
                        padding: "6px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>↩ Riapri</button>
                      <button onClick={() => handleTrash(task)} title="Sposta nel cestino" style={{
                        background: "var(--card)", color: "var(--danger)", border: "1px solid var(--danger)",
                        padding: "6px 10px", borderRadius: 6, cursor: "pointer", fontSize: 12,
                        fontWeight: 600, fontFamily: "inherit",
                      }}>🗑️</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

const thStyle = (align, padX = "8px") => ({
  padding: `12px ${padX}`, textAlign: align, fontSize: 11, fontWeight: 700,
  color: "var(--text-muted)", letterSpacing: 0.5,
});

const chipStyle = (active) => ({
  padding: "5px 12px", borderRadius: 999, cursor: "pointer",
  fontSize: 12, fontWeight: 600, fontFamily: "inherit",
  border: `1px solid ${active ? "var(--navy)" : "var(--border)"}`,
  background: active ? "var(--navy)" : "var(--card)",
  color: active ? "#fff" : "var(--text-muted)",
  transition: "background 0.15s, color 0.15s",
});
