# Audit architettura — 25 agosto 2026

Perimetro: struttura del codice, accoppiamento fra i moduli, duplicazione,
separazione delle responsabilità. Otto rilievi, **nessuno critico e nessuno di
alta priorità**: la sicurezza, il flusso dati e la performance non sono stati
ri-esaminati qui — li coprono gli audit del 23 agosto (primo e secondo
passaggio) e quello performance/UX del 19.

Eseguito su un repository con `lint`, `test`, `verifica:tipi`,
`verifica:convenzioni` e `build` tutti verdi. Come quello del 23 agosto
(secondo passaggio), un audit che parte da lì non cerca difetti che uno
strumento vede: cerca ciò che nessuno strumento misura.

⟦stato: 5/8 chiusi⟧

> **Sulla numerazione.** `M-` = media priorità, `B-` = bassa, come negli audit
> dal 12 al 16 agosto. I cinque rilievi di priorità media sono chiusi; i tre di
> bassa priorità restano aperti (B-1 è chiuso per tre quinti — vedi sotto).

---

## Executive summary

Il difetto ricorrente di questo passaggio ha una forma sola, ripetuta cinque
volte: **una risposta data una volta e non propagata.** L'app sa come si
distribuisce un dato condiviso — ha sei provider di dominio — ma `dispatch`
continuava a viaggiare come prop in cinquanta componenti, e la chat era
arrivata da sola a metterlo nel proprio context senza che nessuno notasse che
la domanda valeva per tutti (M-2). Sa che «questi due nomi sono la stessa
persona?» è una regola di dominio, e ne aveva quattro implementazioni che si
dichiaravano gemelle mentre la punteggiatura le divideva in due famiglie (M-4).
Sa che un error boundary ha un lifecycle, e ne aveva tre copie con le derive
già iniziate (M-3). Sa che una scrittura si dichiara in un registry, e ne aveva
due con due vocabolari (M-1).

Nessuno dei cinque produceva un difetto visibile **oggi**, con una sola
eccezione — M-4, dove lo script di import e l'app non erano d'accordo su chi
fosse chi, e l'import riusava id di clienti che l'app non avrebbe collegato.
Quello che tutti e cinque producevano è la stessa cosa: il prossimo componente
copiava la forma dal vicino. Per questo tre delle cinque correzioni finiscono
in una regola o in un test, non solo in una riscrittura.

M-5 è di natura diversa e più semplice: cinque file oltre le 380 righe
effettive con tre o più responsabilità ciascuno. Nessun trucco, solo il
confine giusto — e in un caso (`CalendarAgentLoad`) due `filter` gemelli liberi
di divergere sono diventati una funzione sola.

**Un difetto vero trovato per strada, e non era fra i rilievi.** Leggendo
`Trash.jsx` per M-5: `"var(--stiliComuni.card)"` in cinque punti di tre file.
Un nome di custom property con un punto dentro non è valido — quei fondi non si
dipingevano affatto. È il residuo del rename automatico di A-2 (22 agosto), che
ha toccato anche stringhe che non erano identificatori. Chiuso con un test che
verifica che ogni `var(--…)` del sorgente sia dichiarata in uno dei due fogli di
stile dell'app.

---

## Tabella delle priorità

| # | Priorità | Area | Rilievo | Dove |
|---|---|---|---|---|
| **M-1** ✔ | Media | Manutenibilità | Due architetture dati (core ottimistico vs liste refetch): due vocabolari per lo stesso contratto di scrittura, e la differenza vera descritta solo a parole | `state/persistence.js` · `liste/listePersistence.js` |
| **M-2** ✔ | Media | Accoppiamento | `dispatch` prop-drilled in 50 componenti, a fronte di 6 context già esistenti | 50 file in `components/` |
| **M-3** ✔ | Media | Duplicazione | 3 ErrorBoundary quasi identici, ~40 righe di lifecycle triplicate | `ErrorBoundary` / `ViewErrorBoundary` / `OverlayErrorBoundary` (292 righe) |
| **M-4** ✔ | Media | Divergenza | Chiave d'identità cliente in 4 implementazioni, e due davano risposte diverse | `clientNotes:63` · `searchUtils:26` · `ClientImportModal:100` · `scripts/importa-liste/parser.js` |
| **M-5** ✔ | Media | Testabilità | God components: 5 file oltre 380 righe effettive con 3+ responsabilità | `ListeViaggio` 448 · `CalendarPlanner` 430 · `TaskSlideOver` 417 · `Trash` 404 · `ProfileEditor` 388 |
| **B-1** ⚙ | Bassa | Navigabilità | Cartelle-contenitore senza semantica: `modals/`, `views/`, 5 file sciolti in `components/` | struttura |
| **B-2** | Bassa | SoC | Regola di dominio (tassonomia keyword→categoria) dentro un file UI | `QuickAddTask.jsx:50-80` |
| **B-3** | Bassa | Leggibilità | Naming misto IT/EN nello stesso scope | trasversale |

