// src/components/calendar/CalendarMonthGrid.jsx
// La vista MESE del planner: la griglia delle celle e, sotto, l'agenda del
// giorno selezionato.
//
// PERCHÉ È USCITA DA CalendarPlanner.jsx (M-5, audit del 25 agosto). Il planner
// disegnava quattro viste e ne aveva già estratte due (CalendarDayGrid,
// CalendarWeekGrid): il mese era rimasto in linea perché è quella "di default",
// non perché fosse diversa. Con la settimana piena — che è `CalendarWeekGrid`
// con un'altra prop — il planner torna a fare ciò che il suo nome dice:
// scegliere la vista, non disegnarla.
//
// La cella è responsive per DENSITÀ e non solo per dimensione: su mobile mostra
// dei pallini colorati (uno per task, fino a quattro), su desktop i titoli. Non
// è una scelta estetica — a 52px di altezza tre titoli troncati non si leggono,
// e il pallino risponde all'unica domanda che serve a quella scala («questo
// giorno è pieno?»).
import { SwipeActions } from "../tasks/SwipeActions.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { TaskRow } from "../tasks/TaskRow.jsx";
import { formatTime } from "../../lib/taskUtils.js";
import {
  boxR14, colGap2MinW0, colGap8, grid2, grid3, rowMiddleGap3, txtF10Muted,
  txtF12Bold, txtF16Bold,
} from "./calendarPlannerStyles.js";

/**
 * @param {object}   props
 * @param {Date}     props.mese            il mese mostrato.
 * @param {string[]} props.nomiGiorni      le etichette Lun…Dom.
 * @param {string}   props.nomeMese        "agosto 2026", per l'agenda del giorno.
 * @param {number?}  props.selectedDay     il giorno aperto (null = nessuno).
 * @param {Function} props.onSelectDay
 * @param {Function} props.tasksDelGiorno  (giorno) => i task di quel giorno.
 * @param {object}   props.categories
 * @param {Function} props.onOpenTask
 * @param {boolean}  props.isMobile
 */
export function CalendarMonthGrid({
  mese, nomiGiorni, nomeMese, selectedDay, onSelectDay,
  tasksDelGiorno, categories, onOpenTask, isMobile,
}) {
  const year = mese.getFullYear();
  const month = mese.getMonth();
  const today = new Date();
  // Lunedì primo: getDay() torna 0 per domenica, che nel nostro ordine è
  // l'ultima colonna.
  const primoGiorno = new Date(year, month, 1).getDay();
  const startOffset = primoGiorno === 0 ? 6 : primoGiorno - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const dettaglioGiorno = () => {
    const dayTasks = tasksDelGiorno(selectedDay);
    if (!dayTasks.length) return null;
    return (
      <div className="slide-up" style={{
        background: "var(--card)", borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 20px",
        boxShadow: "0 4px 20px rgba(0,0,0,0.1)", border: "1px solid var(--border)"
      }}>
        <div className="playfair" style={txtF16Bold}>
          Agenda del {selectedDay} {nomeMese}
        </div>
        <div style={colGap8}>
          {dayTasks.map(t => (
            <SwipeActions key={t.id} task={t}>
              <TaskRow
                task={t}
                onOpen={onOpenTask}
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
  };

  return (
    <>
      <div style={boxR14}>
        {/* Day headers */}
        <div style={grid2}>
          {nomiGiorni.map(d => (
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
            const dayTasks = tasksDelGiorno(day);
            const hasContent = dayTasks.length > 0;
            const isToday = today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
            return (
              <div key={day} onClick={() => onSelectDay(selectedDay === day ? null : day)} style={{
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
                      <div key={t.id} onClick={e => { e.stopPropagation(); onOpenTask(t); }} style={{
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
      {selectedDay && dettaglioGiorno()}
    </>
  );
}
