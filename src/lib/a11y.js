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

/**
 * Le props che rendono una RIGA o CELLA di tabella azionabile da tastiera
 * senza sovrascriverne il ruolo implicito.
 *
 * A-2 dell'audit del 2 settembre: `jsx-a11y/no-static-element-interactions`
 * esamina i soli elementi STATICI, e `<tr>`/`<td>` portano i ruoli impliciti
 * `row`/`cell` — quindi per la regola non sono statici e non li guarda.
 * Mettere `role="button"` risolverebbe il buco della regola ma distruggerebbe
 * la semantica della griglia per uno screen reader: si tiene il ruolo
 * implicito e si aggiunge solo la tastiera.
 *
 * Riusa `attivaConTastiera`, quindi eredita lo stesso guard
 * (`e.target !== e.currentTarget`): una riga che contiene già un bottone
 * nativo (es. "Riapri"/"Cestina") non si attiva una seconda volta quando
 * quel bottone riceve Invio o Spazio.
 *
 * @param {function} onAziona riceve l'evento click o keydown.
 * @param {string} etichetta aria-label per chi naviga a schermo.
 */
export const cellaAzionabile = (onAziona, etichetta) => ({
  tabIndex: 0,
  "aria-label": etichetta,
  onClick: onAziona,
  onKeyDown: attivaConTastiera(onAziona),
});

// ─── M-2 dell'audit del 4 settembre · l'hover non basta ────────────────────
// Quaranta `onMouseEnter` contro quindici `onFocus`: venticinque affordance
// visive (sfondo, colore, sollevamento di una card) esistevano SOLO per chi
// usa il mouse. Il difetto non è l'assenza di un gestore — è che il codice ne
// scrive uno diverso per ogni coppia enter/leave, e copiarlo per la tastiera
// significherebbe raddoppiare ogni handler invece di condividerlo.
//
// `conTastiera(onEnter, onLeave)` prende le due funzioni che l'app già scrive
// per `onMouseEnter`/`onMouseLeave` — che siano una mutazione diretta dello
// stile (`e => e.currentTarget.style.background = "…"`) o un setter di stato
// (`() => setHovered(true)`) — e le rimette anche su `onFocus`/`onBlur`: un
// FocusEvent porta lo stesso `currentTarget` di un MouseEvent, quindi la
// stessa funzione serve a entrambi senza bisogno di saperlo.
//
// Non è la stessa cosa di `evidenziaConTastiera(imposta)` che il rilievo
// proponeva (un solo booleano): la maggioranza dei call site di QUESTA
// codebase non passa da uno stato React, muta lo stile direttamente — e un
// helper che pretendesse un booleano li avrebbe costretti a introdurne uno
// solo per usarlo. Accettare le due funzioni intere copre entrambi i casi
// con la stessa primitiva.
export const conTastiera = (onEnter, onLeave) => ({
  onMouseEnter: onEnter,
  onMouseLeave: onLeave,
  onFocus: onEnter,
  onBlur: onLeave,
});
