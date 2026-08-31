# Audit — UX/UI e gestione degli errori · 31 agosto 2026

Perimetro: **come l'app si comporta quando qualcosa non va, e cosa l'utente
vede mentre succede.** Error boundary, notifiche d'errore, fallback UI,
validazione dei form, feedback durante il salvataggio, stati asincroni
(caricamento/errore/vuoto) e accessibilità dei modali.

Dodici rilievi: **nessuno critico, cinque di alta priorità.**

✅ **A-1 e A-3 chiusi il 31 agosto** — insieme, come proponeva il suggerimento
strategico n. 1: sono la stessa domanda posta in due momenti diversi. Vedi
«Come sono stati chiusi» in fondo al documento.

Base di partenza misurata su questo commit: `npm ci` pulito, `npm test` verde
(1895 passati, 23 saltati su 155 file), `npm run lint` senza segnalazioni,
`npm run verifica:convenzioni` verde (53 controlli, nessuna divergenza),
tredici audit precedenti chiusi o quasi.

⟦stato: 2/12 chiusi⟧

> **Sulla numerazione.** `A-` = alta priorità, `M-` = media, `B-` = bassa,
> come negli audit dal 12 agosto in poi. Nessun `C-`: vedi l'executive summary.

---

## Executive summary

**Questa non è un'app con la gestione degli errori mancante. È un'app con la
gestione degli errori progettata bene e applicata a metà.** È una diagnosi
diversa, e cambia completamente cosa conviene fare.

Il livello di partenza è alto e va detto con precisione, perché è la ragione per
cui i rilievi qui sotto sono quelli che sono e non altri:

- **Tre error boundary** su tre superfici diverse (app, vista, overlay), con il
  lifecycle scritto **una volta sola** in `creaErrorBoundary.jsx` e la sola
  parte di dominio — pannello, messaggio, via d'uscita — triplicata di
  proposito. In produzione a schermo va un **codice di segnalazione**, il
  dettaglio in console: la separazione fra ciò che serve all'utente e ciò che
  serve a chi ripara è già fatta, ed è rara.
- **Un perimetro globale** (`errorReporting.js`) su `unhandledrejection` e
  `error`, con anti-raffica, riconoscimento del rumore di browser, degli abort
  volontari e dei fallimenti di risorsa. Il commento dichiara anche cosa **non**
  fa e perché.
- **Validazione per campo** (`validators.js` + `FieldError.jsx`) con
  `aria-invalid`/`aria-describedby` accoppiati per costruzione e focus sul primo
  campo sbagliato in **ordine visivo**. Quattordici form la usano.
- **Un contratto di salvataggio** (`useSalvataggio`/`useSalvataggioLista`, 26
  call site) con freno al doppio invio su `ref`, `finally` e guard di
  smontaggio, presidiato da due controlli di `verifica:convenzioni`.
- **Il rifiuto silenzioso della RLS** riconosciuto (`esitoScrittura.js`): una
  UPDATE che la policy filtra risponde 2xx, e qui è l'unico posto in tre app su
  quattro dove qualcuno se n'è accorto.
- `window.confirm`/`alert` **eliminati** (17 + 4 occorrenze) in favore di
  `ConfirmContext`; `OfflineBanner` persistente e non chiudibile; scheletri per
  entità invece del vuoto dichiarato troppo presto.

Su questa base, i dodici rilievi si dispongono lungo **un'unica linea di
frattura**, ed è quella che vale la pena leggere:

> **La regola giusta esiste, è scritta, ed è applicata al sottosistema in cui è
> nata — non a quello accanto.**

- `closeOnOverlay={false}` protegge i cinque form costruiti su `ui/Modal`. Gli
  **undici** modali del modulo Liste — quello dove il dato è denaro — usano
  `LvOverlay`, che quell'opzione non ce l'ha: un click a lato butta via un
  inserimento in blocco di movimenti senza chiedere niente (**M-2**).
- La criticità #10 (messaggio accanto al campo, non toast) è migrata su
  `AddMovBox`. `EditMovimentoModal` — **stessi campi, stesso denaro, percorso di
  modifica** — è ancora sulla frase che `validators.js` cita testualmente come
  l'anti-pattern da cui è nato (**M-1**).
- `isChunkMancante` sa già distinguere «l'app è stata aggiornata, ricarica» da
  un errore vero, e lo usa il **solo** handler globale. I tre boundary no: dopo
  un deploy, chi apre Liste legge «Questa sezione ha avuto un problema» e
  l'unico bottone è **← Torna alla Dashboard**, che non ripara nulla e da cui si
  rientra nello stesso errore, in ciclo (**A-4**).
- `OfflineBanner` esiste perché «ogni numero a schermo è un dato fermo» merita
  un messaggio **persistente**. Ma legge `navigator.onLine`, e i nove canali
  realtime chiamano `.subscribe()` **senza callback di stato**: quando il
  websocket muore con l'HTTP ancora vivo — sospensione del portatile, proxy
  aziendale, timeout di quota — accade esattamente la condizione che il banner
  esiste per annunciare, e non lo annuncia nessuno (**A-1**).

E il rilievo che tiene insieme gli altri: **il controllo automatico che
dovrebbe accorgersi di queste derive definisce il proprio perimetro con il
marcatore della conformità**. `formSenzaAttesaEsito` riconosce un form
dall'import di `validaCampi`; un form che non lo importa non è "non conforme",
è **fuori perimetro**. È la stessa classe di difetto che `convenzioni.js`
descrive per A-1 del 26 agosto («un controllo verde su un perimetro più piccolo
del codice è peggio di un controllo assente») applicata al controllo che quel
rilievo aveva prodotto: la CI stampa «form che scrivono senza attendere
l'esito: 0» su **7 form**, mentre l'app ne ha circa venticinque (**M-1**, parte
seconda).

**Nessun rilievo critico.** Nessuno dei dodici perde dati già scritti sul
server, nessuno aggira un permesso, nessuno lascia l'app in uno stato da cui non
si esce ricaricando. I cinque di alta priorità hanno tutti la stessa forma —
*l'app sa una cosa e non la dice all'utente* — che in un gestionale dove si
registrano movimenti di denaro è la categoria che costa di più, ed è la stessa
che `errorReporting.js` nomina nel proprio preambolo: **«credo di aver salvato»
è il difetto più costoso possibile**.

---

## Tabella delle priorità

| # | Priorità | Rilievo | File |
|---|---|---|---|
| **A-1** ✔ | **Alta** | I canali realtime chiamano `.subscribe()` senza callback di stato: `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED` non li legge nessuno. Con l'HTTP ancora vivo `OfflineBanner` tace, e l'utente lavora su dati fermi senza saperlo. | `src/lib/realtime.js:114,225` |
| A-2 | **Alta** | Il cap a 3 dei toast espelle in FIFO senza guardare il tipo: un errore che per policy non scade da solo viene tolto da un successo arrivato dopo. L'idratazione può emetterne 6 nella stessa finestra. | `src/state/toastQueue.js:42` |
| **A-3** ✔ | **Alta** | Un caricamento **fallito** chiude il flag e si disegna come **vuoto**: «Nessuna task aperta a tuo nome. Buon lavoro!» su un fetch andato storto. Nessuno stato d'errore per entità, nessun «Riprova». | `src/hooks/useAppHydration.js:202-211` |
| A-4 | **Alta** | Chunk lazy mancante dopo un deploy: i boundary non lo distinguono da un bug e offrono una via d'uscita che non lo risolve, richiudendo il ciclo. Il riconoscitore esiste già, ma è privato dell'handler globale. | `src/components/errors/creaErrorBoundary.jsx:74-77`, `src/lib/errorReporting.js` |
| A-5 | **Alta** | `sendMessage` della chat non ha `.catch()`: su **rigetto** di rete la compensazione non gira, il messaggio fantasma resta a schermo indistinguibile da uno consegnato. E sul ramo gestito il testo digitato viene scartato senza possibilità di recupero. | `src/components/chat/chatCommands.js:225-254` |
| M-1 | Media | Tre modali del modulo Liste ancora sulla validazione a toast (la frase che `validators.js` cita come anti-pattern). E il controllo che dovrebbe vederli ha il perimetro definito dal marcatore della conformità: 7 form su ~25. | `EditMovimentoModal.jsx:22`, `NuovaListaModal.jsx:21`, `AggiungiBeneficiarioModal.jsx:22`, `BulkMovimentiModal.jsx:28,49`, `scripts/verifica-convenzioni/convenzioni.js:370` |
| M-2 | Media | `LvOverlay` chiude sul click al velo **senza condizioni**. `closeOnOverlay={false}` esiste ed è applicato ai 5 form di `ui/Modal`, non agli 11 modali del modulo denaro. | `src/components/liste/modals/LvOverlay.jsx:59` |
| M-3 | Media | `role="dialog" aria-modal="true"` dichiarato in entrambi i gusci, ma **nessuna trappola del focus e nessuna restituzione**: il Tab esce nella pagina sotto e alla chiusura il focus torna su `<body>`. | `src/components/ui/Modal.jsx`, `src/components/liste/modals/LvOverlay.jsx` |
| M-4 | Media | Tre `<form>` in tutta l'app. I ~20 form restanti sono `div` + bottone: **Invio non invia**, incluso `AddMovBox`, il form a frequenza più alta del gestionale. | `src/components/liste/AddMovBox.jsx:99-150` e altri |
| B-1 | Bassa | `ToastStack` è `aria-live="assertive"`: anche «Task aggiornato!» interrompe lo screen reader a metà frase. La distinzione `alert`/`status` è già sui figli e viene annullata dal contenitore. | `src/components/ui/Toast.jsx:20-24` |
| B-2 | Bassa | Due politiche per lo stesso dato: i boundary in produzione **nascondono** il dettaglio tecnico, l'handler globale lo **interpola** nel toast (`Operazione non riuscita: Failed to fetch`). | `src/lib/errorReporting.js` (`messaggioUtente`) |
| B-3 | Bassa | `LvOverlay` non partecipa alla pila dei modali di `ui/Modal`: un Esc con una `ConfirmDialog` aperta sopra ne chiuderebbe due. Latente oggi (nessuna conferma nasce da dentro un `LvOverlay`), non presidiato. | `src/components/liste/modals/LvOverlay.jsx:42-43` |