---

## M-1 · Due registry di scrittura, due vocabolari ✔

**Il rilievo, precisato.** Il titolo diceva «core ottimistico vs liste
refetch», e quella parte **non è un difetto**: sono due famiglie, e la scelta è
di dominio. Il core è OTTIMISTICO perché è ciò che l'operatore tocca in
continuazione — mezzo secondo di attesa per gesto è la differenza fra un
gestionale e un modulo web. Le liste CONFERMANO PRIMA perché lì il dato è
denaro, e un saldo mostrato che il database non ha è un difetto di un'altra
categoria rispetto a una spunta che torna indietro. Unificarle sarebbe stato il
refactoring sbagliato.

**Il difetto vero** è che quella differenza era descritta **a parole** in cima a
`listePersistence.js` («COSA NON FA, DI PROPOSITO») e per il resto i due
registry erano due mondi: `persist` di qua e `run` di là per la stessa cosa,
due copie della lettura dell'esito (l'una sapeva gestire un array di risposte,
l'altra no), due copie del testo utente dell'errore, e **due frasi diverse per
lo stesso evento davanti allo stesso utente** — «Salvataggio fallito: …» e
«Errore: …».

**La correzione.** `state/registroScritture.js` dichiara le due famiglie, il
vocabolario delle entry e le primitive dell'esecutore che entrambi usano. La
conseguenza sulla forma — un registry «conferma prima» non può avere
`rollback`, `entityId` o `normalize`, perché non c'è nulla da compensare, nulla
in volo e nessun dispatch da arricchire prima che avvenga — è misurata in
`src/test/registroScritture.test.js`, che intercetta anche un campo scritto
male: oggi un `mapErrror` non produce alcun errore, la entry viene eseguita
senza quel comportamento e in silenzio.

**Non è la prima volta.** `convergenzaRegistry.test.js` nasce da A-1 del 15
agosto, cioè dalla stessa diagnosi vista da un altro lato. Ora verifica anche
l'anello in mezzo: il modulo condiviso importa `esitoScrittura` invece di
riscriverne una copia.

## M-2 · `dispatch` smette di essere una prop ✔

Cinquanta componenti lo dichiaravano fra le proprie prop, e per buona parte di
loro non era un dato: era **un pacco da consegnare al piano di sotto**.
`AdminView` lo riceveva per darlo alle cinque tab, `ClienteDetailPanel` per
darlo a due figli, `ListaDetail` per darlo a quattro editor in linea. Il costo:
una firma più lunga in ogni componente attraversato, il lettore che deve
stabilire ogni volta se quel `dispatch` sia usato lì o solo inoltrato, e un
componente nuovo in fondo a una catena che costringe a toccare ogni anello
sopra di lui.

**La risposta era già stata data una volta**, in locale: `chat/chatContext.js`
aveva messo `dispatch` nel proprio context per scampare a quattro livelli di
prop-drilling, senza che nessuno notasse che la domanda valeva per l'app
intera. Quella copia ora non c'è più — degradava a `noop` quando il pannello
veniva montato senza.

**Perché è sicuro per contesto.** Il difetto classico di un context è che i
consumatori si ri-renderizzano quando cambia il `value`. Qui il value non cambia
mai: `useSyncedDispatch` ritorna una `useCallback` a identità stabile **per
contratto dichiarato**, e il value del provider *è* quella funzione, non un
oggetto che la contiene. Zero ri-render aggiuntivi, nessun `useMemo` da tenere
allineato — ed è fissato da un test che conta i render di un consumatore
memoizzato mentre il genitore si ri-renderizza.

