// Estratto da TaskCard.jsx (B-3 dell'audit del 13 agosto: un file, un
// componente — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
//
// Variante "riga": icona categoria, titolo con sottotitolo, badge in coda.
// Usata dove il task è una voce di elenco e non una card (Scadenze Prossime,
// agenda del Calendario, task del cliente nel CRM).
//
// @param {ReactNode} subtitle  seconda riga sotto il titolo (data, cliente, orario…)
// @param {ReactNode} trailing  slot in coda (badge priorità/stato)
// @param {string}    hoverBg   sfondo al passaggio del mouse; assente = nessun hover
import { memo } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";
import { catMeta } from "./taskCardShared.js";
import * as stiliComuni from "../../styles/common.js";
import { attivaConTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF13 = { fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" };

export const TaskRow = memo(function TaskRow({
  task,
  onOpen,
  subtitle = null,
  trailing = null,
  background = "transparent",
  border = "1px solid var(--border)",
  hoverBg = "var(--surface2)",
  iconSize = 16,
  padding = "8px 10px",
  gap = 10,
}) {
  const { categories } = useAppData();
  const apriTask = onOpen ? () => onOpen(task) : undefined;
  return (
    // role="button" resta letterale per superare la regola statica di jsx-a11y
    // (vedi TaskCard.jsx); tabIndex e onKeyDown restano legati a `onOpen`, quindi
    // una riga senza onOpen non entra nell'ordine di tabulazione.
    <div
      role="button"
      tabIndex={apriTask ? 0 : undefined}
      onClick={apriTask}
      onKeyDown={apriTask ? attivaConTastiera(apriTask) : undefined}
      onMouseEnter={hoverBg ? (e) => { e.currentTarget.style.background = hoverBg; } : undefined}
      onMouseLeave={hoverBg ? (e) => { e.currentTarget.style.background = background; } : undefined}
      style={{
        display: "flex", alignItems: "center", gap, padding,
        borderRadius: 8, border, background,
        ...(onOpen ? { cursor: "pointer" } : null),
        transition: "background 0.15s",
      }}
    >
      <span style={{ fontSize: iconSize }}>{catMeta(categories, task.category).icon}</span>
      <div className="vd-flex-1-min0">
        <div style={txtF13}>
          {task.title}
        </div>
        {subtitle != null && (
          <div style={stiliComuni.txtF11Muted}>{subtitle}</div>
        )}
      </div>
      {trailing}
    </div>
  );
});