---

## Action plan dettagliato

### A-1 · Il canale realtime può morire in silenzio, e nessuno lo racconta

**File.** `src/lib/realtime.js:114` (`subscribeToTable`) e `:225`
(`subscribeToTyping`); `src/components/shell/OfflineBanner.jsx`;
`src/hooks/useDebouncedTableSubscription.js:212`.

**Perché è critico.** `OfflineBanner` è nato dalla criticità #7 con una tesi
esplicita e giusta: *«la condizione dura finché dura, e per tutto quel tempo
ogni numero a schermo è un dato fermo. La persistenza è il messaggio.»* Ma
l'unica sorgente di quella condizione è `navigator.onLine`, che risponde a una
domanda diversa: «l'interfaccia di rete è su?».

Il websocket di Supabase Realtime può morire mentre `navigator.onLine` resta
`true`, e sono i casi **normali** di un'agenzia, non quelli di laboratorio: un
portatile che esce dalla sospensione, un proxy aziendale che chiude le
connessioni idle, il passaggio Wi-Fi→LTE su un telefono, il raggiungimento del
tetto di connessioni concorrenti del progetto Supabase. In tutti, `.subscribe()`
consegna `CHANNEL_ERROR` o `TIMED_OUT` al callback di stato — che qui **non
esiste**:

```js
// src/lib/realtime.js:101-115 — oggi
const channel = supabase
  .channel(`realtime:${tableName}:${getClientId()}:${++channelSeq}`)
  .on('postgres_changes', { … }, (payload) => { … })
  .subscribe();                    // ← nessun argomento: lo stato si perde qui
```

Ricerca su tutto `src/`: **zero** occorrenze di `CHANNEL_ERROR`, `TIMED_OUT`,
`CLOSED`. Il risultato è la condizione che il banner esiste per annunciare —
dati fermi — raggiunta per l'altra strada e **non annunciata**. Peggio del caso
offline, perché lì almeno le scritture falliscono e producono un toast: qui le
scritture HTTP continuano a funzionare, quindi l'app *sembra* perfettamente
viva. Due agenti guardano la stessa lista e vedono saldi diversi.

`useDebouncedTableSubscription` ha già la rete di recupero giusta (reload su
`online` e sul ritorno in primo piano oltre soglia): manca il **terzo innesco**,
cioè il canale che si è rotto senza che nessuno dei due eventi sia scattato.

**Soluzione.**

1. `subscribeToTable` accetta e propaga lo stato del canale:

```js
// src/lib/realtime.js
/**
 * @param {(stato: 'SUBSCRIBED'|'CHANNEL_ERROR'|'TIMED_OUT'|'CLOSED') => void} [onStato]
 *   Riceve OGNI transizione del canale. Non è opzionale per comodità: è
 *   opzionale perché `subscribeToTyping` (broadcast effimero) può degradare in
 *   silenzio, mentre una tabella no.
 */
export function subscribeToTable(tableName, handler, onStato) {
  let smontato = false;
  let staccaCanale = () => {};
  getSupabase().then((supabase) => {
    if (smontato) return;
    if (typeof supabase?.channel !== "function") return;
    const channel = supabase
      .channel(`realtime:${tableName}:${getClientId()}:${++channelSeq}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
        if (payload?.eventType !== 'DELETE') {
          const origin = payload?.new?.origin_client;
          if (origin && origin === getClientId()) return;
        }
        handler(payload);
      })
      // Il callback di stato è l'unico punto in cui il client viene a sapere
      // che il canale è caduto: senza, l'unico segnale di un websocket morto è
      // l'ASSENZA di eventi, che è indistinguibile da «nessuno sta scrivendo».
      .subscribe((stato, err) => {
        if (err) console.error(`[VoyageDesk] canale ${tableName} (${stato})`, err);
        if (smontato) return;
        onStato?.(stato);
      });
    staccaCanale = () => supabase.removeChannel(channel);
  });
  return () => { smontato = true; staccaCanale(); };
}
```

2. Un registro di modulo che aggrega i nove canali in **un fatto solo** — «la
   freschezza realtime è degradata» — perché è l'unica cosa che l'interfaccia
   deve sapere (quale tabella sia caduta è diagnosi, e va in console):

```js
// src/lib/freschezzaRealtime.js  (nuovo)
// Un canale rotto non è un errore da mostrare: è una CONDIZIONE che dura,
// esattamente come l'offline — e per la stessa ragione va detta con un banner
// persistente e non con un toast che scade.
//
// Aggregato e non per-tabella di proposito: all'utente «gli aggiornamenti
// automatici sono fermi» è azionabile (ricarica), «il canale notices è in
// CHANNEL_ERROR» no.
const stati = new Map();          // nome canale → ultimo stato
const iscritti = new Set();

const degradato = () => [...stati.values()].some(
  (s) => s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED",
);

export function segnalaStatoCanale(nome, stato) {
  const prima = degradato();
  stati.set(nome, stato);
  const dopo = degradato();
  // Notifica solo sulla TRANSIZIONE: nove canali che riagganciano insieme
  // dopo una sospensione producono nove stati e un solo cambiamento.
  if (prima !== dopo) iscritti.forEach((fn) => fn(dopo));
}

