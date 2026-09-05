// ─── TRASH ───────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { memo, useMemo, useState } from "react";
import { Avatar } from "../ui/Avatar.jsx";
import { PriorityBadge } from "../ui/PriorityBadge.jsx";
import { CategoryChip } from "../ui/CategoryChip.jsx";
import { STATUS_LABELS } from "../../lib/taskConstants.js";
import { formatDate, getTrashedTasks } from "../../lib/taskUtils.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { useTasks } from "../../state/TasksContext.jsx";
import { useStoricoTaskCompleto } from "../../state/StoricoTaskContext.jsx";
import { SkeletonCards } from "../ui/SkeletonCards.jsx";
import { RipristinaTaskModal } from "./RipristinaTaskModal.jsx";
import { useConfirm } from "../../state/ConfirmContext.jsx";
// Filtro per periodo e chip di selezione: condivisi con Archive.jsx e
// ArchivedListe.jsx (A-3, audit del 12 agosto). Erano una terza copia locale,
// identica salvo il campo data cablato su `deletedAt` — la stessa domanda
// ("mostrami solo l'ultimo mese") ridefinita tre volte invece di una.
import { PERIOD_OPTIONS, filterByPeriod, chipStyle } from "./archiveFilters.js";
import { useFinestra } from "../../hooks/useFinestra.js";
import { MostraAltri } from "../ui/MostraAltri.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  borderBottom2, boxF13Bold, maxW1200, padding2, padding3, rowCenterGap6,
  rowStartBetween, txtBoldHeading, txtF11Bold2, txtF11Bold3, txtF11Bold4, txtF28Bold,
} from "./trashStyles.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

// M-2 · Quante righe si disegnano alla volta, come nell'Archivio.
const PAGINA = 24;

