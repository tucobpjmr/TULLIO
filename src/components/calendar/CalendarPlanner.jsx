// ─── CALENDAR PLANNER ────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { memo, useState, useCallback, useMemo } from "react";
import { useViewport } from "../ui/Viewport.jsx";
import { formatTime, isActiveTask } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";

import { exportTasksToIcs } from "./calendarIcs.js";
import { CalendarAgentLoad } from "./CalendarAgentLoad.jsx";
import { CalendarDayGrid } from "./CalendarDayGrid.jsx";
import { CalendarMonthGrid } from "./CalendarMonthGrid.jsx";
import { CalendarWeekGrid } from "./CalendarWeekGrid.jsx";
import { giornoLungo, giornoMese, giornoMeseAnno, meseAnno } from "../../lib/dates.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF12Bold, boxF12Bold2, boxF14W34, boxW14H14, colGap4, rowCenterBetween,
  rowCenterGap6, rowCenterGap82, rowGap4P3, rowGap6MtNeg8, txtF12Muted,
} from "./calendarPlannerStyles.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

export const CalendarPlanner = memo(function CalendarPlanner({ loading = false }) {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const { categories, currentUserId, getAssignableTeam, canViewTask } = useAppData();
  const tasks = useTasks();
  const [viewMode, setViewMode] = useState("month"); // "month" | "week" | "week-full" | "day"
  const [dayDate, setDayDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [catFilter, setCatFilter] = useState(null); // v2.8 Round 12: null = tutti
  const uid = currentUserId;
  // Stabile per la memoizzazione di TaskRow (vedi components/tasks/TaskCard.jsx).
  const openTask = useCallback(
    (task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);

  // P2-4: `tasks` cambia identità a ogni azione qualunque (un toast, un
  // carattere in ricerca altrove) grazie a `useTasks()`, ma qui il filtro
  // dipende solo da `tasks`/`canViewTask`/`uid` — non da `viewMode` o dalla
  // data corrente. Senza `useMemo` girava a ogni render comunque.
  const baseTasks = useMemo(
    () => tasks.filter(t => isActiveTask(t) && canViewTask(t, uid)),
    [tasks, canViewTask, uid],
  );

  // "Sto ancora caricando e non ho ancora nulla": vedi Dashboard.jsx.
  const caricando = loading && tasks.length === 0;

  // Categorie presenti nei task con dueDate (per mostrare solo i chip utili)
  const presentCats = useMemo(
    () => [...new Set(baseTasks.filter(t => t.dueDate).map(t => t.category))].filter(Boolean),
    [baseTasks],
  );

  // Filtro base applicato a tutti i getter di task
  const matchesCat = (t) => !catFilter || t.category === catFilter;

  // ── Month helpers ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const monthName = meseAnno(currentMonth);

  // ── Week helpers ──
  const getWeekDays = (offset) => {
    const now = new Date();
    const mon = new Date(now);
    mon.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1) + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(mon);
      d.setDate(mon.getDate() + i);
      return d;
    });
  };
  const weekDays = getWeekDays(weekOffset);
  const dayNames = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

  // ─── A-3 · QUI C'ERA L'ESPANSIONE DELLE RICORRENZE ────────────────────────
  // `const expanded = useMemo(() => expandRecurring(baseTasks, range[0],
  // range[1]), …)`, che trasformava una task ricorrente nelle sue istanze
  // virtuali dentro l'intervallo visibile. Non ha mai espanso nulla:
  // `recurrence` non esiste sul database (nessuna delle 109 migrazioni lo
  // nomina), `toDbTask`/`fromDbTask` non lo mappano, e nessuna UI lo imposta —
  // l'unico writer in tutta la codebase era `QuickAddTask`, che scriveva la
  // costante `"none"`. `expandRecurring` prendeva quindi SEMPRE il ramo
  // `!t.recurrence || t.recurrence === "none"`: era una map identità con 83
  // righe di gestione degli overflow di calendario dentro.
  //
  // È uscito con lui `range` (più `weekStartMs`/`weekEndMs`, che esistevano per
  // le sue dipendenze): l'unico lettore era l'espansione. Con `range` se ne va
  // anche l'ottimizzazione P2-4 — «espandere le ricorrenze costava tre passate
  // su baseTasks, mese/settimana/giorno, mentre viewMode ne mostra una sola» —
  // che restringeva a un intervallo solo il lavoro di una funzione che non
  // lavorava. Non è una regressione di performance: è il lavoro che sparisce
  // invece di essere ridotto.
  //
  // Le viste ora filtrano direttamente `baseTasks`, che è ciò che
  // `expandRecurring` restituiva.

  const getTasksForCalDay = (day) => {
    const d = new Date(year, month, day).toDateString();
    return baseTasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === d && matchesCat(t));
  };

  const getTasksForDay = (day) =>
    baseTasks.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === day.toDateString() && matchesCat(t));

  // ── Distribuzione agenti ──
  // Caveat #8: nelle viste settimanali (week / week-full) le frecce ←/→ guidano
  // weekOffset, quindi la distribuzione deve seguire la settimana navigata
  // (weekDays è già offset-aware). Solo in vista mese/giorno, dove weekOffset
  // non è navigabile, mostriamo la settimana corrente.
  const agentWeekDays = (viewMode === "week" || viewMode === "week-full")
    ? weekDays
    : getWeekDays(0);

  // ── Toggle style ──
  const toggleBtn = (mode, label) => (
    <button
      onClick={() => { setViewMode(mode); setSelectedDay(null); }}
      style={{
        background: viewMode === mode ? "var(--navy)" : "transparent",
        color: viewMode === mode ? "#fff" : "var(--text)",
        border: viewMode === mode ? "none" : "1px solid var(--border)",
        borderRadius: 8, padding: isMobile ? "6px 12px" : "6px 16px",
        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >{label}</button>
  );

  return (
    <div className="fade-in" style={{ padding: isMobile ? 16 : 28, display: "flex", flexDirection: "column", gap: isMobile ? 16 : 22 }}>

      {/* Criticità #6 — qui non c'è una lista da sostituire con uno scheletro:
          la griglia del mese esiste comunque, sono gli EVENTI a mancare, e una
          griglia di giorni vuoti si legge come "agenda libera". Una riga sopra
          il calendario è il minimo che distingua "libero" da "non ancora
          caricato" senza inventare uno stato di caricamento per 42 celle. */}
      {caricando && (
        <div
          role="status"
          aria-live="polite"
          style={rowCenterGap82}
        >
          <span className="skeleton" style={boxW14H14} />
          Caricamento delle task: il calendario è ancora incompleto.
        </div>
      )}

      {/* ─── Header con toggle + navigazione ─── */}
      <div className="vd-row-wrap" style={rowCenterBetween}>
        <div style={stiliComuni.rowCenterGap12}>
          <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, textTransform: viewMode === "month" ? "capitalize" : "none" }}>
            {viewMode === "month" && monthName}
            {viewMode === "week" && "Settimana"}
            {viewMode === "week-full" && "Settimana piena"}
            {viewMode === "day" && giornoLungo(dayDate)}
          </div>
          {(viewMode === "week" || viewMode === "week-full") && (
            <div style={txtF12Muted}>
              {giornoMese(weekDays[0])} — {giornoMeseAnno(weekDays[6])}
            </div>
          )}
        </div>
        <div style={rowCenterGap6}>
          {/* View toggle */}
          <div style={rowGap4P3}>
            {toggleBtn("day", isMobile ? "Gior." : "🕒 Giorno")}
            {toggleBtn("week", isMobile ? "Sett." : "📆 Settimana")}
            {toggleBtn("week-full", isMobile ? "Sett.+" : "🗓️ Sett. piena")}
            {toggleBtn("month", isMobile ? "Mese" : "📅 Mese")}
          </div>
          {/* Nav buttons */}
          <div style={stiliComuni.rowGap4}>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month - 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; });
              else setWeekOffset(w => w - 1);
            }} style={boxF14W34}>←</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date());
              else if (viewMode === "day") setDayDate(new Date());
              else setWeekOffset(0);
              setSelectedDay(null);
            }} style={boxF12Bold}>Oggi</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month + 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; });
              else setWeekOffset(w => w + 1);
            }} style={boxF14W34}>→</button>
            <button onClick={() => exportTasksToIcs(tasks, (t) => canViewTask(t, uid))} title="Esporta calendario in iCal (.ics)" style={boxF12Bold2}>⤓ iCal</button>
          </div>
        </div>
      </div>

      {/* ─── Filtro categoria (v2.8 Round 12) ─── */}
      {presentCats.length > 1 && (
        <div style={rowGap6MtNeg8}>
          <button
            type="button"
            onClick={() => setCatFilter(null)}
            style={{
              padding: "4px 12px", borderRadius: 999, cursor: "pointer",
              fontSize: 11, fontWeight: 600, fontFamily: "inherit",
              border: `1px solid ${!catFilter ? "var(--navy)" : "var(--border)"}`,
              background: !catFilter ? "var(--navy)" : "var(--card)",
              color: !catFilter ? "#fff" : "var(--text-muted)",
              transition: "all 0.15s",
            }}
          >Tutte</button>
          {presentCats.map(cat => {
            const c = categories[cat];
            if (!c) return null;
            const active = catFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter(active ? null : cat)}
                style={{
                  padding: "4px 12px", borderRadius: 999, cursor: "pointer",
                  fontSize: 11, fontWeight: 600, fontFamily: "inherit",
                  border: `1px solid ${active ? (c.color || "var(--navy)") : "var(--border)"}`,
                  background: active ? ((c.color || "var(--navy)") + "18") : "var(--card)",
                  color: active ? (c.color || "var(--navy)") : "var(--text-muted)",
                  transition: "all 0.15s",
                }}
              >{c.icon} {c.label}</button>
            );
          })}
        </div>
      )}

      {viewMode === "month" && (
        <CalendarMonthGrid
          mese={currentMonth}
          nomiGiorni={dayNames}
          nomeMese={monthName}
          selectedDay={selectedDay}
          onSelectDay={setSelectedDay}
          tasksDelGiorno={getTasksForCalDay}
          categories={categories}
          onOpenTask={openTask}
          isMobile={isMobile}
        />
      )}

      {/* ─── VISTA SETTIMANA ─── */}
      {viewMode === "week" && (
        <div style={{ overflowX: isMobile ? "auto" : "visible", scrollSnapType: isMobile ? "x mandatory" : "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(7, 60vw)" : "repeat(7, minmax(0, 1fr))", gap: 10 }}>
            {weekDays.map((day, i) => {
              const dayTasks = getTasksForDay(day);
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div key={i} style={{
                  background: isToday ? "var(--navy)" : "var(--card)",
                  borderRadius: 10, border: `1px solid ${isToday ? "transparent" : "var(--border)"}`,
                  overflow: "hidden", scrollSnapAlign: isMobile ? "start" : "none",
                }}>
                  {/* Day header */}
                  <div style={{
                    padding: "10px 10px 6px",
                    background: isToday ? "var(--gold)" : "var(--surface2)",
                    textAlign: "center"
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? "var(--navy)" : "var(--text-muted)" }}>{dayNames[i]}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: isToday ? "var(--navy)" : "var(--text)" }}>
                      {day.getDate()}
                    </div>
                  </div>
                  <div style={colGap4}>
                    {dayTasks.length === 0 ? (
                      <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center", marginTop: 20 }}>Nessun task</div>
                    ) : dayTasks.slice(0, 6).map(t => (
                      <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                        background: isToday ? "rgba(255,255,255,0.12)" : categories[t.category]?.color + "18",
                        borderLeft: `3px solid ${categories[t.category]?.color}`,
                        borderRadius: "0 4px 4px 0", padding: "4px 6px", cursor: "pointer",
                        fontSize: 10, fontWeight: 500, lineHeight: 1.3,
                        color: isToday ? "#fff" : "var(--text)",
                      }}>
                        {categories[t.category]?.icon} {t.title.slice(0, 30)}{t.title.length > 30 ? "…" : ""}
                        <div style={{ fontSize: 9, color: isToday ? "rgba(255,255,255,0.5)" : "var(--text-muted)", marginTop: 1 }}>{formatTime(t.dueDate)}</div>
                      </div>
                    ))}
                    {dayTasks.length > 6 && <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center" }}>+{dayTasks.length - 6} altri</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── VISTA GIORNO (Step G) ─── */}
      {viewMode === "day" && (
        <CalendarDayGrid
          dayDate={dayDate}
          expandedDay={baseTasks}
          catFilter={catFilter}
          categories={categories}
          onOpenTask={openTask}
        />
      )}

      {/* ─── VISTA SETTIMANA PIENA (Step G) ─── */}
      {viewMode === "week-full" && (
        <CalendarWeekGrid
          weekDays={weekDays}
          dayNames={dayNames}
          getTasksForDay={getTasksForDay}
          categories={categories}
          onOpenTask={openTask}
        />
      )}

      {/* ─── DISTRIBUZIONE AGENTI (sempre visibile) ─── */}
      <CalendarAgentLoad
        tasks={tasks}
        giorni={agentWeekDays}
        nomiGiorni={dayNames}
        team={getAssignableTeam()}
        matchesCat={matchesCat}
        isMobile={isMobile}
      />
    </div>
  );
});
