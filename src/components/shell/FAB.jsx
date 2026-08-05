// ─── FAB ─────────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2f).
import { useViewport } from "../Viewport.jsx";
import { Z } from "../../styles/tokens.js";

export const FAB = ({ onClick }) => {
  const { isDesktop } = useViewport();
  return (
  <button onClick={onClick} style={{
    // Mobile: sopra la bottom-nav, che a sua volta cresce dell'home indicator
    // iPhone (--safe-bottom) — senza somma il FAB finirebbe a cavallo della nav.
    position: "fixed",
    bottom: isDesktop ? 28 : "calc(80px + var(--safe-bottom))",
    right: isDesktop ? 28 : "calc(16px + var(--safe-right))",
    width: 52, height: 52,
    borderRadius: "50%", background: "var(--gold)", border: "none",
    boxShadow: "0 8px 24px rgba(212,168,67,0.5)", cursor: "pointer",
    fontSize: 22, display: "flex", alignItems: "center", justifyContent: "center",
    color: "var(--navy)", fontWeight: 700, zIndex: Z.fab,
    transition: "transform 0.2s ease, box-shadow 0.2s ease",
  }}
    onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.1)"; e.currentTarget.style.boxShadow = "0 12px 32px rgba(212,168,67,0.6)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(212,168,67,0.5)"; }}
  >+</button>
  );
};
