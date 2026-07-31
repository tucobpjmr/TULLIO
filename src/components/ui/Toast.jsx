// ─── TOAST ─────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e).
import { useEffect } from "react";
import { useViewport } from "../Viewport.jsx";

export const Toast = ({ toast, dispatch }) => {
  const { isDesktop } = useViewport();
  useEffect(() => {
    if (!toast) return;
    const duration = toast.undoable ? 5000 : 3000;
    const t = setTimeout(() => dispatch({ type: "CLEAR_TOAST" }), duration);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  const handleUndo = () => {
    dispatch({ type: "UNDO_LAST_ACTION" });
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
    <div style={{
      // Mobile: sopra la bottom-nav + home indicator iPhone (--safe-bottom).
      position: "fixed", bottom: isDesktop ? 24 : "calc(80px + var(--safe-bottom))",
      left: "50%", transform: "translateX(-50%)",
      background: bg,
      color: "#fff", padding: "10px 16px 10px 20px", borderRadius: 10,
      fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      animation: "toastIn 0.3s ease", display: "flex", alignItems: "center", gap: 12,
      maxWidth: "min(560px, calc(100vw - 24px))",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span style={{ flexShrink: 0 }}>{icon}</span>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{toast.message}</span>
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
    </div>
  );
};
