// src/state/pendingWrites.js
// La fusione fra una lista appena riscaricata dal server e le righe che stiamo
// scrivendo in questo momento. Una definizione sola, letta da SET_TASKS,
// SET_CLIENTS e SET_NOTICES.
//
// PERCHÉ ESISTE (A-1 dell'audit del 14 agosto, terzo passaggio). Il meccanismo
// `entityId` + MARK_PENDING_WRITE è nato per i task e per anni è rimasto solo
// lì: state/persistence.js lo dichiarava esplicitamente («Lo dichiarano oggi le
// sole entry sui TASK… quando SET_CLIENTS/SET_NOTICES avranno lo stesso
// trattamento, basterà aggiungere il campo alle loro entry»). Era una scelta
// corretta finché `clients` non era una tabella in realtime: senza
// sottoscrizione non esiste il refetch concorrente da cui proteggersi.
//
// Dalla migrazione 20260807215625 `clients` È in realtime, e la finestra si è
// aperta sull'entità più grande del progetto — l'unica che contiene PII di
// persone esterne al team. Il difetto è quello descritto in persistence.js:
//
//   1. l'utente salva una scheda cliente → il reducer applica in ottimistico;
//   2. prima che la UPDATE committi, un evento realtime causato da un ALTRO
//      utente fa ripartire ClientsAPI.list();
//   3. la risposta è più recente per tutte le righe tranne la nostra, che il
//      server serve ancora nel suo pre-immagine: SET_CLIENTS sostituisce
//      l'array e la modifica sparisce dallo schermo;
//   4. quando la UPDATE committa, la sua eco realtime porta il nostro
//      `origin_client` e viene SCARTATA da subscribeToTable — quindi nessun
//      secondo refetch viene a correggere la UI, che resta indietro rispetto
//      al database fino al reload successivo.
//
// L'utente vede il proprio salvataggio annullarsi da solo, con un toast verde
// che dice che è riuscito (e sul database lo è davvero).
//
// La funzione è la logica che viveva in linea nel case SET_TASKS: estrarla non
// era solo per riusarla in tre punti, ma perché è l'invariante — «per un id con
// scrittura in volo vince SEMPRE la riga locale» — e un'invariante scritta tre
// volte è un'invariante che regge fino alla prima distrazione.

/**
 * @template {{ id: string }} T
 * @param {T[]} incoming righe appena arrivate dal server
 * @param {T[]} locali righe attualmente nello state
 * @param {Map<string, number>|undefined} pending id → scritture in volo
 * @returns {T[]}
 */
export function fondiScrittureInVolo(incoming, locali, pending) {
  const arrivate = Array.isArray(incoming) ? incoming : [];
  if (!pending?.size) return arrivate;
  const correnti = locali || [];
  const perId = new Map(correnti.map(r => [r.id, r]));
  // Per un id in volo vince la riga locale — compreso il caso in cui
  // localmente NON esista più (DELETE ottimistico: il server la serve ancora,
  // e rimetterla in lista farebbe riapparire ciò che l'utente ha appena
  // cancellato).
  const tenute = arrivate
    .filter(r => !pending.has(r.id) || perId.has(r.id))
    .map(r => (pending.has(r.id) ? perId.get(r.id) : r));
  // …e il simmetrico: una riga creata in ottimistico che il server non serve
  // ancora va tenuta, altrimenti il refetch la fa sparire appena creata.
  const serviti = new Set(arrivate.map(r => r.id));
  const nonAncoraSulServer = correnti.filter(r => pending.has(r.id) && !serviti.has(r.id));
  return nonAncoraSulServer.length ? [...nonAncoraSulServer, ...tenute] : tenute;
}
