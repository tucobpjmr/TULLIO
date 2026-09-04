// src/lib/errorReporting.js
// ─── RETE DI SICUREZZA PER GLI ERRORI NON GESTITI ──────────────────────────
//
// PERCHÉ ESISTE. L'app aveva tre percorsi d'errore, tutti buoni, e tutti
// parziali:
//
//   render          → ErrorBoundary / ViewErrorBoundary (components/errors/)
//   scritture core  → useSyncedDispatch, che fa rollback e mostra il toast
//   scritture liste → useListeWrite, stesso trattamento
//
// Fuori da questi tre non c'era NULLA. Un `.then()` di una subscription, un
// event handler `async`, un upload, un timer: quando fallivano, l'errore
// finiva in console e per l'utente non era mai successo niente. In un
// gestionale dove si registrano movimenti di denaro, «credo di aver salvato»
// è il difetto più costoso possibile — peggio di un errore mostrato male.
//
// Qui si chiude il perimetro: i due eventi globali del browser
// (`unhandledrejection` e `error`) diventano l'ultimo anello, quello che
// raccoglie ciò che nessun registry ha intercettato. Non sostituisce i
// percorsi sopra — non può: non sa cosa fosse in volo, non ha uno stato da
// riportare indietro. Dice soltanto all'utente che qualcosa non è riuscito,
// che è esattamente ciò che oggi non viene detto.
//
// COSA NON FA, DI PROPOSITO. Non invia nulla a un servizio di monitoraggio:
// non ce n'è uno, e fingere di averlo con un endpoint inventato sarebbe
// peggio del silenzio attuale. Quando ci sarà, il punto in cui agganciarlo è
// `segnala()` qui sotto, e non i quaranta call site che oggi non esistono.
//
// NOTA SUL DOPPIO AVVISO IN SVILUPPO. React 18, in DEV, ri-lancia in un task
// separato anche gli errori di render che un Error Boundary ha già gestito
// (è il meccanismo che li fa comparire in console e nei DevTools). Il
// listener `error` li vede, quindi in sviluppo un crash di vista produce sia
// il pannello del boundary sia un toast. In produzione React NON ri-lancia
// ciò che un boundary ha gestito, quindi l'utente vede solo il pannello.
// Filtrarlo richiederebbe di indovinare quali errori un boundary prenderà —
// una cosa che si può sapere solo dopo — e il rumore in dev è preferibile a
// una euristica che in produzione rischia di ingoiare l'errore vero.

// Il consumatore corrente dei messaggi. È VoyageDesk a registrarlo: così
// questo modulo non conosce né il reducer né la forma dell'azione toast, e
// resta importabile da chiunque senza trascinarsi dietro React.
//
// Finché è null si logga soltanto: è la finestra fra il caricamento del
// bundle e il mount dell'app (e quella dopo lo smontaggio), in cui l'unica
// UI possibile è comunque l'ErrorBoundary di main.jsx.
let sink = null;

// ─── CODICE DI SEGNALAZIONE (criticità #9) ─────────────────────────────────
// Quando un boundary scatta, l'utente ha bisogno di qualcosa da COMUNICARE, e
// gli sviluppatori di qualcosa da CERCARE. Finora quel qualcosa era lo stack
// dei componenti stampato a schermo: illeggibile per il primo (rumore) e
// inutile al secondo (nessuno lo trascrive davvero), e per giunta racconta a
// chiunque guardi lo schermo com'è fatta l'app dentro.
//
// Un codice breve fa entrambe le cose meglio: l'utente lo detta al telefono,
// e la stessa stringa compare accanto all'errore completo in console — che è
// dove il dettaglio va, non a schermo. Il formato è deliberatamente parlante:
// `VD-<istante in base36>-<4 caratteri casuali>`, quindi ordinabile nel tempo
// e senza collisioni pratiche fra sessioni diverse.
export function codiceSegnalazione() {
  const istante = Date.now().toString(36).toUpperCase();
  const casuale = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `VD-${istante}-${casuale}`;
}

export function registraSinkErrori(fn) {
  sink = fn;
  // Ritorna la funzione di deregistrazione, così il chiamante può usarla come
  // cleanup di useEffect. Il confronto d'identità evita che uno smontaggio
  // tardivo cancelli il sink che nel frattempo ha registrato qualcun altro.
  return () => { if (sink === fn) sink = null; };
}

