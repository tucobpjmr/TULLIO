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

export const CalendarPlanner = ({ state, dispatch }) => {
  const { isMobile } = useViewport();
  const [viewMode, setViewMode] = useState("month"); // "month" | "week" | "week-full" | "day"
  const [dayDate, setDayDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDay, setSelectedDay] = useState(null);
  const uid = state.currentUserId;

  // ── Month helpers ──
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  const monthName = currentMonth.toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;

  const getTasksForCalDay = (day) => {
    const d = new Date(year, month, day).toDateString();
    return state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate && new Date(t.dueDate).toDateString() === d);
  };

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

  const getTasksForDay = (day) =>
    state.tasks.filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate && new Date(t.dueDate).toDateString() === day.toDateString());

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
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
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
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              width: 34, height: 34, cursor: "pointer", fontSize: 14
            }}>→</button>
            <button onClick={() => exportTasksToIcs(state.tasks, uid)} title="Esporta calendario in iCal (.ics)" style={{
              background: "#fff", border: "1px solid var(--border)", borderRadius: 8,
              padding: "0 12px", height: 34, cursor: "pointer", fontSize: 12, fontWeight: 600,
              color: "var(--navy)",
            }}>⤓ iCal</button>
          </div>
        </div>
      </div>

      {/* ─── VISTA MESE ─── */}
      {viewMode === "month" && (
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)", overflow: "hidden" }}>
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
              const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
              return (
                <div key={day} onClick={() => setSelectedDay(selectedDay === day ? null : day)} style={{
                  minHeight: isMobile ? 52 : 100, borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)",
                  padding: isMobile ? "5px 3px" : "8px 6px", cursor: dayTasks.length ? "pointer" : "default",
                  background: selectedDay === day ? "rgba(212,168,67,0.08)" : "#fff",
                  transition: "background 0.15s", display: "flex", flexDirection: "column", alignItems: isMobile ? "center" : "stretch",
                }}>
                  <div style={{
                    width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, fontWeight: isToday ? 700 : 400,
                    background: isToday ? "var(--navy)" : "transparent",
                    color: isToday ? "#fff" : "var(--text)", marginBottom: 4
                  }}>{day}</div>
                  {isMobile ? (
                    dayTasks.length > 0 && (
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
                      {dayTasks.length > 3 && <div style={{ fontSize: 10, color: "var(--text-muted)", paddingLeft: 4 }}>+{dayTasks.length - 3} altri</div>}
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
            background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 20px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid var(--border)"
          }}>
            <div className="playfair" style={{ fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
              Task del {selectedDay} {monthName}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {dayTasks.map(t => {
                const row = (
                  <div onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                    borderRadius: 8, border: "1px solid var(--border)", cursor: "pointer",
                    transition: "background 0.15s", background: "#fff",
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
                  background: isToday ? "var(--navy)" : "#fff",
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
        const dayTasks = state.tasks
          .filter(t => isActiveTask(t) && canViewTask(t, uid) && t.dueDate &&
            new Date(t.dueDate).toDateString() === dayDate.toDateString())
          .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const HOURS = Array.from({ length: 24 }, (_, h) => h);
        const SLOT_H = 44; // px per ora
        const isToday = dayDate.toDateString() === new Date().toDateString();
        const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
        return (
          <div style={{
            background: "#fff", borderRadius: 14, border: "1px solid var(--border)",
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
                {/* Eventi */}
                {dayTasks.map(t => {
                  const d = new Date(t.dueDate);
                  const startMin = d.getHours() * 60 + d.getMinutes();
                  const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
                  const top = (startMin / 60) * SLOT_H;
                  const height = Math.max(28, hours * SLOT_H - 2);
                  const cat = CATEGORIES[t.category] || {};
                  return (
                    <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                      position: "absolute", top, left: 6, right: 6, height,
                      background: (cat.color || "#94a3b8") + "22",
                      borderLeft: `3px solid ${cat.color || "#94a3b8"}`,
                      borderRadius: "0 6px 6px 0", padding: "4px 8px",
                      cursor: "pointer", overflow: "hidden", fontSize: 12,
                      boxShadow: "0 1px 3px rgba(0,0,0,0.08)", zIndex: 1,
                    }}>
                      <div style={{ fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {cat.icon} {t.title}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 1 }}>
                        {formatTime(t.dueDate)} · {hours}h
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
            background: "#fff", borderRadius: 14, border: "1px solid var(--border)",
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
                      {dayTasks.map(t => {
                        const d = new Date(t.dueDate);
                        const startMin = d.getHours() * 60 + d.getMinutes();
                        const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1;
                        const top = (startMin / 60) * SLOT_H;
                        const height = Math.max(20, hours * SLOT_H - 2);
                        const cat = CATEGORIES[t.category] || {};
                        return (
                          <div key={t.id} onClick={() => dispatch({ type: "SET_SELECTED_TASK", payload: t })} style={{
                            position: "absolute", top, left: 2, right: 2, height,
                            background: (cat.color || "#94a3b8") + "22",
                            borderLeft: `2px solid ${cat.color || "#94a3b8"}`,
                            borderRadius: "0 4px 4px 0", padding: "2px 5px",
                            cursor: "pointer", overflow: "hidden", fontSize: 10, lineHeight: 1.2,
                          }}>
                            <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                              {cat.icon} {t.title}
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
      <div style={{ background: "#fff", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
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
                      new Date(t.dueDate).toDateString() === day.toDateString()
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
                  <td style={{ padding: "8px 12px", textAlign: "center", borderBottom: "1px solid var(--border)", fontWeight: 700, color: "var(--navy)" }}>
                    {state.tasks.filter(t =>
                      isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate &&
                      agentWeekDays.some(d => new Date(t.dueDate).toDateString() === d.toDateString())
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
