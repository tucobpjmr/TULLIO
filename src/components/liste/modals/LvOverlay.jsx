// Guscio comune dei modali del modulo Liste viaggio.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Chiude con Escape e blocca la propagazione del click interno, come faceva
// l'overlay della SPA. Il focus va al primo campo all'apertura.
//
// Portale su document.body: ListeViaggio.jsx monta questi overlay dentro il
// proprio wrapper ".fade-in" (animazione d'ingresso della vista), che ha un
// transform (translateY) nel keyframe finale — per spec CSS un transform
// diverso da "none" rende l'elemento containing block per i discendenti
// position:fixed. L'overlay finiva quindi centrato rispetto all'altezza
// dell'intera vista (spesso più alta del viewport, essendo scrollabile)
// invece che rispetto allo schermo, comparendo troppo in basso su mobile
// (segnalato dall'utente su "Strumenti dati" e "+ Nuova lista"). Il portale
// lo sgancia da quella gerarchia e lo posiziona sempre rispetto al viewport
// reale, com'è già per gli altri modali dell'app.
//
// Il wrapper .lv-root qui sotto è necessario quanto il portale stesso: TUTTO
// il CSS del modulo (bottoni, select/input, font Inter, variabili colore
// --lv-*) è scopato come discendente di .lv-root (vedi liste.css) —
// senza di lui il portale porta il modale fuori dalla sua stessa gerarchia
// di stile, e bottoni/select tornano al default del browser (overflow del
// <select> Cliente compreso). .lv-root non ha transform/filter, quindi non
// reintroduce il bug della positioning: contribuisce zero altezza al layout
// perché il suo unico figlio è position:fixed.
export function LvOverlay({ children, onClose, wide = false, labelledBy }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    // Blocco dello scroll di fondo: la stessa ragione di ui/Modal.jsx — su
    // mobile lo scroll "attraversa" il modale e la pagina sotto si muove
    // mentre si compila il form. Qui mancava, e i modali di questo modulo sono
    // quelli con i form più lunghi dell'app (ST-5).
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector("input, select")?.focus();
    return () => {
      document.body.style.overflow = precedente;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="lv-root">
      <div className="lv-overlay" onClick={onClose}>
        {/* role/aria-modal: senza, per uno screen reader questi undici modali
            sono div in mezzo alla pagina, non finestre che catturano il
            contesto (ST-5). Lo stile resta quello del modulo: qui cambia solo
            ciò che l'accessibility tree legge. */}
        <div
          ref={boxRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelledBy}
          className={`lv-modal${wide ? " wide" : ""}`}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
