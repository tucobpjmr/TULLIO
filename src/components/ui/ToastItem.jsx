// ─── TOAST ITEM ────────────────────────────────────────────────────────────
// Estratto da Toast.jsx (B-3 dell'audit del 13 agosto: un file, un componente
// — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento: stesso codice,
// file diverso, così ToastStack resta l'unico componente esportato da Toast.jsx.
import { useEffect } from "react";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const rowCenterGap8 = { display: "flex", alignItems: "center", gap: 8, minWidth: 0 };
const flexShrink2 = { flexShrink: 0 };
const wordBreak2 = { wordBreak: "break-word" };
const boxF12Bold = {
  background: "var(--gold)", color: "var(--navy)", border: "none",
  padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3, flexShrink: 0,
};
const boxF14White = {
  background: "transparent", color: "#fff", border: "none",
  fontSize: 14, lineHeight: 1, cursor: "pointer", padding: 4,
  opacity: 0.8, flexShrink: 0,
};

export const ToastItem = ({ toast, dispatch }) => {
  useEffect(() => {
    // Un errore resta finché l'utente non lo chiude a mano: un messaggio
    // PostgREST lungo va letto (e magari copiato per segnalarlo), non
    // sparire dopo 3 secondi come oggi — il difetto peggiore del vecchio Toast.
    if (toast.type === "error") return;
    const duration = toast.undoable ? 5000 : 3000;
    const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST", payload: toast.id }), duration);
    return () => clearTimeout(t);
    // dispatch omesso volutamente: è lo `dispatch` stabile di useReducer
    // (identità fissa per la vita del componente), includerlo riavvierebbe
    // il timer ad ogni render del genitore senza motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.type, toast.undoable, toast.id]);

  const handleUndo = () => {
    dispatch({ type: "UNDO_LAST_ACTION" });
  };
  const handleClose = () => {
    dispatch({ type: "CLEAR_TOAST", payload: toast.id });
  };

  // v2.8: aggiunto tipo "warning" (oro) per i cue di sicurezza operativa
  // (es. switch utente verso ruolo Admin nel UserSwitcher mock).
  const bg = toast.type === "success" ? "#0F2044"
    : toast.type === "warning" ? "#C8832A"
    : "#C0392B";
  const icon = toast.type === "success" ? "✓"
    : toast.type === "warning" ? "⚠"
    : "✗";

  return (
    <div
      // "alert" interrompe subito lo screen reader (giusto per un errore),
      // "status" è meno invasivo per successi/warning.
      role={toast.type === "error" ? "alert" : "status"}
      style={{
        background: bg,
        color: "#fff", padding: "10px 16px 10px 20px", borderRadius: 10,
        fontSize: 14, fontWeight: 500, boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
        animation: "toastIn 0.3s ease", display: "flex", alignItems: "center", gap: 12,
        maxWidth: "min(560px, calc(100vw - 24px))",
        pointerEvents: "auto",
      }}
    >
      <span style={rowCenterGap8}>
        <span style={flexShrink2}>{icon}</span>
        {/* Niente ellissi: un messaggio lungo (es. errore RLS di Postgres)
            deve restare leggibile per intero, non troncato. */}
        <span style={wordBreak2}>{toast.message}</span>
      </span>
      {toast.undoable && (
        <button
          onClick={handleUndo}
          style={boxF12Bold}
        >↶ Annulla</button>
      )}
      <button
        onClick={handleClose}
        aria-label="Chiudi notifica"
        style={boxF14White}
      >✕</button>
    </div>
  );
};