// `memo` + lettura dal contesto: senza il memo il provider non servirebbe a
// nulla, perché il genitore ri-renderizza a ogni azione (vedi
// state/TasksContext.jsx). `dispatch` ha identità stabile, quindi il confronto
// shallow riesce e il render si salta finché non cambiano davvero i task.
// `loading` (criticità #6): un cestino "vuoto" mostrato prima del caricamento
// è particolarmente insidioso — è la vista in cui si va a cercare qualcosa che
// si crede eliminato per sbaglio, e la risposta sbagliata chiude la ricerca.
export const Trash = memo(function Trash({ loading = false }) {
  const dispatch = useDispatch();
  const conferma = useConfirm();
  const { io } = useAppData();
  const tasks = useTasks();
  // A-3: dal 17 agosto l'idratazione non chiede più `includeDeleted`, quindi
  // il cestino non è in stato per costruzione — lo carica questa vista. È
  // anche quella in cui la risposta sbagliata costa di più: ci si viene a
  // cercare qualcosa che si crede eliminato per sbaglio, e un "Cestino vuoto"
  // chiude la ricerca invece di sospenderla.
  const caricandoStorico = useStoricoTaskCompleto();
  // Solo QUALE task si sta ripristinando: la bozza modificabile vive nella
  // modale, che si monta solo quando c'è qualcosa da ripristinare.
  const [restoring, setRestoring] = useState(null);
  const [period, setPeriod] = useState("all");
  // La LISTA mostra tutti i task cestinati che l'utente può VEDERE
  // (`io.taskVisibili`) — stesso pattern di Archive.jsx: chi ha solo permesso di
  // visualizzazione su un task (es. stakeholder in sola lettura, o ruolo che vede
  // ma non gestisce quella categoria) deve poterlo vedere anche cestinato, non
  // solo quando è completato/archiviato.
  // Le AZIONI di ripristino/eliminazione restano invece gated da `io.modificaTask`
  // (admin: tutti; manager/agent: propri + coda globale; driver: solo transfer
  // propri/globali) — prerogativa di status, applicata sia qui in UI (toast di
  // errore) sia a valle nel reducer (RESTORE_TASK/PURGE_TASK/EMPTY_TRASH).
  //
  // `useMemo` per la stessa ragione dell'Archivio (B-4): filtro dei cestinati,
  // controllo di permesso per riga e ordinamento sono tre passate su tutte le
  // task, e senza memo si rifacevano a ogni cambio di chip del periodo.
  const trashed = useMemo(
    () => io.taskVisibili(getTrashedTasks(tasks))
      .sort((a, b) => new Date(b.deletedAt) - new Date(a.deletedAt)),
    [tasks, io]);
  const visible = useMemo(
    () => filterByPeriod(trashed, period, "deletedAt"), [trashed, period]);
  const editableCount = useMemo(
    () => trashed.filter(t => io.modificaTask(t)).length, [trashed, io]);
  // M-2 · La finestra sull'elenco. Il cestino cresce con ciò che si elimina e
  // non si svuota da solo: è la seconda vista, dopo l'Archivio, che monta
  // l'array intero senza un tetto naturale.
  const finestra = useFinestra(visible, PAGINA, [period]);
  // "Sto ancora caricando e non ho ancora nulla": vedi Dashboard.jsx. Il
  // secondo addendo è A-3, senza la condizione sull'array — vedi Archive.jsx:
  // qui i task della finestra ci sono, ma non sono i cestinati.
  const caricando = (loading && tasks.length === 0) || caricandoStorico;

  const handleRestore = (task) => {
    if (!io.modificaTask(task)) {
      dispatch({ type: "SHOW_TOAST", payload: { type: "error", message: "Non puoi ripristinare questo task" } });
      return;
    }
    setRestoring({ ...task });
  };

  const handlePurge = async (task) => {
    if (!io.modificaTask(task)) {
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


  return (
    <div className="vd-pad" style={maxW1200}>
      {/* Header */}
      <div style={rowStartBetween}>
        <div>
          <div className="playfair" style={txtF28Bold}>
            🗑️ Cestino
          </div>
          <div style={stiliComuni.txtF13Muted}>
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
        {!caricando && trashed.length > 0 && (
          <button onClick={handleEmpty} style={boxF13Bold}>🔥 Svuota cestino</button>
        )}
      </div>

      {/* Filtro periodo — solo se ci sono task */}
      {!caricando && trashed.length > 0 && (
        <div style={stiliComuni.rowFiltri}>
          <span style={stiliComuni.txtF11Bold}>Periodo:</span>
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
        <div style={stiliComuni.cardVuotaAlta}>
          <div style={stiliComuni.txtF48Mb16}>🗑️</div>
          <div style={stiliComuni.txtF16Bold}>
            Cestino vuoto
          </div>
          <div style={stiliComuni.txtF13Muted}>
            I task eliminati appariranno qui. Potrai ripristinarli o rimuoverli definitivamente.
          </div>
        </div>
      ) : visible.length === 0 ? (
        <div style={stiliComuni.cardVuota}>
          <div style={stiliComuni.txtF36Mb12}>📭</div>
          <div style={stiliComuni.txtF14Bold}>
            Nessun task nel periodo selezionato
          </div>
          <button type="button" onClick={() => setPeriod("all")} style={stiliComuni.btnGhostMini}>Mostra tutti</button>
        </div>
      ) : (
        /* Trash table */
        <div style={stiliComuni.card}>
          <table style={stiliComuni.tabella}>
            <thead>
              <tr style={stiliComuni.rigaIntestazione}>
                <th style={txtF11Bold2}>TASK</th>
                <th style={txtF11Bold3}>CATEGORIA</th>
                <th style={txtF11Bold3}>CLIENTE</th>
                <th style={txtF11Bold3}>ASSEGNATI</th>
                <th style={txtF11Bold3}>ELIMINATO</th>
                <th style={txtF11Bold4}>AZIONI</th>
              </tr>
            </thead>
            <tbody>
              {finestra.visibili.map(task => (
                // La riga non è azionabile (nessun onClick): le azioni sono i
                // bottoni "Ripristina"/"Elimina" nell'ultima colonna, già
                // raggiungibili da tastiera per conto proprio. L'hover qui è
                // solo l'evidenziazione della riga sotto il cursore — M-2
                // dell'audit del 4 settembre.
                // eslint-disable-next-line no-restricted-syntax
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
                  <td style={stiliComuni.cella}>
                    {task.client || <span style={stiliComuni.txtMuted}>—</span>}
                  </td>
                  <td style={padding3}>
                    <div style={stiliComuni.rowGap4}>
                      {task.assignees?.length
                        ? task.assignees.map(id => <Avatar key={id} memberId={id} size={22} />)
                        : <span style={stiliComuni.txtF12Muted}>—</span>
                      }
                    </div>
                  </td>
                  <td style={stiliComuni.cellaMuted}>
                    {formatDate(task.deletedAt)}
                  </td>
                  <td style={stiliComuni.cellaAzioni}>
                    <div style={stiliComuni.rowAzioniInLinea}>
                      <button onClick={() => handleRestore(task)} title="Ripristina con modifica" style={stiliComuni.btnNavyMini}>↻ Ripristina</button>
                      <button onClick={() => handlePurge(task)} title="Elimina definitivamente" style={stiliComuni.btnDangerMini}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Il totale resta VERO anche a finestra ridotta: qui si viene a cercare
          qualcosa che si crede eliminato per sbaglio, e "24" al posto di
          "24 di 209" chiuderebbe la ricerca invece di sospenderla. */}
      <MostraAltri
        finestra={finestra}
        azione={`Mostra altri ${Math.min(PAGINA, finestra.restanti)} di ${finestra.restanti}`}
        conteggio={`${finestra.visibili.length} di ${finestra.totale} task`}
      />

      {/* Ripristino con modifica: un file suo (M-5, audit del 25 agosto). È
          un form di otto campi con validazione, bozza locale e due scritture
          dipendenti — più lungo dell'elenco e delle due operazioni distruttive
          messi insieme, e senza niente in comune con loro. */}
      {restoring && (
        <RipristinaTaskModal task={restoring} onClose={() => setRestoring(null)} />
      )}
    </div>
  );
});