export function dimenticaCanale(nome) { segnalaStatoCanale(nome, "SUBSCRIBED"); stati.delete(nome); }
export const freschezzaDegradata = () => degradato();
export function osservaFreschezza(fn) { iscritti.add(fn); return () => iscritti.delete(fn); }
export function _resetFreschezza() { stati.clear(); iscritti.clear(); }
```

3. `useDebouncedTableSubscription` collega le due metà — segnala **e** recupera:

```js
// src/hooks/useDebouncedTableSubscription.js — dentro l'effetto
const unsubs = list.map((tbl) => subscribeToTable(
  tbl,
  (p) => debounced(tbl, p),
  (stato) => {
    segnalaStatoCanale(`${tbl}:${idEffetto}`, stato);
    // Un riaggancio riuscito è esattamente il caso di `online`: nella finestra
    // in cui il canale era giù possono essere passati eventi che non vedremo
    // mai, quindi si ricarica invece di ripartire da dati che non sappiamo
    // quanto siano vecchi.
    if (stato === "SUBSCRIBED" && eraDegradato.current) onReconnectSignal();
    eraDegradato.current = stato !== "SUBSCRIBED";
  },
));
// nel cleanup:
list.forEach((tbl) => dimenticaCanale(`${tbl}:${idEffetto}`));
```

4. `OfflineBanner` diventa il banner delle **condizioni che invalidano ciò che
   si guarda**, con due varianti e una priorità dichiarata:

```jsx
// src/components/shell/OfflineBanner.jsx
export function OfflineBanner() {
  const online = useOnlineStatus();
  const degradata = useFreschezzaRealtime();      // wrapper useSyncExternalStore

  // L'offline vince: quando la rete è giù i canali sono giù per conseguenza, e
  // due strisce sovrapposte direbbero due volte la stessa cosa con due rimedi
  // diversi — di cui uno (ricarica) inapplicabile.
  if (!online) return ( /* … striscia --danger invariata … */ );
  if (!degradata) return null;

  // Colore --warning e non --danger: qui i dati SCRITTI arrivano ancora (le
  // mutazioni passano da HTTP), è la LETTURA automatica a essere ferma. È una
  // condizione meno grave dell'offline e va detta con un tono diverso, o le
  // due smettono di distinguersi.
  return (
    <div role="status" aria-live="polite" style={strisciaAvviso}>
      <span aria-hidden="true">🔄</span>
      <span>
        <strong>Aggiornamenti automatici interrotti.</strong>{" "}
        Le modifiche fatte da altri non compaiono più da sole: ricarica per
        rivedere i dati aggiornati.
      </span>
      <button onClick={() => window.location.reload()} style={bottoneStriscia}>
        Ricarica
      </button>
    </div>
  );
}
```

**Test da aggiungere.** `src/test/realtime/statoCanale.test.js`: il callback
propaga; `CHANNEL_ERROR` su un canale qualsiasi alza `freschezzaDegradata()`; il
ritorno a `SUBSCRIBED` la abbassa **e** innesca un reload; nove canali che
cadono insieme notificano gli iscritti una volta sola.

---

### A-2 · Il cap dei toast espelle errori che per policy non devono sparire

**File.** `src/state/toastQueue.js:35-43`; `src/components/ui/ToastItem.jsx:30`;
`src/components/ui/Toast.jsx`.

**Perché è critico.** Nel progetto ci sono due decisioni **entrambe motivate per
iscritto**, e sono in contraddizione:

```js
// ToastItem.jsx:28-31 — un errore non scade da solo, e il perché è dichiarato:
// «un messaggio PostgREST lungo va letto (e magari copiato per segnalarlo),
//  non sparire dopo 3 secondi come oggi — il difetto peggiore del vecchio Toast»
if (toast.type === "error") return;
```

```js
// toastQueue.js:41-42 — e qui sparisce lo stesso, senza guardare il tipo:
// Cap a 3: oltre, la pila di toast copre la bottom-nav su mobile.
return next.slice(-3);
```

`slice(-3)` tiene gli **ultimi tre inseriti**. Un errore che l'utente non ha
ancora letto viene quindi espulso da un successo arrivato dopo — cioè dal caso
più comune, perché i successi sono la maggioranza assoluta del traffico della
coda. Lo scenario non è ipotetico ed è descritto **dentro lo stesso file**
(righe 21-23): *«useAppHydration, che può emettere fino a 5 errori nella stessa
finestra»*. Sono sei `onError` distinti nell'idratazione: al primo avvio con la
rete instabile ne restano a schermo tre, e quali tre lo decide l'ordine di
arrivo delle risposte.

La diagnosi precisa: **il cap è motivato da un vincolo di rendering** («copre la
bottom-nav»), ma è applicato **alla coda**. Sono due cose diverse, e confonderle
fa perdere il dato.

**Soluzione — separare il tetto visivo dalla ritenzione.** La coda tiene tutti
gli errori; la pila ne disegna al massimo tre e dichiara quanti ne restano.

```js
// src/state/toastQueue.js
// Quanti se ne DISEGNANO: è un vincolo di layout (oltre, la pila copre la
// bottom-nav su mobile), e per questo vive accanto a chi disegna.
export const MAX_A_SCHERMO = 3;

export function pushToast(toasts, { message, type, undoable }) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const senzaDuplicati = (toasts || []).filter(t => t.message !== message);
  const next = [...senzaDuplicati, { id, message, type, undoable: !!undoable }];

  // ─── Il cap NON è più `slice(-3)` ───────────────────────────────────────
  // Quel taglio applicava un vincolo di RENDERING (quanti ne stanno sopra la
  // bottom-nav) alla RITENZIONE (quanti se ne ricordano), e le due cose sono
  // diverse: un errore non scade da solo per decisione esplicita di
  // ToastItem, e veniva comunque buttato via da un successo arrivato dopo.
  //
  // Qui si sfoltisce SOLO ciò che sarebbe scaduto da sé — successi e warning,
  // dal più vecchio — e gli errori restano finché l'utente non li chiude. Il
  // tetto a schermo lo applica ToastStack, che è il livello che conosce lo
  // spazio.
  const scadenti = next.filter(t => t.type !== "error");
  const daTogliere = Math.max(0, scadenti.length - MAX_A_SCHERMO);
  if (daTogliere === 0) return next;
  const espulsi = new Set(scadenti.slice(0, daTogliere).map(t => t.id));
  return next.filter(t => !espulsi.has(t.id));
}
```

```jsx
// src/components/ui/Toast.jsx
export const ToastStack = ({ toasts = [] }) => {
  const { isDesktop } = useViewport();
  // Il tetto visivo vive QUI, dove si conosce lo spazio disponibile. Gli
  // errori più recenti stanno in cima alla pila (column-reverse), quindi
  // tenere la CODA dell'array significa tenere i più nuovi.
  const visibili = toasts.slice(-MAX_A_SCHERMO);
  const nascosti = toasts.length - visibili.length;
  return (
    <div aria-live="polite" aria-atomic="false" style={…}>
      {/* Un errore non letto che non entra a schermo deve almeno CONTARSI:
          sparire in silenzio è la cosa che questo rilievo esiste per togliere. */}
      {nascosti > 0 && (
        <div role="status" style={rigaContatore}>
          +{nascosti} {nascosti === 1 ? "altro messaggio" : "altri messaggi"} in coda
        </div>
      )}
      {visibili.map((t) => <ToastItem key={t.id} toast={t} />)}
    </div>
  );
};
```

**Test da aggiungere.** In `src/test/state/toastQueue.test.js`: sei errori
consecutivi restano sei in coda; un successo dopo tre errori non ne espelle
nessuno; quattro successi consecutivi ne lasciano tre; `CLEAR_TOAST` su uno
visibile fa salire uno di quelli in coda.

---

### A-3 · Un caricamento fallito si disegna come un archivio vuoto

**File.** `src/hooks/useAppHydration.js:202-211` (e i cinque siti analoghi:
`:394`, `:438`, `:520`, `:557`, `:672`); i consumatori dei flag
(`Archive.jsx:48`, `Dashboard`, `NoticeBoard`, `Trash`, `ClientiView`).

**Perché è critico.** La criticità #6 è stata risolta a metà, e la metà mancante
è esattamente quella che il suo stesso preambolo enuncia:

> *«è l'app che afferma con sicurezza qualcosa di falso su dati operativi, in
> una finestra in cui l'unica risposta vera è "non lo so ancora"»*

Il flag `caricamento[entita]` chiude **sia sul successo sia sull'errore**, per
scelta dichiarata (uno scheletro perpetuo è disonesto quanto un vuoto). La
scelta è giusta e la conseguenza non è stata chiusa: dopo un errore la vista
non ha uno stato d'errore da mostrare, quindi mostra **lo stato vuoto**. Con lo
stesso testo di quando i dati ci sono davvero e sono zero:

- Dashboard → «Nessuna task aperta a tuo nome. Buon lavoro!»
- Archivio → «Archivio vuoto»
- Bacheca → «Nessun avviso»

Il canale previsto è il toast — ed è il canale giusto — ma è un canale
**effimero**, contro una condizione **duratura**: l'utente lo chiude (o A-2
glielo toglie), e da quel momento a schermo non resta nulla che dica che quei
numeri non sono i numeri. In un gestionale «Buon lavoro!» su un fetch fallito è
la stessa classe di bugia di «credo di aver salvato»: qualcuno smette di
lavorare su una coda che crede vuota.

E non c'è **nessuna via di recupero**: nessun «Riprova». L'unica è ricaricare la
pagina, cosa che l'interfaccia non suggerisce da nessuna parte.

**Soluzione — il terzo stato, e la sua via d'uscita.** Il flag booleano diventa
un piccolo stato a tre valori per entità, e la richiesta fallita resta
richiamabile.

```js
// src/hooks/useAppHydration.js
// `caricamento` diceva «sto caricando: sì/no», e su un fetch fallito rispondeva
// «no» — indistinguibile da «ho finito e non c'era niente». Le viste avevano
// quindi due stati per rappresentarne tre, e il terzo si travestiva da vuoto.
const [statoEntita, impostaStato] = useState(iniziale);   // 'attesa'|'pronta'|{ errore, riprova }

const segnaErrore = useCallback((entita, testo, riprova) => {
  impostaStato(prec => ({ ...prec, [entita]: { errore: testo, riprova } }));
}, []);

