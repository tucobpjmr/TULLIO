// ─── COLONNA GIORNO (vista settimana piena) ─────────────────────────────────
// Un file a sé e non un secondo componente dentro CalendarWeekGrid.jsx, per la
// convenzione del repo (un file, un componente; B-3 dell'audit del 13 agosto)
// e perché `react/no-multi-comp` è un numero misurato da verifica:convenzioni.
//
// Estratta dal `.map()` di CalendarWeekGrid perché `layoutColumns` è
// quadratica e girava lì dentro, dove nessun hook può memoizzarla (P-4
// dell'audit del 30 agosto). Qui il `useMemo` chiude su `dayTasks`, che
// dall'indice del planner (P-1) ha identità stabile: finché i task di quel
// giorno non cambiano, il layout non si ricalcola — nemmeno quando cambia la
// settimana mostrata o si apre un task.
import { memo, useMemo } from "react";
import { formatTime } from "../../lib/taskUtils.js";
import { layoutColumns } from "./calendarLayout.js";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera } from "../../lib/a11y.js";

const SLOT_H = 36;
const txtF9Muted = { fontSize: 9, color: "var(--text-muted)" };

export const CalendarWeekGridDay = memo(function CalendarWeekGridDay({ dayTasks, isToday, hours, categories, onOpenTask }) {
  const laid = useMemo(() => layoutColumns(dayTasks), [dayTasks]);
  return (
    <div style={{
      position: "relative", borderLeft: "1px solid var(--border)",
      background: isToday ? "rgba(212,168,67,0.04)" : "transparent",
    }}>
      {hours.map(h => (
        <div key={h} style={{
          height: SLOT_H, borderBottom: "1px solid var(--surface2)",
        }} />
      ))}
      {laid.map(({ task: t, col, totalCols }) => {
        const d = new Date(t.dueDate);
        const startMin = d.getHours() * 60 + d.getMinutes();
        const durH = Math.max(0.25, Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1);
        const top = (startMin / 60) * SLOT_H;
        const height = Math.max(20, durH * SLOT_H - 2);
        const cat = categories[t.category] || {};
        const colW = 100 / totalCols;
        const apri = () => onOpenTask(t);
        return (
          <div
            key={t.id}
            role="button"
            tabIndex={0}
            onClick={apri}
            onKeyDown={attivaConTastiera(apri)}
            style={{
            position: "absolute", top,
            left: `calc(${col * colW}% + 1px)`,
            width: `calc(${colW}% - 3px)`,
            height,
            background: (cat.color || "#94a3b8") + "22",
            borderLeft: `2px solid ${cat.color || "#94a3b8"}`,
            borderRadius: "0 4px 4px 0", padding: "2px 5px",
            cursor: "pointer", overflow: "hidden", fontSize: 10, lineHeight: 1.2,
          }}>
            <div style={stiliComuni.nomeTroncato}>
              {cat.icon} {t.title}
            </div>
            <div style={txtF9Muted}>{formatTime(t.dueDate)}</div>
          </div>
        );
      })}
    </div>
  );
});
