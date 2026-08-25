// src/components/dashboard/queues/PersonalQueue.jsx
// Coda personale: i task assegnati a me.
// enableDateFilter (v22): per il Driver abilita il filtro data/ora — i transfer
// sono time-sensitive e la coda si filtra per giornata.
import { useMemo, useState } from "react";
import { SwipeActions } from "../../tasks/SwipeActions.jsx";
import { StatusBadge } from "../../ui/StatusBadge.jsx";
import { TaskCard } from "../../tasks/TaskCard.jsx";
import { PRIORITIES } from "../../../lib/taskConstants.js";
import { formatDate, formatTime, isOverdue, isUrgent, getDayKey } from "../../../lib/taskUtils.js";
import { QUEUE_PAGINA, QUEUE_SORT_OPTIONS, PRIO_ORDER, STATUS_ORDER, useOpenTask } from "./queueShared.js";
import { useFinestra } from "../../../hooks/useFinestra.js";
import { MostraAltri } from "../../ui/MostraAltri.jsx";
import { QueueShell } from "./QueueShell.jsx";
import { FilterChip } from "./FilterChip.jsx";
import { FilterLabel } from "./FilterLabel.jsx";
import { FilterRow } from "./FilterRow.jsx";
import { SkeletonCards } from "../../ui/SkeletonCards.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" };
const boxF13Bold = {
  background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 13, fontWeight: 600,
};

