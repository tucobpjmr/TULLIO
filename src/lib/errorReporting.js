// src/lib/errorReporting.js
// ─── RETE DI SICUREZZA PER GLI ERRORI NON GESTITI ──────────────────────────
//
// PERCHÉ ESISTE. L'app aveva tre percorsi d'errore, tutti buoni, e tutti
// parziali:
//
//   render          → ErrorBoundary / ViewErrorBoundary (components/)
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
const isChunkMancante = (e) =>
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

const messaggioUtente = (motivo) => (
  isChunkMancante(motivo)
    ? "L'app è stata aggiornata: ricarica la pagina per continuare."
    : `Operazione non riuscita: ${testoLeggibile(motivo)}`
);

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

// ─── INSTALLAZIONE ─────────────────────────────────────────────────────────

function segnala(motivo, origine) {
  if (isAbort(motivo) || isRumoreBrowser(motivo)) return;

  // La console resta il canale della diagnosi e non passa dal dedup: chi apre
  // gli strumenti sviluppatore vuole vedere TUTTE le occorrenze, incluse le
  // ripetizioni che all'utente non diciamo (spesso è la ripetizione stessa,
  // non il singolo errore, a rivelare il problema).
  console.error(`[VoyageDesk] errore non gestito (${origine}):`, motivo);

  if (!sink) return;
  const messaggio = messaggioUtente(motivo);
  if (giaSegnalato(messaggio)) return;
  sink(messaggio);
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
