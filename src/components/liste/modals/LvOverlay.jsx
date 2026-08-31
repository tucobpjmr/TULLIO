// Guscio comune dei modali del modulo Liste viaggio.
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { apriModale, chiudiModale, inCima } from "../../ui/pilaModali.js";
import { useTrappolaFocus } from "../../../hooks/useTrappolaFocus.js";

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
/**
 * @param {boolean} [chiudiSuVelo=false]  se il click sul velo chiude il modale.
 *
 * Il default è FALSE, e non TRUE come in `ui/Modal` (M-2): questi undici
 * modali sono i form più lunghi dell'app (ST-5) e sono sul denaro — un click
 * a un pixel dal bordo non deve buttare via una tabella di movimenti compilata
 * a mano. Là il default permissivo copre una ventina di modali di cui cinque
 * derogano con `closeOnOverlay={false}`; qui deroga chi non ha niente da
 * perdere (`RiepilogoClienteModal`, `StrumentiDatiModal`: sola lettura e
 * scelte, nessun campo compilato).
 */
export function LvOverlay({ children, onClose, wide = false, labelledBy, chiudiSuVelo = false }) {
  const boxRef = useRef(null);
  // `onClose` arriva quasi sempre come funzione inline dal chiamante (es.
  // `onClose={() => setModal(null)}`), quindi cambia identità a ogni render
  // del genitore — anche i re-render "muti" innescati dal reload debounced
  // del realtime (vedi useDebouncedTableSubscription), che scattano qualche
  // secondo dopo l'ultimo evento. Con `onClose` nelle dipendenze l'effetto
  // ripartiva ad ogni render di questi e richiamava di nuovo il focus sul
  // primo campo del modale, strappando il cursore da dove l'utente stava
  // scrivendo (tipicamente la Data, primo campo di "Inserisci più movimenti
  // insieme"). Il ref tiene `onClose` sempre aggiornato senza che l'effetto
  // debba rieseguirsi: focus e listener Escape si impostano una sola volta,
  // al mount del modale.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    // B-3 · la STESSA pila di ui/Modal: senza, un Esc con una ConfirmDialog
    // aperta SOPRA un modale Liste ne chiuderebbe due — il listener è su
    // `window` e prima di questa condivisione LvOverlay non vi partecipava.
    const token = apriModale();
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (!inCima(token)) return;   // non sono io quello in cima
      onCloseRef.current();
    };
    // Blocco dello scroll di fondo: la stessa ragione di ui/Modal.jsx — su
    // mobile lo scroll "attraversa" il modale e la pagina sotto si muove
    // mentre si compila il form. Qui mancava, e i modali di questo modulo sono
    // quelli con i form più lunghi dell'app (ST-5).
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector("input, select")?.focus();
    return () => {
      chiudiModale(token);
      document.body.style.overflow = precedente;
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // M-3 · `aria-modal="true"` senza trappola del focus né restituzione era
  // una promessa non mantenuta: vedi hooks/useTrappolaFocus.js.
  useTrappolaFocus(boxRef);

  return createPortal(
    <div className="lv-root">
      <div
        className="lv-overlay"
        // M-2 · `onMouseDown` e non `onClick`, con il confronto sul target:
        // come ui/Modal.jsx:92. Con `onClick` una selezione di testo iniziata
        // DENTRO il form e terminata sul velo conta come click sul velo e
        // chiude — il modo più facile di perdere un modulo compilato senza
        // aver mai cliccato fuori.
        onMouseDown={chiudiSuVelo ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      >
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
