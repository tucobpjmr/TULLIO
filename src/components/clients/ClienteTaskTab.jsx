// Estratto da ClienteDetailPanel.jsx (B-3 dell'audit del 13 agosto: un file,
// un componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useMemo, useCallback } from "react";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { TaskRow } from "../tasks/TaskRow.jsx";
import { formatDate, isActiveTask } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";

export function ClienteTaskTab({ cliente, tasks, dispatch }) {
  const { currentUserId: uid, canViewTask } = useAppData();
  // Stabile per la memoizzazione di TaskRow (vedi components/tasks/TaskCard.jsx).
  const openTask = useCallback(
    (task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);
  const clientTasks = useMemo(() => {
    const q = (cliente.name || "").toLowerCase();
    return tasks.filter(t =>
      isActiveTask(t) &&
      canViewTask(t, uid) &&
      (t.client || "").toLowerCase().includes(q)
    );
  }, [tasks, cliente.name, uid, canViewTask]);

  const open = clientTasks.filter(t => t.status !== "done");
  const done = clientTasks.filter(t => t.status === "done");
  return (
    <>
      <div style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
          {open.length} aperti
        </span>
        <span style={{ fontSize: 12, color: "var(--success)" }}>
          {done.length} completati
        </span>
      </div>

      {clientTasks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 }}>
          Nessun task associato a questo cliente
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
          {clientTasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onOpen={openTask}
              padding="9px 12px"
              subtitle={t.dueDate ? `📅 ${formatDate(t.dueDate)}` : null}
              trailing={<>
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
              </>}
            />
          ))}
        </div>
      )}
    </>
  );
}
