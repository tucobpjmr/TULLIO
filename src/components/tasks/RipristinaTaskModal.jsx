// src/components/tasks/RipristinaTaskModal.jsx
// "Ripristina task": la modale che riporta una task dal cestino, permettendo di
// correggerne i campi PRIMA di farlo.
//
// PERCHÉ È USCITA DA Trash.jsx (M-5, audit del 25 agosto). Il cestino faceva
// tre lavori: l'elenco (finestra, filtro per periodo, conteggi), le due
// operazioni distruttive (elimina definitivamente, svuota) e questo — un form
// di otto campi con validazione, bozza locale e una sequenza di due scritture
// dipendenti. L'ultimo è più lungo degli altri due messi insieme e non
// condivide con loro nulla: non legge l'elenco, non tocca i filtri, e la sua
// bozza non serve a nessun altro.
//
// ⚠️ LA BOZZA VIVE QUI, e non nel cestino. La modale si monta solo quando c'è
// una task da ripristinare, quindi `useState` la inizializza una volta per
// apertura: il cestino torna a sapere soltanto QUALE task si sta ripristinando,
// non com'è stata modificata nel frattempo.
//
// ─── A-4 / M-3 · due scritture DIPENDENTI, in sequenza e attese ──────────
// (audit performance/UX del 19 agosto)
//
// Erano due `dispatch` di fila senza `await`, seguiti da una chiusura nello
// stesso turno. La funzionalità è «ripristina MODIFICANDO prima», quindi le due
// non sono indipendenti: il ripristino ha senso solo se le modifiche sono
// passate. Partendo entrambe alla cieca l'unica cosa garantita era l'ordine di
// INVIO, non quello di esito — e se `UPDATE_TASK` veniva rifiutata (guard di
// permesso, RLS, rete) mentre `RESTORE_TASK` passava, la task tornava dal
// cestino con i valori VECCHI, le otto caselle appena compilate non erano da
// nessuna parte, e la modale si era già chiusa. Il rollback rimette a posto il
// database e il toast dice che qualcosa è fallito; a schermo resta una task
// ripristinata che sembra a posto, che è peggio da diagnosticare perché ha
// l'aspetto della riuscita.
import { useRef, useState } from "react";
import { useSalvataggio } from "../../hooks/useSalvataggio.js";
import { useViewport } from "../ui/Viewport.jsx";
import { PRIORITIES, STATUS_LABELS } from "../../lib/taskConstants.js";
import { useAppData } from "../../state/AppDataContext.jsx";
import { DateTimePicker } from "../ui/DateTimePicker.jsx";
import { Modal } from "../ui/Modal.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { obbligatorio, validaCampi } from "../../lib/validators.js";
import { useDispatch } from "../../state/DispatchContext.jsx";
import * as stiliComuni from "../../styles/common.js";
import {
  boxF13Bold2, boxF13Conferma, boxF13WFull, boxF13WFull2, boxF14WFull, colGap16,
  rowCenterBetween, rowGap10, rowGap6, txtF11Mt2, txtF18Bold, txtWhite,
} from "./trashStyles.js";

// B-3 · Il titolo è l'unico campo obbligatorio del ripristino con modifica.
// Un solo campo, quindi nessun `ORDINE` da dichiarare: il focus torna dove
// serve senza doverlo scegliere (vedi lib/validators.js).
const REGOLE = { title: obbligatorio("Il titolo è obbligatorio: senza, la task tornerebbe senza nome.") };

/**
 * @param {object}   props
 * @param {object}   props.task     la task cestinata da ripristinare.
 * @param {Function} props.onClose  chiude la modale (riuscita o annullamento).
 */