// Solo per i test: azzera lo stato di modulo (sink + memoria del dedup), che
// altrimenti sopravvive fra un caso e l'altro nello stesso file.
export function _resetErrorReporting() {
  sink = null;
  recenti.clear();
}

// ─── RICONOSCIMENTO DEL RUMORE ─────────────────────────────────────────────
// Un handler globale è utile quanto è silenzioso sulle cose che non sono
// problemi dell'utente. Senza questi filtri il primo effetto pratico sarebbe
// una pioggia di toast su eventi che l'app gestisce già o che non la
// riguardano, e la reazione naturale sarebbe disattivarlo.

// `window.addEventListener('error')` riceve ANCHE i fallimenti di caricamento
// delle risorse (<img>, <script>, <link>), che non sono eccezioni JavaScript:
// arrivano senza `error` e col tag dell'elemento in `target`. Nell'app sono
// tutt'altro che teorici — gli avatar sono <img> con signed URL a scadenza, e
// una URL scaduta produrrebbe un toast a ogni riga di elenco.
const isErroreDiRisorsa = (ev) =>
  !!ev?.target && ev.target !== window && typeof ev.target.tagName === "string";

// Cancellazione volontaria: `AbortController` usato per scartare una fetch
// che non serve più (RiepilogoClienteModal lo fa quando si cambia cliente
// prima che la precedente risponda). È il funzionamento corretto, non un
// errore, e l'utente non deve saperne nulla.
const isAbort = (e) =>
  e?.name === "AbortError" || /\bAbortError\b|aborted/i.test(String(e?.message ?? ""));

// Superficie su cui girano i riconoscitori: nome E messaggio insieme. Il nome
// da solo non basta (un errore di rete generico non ne ha uno utile), ma il
// messaggio da solo nemmeno — ChunkLoadError porta l'informazione proprio nel
// `name`, e il suo messaggio è un generico "Loading chunk 42 failed".
const superficie = (e) => `${e?.name ?? ""} ${e?.message ?? (typeof e === "string" ? e : "")}`;

// Rumore noto dei browser, benigno e fuori dal nostro controllo: il loop di
// ResizeObserver scatta su layout perfettamente validi ed è emesso da Chrome
// come errore globale senza che nulla sia andato storto.
const isRumoreBrowser = (e) => /ResizeObserver loop/i.test(superficie(e));

// Un chunk lazy che risponde 404 è il caso più frequente in produzione:
// succede a OGNI deploy con una scheda aperta, perché gli hash dei file
// cambiano e quelli vecchi spariscono. Merita un messaggio suo — qui l'unica
// azione utile è ricaricare, e un «errore imprevisto» non lo direbbe.
//
// Le forme coperte sono quattro perché variano per browser e per bundler:
// Vite/Rollup producono le prime tre (Chrome, Firefox e Safari usano ognuno la
// propria), `ChunkLoadError` è la forma storica di webpack — che questo
// progetto non usa oggi, ma che arriva comunque da dipendenze e polyfill.
// Esportato (A-4): serve a DUE consumatori con lo stesso bisogno — questo
// handler, che deve dire la frase giusta, e i tre error boundary
// (creaErrorBoundary.jsx), che devono offrire il bottone giusto invece del
// pannello generico. Tenerlo privato ha significato finora che i boundary non
// lo sapevano: un chunk mancante che fallisce dentro un render (non in un
// `.then()`/evento globale) non passa da qui, passa da un boundary, e quello
// applicava comunque il pannello «Questa sezione ha avuto un problema» con
// «← Torna alla Dashboard» — un rimedio che non ripara nulla e richiude il
// ciclo (si torna, si riclicca, il chunk manca ancora).
export const isChunkMancante = (e) =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \S+ failed/i
    .test(superficie(e));

// ─── COMPOSIZIONE DEL MESSAGGIO ────────────────────────────────────────────
// Stessa logica di lib/api.js (errText): un Error non è serializzabile con
// JSON.stringify — message e stack sono proprietà non enumerabili — e
// finirebbe mostrato come "{}". Qui non si arriva mai a una stringa vuota.
const testoLeggibile = (motivo) => {
  if (typeof motivo === "string" && motivo.trim()) return motivo.trim();
  const m = motivo?.message;
  if (typeof m === "string" && m.trim()) return m.trim();
  return "errore imprevisto";
};

