// src/components/dashboard/queues/OverdueQueue.jsx
// Coda scaduti: tutto ciò che ha superato la scadenza ed è ancora aperto.
import { useMemo, useState } from "react";
import { SwipeActions } from "../../SwipeActions.jsx";
import { StatusBadge } from "../../ui/StatusBadge.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { QUEUE_PAGINA, useOpenTask } from "./queueShared.js";
import { useFinestra } from "../../../hooks/useFinestra.js";
import { MostraAltri } from "../../ui/MostraAltri.jsx";
import { QueueShell } from "./QueueShell.jsx";
import { SkeletonCards } from "../../ui/SkeletonCards.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap6 = { display: "flex", alignItems: "center", gap: 6, marginBottom: 12, flexWrap: "wrap" };
const rowGap8F13 = { padding: "14px 0 4px", color: "var(--text-muted)", fontSize: 13, display: "flex", gap: 8 };
const txtBoldDanger = { color: "var(--danger)", fontWeight: 700 };

// ─── OVERDUE QUEUE (task scaduti visibili) ────────────────────────────────
// `loading` (criticità #6): "Tutto in regola!" su zero task caricati è la
// rassicurazione più pericolosa dell'app — è esattamente la coda che esiste
// per non far passare inosservato ciò che è già in ritardo.
export const OverdueQueue = ({ tasks, dispatch, loading = false }) => {
  const { getMember } = useAppData();
  const [filterAssignee, setFilterAssignee] = useState(null);
  const openTask = useOpenTask(dispatch);
  const caricando = loading && tasks.length === 0;
  const empty = tasks.length === 0 && !caricando;

  const presentAssignees = useMemo(
    () => Array.from(new Set(tasks.flatMap(t => t.assignees || []))).filter(Boolean),
    [tasks]);
  const visible = useMemo(
    () => (filterAssignee ? tasks.filter(t => (t.assignees || []).includes(filterAssignee)) : tasks),
    [tasks, filterAssignee]);
  // M-2 · La finestra sulla coda. Le scadute sono una delle due code senza
  // tetto naturale: si allungano proprio quando l'agenzia va in affanno, cioè
  // quando la dashboard deve essere più reattiva, non meno.
  const finestra = useFinestra(visible, QUEUE_PAGINA, [filterAssignee]);

  return (
    <QueueShell
      accent="overdue"
      icon="📅"
      title="Task scadute"
      tight={empty}
      badge={caricando ? "…" : empty ? null : (filterAssignee ? `${visible.length}/${tasks.length}` : tasks.length)}
    >

      {/* Filtro assegnatario — solo se più di un assegnatario presente */}
      {!empty && presentAssignees.length > 1 && (
        <div style={rowCenterGap6}>
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

      {caricando ? (
        <SkeletonCards count={3} minWidth={280} compact label="Caricamento delle task scadute" />
      ) : empty ? (
        <div style={stiliComuni.intestazioneSezione}>
          <span style={stiliComuni.txtF18}>✅</span>
          Nessuna task scaduta. Tutto in regola!
        </div>
      ) : visible.length === 0 ? (
        <div style={rowGap8F13}>
          <span>📭</span> Nessuna task scaduta per l&#39;agente selezionato.
        </div>
      ) : (
        <>
        <div style={stiliComuni.gridGap102}>
          {finestra.visibili.map(t => {
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
                      <span style={txtBoldDanger}>
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
        <MostraAltri
          finestra={finestra}
          azione={`Mostra altre ${Math.min(QUEUE_PAGINA, finestra.restanti)} di ${finestra.restanti}`}
          conteggio={`${finestra.visibili.length} di ${finestra.totale} task`}
        />
        </>
      )}
    </QueueShell>
  );
};
