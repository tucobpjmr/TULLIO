// ─── VIEWPORT (responsive) ─────────────────────────────────────────────────
// Context + provider + hook per il layout responsive. Estratto dal monolite
// (Step P Phase 2e). Provider montato alla radice, hook consumato ovunque.
import { useState, useEffect, useMemo, useContext, createContext } from "react";

const ViewportContext = createContext({ width: 1280, isMobile: false, isTablet: false, isDesktop: true });

export const useViewport = () => useContext(ViewportContext);

// P2-7: soglie di TUTTI i consumatori che leggono `width` per decidere un
// comportamento a scatti (non il pixel esatto). 640/1024 sono le fasce
// pubblicate qui sotto (isMobile/isTablet/isDesktop); 1280 è la soglia propria
// dell'auto-collapse desktop di Sidebar.jsx ("narrow" vs "wide"), che non
// coincide con le prime due. Includerla qui — invece che in Sidebar — è ciò
// che permette di aggiornare `width` solo ai cambi di fascia SENZA rompere
// quel consumatore: un trascinamento del bordo finestra da 1400 a 1000px
// attraversa ~400px (un `setWidth` a frame, coalescato da
// `requestAnimationFrame` ma non eliminato) senza che nessuna delle tre fasce
// cambi mai — è il percorso di invalidazione più frequente dell'app, ed è
// quello che innesca a vuoto i ricalcoli di P2-4 in Dashboard/CalendarPlanner.
const SOGLIE_FASCIA = [640, 1024, 1280];
const fasciaDi = (w) => SOGLIE_FASCIA.filter(s => w > s).length;

export const ViewportProvider = ({ children }) => {
  const [width, setWidth] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    // Assicura il meta viewport per il rendering mobile corretto
    if (typeof document !== "undefined" && !document.querySelector('meta[name="viewport"]')) {
      const m = document.createElement("meta");
      m.name = "viewport";
      m.content = "width=device-width, initial-scale=1, viewport-fit=cover";
      document.head.appendChild(m);
    }
    let raf = null;
    const onResize = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setWidth((prev) => {
        const next = window.innerWidth;
        // Un render solo quando cambia la fascia. Chi ha bisogno del pixel
        // esatto (Sidebar, per il proprio effetto di auto-collapse) lo legge
        // comunque da `width`, che resta nel value: quello che sparisce è il
        // render a vuoto per ognuno dei pixel intermedi, non la precisione.
        return fasciaDi(next) === fasciaDi(prev) ? prev : next;
      }));
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const vp = useMemo(() => ({
    width,
    isMobile: width <= 640,
    isTablet: width > 640 && width <= 1024,
    isDesktop: width > 1024,
  }), [width]);
  return <ViewportContext.Provider value={vp}>{children}</ViewportContext.Provider>;
};
