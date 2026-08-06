// src/components/ui/KeyboardHelpOverlay.jsx
// L'elenco delle scorciatoie mostrato con "?". SHORTCUTS è la fonte di verità
// della documentazione: chi aggiunge una scorciatoia in useKeyboardShortcuts
// la aggiunge anche qui, altrimenti resta invisibile all'utente.
// ─── KEYBOARD SHORTCUTS OVERLAY (v2.8 Round 10) ────────────────────────────
const SHORTCUTS = [
  { key: "K",       desc: "Nuovo task rapido" },
  { key: "Ctrl+K",  desc: "Cerca (focus barra ricerca)" },
  { key: "?",       desc: "Mostra queste scorciatoie" },
  { key: "Esc",     desc: "Chiudi pannello / modal" },
];

export function KeyboardHelpOverlay({ onClose }) {
  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: Z.modalFullBackdrop,
      background: "rgba(8,21,45,0.55)", display: "flex",
      alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div className="slide-up" style={{
        background: "var(--card)", borderRadius: 14, padding: "28px 32px",
        width: "min(420px, 96vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        border: "1px solid var(--border)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div className="playfair" style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)" }}>Scorciatoie tastiera</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)" }}>✕</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SHORTCUTS.map(s => (
            <div key={s.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <span style={{ fontSize: 13, color: "var(--text-muted)" }}>{s.desc}</span>
              <kbd style={{
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: "3px 10px", borderRadius: 6, fontSize: 12, fontFamily: "monospace",
                background: "var(--surface2)", border: "1px solid var(--border)",
                color: "var(--text)", fontWeight: 600, whiteSpace: "nowrap",
              }}>{s.key}</kbd>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 18, fontSize: 12, color: "var(--text-muted)", textAlign: "center" }}>
          Premi <strong>Esc</strong> o clicca fuori per chiudere
        </div>
      </div>
    </div>
  );
}

import { Z } from "../../styles/tokens.js";