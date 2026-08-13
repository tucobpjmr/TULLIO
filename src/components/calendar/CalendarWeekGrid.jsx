// ─── VISTA SETTIMANA PIENA ───────────────────────────────────────────────────
// Sette griglie orarie affiancate. Stessa estrazione (e stessa ragione) della
// vista giorno, vedi CalendarDayGrid.jsx: il blocco "evento posizionato nella
// griglia" è quasi identico nelle due, differisce solo nelle misure e negli
// avatar — se un giorno le misure convergono, è il punto da unificare.
import { formatTime } from "../../lib/taskUtils.js";
import { layoutColumns } from "./calendarLayout.js";
import { nomeTroncato } from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxR14 = {
  background: "var(--card)", borderRadius: 14, border: "1px solid var(--border)",
  boxShadow: "0 2px 10px rgba(0,0,0,0.06)", overflow: "hidden",
};
const grid2 = { display: "grid", gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`, background: "var(--surface2)" };
const maxHeight2 = { maxHeight: 560, overflowY: "auto" };
const gridRelative = { display: "grid", gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`, position: "relative" };
const txtF9Muted = { fontSize: 9, color: "var(--text-muted)" };

export function CalendarWeekGrid({ weekDays, dayNames, getTasksForDay, tasks, categories, onOpenTask }) {
  const HOURS = Array.from({ length: 24 }, (_, h) => h);
  const SLOT_H = 36;
  const today = new Date().toDateString();
  return (
    <div style={boxR14}>
      {/* Header giorni */}
      <div style={grid2}>
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
      <div style={maxHeight2}>
        <div style={gridRelative}>
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
                  const cat = categories[t.category] || {};
                  const colW = 100 / totalCols;
                  const taskToOpen = t.isRecurringInstance
                    ? (tasks.find(x => x.id === t.originalId) || t)
                    : t;
                  return (
                    <div key={t.id} onClick={() => onOpenTask(taskToOpen)} style={{
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
                      <div style={nomeTroncato}>
                        {cat.icon} {t.title}{t.isRecurringInstance ? " ↻" : ""}
                      </div>
                      <div style={txtF9Muted}>{formatTime(t.dueDate)}</div>
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
}
