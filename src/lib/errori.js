// src/lib/errori.js
// Il testo e il nome di ciò che una `catch` ha ricevuto.
//
// PERCHÉ ESISTE (M-3 dell'audit del 10 settembre). `catch (e) { e.message }`
// era scritto a mano in nove punti, e in JavaScript è una scommessa: `throw`
// accetta qualunque valore — una stringa, `undefined`, l'oggetto di risposta
// di una libreria — quindi `e.message` può essere `undefined` (toast vuoto) o
// sollevare a sua volta dentro il gestore d'errore, che è il posto peggiore
// dove sollevare. Alzando `useUnknownInCatchVariables` il compilatore ha
// smesso di far finta che ogni `catch` riceva un `Error`, e questi due helper
// sono la risposta unica alla domanda che i nove punti si facevano ciascuno
// per conto proprio.
//
// Non è un cambio di comportamento mascherato da tipizzazione: il ripiego
// resta quello che ogni chiamante aveva già scritto, e per un `Error` vero il
// testo prodotto è identico a prima.

/**
 * Il messaggio da mostrare per un'eccezione, qualunque cosa sia stata lanciata.
 * @param {unknown} e
 * @param {string} [ripiego] Il testo quando l'eccezione non ne porta uno.
 * @returns {string}
 */
export function testoEccezione(e, ripiego = "errore sconosciuto") {
  if (e instanceof Error) return e.message || ripiego;
  // Una stringa lanciata a mano è il caso più frequente dopo `Error`, ed è
  // già il messaggio. Tutto il resto (oggetti di libreria, `undefined`) non
  // ha un testo utile da estrarre: meglio il ripiego del chiamante, che
  // almeno dice quale operazione è fallita, di un "[object Object]".
  if (typeof e === "string" && e) return e;
  if (e && typeof e === "object" && typeof (/** @type {{message?: unknown}} */ (e).message) === "string") {
    return /** @type {{message: string}} */ (e).message || ripiego;
  }
  return ripiego;
}

/**
 * Il `name` di un'eccezione — `"AbortError"`, `"NotAllowedError"`, … — per chi
 * deve distinguere l'annullamento dell'utente da un guasto vero. Stringa vuota
 * se ciò che è arrivato non ne ha uno.
 * @param {unknown} e
 * @returns {string}
 */
export function nomeEccezione(e) {
  if (e && typeof e === "object" && typeof (/** @type {{name?: unknown}} */ (e).name) === "string") {
    return /** @type {{name: string}} */ (e).name;
  }
  return "";
}
