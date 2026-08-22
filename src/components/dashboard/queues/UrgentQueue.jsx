// src/components/dashboard/queues/UrgentQueue.jsx
// Coda urgenze: tutti i task in scadenza entro la finestra scelta, anche di
// altri (i non-driver devono poter intervenire su ciò che sta per scadere).
import { useMemo, useState } from "react";
import { SwipeActions } from "../../SwipeActions.jsx";
import { Avatar } from "../../ui/Avatar.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate, formatTime } from "../../../lib/taskUtils.js";
import { useAppData } from "../../../state/AppDataContext.jsx";
import { QUEUE_PAGINA, useOpenTask } from "./queueShared.js";
import { useFinestra } from "../../../hooks/useFinestra.js";
import { useTickLento } from "../../../hooks/useTickLento.js";
import { MostraAltri } from "../../ui/MostraAltri.jsx";
import { QueueShell } from "./QueueShell.jsx";
import { SkeletonCards } from "../../ui/SkeletonCards.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowGap6Mb12 = { display: "flex", gap: 6, marginBottom: 12 };
const rowGap6Mb122 = { display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 };
const txtF13Muted = {
  padding: "26px 20px", textAlign: "center", color: "var(--text-muted)",
  fontSize: 13, fontStyle: "italic",
};
const gridGap10 = {
  display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))",
  gap: 10,
};
const rowCenterGap6 = { display: "flex", alignItems: "center", gap: 6 };
const rowCenterGap3 = {
  fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
  background: "var(--surface2)", color: "var(--text-muted)",
  display: "inline-flex", alignItems: "center", gap: 3,
  textTransform: "uppercase", letterSpacing: 0.4,
};
const txtBoldWarning = { color: "var(--warning)", fontWeight: 700 };
const rowCenterGap8 = {
  display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
  background: "var(--surface2)", border: "1px solid var(--border)",
  borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
  transition: "background 0.15s",
};
const txtF12Bold = { fontSize: 12, fontWeight: 600, color: "var(--text)" };

// ─── URGENT QUEUE (tutte le task in scadenza <24h — visibile a non-driver) ──
// Mostra sia le proprie task urgenti (editabili dal dettaglio) sia quelle
// altrui (read-only, con scorciatoia "contatta" verso l'assegnatario).
// windowH: finestra temporale selezionabile (ore). 24 = default (badge tab).
// B-5 · Ogni quanto rileggere l'ora, come in Dashboard.jsx: la finestra più
// stretta è di 24 ore, al minuto la transizione è già più fine del percepibile.
const TICK_URGENZE_MS = 60 * 1000;

const URGENT_WINDOWS = [
  { h: 24, label: "Entro 24h" },
  { h: 48, label: "Entro 48h" },
  { h: 72, label: "Entro 72h" },
];