export function RipristinaTaskModal({ task, onClose }) {
  const dispatch = useDispatch();
  const { isMobile } = useViewport();
  const { categories, getAssignableTeam } = useAppData();
  const [bozza, setBozza] = useState(() => ({ ...task }));
  const [errori, setErrori] = useState({});
  const rifTitolo = useRef(null);

  const scrivi = (field, value) => setBozza(prec => ({ ...prec, [field]: value }));

  const { salva, inVolo, errore } = useSalvataggio(
    async () => {
      const { deletedAt, ...updates } = bozza;
      const r = await dispatch({ type: "UPDATE_TASK", payload: updates });
      // La seconda parte solo se la prima è passata davvero: è ciò che rende
      // questa una sequenza invece di due scritture concorrenti.
      if (r?.error) return r;
      return dispatch({ type: "RESTORE_TASK", payload: bozza.id });
    },
    {
      alSuccesso: onClose,
      messaggioErrore: "Ripristino non riuscito. Le modifiche sono ancora qui, riprova.",
    },
  );

  const conferma = () => {
    // B-3 · Era `disabled={!bozza.title?.trim()}`: il comando spento e nessuna
    // indicazione di quale campo mancasse — su una modale con otto campi. Ora
    // la regola è pura, il messaggio sta sotto il campo e il focus ci torna
    // sopra (stesso trattamento di MessageTemplatesSection).
    const trovati = validaCampi(bozza, REGOLE);
    if (trovati.title) {
      setErrori(trovati);
      rifTitolo.current?.focus();
      return;
    }
    setErrori({});
    salva();
  };

  // Il guscio (portale, overlay, Esc, blocco dello scroll di fondo,
  // role="dialog") arriva da ui/Modal.jsx. La card NON introduce transform:
  // dentro ci vive il backdrop mobile del DateTimePicker (campo SCADENZA), che
  // con un antenato trasformato resterebbe confinato — e scrollabile — dentro
  // la card invece di coprire lo schermo.
  // `closeOnOverlay={false}`: qui si modificano otto campi prima di
  // confermare, un click a lato non deve buttarli via.
  return (
      <Modal
        open
        onClose={onClose}
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
          <button onClick={onClose} style={stiliComuni.btnChiudiSuScuro}>✕</button>
        </div>

        {/* Modal body */}
        <div style={colGap16}>
          {/* Titolo */}
          <div>
            <label className="vd-field-label" htmlFor="vd-trash-title">TITOLO</label>
            <input
              id="vd-trash-title"
              ref={rifTitolo}
              value={bozza.title}
              onChange={e => {
                scrivi("title", e.target.value);
                setErrori(prec => (prec.title ? {} : prec));
              }}
              style={boxF14WFull}
              onFocus={e => e.target.style.borderColor = "var(--gold)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
              {...ariaCampo("vd-trash-title-err", errori.title)}
            />
            <FieldError id="vd-trash-title-err">{errori.title}</FieldError>
          </div>

          {/* Categoria + Priorità */}
          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label">CATEGORIA</label>
              <select
                value={bozza.category}
                onChange={e => scrivi("category", e.target.value)}
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
                value={bozza.priority}
                onChange={e => scrivi("priority", e.target.value)}
                style={boxF13WFull}
              >
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Stato + Scadenza */}
          <div style={stiliComuni.grid2ColGap12}>
            <div>
              <label className="vd-field-label">STATO</label>
              <select
                value={bozza.status}
                onChange={e => scrivi("status", e.target.value)}
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
                value={bozza.dueDate || null}
                onChange={iso => scrivi("dueDate", iso)}
                align="right"
              />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="vd-field-label">CLIENTE</label>
            <input
              value={bozza.client || ""}
              onChange={e => scrivi("client", e.target.value)}
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
                const sel = bozza.assignees?.includes(m.id);
                return (
                  <button key={m.id}
                    onClick={() => {
                      const curr = bozza.assignees || [];
                      scrivi("assignees", sel ? curr.filter(x => x !== m.id) : [...curr, m.id]);
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
              value={bozza.description || ""}
              onChange={e => scrivi("description", e.target.value)}
              rows={3}
              style={boxF13WFull2}
              placeholder="Descrizione task..."
              onFocus={e => e.target.style.borderColor = "var(--gold)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
          </div>
        </div>

        {/* A-4 · Il fallimento accanto agli otto campi che sono rimasti
            compilati. Il toast del registry riporta il messaggio del
            database; questo dice che non si è perso niente. */}
        <FieldError id="vd-trash-restore-err">{errore}</FieldError>

        {/* Modal footer */}
        <div style={rowGap10}>
          <button onClick={onClose} style={boxF13Bold2}>Annulla</button>
          <button onClick={conferma} disabled={inVolo} style={boxF13Conferma}>
            {inVolo ? "Ripristino…" : "↻ Conferma ripristino"}
          </button>
        </div>
      </Modal>
  );
}
