// src/lib/a11y.js
// A-2 dell'audit UX/errori del 1 settembre: 14 `<div onClick>` senza
// role/tabIndex/onKeyDown — aprire una conversazione, una scheda cliente, una
// task dal calendario non si faceva da tastiera.
//
// PERCHÉ UN HELPER E NON onKeyDown SCRITTO A MANO OGNI VOLTA. Le due domande
// «quali tasti attivano un elemento con ruolo button» (Invio E Spazio, non
// solo Invio) e «Spazio deve anche impedire lo scroll della pagina» hanno UNA
// risposta giusta, e copiarla a mano in decine di file è come i controlli di
// permesso duplicati che state/persistence.js esiste per chiudere: la prima
// copia che dimentica preventDefault su Spazio fa scrollare la pagina invece
// di attivare la riga, e nessun errore lo segnala.
//
// USO: su un `<div>`/`<span>` che si comporta come un pulsante,
//   <div role="button" tabIndex={0} onClick={apri} onKeyDown={attivaConTastiera(apri)}>
// `apri` riceve l'evento originale (click o keydown), esattamente come farebbe
// un onClick su un elemento nativo.

/**
 * onKeyDown per un elemento con `role="button"`: Invio e Spazio attivano
 * `onActivate` come farebbe un click; Spazio in più previene lo scroll della
 * pagina, che è il comportamento di default dei bottoni nativi.
 *
 * `e.target !== e.currentTarget` esce senza attivare: diverse delle righe che
 * usano questo helper (TaskCard, ClienteCard…) contengono ESSE STESSE bottoni
 * o link — lo swipe, l'avatar, un'azione rapida. Un Invio premuto su uno di
 * quei figli fa comunque bubblare il keydown fino a qui, e senza il confronto
 * la riga "si apre" una seconda volta sopra all'azione che l'utente ha
 * davvero attivato. Lo stesso confronto lo fanno già i veli dei modali
 * (`e.target === e.currentTarget` su onMouseDown, vedi ui/Modal.jsx) per la
 * stessa ragione con il mouse; qui è l'equivalente da tastiera. Su un div
 * senza figli interattivi il confronto non cambia nulla — l'evento nasce già
 * sul div che ha il focus.
 *
 * @param {function} onActivate riceve l'evento keydown, come farebbe onClick.
 * @returns {function}
 */
export const attivaConTastiera = (onActivate) => (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  if (e.target !== e.currentTarget) return;
  e.preventDefault();
  onActivate(e);
};
