// src/components/ui/KeyboardHelpOverlay.jsx
// L'elenco delle scorciatoie mostrato con "?". SHORTCUTS è la fonte di verità
// della documentazione: chi aggiunge una scorciatoia in useKeyboardShortcuts
// la aggiunge anche qui, altrimenti resta invisibile all'utente.
// ─── KEYBOARD SHORTCUTS OVERLAY (v2.8 Round 10) ────────────────────────────
import { Modal } from "./Modal.jsx";
import * as stiliComuni from "../../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF18Bold = { fontSize: 18, fontWeight: 700, color: "var(--heading)" };
const boxF18Muted = { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" };
const rowCenterBetween2 = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 };
const rowCenterMiddle = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  padding: "3px 10px", borderRadius: 6, fontSize: 12, fontFamily: "monospace",
  background: "var(--surface2)", border: "1px solid var(--border)",
  color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap",
};
const txtF12Muted = { marginTop: 18, fontSize: 12, color: "var(--text-muted)", textAlign: "center" };

const SHORTCUTS = [
  { key: "K",       desc: "Nuovo task rapido" },
  { key: "Ctrl+K",  desc: "Cerca (focus barra ricerca)" },
  { key: "?",       desc: "Mostra queste scorciatoie" },
  { key: "Esc",     desc: "Chiudi pannello / modal" },
];

// `layer="modalFull"`: l'aiuto si invoca da qualunque punto dell'app, anche con
// un modale già aperto, e deve comparire sopra — non sotto quello che si stava
// guardando quando ci si è chiesti quale fosse la scorciatoia.
export function KeyboardHelpOverlay({ onClose }) {
  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="vd-shortcuts-title"
      layer="modalFull"
      width="min(420px, 96vw)"
      cardStyle={{ borderRadius: 14, padding: "28px 32px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}
    >
      <div style={stiliComuni.testataModale}>
        <div id="vd-shortcuts-title" className="playfair" style={txtF18Bold}>Scorciatoie tastiera</div>
        <button onClick={onClose} style={boxF18Muted}>✕</button>
      </div>
      <div style={stiliComuni.colGap10}>
        {SHORTCUTS.map(s => (
          <div key={s.key} style={rowCenterBetween2}>
            <span style={stiliComuni.txtF13Muted}>{s.desc}</span>
            <kbd style={rowCenterMiddle}>{s.key}</kbd>
          </div>
        ))}
      </div>
      <div style={txtF12Muted}>
        Premi <strong>Esc</strong> o clicca fuori per chiudere
      </div>
    </Modal>
  );
}