// B-2 · `ErrorDetails` in produzione NASCONDE il messaggio dell'eccezione
// (rumore per l'utente + information disclosure), e questo handler faceva il
// contrario sullo stesso schermo: `Operazione non riuscita: Cannot read
// properties of undefined (reading 'assignees')` o `…: Failed to fetch`
// finivano in un toast davanti a un agente di viaggio. Le due politiche vanno
// allineate, non irrigidite: un errore del DATA LAYER porta informazione
// azionabile (un vincolo PostgREST dice quale regola ha respinto la
// scrittura) e resta leggibile; un errore di PROGRAMMAZIONE (TypeError,
// ReferenceError, RangeError) no, e diventa un codice da dettare — la stessa
// politica di ErrorDetails, applicata all'altro canale.
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
// Una promise che fallisce dentro un intervallo o una subscription che
// riaggancia in loop produce lo stesso errore molte volte al secondo. Il
// toast è uno slot singolo: ogni ripetizione lo riscrive e fa ri-renderizzare
// l'app, senza aggiungere una sola informazione. Ricordiamo l'ultimo istante
// per messaggio e lasciamo passare la ripetizione solo dopo la finestra.
const FINESTRA_DEDUP_MS = 5000;
const recenti = new Map();

const giaSegnalato = (messaggio) => {
  const ora = Date.now();
  const precedente = recenti.get(messaggio);
  if (precedente !== undefined && ora - precedente < FINESTRA_DEDUP_MS) return true;
  recenti.set(messaggio, ora);
  // Potatura opportunistica: senza, una sessione lunga con errori sempre
  // diversi farebbe crescere la Map senza limite.
  if (recenti.size > 50) {
    for (const [k, t] of recenti) {
      if (ora - t >= FINESTRA_DEDUP_MS) recenti.delete(k);
    }
  }
  return false;
};

// ─── A-4 (audit UX/errori del 1 settembre) · LA SEGNALAZIONE HA UN POSTO ───
// DOVE ESSERE CERCATA. Il codice nasce per essere dettato al telefono, ma
// finché finiva solo in `console.error` esisteva solo nel browser di chi
// aveva avuto l'errore: chi RICEVE la segnalazione (un admin, chi sviluppa)
// non aveva nessun posto in cui cercarla. Ora la stessa coppia
// codice+dettaglio finisce anche in una tabella che gli admin possono
// leggere (`error_reports`, migrazione 20260901120000).
//
// `import()` DINAMICO e non uno statico in testa al file: questo modulo lo
// installa main.jsx PRIMA del mount (vedi installaHandlerGlobali più sotto),
// e `lib/api.js` è la porta dell'intero data layer — un import statico lo
// riporterebbe nel chunk d'ingresso, esattamente ciò che B-1 dell'audit
// performance del 16 agosto ha tolto da AuthGate.jsx. Qui il costo si paga
// solo quando succede DAVVERO un errore, e quel chunk è quasi sempre già in
// volo per altre ragioni (l'app è montata).
//
// Fire-and-forget per costruzione: siamo già dentro il percorso che gestisce
// un errore non gestito. Se anche l'invio fallisce (rete, RLS), non deve MAI
// produrre un secondo errore non gestito — richiuderebbe il cerchio su se
// stesso — né bloccare l'utente, che ha già il suo toast.
//
// ─── M-2 (audit del 2 settembre) · IL CONTRATTO DELLA TABELLA VALE ANCHE ───
// PER CHI CI SCRIVE. `public.error_reports` dichiara di non contenere PII
// oltre a quella già in `users`, esattamente come `audit_log.details`. Ma
// `message` arriva dal messaggio dell'eccezione così com'è, e un rifiuto di
// Postgres CITA il valore che l'ha causato: «Key (email)=(mario.rossi@
// example.it) already exists» è l'indirizzo di un cliente in una tabella la
// cui lettura (`private.is_admin()`) è più larga di quella dell'anagrafica.
// Si redige QUI, dove il testo si compone, e non a valle: a valle sarebbe
// una seconda regola da ricordare.
//
// Le due forme coperte sono quelle che i vincoli del database citano
// davvero (email e telefono). Non è un filtro esaustivo, ed è meglio dirlo
// che lasciarlo credere: è la rimozione delle forme NOTE, non una garanzia.
const redigiPii = (testo) =>
  String(testo ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "«email»")
    .replace(/(?<!\d)(?:\+\d{1,3}[ .-]?)?(?:\d[ .-]?){8,14}\d(?!\d)/g, "«telefono»");

