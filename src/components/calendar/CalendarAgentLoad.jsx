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
import { Avatar } from "../ui/Avatar.jsx";
import { isActiveTask } from "../../lib/taskUtils.js";
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
 * @param {Function} props.matchesCat    il filtro categoria attivo nel planner.
 * @param {boolean}  props.isMobile
 */
export function CalendarAgentLoad({ tasks, giorni, nomiGiorni, team, matchesCat, isMobile }) {
  // Quanti task attivi ha questo agente in questo giorno, col filtro categoria
  // del planner già applicato. Una definizione sola, letta dalla cella e dal
  // totale di riga: prima erano due `filter` gemelli che potevano divergere.
  const carico = (m, giorno) => tasks.filter(t =>
    isActiveTask(t) && t.assignees?.includes(m.id) && t.dueDate
    && new Date(t.dueDate).toDateString() === giorno.toDateString() && matchesCat(t)
  ).length;

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
            {team.map(m => (
              <tr key={m.id}>
                <td style={padding2}>
                  <div style={stiliComuni.rowCenterGap8}>
                    <Avatar memberId={m.id} size={24} />
                    <span style={txt}>{m.name.split(" ")[0]}</span>
                  </div>
                </td>
                {giorni.map((day, i) => {
                  const count = carico(m, day);
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
                  {giorni.reduce((n, d) => n + carico(m, d), 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
