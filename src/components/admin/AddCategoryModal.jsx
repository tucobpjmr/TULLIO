// ─── ADD CATEGORY MODAL ──────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Stili condivisi importati da admin/adminStyles.js (consolidati in Phase 2f).
import { useRef, useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "./adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { obbligatorio, validaCampi } from "../../lib/validators.js";
import { useSalvataggio } from "../../hooks/useSalvataggio.js";
import * as stiliComuni from "../../styles/common.js";
import { useDispatch } from "../../state/DispatchContext.jsx";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const gridGap122 = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 };
const boxP12R8 = { padding: 12, background: "var(--surface2)", borderRadius: 8, border: "1px dashed var(--border)" };
const txtF11Muted = { fontSize: 11, color: "var(--text-muted)", marginBottom: 6 };

// M-3 dell'audit del 16 agosto: `if (!label.trim()) return;` era un comando
// che non faceva niente e non diceva perché — nemmeno un bottone spento a
// suggerirlo. Il campo porta già l'asterisco di obbligatorietà: qui mancava
// solo la frase che lo rende vero.
const REGOLE = { label: obbligatorio("Il nome della categoria è obbligatorio.") };

export const AddCategoryModal = ({ onClose, existingKeys }) => {
  const dispatch = useDispatch();
  const [label, setLabel] = useState("");
  const [errori, setErrori] = useState({});
  const labelRef = useRef(null);
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState("#3B82F6");
  const [bg, setBg] = useState("#EFF6FF");

  // A-4 · L'esito prima della chiusura (audit del 19 agosto). Era
  // `dispatch(...)` senza `await` seguito da `onClose()` nello stesso turno: su
  // una scrittura rifiutata la categoria appariva, spariva col rollback, e
  // nome/icona/colori scelti non esistevano più. `ADD_CATEGORY` è ADMIN_ONLY e
  // passa dalla RLS, quindi il rifiuto non è teorico.
  const { salva, inVolo, errore: erroreSalvataggio } = useSalvataggio(
    (payload) => dispatch({ type: "ADD_CATEGORY", payload }),
    {
      alSuccesso: onClose,
      messaggioErrore: "Categoria non creata. I dati sono ancora qui, riprova.",
    },
  );

  const submit = () => {
    const trovati = validaCampi({ label }, REGOLE);
    if (trovati.label) {
      setErrori(trovati);
      labelRef.current?.focus();
      return;
    }
    setErrori({});
    let key = label.trim().toLowerCase().replace(/[^a-z0-9]/g, "_").replace(/^_+|_+$/g, "");
    if (!key) key = "custom";
    let suffix = 0;
    while (existingKeys.includes(suffix ? `${key}${suffix}` : key)) suffix++;
    if (suffix) key = `${key}${suffix}`;
    salva({ key, label: label.trim(), icon, color, bg });
  };

  // Portale: AdminCategoriesTab è dentro il wrapper .fade-in di AdminView, che
  // ha un transform → senza il portale l'overlay si centra sull'altezza del
  // tab (scrollabile) invece che sullo schermo. Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={onClose} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
          <h3 className="playfair" style={stiliComuni.txtHeadingMb16}>Aggiungi nuova categoria</h3>
          <div style={stiliComuni.gridGap12}>
            <div>
              <label style={labelStyle}>Nome *</label>
              <input
                ref={labelRef}
                value={label}
                onChange={e => {
                  setLabel(e.target.value);
                  setErrori(prec => (prec.label ? {} : prec));
                }}
                placeholder="Es. Trasferimenti"
                style={fieldStyle}
                autoFocus
                {...ariaCampo("vd-cat-label-err", errori.label)}
              />
              <FieldError id="vd-cat-label-err">{errori.label}</FieldError>
            </div>
            <div className="vd-grid-3col" style={gridGap122}>
              <div>
                <label style={labelStyle}>Icona (emoji)</label>
                <input value={icon} onChange={e => setIcon(e.target.value)} maxLength={2} style={{ ...fieldStyle, textAlign: "center", fontSize: 18 }} />
              </div>
              <div>
                <label style={labelStyle}>Colore</label>
                <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
              </div>
              <div>
                <label style={labelStyle}>Sfondo</label>
                <input type="color" value={bg} onChange={e => setBg(e.target.value)} style={{ ...fieldStyle, height: 38, padding: 2 }} />
              </div>
            </div>
            {/* Preview */}
            <div style={boxP12R8}>
              <div style={txtF11Muted}>Anteprima</div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 10px", borderRadius: 999, background: bg, color: color,
                fontSize: 12, fontWeight: 600,
              }}>
                <span>{icon}</span> {label || "Nome categoria"}
              </div>
            </div>
          </div>
          {/* A-4 · Il toast del registry dice cosa ha risposto il database;
              questo dice che i dati sono ancora qui. */}
          <FieldError id="vd-cat-save-err">{erroreSalvataggio}</FieldError>

          <div style={stiliComuni.rowGap8Mt20}>
            <button onClick={onClose} style={btnGhost}>Annulla</button>
            <button onClick={submit} disabled={inVolo} style={btnPrimary}>
              {inVolo ? "Creazione…" : "Crea categoria"}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
