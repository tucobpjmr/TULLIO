// src/state/toastQueue.js
// La coda dei toast: come si accodano, come si deduplicano, quanti ne stanno a
// schermo e come si RITIRA un successo che il server ha poi smentito.
//
// PERCHÉ NON STA PIÙ IN reducer.js. Stessa ragione di state/activityLog.js: il
// tetto di 550 righe che eslint.config.js concede al reducer non è un margine
// da consumare, è una deroga alla FORMA di quel file — uno switch che descrive
// per intero la macchina a stati e che si legge solo vedendolo tutto insieme.
// Aggiungendo B-2 (il ritiro del toast smentito) il file arrivava al tetto, e
// la domanda giusta in quel punto è quale fetta meriti un file suo, non di
// quanto alzare il numero.
//
// Questa è una risposta ovvia quanto quella del log: nessuna di queste tre
// funzioni è una transizione di stato. Sono la POLITICA della coda dei toast —
// dedup, cap, marcatura, ritiro — che il reducer applica ma non definisce.

/**
 * Accoda un toast invece di sovrascrivere quello corrente.
 *
 * Prima di questa funzione ogni azione scriveva `toast: {...}` e cancellava un
 * errore critico non ancora letto se nel frattempo arrivava un successo (o
 * viceversa) — vedi useAppHydration, che può emettere fino a 5 errori nella
 * stessa finestra.
 *
 * PURA: non muta `toasts`, ritorna un nuovo array.
 */
export function pushToast(toasts, { message, type, undoable }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Dedup per messaggio: cinque fetch falliti sulla stessa rete giù producono
  // lo stesso testo — cinque righe identiche in colonna non informano più di una.
  const senzaDuplicati = (toasts || []).filter(t => t.message !== message);
  const next = [...senzaDuplicati, { id, message, type, undoable: !!undoable }];
  // Cap a 3: oltre, la pila di toast copre la bottom-nav su mobile.
  return next.slice(-3);
}

/**
 * B-2 · Marca con il tipo dell'azione i toast che quell'azione ha appena
 * accodato, così il percorso d'errore sa quale ritirare.
 *
 * Si fa qui, nel wrapper, e non nei quaranta `pushToast` dei singoli case: il
 * tipo dell'azione lo conosce il wrapper, e una marcatura da ricordare a mano
 * quaranta volte è quella che il quarantunesimo dimentica. Tocca solo le voci
 * NUOVE — le altre sono già marcate — e restituisce `next` invariato quando la
 * coda non è cambiata, così non si sostituisce lo stato per nulla.
 */
export function marcaToast(precedenti, next, tipoAzione) {
  if (!next.toasts || next.toasts === precedenti) return next;
  return {
    ...next,
    toasts: next.toasts.map(t => (t.azione === undefined ? { ...t, azione: tipoAzione } : t)),
  };
}

/**
 * B-2 · Toglie dalla coda i toast di SUCCESSO prodotti da una certa azione.
 *
 * L'UI ottimistica accoda il successo nel reducer, cioè prima che la scrittura
 * parta: se poi fallisce, l'utente si ritrova in colonna «Task aggiornato!» e
 * «Salvataggio fallito: …» — due affermazioni contraddittorie, con quella
 * FALSA in cima. In un gestionale dove si registrano movimenti di denaro,
 * «credo di aver salvato» è il difetto più costoso possibile (vedi
 * lib/errorReporting.js).
 *
 * Il filtro è per AZIONE e non per tipo: gli altri successi a schermo possono
 * venire da una scrittura andata a buon fine un attimo prima, e ritirarli
 * sarebbe la stessa bugia al contrario.
 */
export function ritiraToast(toasts, tipoAzione) {
  return (toasts || []).filter(t => !(t.azione === tipoAzione && t.type === "success"));
}
