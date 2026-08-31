// src/components/ui/pilaModali.js
// La pila dei modali aperti: Esc deve chiudere UN modale, quello in cima.
//
// Prima viveva SOLO dentro ui/Modal.jsx: `LvOverlay.jsx` (gli undici modali
// del modulo Liste) ascolta lo stesso `keydown` su `window` senza
// parteciparvi, quindi un Esc con una `ConfirmDialog` aperta SOPRA un modale
// Liste ne chiuderebbe due — B-3 dell'audit UX/errori del 31 agosto. Estratta
// qui perché è la stessa regola per entrambi i gusci, non una cosa che
// `ui/Modal` possiede e `LvOverlay` prende in prestito.
//
// Un array di token opachi e non un contatore: l'ordine di smontaggio non è
// garantito essere l'inverso di quello di montaggio (React può smontare un
// sottoalbero intero), quindi la rimozione avviene per identità.
const pila = [];

/** Registra l'apertura di un modale e ritorna il suo token nella pila. */
export function apriModale() {
  const token = {};
  pila.push(token);
  return token;
}

/** Toglie il modale dalla pila (smontaggio o chiusura). */
export function chiudiModale(token) {
  const i = pila.indexOf(token);
  if (i >= 0) pila.splice(i, 1);
}

/** true se `token` è il modale più in alto: solo lui deve reagire a Esc. */
export function inCima(token) {
  return pila.length > 0 && pila[pila.length - 1] === token;
}

// Solo per i test: la pila è stato di modulo e sopravvive fra un caso e
// l'altro nello stesso file altrimenti.
export function _resetPilaModali() { pila.length = 0; }
