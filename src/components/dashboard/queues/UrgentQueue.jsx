// src/components/dashboard/queues/UrgentQueue.jsx
// Coda urgenze: tutti i task in scadenza entro la finestra scelta, anche di
// altri (i non-driver devono poter intervenire su ciò che sta per scadere).
import { useState } from "react";
import { SwipeActions } from "../../SwipeActions.jsx";
import { Avatar } from "../../ui/Avatar.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate, formatTime } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { useOpenTask } from "./queueShared.js";
import { QueueShell } from "./QueueShell.jsx";

// ─── URGENT QUEUE (tutte le task in scadenza <24h — visibile a non-driver) ──
// Mostra sia le proprie task urgenti (editabili dal dettaglio) sia quelle
// altrui (read-only, con scorciatoia "contatta" verso l'assegnatario).
// windowH: finestra temporale selezionabile (ore). 24 = default (badge tab).
const URGENT_WINDOWS = [
  { h: 24, label: "Entro 24h" },
  { h: 48, label: "Entro 48h" },
  { h: 72, label: "Entro 72h" },
];

export const UrgentQueue = ({ tasks, dispatch, onOpenChat, uid }) => {
  const { getMember, canEditTask } = useAppData();
  const [filterAgent, setFilterAgent] = useState(null);
  const [windowH, setWindowH] = useState(24);
  const openTask = useOpenTask(dispatch);

  // `tasks` arriva già limitato a 72h dal parent: qui restringo alla finestra
  // selezionata, poi (eventualmente) al singolo agente.
  const windowMs = windowH * 60 * 60 * 1000;
  const inWindow = tasks.filter(t => {
    const diff = new Date(t.dueDate).getTime() - Date.now();
    return diff >= 0 && diff <= windowMs;
  });

  const presentAgents = [...new Set(
    inWindow.map(t => t.assignees?.[0]).filter(Boolean)
  )];

  const visibleTasks = filterAgent
    ? inWindow.filter(t => t.assignees?.[0] === filterAgent)
    : inWindow;

  return (
    <QueueShell
      accent="urgent"
      icon="⏱"
      title="Urgenti"
      badge={`${visibleTasks.length}${filterAgent ? `/${inWindow.length}` : ""}`}
    >

      {/* Selettore finestra temporale (24/48/72h) */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {URGENT_WINDOWS.map(w => {
          const on = windowH === w.h;
          const n = tasks.filter(t => {
            const diff = new Date(t.dueDate).getTime() - Date.now();
            return diff >= 0 && diff <= w.h * 60 * 60 * 1000;
          }).length;
          return (
            <button
              key={w.h}
              type="button"
              onClick={() => { setWindowH(w.h); setFilterAgent(null); }}
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                border: `1px solid ${on ? "var(--warning)" : "var(--border)"}`,
                background: on ? "var(--warning)" : "var(--card)",
                color: on ? "#fff" : "var(--text-muted)",
                transition: "all 0.15s",
              }}
            >
              {w.label}
              <span style={{
                background: on ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                borderRadius: 999, padding: "1px 6px", fontSize: 11,
                color: on ? "#fff" : "var(--text-muted)",
              }}>{n}</span>
            </button>
          );
        })}
      </div>

      {/* Filtro per agente — Round 15 */}
      {presentAgents.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          <button
            type="button"
            onClick={() => setFilterAgent(null)}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              padding: "4px 12px", borderRadius: 999, cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              border: `1px solid ${!filterAgent ? "var(--warning)" : "var(--border)"}`,
              background: !filterAgent ? "var(--warning)" : "var(--card)",
              color: !filterAgent ? "#fff" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >Tutti</button>
          {presentAgents.map(agentId => {
            const m = getMember(agentId);
            if (!m) return null;
            const active = filterAgent === agentId;
            const count = inWindow.filter(t => t.assignees?.[0] === agentId).length;
            return (
              <button
                key={agentId}
                type="button"
                onClick={() => setFilterAgent(active ? null : agentId)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 5,
                  padding: "4px 12px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? "var(--warning)" : "var(--border)"}`,
                  background: active ? "var(--warning)" : "var(--card)",
                  color: active ? "#fff" : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >
                <Avatar memberId={agentId} size={16} />
                {m.name}
                <span style={{
                  background: active ? "rgba(255,255,255,0.25)" : "var(--surface2)",
                  borderRadius: 999, padding: "1px 5px", fontSize: 10,
                  color: active ? "#fff" : "var(--text-muted)",
                }}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {visibleTasks.length === 0 ? (
        <div style={{
          padding: "26px 20px", textAlign: "center", color: "var(--text-muted)",
          fontSize: 13, fontStyle: "italic",
        }}>
          ✅ Nessuna task in scadenza entro {windowH}h{filterAgent ? " per questo agente" : ""}.
          {windowH < 72 && " Prova ad allargare la finestra."}
        </div>
      ) : (
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
        gap: 10,
      }}>
        {visibleTasks.map(t => {
          const prio = PRIORITIES[t.priority];
          const owner = getMember(t.assignees?.[0]);
          const mine = (t.assignees || []).includes(uid);
          // Read-only solo se l'utente non ha davvero i permessi di modifica:
          // le task non assegnate (coda globale) restano editabili anche qui.
          const editable = canEditTask(t, uid);
          return (
            <SwipeActions key={t.id} task={t} dispatch={dispatch}>
              <TaskCard
                task={t}
                onOpen={openTask}
                clickTitleOnly
                tooltip={mine ? "Tua task in scadenza — clicca per i dettagli" : editable ? "Task in scadenza — clicca per i dettagli" : "Task di un altro agente in scadenza"}
                border={mine ? "1px solid rgba(200,131,42,0.45)" : "1.5px dashed rgba(200,131,42,0.45)"}
                badges={
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {!editable && (
                      <span
                        aria-label="Solo visualizzazione"
                        style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                          background: "var(--surface2)", color: "var(--text-muted)",
                          display: "inline-flex", alignItems: "center", gap: 3,
                          textTransform: "uppercase", letterSpacing: 0.4,
                        }}
                      >🔒 Read-only</span>
                    )}
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                      background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                    }}>{prio.label}</div>
                  </div>
                }
                meta={t.dueDate && (
                  <span style={{ color: "var(--warning)", fontWeight: 700 }}>
                    ⏱ {formatDate(t.dueDate)} ({formatTime(t.dueDate)})
                  </span>
                )}
                /* Owner cliccabile → apre chat con link al task (solo task altrui) */
                footer={owner && !mine && (
                  <button
                    onClick={() => onOpenChat && onOpenChat({ toUser: owner.id, taskLink: t.id })}
                    style={{
                      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                      background: "var(--surface2)", border: "1px solid var(--border)",
                      borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--surface2)"}
                    title={`Scrivi a ${owner.name}`}
                  >
                    <Avatar memberId={owner.id} size={24} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{owner.name}</span>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>💬 contatta</span>
                  </button>
                )}
              />
            </SwipeActions>
          );
        })}
      </div>
      )}
    </QueueShell>
  );
};
