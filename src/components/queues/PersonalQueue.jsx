import { useViewport } from "../../hooks/useViewport.jsx";
import { CATEGORIES, PRIORITIES } from "../../data/mockData.js";
import { formatDate, isOverdue } from "../../utils/core.js";
import { isUrgent } from "../../utils/permissions.js";
import SwipeActions from "../SwipeActions.jsx";
import StatusBadge from "../primitives/StatusBadge.jsx";

// ─── PERSONAL QUEUE (le mie task — v0.8) ───────────────────────────────────
const PersonalQueue = ({ tasks, dispatch, me }) => {
  const { isMobile } = useViewport();
  const empty = tasks.length === 0;
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(15,32,68,0.04) 0%, rgba(15,32,68,0.01) 100%)",
      border: "1px solid rgba(15,32,68,0.15)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: me?.color || "var(--navy)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 700,
          }}>{me?.avatar || "?"}</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--navy)" }}>
              La mia coda — task assegnate a me
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Ordinate per scadenza • clicca una card per i dettagli
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--navy)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{tasks.length} {tasks.length === 1 ? "task" : "task"}</div>
        )}
      </div>

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>🎉</span>
          Nessuna task aperta a tuo nome. Buon lavoro!
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {tasks.map(t => {
            const cat = CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category };
            const prio = PRIORITIES[t.priority];
            const overdue = isOverdue(t);
            const urgent = isUrgent(t);
            const card = (
              <div
                style={{
                  background: "#fff", borderRadius: 10,
                  border: `1px solid ${overdue ? "rgba(192,57,43,0.4)" : urgent ? "rgba(200,131,42,0.4)" : "var(--border)"}`,
                  padding: 12, display: "flex", flexDirection: "column", gap: 8,
                  cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s",
                  borderLeft: `3px solid ${prio.color}`,
                }}
                onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 14px rgba(0,0,0,0.08)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "none"; e.currentTarget.style.boxShadow = "none"; }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <div style={{
                    display: "inline-flex", alignItems: "center", gap: 5,
                    padding: "3px 8px", borderRadius: 999,
                    background: cat.bg, color: cat.color,
                    fontSize: 11, fontWeight: 600,
                  }}>
                    <span>{cat.icon}</span> {cat.label}
                  </div>
                  <StatusBadge status={t.status} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.35 }}>
                  {t.title}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
                  {t.client && <span>👤 {t.client}</span>}
                  {t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : urgent ? "var(--warning)" : "var(--text-muted)", fontWeight: (overdue || urgent) ? 700 : 400 }}>
                      📅 {formatDate(t.dueDate)}{overdue ? " ⚠ scaduto" : urgent ? " ⏱ < 24h" : ""}
                    </span>
                  )}
                  {t.estimatedHours > 0 && <span>⏱️ {t.estimatedHours}h</span>}
                </div>
              </div>
            );
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                {card}
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PersonalQueue;