// `loading` (criticità #6): true finché il primo fetch dei task non è tornato.
// Serve a NON dire "Buon lavoro!" a chi ha una coda piena che non è ancora
// arrivata — la coda vuota e la coda ignota sono due cose diverse.
export const PersonalQueue = ({ tasks, me, enableDateFilter = false, loading = false }) => {
  const [dateFilter, setDateFilter] = useState("all"); // "all" | "today" | "tomorrow" | "YYYY-MM-DD"
  const [sortBy, setSortBy] = useState("date"); // "date" | "priority" | "client" | "status"
  const openTask = useOpenTask();

  // M-2 · `useMemo` e non un ricalcolo a ogni render: filtro per giornata e
  // ordinamento girano su tutta la coda, e senza memo si rifarebbero a ogni
  // render della Dashboard — compresi quelli che non c'entrano con questa card.
  const filtered = useMemo(() => {
    let filtered = tasks;
    if (enableDateFilter && dateFilter !== "all") {
      let targetKey;
      if (dateFilter === "today") {
        targetKey = new Date().toDateString();
      } else if (dateFilter === "tomorrow") {
        const d = new Date(); d.setDate(d.getDate() + 1); targetKey = d.toDateString();
      } else {
        // dateFilter = "YYYY-MM-DD" da <input type="date"> → mezzogiorno locale (no shift TZ)
        targetKey = new Date(dateFilter + "T12:00:00").toDateString();
      }
      filtered = tasks.filter(t => t.dueDate && getDayKey(t.dueDate) === targetKey);
    }
    // Ordinamento locale (il chiamante li ordina per data di default).
    // Driver: mantiene l'ordine per orario quando sortBy === "date".
    filtered = [...filtered].sort((a, b) => {
      if (sortBy === "priority") {
        const dp = (PRIO_ORDER[a.priority] ?? 9) - (PRIO_ORDER[b.priority] ?? 9);
        if (dp !== 0) return dp;
      }
      if (sortBy === "client") {
        return (a.client || "").localeCompare(b.client || "", "it");
      }
      if (sortBy === "status") {
        const ds = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
        if (ds !== 0) return ds;
      }
      // Fallback: per scadenza (default e tie-breaker)
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });
    return filtered;
  }, [tasks, enableDateFilter, dateFilter, sortBy]);

  // M-2 · La finestra sulla coda. Il filtro per giornata e l'ordinamento la
  // riazzerano: cambiare l'ordine ridefinisce QUALI sono le prime dieci.
  const finestra = useFinestra(filtered, QUEUE_PAGINA, [dateFilter, sortBy]);

  // In caricamento solo se non c'è ancora NULLA da mostrare: un reload
  // realtime a coda già popolata non deve far sparire i task sotto uno
  // scheletro.
  const caricando = loading && tasks.length === 0;
  const empty = filtered.length === 0 && !caricando;

  const customDate = !["all", "today", "tomorrow"].includes(dateFilter) ? dateFilter : "";
  const chip = (key, label) => (
    <FilterChip active={dateFilter === key} onClick={() => setDateFilter(key)}>{label}</FilterChip>
  );

  return (
    <QueueShell
      accent="personal"
      icon={me?.avatar || "?"}
      iconBg={me?.color || "var(--navy)"}
      iconFg="#fff"
      iconSize={12}
      title={enableDateFilter ? "La mia coda transfer" : "La mia coda"}
      tight={empty}
      filters={!enableDateFilter && tasks.length > 1 && (
        /* Ordinamento — non mostrato ai Driver, che usano il filtro data */
        <FilterRow>
          <FilterLabel>Ordina:</FilterLabel>
          {QUEUE_SORT_OPTIONS.map(opt => (
            <FilterChip key={opt.key} active={sortBy === opt.key} onClick={() => setSortBy(opt.key)}>
              {opt.label}
            </FilterChip>
          ))}
        </FilterRow>
      )}
    >

      {enableDateFilter && (
        <div className="vd-row-wrap" style={rowCenterGap8}>
          {chip("all", "Tutte")}
          {chip("today", "Oggi")}
          {chip("tomorrow", "Domani")}
          <input
            type="date"
            value={customDate}
            onChange={e => setDateFilter(e.target.value || "all")}
            aria-label="Filtra per data"
            style={{
              padding: "4px 10px", borderRadius: 999, fontSize: 12, fontFamily: "inherit",
              border: `1px solid ${customDate ? "var(--navy)" : "var(--border)"}`,
              background: "var(--card)", color: "var(--text)", cursor: "pointer",
            }}
          />
          {customDate && (
            <button type="button" onClick={() => setDateFilter("all")} title="Azzera filtro" style={boxF13Bold}>✕ azzera</button>
          )}
        </div>
      )}

      {caricando ? (
        <SkeletonCards count={3} minWidth={280} compact label="Caricamento della coda personale" />
      ) : empty ? (
        <div style={stiliComuni.intestazioneSezione}>
          <span style={stiliComuni.txtF18}>{enableDateFilter && dateFilter !== "all" ? "📭" : "🎉"}</span>
          {enableDateFilter && dateFilter !== "all" ? "Nessun transfer per la giornata selezionata." : "Nessuna task aperta a tuo nome. Buon lavoro!"}
        </div>
      ) : (
        <>
        <div style={stiliComuni.gridGap102}>
          {finestra.visibili.map(t => {
            const prio = PRIORITIES[t.priority] || { color: "#6B7280", bg: "#F9FAFB", label: t.priority };
            const overdue = isOverdue(t);
            const urgent = isUrgent(t);
            return (
              <SwipeActions key={t.id} task={t}>
                <TaskCard
                  task={t}
                  onOpen={openTask}
                  hoverLift
                  accent={prio.color}
                  border={`1px solid ${overdue ? "rgba(192,57,43,0.4)" : urgent ? "rgba(200,131,42,0.4)" : "var(--border)"}`}
                  badges={<StatusBadge status={t.status} />}
                  meta={t.dueDate && (
                    <span style={{ color: overdue ? "var(--danger)" : urgent ? "var(--warning)" : "var(--text-muted)", fontWeight: (overdue || urgent) ? 700 : 400 }}>
                      📅 {formatDate(t.dueDate)}{enableDateFilter ? ` 🕑 ${formatTime(t.dueDate)}` : ""}{overdue ? " ⚠ scaduto" : urgent ? " ⏱ < 24h" : ""}
                    </span>
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
