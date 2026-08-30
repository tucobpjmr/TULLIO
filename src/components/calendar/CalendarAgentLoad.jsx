// src/components/calendar/CalendarAgentLoad.jsx
// "Distribuzione settimanale per agente": la tabella carico-agenti sotto il
// calendario.
//
// PERCHÉ È USCITA DA CalendarPlanner.jsx (M-5, audit del 25 agosto). Il
// planner ospitava tre lavori: la navigazione fra le quattro viste (mese,
// settimana, settimana piena, giorno), il DISEGNO di ciascuna, e questa
// tabella — che non è una vista del calendario affatto. Non risponde a «cosa
// succede questo giorno» ma a «chi è carico questa settimana», è sempre
// visibile qualunque vista sia scelta, e non condivide con le altre nemmeno
// una riga di layout.
//
// Le due griglie orarie erano già uscite per la stessa ragione
// (CalendarDayGrid, CalendarWeekGrid): qui si completa il criterio.
import { memo, useMemo } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { isActiveTask } from "../../lib/taskUtils.js";
import { chiaveGiorno, chiaveGiornoDaISO } from "../../lib/chiaveGiorno.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF11Bold, boxF11Bold2, overflowX2, padding2, txt, txtBoldHeading, txtF12WFull,
  txtF16Bold2,
} from "./calendarPlannerStyles.js";

/**
 * @param {object}   props
 * @param {Array}    props.tasks         tutti i task (il conteggio filtra da sé).
 * @param {Date[]}   props.giorni        i sette giorni della settimana mostrata.
 * @param {string[]} props.nomiGiorni    le etichette Lun…Dom.
 * @param {Array}    props.team          i membri assegnabili.
 * @param {string?}  props.catFilter     il filtro categoria attivo nel planner.
 * @param {boolean}  props.isMobile
 */
// `catFilter` (stringa o null) al posto di `matchesCat` (funzione): una
// funzione nuova a ogni render del planner impedirebbe al `memo` di chiudere.
export const CalendarAgentLoad = memo(function CalendarAgentLoad({ tasks, giorni, nomiGiorni, team, catFilter, isMobile }) {
  // Un indice (agente, giorno) → conteggio, con UNA passata sui task. Prima
  // `carico(m, giorno)` rifiltrava l'intero elenco per ogni cella e una
  // SECONDA volta per il totale di riga: team × 7 × 2 scansioni complete.
  const carichi = useMemo(() => {
    const idx = new Map();
    for (const t of tasks) {
      if (!isActiveTask(t) || !t.dueDate) continue;
      if (catFilter && t.category !== catFilter) continue;
      const k = chiaveGiornoDaISO(t.dueDate);
      if (k === null) continue;
      for (const a of t.assignees || []) {
        const chiave = `${a}|${k}`;
        idx.set(chiave, (idx.get(chiave) || 0) + 1);
      }
    }
    return idx;
  }, [tasks, catFilter]);

  const carico = (membroId, giorno) =>
    carichi.get(`${membroId}|${chiaveGiorno(giorno)}`) || 0;

  return (
    <div style={{ background: "var(--card)", borderRadius: 12, padding: isMobile ? "14px 12px" : "20px 22px", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", border: "1px solid var(--border)" }}>
      <div className="playfair" style={txtF16Bold2}>Distribuzione Settimanale per Agente</div>
      <div style={overflowX2}>
        <table style={txtF12WFull}>
          <thead>
            <tr>
              <th style={boxF11Bold}>Agente</th>
              {giorni.map((d, i) => (
                <th key={i} style={{
                  padding: "8px 6px", background: "var(--surface2)", fontSize: 11, fontWeight: 600,
                  color: d.toDateString() === new Date().toDateString() ? "var(--gold)" : "var(--text-muted)",
                  textAlign: "center", minWidth: 70
                }}>
                  {nomiGiorni[i]}<br />{d.getDate()}
                </th>
              ))}
              <th style={boxF11Bold2}>TOT</th>
            </tr>
          </thead>
          <tbody>
            {team.map(m => {
              // I sette valori si calcolano UNA volta: il totale è la loro
              // somma, non una seconda passata sulle stesse sette celle.
              const perGiorno = giorni.map(d => carico(m.id, d));
              const totale = perGiorno.reduce((n, c) => n + c, 0);
              return (
                <tr key={m.id}>
                  <td style={padding2}>
                    <div style={stiliComuni.rowCenterGap8}>
                      <Avatar memberId={m.id} size={24} />
                      <span style={txt}>{m.name.split(" ")[0]}</span>
                    </div>
                  </td>
                  {perGiorno.map((count, i) => (
                    <td key={i} style={{
                      padding: "8px 6px", textAlign: "center", borderBottom: "1px solid var(--border)",
                      background: count > 0 ? m.color + "12" : "transparent",
                    }}>
                      {count > 0 ? (
                        <span style={{ fontWeight: 700, color: m.color, fontSize: 14 }}>{count}</span>
                      ) : <span style={stiliComuni.txtMuted}>—</span>}
                    </td>
                  ))}
                  <td style={txtBoldHeading}>
                    {totale}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
