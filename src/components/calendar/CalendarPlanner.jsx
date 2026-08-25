// ─── CALENDAR PLANNER ────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { memo, useState, useCallback, useMemo } from "react";
import { useViewport } from "../Viewport.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { TaskRow } from "../tasks/TaskRow.jsx";
import { formatTime, isActiveTask } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";

import { exportTasksToIcs } from "./calendarIcs.js";
import { CalendarDayGrid } from "./CalendarDayGrid.jsx";
import { CalendarWeekGrid } from "./CalendarWeekGrid.jsx";
import { giornoLungo, giornoMese, giornoMeseAnno, meseAnno } from "../../lib/dates.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF11Bold, boxF11Bold2, boxF12Bold, boxF12Bold2, boxF14W34, boxR14, boxW14H14, colGap2MinW0,
  colGap4, colGap8, grid2, grid3, overflowX2, padding2, rowCenterBetween, rowCenterGap6,
  rowCenterGap82, rowGap4P3, rowGap6MtNeg8, rowMiddleGap3, txt, txtBoldHeading, txtF10Muted,
  txtF12Bold, txtF12Muted, txtF12WFull, txtF16Bold, txtF16Bold2,
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
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = meseAnno(currentMonth);
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

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

      {/* ─── VISTA MESE ─── */}
      {viewMode === "month" && (
        <div style={boxR14}>
          {/* Day headers */}
          <div style={grid2}>
            {dayNames.map(d => (
              <div key={d} style={txtF12Bold}>{d}</div>
            ))}
          </div>
          {/* Cells — minmax(0,1fr) evita che i titoli dei task (nowrap) allarghino
              le colonne oltre il contenitore facendo tagliare la domenica */}
          <div style={grid3}>
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e${i}`} style={{ minHeight: isMobile ? 52 : 100, minWidth: 0, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayTasks = getTasksForCalDay(day);
              const hasContent = dayTasks.length > 0;
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{
                  minHeight: isMobile ? 52 : 100, minWidth: 0, overflow: "hidden",
                  borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                  padding: isMobile ? "5px 3px" : "8px 6px", cursor: hasContent ? "pointer" : "default",
                  background: selectedDay === day ? "rgba(212,168,67,0.08)" : "var(--card)",
                  transition: "background 0.15s", display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "stretch",
                }}>
                  <div style={{
                    width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: isToday ? 700 : 400,
                    background: isToday ? "var(--navy)" : "transparent",
                    color: isToday ? "#fff" : "var(--text)", marginBottom: 4
                  }}>{day}</div>
                  {isMobile ? (
                    hasContent && (
                      <div style={rowMiddleGap3}>
                        {dayTasks.slice(0, 4).map(t => (
                          <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: categories[t.category]?.color || "var(--navy)" }} />
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={colGap2MinW0}>
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id} onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SELECTED_TASK", payload: t }); }} style={{
                          fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                          background: categories[t.category]?.color + "20",
                          color: categories[t.category]?.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          cursor: "pointer",
                        }}>{categories[t.category]?.icon} {t.title}</div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div style={txtF10Muted}>
                          +{dayTasks.length - 3} altri
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Day detail (month view) ─── */}
      {viewMode === "month" && selectedDay && (() => {
        const dayTasks = getTasksForCalDay(selectedDay);
        if (!dayTasks.length) return null;
        return (
          <div className="slide-up" style={{
            background: "var(--card)", borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid var(--border)"
          }}>
            <div className="playfair" style={txtF16Bold}>
              Agenda del {selectedDay} {monthName}
            </div>
            <div style={colGap8}>
              {dayTasks.map(t => (
                <SwipeActions key={t.id} task={t}>
                  <TaskRow
                    task={t}
                    onOpen={openTask}
                    background="var(--card)"
                    iconSize={18}
                    padding="8px 12px"
                    gap={12}
                    subtitle={`${t.client ? `${t.client} • ` : ""}${formatTime(t.dueDate)}`}
                    trailing={<>
                      <PriorityBadge priority={t.priority} />
                      <StatusBadge status={t.status} />
                    </>}
                  />
                </SwipeActions>
              ))}
            </div>
          </div>
        );
      })()}

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
      <div style={{ background: "var(--card)", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
        <div className="playfair" style={txtF16Bold2}>Distribuzione Settimanale per Agente</div>
        <div style={overflowX2}>
          <table style={txtF12WFull}>
            <thead>
              <tr>
                <th style={boxF11Bold}>Agente</th>
                {agentWeekDays.map((d, i) => (
                  <th key={i} style={{
                    padding: "8px 6px", background: "var(--surface2)", fontSize: 11, fontWeight: 600,
                    color: d.toDateString() === new Date().toDateString() ? "var(--gold)" : "var(--text-muted)",
                    textAlign: "center", minWidth: 70
                  }}>
                    {dayNames[i]}<br />{d.getDate()}
                  </th>
                ))}
                <th style={boxF11Bold2}>TOT</th>
              </tr>
            </thead>
            <tbody>
              {getAssignableTeam().map(m => (
                <tr key={m.id}>
                  <td style={padding2}>
                    <div style={stiliComuni.rowCenterGap8}>
                      <Avatar memberId={m.id} size={24} />
                      <span style={txt}>{m.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {agentWeekDays.map((day, i) => {
                    const count = tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      new Date(t.dueDate).toDateString() === day.toDateString() && matchesCat(t)
                    ).length;
                    return (
                      <td key={i} style={{
                        padding: "8px 6px", textAlign: "center", borderBottom: "1px solid var(--border)",
                        background: count > 0 ? m.color + "12" : "transparent",
                      }}>
                        {count > 0 ? (
                          <span style={{ fontWeight: 700, color: m.color, fontSize: 14 }}>{count}</span>
                        ) : <span style={stiliComuni.txtMuted}>—</span>}
                      </td>
                    );
                  })}
                  <td style={txtBoldHeading}>
                    {tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      agentWeekDays.some(d => new Date(t.dueDate).toDateString() === d.toDateString()) && matchesCat(t)
                    ).length}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