// `loading` (criticità #6): "Nessuna task in scadenza entro 24h" mostrato
// mentre i dati stanno ancora arrivando è l'esempio da cui è nata questa
// modifica — una scadenza imminente non vista è una scadenza mancata.
export const UrgentQueue = ({ tasks, dispatch, onOpenChat, uid, loading = false }) => {
  const { getMember, canEditTask } = useAppData();
  const [filterAgent, setFilterAgent] = useState(null);
  const [windowH, setWindowH] = useState(24);
  const openTask = useOpenTask(dispatch);
  const caricando = loading && tasks.length === 0;

  // `tasks` arriva già limitato a 72h dal parent: qui restringo alla finestra
  // selezionata, poi (eventualmente) al singolo agente.
  const windowMs = windowH * 60 * 60 * 1000;
  // B-5 · Stesso tick della Dashboard, e per la stessa ragione: questo
  // `useMemo` non ha il tempo fra le dipendenze, quindi senza `adesso` una
  // coda lasciata aperta continuerebbe a mostrare come «entro 24h» una task
  // scaduta nel frattempo. È anche il punto in cui il difetto è nato due
  // volte: il filtro girava a ogni render (sempre fresco, sempre ricalcolato)
  // finché M-2 non l'ha memoizzato — la memoizzazione è giusta, ma congela
  // l'ora se non gliela si dichiara.
  const adesso = useTickLento(TICK_URGENZE_MS);
  const inWindow = useMemo(() => tasks.filter(t => {
    const diff = new Date(t.dueDate).getTime() - adesso;
    return diff >= 0 && diff <= windowMs;
  }), [tasks, windowMs, adesso]);

  const presentAgents = useMemo(
    () => [...new Set(inWindow.map(t => t.assignees?.[0]).filter(Boolean))], [inWindow]);

  const visibleTasks = useMemo(
    () => (filterAgent ? inWindow.filter(t => t.assignees?.[0] === filterAgent) : inWindow),
    [inWindow, filterAgent]);

  // M-2 · La finestra sull'elenco (da non confondere con la finestra TEMPORALE
  // 24/48/72h di questa coda, che è un filtro sui dati): entrambe la
  // riazzerano, perché entrambe ridefiniscono quali siano le prime dieci.
  const finestra = useFinestra(visibleTasks, QUEUE_PAGINA, [filterAgent, windowH]);

  return (
    <QueueShell
      accent="urgent"
      icon="⏱"
      title="Urgenti"
      badge={caricando ? "…" : `${visibleTasks.length}${filterAgent ? `/${inWindow.length}` : ""}`}
    >

      {/* Selettore finestra temporale (24/48/72h) */}
      <div style={rowGap6Mb12}>
        {URGENT_WINDOWS.map(w => {
          const on = windowH === w.h;
          // `adesso` e non `Date.now()`: i conteggi dei tre chip devono
          // invecchiare insieme alla lista che descrivono, altrimenti il chip
          // dice «12» e sotto se ne vedono 11.
          const n = tasks.filter(t => {
            const diff = new Date(t.dueDate).getTime() - adesso;
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
              }}>{caricando ? "…" : n}</span>
            </button>
          );
        })}
      </div>

      {/* Filtro per agente — Round 15 */}
      {presentAgents.length > 1 && (
        <div style={rowGap6Mb122}>
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

      {caricando ? (
        <SkeletonCards count={2} minWidth={320} compact label="Caricamento delle task urgenti" />
      ) : visibleTasks.length === 0 ? (
        <div style={txtF13Muted}>
          ✅ Nessuna task in scadenza entro {windowH}h{filterAgent ? " per questo agente" : ""}.
          {windowH < 72 && " Prova ad allargare la finestra."}
        </div>
      ) : (
      <>
      <div style={gridGap10}>
        {finestra.visibili.map(t => {
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
                  <div style={rowCenterGap6}>
                    {!editable && (
                      <span
                        aria-label="Solo visualizzazione"
                        style={rowCenterGap3}
                      >🔒 Read-only</span>
                    )}
                    <div style={{
                      fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 4,
                      background: prio.bg, color: prio.color, textTransform: "uppercase", letterSpacing: 0.5,
                    }}>{prio.label}</div>
                  </div>
                }
                meta={t.dueDate && (
                  <span style={txtBoldWarning}>
                    ⏱ {formatDate(t.dueDate)} ({formatTime(t.dueDate)})
                  </span>
                )}
                /* Owner cliccabile → apre chat con link al task (solo task altrui) */
                footer={owner && !mine && (
                  <button
                    onClick={() => onOpenChat && onOpenChat({ toUser: owner.id, taskLink: t.id })}
                    style={rowCenterGap8}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface3)"}
                    onMouseLeave={e => e.currentTarget.style.background = "var(--surface2)"}
                    title={`Scrivi a ${owner.name}`}
                  >
                    <Avatar memberId={owner.id} size={24} />
                    <span style={txtF12Bold}>{owner.name}</span>
                    <span style={stiliComuni.txtF11Muted}>💬 contatta</span>
                  </button>
                )}
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
