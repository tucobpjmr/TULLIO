// ─── CALENDAR PLANNER ────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { SwipeActions } from "../SwipeActions.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { formatTime, isActiveTask } from "../../lib/taskUtils.js";
import { CATEGORIES, getAssignableTeam, canViewTask } from "../../state/appGlobals.js";

// ─── iCal export (Step G) ────────────────────────────────────────────────
function pad2(n) { return String(n).padStart(2, "0"); }
function icsDate(d) {
  // YYYYMMDDTHHmmssZ (UTC)
  const u = new Date(d);
  return (
    u.getUTCFullYear() + pad2(u.getUTCMonth() + 1) + pad2(u.getUTCDate()) +
    "T" + pad2(u.getUTCHours()) + pad2(u.getUTCMinutes()) + pad2(u.getUTCSeconds()) + "Z"
  );
}
function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function buildIcs(tasks) {
  const now = icsDate(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//VoyageDesk//Tasks//IT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const t of tasks) {
    if (!t.dueDate) continue;
    const start = new Date(t.dueDate);
    const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
    const end = new Date(start.getTime() + hours * 3600 * 1000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${t.id}@voyagedesk`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(t.title || "Task")}`,
      `DESCRIPTION:${icsEscape((t.description || "") + (t.priority ? "\nPriorità: " + t.priority : ""))}`,
      `CATEGORIES:${icsEscape(t.category || "task")}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}
function exportTasksToIcs(allTasks, uid) {
  const tasks = (allTasks || []).filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate);
  if (tasks.length === 0) return;
  const ics = buildIcs(tasks);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const ts = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `voyagedesk-tasks-${ts}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}


// ── Recurring expansion ─────────────────────────────────────────────────────
// Numero di giorni (28–31) del mese `month` (0-based) dell'anno `year`.
function daysInMonthOf(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

// Calcola l'occorrenza N-esima di una ricorrenza a partire SEMPRE dalla data base
// originale (n = 0 restituisce la base stessa). Derivare ogni occorrenza dalla base
// — invece di iterare su un accumulatore — evita lo slittamento permanente dovuto
// all'overflow di setMonth/setFullYear quando il giorno di partenza non esiste nel
// mese/anno target. Per monthly/yearly il giorno viene "clampato" all'ultimo giorno
// valido del mese target (es. 31 gen → 28/29 feb → 31 mar → 30 apr → 31 mag; 29 feb
// annuale → 28 feb negli anni non bisestili). L'ora del giorno (ore/minuti/secondi/ms)
// della base è sempre preservata.
export function nthRecurrence(base, recurrence, n) {
  if (recurrence === "daily") {
    const d = new Date(base);
    d.setDate(d.getDate() + n);
    return d;
  }
  if (recurrence === "weekly") {
    const d = new Date(base);
    d.setDate(d.getDate() + n * 7);
    return d;
  }
  if (recurrence === "monthly" || recurrence === "yearly") {
    const step = recurrence === "yearly" ? 12 : 1;
    const totalMonths = base.getMonth() + n * step;
    const year = base.getFullYear() + Math.floor(totalMonths / 12);
    const month = ((totalMonths % 12) + 12) % 12;
    const day = Math.min(base.getDate(), daysInMonthOf(year, month));
    return new Date(
      year, month, day,
      base.getHours(), base.getMinutes(), base.getSeconds(), base.getMilliseconds()
    );
  }
  // Ricorrenza sconosciuta: nessun avanzamento.
  return new Date(base);
}

// Generates virtual task copies for recurring tasks within [rangeStart, rangeEnd].
// Virtual copies have isRecurringInstance:true and originalId pointing to the base.
export function expandRecurring(tasks, rangeStart, rangeEnd) {
  const result = [];
  for (const t of tasks) {
    if (!t.dueDate || !t.recurrence || t.recurrence === "none") {
      result.push(t);
      continue;
    }
    const orig = new Date(t.dueDate);
    // Ogni occorrenza è ricavata dalla base originale tramite l'indice `n`
    // (n = 0 → base), così un mese/anno "corto" non altera le occorrenze successive.
    let n = 0;
    let cur = nthRecurrence(orig, t.recurrence, n);
    let safety = 0;
    // Wind forward to first occurrence >= rangeStart
    while (cur < rangeStart && safety++ < 400) {
      n++;
      cur = nthRecurrence(orig, t.recurrence, n);
    }
    // Emit all occurrences in [rangeStart, rangeEnd]
    safety = 0;
    while (cur <= rangeEnd && safety++ < 400) {
      const isOrig = cur.getTime() === orig.getTime();
      result.push({
        ...t,
        id: isOrig ? t.id : `${t.id}_r${cur.getTime()}`,
        dueDate: cur.toISOString(),
        isRecurringInstance: !isOrig,
        originalId: t.id,
      });
      n++;
      cur = nthRecurrence(orig, t.recurrence, n);
    }
  }
  return result;
}

// ── Column layout for overlapping events ────────────────────────────────────
// Returns array of { task, col, totalCols } with non-overlapping column placement.
function layoutColumns(dayTasks) {
  const sorted = [...dayTasks].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const colEnds = []; // end-minute of last event assigned to each column
  const items = sorted.map(t => {
    const d = new Date(t.dueDate);
    const startMin = d.getHours() * 60 + d.getMinutes();
    const durH = Math.max(0.25, Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1);
    const endMin = startMin + durH * 60;
    let col = colEnds.findIndex(e => e <= startMin);
    if (col === -1) { col = colEnds.length; colEnds.push(endMin); }
    else colEnds[col] = endMin;
    return { task: t, col, startMin, endMin };
  });
  // Assign totalCols = max col in the overlapping group + 1
  return items.map(item => {
    const totalCols = Math.max(...items
      .filter(o => o.startMin < item.endMin && o.endMin > item.startMin)
      .map(o => o.col)) + 1;
    return { ...item, totalCols };
  });
}

export const CalendarPlanner = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [viewMode, setViewMode] = useState("month"); // "month" | "week" | "week-full" | "day"
  const [dayDate, setDayDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const [catFilter, setCatFilter] = useState(null); // v2.8 Round 12: null = tutti
  const uid = state.currentUserId;

  // Categorie presenti nei task con dueDate (per mostrare solo i chip utili)
  const presentCats = [...new Set(
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate).map(t => t.category)
  )].filter(Boolean);

  // Filtro base applicato a tutti i getter di task
  const matchesCat = (t) => !catFilter || t.category === catFilter;

  // ── Month helpers ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
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

  // ── Pre-expand recurring tasks for each visible range ──
  const baseTasks = state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid));

  const monthStart = new Date(year, month, 1, 0, 0, 0);
  const monthEnd = new Date(year, month + 1, 0, 23, 59, 59);
  const expandedMonth = expandRecurring(baseTasks, monthStart, monthEnd);

  const _wkS = new Date(weekDays[0]); _wkS.setHours(0, 0, 0, 0);
  const _wkE = new Date(weekDays[6]); _wkE.setHours(23, 59, 59, 999);
  const expandedWeek = expandRecurring(baseTasks, _wkS, _wkE);

  const _dyS = new Date(dayDate); _dyS.setHours(0, 0, 0, 0);
  const _dyE = new Date(dayDate); _dyE.setHours(23, 59, 59, 999);
  const expandedDay = expandRecurring(baseTasks, _dyS, _dyE);

  const getTasksForCalDay = (day) => {
    const d = new Date(year, month, day).toDateString();
    return expandedMonth.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === d && matchesCat(t));
  };

  const getTasksForDay = (day) =>
    expandedWeek.filter(t => t.dueDate && new Date(t.dueDate).toDateString() === day.toDateString() && matchesCat(t));

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

      {/* ─── Header con toggle + navigazione ─── */}
      <div className="vd-row-wrap" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="playfair" style={{ fontSize: isMobile ? 18 : 22, fontWeight: 700, textTransform: viewMode === "month" ? "capitalize" : "none" }}>
            {viewMode === "month" && monthName}
            {viewMode === "week" && "Settimana"}
            {viewMode === "week-full" && "Settimana piena"}
            {viewMode === "day" && dayDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          {(viewMode === "week" || viewMode === "week-full") && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", fontWeight: 500 }}>
              {weekDays[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} — {weekDays[6].toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          {/* View toggle */}
          <div style={{ display: "flex", gap: 4, background: "var(--surface2)", borderRadius: 10, padding: 3 }}>
            {toggleBtn("day", isMobile ? "Gior." : "🕒 Giorno")}
            {toggleBtn("week", isMobile ? "Sett." : "📆 Settimana")}
            {toggleBtn("week-full", isMobile ? "Sett.+" : "🗓️ Sett. piena")}
            {toggleBtn("month", isMobile ? "Mese" : "📅 Mese")}
          </div>
          {/* Nav buttons */}
          <div style={{ display: "flex", gap: 4 }}>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month - 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() - 1); return x; });
              else setWeekOffset(w => w - 1);
            }} style={{
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>←</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date());
              else if (viewMode === "day") setDayDate(new Date());
              else setWeekOffset(0);
              setSelectedDay(null);
            }} style={{
              background: "var(--gold)", color: "var(--navy)", border: "none",
              borderRadius: 8, padding: "0 14px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 700
            }}>Oggi</button>
            <button onClick={() => {
              if (viewMode === "month") setCurrentMonth(new Date(year, month + 1));
              else if (viewMode === "day") setDayDate(d => { const x = new Date(d); x.setDate(x.getDate() + 1); return x; });
              else setWeekOffset(w => w + 1);
            }} style={{
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>→</button>
            <button onClick={() => exportTasksToIcs(state.tasks, uid)} title="Esporta calendario in iCal (.ics)" style={{
              background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
              padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600,
              color: "var(--heading)",
            }}>⤓ iCal</button>
          </div>
        </div>
      </div>

      {/* ─── Filtro categoria (v2.8 Round 12) ─── */}
      {presentCats.length > 1 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: -8 }}>
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
            const c = CATEGORIES[cat];
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
        <div style={{ background: "var(--card)", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)", overflow: "hidden" }}>
          {/* Day headers */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: "var(--navy)", padding: "10px 0" }}>
            {dayNames.map(d => (
              <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)" }}>{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
            {Array.from({ length: startOffset }, (_, i) => (
              <div key={`e${i}`} style={{ minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", background: "var(--surface2)" }} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const dayTasks = getTasksForCalDay(day);
              const hasContent = dayTasks.length > 0;
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{
                  minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
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
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", justifyContent: "center" }}>
                        {dayTasks.slice(0, 4).map(t => (
                          <span key={t.id} style={{ width: 6, height: 6, borderRadius: "50%", background: CATEGORIES[t.category]?.color || "var(--navy)" }} />
                        ))}
                      </div>
                    )
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      {dayTasks.slice(0, 3).map(t => (
                        <div key={t.id} onClick={e => { e.stopPropagation(); dispatch({ type: "SET_SELECTED_TASK", payload: t }); }} style={{
                          fontSize: 10, fontWeight: 500, padding: "1px 5px", borderRadius: 3,
                          background: CATEGORIES[t.category]?.color + "20",
                          color: CATEGORIES[t.category]?.color,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          cursor: "pointer",
                        }}>{CATEGORIES[t.category]?.icon} {t.title}</div>
                      ))}
                      {dayTasks.length > 3 && (
                        <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>
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
            <div className="playfair" style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              Agenda del {selectedDay} {monthName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayTasks.map(t => {
                const row = (
                  <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                    transition: "background 0.15s", background: "var(--card)",
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                    onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                  >
                    <span style={{ fontSize: 18 }}>{CATEGORIES[t.category]?.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.client ? `${t.client} • ` : ""}{formatTime(t.dueDate)}</div>
                    </div>
                    <PriorityBadge priority={t.priority} />
                    <StatusBadge status={t.status} />
                  </div>
                );
                return (
                  <SwipeActions key={t.id} task={t} dispatch={dispatch}>
                    {row}
                  </SwipeActions>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA ─── */}
      {viewMode === "week" && (
        <div style={{ overflowX: isMobile ? "auto" : "visible", scrollSnapType: isMobile ? "x mandatory" : "none" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(7, 60vw)" : "repeat(7, 1fr)", gap: 10 }}>
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
                  <div style={{ padding: "8px 6px", display: "flex", flexDirection: "column", gap: 4, minHeight: 160 }}>
                    {dayTasks.length === 0 ? (
                      <div style={{ fontSize: 10, color: isToday ? "rgba(255,255,255,0.4)" : "var(--text-muted)", textAlign: "center", marginTop: 20 }}>Nessun task</div>
                    ) : dayTasks.slice(0, 6).map(t => (
                      <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                        background: isToday ? "rgba(255,255,255,0.12)" : CATEGORIES[t.category]?.color + "18",
                        borderLeft: `3px solid ${CATEGORIES[t.category]?.color}`,
                        borderRadius: "0 4px 4px 0", padding: "4px 6px", cursor: "pointer",
                        fontSize: 10, fontWeight: 500, lineHeight: 1.3,
                        color: isToday ? "#fff" : "var(--text)",
                      }}>
                        {CATEGORIES[t.category]?.icon} {t.title.slice(0, 30)}{t.title.length > 30 ? "…" : ""}
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
      {viewMode === "day" && (() => {
        const dayTasks = expandedDay
          .filter(t => t.dueDate && new Date(t.dueDate).toDateString() === dayDate.toDateString() && matchesCat(t))
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const laid = layoutColumns(dayTasks);
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 44; // px per ora
        const isToday = dayDate.toDateString() === new Date().toDateString();
        const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
        return (
          <div style={{
            background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            <div style={{
              padding: "10px 14px", background: "var(--surface2)",
              fontSize: 12, color: "var(--text-muted)", fontWeight: 600,
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <span>{dayTasks.length} task in agenda</span>
              {isToday && <span style={{ color: "var(--gold)" }}>● Oggi</span>}
            </div>
            <div style={{ position: "relative", display: "flex", maxHeight: 640, overflowY: "auto" }}>
              {/* Colonna ore */}
              <div style={{ width: 56, flexShrink: 0, borderRight: "1px solid var(--border)" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: SLOT_H, padding: "2px 8px", fontSize: 10, color: "var(--text-muted)",
                    textAlign: "right", borderBottom: "1px solid var(--surface2)",
                  }}>{String(h).padStart(2, "0")}:00</div>
                ))}
              </div>
              {/* Colonna eventi */}
              <div style={{ flex: 1, position: "relative" }}>
                {HOURS.map(h => (
                  <div key={h} style={{
                    height: SLOT_H, borderBottom: "1px solid var(--surface2)",
                  }} />
                ))}
                {/* Linea ora corrente */}
                {nowMinutes != null && (
                  <div style={{
                    position: "absolute", left: 0, right: 0,
                    top: (nowMinutes / 60) * SLOT_H,
                    height: 2, background: "var(--gold)", zIndex: 2,
                  }}>
                    <div style={{
                      position: "absolute", left: -4, top: -4, width: 10, height: 10,
                      borderRadius: "50%", background: "var(--gold)",
                    }} />
                  </div>
                )}
                {/* Eventi con layout colonne anti-overlap */}
                {laid.map(({ task: t, col, totalCols }) => {
                  const d = new Date(t.dueDate);
                  const startMin = d.getHours() * 60 + d.getMinutes();
                  const hours = Math.max(0.25, Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1);
                  const top = (startMin / 60) * SLOT_H;
                  const height = Math.max(28, hours * SLOT_H - 2);
                  const cat = CATEGORIES[t.category] || {};
                  const colW = 100 / totalCols;
                  const taskToOpen = t.isRecurringInstance
                    ? (state.tasks.find(x => x.id === t.originalId) || t)
                    : t;
                  return (
                    <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: taskToOpen })} style={{
                      position: "absolute", top,
                      left: `calc(${col * colW}% + 3px)`,
                      width: `calc(${colW}% - 6px)`,
                      height,
                      background: (cat.color || "#94a3b8") + "22",
                      borderLeft: `3px solid ${cat.color || "#94a3b8"}`,
                      borderRadius: "0 6px 6px 0", padding: "4px 8px",
                      cursor: "pointer", overflow: "hidden", fontSize: 12,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)", zIndex: 1,
                      outline: t.isRecurringInstance ? `1px dashed ${cat.color || "#94a3b8"}66` : "none",
                    }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cat.icon} {t.title}{t.isRecurringInstance ? " ↻" : ""}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 1 }}>
                        <span style={{ fontSize: 10, color: "var(--text-muted)" }}>{formatTime(t.dueDate)}</span>
                        {t.assignees?.length > 0 && height >= 42 && (
                          <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                            {t.assignees.slice(0, 3).map(id => (
                              <Avatar key={id} memberId={id} size={14} />
                            ))}
                            {t.assignees.length > 3 && (
                              <span style={{ fontSize: 9, color: "var(--text-muted)" }}>+{t.assignees.length - 3}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── VISTA SETTIMANA PIENA (Step G) ─── */}
      {viewMode === "week-full" && (() => {
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 36;
        const today = new Date().toDateString();
        return (
          <div style={{
            background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)",
            boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>
            {/* Header giorni */}
            <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, background: "var(--surface2)" }}>
              <div />
              {weekDays.map((d, i) => {
                const isToday = d.toDateString() === today;
                return (
                  <div key={i} style={{
                    padding: "8px 4px", textAlign: "center", fontSize: 11,
                    color: isToday ? "var(--gold)" : "var(--text-muted)",
                    fontWeight: 600, borderLeft: "1px solid var(--border)",
                  }}>
                    {dayNames[i]} {d.getDate()}
                  </div>
                );
              })}
            </div>
            {/* Griglia oraria scrollabile */}
            <div style={{ maxHeight: 560, overflowY: "auto" }}>
              <div style={{ display: "grid", gridTemplateColumns: `56px repeat(7, 1fr)`, position: "relative" }}>
                {/* Colonna ore */}
                <div>
                  {HOURS.map(h => (
                    <div key={h} style={{
                      height: SLOT_H, padding: "2px 6px", fontSize: 9, color: "var(--text-muted)",
                      textAlign: "right", borderBottom: "1px solid var(--surface2)",
                    }}>{String(h).padStart(2, "0")}:00</div>
                  ))}
                </div>
                {weekDays.map((day, di) => {
                  const dayTasks = getTasksForDay(day).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
                  const laid = layoutColumns(dayTasks);
                  const isToday = day.toDateString() === today;
                  return (
                    <div key={di} style={{
                      position: "relative", borderLeft: "1px solid var(--border)",
                      background: isToday ? "rgba(212,168,67,0.04)" : "transparent",
                    }}>
                      {HOURS.map(h => (
                        <div key={h} style={{
                          height: SLOT_H, borderBottom: "1px solid var(--surface2)",
                        }} />
                      ))}
                      {laid.map(({ task: t, col, totalCols }) => {
                        const d = new Date(t.dueDate);
                        const startMin = d.getHours() * 60 + d.getMinutes();
                        const hours = Math.max(0.25, Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1);
                        const top = (startMin / 60) * SLOT_H;
                        const height = Math.max(20, hours * SLOT_H - 2);
                        const cat = CATEGORIES[t.category] || {};
                        const colW = 100 / totalCols;
                        const taskToOpen = t.isRecurringInstance
                          ? (state.tasks.find(x => x.id === t.originalId) || t)
                          : t;
                        return (
                          <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: taskToOpen })} style={{
                            position: "absolute", top,
                            left: `calc(${col * colW}% + 1px)`,
                            width: `calc(${colW}% - 3px)`,
                            height,
                            background: (cat.color || "#94a3b8") + "22",
                            borderLeft: `2px solid ${cat.color || "#94a3b8"}`,
                            borderRadius: "0 4px 4px 0", padding: "2px 5px",
                            cursor: "pointer", overflow: "hidden", fontSize: 10, lineHeight: 1.2,
                            outline: t.isRecurringInstance ? `1px dashed ${cat.color || "#94a3b8"}66` : "none",
                          }}>
                            <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {cat.icon} {t.title}{t.isRecurringInstance ? " ↻" : ""}
                            </div>
                            <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{formatTime(t.dueDate)}</div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ─── DISTRIBUZIONE AGENTI (sempre visibile) ─── */}
      <div style={{ background: "var(--card)", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
        <div className="playfair" style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Distribuzione Settimanale per Agente</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "8px 12px", background: "var(--surface2)", borderRadius: "8px 0 0 0", fontWeight: 600, fontSize: 11, color: "var(--text-muted)", width: 150 }}>Agente</th>
                {agentWeekDays.map((d, i) => (
                  <th key={i} style={{
                    padding: "8px 6px", background: "var(--surface2)", fontSize: 11, fontWeight: 600,
                    color: d.toDateString() === new Date().toDateString() ? "var(--gold)" : "var(--text-muted)",
                    textAlign: "center", minWidth: 70
                  }}>
                    {dayNames[i]}<br />{d.getDate()}
                  </th>
                ))}
                <th style={{ padding: "8px 6px", background: "var(--surface2)", textAlign: "center", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", borderRadius: "0 8px 0 0" }}>TOT</th>
              </tr>
            </thead>
            <tbody>
              {getAssignableTeam().map(m => (
                <tr key={m.id}>
                  <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Avatar memberId={m.id} size={24} />
                      <span style={{ fontWeight: 500 }}>{m.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {agentWeekDays.map((day, i) => {
                    const count = state.tasks.filter(t =>
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
                        ) : <span style={{ color: "var(--text-muted)" }}>—</span>}
                      </td>
                    );
                  })}
                  <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--heading)" }}>
                    {state.tasks.filter(t =>
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
};