const idratazione = ({ entita, tag, etichetta, list, … }) => {
  const esegui = async (isCurrent) => {
    if (quandoSaltare?.()) return;
    const { data, error } = await list();
    if (!isCurrent()) return;
    if (error) {
      console.error(tag, error);
      const testo = `Caricamento ${etichetta} fallito: ${error.message || ""}`;
      onError(testo);                       // il toast resta: è l'annuncio
      // …e accanto rimane lo STATO, che il toast non è: dura quanto la
      // condizione e porta con sé cosa rifare. `riprova` chiude sull'`isCurrent`
      // di un nuovo turno, non su quello scaduto di questo.
      segnaErrore(entita, testo, () => avvia(esegui));
      segnaCaricata(entita);
      alTermine?.();
      return;
    }
    …
  };
  return esegui;
};
```

Un componente unico per il terzo stato, così le nove viste non lo riscrivono
(stessa ragione per cui `ErrorDetails` è uno solo per tre boundary):

```jsx
// src/components/ui/StatoEntita.jsx  (nuovo)
// Il riquadro che le viste mostrano AL POSTO dello stato vuoto quando il
// caricamento è fallito. Il vuoto è un'affermazione sui dati; questo è
// un'ammissione sul caricamento, e vanno dette con due frasi diverse.
export function StatoEntita({ stato, etichetta, children }) {
  if (stato === "attesa" || stato === "pronta") return children;
  return (
    <div role="status" style={riquadro}>
      <div style={icona} aria-hidden="true">⚠️</div>
      <p style={testo}>
        Non è stato possibile caricare {etichetta}. Quello che vedi qui sotto
        <strong> non è l&#39;elenco completo</strong>.
      </p>
      <button onClick={stato.riprova} style={bottone}>Riprova</button>
    </div>
  );
}
```

```jsx
// es. src/components/tasks/Archive.jsx
<StatoEntita stato={statoEntita.tasks} etichetta="l'archivio">
  {tasks.length === 0 ? <VuotoArchivio /> : <ElencoTask task={pagina} />}
</StatoEntita>
```

**Test da aggiungere.** In `src/test/hooks/`: un `list()` che risolve con
`error` lascia `statoEntita.tasks` in errore e **non** in `'pronta'`; la vista
mostra «non è l'elenco completo» e non «Archivio vuoto»; `riprova` rifà la
richiesta e sul successo riporta a `'pronta'`; una `riprova` chiamata dopo lo
smontaggio non scrive.

---

### A-4 · Dopo un deploy l'app propone la via d'uscita che non funziona

**File.** `src/components/errors/creaErrorBoundary.jsx:74-77` e `:87-91`;
`src/components/errors/ViewErrorBoundary.jsx`,
`OverlayErrorBoundary.jsx`; `src/lib/errorReporting.js` (`isChunkMancante`);
`src/VoyageDeskInner.jsx:66-106` (nove viste `lazy`) e `:397-406`.

**Perché è critico.** `errorReporting.js` contiene il riconoscitore giusto, con
la motivazione giusta scritta accanto:

> *«Un chunk lazy che risponde 404 è il caso più frequente in produzione:
> succede a OGNI deploy con una scheda aperta […] qui l'unica azione utile è
> ricaricare, e un "errore imprevisto" non lo direbbe.»*

Ma `isChunkMancante` **non è esportato** e lo usa solo `messaggioUtente`, cioè il
percorso degli errori *non gestiti*. Un chunk che fallisce dentro `Suspense` non
è un errore non gestito: è un errore di render, che `ViewErrorBoundary`
**cattura correttamente** — e a cui applica il pannello generico:

> «Questa sezione ha avuto un problema. Il resto di Tullio continua a
> funzionare: puoi tornare alla Dashboard e riprendere da lì.»
> `[← Torna alla Dashboard]`

Entrambe le frasi sono **false in questo caso**, e il bottone chiude un ciclo:
si torna alla Dashboard, si riclicca Liste, il chunk manca ancora, stesso
pannello. All'infinito, finché l'utente non ricarica per conto suo — cosa che
l'interfaccia non gli ha mai suggerito. Con nove viste lazy e due overlay lazy,
la superficie è tutta l'app, e l'innesco è **ogni deploy**: la condizione più
frequente in assoluto, servita dal messaggio meno utile.

**Soluzione.** Rendere pubblico il riconoscitore e farne una **decisione del
lifecycle condiviso**, non di ciascun boundary — così i tre restano tre per
dominio e la nuova regola è una sola.

```js
// src/lib/errorReporting.js — da const locale a export.
// Serve a DUE consumatori con lo stesso bisogno: l'handler globale, che deve
// dire la frase giusta, e i boundary, che devono offrire il bottone giusto.
// Tenerlo privato ha significato finora che il secondo non lo sapeva.
export const isChunkMancante = (e) =>
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError|Loading chunk \S+ failed/i
    .test(superficie(e));
```

```jsx
// src/components/errors/creaErrorBoundary.jsx
import { codiceSegnalazione, isChunkMancante } from '../../lib/errorReporting.js';
import { PannelloAppAggiornata } from './PannelloAppAggiornata.jsx';

static getDerivedStateFromError(error) {
  // `obsoleto` si decide QUI e non nel render, per la stessa ragione del
  // codice di segnalazione: è una proprietà dell'errore catturato, e non deve
  // poter cambiare mentre il pannello è a schermo.
  return { error, codice: codiceSegnalazione(), obsoleto: isChunkMancante(error) };
}

render() {
  const { error, info, codice, obsoleto } = this.state;
  if (!error) return this.props.children;
  // Un chunk mancante NON è un errore di questa vista o di questo modale: è
  // la scheda che sta girando su un deploy che non esiste più. La via d'uscita
  // dei tre pannelli (ricarica / torna alla Dashboard / chiudi) è specifica del
  // dominio di ciascuno ed è giusta — ma nessuna delle tre ripara QUESTO, e due
  // su tre richiudono il ciclo. Qui il rimedio è uno solo per tutti e tre.
  if (obsoleto) return <PannelloAppAggiornata codice={codice} />;
  return <Fallback error={error} info={info} codice={codice} onReset={this.props.onReset} />;
}
```

```jsx
// src/components/errors/PannelloAppAggiornata.jsx  (nuovo)
// Non è un pannello d'ERRORE: non c'è niente di rotto e niente da segnalare.
// È un annuncio, e per questo non porta né ⚠️ né il tono degli altri tre.
export function PannelloAppAggiornata() {
  return (
    <div className="fade-in" style={riquadro}>
      <div style={icona} aria-hidden="true">🚀</div>
      <h2 className="playfair" style={titolo}>Tullio è stato aggiornato</h2>
      <p style={testo}>
        Questa scheda sta ancora usando la versione precedente. Ricarica per
        continuare: non perderai nulla di ciò che hai già salvato.
      </p>
      <button onClick={() => window.location.reload()} style={bottonePrimario}>
        Ricarica
      </button>
    </div>
  );
}
```

**Test da aggiungere.** In `src/test/ui/errorBoundary.test.jsx`: un componente
che lancia `new Error("Failed to fetch dynamically imported module: /assets/x.js")`
dentro `ViewErrorBoundary` produce «Tullio è stato aggiornato» e **non** «Torna
alla Dashboard»; lo stesso vale per `OverlayErrorBoundary` e per quello di primo
livello; un errore ordinario continua a produrre il pannello di sempre con il
codice di segnalazione.

---

### A-5 · L'invio di un messaggio non ha un `.catch()`, e il testo digitato è perso comunque

**File.** `src/components/chat/chatCommands.js:200-255`.

**Perché è critico — due difetti nello stesso percorso.**

**(a) Il ramo di rigetto non compensa.** La compensazione è scritta bene e
motivata bene:

```js
// chatCommands.js:212-223 — «lasciarlo a schermo lo rende indistinguibile da
// uno consegnato […] Toglierlo qui è l'unica versione onesta di "non è partito"»
const scartaOttimistico = () => { … };

const invia = () => MessagesAPI.send(toDbMessage(normalized, convId))
  .then(r => {
    const errore = esitoScrittura(r);
    if (errore) { scartaOttimistico(); fallito(…); }
  })
  .finally(() => smarcaInVolo(normalized.id));   // ← nessun .catch() prima
