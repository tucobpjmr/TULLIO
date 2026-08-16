// src/components/ui/LazyPanel.jsx
// ─── A-1 (audit performance/UX del 16 agosto, secondo passaggio) ───────────
// Suspense e boundary INSIEME: montare un componente `lazy()` senza rete di
// sicurezza non deve più essere una cosa che si può scrivere per distrazione.
//
// PERCHÉ ESISTE. React non dà un error boundary implicito a `lazy()`:
// `Suspense` gestisce l'ATTESA, non l'errore. Se il chunk risponde 404 — che
// succede a OGNI deploy con una scheda aperta, ed è il caso più frequente in
// produzione (vedi lib/errorReporting.js, `isChunkMancante`) — l'eccezione
// sale fino al primo boundary che trova sopra di sé. Per i nove punti in cui
// l'app monta un lazy, "il primo boundary sopra" erano tre cose diverse:
//
//   • TaskSlideOver e BulkTaskCreator      → OverlayErrorBoundary, corretto
//   • le tre viste che montano un pannello → ViewErrorBoundary: si perde
//     l'INTERA vista (e il suo "riprova" riporta alla Dashboard) perché non
//     si è riusciti ad aprire un modale sopra di essa
//   • ChatPanel, i due pannelli della Topbar e ProfileEditor → l'ErrorBoundary
//     di main.jsx: TUTTA l'app sostituita dalla schermata "Ricarica" mentre
//     la dashboard sotto è perfettamente integra
//
// I due modali corretti avevano il boundary perché qualcuno se n'è ricordato,
// gli altri sette non ce l'avevano per lo stesso motivo. Finché "montare un
// lazy" e "dargli un boundary" sono due gesti separati, il decimo call site
// ripeterà il difetto. Qui sono un gesto solo.
//
// ORDINE DEI DUE WRAPPER. Il boundary sta FUORI da `Suspense`, non dentro: è
// comunque antenato del componente lazy (l'unica condizione perché intercetti
// la sua eccezione), ma così copre ANCHE un errore lanciato dal fallback. Il
// contrario — Suspense esterno, boundary interno — funziona per il caso
// principale e lascia scoperto quello.
//
// ⚠️ `onReset` non è decorativo: il pannello d'errore ha un bottone "Chiudi"
// che chiama esattamente quello. Senza, il riquadro resta a schermo e lo stato
// che ha montato il pannello (`showChat`, `showNotif`, `importOpen`…) resta
// `true` — cioè un "Chiudi" che non chiude.
import { Suspense } from "react";
import { OverlayErrorBoundary } from "../OverlayErrorBoundary.jsx";
import { LazyFallback } from "./LazyFallback.jsx";

/**
 * @param {string} resetKey  identità del contenuto montato: cambiandola il
 *                           boundary si riarma (serve ai pannelli che restano
 *                           montati passando da un contenuto all'altro, es.
 *                           TaskSlideOver fra due task).
 * @param {() => void} onReset  chiude il pannello: è l'azione del bottone del
 *                           riquadro d'errore.
 * @param {boolean} [overlay]  variante a tutto schermo del solo FALLBACK
 *                           (l'attesa); il riquadro d'errore è già un overlay
 *                           in entrambi i casi.
 * @param {string} [label]   testo dell'attesa, per i pannelli che possono dire
 *                           qualcosa di più preciso di "Caricamento in corso…".
 */
export function LazyPanel({ resetKey, onReset, overlay = false, label, children }) {
  return (
    <OverlayErrorBoundary resetKey={resetKey} onReset={onReset}>
      <Suspense fallback={<LazyFallback overlay={overlay} label={label} />}>
        {children}
      </Suspense>
    </OverlayErrorBoundary>
  );
}

export default LazyPanel;