**Cosa NON cambia.** `dispatch` resta un ARGOMENTO per gli hook di dominio
(`useAppHydration`, `usePushNavigation`): li chiama l'orchestratore, che il
dispatch ce l'ha in mano, e riceverlo esplicitamente è ciò che li rende
testabili senza montare un albero React.

**La regola.** `VIETATO_DISPATCH_PROP` in `eslint.config.js`, a zero
violazioni, con due eccezioni nominate — `DispatchProvider` e `AppProviders`,
i due punti in cui il dispatch entra nell'albero. Stessa forma e stessa storia
di `VIETATO_APPGLOBALS`: il problema non era scrivere il context, era che ogni
componente aggiunto copiava la firma dal vicino.

## M-3 · Un solo ciclo di vita per i tre error boundary ✔

I tre boundary devono restare tre: coprono tre superfici (l'app intera, la sola
vista attiva, un overlay lazy) con tre messaggi e tre vie d'uscita diverse —
ricaricare, tornare alla Dashboard, chiudere il pannello. Quella parte è
dominio.

Quello che non lo era: `getDerivedStateFromError` con il codice di
segnalazione, `componentDidCatch` con il log, il confronto d'identità che
riarma il boundary e la scelta fra `children` e pannello d'errore. ~40 righe in
triplice copia, **con le derive già iniziate**: `ViewErrorBoundary` e
`OverlayErrorBoundary` facevano la stessa cosa su prop diverse
(`viewKey`/`resetKey`), ed `ErrorBoundary` aveva un `getDerivedStateFromProps`
in meno che nessuno avrebbe notato mancare.

