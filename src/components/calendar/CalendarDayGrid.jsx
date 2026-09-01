// ─── VISTA GIORNO ────────────────────────────────────────────────────────────
// Griglia oraria di un singolo giorno. Era una IIFE dentro il return di
// CalendarPlanner: già un'unità di render a sé, ma anonima — e il file era il
// più lungo della codebase. Come componente ha un nome nei DevTools e monta
// solo quando la vista è davvero quella (il corpo dell'IIFE, per contro, veniva
// valutato dentro il render del calendario).
//
// A-3 · La prop `tasks` (l'elenco INTERO, non solo quello del giorno) è uscita
// con l'espansione delle ricorrenze: serviva solo a risalire dall'istanza
// virtuale al task originale via `originalId`. Senza istanze virtuali il task
// su cui si clicca è già quello vero, e la griglia non ha più bisogno di
// conoscere task che non mostra.
import { memo, useMemo } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { formatTime } from "../../lib/taskUtils.js";
import { Z } from "../../styles/tokens.js";
import { layoutColumns } from "./calendarLayout.js";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera } from "../../lib/a11y.js";

// Costanti a livello di modulo, non ricostruite a ogni render — stessa
// convenzione degli stili qui sotto (M-1 dell'audit del 12 agosto), applicata
// anche a `HOURS`/`SLOT_H` (P-4 dell'audit del 30 agosto).
const HOURS = Array.from({ length: 24 }, (_, h) => h);
const SLOT_H = 44; // px per ora

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = {
  padding: "10px 14px", background: "var(--surface2)",
  fontSize: 12, color: "var(--text-muted)", fontWeight: 600,
  display: "flex", justifyContent: "space-between", alignItems: "center",
};
const txtGold = { color: "var(--gold)" };
const rowRelative = { position: "relative", display: "flex", maxHeight: 640, overflowY: "auto" };
const w56 = { width: 56, flexShrink: 0, borderRight: "1px solid var(--border)" };
const relativeFlex1 = { flex: 1, position: "relative" };
const boxAbsoluteW10 = {
  position: "absolute", left: -4, top: -4, width: 10, height: 10,
  borderRadius: "50%", background: "var(--gold)",
};
const txtBoldText = { fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };
const rowCenterBetween2 = { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 1 };
const rowGap2 = { display: "flex", gap: 2, flexShrink: 0 };
const txtF9Muted = { fontSize: 9, color: "var(--text-muted)" };

// `dayTasks` arriva già filtrato e ordinato dall'indice `perGiorno` del
// planner (P-1): niente più filtro/sort qui dentro, e soprattutto niente
// `.sort()` in place, perché l'array è CONDIVISO fra le celle che lo leggono.
export const CalendarDayGrid = memo(function CalendarDayGrid({ dayDate, dayTasks, categories, onOpenTask }) {
  const laid = useMemo(() => layoutColumns(dayTasks), [dayTasks]);
  const isToday = dayDate.toDateString() === new Date().toDateString();
  const nowMinutes = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : null;
  return (
    <div style={stiliComuni.cardElevata}>
      <div style={rowCenterBetween}>
        <span>{dayTasks.length} task in agenda</span>
        {isToday && <span style={txtGold}>● Oggi</span>}
      </div>
      <div style={rowRelative}>
        {/* Colonna ore */}
        <div style={w56}>
          {HOURS.map(h => (
            <div key={h} style={{
              height: SLOT_H, padding: "2px 8px", fontSize: 10, color: "var(--text-muted)",
              textAlign: "right", borderBottom: "1px solid var(--surface2)",
            }}>{String(h).padStart(2, "0")}:00</div>
          ))}
        </div>
        {/* Colonna eventi */}
        <div style={relativeFlex1}>
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
              height: 2, background: "var(--gold)", zIndex: Z.cardRaised,
            }}>
              <div style={boxAbsoluteW10} />
            </div>
          )}
          {/* Eventi con layout colonne anti-overlap */}
          {laid.map(({ task: t, col, totalCols }) => {
            const d = new Date(t.dueDate);
            const startMin = d.getHours() * 60 + d.getMinutes();
            const hours = Math.max(0.25, Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : 1);
            const top = (startMin / 60) * SLOT_H;
            const height = Math.max(28, hours * SLOT_H - 2);
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
                left: `calc(${col * colW}% + 3px)`,
                width: `calc(${colW}% - 6px)`,
                height,
                background: (cat.color || "#94a3b8") + "22",
                borderLeft: `3px solid ${cat.color || "#94a3b8"}`,
                borderRadius: "0 6px 6px 0", padding: "4px 8px",
                cursor: "pointer", overflow: "hidden", fontSize: 12,
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)", zIndex: Z.inCard,
              }}>
                <div style={txtBoldText}>
                  {cat.icon} {t.title}
                </div>
                <div style={rowCenterBetween2}>
                  <span style={stiliComuni.txtF10Muted}>{formatTime(t.dueDate)}</span>
                  {t.assignees?.length > 0 && height >= 42 && (
                    <div style={rowGap2}>
                      {t.assignees.slice(0, 3).map(id => (
                        <Avatar key={id} memberId={id} size={14} />
                      ))}
                      {t.assignees.length > 3 && (
                        <span style={txtF9Muted}>+{t.assignees.length - 3}</span>
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
});
