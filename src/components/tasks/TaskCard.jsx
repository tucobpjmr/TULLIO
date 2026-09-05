// src/components/tasks/TaskCard.jsx
// Card di un task.
//
// PERCHÉ ESISTE. Lo stesso scheletro — chip categoria + badge a destra, titolo,
// riga meta con cliente e scadenza, footer opzionale — era riscritto a mano in
// cinque punti (le quattro code della Dashboard e la card mobile dell'Archivio)
// e la variante "riga" in altri tre (Scadenze Prossime, agenda del Calendario,
// task del cliente nel CRM). Nessuna copia condivideva una riga di codice: le
// differenze fra loro erano già drift, non design — hover-lift presente in tre
// card su quattro, gap 8 in tre e 10 nella quarta, il fallback della categoria
// ripetuto identico otto volte.
//
// COSA È CONDIVISO E COSA NO. Qui vive lo scheletro: contenitore, spaziature,
// chip categoria (col suo fallback), titolo, wrapper della riga meta, footer.
// Restano al chiamante — via slot — le parti che sono davvero diverse: quale
// badge sta a destra (stato / priorità / read-only), come si formatta la
// scadenza (ogni coda ha il suo testo: "⚠ scaduto", "⏱ < 24h", "(scaduto)"),
// e cosa c'è nel footer (prendi in carico, contatta, azioni archivio).
// Il criterio: se cambiarlo in un punto solo sarebbe un bug, è uno slot.
//
// La variante "riga" (TaskRow) e il chip categoria (CategoryPill) sono file a
// sé — TaskRow.jsx, CategoryPill.jsx, con l'helper condiviso catMeta in
// taskCardShared.js — (B-3 dell'audit del 13 agosto: un file, un componente,
// vedi docs/CLAUDE.md). Restano l'unica implementazione canonica di ciascuno,
// solo organizzata su più file invece che in uno: nessuna delle tre torna a
// essere copiata ad ogni call site.
//
// MEMO. TaskCard è `memo`: le code renderizzano liste lunghe e finora ogni
// cambio di state — un toast, un tick di presence — ri-renderizzava ogni
// card. Perché il memo serva davvero, gli slot passati dai chiamanti non
// devono essere ricreati a ogni render senza motivo.

import { memo } from "react";
import { CategoryPill } from "./CategoryPill.jsx";
import { attivaConTastiera, conTastiera } from "../../lib/a11y.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterBetween = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 };
const rowGap10F11 = { display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" };

const lift = (on) => (e) => {
  e.currentTarget.style.transform = on ? "translateY(-1px)" : "none";
  e.currentTarget.style.boxShadow = on ? "0 4px 14px rgba(0,0,0,0.08)" : "none";
};

/**
 * Card verticale di un task.
 *
 * @param {object}    task           il task da mostrare
 * @param {function}  onOpen         (task) => void. Assente = card non cliccabile.
 * @param {ReactNode} badges         slot destro dell'header (StatusBadge, priorità, 🔒 read-only…)
 * @param {ReactNode} subheader      slot sotto il titolo (usato dall'Archivio per i suoi badge)
 * @param {ReactNode} meta           slot nella riga meta, dopo il cliente (di norma la scadenza)
 * @param {ReactNode} footer         slot in fondo (bottoni azione)
 * @param {string}    border         override del bordo (ogni coda ha la sua semantica di colore)
 * @param {string}    accent         colore del bordo sinistro (priorità); assente = nessun accento
 * @param {boolean}   hoverLift      solleva la card al passaggio del mouse
 * @param {boolean}   clickTitleOnly area cliccabile limitata al titolo (card con footer interattivo)
 * @param {boolean}   showCategory   mostra il chip categoria nell'header
 * @param {boolean}   showClient     mostra "👤 cliente" nella riga meta
 */
export const TaskCard = memo(function TaskCard({
  task,
  onOpen,
  badges = null,
  subheader = null,
  meta = null,
  footer = null,
  border = "1px solid var(--border)",
  accent = null,
  hoverLift = false,
  clickTitleOnly = false,
  showCategory = true,
  showClient = true,
  titleColor = "var(--text)",
  gap = 8,
  padding = 12,
  radius = 10,
  opacity,
  tooltip,
}) {
  const openAll = onOpen && !clickTitleOnly ? () => onOpen(task) : undefined;
  const openTitle = onOpen && clickTitleOnly ? () => onOpen(task) : undefined;
  const hasHeader = showCategory || badges;
  const hasMeta = (showClient && task.client) || meta;

  return (
    // A-2: `role="button"` è letterale perché deve esserlo per superare la
    // regola statica di jsx-a11y (non legge un'espressione condizionale) — ma
    // tabIndex e onKeyDown restano legati a `openAll`, quindi quando la card
    // non è cliccabile (nessun onOpen, o clickTitleOnly) non entra comunque
    // nell'ordine di tabulazione né risponde a Invio/Spazio.
    <div
      role="button"
      tabIndex={openAll ? 0 : undefined}
      title={tooltip}
      onClick={openAll}
      onKeyDown={openAll ? attivaConTastiera(openAll) : undefined}
      {...(hoverLift ? conTastiera(lift(true), lift(false)) : null)}
      style={{
        background: "var(--card)", borderRadius: radius, border,
        ...(accent ? { borderLeft: `3px solid ${accent}` } : null),
        padding, display: "flex", flexDirection: "column", gap,
        ...(openAll ? { cursor: "pointer" } : null),
        ...(hoverLift ? { transition: "transform 0.15s, box-shadow 0.15s" } : null),
        ...(opacity != null ? { opacity } : null),
        position: "relative",
      }}
    >
      {hasHeader && (
        <div style={rowCenterBetween}>
          {showCategory ? <CategoryPill category={task.category} /> : <span />}
          {badges}
        </div>
      )}

      <div
        role="button"
        tabIndex={openTitle ? 0 : undefined}
        onClick={openTitle}
        onKeyDown={openTitle ? attivaConTastiera(openTitle) : undefined}
        style={{
          fontSize: 14, fontWeight: 600, color: titleColor, lineHeight: 1.35,
          ...(openTitle ? { cursor: "pointer" } : null),
        }}
      >
        {task.title}
      </div>

      {subheader}

      {hasMeta && (
        <div style={rowGap10F11}>
          {showClient && task.client && <span>👤 {task.client}</span>}
          {meta}
        </div>
      )}

      {footer}
    </div>
  );
});
