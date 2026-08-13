// ─── TRASH ───────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { memo, useState } from "react";
import { useViewport } from "../Viewport.jsx";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { PRIORITIES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, getTrashedTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { Modal } from "../ui/Modal.jsx";
import { useConfirm } from "../../state/ConfirmContext.jsx";
// Filtro per periodo e chip di selezione: condivisi con Archive.jsx e
// ArchivedListe.jsx (A-3, audit del 12 agosto). Erano una terza copia locale,
// identica salvo il campo data cablato su `deletedAt` — la stessa domanda
// ("mostrami solo l'ultimo mese") ridefinita tre volte invece di una.
import { PERIOD_OPTIONS, filterByPeriod, chipStyle } from "./archiveFilters.js";
import {
  btnChiudiSuScuro, btnDangerMini, btnGhostMini, btnNavyMini, card, cardVuota, cardVuotaAlta,
  cella, cellaAzioni, cellaMuted, grid2ColGap12, rigaIntestazione, rowCenterGap82, rowGap4,
  rowGap62, tabella, txtF11Bold, txtF12Muted, txtF13Muted, txtF14Bold, txtF16Bold, txtF36Mb12,
  txtF48Mb16, txtMuted,
} from "../../styles/common.js";
import {
  borderBottom2, boxF13Bold, boxF13Bold2, boxF13WFull, boxF13WFull2, boxF14WFull, colGap16,
  maxW1200, padding2, padding3, rowCenterBetween, rowCenterGap6, rowGap10, rowGap6,
  rowStartBetween, txtBoldHeading, txtF11Bold2, txtF11Bold3, txtF11Bold4, txtF11Mt2, txtF18Bold,
  txtF28Bold, txtWhite,
} from "./trashStyles.js";

// `memo` + lettura dal contesto: senza il memo il provider non servirebbe a
// nulla, perché il genitore ri-renderizza a ogni azione (vedi
// state/TasksContext.jsx). `dispatch` ha identità stabile, quindi il confronto
// shallow riesce e il render si salta finché non cambiano davvero i task.
// `loading` (criticità #6): un cestino "vuoto" mostrato prima del caricamento
// è particolarmente insidioso — è la vista in cui si va a cercare qualcosa che
// si crede eliminato per sbaglio, e la risposta sbagliata chiude la ricerca.
export const Trash = memo(function Trash({ dispatch, loading = false }) {
  const conferma = useConfirm();
  const { isMobile } = useViewport();
  const { categories, currentUserId, getAssignableTeam, canEditTask, getVisibleTasks } = useAppData();
  const tasks = useTasks();
  const [restoring, setRestoring] = useState(null); // task being restored/edited
  const [period, setPeriod] = useState("all");
  const me = currentUserId;
  // La LISTA mostra tutti i task cestinati che l'utente può VEDERE (canViewTask,
  // via getVisibleTasks) — stesso pattern di Archive.jsx: chi ha solo permesso di
  // visualizzazione su un task (es. stakeholder in sola lettura, o ruolo che vede
  // ma non gestisce quella categoria) deve poterlo vedere anche cestinato, non
  // solo quando è completato/archiviato.
  // Le AZIONI di ripristino/eliminazione restano invece gated da canEditTask
  // (admin: tutti; manager/agent: propri + coda globale; driver: solo transfer
  // propri/globali) — prerogativa di status, applicata sia qui in UI (toast di
  // errore) sia a valle nel reducer (RESTORE_TASK/PURGE_TASK/EMPTY_TRASH).
  const trashed = getVisibleTasks(getTrashedTasks(tasks), me)
    .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt));
  const visible = filterByPeriod(trashed, period, "deletedAt");
  const editableCount = trashed.filter(t => canEditTask(t, me)).length;
  // "Sto ancora caricando e non ho ancora nulla": vedi Dashboard.jsx.
  const caricando = loading && tasks.length === 0;

  const handleRestore = (task) => {
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi ripristinare questo task" } });
      return;
    }
    setRestoring({ ...task });
  };

  const handleConfirmRestore = () => {
    if (!restoring) return;
    const { deletedAt, ...updates } = restoring;
    dispatch({ type: "UPDATE_TASK", payload: updates });
    dispatch({ type: "RESTORE_TASK", payload: restoring.id });
    setRestoring(null);
  };

  const handlePurge = async (task) => {
    if (!canEditTask(task, me)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi eliminare definitivamente questo task" } });
      return;
    }
    if (await conferma({
      title: "Eliminare definitivamente?",
      body: `"${task.title}" verrà rimosso per sempre. L'azione è irreversibile.`,
      cta: "Elimina per sempre", danger: true,
    })) {
      dispatch({ type: "PURGE_TASK", payload: task.id });
    }
  };

  const handleEmpty = async () => {
    if (trashed.length === 0) return;
    if (editableCount === 0) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non hai permessi per svuotare il cestino" } });
      return;
    }
    if (await conferma({
      title: "Svuotare il cestino?",
      body: `${editableCount} task verranno eliminati definitivamente. Azione irreversibile.`,
      cta: "Svuota il cestino", danger: true,
    })) {
      dispatch({ type: "EMPTY_TRASH" });
    }
  };

  const updateField = (field, value) => setRestoring(prev => ({ ...prev, [field]: value }));

  return (
    <div className="vd-pad" style={maxW1200}>
      {/* Header */}
      <div style={rowStartBetween}>
        <div>
          <div className="playfair" style={txtF28Bold}>
            🗑️ Cestino
          </div>
          <div style={txtF13Muted}>
            {caricando
              ? "Caricamento del cestino…"
              : trashed.length === 0
              ? "Nessun task nel cestino"
              : period !== "all"
                ? `${visible.length} di ${trashed.length} task — filtrati per periodo`
                : `${trashed.length} task ${trashed.length === 1 ? "eliminato" : "eliminati"}. Ripristinali o rimuovili definitivamente.`
            }
          </div>
        </div>
        {trashed.length > 0 && (
          <button onClick={handleEmpty} style={boxF13Bold}>🔥 Svuota cestino</button>
        )}
      </div>

      {/* Filtro periodo — solo se ci sono task */}
      {trashed.length > 0 && (
        <div style={rowCenterGap82}>
          <span style={txtF11Bold}>Periodo:</span>
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setPeriod(opt.key)}
              style={chipStyle(period === opt.key)}
            >{opt.label}</button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {caricando ? (
        <SkeletonCards count={4} label="Caricamento del cestino" />
      ) : trashed.length === 0 ? (
        <div style={cardVuotaAlta}>
          <div style={txtF48Mb16}>🗑️</div>
          <div style={txtF16Bold}>
            Cestino vuoto
          </div>
          <div style={txtF13Muted}>
            I task eliminati appariranno qui. Potrai ripristinarli o rimuoverli definitivamente.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div style={cardVuota}>
          <div style={txtF36Mb12}>📭</div>
          <div style={txtF14Bold}>
            Nessun task nel periodo selezionato
          </div>
          <button type="button" onClick={() => setPeriod("all")} style={btnGhostMini}>Mostra tutti</button>
        </div>
      ) : (
        /* Trash table */
        <div style={card}>
          <table style={tabella}>
            <thead>
              <tr style={rigaIntestazione}>
                <th style={txtF11Bold2}>TASK</th>
                <th style={txtF11Bold3}>CATEGORIA</th>
                <th style={txtF11Bold3}>CLIENTE</th>
                <th style={txtF11Bold3}>ASSEGNATI</th>
                <th style={txtF11Bold3}>ELIMINATO</th>
                <th style={txtF11Bold4}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(task => (
                <tr key={task.id} style={borderBottom2}
                  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={padding2}>
                    <div style={txtBoldHeading}>{task.title}</div>
                    <div style={rowCenterGap6}>
                      <PriorityBadge priority={task.priority} />
                      <span>• {STATUS_LABELS[task.status]}</span>
                    </div>
                  </td>
                  <td style={padding3}>
                    <CategoryChip category={task.category} />
                  </td>
                  <td style={cella}>
                    {task.client || <span style={txtMuted}>—</span>}
                  </td>
                  <td style={padding3}>
                    <div style={rowGap4}>
                      {task.assignees?.length
                        ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                        : <span style={txtF12Muted}>—</span>
                      }
                    </div>
                  </td>
                  <td style={cellaMuted}>
                    {formatDate(task.deletedAt)}
                  </td>
                  <td style={cellaAzioni}>
                    <div style={rowGap62}>
                      <button onClick={() => handleRestore(task)} title="Ripristina con modifica" style={btnNavyMini}>↻ Ripristina</button>
                      <button onClick={() => handlePurge(task)} title="Elimina definitivamente" style={btnDangerMini}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── MODALE RIPRISTINO CON MODIFICA ───
          Il guscio (portale, overlay, Esc, blocco dello scroll di fondo,
          role="dialog") arriva da ui/Modal.jsx. La card NON introduce transform:
          dentro ci vive il backdrop mobile del DateTimePicker (campo SCADENZA),
          che con un antenato trasformato resterebbe confinato — e scrollabile —
          dentro la card invece di coprire lo schermo.
          `closeOnOverlay={false}`: qui si modificano otto campi prima di
          confermare, un click a lato non deve buttarli via. */}
      {restoring && (
        <Modal
          open
          onClose={() => setRestoring(null)}
          labelledBy="vd-trash-restore-title"
          width={isMobile ? "calc(100vw - 32px)" : 520}
          closeOnOverlay={false}
          cardStyle={{
            borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
            display: "flex", flexDirection: "column",
          }}
        >
          {/* Modal header */}
          <div style={rowCenterBetween}>
            <div style={txtWhite}>
              <div id="vd-trash-restore-title" className="playfair" style={txtF18Bold}>↻ Ripristina task</div>
              <div style={txtF11Mt2}>Modifica i campi se necessario, poi conferma</div>
            </div>
            <button onClick={() => setRestoring(null)} style={btnChiudiSuScuro}>✕</button>
          </div>

          {/* Modal body */}
          <div style={colGap16}>
            {/* Titolo */}
            <div>
              <label className="vd-field-label">TITOLO</label>
              <input
                value={restoring.title}
                onChange={e => updateField("title", e.target.value)}
                style={boxF14WFull}
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Categoria + Priorità */}
            <div style={grid2ColGap12}>
              <div>
                <label className="vd-field-label">CATEGORIA</label>
                <select
                  value={restoring.category}
                  onChange={e => updateField("category", e.target.value)}
                  style={boxF13WFull}
                >
                  {Object.entries(categories).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="vd-field-label">PRIORITÀ</label>
                <select
                  value={restoring.priority}
                  onChange={e => updateField("priority", e.target.value)}
                  style={boxF13WFull}
                >
                  {Object.entries(PRIORITIES).map(([k, v]) => (
                    <option key={k} value={k}>{v.icon} {v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stato + Scadenza */}
            <div style={grid2ColGap12}>
              <div>
                <label className="vd-field-label">STATO</label>
                <select
                  value={restoring.status}
                  onChange={e => updateField("status", e.target.value)}
                  style={boxF13WFull}
                >
                  {Object.entries(STATUS_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="vd-field-label">SCADENZA</label>
                <DateTimePicker
                  value={restoring.dueDate || null}
                  onChange={iso => updateField("dueDate", iso)}
                  align="right"
                />
              </div>
            </div>

            {/* Cliente */}
            <div>
              <label className="vd-field-label">CLIENTE</label>
              <input
                value={restoring.client || ""}
                onChange={e => updateField("client", e.target.value)}
                style={boxF14WFull}
                placeholder="Nome cliente"
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>

            {/* Assegnatari */}
            <div>
              <label className="vd-field-label">ASSEGNATARI</label>
              <div style={rowGap6}>
                {getAssignableTeam().map(m => {
                  const sel = restoring.assignees?.includes(m.id);
                  return (
                    <button key={m.id}
                      onClick={() => {
                        const curr = restoring.assignees || [];
                        updateField("assignees", sel ? curr.filter(x => x !== m.id) : [...curr, m.id]);
                      }}
                      style={{
                        padding: "6px 12px", borderRadius: 99,
                        border: sel ? "2px solid var(--navy)" : "1px solid var(--border)",
                        background: sel ? "var(--navy)" : "var(--card)",
                        color: sel ? "#fff" : "var(--text)",
                        fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                        display: "flex", alignItems: "center", gap: 5,
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{
                        width: 20, height: 20, borderRadius: 99,
                        background: sel ? "rgba(255,255,255,0.2)" : m.color, color: "#fff",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 9, fontWeight: 700,
                      }}>{m.avatar}</span>
                      {m.name.split(" ")[0]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Descrizione */}
            <div>
              <label className="vd-field-label">DESCRIZIONE</label>
              <textarea
                value={restoring.description || ""}
                onChange={e => updateField("description", e.target.value)}
                rows={3}
                style={boxF13WFull2}
                placeholder="Descrizione task..."
                onFocus={e => e.target.style.borderColor = "var(--gold)"}
                onBlur={e => e.target.style.borderColor = "var(--border)"}
              />
            </div>
          </div>

          {/* Modal footer */}
          <div style={rowGap10}>
            <button onClick={() => setRestoring(null)} style={boxF13Bold2}>Annulla</button>
            <button
              onClick={handleConfirmRestore}
              disabled={!restoring.title?.trim()}
              style={{
                background: restoring.title?.trim() ? "var(--navy)" : "var(--surface3)",
                color: restoring.title?.trim() ? "#fff" : "var(--text-muted)",
                border: "none",
                padding: "10px 20px", borderRadius: 8, cursor: restoring.title?.trim() ? "pointer" : "not-allowed",
                fontSize: 13, fontWeight: 700, fontFamily: "inherit",
                boxShadow: restoring.title?.trim() ? "0 4px 14px rgba(15,32,68,0.3)" : "none",
                display: "flex", alignItems: "center", gap: 6,
              }}
            >↻ Conferma ripristino</button>
          </div>
        </Modal>
      )}
    </div>
  );
});
