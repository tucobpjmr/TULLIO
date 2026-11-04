// src/state/campiPrima.js
// M-1 dell'audit del 4 novembre · cosa rimette a posto l'annullamento di uno
// swipe.
//
// Prima `lastAction.prevSnapshot` era il task INTERO com'era prima dello
// swipe, e annullare lo riscriveva tutto — in locale e sul server — cancellando
// ciò che un collega aveva cambiato nei secondi in mezzo (una scadenza, una
// descrizione). Ora il reducer salva solo i campi che lo swipe ha toccato
// (`prevSnapshot`, da questa funzione) e i valori che lo swipe ha messo
// (`valoriSwipe`): l'annullamento rimette i primi, e sul server passa solo se
// la riga ha ancora i secondi (state/scritturaTaskConfrontata.js).
// Un modulo a parte perché reducer.js è al tetto di righe fisiche.

/**
 * I valori che `task` aveva nei campi di `patch`, più `completedAt` quando lo
 * swipe cambia lo stato (il reducer lo ricalcola, l'annullamento lo rimette).
 * @param {Record<string, any>} task
 * @param {Record<string, any>} patch
 */
export const campiPrima = (task, patch) => {
  const prima = Object.fromEntries(Object.keys(patch).map((k) => [k, task[k]]));
  return "status" in patch ? { ...prima, completedAt: task.completedAt ?? null } : prima;
};
