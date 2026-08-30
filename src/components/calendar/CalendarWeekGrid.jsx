// ─── VISTA SETTIMANA PIENA ───────────────────────────────────────────────────
// Sette griglie orarie affiancate. Stessa estrazione (e stessa ragione) della
// vista giorno, vedi CalendarDayGrid.jsx: il blocco "evento posizionato nella
// griglia" è quasi identico nelle due, differisce solo nelle misure e negli
// avatar — se un giorno le misure convergono, è il punto da unificare.
import { memo } from "react";
import { CalendarWeekGridDay } from "./CalendarWeekGridDay.jsx";
import * as stiliComuni from "../../styles/common.js";

// Stili e costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto; `HOURS` e
// `SLOT_H` estese alla stessa convenzione dal P-4 dell'audit del 30 agosto).
const grid2 = { display: "grid", gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`, background: "var(--surface2)" };
const maxHeight2 = { maxHeight: 560, overflowY: "auto" };
const gridRelative = { display: "grid", gridTemplateColumns: `56px repeat(7, minmax(0, 1fr))`, position: "relative" };
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SLOT_H = 36;

export const CalendarWeekGrid = memo(function CalendarWeekGrid({ weekDays, dayNames, getTasksForDay, categories, onOpenTask }) {
  const today = new Date().toDateString();
  return (
    <div style={stiliComuni.cardElevata}>
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
            // NIENTE `.sort()` qui. Era un ordinamento IN PLACE su un array che
            // oggi arriva dall'indice memoizzato del planner (P-1) ed è
            // CONDIVISO: ordinarlo qui lo muterebbe sotto gli altri lettori.
            // L'ordine è già garantito dall'indice.
            const dayTasks = getTasksForDay(day);
            const isToday = day.toDateString() === today;
            return (
              <CalendarWeekGridDay
                key={di}
                dayTasks={dayTasks}
                isToday={isToday}
                hours={HOURS}
                categories={categories}
                onOpenTask={onOpenTask}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
});