// B-3 dell'audit del 4 settembre. `redigiPii` sopra copriva `message` e
// `stack`, non `url` e `userAgent`, che finivano grezzi in `error_reports`.
// Con i `rewrites` di vercel.json che fanno atterrare tutto su `/`, l'URL
// oggi non porta PII — ma è un'assunzione sul ROUTING, non un fatto
// strutturale come per `message`/`stack`, e non è scritta da nessuna parte:
// passa comunque da `redigiPii`, che su un URL senza email/telefono è un
// no-op. `userAgent` per intero è più fingerprint di quanto la diagnosi
// richieda — versione esatta di sistema operativo e build del browser — e la
// sola FAMIGLIA (Chrome/Firefox/Safari/Edge/…) basta a distinguere un bug
// specifico di un motore da uno generico. L'ordine dei confronti conta: le
// UA di Edge e Opera contengono anche "Chrome/", e quelle di Chrome anche
// "Safari/".
const famigliaBrowser = (userAgent) => {
  const ua = String(userAgent ?? "");
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "altro";
};

// Esportata: `segnala()` qui sotto la usa per i due handler globali, e
// creaErrorBoundary.jsx per i crash di render — che non passano da qui, sono
// l'ALTRO percorso d'errore descritto in cima a questo file. Stesso codice
// mostrato a schermo dai due lati (criticità #9): duplicarlo qui sarebbe
// stato il difetto opposto a quello che questo fix chiude.
//
// ⚠️ La redazione va solo qui, sulla scrittura in tabella: `console.error` in
// `segnala()` continua a stampare il messaggio intero, perché quel canale
// vive nel browser di chi ha avuto l'errore e non attraversa alcun confine
// di autorizzazione.
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

  // Il codice nasce QUI, non dentro `messaggioUtente`: deve essere lo STESSO
  // sia nella riga di console sia nel toast, ed è anche ciò che rende
  // dettabile un errore di programmazione (B-2) — senza, l'utente non avrebbe
  // nulla da segnalare oltre a "non riuscito".
  const codice = codiceSegnalazione();

  // La console resta il canale della diagnosi e non passa dal dedup: chi apre
  // gli strumenti sviluppatore vuole vedere TUTTE le occorrenze, incluse le
  // ripetizioni che all'utente non diciamo (spesso è la ripetizione stessa,
  // non il singolo errore, a rivelare il problema).
  console.error(`[VoyageDesk] errore non gestito (${origine}) (${codice}):`, motivo);
  // A-4: la segnalazione, a differenza del toast qui sotto, NON passa dal
  // dedup — un `error_reports` con meno righe di quante ne servano a capire
  // "succede in continuazione" sarebbe un difetto peggiore di qualche riga
  // ripetuta in più.
  registraSegnalazione(codice, origine, motivo);

  if (!sink) return;
  // La chiave di dedup non può essere il MESSAGGIO finale: da B-2 quello
  // porta il codice di segnalazione, che è nuovo a ogni occorrenza per
  // costruzione — usarlo come chiave farebbe sembrare "nuova" ogni
  // ripetizione dello stesso errore di programmazione. Si dedup sulla
  // superficie dell'errore, che è stabile.
  const chiaveDedup = `${origine}:${superficie(motivo)}`;
  if (giaSegnalato(chiaveDedup)) return;
  sink(messaggioUtente(motivo, codice));
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
    // Vedi isErroreDiRisorsa: un'immagine che non carica non è un'eccezione,
    // e non c'è niente che l'utente possa farci.
    if (isErroreDiRisorsa(ev)) return;
    // `error` è l'eccezione vera; `message` è il fallback per i browser che
    // non la espongono (script cross-origin: "Script error.").
    segnala(ev?.error ?? ev?.message, "runtime");
  };

  window.addEventListener("unhandledrejection", onRejection);
  // Capture: i fallimenti di risorsa non fanno bubbling fino a window, quindi
  // in fase di bubble non li vedremmo — e non potremmo filtrarli. Meglio
  // riceverli e scartarli consapevolmente che non sapere che esistono.
  window.addEventListener("error", onError, true);

  return () => {
    window.removeEventListener("unhandledrejection", onRejection);
    window.removeEventListener("error", onError, true);
  };
}
