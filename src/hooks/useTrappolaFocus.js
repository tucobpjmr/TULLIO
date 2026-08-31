// src/hooks/useTrappolaFocus.js
// M-3 dell'audit UX/errori del 31 agosto.
//
// `role="dialog" aria-modal="true"` è una PROMESSA all'albero di
// accessibilità: «finché sono aperto, il resto della pagina non c'è». I due
// gusci di modale dell'app (ui/Modal.jsx, liste/modals/LvOverlay.jsx) la
// dichiaravano e nessuno dei due la manteneva davvero — nessuna gestione di
// `Tab`: dal campo "Importo" di un modale, tre Tab portavano dentro la Topbar
// della pagina sottostante, visivamente coperta dal velo ma perfettamente
// focalizzabile. E alla chiusura il focus tornava su `<body>`: chi usa uno
// screen reader ripartiva dall'inizio del documento invece che dal bottone che
// aveva premuto per aprire il modale.
//
// Un hook solo, usato da entrambi i gusci — stessa forma di
// components/errors/creaErrorBoundary.jsx: il ciclo di vita in un posto, il
// dominio (stile, markup) nei chiamanti.
import { useEffect } from "react";

const FOCALIZZABILI = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(",");

// `offsetParent !== null` è il modo consueto di escludere ciò che è
// `display:none` (una sezione ripiegabile chiusa dentro il modale), ma
// dipende dal LAYOUT — che jsdom non calcola, quindi non è verificabile da
// un test. `getComputedStyle` legge invece la cascata CSS dichiarata, che
// jsdom applica davvero: stessa esclusione, verificabile.
const visibile = (n) => {
  if (n.hasAttribute("hidden")) return false;
  const stile = window.getComputedStyle(n);
  return stile.display !== "none" && stile.visibility !== "hidden";
};

/**
 * @param {import('react').RefObject<HTMLElement>} rif  il contenitore del
 *   modale (il nodo con `role="dialog"`).
 * @param {boolean} [attivo=true]  se falso non fa nulla — comodo per i
 *   chiamanti che montano il modale sempre ma lo mostrano condizionalmente.
 */
export function useTrappolaFocus(rif, attivo = true) {
  useEffect(() => {
    if (!attivo || !rif.current) return;
    const box = rif.current;
    // Da dove veniamo: si legge PRIMA di spostare il focus, ed è l'unico
    // momento in cui l'informazione esiste ancora.
    const origine = document.activeElement;

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const nodi = [...box.querySelectorAll(FOCALIZZABILI)].filter(visibile);
      if (nodi.length === 0) return;
      const primo = nodi[0];
      const ultimo = nodi[nodi.length - 1];
      // Il ciclo si chiude a mano perché il browser non sa nulla di
      // `aria-modal`: per lui la pagina sotto è ancora tabbabile.
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    };

    box.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("keydown", onKey);
      // Restituzione: `focus()` su un nodo staccato dal DOM è un no-op
      // silenzioso, quindi non serve controllare che esista ancora.
      if (origine instanceof HTMLElement) origine.focus();
    };
  }, [rif, attivo]);
}