Ora il lifecycle vive in `components/errors/creaErrorBoundary.jsx` e ai tre
file resta ciò che li distingue: il pannello, la riga di log, il nome della
prop che li riarma. Il primo livello non aveva copertura: ora ce l'ha, e fissa
le due proprietà della fusione — nessun riarmo senza chiave d'identità, e il
codice di segnalazione in console insieme al dettaglio (criticità #9).

## M-4 · Una sola chiave d'identità per il cliente ✔

**L'unico rilievo di questo passaggio con un difetto osservabile.** «Questi due
nomi sono la stessa persona?» aveva quattro risposte scritte a mano:

| dove | regola |
|---|---|
| `lib/clientNotes.js` · `chiaveNome` | maiuscole, accenti, spazi doppi |
| `ClientImportModal.jsx` · `normName` | come sopra, ma in minuscolo |
| `importa-liste/parser.js` · `chiaveCliente` | come sopra, **più la punteggiatura** |
| `lib/searchUtils.js` · `normalizzaTesto` | come parser.js, in minuscolo |

Le prime tre si dichiaravano gemelle — «maiuscole, accenti e spazi doppi non
distinguono due clienti», diceva il commento — e non lo erano.

**Perché contava.** Lo script di import fa combaciare i clienti dei documenti
con quelli del backup dell'app. Con due definizioni ai due lati, «FAM. SCURO
TEODORO» era lo stesso cliente per lo script — che ne riusava l'id — e due
clienti diversi per l'app, che quindi non collegava i task dell'uno alla scheda
dell'altro. Su un'anagrafica nata dalla fusione di due popolazioni (apostrofi,
abbreviazioni con punto, gradi: il censimento è in `searchUtils.js`) il caso è
frequente.

**La regola adottata** è la più larga delle due famiglie — maiuscole, accenti,
punteggiatura e spazi doppi non distinguono due clienti — perché sbaglia in una
direzione sola: può unire due schede che un operatore separerebbe, mai spezzare
in due un cliente che è uno. Vive in `lib/chiaveCliente.js` e la usano tutti,
script di import compreso (che importa da `src/`, come già fa `misura-render`).

**L'ordine delle parole resta l'unico asse su cui identità e ricerca
differiscono** — «ROSSI MARIO» ≠ «MARIO ROSSI», perché fonderli unirebbe le
liste di due persone in caso di omonimia parziale — e ora si vede nel codice:
`normalizzaTesto` è la chiave in minuscolo, e la tolleranza sull'ordine è uno
strato sopra.

## M-5 · Cinque god components ✔

| file | prima | dopo | cosa è uscito |
|---|---|---|---|
| `liste/ListeViaggio.jsx` | 448 | 366 | `useStrumentiDati.js` — backup in giù, backup in su, reset totale: l'unico dei quattro lavori che non tocca né elenco né dettaglio |
| `calendar/CalendarPlanner.jsx` | 430 | < 366 | `CalendarMonthGrid.jsx` (la vista che era rimasta in linea perché è quella di default) e `CalendarAgentLoad.jsx` (che non è una vista del calendario affatto) |
| `tasks/TaskSlideOver.jsx` | 417 | < 366 | `TaskAssegnatari.jsx` e `TaskCommenti.jsx`, **con il proprio stato** |
| `views/Trash.jsx` | 404 | < 366 | `RipristinaTaskModal.jsx` — un form di otto campi più lungo dell'elenco e delle due operazioni distruttive messi insieme |
| `modals/ProfileEditor.jsx` | 388 | < 366 | `AccountSicurezza.jsx` + il proprio reducer |

Tre note che valgono più delle righe risparmiate:

* **Lo stato viaggia col codice che lo usa.** Il menu degli assegnatari e il
  testo del commento erano `useState` del pannello: ogni carattere digitato
  ri-renderizzava campi, allegati e cronologia. La bozza del ripristino era
  del cestino: ora vive nella modale, che si monta solo quando c'è qualcosa da
  ripristinare, e il cestino torna a sapere soltanto QUALE task.
* **La prova che `ProfileEditor` erano due cose** è che il suo reducer locale
  aveva quattro fette e tre erano della sezione account. La quarta —
  `salvaInVolo`, il freno al doppio invio del salvataggio del profilo — è
  tornata a essere un `useState` accanto a ciò che protegge.
* **Un difetto chiuso per strada**: in `CalendarAgentLoad` due `filter` gemelli
  contavano il carico di un agente — uno per la cella, uno per il totale di
  riga — liberi di divergere. Ora è una funzione sola.

---

## Rilievi ancora aperti

### B-1 ⚙ · Cartelle-contenitore senza semantica

`modals/` e `views/` raggruppano per TIPO in una struttura che altrove
raggruppa per FUNZIONALITÀ (`tasks/`, `chat/`, `liste/`) — è lo stesso rilievo
di A-6 del 23 agosto (secondo passaggio), visto da un'altra angolazione.

**Chiuso per tre quinti**: i file sciolti in `components/` erano cinque, ora
sono due (`Viewport.jsx`, `SwipeActions.jsx`). I tre error boundary sono in
`components/errors/` accanto alla loro implementazione — non per B-1, ma
perché M-3 li ha comunque toccati tutti e tre.

Resta aperta la parte grande, e va fatta come decisione dichiarata e non come
churn: `modals/` contiene cose di dominio diverso (il profilo, una categoria,
un membro del team, l'aggiunta rapida di un task) e ognuna avrebbe una casa
naturale altrove.

### B-2 · Una regola di dominio dentro un file UI

`QuickAddTask.jsx:50-80` contiene la tassonomia keyword→categoria: «se il
titolo contiene *volo*, la categoria è *biglietteria*». È una regola di
business dell'agenzia, con lo stesso status delle regole di permesso in
`lib/permissions.js`, e vive dentro il componente che la usa per primo.

### B-3 · Naming misto IT/EN nello stesso scope

Trasversale. Il codice più recente è in italiano (`chiaveCliente`, `esegui`,
`bozza`), quello di Step P in inglese (`draft`, `handleSave`, `updateField`), e
i due si toccano dentro la stessa funzione. ⚠️ Non si chiude con un rename
automatico: A-2 del 22 agosto ha già mostrato che cosa succede quando una
sostituzione di identificatori tocca anche le stringhe — cinque `var(--card)`
diventati `var(--stiliComuni.card)`, sfondi che non si dipingevano, e nessuno
strumento che lo segnalasse per tre giorni.
