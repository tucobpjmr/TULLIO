// src/components/dashboard/queues/QueueShell.jsx
// Il guscio comune delle quattro code della Dashboard e il chip dei filtri.
//
// PERCHÉ ESISTE. Le quattro code ripetevano lo stesso identico markup —
// gradiente, bordo, raggio, padding responsive, ombra, testata con riquadro
// icona 34×34, titolo playfair e badge del conteggio — con l'unica differenza
// della tinta. Circa 240 righe di JSX di layout copiate quattro volte.
//
// Il costo non era la lunghezza, era il DRIFT: gli stessi chip di filtro
// esistevano in quattro varianti leggermente diverse (padding 3px vs 4px,
// font-weight 600 vs 700), e un bugfix sul guscio andava replicato quattro
// volte o le code divergevano in silenzio. Qui il guscio è uno solo e ogni
// coda porta la sua logica: filtro, ordinamento, lista.
//
// UNIFORMAZIONE: adottando questo componente le quattro code convergono sulla
// stessa metrica (chip 4px/11px/600, badge 4px 12px/13px/700). Le differenze
// che spariscono erano deriva accumulata, non scelte di design.

import { useViewport } from "../../ui/Viewport.jsx";
import * as stiliComuni from "../../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF17Bold = { fontSize: 17, fontWeight: 700, color: "var(--heading)" };

// Tinte delle code. `rgb` alimenta gradiente e bordo (che vogliono alpha),
// `solid` il riquadro icona e il badge (che vogliono la variabile di tema).
export const QUEUE_ACCENTS = {
  personal:   { rgb: "15,32,68",   bgA: 0.04, borderA: 0.15, solid: "var(--navy)",    fg: "#fff" },
  urgent:     { rgb: "200,131,42", bgA: 0.07, borderA: 0.35, solid: "var(--warning)", fg: "#fff" },
  unassigned: { rgb: "212,168,67", bgA: 0.05, borderA: 0.30, solid: "var(--gold)",    fg: "var(--navy)" },
  overdue:    { rgb: "192,57,43",  bgA: 0.05, borderA: 0.20, solid: "var(--danger)",  fg: "#fff" },
  waiting:    { rgb: "139,92,246", bgA: 0.06, borderA: 0.30, solid: "#8B5CF6",        fg: "#fff" },
};

/**
 * @param {'personal'|'urgent'|'unassigned'|'overdue'|'waiting'} accent
 * @param {ReactNode} icon        contenuto del riquadro 34×34 (emoji o iniziali)
 * @param {string}    [iconBg]    override del fondo icona (PersonalQueue usa il colore del membro)
 * @param {string}    [iconFg]
 * @param {string}    title
 * @param {ReactNode} [badge]     contenuto del badge conteggio; assente = nessun badge
 * @param {boolean}   [tight]     coda vuota: azzera il margine sotto la testata
 * @param {ReactNode} [filters]   riga dei filtri, sotto la testata
 */
export function QueueShell({
  accent, icon, iconBg, iconFg, iconSize = 18, title, badge = null,
  tight = false, filters = null, children,
}) {
  const { isMobile } = useViewport();
  const a = QUEUE_ACCENTS[accent] || QUEUE_ACCENTS.personal;
  return (
    <div style={{
      background: `linear-gradient(135deg, rgba(${a.rgb},${a.bgA}) 0%, rgba(${a.rgb},0.01) 100%)`,
      border: `1px solid rgba(${a.rgb},${a.borderA})`,
      borderRadius: 12, padding: isMobile ? "14px 12px" : "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
      minWidth: 0, overflow: "hidden",
    }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: tight ? 0 : 14, flexWrap: "wrap", gap: 8,
      }}>
        <div style={stiliComuni.rowCenterGap10}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: iconBg || a.solid, color: iconFg || a.fg,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: iconSize, fontWeight: 700,
          }}>{icon}</div>
          <div className="playfair" style={txtF17Bold}>
            {title}
          </div>
        </div>
        {badge != null && (
          <div style={{
            background: a.solid, color: a.fg,
            padding: "4px 12px", borderRadius: 999,
            fontSize: 13, fontWeight: 700,
          }}>{badge}</div>
        )}
      </div>
      {filters}
      {children}
    </div>
  );
}
