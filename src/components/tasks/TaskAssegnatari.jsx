// src/components/tasks/TaskAssegnatari.jsx
// Il campo ASSEGNATI del pannello task: i chip di chi ci lavora, il "＋
// Aggiungi" e il menu di scelta.
//
// PERCHÉ È USCITO DA TaskSlideOver.jsx (M-5, audit del 25 agosto). Il pannello
// faceva quattro lavori: i campi del task (bozza locale, commit al blur), gli
// assegnatari, i commenti e il montaggio dei due pannelli figli (allegati,
// cronologia). Il primo è il pannello; gli altri due hanno una forma
// riconoscibile — stato proprio, regole proprie, un pezzo di JSX che non parla
// con il resto — e sono usciti insieme al loro stato.
//
// Qui vive `showAssigneePicker`, che è UI effimera di questo campo e di nessun
// altro: finché stava nel pannello, un aperto/chiuso del menu ri-renderizzava
// anche i commenti, la descrizione e i due pannelli figli.
import { useState } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { roleLabel } from "../../lib/taskConstants.js";
import { Z } from "../../styles/tokens.js";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF12Muted, rowCenterGap5, rowCenterGap6, rowCenterGap8, txtF11Bold, txtF12,
} from "./taskSlideOverStyles.js";

/**
 * @param {object}   props
 * @param {string[]} props.assegnati        gli id attualmente assegnati.
 * @param {Array}    props.disponibili      i membri che si possono ancora aggiungere.
 * @param {boolean}  props.editable
 * @param {Function} props.getMember
 * @param {Function} props.onChange         riceve il nuovo elenco completo di id.
 */
export function TaskAssegnatari({ assegnati, disponibili, editable, getMember, onChange }) {
  const [apertoIlMenu, setApertoIlMenu] = useState(false);

  const aggiungi = (memberId) => {
    if (!memberId || assegnati.includes(memberId)) return;
    onChange([...assegnati, memberId]);
    setApertoIlMenu(false);
  };
  const rimuovi = (memberId) => onChange(assegnati.filter((id) => id !== memberId));

  return (
    <div style={stiliComuni.relative}>
      <div style={txtF11Bold}>ASSEGNATI</div>
      <div style={rowCenterGap6}>
        {assegnati.map(id => {
          const m = getMember(id);
          return m ? (
            <div key={id} style={rowCenterGap5}>
              <Avatar memberId={id} size={20} />
              <span style={txtF12}>{m.name.split(" ")[0]}</span>
              {editable && (
                <button
                  onClick={() => rimuovi(id)}
                  title="Rimuovi assegnatario"
                  style={boxF12Muted}
                  onMouseEnter={e => e.currentTarget.style.color = "var(--danger)"}
                  onMouseLeave={e => e.currentTarget.style.color = "var(--text-muted)"}
                >✕</button>
              )}
            </div>
          ) : null;
        })}
        {!assegnati.length && (
          <span style={stiliComuni.txtF13Muted}>Non assegnato</span>
        )}
        {editable && disponibili.length > 0 && (
          <button
            onClick={() => setApertoIlMenu(v => !v)}
            title="Aggiungi assegnatario"
            style={{
              background: apertoIlMenu ? "var(--navy)" : "var(--surface2)",
              color: apertoIlMenu ? "#fff" : "var(--navy)",
              border: "1px dashed var(--border)", borderRadius: 99,
              padding: "4px 10px", fontSize: 12, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >＋ Aggiungi</button>
        )}
      </div>
      {editable && apertoIlMenu && disponibili.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: Z.local,
          background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 10px 30px rgba(0,0,0,0.12)", padding: 6,
          minWidth: 180, maxHeight: 220, overflowY: "auto",
        }}>
          {disponibili.map(m => (
            <button
              key={m.id}
              onClick={() => aggiungi(m.id)}
              style={rowCenterGap8}
              onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >
              <Avatar memberId={m.id} size={22} />
              <span style={stiliComuni.flex1}>{m.name}</span>
              <span style={stiliComuni.txtF10Muted}>{roleLabel(m)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
