// ─── ADD CATEGORY MODAL ──────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
// Stili condivisi importati da admin/adminStyles.js (consolidati in Phase 2f).
import { useRef, useState } from "react";
import {
  modalOverlay, modalCard, labelStyle, fieldStyle, btnPrimary, btnGhost,
} from "../admin/adminStyles.js";
import { ModalPortal } from "../ui/ModalPortal.jsx";
import { FieldError, ariaCampo } from "../ui/FieldError.jsx";
import { obbligatorio, validaCampi } from "../../lib/validators.js";
import { gridGap12, rowGap8Mt20, txtHeadingMb16 } from "../../styles/common.js";

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

export const AddCategoryModal = ({ onClose, dispatch, existingKeys }) => {
  const [label, setLabel] = useState("");
  const [errori, setErrori] = useState({});
  const labelRef = useRef(null);
  const [icon, setIcon] = useState("🏷️");
  const [color, setColor] = useState("#3B82F6");
  const [bg, setBg] = useState("#EFF6FF");

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
    dispatch({ type: "ADD_CATEGORY", payload: { key, label: label.trim(), icon, color, bg } });
    onClose();
  };

  // Portale: AdminCategoriesTab è dentro il wrapper .fade-in di AdminView, che
  // ha un transform → senza il portale l'overlay si centra sull'altezza del
  // tab (scrollabile) invece che sullo schermo. Vedi ui/ModalPortal.jsx.
  return (
    <ModalPortal>
      <div onClick={onClose} style={modalOverlay}>
        <div onClick={e => e.stopPropagation()} style={{ ...modalCard, maxWidth: 480 }}>
          <h3 className="playfair" style={txtHeadingMb16}>Aggiungi nuova categoria</h3>
          <div style={gridGap12}>
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
          <div style={rowGap8Mt20}>
            <button onClick={onClose} style={btnGhost}>Annulla</button>
            <button onClick={submit} style={btnPrimary}>Crea categoria</button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
