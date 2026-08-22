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

// ─── applicaRigaRealtime — suggerimento strategico n.1, audit del 16 agosto ──
// «Il passo non è riscrivere l'idratazione: è aggiungere ai payload realtime,
// che già contengono la riga, un percorso "applica questa riga" per le
// tabelle in cui la riga è autosufficiente — tasks, clients, notices.»
//
// Fino a questa correzione OGNI evento realtime su queste tre tabelle
// ricaricava l'ENTITÀ INTERA (`Tasks.list()`, `Clients.list()`,
// `Notices.list()`), indipendentemente da quante righe l'evento avesse
// davvero toccato — una sola. Il costo cresce col PRODOTTO fra righe e
// frequenza di scrittura, ed è quello che questa funzione elimina: applica
// la riga arrivata nel payload, senza toccare la rete.
//
// STESSA INVARIANTE di fondiScrittureInVolo, applicata a UN evento invece che
// a un refetch intero: per un id con una scrittura in volo vince SEMPRE lo
// stato locale. Qui il caso concreto non è "il server serve ancora il
// pre-immagine" (non c'è alcuna query in corso) ma "l'evento arrivato è di un
// ALTRO client che ha toccato la STESSA riga mentre la nostra scrittura non
// ha ancora fatto commit" — raro, ma la stessa finestra di rischio descritta
// sopra per SET_CLIENTS, e la stessa risposta: si scarta, il nostro stato
// ottimistico resta. L'eco della NOSTRA scrittura non arriva nemmeno fin qui:
// `subscribeToTable` la filtra per `origin_client` prima di invocare
// l'handler (lib/api.js).
//
// @param {Array<{id: string}>} collezione righe attualmente nello state
// @param {Map<string, number>|undefined} pending id → scritture in volo
// @param {{ eventType: 'INSERT'|'UPDATE'|'DELETE', id: string, row?: object }} evento
//   `row` è già nella forma app (mappata da chi chiama, fuori da qui: questo
//   modulo non conosce la forma del DB, come pendingWrites.js non l'ha mai
//   conosciuta). Assente su DELETE, dove serve solo l'id da togliere.
// @param {(prev: object, row: object) => object} [fondiRiga] su UPDATE/INSERT,
//   come combinare la riga arrivata con quella già in stato — di norma la
//   sostituzione totale basta (`row`), ma un payload realtime porta le SOLE
//   colonne della tabella: se la forma app ha campi che vivono altrove (i
//   `comments`/`history` del task, popolati da una query separata), un merge
//   totale li azzererebbe. Il chiamante che ne ha bisogno passa questa
//   funzione; default: sostituzione.
export function applicaRigaRealtime(collezione, pending, evento, fondiRiga) {
  const { eventType, id, row } = evento;
  const correnti = collezione || [];
  // Scrittura in volo su questa riga → vince il locale, l'evento si scarta.
  if (pending?.has(id)) return correnti;
  if (eventType === "DELETE") return correnti.filter(r => r.id !== id);
  const idx = correnti.findIndex(r => r.id === id);
  if (idx < 0) return [...correnti, row]; // INSERT (o un UPDATE mai visto prima)
  const merged = fondiRiga ? fondiRiga(correnti[idx], row) : row;
  const next = [...correnti];
  next[idx] = merged;
  return next;
}

// ─── fondiThreadCommenti — A-1, audit del 22 agosto ─────────────────────────
// I commenti non sono una colonna di `tasks`: arrivano da una query separata
// (`TaskThreads`) e si appoggiano sul task come campo `comments`. Applicarli
// significa quindi rimappare i task, e il farlo ha la STESSA invariante delle
// due funzioni qui sopra: per un id con una scrittura in volo vince sempre lo
// stato locale — un ADD_COMMENT appena dispatchato non si lascia sovrascrivere
// dal thread riletto dal server, che può non contenerlo ancora.
//
// PERCHÉ QUI E NON NEL REDUCER. I chiamanti sono due — SET_TASK_THREADS (il
// corpus) e MERGE_TASK_COMMENTS (il sottoinsieme che il ramo `soloThread`
// chiede quando l'evento realtime dice quali task hanno commenti nuovi) — e
// scriverla due volte significherebbe tenere allineate a mano due copie della
// stessa protezione sui pendenti: la classe di difetto che questo modulo esiste
// per chiudere. In più `src/state/reducer.js` ha un tetto di 550 righe che non
// si alza: quando lo sfonda, ciò che esce è la parte che NON è una transizione
// di stato (fu così per `buildLogEntry` → activityLog.js), ed è questa.
//
// ⚠️ `soloQuesti` distingue due semantiche diverse sulle chiavi ASSENTI, ed è
// l'unica ragione per cui esiste il parametro:
//   • assente  → `comments` è il CORPUS: un task che non compare ha davvero
//                zero commenti, e va scritto a `[]`;
//   • presente → `comments` è un SOTTOINSIEME: un task fuori dall'elenco non è
//                stato chiesto e va lasciato intatto, mentre uno DENTRO
//                l'elenco ma senza chiave ha avuto i commenti cancellati tutti
//                e va comunque scritto a `[]`.
// È per questo che l'elenco degli id viaggia esplicito invece di essere dedotto
// dalle chiavi della mappa: le due cose non coincidono nel secondo caso.
//
// @param {Array<{id: string}>} tasks       i task attualmente nello state
// @param {Map<string, number>|undefined} pending  id → scritture in volo
// @param {Record<string, object[]>} comments      commenti indicizzati per task_id
// @param {string[]} [soloQuesti]           gli id da aggiornare; assente = corpus
export function fondiThreadCommenti(tasks, pending, comments, soloQuesti) {
  const limite = soloQuesti ? new Set(soloQuesti) : null;
  return (tasks || []).map(t => (
    (limite && !limite.has(t.id)) || pending?.has(t.id)
      ? t
      : { ...t, comments: comments[t.id] || [] }
  ));
}