```

`esitoScrittura` copre il caso «la promise **risolve** con un errore dentro»
(errore PostgREST, rifiuto silenzioso della RLS). Non copre il caso in cui la
promise **rigetta**: `fetch` che fallisce, DNS giù, CORS, tab che perde la rete
a metà invio. Lì `.then` non gira, `scartaOttimistico` non gira, e resta
esattamente il **messaggio fantasma** che il commento dichiara di aver tolto:
a schermo, indistinguibile da uno consegnato, destinato a sparire al prossimo
reload — cioè quando l'utente non lo sta più guardando. L'unico segnale è il
toast generico dell'handler globale («Operazione non riuscita: Failed to
fetch»), che non nomina la chat né il messaggio. Stesso buco su
`attesa.then(…)` alla riga 244, che non ha il ramo di rigetto.

**(b) Il testo è perso in entrambi i rami.** `scartaOttimistico` toglie il
messaggio dallo stato e **non lo restituisce a nessuno**: il composer è già
stato svuotato all'invio. Un messaggio lungo scritto a un collega svanisce, e
l'unico rimedio è riscriverlo. È in diretta contraddizione con il principio che
questo stesso repo ha codificato in un controllo di CI — `formSenzaAttesaEsito`
esiste per rispondere alla domanda *«i dati digitati sopravvivono a un
rifiuto?»* — applicato ovunque tranne che nel sottosistema con la frequenza di
scrittura più alta dell'app.

**Soluzione.**

```js
// src/components/chat/chatCommands.js
const sendMessage = (convId, msg) => {
  const normalized = !enabled || isUuid(msg.id) ? msg : { ...msg, id: newId() };
  setMessages(prev => ({ ...prev, [convId]: [...(prev[convId] || []), normalized] }));
  if (!enabled) return normalized;
  marcaInVolo(convId, normalized);

  const scartaOttimistico = () => {
    setMessages(prev => ({
      ...prev,
      [convId]: (prev[convId] || []).filter(m => m.id !== normalized.id),
    }));
  };

  // Un percorso di fallimento SOLO, per i due rami che oggi sono uno e mezzo:
  // `esitoScrittura` legge la promise RISOLTA con un errore dentro, il .catch
  // quella RIGETTATA. Erano due modi di non essere arrivati sul server, e
  // solo il primo toglieva il messaggio fantasma.
  const fallimento = (errore) => {
    scartaOttimistico();
    // Il testo torna al mittente. Toglierlo dallo schermo senza restituirlo
    // significa distruggere quello che ha scritto per un errore di rete: è la
    // stessa domanda a cui `formSenzaAttesaEsito` risponde per i form, posta
    // al sottosistema che scrive più di tutti.
    onInvioFallito?.(convId, normalized);
    fallito("msg.send", errore, `Chat: invio messaggio fallito: ${errore?.message || ""}`);
  };

  const invia = () => MessagesAPI.send(toDbMessage(normalized, convId))
    .then(r => { const errore = esitoScrittura(r); if (errore) fallimento(errore); })
    .catch(fallimento)
    .finally(() => smarcaInVolo(normalized.id));

  const attesa = creazioniInVolo.get(convId);
  if (attesa) {
    attesa.then(
      (r) => { if (r?.error) { scartaOttimistico(); smarcaInVolo(normalized.id); } else invia(); },
      // Anche la CREAZIONE della conversazione può rigettare invece di
      // risolvere: senza questo ramo il messaggio resta in volo per sempre e
      // il realtime lo scarta per il resto della sessione.
      (err) => { fallimento(err); smarcaInVolo(normalized.id); },
    );
  } else {
    invia();
  }
  return normalized;
};
```

`ConversationView` passa `onInvioFallito` e ripopola il composer con una
etichetta esplicita («non inviato — riprova»), invece di far ricomparire il
testo senza spiegazione.

**Test da aggiungere.** In `src/test/chat/`: `MessagesAPI.send` che **rigetta**
toglie il messaggio ottimistico, lo smarca e mostra il toast (oggi non fa
nessuna delle tre); il testo torna nel composer; la stessa cosa quando è la
creazione della conversazione a rigettare.

---

### M-1 · Tre form ancora sulla validazione che il progetto ha già dichiarato sbagliata — e il controllo che non li vede

**File.** `src/components/liste/modals/EditMovimentoModal.jsx:20-26`;
`NuovaListaModal.jsx:20-28`; `AggiungiBeneficiarioModal.jsx:21-28`;
`BulkMovimentiModal.jsx:28,41-49`; `scripts/verifica-convenzioni/convenzioni.js:369-389`.

**Perché è un problema.** `validators.js` apre citando **testualmente** il
codice da cui è nato:

```js
//     if (!data || !desc.trim() || importo === null) {
//       dispatch({ type: "SHOW_TOAST", … "Compila data, descrizione e importo" });
```

Quel codice è **ancora in produzione**, a `EditMovimentoModal.jsx:22-24`:

```js
const importo = parseImporto(imp, segno);
if (!data || !desc.trim() || importo === null) {
  return onSave.onError("Compila data, descrizione e importo");
}
```

Con i tre difetti che il preambolo elenca, invariati: il messaggio compare in un
angolo e scade, non dice **quale** dei tre campi manchi, e per uno screen reader
non esiste alcun legame fra il messaggio e l'input.

Il fatto che rende il rilievo netto è che **`AddMovBox` — gli stessi campi,
sullo stesso denaro — è già migrato**. Chi *registra* un movimento ha il
messaggio sotto il campo e il focus dove serve; chi *corregge* un movimento già
scritto, cioè l'operazione più delicata delle due, ha il toast. La stessa
asimmetria in `BulkMovimentiModal`, dove è peggio: «3 righe hanno descrizione o
importo mancante» su una tabella di dieci righe non dice **quali tre**.

**E la seconda metà, che è la ragione per cui è rimasto così.** La CI stampa
«form che scrivono senza attendere l'esito: 0» e «form nel perimetro del
contratto: **7**». Il perimetro nasce qui:

```js
// scripts/verifica-convenzioni/convenzioni.js:370
const HA_FORM = /import\s*\{[^}]*\bvalidaCampi\b[^}]*\}\s*from/;
```

Un form è tale **se importa `validaCampi`**. Cioè: il marcatore che definisce il
perimetro è **la conformità stessa**. Un form migrato entra nel controllo; un
form non migrato non è "non conforme", è **invisibile**. È la stessa classe di
difetto che `convenzioni.js` documenta per A-1 del 26 agosto («un controllo
verde su un perimetro più piccolo del codice è peggio di un controllo assente»)
riprodotta dal controllo che quel rilievo ha prodotto.

⚠️ **Non è A-1 del 26 agosto riaperto.** Quel rilievo ha corretto l'altra metà
del predicato — `scriveDavvero`, che riconosceva un solo verbo di scrittura e
quindi non vedeva le form del modulo Liste — ed è chiuso. `HA_FORM` non è stato
toccato, e la commit che chiude A-1 lascia il commento «finché non è chiuso, il
controllo stampa uno 0 che vale solo per il core» in `index.js:100-104`: la
metà corretta ha fatto sembrare fatta anche l'altra, che è esattamente il modo
in cui questa classe si nasconde (la stessa osservazione di A-2/A-3 del 28
agosto sulle «due metà»).

**Soluzione — le due metà insieme, o non serve a niente.**

1. Migrare i quattro modali al pattern di `AddMovBox`. Per `EditMovimentoModal`,
   le regole sono **identiche** a quelle già scritte e vanno estratte, non
   ricopiate:

```js
// src/components/liste/regoleMovimento.js  (nuovo)
// Le regole di un movimento sono le stesse che lo si stia registrando
// (AddMovBox) o correggendo (EditMovimentoModal): due copie sarebbero due
// varianti fra sei mesi — la ragione per cui creaErrorBoundary.jsx esiste.
export const REGOLE_MOVIMENTO = {
  data: obbligatorio("Indica la data del movimento."),
  desc: obbligatorio("La descrizione non può essere vuota."),
  imp: interpretabile((v, f) => parseImporto(v, f.segno), "Importo non valido: usa una cifra come 1.250,00."),
};
export const ORDINE_MOVIMENTO = ["data", "desc", "imp"];
```

```jsx
// src/components/liste/modals/EditMovimentoModal.jsx
const [errori, setErrori] = useState({});
const rif = { data: useRef(null), desc: useRef(null), imp: useRef(null) };

const submit = () => {
  const valori = { data, desc, imp, segno };
  const trovati = validaCampi(valori, REGOLE_MOVIMENTO);
  const primo = primoCampoInvalido(trovati, ORDINE_MOVIMENTO);
  if (primo) { setErrori(trovati); rif[primo].current?.focus(); return; }
  setErrori({});
  salva({ id: movimento.id, data, descrizione: desc.trim(), importo: parseImporto(imp, segno), metodo });
};

// …e ogni campo con la coppia che FieldError impone di scrivere insieme:
<input id="ed-desc" ref={rif.desc} value={desc}
       onChange={(e) => aggiorna("desc", setDesc)(e.target.value)}
       {...ariaCampo("ed-desc-err", errori.desc)} />
