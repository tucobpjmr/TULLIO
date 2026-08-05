// src/components/dashboard/queues/UnassignedQueue.jsx
// Coda globale: task non assegnati a nessuno, che chi ne ha i permessi può
// prendere in carico. Il Driver non la vede.
import { useState } from "react";
import { useViewport } from "../../Viewport.jsx";
import { SwipeActions } from "../../SwipeActions.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate, isOverdue } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useOpenTask } from "./queueShared.js";

// ─── UNASSIGNED QUEUE (coda globale) ───────────────────────────────────────
export const UnassignedQueue = ({ tasks, dispatch, onTake, uid }) => {
  const { categories, isJuniorAgent } = useAppData();
  const isJunior = isJuniorAgent(uid);
  const { isMobile } = useViewport();
  const openTask = useOpenTask(dispatch);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const empty = tasks.length === 0;

  // Categorie e priorità presenti nelle task della coda (no chip vuoti).
  const presentCategories = Array.from(new Set(tasks.map(t => t.category).filter(Boolean)));
  const presentPriorities = Array.from(new Set(tasks.map(t => t.priority).filter(Boolean)))
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a] ?? 9) - (order[b] ?? 9);
    });
  const filtered = tasks.filter(t =>
    (!categoryFilter || t.category === categoryFilter) &&
    (!priorityFilter || t.priority === priorityFilter)
  );
  const hasFilter = categoryFilter || priorityFilter;
  const filteredEmpty = !empty && filtered.length === 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(212,168,67,0.05) 0%, rgba(212,168,67,0.01) 100%)",
      border: "1px solid rgba(212,168,67,0.3)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--gold)", color: "var(--navy)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 700,
          }}>🙋</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              Coda globale
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--gold)", color: "var(--navy)",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{hasFilter ? `${filtered.length}/${tasks.length}` : `${tasks.length} in attesa`}</div>
        )}
      </div>

      {/* Filtri categoria + priorità */}
      {!empty && (presentCategories.length > 1 || presentPriorities.length > 1 || hasFilter) && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center",
          marginBottom: 12, paddingBottom: 12, borderBottom: "1px solid rgba(212,168,67,0.2)",
        }}>
          {presentPriorities.length > 1 && presentPriorities.map(p => {
            const meta = PRIORITIES[p];
            if (!meta) return null;
            const active = priorityFilter === p;
            return (
              <button key={`p-${p}`} onClick={() => setPriorityFilter(active ? "" : p)} style={{
                padding: "3px 9px", borderRadius: 99, border: "1px solid",
                borderColor: active ? meta.color : meta.bg,
                background: active ? meta.color : meta.bg,
                color: active ? "#fff" : meta.color,
                fontSize: 10, fontWeight: 700, cursor: "pointer",
                fontFamily: "inherit", textTransform: "uppercase", letterSpacing: 0.3,
              }}>{meta.label}</button>
            );
          })}
          {presentCategories.length > 1 && presentCategories.map(c => {
            const meta = categories[c];
            if (!meta) return null;
            const active = categoryFilter === c;
            return (
              <button key={`c-${c}`} onClick={() => setCategoryFilter(active ? "" : c)} style={{
                padding: "3px 9px", borderRadius: 99, border: "1px solid",
                borderColor: active ? meta.color : meta.bg,
                background: active ? meta.color : meta.bg,
                color: active ? "#fff" : meta.color,
                fontSize: 11, fontWeight: 600, cursor: "pointer",
                fontFamily: "inherit", display: "inline-flex", alignItems: "center", gap: 4,
              }}>{meta.icon} {meta.label}</button>
            );
          })}
          {hasFilter && (
            <button onClick={() => { setCategoryFilter(""); setPriorityFilter(""); }} style={{
              padding: "3px 9px", borderRadius: 99, border: "1px solid var(--border)",
              background: "var(--card)", color: "var(--text-muted)",
              fontSize: 11, cursor: "pointer", fontFamily: "inherit",
            }}>✕ Reset</button>
          )}
        </div>
      )}

      {/* Lista */}
      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✨</span>
          Nessun task in coda. Tutti gli incarichi hanno un proprietario!
        </div>
      ) : filteredEmpty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>🔍</span>
          Nessun task per i filtri selezionati.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {filtered.map(t => {
            const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
            const overdue = isOverdue(t);
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                <TaskCard
                  task={t}
                  onOpen={openTask}
                  hoverLift
                  gap={10}
                  opacity={isJunior ? 0.8 : 1}
                  border={`1px solid ${overdue ? "rgba(192,57,43,0.3)" : "var(--border)"}`}
                  badges={
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                      background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                    }}>{prio.label}</div>
                  }
                  meta={t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                      📅 {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
                    </span>
                  )}
                  /* Take ownership — nascosto per Junior Agent */
                  footer={isJunior ? (
                    <div style={{
                      background: "var(--surface2)", color: "var(--text-muted)",
                      borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
                      marginTop: 2,
                    }}>
                      🔒 Chiedi a un Senior per l&#39;assegnazione
                    </div>
                  ) : (
                    <button
                      onClick={e => { e.stopPropagation(); onTake(t); }}
                      style={{
                        background: "var(--gold)", color: "var(--navy)",
                        border: "none", borderRadius: 8,
                        padding: "8px 12px", fontSize: 12, fontWeight: 700,
                        cursor: "pointer", display: "flex", alignItems: "center",
                        justifyContent: "center", gap: 6,
                        fontFamily: "inherit",
                        transition: "background 0.15s, transform 0.15s",
                        marginTop: 2,
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = "var(--gold-light)"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = "var(--gold)"; }}
                    >
                      🙋 Prendi in carico
                    </button>
                  )}
                />
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};
