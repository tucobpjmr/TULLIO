// src/components/dashboard/queues/OverdueQueue.jsx
// Coda scaduti: tutto ciò che ha superato la scadenza ed è ancora aperto.
import { useState } from "react";
import { useViewport } from "../../Viewport.jsx";
import { SwipeActions } from "../../SwipeActions.jsx";
import { StatusBadge } from "../../ui/StatusBadge.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useOpenTask } from "./queueShared.js";

// ─── OVERDUE QUEUE (task scaduti visibili) ────────────────────────────────
export const OverdueQueue = ({ tasks, dispatch }) => {
  const { isMobile } = useViewport();
  const { getMember } = useAppData();
  const [filterAssignee, setFilterAssignee] = useState(null);
  const openTask = useOpenTask(dispatch);
  const empty = tasks.length === 0;

  const presentAssignees = Array.from(new Set(
    tasks.flatMap(t => t.assignees || [])
  )).filter(Boolean);
  const visible = filterAssignee
    ? tasks.filter(t => (t.assignees || []).includes(filterAssignee))
    : tasks;

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(192,57,43,0.05) 0%, rgba(192,57,43,0.01) 100%)",
      border: "1px solid rgba(192,57,43,0.2)",
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: empty ? 0 : 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: "var(--danger)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18,
          }}>📅</div>
          <div>
            <div className="playfair" style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)" }}>
              Task scadute
            </div>
          </div>
        </div>
        {!empty && (
          <div style={{
            background: "var(--danger)", color: "#fff",
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{filterAssignee ? `${visible.length}/${tasks.length}` : tasks.length}</div>
        )}
      </div>

      {/* Filtro assegnatario — solo se più di un assegnatario presente */}
      {!empty && presentAssignees.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setFilterAssignee(null)}
            style={{
              padding: "3px 10px", borderRadius: 999, cursor: "pointer",
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              border: `1px solid ${!filterAssignee ? "var(--danger)" : "var(--border)"}`,
              background: !filterAssignee ? "var(--danger)" : "var(--card)",
              color: !filterAssignee ? "#fff" : "var(--text-muted)",
            }}
          >Tutti</button>
          {presentAssignees.map(id => {
            const m = getMember(id);
            if (!m) return null;
            const active = filterAssignee === id;
            const cnt = tasks.filter(t => (t.assignees || []).includes(id)).length;
            return (
              <button key={id} type="button"
                onClick={() => setFilterAssignee(active ? null : id)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? "var(--danger)" : "var(--border)"}`,
                  background: active ? "rgba(192,57,43,0.08)" : "var(--card)",
                  color: active ? "var(--danger)" : "var(--text-muted)",
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: "50%", background: m.color,
                  color: "#fff", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0,
                }}>{m.avatar}</span>
                {m.name.split(" ")[0]}
                <span style={{
                  background: active ? "var(--danger)" : "var(--surface2)",
                  color: active ? "#fff" : "var(--text-muted)",
                  borderRadius: 99, padding: "0 5px", fontSize: 10, fontWeight: 700,
                }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          Nessuna task scaduta. Tutto in regola!
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "14px 0 4px", color: "var(--text-muted)", fontSize: 13, display: "flex", gap: 8 }}>
          <span>📭</span> Nessuna task scaduta per l&#39;agente selezionato.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {visible.map(t => {
            const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                <TaskCard
                  task={t}
                  onOpen={openTask}
                  hoverLift
                  accent={prio.color}
                  border="1px solid rgba(192,57,43,0.4)"
                  badges={<StatusBadge status={t.status} />}
                  meta={<>
                    {t.dueDate && (
                      <span style={{ color: "var(--danger)", fontWeight: 700 }}>
                        📅 {formatDate(t.dueDate)} ⚠ scaduto
                      </span>
                    )}
                    {t.assignees?.length > 0 && (
                      <span>👥 {t.assignees.map(a => getMember(a)?.name?.split(" ")[0]).filter(Boolean).join(", ")}</span>
                    )}
                  </>}
                />
              </SwipeActions>
            );
          })}
        </div>
      )}
    </div>
  );
};