<FieldError id="ed-desc-err">{errori.desc}</FieldError>
```

Per `BulkMovimentiModal` la validazione è **per riga** e l'errore va sulla riga,
non nell'intestazione: `errori` diventa `Map<idRiga, {desc?, imp?}>` e ogni
cella porta il proprio `FieldError`.

2. Cambiare il **marcatore** del controllo, che è la correzione strutturale:

```js
// scripts/verifica-convenzioni/convenzioni.js
// ─── Il perimetro non può essere il marcatore della conformità ─────────────
// `HA_FORM` riconosceva un form dall'import di `validaCampi`, cioè dalla cosa
// che il controllo verifica: un form NON migrato non risultava non conforme,
// risultava fuori perimetro. Il controllo stampava 0 su 7 form mentre l'app ne
// aveva ~25, ed è la stessa deriva che A-1 del 26 agosto ha corretto un livello
// più sotto (i due VERBI di scrittura) senza toccare questo livello.
//
// Un form ora è ciò che SI COMPORTA da form: raccoglie input controllati e
// scrive. Entrambe le condizioni si leggono dal codice e nessuna delle due
// sparisce migrando.
const RACCOGLIE_INPUT = /<(input|textarea|select)\b[^>]*\bvalue=\{/;
const HA_FORM = (testo) => RACCOGLIE_INPUT.test(testo);

export function formSenzaAttesaEsito(sorgenti, azioni) {
  const conForm = (sorgenti || []).filter(f => HA_FORM(f.testo));
  …
  return {
    perimetro: perimetro.map(f => f.path),
    fuori: perimetro.filter(f => !ATTENDE_ESITO.test(f.testo)).map(f => f.path),
    // NUOVO: un form che scrive e NON valida per campo. Prima era la condizione
    // che rendeva un file invisibile; ora è ciò che il controllo misura.
    senzaValidazionePerCampo: perimetro
      .filter(f => !/\bvalidaCampi\b/.test(f.testo) && !/\bFieldError\b/.test(f.testo))
      .map(f => f.path),
  };
}
```

Con l'atteso in `index.js` portato al numero reale **prima** della migrazione
(così il rosso arriva sul debito vero e non sul controllo), e a `0` dopo.

---

### M-2 · Il click a lato butta via il form, negli undici modali del modulo denaro

**File.** `src/components/liste/modals/LvOverlay.jsx:59`.

**Perché è un problema.** Il progetto ha **già** riconosciuto e risolto questo
difetto, e lo dice nei commenti dei cinque punti in cui l'ha applicato:

```jsx
// NoticeEditorModal.jsx:114 — «si è appena scritto un avviso, un click a lato non
// deve buttarlo via»
// ProfileEditor.jsx:216 — «questo form ha sei campi, due sotto-form…»
// RipristinaTaskModal.jsx:103 — «qui si modificano otto campi prima di…»
closeOnOverlay={false}
```

`ui/Modal` ha l'opzione (`closeOnOverlay`, default `true`) e i cinque form che ne
hanno bisogno la usano. `LvOverlay` — il guscio degli **undici** modali del
modulo Liste — non ce l'ha affatto:

```jsx
// LvOverlay.jsx:59
<div className="lv-overlay" onClick={onClose}>
```

Chiude sempre, senza condizioni. Il caso peggiore è `BulkMovimentiModal`: una
tabella di righe di movimenti compilate a mano, ognuna con data, descrizione,
segno, importo e metodo — un click a un pixel dal bordo e non resta niente,
senza una domanda. Il modulo in cui questo costa di più è quello che protegge di
meno, e non per una decisione: per **omissione della prop**, perché il guscio è
un altro.

**Soluzione.** Portare l'opzione dove manca, con il default **invertito**
rispetto a `ui/Modal`, e la ragione dichiarata:

```jsx
// src/components/liste/modals/LvOverlay.jsx
/**
 * @param {boolean} [chiudiSuVelo=false]  se il click sul velo chiude.
 *
 * Il default è FALSE e non TRUE come in ui/Modal, ed è una scelta e non
 * un'incoerenza: questi undici modali sono i form più lunghi dell'app (ST-5) e
 * su denaro. Là il default permissivo copre venti modali di cui cinque
 * derogano; qui deroga chi non ha niente da perdere (RiepilogoClienteModal,
 * StrumentiDatiModal: sola lettura e scelte, nessun campo compilato).
 */
export function LvOverlay({ children, onClose, wide = false, labelledBy, chiudiSuVelo = false }) {
  …
  return createPortal(
    <div className="lv-root">
      <div
        className="lv-overlay"
        // `onMouseDown` e non `onClick`, e con il confronto sul target: come
        // ui/Modal:92. Con `onClick` una selezione di testo iniziata DENTRO il
        // form e terminata sul velo conta come click sul velo e chiude — il
        // modo più facile di perdere un modulo compilato senza aver mai
        // cliccato fuori.
        onMouseDown={chiudiSuVelo ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
      >
```

Nota che il difetto del `onClick` sul velo (selezione di testo che chiude il
modale) è oggi presente **anche dove chiudere sarebbe legittimo**, ed è la
ragione per cui `ui/Modal` usa `onMouseDown` con il confronto sul target.

---

### M-3 · `aria-modal="true"` è una promessa che nessuno dei due gusci mantiene

**File.** `src/components/ui/Modal.jsx`;
`src/components/liste/modals/LvOverlay.jsx:64-71`.

**Perché è un problema.** Entrambi i gusci dichiarano
`role="dialog" aria-modal="true"`, e per `LvOverlay` è stato un intervento
deliberato (ST-5: *«senza, per uno screen reader questi undici modali sono div
in mezzo alla pagina, non finestre che catturano il contesto»*). La dichiarazione
è metà del lavoro; l'altra metà — che il contesto sia **catturato davvero** —
non c'è in nessuno dei due:

- **Nessuna trappola del focus.** Ricerca su `Modal.jsx`, `ModalPortal.jsx`,
  `LvOverlay.jsx`, `TaskSlideOver.jsx`: zero gestione di `Tab`. Dal campo
  «Importo» di un modale, tre Tab portano dentro la Topbar della pagina
  sottostante — visivamente coperta dal velo, perfettamente focalizzabile.
  L'utente da tastiera si ritrova a interagire con qualcosa che non vede.
- **Nessuna restituzione del focus.** Alla chiusura il focus torna su `<body>`:
  chi usa uno screen reader riparte dall'inizio del documento invece che dal
  bottone che aveva premuto. `LvOverlay` sposta il focus sul primo campo
  all'apertura (:51) senza ricordare da dove veniva.
- **Il fondo non è nascosto.** Nessun `aria-hidden`/`inert` sulla radice
  dell'app: per la navigazione a esplorazione il contenuto sotto il velo è
  ancora tutto lì.

Non c'è lint che lo intercetti: `eslint-plugin-jsx-a11y` non è fra le
`devDependencies`.

**Soluzione — un hook solo, usato da entrambi i gusci** (stessa forma di
`creaErrorBoundary`: il ciclo di vita in un posto, il dominio nei chiamanti):

```js
// src/hooks/useTrappolaFocus.js  (nuovo)
// `aria-modal="true"` è una PROMESSA all'albero di accessibilità: «finché sono
// aperto, il resto non c'è». I due gusci la dichiaravano e nessuno dei due la
// manteneva — il Tab usciva nella pagina sotto e alla chiusura il focus tornava
// su <body>. Qui la promessa viene mantenuta una volta per tutti e due.
import { useEffect } from "react";

const FOCALIZZABILI = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])',
  'select:not([disabled])', 'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useTrappolaFocus(rif, attivo = true) {
  useEffect(() => {
    if (!attivo || !rif.current) return;
    const box = rif.current;
    // Da dove veniamo: si legge PRIMA di spostare il focus, ed è l'unico
    // momento in cui l'informazione esiste ancora.
    const origine = document.activeElement;

    const onKey = (e) => {
      if (e.key !== "Tab") return;
      const nodi = [...box.querySelectorAll(FOCALIZZABILI)].filter(n => n.offsetParent !== null);
      if (nodi.length === 0) return;
      const primo = nodi[0];
      const ultimo = nodi[nodi.length - 1];
      // Il ciclo si chiude a mano perché il browser non sa nulla di
      // `aria-modal`: per lui la pagina sotto è ancora tabbabile.
      if (e.shiftKey && document.activeElement === primo) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
    };

    box.addEventListener("keydown", onKey);
    return () => {
      box.removeEventListener("keydown", onKey);
      // Restituzione: `focus()` su un nodo staccato dal DOM è un no-op
      // silenzioso, quindi non serve controllare che esista ancora.
      if (origine instanceof HTMLElement) origine.focus();
    };
  }, [rif, attivo]);
}
```

Adottato in `Modal.jsx` e `LvOverlay.jsx` con una riga ciascuno. In parallelo,
aggiungere `eslint-plugin-jsx-a11y` alla flat config, che presidia la classe
intera invece del singolo caso.

---

### M-4 · Tre `<form>` in tutta l'app: Invio non invia

**File.** `src/components/liste/AddMovBox.jsx:99-150` e circa venti altri
modali; gli unici tre `<form>` sono `ClienteModal.jsx:106`,
`LoginScreen.jsx:134`, `UpdatePasswordScreen.jsx:48`.

**Perché è un problema.** `AddMovBox` è il form a frequenza più alta del
gestionale — è il riquadro con cui si registrano i movimenti, uno dietro
l'altro, e il codice è stato scritto apposta per la ripetizione (`alSuccesso`
azzera solo descrizione e importo e **rimette il focus sulla descrizione**,
perché data e metodo si ripetono). Tutto quel lavoro punta a un flusso da
tastiera che poi si interrompe: il markup è un `div`, quindi premere **Invio**
nell'ultimo campo non fa nulla e bisogna raggiungere il bottone.

Il costo non è solo l'ergonomia: senza `<form>` si perdono anche il tipo
`submit`, la semantica che gli screen reader usano per annunciare un gruppo di
campi come modulo, e il comportamento che i gestori di password si aspettano.

**Soluzione.** L'elemento giusto, che non cambia una riga di layout se il
`<form>` non introduce margini:

```jsx
// src/components/liste/AddMovBox.jsx
// `<form>` e non `<div>`: è ciò che dà a Invio il significato che l'utente si
// aspetta in un modulo. `noValidate` perché la validazione è la nostra (per
// campo, con i messaggi in italiano di REGOLE): quella nativa del browser
// mostrerebbe un secondo popup in inglese accanto ai nostri FieldError.
<form className="lv-add-box" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
  …
  <button className="lv-btn primary" type="submit" style={wFull} disabled={inVolo}>
    {inVolo ? "Registro…" : "Registra"}
  </button>
</form>
```

⚠️ Con l'attenzione che rende l'intervento non meccanico: **ogni bottone dentro
un `<form>` senza `type` esplicito è un `submit`**. Nei modali che ne hanno più
di uno (`AddMovBox` ha «✕ Chiudi» e «+ Inserisci più movimenti insieme»; i
modali Liste hanno tutti «Annulla») vanno marcati `type="button"` **nello stesso
commit**, o il passaggio a `<form>` introduce un salvataggio a ogni click su
Annulla. È la ragione per cui questo rilievo è Media e non Bassa nonostante la
correzione sia di una riga: la riga da sola è una regressione.

---

### B-1 · Ogni toast di successo interrompe lo screen reader

**File.** `src/components/ui/Toast.jsx:20-24`.

Il contenitore è `aria-live="assertive"`; i figli distinguono già correttamente
`role="alert"` (errori) da `role="status"` (successi e warning), ma la
politeness del contenitore si applica a tutto ciò che vi compare dentro. Il
risultato è che «Task aggiornato!» interrompe l'annuncio in corso esattamente
come un errore, e in un'app dove ogni azione produce un toast di conferma
significa interrompere di continuo.

```jsx
// src/components/ui/Toast.jsx
// `polite` sul CONTENITORE: la distinzione fra ciò che interrompe e ciò che
// aspetta è già sui figli (role="alert" per gli errori, role="status" per il
// resto) e un `assertive` qui la annulla verso l'alto, promuovendo anche
// «Task aggiornato!» a interruzione. Il contenitore resta montato sempre — la
// ragione originale, che non cambia — e sono i figli a decidere l'urgenza.
<div aria-live="polite" aria-atomic="false" style={…}>
```

### B-2 · Due politiche per lo stesso dato tecnico

**File.** `src/lib/errorReporting.js` (`messaggioUtente`, `testoLeggibile`).

`ErrorDetails` in produzione nasconde il messaggio dell'eccezione, con una
motivazione esplicita (rumore per l'utente + information disclosure davanti al
cliente). `messaggioUtente` fa il contrario nello stesso momento e sullo stesso
schermo: `Operazione non riuscita: ${testoLeggibile(motivo)}`, dove
`testoLeggibile` è `error.message` — quindi «Cannot read properties of undefined
(reading 'assignees')» o «Failed to fetch» finiscono in un toast davanti a un
agente di viaggio.

La correzione è allineare le due politiche, non irrigidirle: il messaggio grezzo
serve quando **descrive qualcosa di azionabile** (un errore PostgREST dice quale
vincolo ha respinto la scrittura) e non quando è un `TypeError` interno.

```js
// src/lib/errorReporting.js
// Stessa politica di ErrorDetails, applicata all'altro canale: in produzione a
// schermo va ciò che l'utente può usare, il resto in console con un codice.
// Gli errori del data layer PORTANO informazione azionabile e restano; quelli
// del runtime JavaScript no, e diventano un codice da dettare.
const isErroreDiProgrammazione = (e) =>
  e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError;

const messaggioUtente = (motivo, codice) => {
  if (isChunkMancante(motivo)) return "L'app è stata aggiornata: ricarica la pagina per continuare.";
  if (import.meta.env.DEV || !isErroreDiProgrammazione(motivo)) {
    return `Operazione non riuscita: ${testoLeggibile(motivo)}`;
  }
  return `Operazione non riuscita. Se si ripete, segnala il codice ${codice}.`;
};
```

Con `segnala()` che genera il codice con `codiceSegnalazione()` e lo scrive in
console accanto all'errore, esattamente come fanno i boundary.

### B-3 · `LvOverlay` è fuori dalla pila dei modali

**File.** `src/components/liste/modals/LvOverlay.jsx:42-43`.

`ui/Modal` mantiene una pila di token proprio perché *«Esc deve chiudere UN
modale: quello in cima»*. `LvOverlay` ascolta `keydown` su `window` senza
parteciparvi: un Esc con una `ConfirmDialog` aperta sopra un modale Liste ne
chiuderebbe due.

**Oggi non è raggiungibile** — i modali Liste sono mutuamente esclusivi per
costruzione (`overlay.tipo`, un solo valore alla volta) e tutte le `conferma()`
del modulo nascono da `ListaDetail`/`ListeViaggio`/`ArchivedListe`, cioè dalla
pagina e non da dentro un overlay. È quindi un rilievo di **presidio**: la
condizione che lo rende innocuo non è scritta da nessuna parte, e il primo
`conferma()` chiamato dall'interno di un modale Liste la rompe in silenzio.

La correzione è esportare la pila da `ui/Modal.jsx` in un modulo condiviso
(`src/components/ui/pilaModali.js`) e farla usare a entrambi i gusci — una
riga per lato, e la regola smette di dipendere da chi ha scritto il modale.

---

## Top 3 suggerimenti strategici

### 1. Chiudere A-1 + A-3 insieme: «i dati che vedi sono i dati che ci sono»

Presi singolarmente sembrano due rilievi diversi (realtime, idratazione). Sono
**la stessa domanda**: *l'app sa che ciò che mostra non è aggiornato, e non lo
dice*. A-1 è la versione continua (il canale è morto), A-3 quella iniziale (il
fetch è fallito). Hanno anche lo stesso rimedio strutturale — un terzo stato
accanto a caricamento/pronto — e lo stesso posto in cui esprimersi: la striscia
persistente che `OfflineBanner` ha già inaugurato per l'offline.

Chiuderli insieme significa che **VoyageDesk non ha più un modo di mostrare
numeri sbagliati con la faccia di quelli giusti**, che per un gestionale di
buoni viaggio è la proprietà che conta più di tutte. Chiuderli separatamente
significa scrivere due volte lo stesso banner e due volte lo stesso stato.

Costo stimato: due giornate. È il singolo intervento con il rapporto più alto fra
rischio rimosso e codice scritto.

### 2. Fare del perimetro dei controlli qualcosa che non può restringersi (M-1, seconda metà)

Il progetto ha una qualità rara: **presidia i propri rilievi con controlli
automatici**, e `verifica:convenzioni` con i suoi 53 controlli è il motivo per
cui tredici audit sono rimasti chiusi invece di riaprirsi da soli. Il difetto
trovato qui non è in un controllo: è nel **modo di definire i perimetri**.
`formSenzaAttesaEsito` misura la conformità su un insieme definito dal marcatore
della conformità, e la CI stampa uno zero vero su 7 form mentre l'app ne ha ~25.

La regola generale da adottare, e da scrivere in `docs/CLAUDE.md` accanto a
quelle esistenti:

> **Il perimetro di un controllo non si definisce mai con il marcatore di ciò
> che il controllo verifica.** Si definisce con ciò che il codice *fa* — un form
> raccoglie input e scrive — e resta identico prima e dopo la migrazione. Un
> perimetro che si restringe man mano che il debito viene pagato non misura
> niente.

Vale la pena rileggere con questa lente anche gli altri controlli con atteso 0:
`statoInvioScrittoAMano` (marcatore `const [saving, …]`) ha la stessa forma, e il
suo preambolo si difende con un ragionamento che vale per lui e non per M-1.

Il ritorno non è chiudere M-1: è che i **prossimi** tre rilievi di questa classe
li trova la CI invece di un audit.

### 3. Adottare la regola «una condizione che dura si dice con una striscia, un evento si dice con un toast»

Cinque dei dodici rilievi (A-1, A-2, A-3, A-4, B-1) sono sfaccettature di una
sola confusione: **il toast è usato per cose che non sono eventi.** Un
caricamento fallito dura finché non lo si riprova; un canale morto dura finché
non si ricarica; una versione obsoleta dura finché la scheda è aperta. Il toast
è per costruzione effimero, singolo (tre slot) e senza azione — quindi ognuna di
queste condizioni finisce raccontata dal canale sbagliato, e i rimedi diventano
patch al canale (l'errore che non scade, il cap che poi lo espelle comunque).

`OfflineBanner` ha già la tesi giusta scritta nel proprio preambolo — *«la
condizione dura finché dura […] la persistenza è il messaggio»* — ma è applicata
a una condizione sola. Promuoverla a **regola dichiarata** in `docs/CLAUDE.md`,
con un componente `StrisciaCondizione` che le raccoglie tutte in ordine di
priorità (offline > realtime degradato > versione obsoleta > caricamento
fallito), fa tre cose insieme: dà ad A-1/A-3/A-4 un posto dove vivere invece di
tre soluzioni ad hoc, restituisce al toast il suo ruolo (eventi, dove
funziona bene), e rende A-2 e B-1 problemi molto più piccoli, perché la coda dei
toast smette di dover reggere ciò per cui non è fatta.

---

## Come sono stati chiusi A-1 e A-3 (31 agosto)

Chiusi **insieme**, che era il punto del suggerimento strategico n. 1: presi
singolarmente sembrano due rilievi diversi (realtime, idratazione), ma sono la
stessa domanda — *l'app sa che ciò che mostra non è aggiornato, e non lo dice* —
posta in due momenti. A-1 è la versione continua (il canale è morto), A-3 quella
iniziale (il fetch è fallito). Chiuderli separatamente avrebbe significato
scrivere due volte lo stesso terzo stato.

### A-1 · lo stato del canale, segnalato E recuperato

Le due metà sono inseparabili, ed è la lezione di A-2/A-3 del 28 agosto:
segnalare senza recuperare lascerebbe una striscia che dice «ricarica» anche
dopo che il canale è tornato su da solo (supabase-js riaggancia in autonomia);
recuperare senza segnalare rimetterebbe i dati a posto senza mai dire
all'utente che per un po' non lo erano.

- **`lib/realtime.js`** — `subscribeToTable` prende un terzo parametro
  `onStato` e lo aggancia a `.subscribe()`. È opzionale perché
  `subscribeToTyping` non ne ha bisogno (stato effimero, degradare in silenzio
  è corretto), non per comodità dei chiamanti su tabella.
  ⚠️ Il ramo «client non utilizzabile» (env var assenti, doppio nei test) **non**
  segnala nulla: lì non c'è un canale caduto, non c'è mai stato un canale, e
  segnalarlo accenderebbe la striscia in ogni test che mocka il client — cioè
  affermerebbe un guasto dove c'è una configurazione.
- **`lib/freschezzaRealtime.js`** (nuovo) — il registro. **Aggregato e non per
  tabella**: all'utente «gli aggiornamenti automatici sono fermi» è azionabile,
  «il canale notices è in CHANNEL_ERROR» no; la diagnosi per canale resta, in
  console. La chiave è per **sottoscrizione** e non per tabella, perché `users`
  è osservata due volte dalla stessa sessione e due chiavi uguali farebbero
  sparire lo stato della prima. Notifica solo sulla **transizione** del fatto
  aggregato: nove canali che riagganciano dopo una sospensione consegnano nove
  `SUBSCRIBED` e devono produrre un solo risveglio.
- **`hooks/useDebouncedTableSubscription.js`** — segnala, e sul riaggancio dopo
  una caduta chiama `onReconnectSignal()`, cioè lo **stesso** percorso di
  `online` e del ritorno in primo piano: Postgres Changes non ha ripresa da
  offset, quindi l'unico reload corretto è quello completo. Il primo
  `SUBSCRIBED` **non** conta come ripresa — è l'aggancio iniziale, e trattarlo
  come ritorno rifarebbe l'idratazione appena fatta a ogni mount di ognuna
  delle nove sottoscrizioni. Il cleanup dimentica i propri canali: uno
  smontaggio che ne lasciasse dietro uno marcato rotto terrebbe accesa per
  sempre una striscia su una condizione non più osservabile.
- **`hooks/useFreschezzaRealtime.js`** (nuovo) — `useSyncExternalStore` e non
  `useState` + effetto: fra il primo render e l'esecuzione di un effetto un
  canale può essere già caduto, e quella transizione sarebbe stata notificata
  prima che il listener esistesse. È lo stesso buco che `useOnlineStatus`
  chiude a mano con il riallineamento al mount.
- **`components/shell/OfflineBanner.jsx`** — seconda variante, **oro e non
  rossa**: offline le scritture falliscono, qui passano tutte ed è la lettura
  automatica a essere ferma. Lo stesso colore per entrambe significherebbe che
  chi la vede non sa quale delle due sta leggendo, cioè non sa se può
  continuare a lavorare. La frase dice anche cosa **continua** a funzionare,
  perché «interrotti» da solo si legge come «non salvare niente». L'offline
  **vince** quando sono vere insieme: sono vere insieme per costruzione (senza
  rete i canali cadono per conseguenza) e due strisce direbbero due volte la
  stessa cosa con due rimedi, di cui uno inapplicabile. `aria-live` è
  `assertive` per l'offline e `polite` qui: non c'è nulla di urgente da
  interrompere.

⛔ **Non copre** il caso in cui la rete c'è, il canale è vivo e le **query**
falliscono: quello è l'altro segnale applicativo che `useOnlineStatus` nomina, e
per l'idratazione lo copre A-3 qui sotto — per le scritture lo coprono già i due
registry.

### A-3 · il terzo stato, e la sua via d'uscita

- **`hooks/useErroriIdratazione.js`** (nuovo) — `entita → messaggio | null` più
  la composizione con l'handle di ricarica. In un file suo per la stessa
  ragione di `state/toastQueue.js`: il tetto di righe di `useAppHydration` non
  è un margine da consumare ma una deroga alla sua forma (sei idratazioni che
  si leggono una accanto all'altra), e la domanda giusta era quale fetta
  meritasse un file — questa non è idratazione, è la politica di come si
  ricorda e si compone un fallimento, e non conosce nessuna entità per nome.
- **`hooks/useDebouncedTableSubscription.js`** — ritorna un handle `ricarica`
  con **identità stabile**. Il «Riprova» passa da lì e non da una seconda
  chiamata alla funzione di reload: richiamarla da fuori la farebbe partire con
  un `isCurrent` suo, cioè fuori dal gen-counter dell'effetto, e la sua
  risposta non saprebbe di essere stale rispetto a un reload realtime partito
  nel frattempo. È esattamente la corsa che `run` esiste per ordinare.
- **`hooks/useAppHydration.js`** — tutti e sei i percorsi segnalano l'esito, e
  lo **spengono** sul successo: chi rimedia può essere il reload di una
  riconnessione, non solo il «Riprova», e un allarme che resta acceso dopo che
  i dati sono tornati è la cosa che rende ignorabili tutti gli altri.
  ⚠️ **Trovato chiudendo il rilievo**: il ramo d'errore di `Users.listAll` era
  l'unico dei sei a non chiamare nemmeno `onError` — un team che non si carica
  non produceva **alcun** segnale, e su `state.team` si calcola la matrice dei
  permessi lato client. Ora dice entrambe le cose.
- **`components/ui/StatoEntita.jsx`** (nuovo) + **`VoyageDeskInner.jsx`** — il
  riquadro è montato **una volta** sopra la vista attiva e non dentro le nove:
  la regola («un caricamento fallito non si disegna come un vuoto») è una sola,
  e riscritta nove volte diventa nove varianti — stessa ragione per cui
  `ErrorDetails` è uno per tre boundary. Il riquadro **si aggiunge** alla
  vista e non la sostituisce: ciò che era stato caricato prima dell'errore
  resta utilizzabile, e sostituire tutto sarebbe la reazione sproporzionata che
  `ViewErrorBoundary` esiste per non avere. `role="status"` e non `alert`:
  l'annuncio interrompente l'ha già fatto il toast: qui resta la condizione.

### Verifica

- **42 test nuovi** in cinque file (`test/lib/freschezzaRealtime.test.js`,
  `test/realtime/statoCanale.test.jsx`, `test/realtime/idratazioneErrore.test.jsx`,
  `test/shell/strisciaFreschezza.test.jsx`, `test/ui/statoEntita.test.jsx`).
  I casi che contano sono verificati **contro il codice precedente** per
  mutazione, in entrambe le direzioni: disattivando il recupero fallisce «il
  riaggancio DOPO una caduta ricarica tutto»; facendo contare il primo
  `SUBSCRIBED` come ripresa falliscono «il PRIMO 'SUBSCRIBED' non ricarica» e
  «una caduta senza riaggancio non ricarica nulla»; togliendo
  `dimenticaCanale` dal cleanup fallisce «lo smontaggio toglie i canali dal
  registro»; togliendo i due `segnaEsito` falliscono il ciclo del «Riprova» e
  il ramo del team.
- `npm test` 1937 passati / 23 saltati su 160 file (erano 1895 su 155);
  `npm run lint` e `npm run verifica:tipi` puliti;
  `npm run verifica:convenzioni` 55 controlli, nessuna divergenza.
