// ─── TOAST ─────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e). Split in ToastStack/ToastItem per
// supportare più toast in coda (contratto: state.toasts, array) e per dare
// agli screen reader un annuncio affidabile di ciascun messaggio.
import { useEffect } from "react";
import { useViewport } from "../Viewport.jsx";
import { Z } from "../../styles/tokens.js";

// La live region deve esistere PRIMA del contenuto da annunciare: se il nodo
// con aria-live compare insieme al primo toast, gli screen reader non fanno
// in tempo a registrarlo e il primo annuncio va perso. Per questo ToastStack
// è sempre montato — anche con `toasts` vuoto — e non ritorna mai null: il
// contenitore c'è già, cambia solo cosa contiene.
export const ToastStack = ({ toasts = [], dispatch }) => {
  const { isDesktop } = useViewport();
  return (
    <div
      aria-live="assertive"
      aria-atomic="false"
      style={{
        // Mobile: sopra la bottom-nav + home indicator iPhone (--safe-bottom).
        position: "fixed", bottom: isDesktop ? 24 : "calc(80px + var(--safe-bottom))",
        left: "50%", transform: "translateX(-50%)",
        zIndex: Z.toast,
        display: "flex", flexDirection: "column-reverse", gap: 10,
        alignItems: "center",
        // L'area vuota sopra/sotto i toast non deve rubare i click al resto
        // della pagina: solo i singoli ToastItem li riabilitano.
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} dispatch={dispatch} />
      ))}
    </div>
  );
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
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}>{icon}</span>
        {/* Niente ellissi: un messaggio lungo (es. errore RLS di Postgres)
            deve restare leggibile per intero, non troncato. */}
        <span style={{ wordBreak: "break-word" }}>{toast.message}</span>
      </span>
      {toast.undoable && (
        <button
          onClick={handleUndo}
          style={{
            background: "var(--gold)", color: "var(--navy)", border: "none",
            padding: "5px 12px", borderRadius: 6, fontSize: 12, fontWeight: 700,
            cursor: "pointer", fontFamily: "inherit", letterSpacing: 0.3, flexShrink: 0,
          }}
        >↶ Annulla</button>
      )}
      <button
        onClick={handleClose}
        aria-label="Chiudi notifica"
        style={{
          background: "transparent", color: "#fff", border: "none",
          fontSize: 14, lineHeight: 1, cursor: "pointer", padding: 4,
          opacity: 0.8, flexShrink: 0,
        }}
      >✕</button>
    </div>
  );
};
