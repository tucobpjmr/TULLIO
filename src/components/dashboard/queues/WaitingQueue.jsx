// src/components/dashboard/queues/WaitingQueue.jsx
// Coda "in attesa": task aperte ma ferme su un riscontro esterno — cliente o
// fornitore — quindi non "da fare" per chi le possiede. Restavano mescolate
// nella coda personale, indistinguibili da ciò che è davvero azionabile ora.
import { useState } from "react";
import { SwipeActions } from "../../SwipeActions.jsx";
import { StatusBadge } from "../../ui/StatusBadge.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES, STATUS_LABELS, STATUS_COLORS } from "../../../lib/taskConstants.js";
import { formatDate, isOverdue } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useOpenTask } from "./queueShared.js";
import { QueueShell } from "./QueueShell.jsx";
import { SkeletonCards } from "../../ui/SkeletonCards.jsx";

const WAITING_STATUSES = ["awaiting_client", "awaiting_supplier"];
const WAITING_ACCENT = "#8B5CF6";

export const WaitingQueue = ({ tasks, dispatch, loading = false }) => {
  const { getMember } = useAppData();
  const [statusFilter, setStatusFilter] = useState(null);
  const openTask = useOpenTask(dispatch);
  const caricando = loading && tasks.length === 0;
  const empty = tasks.length === 0 && !caricando;

  const presentStatuses = WAITING_STATUSES.filter(s => tasks.some(t => t.status === s));
  const visible = statusFilter ? tasks.filter(t => t.status === statusFilter) : tasks;

  return (
    <QueueShell
      accent="waiting"
      icon="⏳"
      title="In attesa di cliente/fornitore"
      tight={empty}
      badge={caricando ? "…" : empty ? null : (statusFilter ? `${visible.length}/${tasks.length}` : tasks.length)}
    >

      {/* Filtro sotto-stato — solo se sono presenti entrambe le attese */}
      {!empty && presentStatuses.length > 1 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => setStatusFilter(null)}
            style={{
              padding: "3px 10px", borderRadius: 999, cursor: "pointer",
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              border: `1px solid ${!statusFilter ? WAITING_ACCENT : "var(--border)"}`,
              background: !statusFilter ? WAITING_ACCENT : "var(--card)",
              color: !statusFilter ? "#fff" : "var(--text-muted)",
            }}
          >Tutti</button>
          {presentStatuses.map(s => {
            const active = statusFilter === s;
            const color = STATUS_COLORS[s];
            const cnt = tasks.filter(t => t.status === s).length;
            return (
              <button key={s} type="button"
                onClick={() => setStatusFilter(active ? null : s)}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "3px 10px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? color : "var(--border)"}`,
                  background: active ? color : "var(--card)",
                  color: active ? "#fff" : "var(--text-muted)",
                }}
              >
                {STATUS_LABELS[s]}
                <span style={{
                  background: active ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                  color: active ? "#fff" : "var(--text-muted)",
                  borderRadius: 99, padding: "0 5px", fontSize: 10, fontWeight: 700,
                }}>{cnt}</span>
              </button>
            );
          })}
        </div>
      )}

      {caricando ? (
        <SkeletonCards count={3} minWidth={280} compact label="Caricamento delle task in attesa" />
      ) : empty ? (
        <div style={{
          padding: "14px 0 4px", display: "flex", alignItems: "center", gap: 10,
          color: "var(--text-muted)", fontSize: 13,
        }}>
          <span style={{ fontSize: 18 }}>✅</span>
          Nessuna task in attesa di cliente o fornitore.
        </div>
      ) : visible.length === 0 ? (
        <div style={{ padding: "14px 0 4px", color: "var(--text-muted)", fontSize: 13, display: "flex", gap: 8 }}>
          <span>📭</span> Nessuna task per il filtro selezionato.
        </div>
      ) : (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 1fr))",
          gap: 10,
        }}>
          {visible.map(t => {
            const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
            const overdue = isOverdue(t);
            return (
              <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                <TaskCard
                  task={t}
                  onOpen={openTask}
                  hoverLift
                  accent={prio.color}
                  border={`1px solid ${overdue ? "rgba(192,57,43,0.3)" : "var(--border)"}`}
                  badges={<StatusBadge status={t.status} />}
                  meta={<>
                    {t.dueDate && (
                      <span style={{ color: overdue ? "var(--danger)" : "var(--text-muted)", fontWeight: overdue ? 600 : 400 }}>
                        📅 {formatDate(t.dueDate)}{overdue ? " (scaduto)" : ""}
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
    </QueueShell>
  );
};
