import { useEffect } from "react";
import { useViewport } from "../../hooks/useViewport.jsx";

// ─── TOAST ─────────────────────────────────────────────────────────────────
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
  return (
    <div style={{
      position: "fixed", bottom: isDesktop ? 24 : 80, left: "50%", transform: "translateX(-50%)",
      background: toast.type === "success" ? "#0F2044" : "#C0392B",
      color: "#fff", padding: "10px 16px 10px 20px", borderRadius: 10,
      fontSize: 14, fontWeight: 500, zIndex: 9999, boxShadow: "0 8px 30px rgba(0,0,0,0.25)",
      animation: "toastIn 0.3s ease", display: "flex", alignItems: "center", gap: 12,
      whiteSpace: "nowrap", maxWidth: "calc(100vw - 24px)",
    }}>
      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span>{toast.type === "success" ? "✓" : "✗"}</span>
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
