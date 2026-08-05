// src/components/tasks/TaskCard.jsx
// Card e riga di un task, in un posto solo.
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
// MEMO. Entrambi i componenti sono `memo`: le code renderizzano liste lunghe e
// finora ogni cambio di state — un toast, un tick di presence — ri-renderizzava
// ogni card. Perché il memo serva davvero, gli slot passati dai chiamanti non
// devono essere ricreati a ogni render senza motivo.

import { memo } from "react";
import { useAppData } from "../../state/AppDataContext.jsx";

// Fallback per una categoria non più presente nel dizionario (categoria
// eliminata dall'admin mentre dei task la usavano ancora): senza, l'accesso a
// `.icon`/`.label` esploderebbe. Era ripetuto verbatim in ogni call site.
// Funzione pura (dizionario esplicito): i componenti qui sotto le passano
// `categories` dal contesto app.
const catMeta = (categories, category) =>
  (categories || {})[category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: category };

const CategoryPill = ({ category }) => {
  const { categories } = useAppData();
  const c = catMeta(categories, category);
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "3px 8px", borderRadius: 999,
      background: c.bg, color: c.color,
      fontSize: 11, fontWeight: 600,
    }}>
      <span>{c.icon}</span> {c.label}
    </div>
  );
};

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
    <div
      title={tooltip}
      onClick={openAll}
      onMouseEnter={hoverLift ? lift(true) : undefined}
      onMouseLeave={hoverLift ? lift(false) : undefined}
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          {showCategory ? <CategoryPill category={task.category} /> : <span />}
          {badges}
        </div>
      )}

      <div
        onClick={openTitle}
        style={{
          fontSize: 14, fontWeight: 600, color: titleColor, lineHeight: 1.35,
          ...(openTitle ? { cursor: "pointer" } : null),
        }}
      >
        {task.title}
      </div>

      {subheader}

      {hasMeta && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
          {showClient && task.client && <span>👤 {task.client}</span>}
          {meta}
        </div>
      )}

      {footer}
    </div>
  );
});

/**
 * Variante "riga": icona categoria, titolo con sottotitolo, badge in coda.
 * Usata dove il task è una voce di elenco e non una card (Scadenze Prossime,
 * agenda del Calendario, task del cliente nel CRM).
 *
 * @param {ReactNode} subtitle  seconda riga sotto il titolo (data, cliente, orario…)
 * @param {ReactNode} trailing  slot in coda (badge priorità/stato)
 * @param {string}    hoverBg   sfondo al passaggio del mouse; assente = nessun hover
 */
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
  return (
    <div
      onClick={onOpen ? () => onOpen(task) : undefined}
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {task.title}
        </div>
        {subtitle != null && (
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{subtitle}</div>
        )}
      </div>
      {trailing}
    </div>
  );
});
