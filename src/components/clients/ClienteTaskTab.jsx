// Estratto da ClienteDetailPanel.jsx (B-3 dell'audit del 13 agosto: un file,
// un componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useMemo, useCallback } from "react";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { TaskRow } from "../tasks/TaskRow.jsx";
import { formatDate, isActiveTask } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowGap12Mb12 = { display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" };
const txtF12Success = { fontSize: 12, color: "var(--success)" };
const txtF13Muted = { textAlign: "center", padding: "24px 0", color: "var(--text-muted)", fontSize: 13 };
const colGap7 = { display: "flex", flexDirection: "column", gap: 7 };

export function ClienteTaskTab({ cliente, tasks }) {
  const dispatch = useDispatch();
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
      <div style={rowGap12Mb12}>
        <span style={stiliComuni.txtF12Muted}>
          {open.length} aperti
        </span>
        <span style={txtF12Success}>
          {done.length} completati
        </span>
      </div>

      {clientTasks.length === 0 ? (
        <div style={txtF13Muted}>
          Nessun task associato a questo cliente
        </div>
      ) : (
        <div style={colGap7}>
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
