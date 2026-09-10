// scripts/verifica-convenzioni/colori.js
// Il controllo sui colori scritti in duro, che è nato con il tema scuro.
//
// PERCHÉ UN FILE SUO e non una funzione in più in `convenzioni.js`: quel file
// era a 500 righe effettive, cioè al tetto che `max-lines` dichiara un errore
// senza deroghe (docs/CLAUDE.md). È la stessa ragione per cui esiste
// `ancore.js`, e la regola vale anche per gli script che verificano la regola.

/**
 * M-4 dell'audit del 10 settembre · I COLORI SCRITTI IN DURO.
 *
 * PERCHÉ SI CONTANO. Il tema scuro non è una seconda serie di regole CSS: è la
 * RIDEFINIZIONE dei token in `styles/global.css`. Funziona quindi esattamente
 * per ciò che passa dai token, e ogni `#1A1A2E` scritto a mano in un
 * componente è un pezzo di interfaccia che al buio resta chiaro — senza che
 * nulla lo segnali, perché non è un errore: è un colore valido, nel posto
 * sbagliato.
 *
 * PERCHÉ UN RATCHET E NON ZERO. Non tutti i 310 rimasti sono debito. Restano
 * legittimamente:
 *   · i colori-DATO (`state/taskCategories.js`, `lib/taskConstants.js`): sono
 *     la palette per categoria e per ruolo, cioè contenuto, non tema;
 *   · l'inchiostro su fondo oro e le due piastrelle di marca, dove il colore
 *     NON deve cambiare col tema (vedi i commenti in Topbar.jsx e PushToggle.jsx);
 *   · le schermate fuori dall'app montata (`auth/`), che vivono prima dei token.
 * Distinguerli automaticamente richiederebbe capire su che fondo finisce
 * ciascuno — cioè eseguire il browser. La soglia è quindi il numero di oggi:
 * si può solo ABBASSARE, e chi la abbassa aggiorna il numero qui accanto.
 *
 * `src/styles/` è escluso per costruzione: è il posto dove i colori DEVONO
 * essere scritti per esteso, ed è l'unico.
 *
 * @param {{path: string, testo: string}[]} sorgenti
 * @returns {number}
 */
export function coloriInDuro(sorgenti) {
  const ESADECIMALE = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
  return (sorgenti || [])
    .filter(f => !f.path.startsWith('src/styles/'))
    .reduce((tot, f) => tot + (f.testo.match(ESADECIMALE) || []).length, 0);
}
