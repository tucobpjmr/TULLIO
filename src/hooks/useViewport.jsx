import { createContext, useContext, useEffect, useState } from "react";

// ─── VIEWPORT (responsive) ─────────────────────────────────────────────────
const ViewportContext = createContext({ width: 1280, isMobile: false, isTablet: false, isDesktop: true });

export const useViewport = () => useContext(ViewportContext);

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
      raf = requestAnimationFrame(() => setWidth(window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => { window.removeEventListener("resize", onResize); if (raf) cancelAnimationFrame(raf); };
  }, []);
  const vp = {
    width,
    isMobile: width <= 640,
    isTablet: width > 640 && width <= 1024,
    isDesktop: width > 1024,
  };
  return <ViewportContext.Provider value={vp}>{children}</ViewportContext.Provider>;
};
