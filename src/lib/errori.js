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

// ─── GUASTO DI RETE ─────────────────────────────────────────────────────────

// I messaggi con cui un fetch fallito si presenta, per browser. Non c'è un
// codice: `fetch` rifiuta con un `TypeError` e un testo che ogni motore
// scrive a modo suo — Chrome «Failed to fetch», Firefox «NetworkError when
// attempting to fetch resource», Safari «Load failed», e supabase-js a volte
// lo re-impacchetta in `error.message` invece di rifiutare.
const TESTI_DI_RETE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|econnrefused|timeout/i;

/**
 * È un guasto di RETE (la scrittura non è mai arrivata al server) o un rifiuto
 * DEL server (RLS, vincolo, dato invalido)? La distinzione è tutta la coda
 * offline: il primo si rigioca identico, il secondo si rigiocherebbe
 * all'infinito.
 *
 * `navigator.onLine === false` ha la precedenza su qualunque testo: se il
 * browser dichiara che non c'è rete nel momento in cui la scrittura fallisce,
 * il motivo è quello — qualunque cosa dica il messaggio.
 *
 * @param {unknown} err
 * @returns {boolean}
 */
export function guastoDiRete(err) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const testo = err && typeof err === "object"
    ? String(/** @type {{message?: unknown}} */ (err).message ?? "")
    : String(err ?? "");
  return TESTI_DI_RETE.test(testo);
}

// ─── IL TESTO DI UN ERRORE PER CHI USA L'APP ────────────────────────────────

export const TESTO_RETE = "connessione assente o instabile: riprova quando la rete torna";
export const TESTO_SESSIONE = "la sessione è scaduta: esci e accedi di nuovo";
export const TESTO_PERMESSI = "non hai i permessi per questa operazione";

// Codici di Postgres (SQLSTATE) e di PostgREST. ⚠️ Solo codici il cui
// significato è lo stesso in ogni tabella: un testo che dipende dall'entità
// (es. «il cliente ha liste collegate») resta nel `mapError` della entry.
const PER_CODICE = {
  "23505": "esiste già un elemento con questi dati",
  "23503": "l'elemento è collegato ad altri dati",
  "23502": "manca un campo obbligatorio",
  "23514": "un valore non è ammesso",
  "22001": "un testo è troppo lungo",
  "22003": "un numero è fuori dall'intervallo ammesso",
  "22007": "una data non è valida",
  "22008": "una data non è valida",
  "22P02": "un valore ha un formato non valido",
  "42501": TESTO_PERMESSI,
  "40001": "un'altra modifica era in corso sullo stesso dato: riprova",
  "40P01": "un'altra modifica era in corso sullo stesso dato: riprova",
  "57014": "il server ha impiegato troppo a rispondere: riprova",
  "PGRST116": "il dato non esiste più (forse è stato appena eliminato)",
  "PGRST301": TESTO_SESSIONE,
  "PGRST303": TESTO_SESSIONE,
  // GoTrue (Auth): stessi casi, nomi suoi.
  "session_not_found": TESTO_SESSIONE,
  "refresh_token_not_found": TESTO_SESSIONE,
  "bad_jwt": TESTO_SESSIONE,
  "over_request_rate_limit": "troppe richieste in poco tempo: riprova fra qualche minuto",
};

// Messaggi P0001 sollevati dalle nostre funzioni ancora in inglese.
const P0001_IN_INGLESE = {
  "User is not active": "il tuo utente non è attivo: contatta un amministratore",
};

const PER_STATO_HTTP = {
  401: TESTO_SESSIONE,
  403: TESTO_PERMESSI,
  413: "il file è troppo grande",
  415: "questo tipo di file non è ammesso",
  429: "troppe richieste in poco tempo: riprova fra qualche minuto",
};

// SQLSTATE di Postgres (5 caratteri), PostgREST (`PGRST…`), GoTrue
// (`snake_case`). Ciò che non ha questa forma l'ha scritto l'app.
const isCodiceDiSistema = (codice) =>
  /^[0-9A-Z]{5}$/.test(codice) || codice.startsWith("PGRST") || /^[a-z]+(_[a-z]+)+$/.test(codice);

const UUID = /\s*\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const ERRORI_DI_PROGRAMMAZIONE = new Set(["TypeError", "ReferenceError", "RangeError", "SyntaxError"]);

/**
 * Il testo da mostrare a chi usa l'app per un errore qualunque: di rete, di
 * Postgres/PostgREST, dello Storage, di Auth, o scritto da noi.
 *
 * ⚠️ Il dettaglio tecnico NON va a schermo: chi chiama lo ha già scritto in
 * console. Un messaggio grezzo («new row violates row-level security
 * policy», «TypeError: Failed to fetch») non dice all'utente né cosa è
 * successo né cosa fare.
 *
 * Passano INVARIATI solo i testi scritti da noi:
 * - le eccezioni delle nostre RPC (`raise exception`, SQLSTATE `P0001`), già
 *   in italiano — senza gli uuid, che a chi legge non dicono nulla;
 * - gli errori senza codice costruiti dall'app o dalle Edge Function
 *   (`{ message }`, `erroreDiPermesso`, `RIFIUTO_RLS`).
 * Tutto il resto con un codice che non conosciamo diventa `ripiego`, che il
 * chiamante scrive in termini di ciò che NON è successo («task non salvato»).
 *
 * @param {unknown} err
 * @param {string} [ripiego]
 * @returns {string}
 */
export function erroreUtente(err, ripiego = "operazione non riuscita") {
  if (err === null || err === undefined || err === false) return ripiego;
  if (typeof err === "string") return guastoDiRete(err) ? TESTO_RETE : (err || ripiego);
  if (typeof err !== "object") return ripiego;

  const e = /** @type {{code?: unknown, message?: unknown, name?: unknown, status?: unknown, statusCode?: unknown}} */ (err);
  const codice = typeof e.code === "string" ? e.code : "";
  const messaggio = typeof e.message === "string" ? e.message.trim() : "";
  const nome = typeof e.name === "string" ? e.name : "";

  if (codice === "P0001") {
    const pulito = messaggio.replace(UUID, "").trim();
    return P0001_IN_INGLESE[pulito] ?? (pulito || ripiego);
  }
  // Il codice viene PRIMA del testo: «statement timeout» (57014) contiene
  // «timeout» ma non è un guasto di rete.
  if (Object.hasOwn(PER_CODICE, codice)) return PER_CODICE[codice];
  if (/^08[0-9A-Z]{3}$/.test(codice)) return TESTO_RETE;
  if (/^53[0-9A-Z]{3}$/.test(codice)) return "il server è momentaneamente sovraccarico: riprova fra poco";
  if (guastoDiRete(err)) return TESTO_RETE;

  const stato = Number(e.status ?? e.statusCode);
  if (Object.hasOwn(PER_STATO_HTTP, stato)) return PER_STATO_HTTP[stato];
  if (/row-level security/i.test(messaggio)) return TESTO_PERMESSI;
  if (/mime type/i.test(messaggio)) return PER_STATO_HTTP[415];

  // Un codice di sistema che non conosciamo, un errore di libreria (Storage,
  // Auth) o di programmazione: il messaggio è tecnico, si mostra il ripiego.
  // I codici dell'APP (`CONFLITTO`, …) accompagnano un testo nostro e passano.
  if (isCodiceDiSistema(codice)) return ripiego;
  if (nome.startsWith("Storage") || nome.startsWith("Auth")) return ripiego;
  if (ERRORI_DI_PROGRAMMAZIONE.has(nome)) return ripiego;
  return messaggio || ripiego;
}
