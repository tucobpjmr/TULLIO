// src/lib/errorReporting.js
// ─── RETE DI SICUREZZA PER GLI ERRORI NON GESTITI ──────────────────────────
// I percorsi d'errore dell'app sono tre: render (error boundary), scritture
// del core (useSyncedDispatch), scritture delle Liste (useListeWrite). Qui
// c'è l'ultimo anello: `unhandledrejection`, `error` e le violazioni CSP
// diventano un toast, un codice e una riga in `error_reports`. Non fa
// rollback: non sa cosa fosse in volo.
//
// In sviluppo un crash di vista produce pannello e toast (React 18 rilancia in
// DEV gli errori già gestiti da un boundary). In produzione solo il pannello.
// Non si filtra: un'euristica rischierebbe di ingoiare l'errore vero.

// Il consumatore dei messaggi, registrato da VoyageDesk: questo modulo non
// conosce il reducer. Finché è null si logga soltanto.
let sink = null;

// ─── CODICE DI SEGNALAZIONE ────────────────────────────────────────────────
// A schermo un codice da dettare, in console lo stesso codice accanto al
// dettaglio. `VD-<istante in base36>-<4 caratteri>`: ordinabile, senza
// collisioni pratiche.
export function codiceSegnalazione() {
  const istante = Date.now().toString(36).toUpperCase();
  const casuale = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VD-${istante}-${casuale}`;
}

export function registraSinkErrori(fn) {
  sink = fn;
  // Ritorna la deregistrazione (cleanup di useEffect). Il confronto d'identità
  // evita che uno smontaggio tardivo cancelli il sink di un altro.
  return () => { if (sink === fn) sink = null; };
}

// Solo per i test: azzera sink e memoria del dedup.
export function _resetErrorReporting() {
  sink = null;
  recenti.clear();
}

// ─── RICONOSCIMENTO DEL RUMORE ─────────────────────────────────────────────
// Un handler globale serve solo se tace su ciò che non è un problema.

// `error` riceve anche i fallimenti di caricamento delle risorse (<img>, …):
// un avatar con signed URL scaduta non è un'eccezione.
const isErroreDiRisorsa = (ev) =>
  !!ev?.target && ev.target !== window && typeof ev.target.tagName === "string";

// Cancellazione volontaria con AbortController: non è un errore.
const isAbort = (e) =>
  e?.name === "AbortError" || /\bAbortError\b|aborted/i.test(String(e?.message ?? ""));

// Nome E messaggio: ChunkLoadError porta l'informazione nel `name`.
const superficie = (e) => `${e?.name ?? ""} ${e?.message ?? (typeof e === "string" ? e : "")}`;

// Il loop di ResizeObserver è rumore benigno di Chrome.
const isRumoreBrowser = (e) => /ResizeObserver loop/i.test(superficie(e));

// Chunk lazy che risponde 404: succede a ogni deploy con una scheda aperta, e
// l'unica azione utile è ricaricare. Quattro forme (Chrome, Firefox, Safari,
// webpack). Esportato (A-4): lo usano anche i boundary, per offrire «Ricarica»
// invece del pannello generico.
export const isChunkMancante = (e) =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \S+ failed/i
    .test(superficie(e));

// ─── COMPOSIZIONE DEL MESSAGGIO ────────────────────────────────────────────
// Un Error non si serializza con JSON.stringify ("{}"): mai una stringa vuota.
const testoLeggibile = (motivo) => {
  if (typeof motivo === "string" && motivo.trim()) return motivo.trim();
  const m = motivo?.message;
  if (typeof m === "string" && m.trim()) return m.trim();
  return "errore imprevisto";
};

// B-2 · Stessa politica di ErrorDetails: un errore del data layer (un
// vincolo PostgREST) resta leggibile; un errore di PROGRAMMAZIONE (TypeError,
// ReferenceError, RangeError) diventa un codice da dettare.
const isErroreDiProgrammazione = (e) =>
  e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError;

const messaggioUtente = (motivo, codice) => {
  if (isChunkMancante(motivo)) return "L'app è stata aggiornata: ricarica la pagina per continuare.";
  if (import.meta.env.DEV || !isErroreDiProgrammazione(motivo)) {
    return `Operazione non riuscita: ${testoLeggibile(motivo)}`;
  }
  return `Operazione non riuscita. Se si ripete, segnala il codice ${codice}.`;
};

// ─── ANTI-RAFFICA ──────────────────────────────────────────────────────────
// Lo stesso errore in loop riscriverebbe il toast molte volte al secondo: una
// ripetizione passa solo dopo la finestra.
const FINESTRA_DEDUP_MS = 5000;
const recenti = new Map();

const giaSegnalato = (messaggio) => {
  const ora = Date.now();
  const precedente = recenti.get(messaggio);
  if (precedente !== undefined && ora - precedente < FINESTRA_DEDUP_MS) return true;
  recenti.set(messaggio, ora);
  // Potatura: una sessione lunga non fa crescere la Map senza limite.
  if (recenti.size > 50) {
    for (const [k, t] of recenti) {
      if (ora - t >= FINESTRA_DEDUP_MS) recenti.delete(k);
    }
  }
  return false;
};

// ─── A-4 · LA SEGNALAZIONE HA UN POSTO DOVE ESSERE CERCATA ─────────────────
// Codice e dettaglio vanno anche in `error_reports` (migrazione
// 20260901120000), leggibile dagli admin.
// `import()` dinamico: un import statico di lib/api.js riporterebbe il data
// layer nel chunk d'ingresso (questo modulo lo installa main.jsx).
// Fire-and-forget: un invio fallito non deve produrre un secondo errore.
//
// ⚠️ M-2 · Si redige la PII QUI: un rifiuto di Postgres cita il valore («Key
// (email)=(…) already exists»), e la tabella la legge chi non vede
// l'anagrafica. Copre le forme NOTE (email, telefono), non è una garanzia.
const redigiPii = (testo) =>
  String(testo ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "«email»")
    .replace(/(?<!\d)(?:\+\d{1,3}[ .-]?)?(?:\d[ .-]?){8,14}\d(?!\d)/g, "«telefono»");

// B-3 · Anche `url` passa da `redigiPii`, e di `userAgent` resta la sola
// famiglia del browser. L'ordine dei confronti conta: Edge e Opera contengono
// "Chrome/", Chrome contiene "Safari/".
const famigliaBrowser = (userAgent) => {
  const ua = String(userAgent ?? "");
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "altro";
};

// Esportata: la usano i due handler globali e creaErrorBoundary.jsx, con lo
// stesso codice mostrato a schermo.
// ⚠️ La redazione vale solo per la tabella: `console.error` resta intero (non
// attraversa alcun confine di autorizzazione).
export function registraSegnalazione(codice, origine, motivo, dettaglioAggiuntivo) {
  const stackGrezzo = motivo?.stack || dettaglioAggiuntivo || null;
  import('./api.js').then(({ ErrorReports }) => ErrorReports.create({
    code: codice,
    origin: origine,
    message: redigiPii(testoLeggibile(motivo)),
    stack: stackGrezzo ? redigiPii(stackGrezzo) : null,
    url: typeof window !== "undefined" ? redigiPii(window.location?.href) : null,
    userAgent: typeof navigator !== "undefined" ? famigliaBrowser(navigator.userAgent) : null,
  })).catch(() => {});
}

// ─── INSTALLAZIONE ─────────────────────────────────────────────────────────

function segnala(motivo, origine) {
  if (isAbort(motivo) || isRumoreBrowser(motivo)) return;

  // Il codice nasce qui: lo stesso in console e nel toast.
  const codice = codiceSegnalazione();

  // La console non passa dal dedup: chi diagnostica vuole tutte le occorrenze.
  console.error(`[VoyageDesk] errore non gestito (${origine}) (${codice}):`, motivo);
  // A-4 · Neanche la segnalazione passa dal dedup: «succede in continuazione»
  // è un'informazione.
  registraSegnalazione(codice, origine, motivo);

  if (!sink) return;
  // La chiave di dedup è la superficie dell'errore, non il messaggio (che porta
  // un codice nuovo a ogni occorrenza).
  const chiaveDedup = `${origine}:${superficie(motivo)}`;
  if (giaSegnalato(chiaveDedup)) return;
  sink(messaggioUtente(motivo, codice));
}

// ─── M-6 · una violazione CSP non è un errore JS ───────────────────────────
// L'elemento bloccato non si carica e basta: `securitypolicyviolation` la
// rende visibile, sullo stesso canale (codice VD-…, `error_reports`). Non
// passa da `segnala()`: i filtri anti-rumore sono per le eccezioni.
function onCsp(ev) {
  const codice = codiceSegnalazione();
  const dettaglio = `${ev.violatedDirective}: ${ev.blockedURI || "(inline)"}`;
  console.error(`[VoyageDesk] violazione CSP (${codice}):`, dettaglio, ev);
  registraSegnalazione(
    codice, "csp", new Error(dettaglio),
    `${ev.sourceFile ?? ""}:${ev.lineNumber ?? ""}`,
  );
}

/**
 * Aggancia i due handler globali del browser. Va chiamata una volta sola, il
 * più presto possibile (main.jsx, accanto alla registrazione del service
 * worker): un errore avvenuto prima dell'installazione è per definizione
 * fuori portata.
 *
 * @returns {() => void} funzione di disinstallazione (usata dai test; in app
 *                       gli handler restano per tutta la vita della pagina).
 */
export function installaHandlerGlobali() {
  const onRejection = (ev) => segnala(ev?.reason, "promise");

  const onError = (ev) => {
    // Un'immagine che non carica non è un'eccezione.
    if (isErroreDiRisorsa(ev)) return;
    // `message` è il fallback degli script cross-origin ("Script error.").
    segnala(ev?.error ?? ev?.message, "runtime");
  };

  window.addEventListener("unhandledrejection", onRejection);
  // Capture: i fallimenti di risorsa non fanno bubbling, e vanno scartati
  // consapevolmente.
  window.addEventListener("error", onError, true);
  document.addEventListener("securitypolicyviolation", onCsp);

  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError, true);
    document.removeEventListener("securitypolicyviolation", onCsp);
  };
}
