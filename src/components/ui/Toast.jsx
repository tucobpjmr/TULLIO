// ─── TOAST ─────────────────────────────────────────────────────────────────
// Estratto dal monolite (Step P Phase 2e). Split in ToastStack/ToastItem per
// supportare più toast in coda (contratto: state.toasts, array) e per dare
// agli screen reader un annuncio affidabile di ciascun messaggio.
import { useViewport } from "../Viewport.jsx";
import { Z } from "../../styles/tokens.js";
import { ToastItem } from "./ToastItem.jsx";

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
