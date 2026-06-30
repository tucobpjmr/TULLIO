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

export const Archive = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const me = state.currentUserId;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  // Solo le task completate che l'utente può vedere (rispetta i permessi).
  // Ordinate per data di completamento (completedAt) decrescente; fallback su
  // dueDate per task completate prima dell'introduzione di completed_at.
  const archived = getVisibleTasks(getArchivedTasks(state.tasks), me)
    .sort((a, b) => new Date(b.completedAt || b.dueDate || 0) - new Date(a.completedAt || a.dueDate || 0));

  const visible = archived.filter(t => {
    if (category !== "all" && t.category !== category) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      const hay = `${t.title} ${t.client || ""} ${t.praticaRef || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

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

  return (
    <div className="vd-pad" style={{ padding: "24px 32px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div className="playfair" style={{ fontSize: 28, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>
            📦 Archivio
          </div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {archived.length === 0
              ? "Nessuna task completata"
              : category !== "all" || query.trim()
                ? `${visible.length} di ${archived.length} task — filtrate`
                : `${archived.length} task ${archived.length === 1 ? "completata" : "completate"}. Riaprile o spostale nel cestino.`
            }
          </div>
        </div>
      </div>

      {/* Filtri — solo se ci sono task */}
      {archived.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cerca per titolo, cliente, pratica…"
            style={{
              flex: isMobile ? "1 1 100%" : "0 1 280px", padding: "8px 12px", borderRadius: 8,
              border: "1px solid var(--border)", fontSize: 13, fontFamily: "inherit", outline: "none",
            }}
            onFocus={e => e.target.style.borderColor = "var(--gold)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
          <button
            type="button"
            onClick={() => setCategory("all")}
            style={chipStyle(category === "all")}
          >Tutte</button>
          {presentCats.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setCategory(k)}
              style={chipStyle(category === k)}
            >{CATEGORIES[k]?.icon} {CATEGORIES[k]?.label || k}</button>
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
          <div style={{ fontSize: 16, fontWeight: 600, color: "var(--heading)", marginBottom: 6 }}>
            Archivio vuoto
          </div>
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
          <button type="button" onClick={() => { setCategory("all"); setQuery(""); }} style={{
            marginTop: 8, padding: "6px 14px", borderRadius: 8,
            border: "1px solid var(--border)", background: "var(--card)",
            color: "var(--text-muted)", fontSize: 12, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit",
          }}>Azzera filtri</button>
        </div>
      ) : (
        /* Archive table */
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
                  <td style={{ padding: "12px 8px" }}>
                    <CategoryChip category={task.category} />
                  </td>
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
