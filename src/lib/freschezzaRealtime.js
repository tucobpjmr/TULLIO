// src/lib/freschezzaRealtime.js
// ─── A-1 dell'audit UX/errori del 31 agosto ────────────────────────────────
// «Gli aggiornamenti automatici sono fermi»: un fatto solo, aggregato da nove
// canali.
//
// PERCHÉ ESISTE. `OfflineBanner` è nato dalla criticità #7 con una tesi che
// resta giusta: *«la condizione dura finché dura, e per tutto quel tempo ogni
// numero a schermo è un dato fermo. La persistenza è il messaggio.»* Ma la sua
// unica sorgente era `navigator.onLine`, che risponde a una domanda diversa —
// «l'interfaccia di rete è su?» — e il limite era già dichiarato per iscritto
// in hooks/useOnlineStatus.js:
//
//   «`true` significa soltanto "esiste una connessione", non che Supabase
//    risponda […] Coprire anche quelli richiede un segnale applicativo (stato
//    del canale realtime, esito delle query), che è una feature diversa.»
//
// Questo modulo è quel segnale applicativo, per la metà realtime.
//
// IL CASO REALE, che non è di laboratorio. Il websocket di Supabase Realtime
// può morire mentre `navigator.onLine` resta `true`: un portatile che esce
// dalla sospensione, un proxy aziendale che chiude le connessioni idle, il
// passaggio Wi-Fi→LTE su un telefono, il tetto di connessioni concorrenti del
// progetto. In tutti questi casi `.subscribe()` consegna `CHANNEL_ERROR` o
// `TIMED_OUT` al proprio callback di stato — che prima di A-1 non esisteva
// affatto, quindi lo stato si perdeva.
//
// La conseguenza è PEGGIO del caso offline, non uguale: lì almeno le scritture
// falliscono e producono un toast, qui le scritture HTTP continuano a
// funzionare e l'app sembra perfettamente viva mentre due agenti guardano la
// stessa lista e vedono saldi diversi.
//
// ─── PERCHÉ AGGREGATO, E NON UNO STATO PER TABELLA ─────────────────────────
// All'utente «gli aggiornamenti automatici sono fermi» è azionabile (ricarica);
// «il canale notices è in CHANNEL_ERROR» non lo è. La diagnosi per canale
// resta, ma in console — stessa divisione di components/ui/ErrorDetails.jsx:
// a schermo ciò che si può usare, il dettaglio dove lo legge chi ripara.
//
// ─── PERCHÉ UN MODULO E NON UNO STATO REACT ────────────────────────────────
// I produttori del segnale sono nove istanze di `useDebouncedTableSubscription`
// sparse per l'albero (sei in useAppHydration, più chat, notifiche e liste
// viaggio); il consumatore è UNO solo, la striscia sotto la topbar. Farlo
// passare per il reducer vorrebbe dire un'azione per ogni transizione di
// canale — cioè far ri-renderizzare l'app per un dato che nessuna vista legge —
// e farlo passare per un context vorrebbe dire un provider che avvolge tutto
// per servire un consumatore. Un registro di modulo con `useSyncExternalStore`
// sveglia esattamente chi guarda.
//
// Stessa forma (e stessa ragione) del sink di lib/errorReporting.js: un modulo
// puro, senza React, importabile dai produttori senza trascinarsi dietro nulla.

// Gli stati che supabase-js consegna al callback di `.subscribe()`. Solo
// 'SUBSCRIBED' è salute: gli altri tre significano tutti «da qui non arriva
// più niente», e la differenza fra loro è diagnostica, non operativa.
const STATI_ROTTI = new Set(["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"]);

// chiave del canale → ultimo stato consegnato. La chiave è per SOTTOSCRIZIONE
// e non per tabella: `users` è osservata due volte dalla stessa sessione (il
// refresh del team e la presenza), e con una chiave per tabella la seconda
// sovrascriverebbe lo stato della prima.
const stati = new Map();
const iscritti = new Set();

const degradato = () => {
  for (const stato of stati.values()) if (STATI_ROTTI.has(stato)) return true;
  return false;
};

/**
 * Registra lo stato di un canale. La chiamano i produttori a ogni transizione.
 *
 * @param {string} chiave  identificatore univoco della SOTTOSCRIZIONE
 * @param {string} stato   'SUBSCRIBED' | 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED'
 */
export function segnalaStatoCanale(chiave, stato) {
  const prima = degradato();
  stati.set(chiave, stato);
  const dopo = degradato();
  // Si notifica solo sulla TRANSIZIONE del fatto aggregato, non a ogni stato
  // ricevuto: nove canali che riagganciano insieme dopo una sospensione
  // consegnano nove 'SUBSCRIBED' e devono produrre un solo risveglio. È anche
  // il contratto che `useSyncExternalStore` si aspetta — notificare quando lo
  // snapshot cambia — e notificare di più significherebbe ri-renderizzare la
  // shell per un valore identico.
  if (prima !== dopo) iscritti.forEach((fn) => fn(dopo));
}

/**
 * Dimentica un canale: lo chiama il cleanup della sottoscrizione.
 *
 * Passa da `segnalaStatoCanale` invece di fare `stati.delete` e basta, perché
 * lo smontaggio di un canale ROTTO abbassa il fatto aggregato — e se nessuno
 * lo notificasse, la striscia resterebbe a schermo dopo che l'ultimo canale
 * degradato è stato smontato (cambio vista, logout), affermando una condizione
 * che non è più osservabile da nessuno.
 */
export function dimenticaCanale(chiave) {
  if (!stati.has(chiave)) return;
  const prima = degradato();
  stati.delete(chiave);
  const dopo = degradato();
  if (prima !== dopo) iscritti.forEach((fn) => fn(dopo));
}

/** Lo snapshot: `true` = almeno un canale non consegna più eventi. */
export const freschezzaDegradata = () => degradato();

/**
 * @param {(degradata: boolean) => void} fn
 * @returns {() => void} la deregistrazione, usabile come cleanup di un effetto.
 */
export function osservaFreschezza(fn) {
  iscritti.add(fn);
  return () => iscritti.delete(fn);
}

// Solo per i test: lo stato di modulo sopravvive fra un caso e l'altro nello
// stesso file, ed è la stessa ragione per cui errorReporting.js espone
// `_resetErrorReporting`.
export function _resetFreschezza() {
  stati.clear();
  iscritti.clear();
}
