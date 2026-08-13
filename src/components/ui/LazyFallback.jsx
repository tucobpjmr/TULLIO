// src/components/ui/LazyFallback.jsx
// ─── LAZY FALLBACK ─────────────────────────────────────────────────────────
// Spinner mostrato mentre un chunk lazy (Step P Phase 2g: AdminView,
// BulkTaskCreator, TaskSlideOver) viene scaricato. `overlay` lo centra a tutto
// schermo per i modali; altrimenti riempie l'area della vista.
//
// ─── CRITICITÀ #12 · l'attesa era MUTA ─────────────────────────────────────
// Il fallback era un cerchio che gira e nient'altro: nessun testo, nessun
// `role`. Per chi usa uno screen reader la vista semplicemente non annunciava
// nulla — il contenuto spariva e al suo posto non compariva niente di
// leggibile, indistinguibile da una pagina rotta. Ed è il caso più probabile
// proprio quando l'attesa si allunga: rete lenta, chunk grande.
//
// `role="status"` + `aria-live="polite"` fanno annunciare il testo quando
// compare; il testo c'è anche visivamente, perché "sta caricando" è
// un'informazione utile a tutti e un'animazione da sola non la dà (uno
// spinner immobile per tre secondi e uno spinner su una connessione morta si
// somigliano molto). `aria-hidden` sul cerchio evita che venga descritto due
// volte.
import { Z } from "../../styles/tokens.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const txtF13Bold = { color: "#fff", fontSize: 13, fontWeight: 600 };
const colCenterMiddle = {
  display: "flex", flexDirection: "column", gap: 12,
  alignItems: "center", justifyContent: "center", padding: 48,
};
const txtF13Bold2 = { color: "var(--text-muted)", fontSize: 13, fontWeight: 600 };

export const LazyFallback = ({ overlay = false, label = "Caricamento in corso…" }) => {
  const ring = (size, track, top) => (
    <div
      aria-hidden="true"
      style={{
        width: size, height: size,
        border: `3px solid ${track}`, borderTopColor: top,
        borderRadius: "50%", animation: "spin 0.8s linear infinite",
      }}
    />
  );
  if (overlay) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed", inset: 0, zIndex: Z.slideOverBackdrop,
          display: "flex", flexDirection: "column", gap: 14,
          alignItems: "center", justifyContent: "center",
          background: "rgba(8,21,45,0.35)",
        }}
      >
        {ring(40, "rgba(255,255,255,0.3)", "var(--gold)")}
        <span style={txtF13Bold}>{label}</span>
      </div>
    );
  }
  return (
    <div
      role="status"
      aria-live="polite"
      style={colCenterMiddle}
    >
      {ring(34, "var(--surface3)", "var(--gold)")}
      <span style={txtF13Bold2}>{label}</span>
    </div>
  );
};
