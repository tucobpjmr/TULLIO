# CHANGELOG — VoyageDesk

## Audit del 30 agosto — A-1 (seguito)

> Quarto intervento sull'audit del 30 agosto: la prima tappa del rilievo Media
> rimasto — «tabella intera in memoria, filtro nel browser» — quella che
> l'audit indicava come piccola e indipendente dal resto (un intervento XL da
> pianificare, non da improvvisare).

**Cosa cambia.** La ricerca di `ClientiView` (l'anagrafica, non la tendina di
suggerimento cliente) non filtra più in memoria l'intero corpus scaricato da
`useClientiCompleti()` — O(N) su ricerca, filtro e ordinamento, con una soglia
realistica di 5.000-10.000 righe. A query non vuota interroga
`Clients.cercaAnagrafica()` → RPC `cerca_clienti`
(`supabase/migrations/20260830190000_clienti_ricerca_trgm.sql`), che confronta
contro colonne generate normalizzate con `pg_trgm`+`unaccent` — la stessa
normalizzazione di `lib/searchUtils.js` (accenti, apostrofi, punteggiatura,
cognomi elisi), non quella più permissiva già accettata per la tendina
(`Clients.cerca()`, solo `name`, senza normalizzazione). A query vuota
(si sfoglia senza cercare) l'anagrafica resta sul corpus locale: è la parte
del rilievo che questo intervento non copre, corretta fino alla soglia sopra.

**Perché una RPC e non un filtro PostgREST diretto.** La ricerca è AND fra i
termini digitati, OR fra due colonne per ciascuno (il testo normalizzato e la
sua variante senza spazi, per i cognomi elisi). Comporlo con `.or()` di
postgrest-js avrebbe richiesto interpolare il termine digitato dentro la
mini-sintassi di quel filtro — un termine con virgole o parentesi lo
altererebbe. La RPC costruisce il predicato con `format('%L', …)`, verificato
anche contro un tentativo di iniezione prima di scrivere la migrazione
definitiva.

**Verificato su un progetto di staging separato prima di scrivere la
migrazione per `main`**: elisioni (`dellorto` trova `Dell'Orto`), ordine
libero dei termini, AND fra campi diversi, nessun risultato falso positivo,
un termine con caratteri speciali non altera il predicato, e con
`enable_seqscan off` il piano usa l'indice trigram su entrambe le colonne —
a poche righe Postgres sceglie comunque una scansione sequenziale, che è
corretto: l'indice serve quando la tabella cresce, non prima. Nessun nuovo
avviso dell'advisor di sicurezza (né `extension_in_public`, né
`function_search_path_mutable`): le estensioni vanno nello schema
`extensions` come già `pg_net`, le funzioni dichiarano `search_path`
esplicito.

**Cosa NON è cambiato**: i conteggi «Con liste viaggio»/«Solo anagrafica»,
l'ordinamento e il conteggio totale in testata restano sul corpus locale
completo — sono statistiche sull'INTERA anagrafica, non sul risultato di una
ricerca. `Clients.cerca()` (la tendina di suggerimento) resta invariata:
serve un caso diverso (un suggerimento rapido mentre si digita, non lo
strumento con cui si cerca davvero una scheda) e la sua limitazione nota
resta accettata per quello.

## Audit del 30 agosto — B-1, B-3 e S-1

> Terzo intervento sull'audit del 30 agosto (dopo B-2, supabase-js fuori dal
> first load anonimo): chiude il rilievo Alta rimasto — il margine di bundle
> esaurito — più i due Bassa/Media di igiene rimasti aperti.

**B-1 · Dashboard e ClientiView diventano `lazy()`.** Erano rimaste eager in
`VoyageDeskInner.jsx` per una scelta motivata — sono le due viste d'ingresso
più frequenti, e renderle lazy avrebbe sostituito il loro costo con un flash
di fallback su ogni sessione invece di risparmiarlo davvero. Quella
motivazione risaliva a prima di `LazyFallback` e degli skeleton per entità
(`SkeletonCards`/`SkeletonRows`): con quelli in piedi il `Suspense` già
presente attorno alla vista attiva mostra uno scheletro coerente, non un
flash vuoto. Misurato: il chunk dell'app scende da 63,22 a 44,87 kB gzip e il
first load autenticato da 176,26 a 124,86 kB — il margine sul chunk app torna
da 3,78 a oltre 20 kB. Le soglie di `scripts/verifica-bundle/index.js` sono
scese di conseguenza (stessa regola delle rimisurazioni precedenti: le soglie
scendono con la misura, altrimenti smettono di intercettare qualcosa).

**S-1 · `npm audit` non è più rosso in permanenza senza motivo.**
`xlsx@0.18.5` porta due CVE high senza fix su npm (SheetJS ha lasciato il
registry): il rischio era già mitigato architetturalmente — parse in un Web
Worker terminato subito dopo, `prototypeGuard.js` sul passaggio di confine —
ma `npm audit` restava rosso per chiunque lo lanciasse, ed è esattamente la
forma in cui un allarme smette di essere un allarme. `npm run verifica:audit`
(`scripts/verifica-audit/index.js`, ora in CI) confronta ogni advisory
high/critical con un'allow-list esplicita — le due di xlsx, ciascuna col
motivo e il file che la mitiga — e fallisce su qualunque altra. Dettagli in
`docs/SICUREZZA.md` §10.

**B-3 · la zona cieca di un solo livello di import dinamici, resa visibile.**
`verifica:bundle` guarda solo gli import dinamici dell'entry, di proposito:
un chunk lazy che ne importasse staticamente un altro oggi lazy si
fonderebbe senza che nessuna delle quattro soglie se ne accorga. Aggiunta una
quinta misura informativa, senza soglia: la taglia propria di ogni chunk
lazy e quella della sua chiusura statica OLTRE la base comune (react,
VoyageDesk, supabase, api — già gated altrove, e che altrimenti
dominerebbero ogni riga nella stessa misura nascondendo lo spostamento da
mostrare). Uno spostamento fra le due cifre di un chunk, o un chunk che
sparisce dall'elenco perché fuso in un altro, si vede nel diff dell'output
di CI.

## Audit su stato e flusso dati del 28 agosto — suggerimento strategico n. 2, e con lui A-2 e A-3

> Il secondo intervento chiude i due rilievi di alta priorità che sono lo stesso
> fatto: l'invariante «per un id con una scrittura in volo vince SEMPRE la riga
> locale» è scritta bene, è testata, e copre **tre entità su cinque**.

**Perché non se n'era accorto nessuno per un anno.** L'invariante non sta in una
funzione sola: sta in **due metà** che vivono in file diversi — il reducer che
FONDE (`fondiScrittureInVolo` nel `SET_*`) e il registry che MARCA (`entityId`
nelle entry che mutano quell'entità). E le due metà si guastano in silenzio,
ciascuna facendo *sembrare fatta* l'altra: una fusione senza marcatura gira su
una mappa sempre vuota — si legge nel reducer, si cita in review, non protegge
nulla — e una marcatura senza fusione riempie una mappa che nessuno consulta.
Nessuna delle due produce un errore. Sul team mancavano **entrambe**, e non
c'era neanche una metà a fare da indizio dell'altra.

**A-3 · il team.** `SET_TEAM` fonde, e le cinque entry (`UPDATE_TEAM_MEMBER`,
`APPROVE_TEAM_MEMBER`, `REMOVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`,
`UPDATE_OWN_PROFILE`) dichiarano `entityId`. Aggiungerne una sola non avrebbe
cambiato niente. La posta è più alta che sulle altre tre entità: `state.team` è
il dato da cui `AppDataContext` costruisce `io`/`per`, quindi una riga riportata
indietro da un refetch concorrente non è un campo sbagliato a schermo — è una
disattivazione che si annulla da sola sopra il toast verde che la dà per
riuscita, o un ruolo appena revocato che torna. La firma di `entityId` è
cresciuta a `(action, state, uid)`, la stessa di `normalize`: l'ha richiesta
`UPDATE_OWN_PROFILE`, l'unica mutazione dell'app il cui **soggetto non sta nel
payload** — la riga scritta è sempre quella dell'utente loggato.

**A-2 · il feed notifiche, e la copia che non è stata scritta.** La campanella
ha ora il proprio registro delle scritture in volo, e la fusione **non è una
copia locale**: è `fondiScrittureInVolo` importata da `state/pendingWrites.js`.
La `fondi` che il rilievo abbozzava *era* quella funzione riscritta a mano,
semantica per semantica — sarebbe stata la quarta copia di un'invariante che
quel modulo esiste per tenerne una, che è letteralmente la frase con cui si
apre. Il registro è un **contatore** e non un booleano («segna letta» e
«elimina» si sovrappongono sulla stessa riga, e uno smarcamento che azzerasse
l'altra riaprirebbe la finestra a metà strada), e
`markChatNotificationsRead` è rientrato nell'hook come
`markReadForConversation`: scriveva il feed dal di fuori via `setNotifications`,
quindi era l'unico ingresso che il registro non poteva vedere. Spostarlo non è
un riordino — rende la protezione una proprietà del feed invece di qualcosa che
ogni chiamante deve ricordarsi.

**Il presidio, che è la parte che dura — e non è quello proposto.** Il
suggerimento chiedeva un test che enumerasse le tabelle pubblicate su
`supabase_realtime`. Guardando l'elenco vero, quell'enumerazione avrebbe avuto
bisogno di eccezioni entro la prima riga: delle quattordici tabelle, tre non
hanno alcuno stato in blocco, tre sono il modulo Liste che non passa dal
reducer, e due — `categories`, `message_templates` — hanno sottoscrizioni
**`senzaCanale`**, cioè nessun evento altrui che ne faccia ripartire il refetch.
Il predicato che regge senza eccezioni è più stretto: `scrittureInVoloAMeta`
(`verifica:convenzioni`, atteso **0**) verifica che **nessuna delle due metà
esista senza l'altra**, con il perimetro derivato dal codice invece che
dichiarato a mano. Sesto controllo con atteso 0.

⛔ **Due cose dichiarate invece che taciute.** I feed fuori dal reducer non
passano da alcun `SET_*` e lì non si vedono: per questo `conversations` —
l'ultimo stato in blocco dell'app senza fusione, con `chatCommands` che crea,
rinomina e fissa in ottimistico — è registrato come **rilievo aperto** sotto A-2
e non chiuso di straforo né iscritto fra le eccezioni. E il controllo non
pretende che ogni mutazione dichiari `entityId`: quattro entry mutano in blocco
senza marcare (`EMPTY_TRASH`, `UNDO_LAST_ACTION`, `RENAME_CLIENT_IN_TASKS`,
`RESTORE_BACKUP`) e sono quattro decisioni diverse — pretenderlo avrebbe aperto
subito la lista di eccezioni che questo repository vieta.

**Verifica.** 29 casi nuovi (1866 passati, 23 saltati su 151 file), di cui
**nove verificati contro il codice precedente**: quattro sulla sostituzione
secca di `SET_TEAM`, quattro sul reload che sostituiva l'elenco delle notifiche,
uno su un registro a booleano invece che a contatore. `npm run lint`,
`verifica:tipi` e `verifica:convenzioni` (53 controlli) senza divergenze.

---

## Audit su stato e flusso dati del 28 agosto — suggerimento strategico n. 1, e con lui M-1, M-3 e B-2

> Il documento nasce con otto rilievi, nessuno critico. Il primo intervento non
> chiude i tre di alta priorità ma il suggerimento strategico n. 1, perché è
> quello che chiude una **classe** invece di tre file: le tre priorità Medie e
> Basse erano tutte la stessa cosa vista da tre punti.

**Il fatto che teneva insieme M-1, M-3 e B-2.** Il progetto ha tre risposte alla
domanda «la risposta è arrivata tardi, la scarto?» — `isCurrent()` per chi
ricarica su evento, `useIsMounted()` per chi ha un `await` in un gestore,
`useCaricamento()` per chi carica in un effetto — e solo la terza copre **due**
corse: lo smontaggio *e* il cambio di dipendenza. Tre punti dell'app coprivano
metà: `TaskAttachments` su `taskId`, `ClienteListePanel` su `cliente.id`, e in
`useAppHydration` i due caricamenti su richiesta, che non condividevano alcuna
generazione con il reload della sottoscrizione.

**M-1 e B-2 · i due pannelli passano da `useCaricamento`.** E la ragione per cui
non ci erano già passati era il **primitivo, non i due file**: l'hook non
esponeva un setter, quindi un pannello con mutazioni ottimistiche avrebbe dovuto
tenere una seconda copia del dato accanto alla sua — due sorgenti di verità per
la stessa lista, cioè un difetto peggiore di quello da chiudere. Ora c'è
`imposta`, per gli scostamenti **locali dopo** il caricamento, con il ⛔ scritto
accanto: se il valore viene dalla rete, viene da `carica`. Due cose trovate
strada facendo: `{ data: null, error: null }` è un dato valido per l'hook (il
`data || []` del caricamento a mano non era difensivo, era la normalizzazione, e
andava spostata dentro `carica`), e il conteggio `ALLEGATI (3)` in testata aveva
lo stesso difetto dell'elenco un livello più su — restava quello del task
precedente mentre il nuovo caricava, contraddicendo il «Caricamento…» sotto.

**M-3 · una generazione per FETTA, non per effetto.** `genTask` e `genClienti`,
in AND con `isCurrent()` — che dice un'altra cosa: quello ordina le richieste
dello stesso effetto, questa tutte quelle che finiscono nella stessa `action`.
Le due metà che il rilievo non aveva viste sono però quelle che contano.
**Il turno lo consuma chi SCRIVE, non chi parte**: «vince chi è partito per
ultimo» — la forma che il rilievo proponeva — sbaglia il caso della richiesta
più recente che *fallisce*, che non porta dati e scarterebbe comunque quella più
vecchia che i dati ce li ha, trasformando un errore transitorio in una perdita.
Il contatore ha quindi `emesse` e `scritte`, e il turno si consuma dopo aver
gestito l'errore. E **chi consegna il corpus chiude l'attesa, chiunque dei due
sia.** Il ramo «sono stale» non può
chiudere il flag — lo chiuderebbe mentre il corpus è ancora in volo, cioè
mostrerebbe un Archivio incompleto come completo — né lasciarlo alzato, o
sarebbe uno scheletro perpetuo. I due flag hanno quindi smesso di significare
«la MIA richiesta è in volo». La fabbrica `idratazione` ha preso due opzioni
generiche (`gen`, `alTermine`) invece di essere aggirata, che avrebbe riaperto
M-1 del 26 agosto.

**Il presidio, e perché NON è una regola ESLint.** Il rilievo lo proponeva in
`eslint.config.js` e non si può: il predicato è **relazionale** — «il file
importa `useIsMounted` *e* chiama `useEffect(`» — mentre `no-restricted-syntax`
valuta un nodo per volta, e un selettore sul solo import segnalerebbe i quattro
usi legittimi nei gestori, cioè il caso da permettere. È il quinto controllo con
atteso **0** di `verifica:convenzioni`. ⚠️ **E ha trovato subito un caso che il
rilievo dava per inesistente**: `useSalvataggio.js` importa `useIsMounted` per il
proprio gestore e ha un `useEffect` che tiene fresco un ref — nessun
caricamento, nessuna corsa. La risposta non è stata un'eccezione nominata («un
controllo con una lista di eccezioni che cresce ha smesso di controllare») ma un
**perimetro dichiarato**: `src/components/**`, lo stesso confine che
`eslint.config.js` traccia per le entità dello stato, perché `src/hooks/` è il
layer in cui gli effetti sono la materia e non un modo di caricare. Il perimetro
è presidiato dalla propria **non-vacuità** — solleva se nessun componente
importa più `useIsMounted`, o se nessuno importa `useCaricamento` — e non da un
numero di file scritto a mano, che sarebbe rosso a ogni gestore legittimo nuovo.

**Quattordici casi nuovi, sei dei quali verificati contro il codice precedente**
(`taskAttachmentsCorse.test.jsx`, i due versi della corsa in
`storicoTask.test.jsx` e `clientiRealtime.test.jsx`, e il caso di
`guardiaDiSoloSmontaggio` che riproduce la forma esatta di `TaskAttachments`
prima della correzione). Gli altri presidiano il modo in cui la correzione
stessa potrebbe rompersi — il flag che resta alzato — o accettano la forma
corretta. I sette casi del presidio stanno in un file proprio: portavano
`verificaConvenzioni.test.js` da 485 a 563 righe, oltre `max-lines`, che dal 23
agosto non ha deroghe.

⟦A-1, A-2, A-3, M-2 e B-1 restano aperti.⟧


## Audit di architettura del 15 e 16 agosto — chiusi dodici dei quattordici rilievi rimasti

> Il documento del **16 agosto** passa da 6/12 a **12/12**; quello del **15
> agosto** da 4/12 a **10/12**. Due rilievi restano aperti di proposito, e la
> ragione è scritta in fondo: non sono stati marcati chiusi.

### Audit del 16 agosto — tutti e sei i rilievi Bassi

**B-1 · `users` non si rilegge al mount.** `saltaPrimoCaricamento` su
`useDebouncedTableSubscription` e `teamIniziale` passato a `useAppHydration`:
`AuthContext.loadProfile` legge già `users` per intero — deve, perché decide se
montare l'app — e l'idratazione la rileggeva identica un round-trip dopo. Il
parametro NON «tocca tutti e nove i consumatori» come diceva il rilievo: è
opzionale con default, e gli altri otto non cambiano di una virgola. Il primo
fetch faceva però **due** cose oltre a leggere — chiudere il flag di
caricamento e seminare `ultimoTeam` — e chi lo salta se le assume entrambe:
senza la prima, la vista Team girerebbe per sempre sotto uno scheletro.

**B-2 · era già chiuso.** Il value di `AuthContext` è `useMemo` da quando il
suggerimento strategico n.2 di quello stesso documento ha introdotto la regola
`VIETATO_CONTEXT_VALUE_LETTERALE`, che non ammette eccezioni e che è nata
proprio da quel file. Non serviva codice: serviva rileggere. È il difetto che
B-7 chiude per gli audit interi, in scala ridotta.

**B-3 · le due letture che crescono sono paginate.** `Notices.list` e
`Conversations.listMine` passano da `fetchAllRows`; le altre cinque restano
`select` nude ed è la decisione giusta (team 7 righe, categorie 12, template 4).
L'ordinamento chiuso su una colonna unica serviva in entrambe: né
`pinned`+`created_at` né `updated_at` lo sono. Corretta nello stesso commit la
frase del 12 agosto in `docs/CLAUDE.md`, che era più larga di ciò che era stato
fatto.

**B-4 · la soglia è un controllo, non un commento.** `Messages.listAll()`
rilegge il corpus intero a ogni evento, ed è una decisione con una soglia
(~1500 messaggi) — rimisurata: **13 in produzione**, 12 negli ultimi trenta
giorni, cioè una decina d'anni di margine. Il problema non era la decisione ma
dove viveva la soglia: un commento non scade, e chi lo legge fra due anni non
sa se il numero accanto sia ancora vero. Ora è una costante che il codice
controlla e che, superata, nomina il lavoro rimandato e la funzione già pronta
a farlo.

**B-5 · la finestra «Urgenti» invecchia.** `hooks/useTickLento.js`, col tempo
come dipendenza dichiarata invece che lettura nascosta. **Il rilievo era più
stretto della realtà, e il secondo punto l'ho introdotto io**: `UrgentQueue`
ricalcolava a ogni render finché M-2 dell'audit performance/UX non l'ha
memoizzato per far funzionare la finestra sull'elenco — quella memoizzazione è
giusta e ha congelato l'ora, propagando B-5 dentro il commit che chiudeva un
altro rilievo. Passano ora dal tick anche i conteggi dei chip 24/48/72h, che
dicevano «12» sopra una lista che ne mostrava 11.

**B-6 · niente più render periodici a chat chiusa.** L'ageing della presenza è
sceso in `ConversationList` e `ConversationView`, gli unici due componenti che
mostrano un pallino: il timer esiste solo mentre sono montati e sveglia solo
loro. `usePresence` conserva l'heartbeat dei 30 s, che è la scrittura del
proprio stato e non un render. Spostandolo è emerso che il file aveva un
`cancelled` dichiarato e mai applicato al proprio `await`: ora lo applica.

### Audit del 15 agosto — sei rilievi su otto

**M-3 · il guscio compone e basta.** `hooks/useShellUi.js` (lo stato di UI
effimera) e `state/AppProviders.jsx` (l'annidamento dei cinque provider);
`VoyageDeskInner` scende da 544 a 486 righe. L'hook espone **comandi e non
setter**: esporre `setShowBulkModal` rimetterebbe nel JSX le arrow inline che
sono prop nuove a ogni render, cioè il difetto di ST-1 riaperto dal
refactoring che doveva ordinare il file. E chiudere i pannelli al cambio utente
è UNA transizione, non tre `setState` da ricordare insieme.

**B-1 · un solo modo di dire «chi è admin».** Migrazione
`20260818092812_notify_user_pending_ruolo_esatto`, **applicata in produzione**:
`lower(role) = 'admin'` → `role = 'admin'`, l'ultimo gate non allineato agli
altri tre. Verificato prima di applicare che i due predicati selezionino le
stesse righe. **Precisazione al rilievo**: non è un enum ma un CHECK constraint
su una colonna `text` — l'effetto oggi è identico, ma un CHECK si può allargare,
e quel giorno il predicato divergerebbe in silenzio.

**B-2 · la premessa era sbagliata, non la conclusione.** Il grant di
`get_migrazioni_applicate()` ad `anon` **resta**, e `SICUREZZA.md` porta la
correzione a vista invece che riscritta in silenzio. Il rilievo non poteva
vederlo: i consumatori sono **due**, e il secondo non può autenticarsi per
costruzione — `keep-supabase-warm.yml` pinga questa RPC proprio perché dalla
revoca dei GRANT `anon` non ha più una tabella da interrogare.

**B-3 · gli stati in macchine a stati, dove serve.** `ClientImportModal` e
`AdvancedSearchPanel` da 10 `useState` a 1, `ClientiView` da 10 a 6. **E il
rischio non era solo di manutenzione**: convertendo il primo è emerso un
difetto già in produzione — `handleFile` scriveva il nome del file nuovo senza
azzerare righe, colonne e mappatura del precedente, quindi un secondo file
illeggibile lasciava a schermo l'anteprima del PRIMO sotto il nome del SECONDO,
pronta per essere importata. `ProfileEditor` **non è stato toccato**: era già
passato da questo esercizio (17 → 10) e i dieci rimasti portano una
classificazione motivata riga per riga di cosa è indipendente per scelta.

**B-5 · `npm audit fix`.** Da 6 high a 1: cinque patch/minor su dipendenze di
sviluppo, nessun major, nessuna riga di `package.json` oltre il lockfile.

**B-6 · `checkJs` incrementale, e verificato.** `jsconfig.json` su `src/lib/` e
`src/state/`, **più `npm run verifica:tipi`** — perché un jsconfig che nessuno
esegue vive solo nell'editor di chi se l'è configurato. È a **zero**: i 54
errori dell'attivazione chiusi nello stesso commit, di cui 37 con una causa
sola (`pushToast` coi tre campi dedotti obbligatori dalla destrutturazione) e
uno che è il rilievo stesso in miniatura — `TeamMember`, il tipo che il JSDoc
di `permissions.js` citava da sempre senza che esistesse.

### I due che restano aperti

**A-1 (due architetture dati parallele) — residuo chiuso, rilievo no.**
`listePersistence.js` era l'unico dei tre registry a non usare
`lib/esitoScrittura.js`, cioè la terza copia cieca che quel modulo esiste per
togliere: ora la importa (blindato da `src/test/convergenzaRegistry.test.js`).
Le due strade che restano — entry di `PERSISTENCE`, idratazione unificata —
contraddicono una decisione di design dichiarata nel codice, su un modulo che
gestisce saldi e movimenti finanziari: farle in una sessione di smaltimento
arretrato ripeterebbe in grande l'errore che la revisione del rilievo documenta
in piccolo. Serve prima un modo per il registry di DICHIARARE che una entry non
fa update ottimistico.

**B-4 (CVE `xlsx`) — bloccato dall'ambiente.** Quinta conferma che
`cdn.sheetjs.com` è irraggiungibile (403) e nessun fix su npm; dopo B-5 è
l'unica high rimasta, con le mitigazioni in piedi su entrambi i punti
d'ingresso. Non marcato «accettato» di proposito: un rilievo bloccato
dall'ambiente e uno accettato per decisione sono due cose diverse.

File nuovi: `src/hooks/useTickLento.js`, `src/hooks/useShellUi.js`,
`src/state/AppProviders.jsx`, `jsconfig.json`,
`supabase/migrations/20260818092812_notify_user_pending_ruolo_esatto.sql`,
`src/test/tickLento.test.jsx`, `src/test/convergenzaRegistry.test.js`.

Lint 0, **1488 test verdi** (+25), `verifica:tipi` 0, `verifica:convenzioni` 25
controlli senza divergenze, entry 14,47 kB gzip su 21.

Dettaglio completo in
[`AUDIT_ARCHITETTURA_2026-08-15.md`](AUDIT_ARCHITETTURA_2026-08-15.md) e
[`AUDIT_ARCHITETTURA_2026-08-16.md`](AUDIT_ARCHITETTURA_2026-08-16.md).

---

## Audit performance/UX del 16 agosto (secondo passaggio) — chiusi gli ultimi sei rilievi (M-2, M-3, B-1, B-2, B-3, B-4)

> Il documento passa da 5/11 a **11/11 chiusi**. Erano i sei rimasti dopo A-1,
> A-2, M-1, M-4 (16 agosto) e A-3 (17): due di priorità Media e i quattro
> Bassi. Ogni rilievo porta ora nel documento la propria sezione «Correzione
> (applicata)» con ciò che è emerso implementando — in quattro casi su sei il
> rilievo era più stretto della realtà o indicava una strada che non ha retto
> alla prova, e una voce è stata respinta.

**M-2 · La finestra sugli elenchi, da 2 viste su 7 a tutte e nove.** La
meccanica è ora una sola — `src/hooks/useFinestra.js` — con il piede
dell'elenco in `src/components/ui/MostraAltri.jsx`. Ci passano Archivio,
Cestino e le cinque code della Dashboard, che montavano l'array intero (209
card d'archivio oggi, +4 al giorno), più `ClientiView` e `ListeViaggio`, che
avevano due copie identiche del pattern: migrate anche loro, così non resta
una seconda forma canonica accanto a quella nuova. Passo 24 per Archivio e
Cestino, **10** per le code (`QUEUE_PAGINA`): una coda è una *card* della
dashboard, non una pagina.

Tre cose che il rilievo non poteva vedere. Il riazzeramento **non** è un
`useEffect` con `deps` passato dal chiamante: sarebbe un array di dipendenze
dinamico, che `react-hooks/exhaustive-deps` non sa verificare su una regola
tenuta a zero warning per scelta, e correggerebbe la finestra *dopo* aver
committato un render con quella vecchia — è un adeguamento di stato **in
render**. Le due frasi del piede le compone il chiamante, perché «Mostra
altri» e «Mostra altre» dipendono dal nome che segue e nell'app *task* è
femminile nell'Archivio e maschile nel Cestino. E la finestra si riazzera sui
**restringimenti**, non sull'identità dell'elenco: altrimenti un evento
realtime che aggiunge una riga la richiuderebbe sotto gli occhi di chi ha
appena premuto «mostra altri».

**M-3 · Ricerca indicizzata: 6,32 ms → 0,19 ms per battuta.**
`lib/searchUtils.js` espone `indicizza(...campi)` e `matchIndice(termini, idx)`,
con `matchTermini` scritta **sopra** le due: la semantica (apostrofi, ordine
delle parole, cognomi elisi) resta definita in un punto solo, e i test che la
fissano sono anche la prova che l'indice non l'ha cambiata — un caso nuovo
passa dieci query dai nomi reali per **entrambe** le strade e pretende la
stessa risposta. Indicizzano `ClientiView`, `Archive` e `ListeViaggio`.

Due scoperte. Nell'elenco liste il costo era il **doppio** del misurato:
`filtraListe` girava su quattro insiemi (attive, esaurite, tutte, cestino) a
ogni battuta, quindi le attive venivano normalizzate due volte per carattere
digitato, cointestatari inclusi — ora si filtra l'indice una volta e si
partiziona per stato. E l'Archivio non usava affatto `searchUtils`: cercava
con una sottostringa secca su `title + client + praticaRef`, cioè una
*seconda* definizione di «trovare», per cui «d amato» non trovava la task di
D'AMATO che la ricerca clienti trovava.

**B-1 · L'app fuori dal chunk d'ingresso: 72,46 → 14,47 kB gzip (−80%).**
`auth/AuthGate.jsx` monta `VoyageDesk` con `lazy()` e **prefetch avviato
subito**, in parallelo a `getSession()`: chi ha una sessione valida non paga
alcuna cascata, chi arriva al login non paga il parse dell'app che non ha
ancora aperto. First load 172,40 → **114,41 kB**. Il `Suspense` non aggiunge
una schermata: il fallback è la splash che `AuthGate` mostrava già.

Il prefetch porta un `catch` vuoto — senza, un chunk mancante sarebbe una
unhandled rejection *prima* che l'app serva, cioè lo stesso guasto raccontato
due volte; l'errore vero lo solleva il `lazy()` al mount, dove c'è il
boundary. Che qui è quello di **primo** livello e non `ViewErrorBoundary`: se
il chunk manca, manca l'app, e non esiste «il resto di Tullio continua a
funzionare» in cui rientrare. Le soglie di `verifica:bundle` **scendono con
la misura** (84 → 21 kB d'ingresso, 184 → 121 di first load, stesso margine
di +6 kB dichiarato lì): lasciarle dov'erano avrebbe significato 70 kB di
gioco che non intercettano più niente.

**B-2 · Il toast di successo si ritira quando il server smentisce.** Non per
messaggio come proponeva il rilievo — avrebbe richiesto dentro `fail()` una
tabella `tipo azione → frase di successo`, cioè una seconda copia dei messaggi
del reducer da tenere allineata su una quarantina di `pushToast`, e il primo
che divergesse fallirebbe in silenzio — ma **per azione**: ogni toast porta il
tipo che l'ha prodotto, marcato nel wrapper `reducer` che quel tipo ce l'ha
già sotto mano, e `RETRACT_TOASTS` toglie i soli toast *di successo* di
quell'azione. Gli errori non si ritirano (un rifiuto per permessi è un fatto
accaduto) e i successi di altre azioni restano (possono venire da una
scrittura andata a buon fine un attimo prima). Il ritiro va fatto sempre — la
compensazione copre solo le azioni che dichiarano `rollback` — e **dopo** il
rollback, o è lui a riportare indietro il toast appena ritirato.

Il reducer ha toccato il tetto di 550 righe e il numero **non è stato
alzato**: è uscita la politica della coda dei toast (dedup, cap, marcatura,
ritiro) in `src/state/toastQueue.js`, come già `activityLog.js`.

**B-3 · Gli ultimi quattro form fuori dalla validazione inline.**
`views/Trash.jsx`, `chat/NewConversationView.jsx`, `modals/bulk/TemplateTab.jsx`
e `liste/modals/EditListaModal.jsx` passano ora da `validaCampi` +
`FieldError`/`ariaCampo`, con il focus sul primo campo sbagliato in ordine
visivo e nessun `disabled` al posto del messaggio. I due con più condizioni
(nome gruppo + due membri; template + data evento) le dicono **una per una**.

Tre distinzioni che la conversione ha reso esplicite. `disabled` legato a una
scrittura **in volo** non è la variante vietata: è il freno al doppio invio, e
la sua ragione è già a schermo («⏳ Creazione…»). Un campo in **sola lettura**
dietro un consenso esplicito nemmeno — **`EditListaModal:51` era una voce
respinta del rilievo**: il nome titolare è `disabled` finché non si spunta
«rinomina in anagrafica», perché rinominarlo cambia l'anagrafica condivisa di
tutta l'agenzia; il difetto lì era il messaggio mandato in un **toast**, ed è
quello che è stato corretto. E su ciò che non è un controllo — l'elenco dei
membri — non si mette `aria-invalid`: il messaggio si annuncia da sé con
`role="alert"` mentre il focus lo porta sotto gli occhi.

**B-4 · `useMemo` su filtro, permessi e ordinamento.** Con `getVisibleTasks`
nelle dipendenze: arriva da `useAppData()`, il cui value è già `useMemo`,
quindi la memoizzazione regge invece di invalidarsi a ogni render. **Il
rilievo era più stretto della realtà**: lo stesso difetto era identico nel
Cestino (`trashed` + `editableCount`) e nelle cinque code, dove filtro e
ordinamento giravano a ogni render della Dashboard — memoizzati insieme,
perché è anche la condizione perché la finestra di M-2 non ricalcoli la
propria `slice` a vuoto.

**Documenti corretti nello stesso commit** (regola di `INDEX.md`): entrambe le
affermazioni di `docs/CLAUDE.md` che l'audit segnalava. La regola sugli
elenchi lunghi non descrive più due esempi che si leggevano come l'insieme —
nomina l'hook e le nove viste; e «non resta un solo call site fuori» dalla
validazione inline è ora **vera**.

File nuovi: `src/hooks/useFinestra.js`, `src/components/ui/MostraAltri.jsx`,
`src/state/toastQueue.js`, `src/test/finestraElenchi.test.jsx`.

Lint 0, **1463 test verdi** (+30), chunk d'ingresso **14,47 kB gzip su 21**,
first load **114,41 su 121**, `verifica:convenzioni` 25 controlli senza
divergenze.

Dettaglio completo in
[`AUDIT_PERFORMANCE_UX_2026-08-16_ii.md`](AUDIT_PERFORMANCE_UX_2026-08-16_ii.md).

---

## Suggerimento strategico n.3 (audit del 16 agosto) — il modulo Liste sotto il contratto realtime del core

> Stesso giorno, quarto commit. A-1 era il terzo rilievo consecutivo nato
> dall'architettura dati parallela del modulo Liste; questo chiude la
> lacuna che li univa tutti — il contratto `origin_client` del core, che nel
> modulo valeva come eccezione dichiarata su tre tabelle su tre.

**Migrazione `20260816110000_p_origin_modulo_liste`** (applicata in
produzione) — colonna `origin_client uuid` su `liste_viaggio`,
`movimenti_lista`, `lista_beneficiari` (628 + 5.573 + 0 righe esistenti,
tutte restate `NULL`), e **tredici** delle sedici RPC del modulo ricreate con
`p_origin uuid DEFAULT NULL` in coda alla firma (`drop function` +
`create function`, mai `create or replace`: un parametro in più cambia la
signature e produrrebbe un overload che PostgREST non saprebbe risolvere).
Le tre RPC lasciate fuori — `rimuovi_beneficiario_lista`,
`elimina_lista_definitivamente`, `reset_completo` — scrivono solo con
DELETE/TRUNCATE: un'origine su una riga che sta per sparire non è mai
attendibile (stessa regola per cui nessuna tabella è a REPLICA IDENTITY
FULL), quindi non hanno guadagnato un parametro che nessun corpo di funzione
avrebbe potuto usare. Gli INSERT su `clients` dentro tre di queste tredici
(cliente creato al volo) restano `origin_client = NULL` di proposito: il
modulo Liste non tocca mai `state.clients` del core, e taggarli con la
propria origine nasconderebbe il cliente nuovo a chi lo ha appena creato.

**Corretto nella stessa sessione**: il primo giro di drop+create ha
ereditato il default privilege dello schema, che concede EXECUTE ad `anon`
su ogni funzione nuova — un `revoke all ... from public` non basta, perché
`anon` ha un proprio ACL esplicito. Rilevato leggendo `pg_proc.proacl` in
produzione subito dopo la migrazione, corretto con una seconda migrazione
dedicata prima di proseguire, e la `revoke execute ... from anon` è stata
riportata nel file committato così una nuova applicazione da zero è corretta
al primo colpo.

**`src/components/liste/listeApi.js`** — tredici call site aggiungono
`p_origin: getClientId()`; i tre rimasti (`rimuoviBeneficiario`,
`eliminaDefinitiva`, `resetCompleto`) restano invariati, con un commento che
dice perché.

Test aggiornati (nessun test nuovo): `src/test/realtimeOriginContract.test.js`
(l'elenco `ECCEZIONI` è ora vuoto — le tre tabelle hanno `origin_client` come
tutte le altre), `src/test/verificaRpc.test.js` (firma reale di
`modifica_note_lista` con `p_origin` in coda).

Lint 0, **1368 test verdi** (invariato — solo asserzioni aggiornate),
`verifica:convenzioni` 20 controlli senza divergenze, bundle 171,15 kB gzip
di first load su soglia 184.

Dettaglio completo in
[`docs/AUDIT_ARCHITETTURA_2026-08-16.md`](AUDIT_ARCHITETTURA_2026-08-16.md#3-portare-il-modulo-liste-sotto-lo-stesso-contratto-realtime-del-core).

## Suggerimento strategico n.2 (audit del 16 agosto) — lint sul value dei Context

> Stesso giorno, terzo commit. A-2 era costato quattro livelli di
> propagazione da un `value={{…}}` letterale su un `ChatContext.Provider`;
> questo chiude la categoria invece del singolo caso.

**`eslint.config.js`** — nuova entry `no-restricted-syntax`,
`VIETATO_CONTEXT_VALUE_LETTERALE`: vieta `<X.Provider value={{…}}>` e
`value={[…]}` letterali su qualunque Context. Gemella di
`STILE_INLINE_COSTANTE` (lo `style={{…}}` costante) ma senza la sua
eccezione per gli oggetti "tutti letterali": qui anche un solo campo
derivato dallo stato non basta a far passare la regola, perché è
l'IDENTITÀ del value — non il suo contenuto — che ogni consumatore osserva,
ed è nuova a ogni render comunque.

**`src/auth/AuthContext.jsx`** — l'unica violazione reale (B-2): `value`
era un oggetto letterale ricostruito a ogni render, e le otto funzioni che
porta (`signIn`/`signOut`/`resetPassword`/`resendConfirmation`/
`updatePassword`/`deleteAccount`/`refreshTeam`/`retryInit`) erano a loro
volta funzioni nuove a ogni render — un `useMemo` sul solo `value` non
sarebbe bastato, le sue dipendenze sarebbero cambiate comunque. Le otto sono
passate a `useCallback` (tutte `[]`, tranne `refreshTeam` che dipende da
`session`/`loadProfile`), poi `value` a `useMemo` sulle dipendenze vere.

Verificato: lint 0 (i restanti sei Provider del progetto erano già
`useMemo` o costanti di modulo — nessun altro file toccato), **1368 test
verdi**, `verifica:convenzioni` 20 controlli invariati.

Dettaglio completo in
[`docs/AUDIT_ARCHITETTURA_2026-08-16.md`](AUDIT_ARCHITETTURA_2026-08-16.md#2-una-regola-di-lint-per-il-value-di-un-context).

## Suggerimento strategico n.1 (audit del 16 agosto) — merge per riga

> Stesso giorno del punto precedente. Il primo dei tre suggerimenti ad alto
> impatto dell'audit stato/flusso dati, fatto invece di lasciato scritto.

**`src/hooks/useDebouncedTableSubscription.js`** — nuova opzione `applyRow
(tabella, payload) => boolean`: se ritorna `true`, l'evento non entra mai nel
debounce di reload — nessuna query parte, né subito né coalescendo con
un'altra. Additiva: i nove call site esistenti, che non la passano, restano
bit-per-bit invariati.

**`src/state/pendingWrites.js`** — `applicaRigaRealtime`, gemella di
`fondiScrittureInVolo` per un evento singolo invece che per un refetch
intero: stessa invariante, «per un id con una scrittura in volo vince SEMPRE
il locale».

**`src/state/reducer.js`** — tre nuovi case, `MERGE_TASK_ROW`/
`MERGE_NOTICE_ROW`/`MERGE_CLIENT_ROW`. `MERGE_TASK_ROW` preserva
`comments`/`history` già in stato: il payload realtime della tabella `tasks`
non li porta (vivono in due query separate), e un merge totale li avrebbe
azzerati a ogni evento.

**`src/hooks/useAppHydration.js`** — `applyRow` collegato sulle sottoscrizioni
di `tasks`, `notices` e `clients`: un evento su una di queste tre tabelle non
ricarica più l'entità intera (`Tasks.list`/`Notices.list`/`Clients.list`),
applica la riga. Non toccate — per ragioni diverse, tutte scritte nel commento
in cima al file: `comments`/`task_history` (restano sul reload selettivo
esistente), `categories`/`team`/`messageTemplates` (tabelle piccole, nessun
risparmio misurabile), l'idratazione iniziale e la ripresa dopo un buco di
connessione (`tabelle = null`, sempre reload completo per costruzione).

Perché ora costa meno: prima, un singolo campo cambiato su un task faceva
girare `TASK_SELECT_WITH_COMMENTS` — join sui nomi, cestino incluso, non
paginata — per ogni client connesso; un avviso o una scheda cliente
modificati ricaricavano l'intera bacheca o l'intera anagrafica. Il costo
cresceva col prodotto fra righe e frequenza di scrittura; ora un evento su
queste tre tabelle non genera più alcuna query.

Test nuovi: `src/test/realtimeApplyRow.test.jsx` (il contratto sull'hook,
isolato dal resto), `src/test/realtimeRowMerge.test.jsx`
(`applicaRigaRealtime` allo stato puro + i tre case reducer, inclusa la
protezione delle scritture in volo), più l'estensione di
`src/test/realtimeGranularita.test.jsx` con le dipendenze reali del progetto —
che ha anche richiesto riscrivere due asserzioni preesistenti («un evento su
tasks ricarica tutto», «tasks vince la finestra di debounce di comments»):
descrivevano il comportamento vecchio, e con questa correzione sarebbero
diventate la specifica di un difetto.

Lint 0, **1368 test verdi** (era 1337), bundle 171,06 kB gzip di first load
su una soglia di 184 (+0,03 kB: il costo del codice nuovo, nessun confine
lazy rientrato in eager), `verifica:convenzioni` 20 controlli senza
divergenze.

Dettaglio completo in
[`docs/AUDIT_ARCHITETTURA_2026-08-16.md`](AUDIT_ARCHITETTURA_2026-08-16.md#1-ricaricare-la-riga-non-il-corpus--un-merge-per-riga-in-usedebouncedtablesubscription).

## Audit del 16 agosto — stato/flusso dati, performance e UX (punti 3, 4, 5)

> Seguito dichiarato dell'audit del 15 agosto (punti 1 e 2). Dodici rilievi,
> **nessuno critico**, sei chiusi nello stesso giorno. La diagnosi comune ai
> tre più gravi: le regole del progetto valgono dove qualcuno le ha applicate,
> e i due sottosistemi che non passano dal reducer — chat e modulo Liste — sono
> quelli in cui sono arrivate ultime.

### 🟠 A-1 — la cointestazione di una lista non arrivava agli altri client

**`supabase/migrations/20260815235446_lista_beneficiari_realtime.sql`** (NEW,
**applicata in produzione e verificata**) — `lista_beneficiari` entra nella
publication `supabase_realtime`. **`src/components/liste/useListeData.js`** — la
tabella entra nella sottoscrizione, e il ramo di reload parziale è riscritto in
positivo (`solo movimenti_lista ⇒ solo saldi`).

Nessuno dei due percorsi emetteva un evento: la tabella non era pubblicata e le
due RPC che la scrivono non toccano la riga padre. Siccome `LISTA_SELECT`
incorpora i cointestatari e `intestazioneLista()` ne compone la testata —
quella del riepilogo cliente e della copia agente — chi aggiungeva un
cointestatario era l'unico a vederlo, per tutti gli altri fino al reload della
pagina. Tabella a 0 righe in produzione: chiuso prima che costasse qualcosa.

### 🟠 A-2 — la chat si ridisegnava a ogni toast

**`src/VoyageDeskInner.jsx`**, **`src/components/chat/ChatPanel.jsx`** —
`markChatNotificationsRead` dipendeva da `notif` (oggetto letterale ritornato da
`useNotifications`, nuovo a ogni render) invece che dal suo `setNotifications`:
da lì l'instabilità arrivava a `onConversationRead`, quindi al `useMemo` di
`commands`, che non ha mai potuto saltare un render pur dichiarando in un
commento di farlo. Sotto, `ChatPanel` non era `memo` e il value del suo
`ChatContext` era un letterale nel JSX, quindi ogni bolla di messaggio si
ridisegnava insieme a lui — a ogni carattere digitato nella ricerca globale, a
ogni toast, a ogni tick di presenza. Corretto in tutti e quattro i punti;
`src/test/chatMemo.test.jsx` (NEW) **verificato rosso senza la correzione**.

### 🟡 M-1 — rete dentro l'updater di `setState`, nella presenza

**`src/hooks/usePresence.js`** — il toggle "Occupato" faceva
`UsersAPI.setPresence` e una seconda `setState` dentro l'updater di
`setMyBusy`: due scritture di presenza per click in StrictMode. È testualmente
la regola che `chatCommands.js` porta a lettere maiuscole dopo lo stesso
difetto nella chat. `src/test/presenceToggle.test.jsx` (NEW).

### 🟡 M-2 — il salvataggio del profilo non si vedeva e si poteva ripetere

**`src/components/modals/ProfileEditor.jsx`** — era l'unica delle tre
operazioni asincrone della modale senza stato in volo, ed è la più lenta
(carica l'avatar e poi scrive): nessun feedback per tutta la durata
dell'upload, e un secondo click ripartiva da capo. Ora `disabled` +
`aria-busy` + «Salvataggio…» per la sola durata della scrittura — non da
confondere con il bottone spento a form incompleto, che resta vietato.

### 🟡 M-3 — la validazione inline valeva per 3 form su 8

**`NoticeEditorModal`**, **`AddCategoryModal`**, **`AdminCategoriesTab`**,
**`MessageTemplatesSection`**, **`AdminTeamTab`** — due uscivano con il bottone
spento, tre con un `return` muto: si premeva "Salva" e non succedeva niente.
Tutti e cinque passano ora da `validaCampi` + `<FieldError>` + `ariaCampo` +
focus sul primo campo sbagliato. Gli style inline dinamici scendono da 335 a
333.

### 🟢 B-7 — due audit fuori dal registro di `verifica:convenzioni`

**`scripts/verifica-convenzioni/index.js`** — mancavano questo audit e quello
del 15 agosto, il più aperto: il loro `⟦stato: N/M chiusi⟧` non lo verificava
nessuno. Aggiunti entrambi, e la prima esecuzione ha subito trovato una
divergenza reale (la tabella del 15 agosto non marcava i quattro rilievi
chiusi con il `✔` che lo script conta). 20 controlli, nessuna divergenza.

**B-1…B-6 restano aperti o dichiarati** e sono elencati in
[`docs/AUDIT_ARCHITETTURA_2026-08-16.md`](AUDIT_ARCHITETTURA_2026-08-16.md).

Lint 0, **1337 test verdi** (era 1324), first load 170,63 kB gzip su una soglia
di 184.


## Conferme, errori e validazione: chiude le criticità #8–#12

> Stesso branch. Cinque rilievi di media/bassa priorità, tutti su cosa l'app
> dice all'utente nei momenti in cui non sta mostrando dati.

### 🗨️ Criticità #8 — via i modali bloccanti del browser (21 call site, 14 file)

**`src/state/ConfirmContext.jsx`** (NEW) — `ConfirmProvider` + `useConfirm()`:
`if (!(await conferma({ title, body, cta, danger }))) return;`.
**`src/components/ui/ConfirmDialog.jsx`** (NEW) — la finestra, costruita su
`ui/Modal.jsx` (portale, Esc, `role="dialog"`), `layer="modalFull"` perché una
conferma nasce quasi sempre da un altro modale.

Perché non era cosmetica: `confirm()` blocca il thread (niente render, niente
timer, eventi realtime in coda), non è nella lingua né nel tema dell'app, non
distingue un'azione distruttiva da una innocua e — soprattutto — è
**sopprimibile**: con "impedisci a questa pagina di creare altre finestre di
dialogo" ritorna `false` senza chiedere nulla, e da quel momento eliminare un
allegato smette di funzionare in silenzio.

- 17 `window.confirm` → `useConfirm()`, con `danger: true` sulle azioni
  irreversibili (focus iniziale su **Annulla**: un Invio per abitudine non
  svuota il cestino).
- 4 `alert()` → toast: erano errori veri (agente con task assegnati, categoria
  in uso, ripristino backup fallito, immagine oltre i 5 MB).
- `AdminIOTab`: il secondo confirm elencava fino a dieci problemi del backup in
  una finestra di sistema che non sa formattare né far scorrere il testo.

### 🐞 Criticità #9 — lo stack non è per l'utente

**`src/components/ui/ErrorDetails.jsx`** (NEW) — una policy sola per i **tre**
boundary (globale, di vista, di overlay), che avevano tre riquadri copiati:
in DEV messaggio + `componentStack`; in produzione un **codice di segnalazione**
(`codiceSegnalazione()` in `lib/errorReporting.js`, formato `VD-<istante>-<4>`),
col dettaglio completo in `console.error` accanto allo stesso codice.

Rumore per chi legge, e una mappa della struttura interna dell'app mostrata a
chiunque guardi lo schermo o riceva uno screenshot.

### ✍️ Criticità #10 — validazione inline, con ARIA e focus

**`src/lib/validators.js`** — da un solo controllo (l'email) a validatori
componibili (`obbligatorio` / `emailValida` / `interpretabile`) + runner
(`validaCampi`, `primoCampoInvalido`).
**`src/components/ui/FieldError.jsx`** (NEW) — messaggio `role="alert"` sotto il
campo + `ariaCampo(id, errore)` che sparge `aria-invalid` e `aria-describedby`
insieme (una senza l'altra non serve).

Applicata a `AddMovBox` (era un toast che nominava tre campi senza dire quale),
`ClienteModal` e `ProfileEditor` (dove il nome mancante usciva **in silenzio**).
I bottoni di salvataggio non sono più disabilitati dal campo mancante: un
bottone spento non dice cosa manca. L'errore si spegne appena si tocca il campo.

### ⏱️ Criticità #11 — `await` in un componente smontabile

**`src/hooks/useIsMounted.js`** (NEW) — `if (!montato()) return;` dopo l'await,
stesso contratto di `isCurrent()` in `useDebouncedTableSubscription`. Applicato a
`ClienteModal` (dove `onSave` termina con `setModal(null)`, quindi lo smontaggio
è l'esito NORMALE del salvataggio), `TaskAttachments` e `ClienteListePanel`.

### 🔊 Criticità #12 — l'attesa era muta

**`src/components/ui/LazyFallback.jsx`** — `role="status"` + `aria-live` + un
testo visibile; il cerchio animato diventa `aria-hidden`. Uno spinner muto e una
pagina rotta si assomigliano molto, e con uno screen reader non si distinguono.

### ✅ Test

29 nuovi (969 verdi in totale, 84 file):
`confermeApp.test.jsx` (9), `validazioneInline.test.jsx` (11),
`attesaEdErrori.test.jsx` (9). Riscritto `chatConvDelete.test.jsx`: non pilota
più una spia su `window.confirm` ma clicca i pulsanti della finestra vera — un
test più forte, perché verifica che la domanda a schermo sia leggibile e che i
due pulsanti facciano due cose diverse.

## Stati di attesa onesti: loading per tutte le entità + stato di rete (criticità #6 e #7)

> Branch `claude/loading-states-offline-detection-lyu3gv`. Due difetti della
> stessa famiglia: l'app affermava con sicurezza cose che non era in grado di
> sapere. "Nessuna task in scadenza" mostrato mentre i dati stanno ancora
> arrivando, e la stessa schermata mostrata identica quando la rete non c'è più.

### ⏳ Criticità #6 — un flag di caricamento per ogni entità

**`src/hooks/useAppHydration.js`**
- Il flag esisteva per i soli clienti (`crmLoading`, sessione 23). Ora `loading`
  è un oggetto con una chiave per entità — `tasks` / `notices` / `categories` /
  `team` / `clients` — e `crmLoading` ne resta l'alias storico.
- Ogni flag si chiude sia sul **successo** sia sull'**errore** del primo fetch:
  uno scheletro perpetuo è disonesto quanto un vuoto dichiarato troppo presto.
- L'identità dell'oggetto `loading` non cambia ai reload realtime (le viste sono
  `memo`: un oggetto nuovo le sveglierebbe tutte per nulla).

**`src/components/ui/SkeletonCards.jsx`** — nuovi `minWidth` (allinea la griglia
dello scheletro a quella che sostituisce: 280px code, 240px bacheca, 340px CRM),
`compact` (card di task, senza il blocco avatar) e `label` (`aria-label`).
**`src/components/ui/SkeletonRows.jsx`** (NEW) — variante a righe per i pannelli
in colonna della Dashboard.

**Viste che smettono di dichiarare un vuoto che non conoscono:**
- Le quattro code (`PersonalQueue` / `UnassignedQueue` / `OverdueQueue` /
  `UrgentQueue`): scheletro al posto di "Buon lavoro!", "Tutti gli incarichi
  hanno un proprietario", "Tutto in regola!", "Nessuna task in scadenza".
- `Dashboard`: linguette a `…` invece di `0`, scheletro su "Scadenze Prossime"
  (che non aveva alcuno stato vuoto: a lista vuota restava un box col solo
  titolo) e su "Carico di Lavoro Team" (che mostrava l'organico al completo con
  "0 task" a testa — un carico inventato, non un carico vuoto).
- `NoticeBoard`, `Archive`, `Trash`: scheletro al posto di "Nessun avviso in
  bacheca" / "Archivio vuoto" / "Cestino vuoto".
- `CalendarPlanner`: riga di stato sopra la griglia — qui non c'è una lista da
  sostituire, sono gli eventi a mancare, e un mese di celle vuote si legge come
  "agenda libera".
- Guardia comune `loading && dati.length === 0`: un reload realtime a dati già
  presenti non nasconde nulla sotto uno scheletro.

### 📡 Criticità #7 — rilevamento offline

**`src/hooks/useOnlineStatus.js`** (NEW) — `navigator.onLine` come stato React,
con riallineamento al mount (fra primo render ed effetto la rete può essere già
caduta) e fallback a "online" dove il browser non espone il campo.
**`src/components/shell/OfflineBanner.jsx`** (NEW) — striscia `--danger`
persistente e non chiudibile sotto la topbar, sopra il banner di rollback admin.
Dice entrambe le conseguenze: i dati sono fermi all'ultimo aggiornamento **e** le
modifiche non verranno salvate. `role="status"` + `aria-live="assertive"`.

Limite dichiarato: `navigator.onLine === false` è affidabile, `=== true` no
(captive portal, DNS rotto, backend giù). Il banner non mente per eccesso, ma non
copre quei casi: servirebbe un segnale applicativo (stato del canale realtime).

### ✅ Test

- `src/test/statiDiAttesa.test.jsx` (NEW, 10) — asserzioni in **negativo**: la
  frase rassicurante NON deve comparire in caricamento, e deve tornare a
  comparire quando il fetch è davvero tornato vuoto.
- `src/test/idratazioneLoading.test.jsx` (NEW, 6) — i flag per entità, la
  chiusura anche in errore, l'identità stabile di `loading`.
- `src/test/offlineBanner.test.jsx` (NEW, 6) — comparsa/scomparsa sugli eventi,
  rete già assente al mount, nessun falso allarme senza `navigator.onLine`.

## v3.2-dev — Block 4: Account Management (sessione 33 — 2026-06-21)

> Branch `claude/pr-73-merge-preview-02y67z`. Base: `main` post-merge #74 (Block 3). Shell più chiara, presenza admin, cambio password, eliminazione account self-service.

### 🎨 Shell — Celeste più chiaro e contrasto icone

**`src/VoyageDesk.jsx`**
- `--sky: #87CEEB` → `--sky: #D0EEF9` (celeste quasi bianco su topbar/sidebar/bottom-nav).

**`src/components/shell/Topbar.jsx`** / **`Sidebar.jsx`**
- Tutti i testi/icone muted portati da opacità 0.45–0.60 a 0.65–0.80 per leggibilità su sfondo chiaro.

### 👤 Presenza nel pannello Admin

**`src/components/admin/AdminView.jsx`**
- Dot presenza colorato (verde online / ambra busy / grigio offline) sovrapposto all'avatar di ogni membro.
- Label "ultimo accesso X min/h/g fa" nella riga sottotitolo della card.
- Helper `PRESENCE_COLOR` + `fmtLastSeen` module-scope (usa `m.status` + `m.last_seen_at` già in `state.team`).

### 🔑 Cambia password in-app

**`src/components/modals/ProfileEditor.jsx`**
- Sezione collassabile "🔑 Cambia password" (solo con sessione reale Supabase).
- Validazione lato client: min 8 caratteri, le due password devono coincidere.
- Feedback inline OK/errore, reset campi su successo.
- Chiama `updatePassword()` da `AuthContext` (`supabase.auth.updateUser({ password })`).

### 🗑️ Eliminazione account self-service

**`supabase/functions/delete-account/index.ts`** (NEW — `verify_jwt: true`, v2 ACTIVE in prod)
- Verifica JWT → ottiene `user.id`.
- `adminClient.from("users").update({ active: false })` — disabilita profilo pubblico.
- `adminClient.auth.admin.updateUserById(user.id, { ban_duration: "87600h" })` — ban 10 anni.
- **Non** usa `deleteUser`: le FK `comments.user_id` e `messages.sender_id ON DELETE CASCADE` cancellerebbero tutta la cronologia chat.

**`src/lib/api.js`**
- `Users.deleteAccount()`: invoca la Edge Function, normalizza errori.

**`src/auth/AuthContext.jsx`**
- `deleteAccount()`: chiama `Users.deleteAccount()`, poi `signOut()` su successo. Esposto in `value`.

**`src/components/modals/ProfileEditor.jsx`** (zona pericolosa)
- Sezione collassabile "⚠️ Elimina account" in rosso (solo con sessione).
- Box avvertenza rosso chiaro con spiegazione effetti.
- Input testo: il bottone "Elimina account definitivamente" si abilita solo quando l'utente digita esattamente `ELIMINA`.
- Su conferma: `deleteAccount()` → `signOut()` → app si smonta automaticamente.

---

## v3.1-dev — Block 3: Email Confirmation & Admin Controls (sessione 28)

> Branch `claude/block3-email-confirm-invites`. Base: `main` post-merge #66 (Block 1) + #67 (server-fix). Notifica admin su signup, inviti utente reali via email, predisposizione email confirmation.

### 🔔 Notifica admin su nuova registrazione (server-side)

**`supabase/migrations/20260619_notify_user_pending.sql` (NEW — applicata in prod)**
- Funzione `notify_user_pending()` SECURITY DEFINER + trigger `trg_notify_user_pending` AFTER INSERT su `public.users`.
- Quando nasce un utente con `pending=true` (signup self-service **o** invito admin), inserisce una notifica `user_pending` per ogni admin attivo non-pending (escluso l'utente stesso).
- Pattern standard notifiche server-side (RLS vieta insert client). `revoke execute` da public/anon/authenticated.

**`src/components/shell/Topbar.jsx`**
- `NOTIF_ICONS['user_pending'] = '👤'`; `notifTitle()` → "Nuova richiesta di accesso: {nome}".

### ✉️ Inviti utente reali via email (admin)

**`supabase/functions/invite-user/index.ts` (salvato da #64 — deployato in prod, v4, verify_jwt)**
- Edge Function admin-only: verifica il JWT del chiamante e il ruolo `admin`, poi `auth.admin.inviteUserByEmail()` + pre-crea profilo `public.users` (pending) e `user_contacts`. Il trigger DB resta safety-net.
- Errori localizzati (email già registrata → 409; non-admin → 403).

**`src/lib/api.js`**
- `Users.invite({ email, name, role, capacity, color })`: invoca la Edge Function e normalizza l'errore (estrae il messaggio localizzato da `error.context`).

**`src/components/modals/AddTeamMemberModal.jsx`**
- Nuovo campo **Email**: se valorizzato → invito reale via `Users.invite` (label bottone "Invia invito", toast di conferma); se vuoto → vecchio comportamento "agente locale".
- Mappa ruolo UI → ruolo DB (`Manager→manager`, `Senior/Junior Agent→agent`, `Driver→driver`, `Admin→admin`). Stato `busy`/`err` inline.

### 📧 Email confirmation

- Frontend già pronto: `LoginScreen.localizeAuthError()` gestisce `email_not_confirmed`; il messaggio di signup invita a confermare l'email.
- ⚠️ **L'enforcement è un toggle dashboard** (Supabase → Authentication → "Confirm email"): non esiste tool MCP per attivarlo, va abilitato manualmente. Stesso per "Leaked password protection" (HaveIBeenPwned).

## v3.0-dev — Block 1: Authentication & Onboarding (sessione 27)

> Branch `claude/handoff-changelog-roadmap-wm7scp` (3 commits). Complete password recovery, self-service signup, team member approval system with persistence fix, security hardening migration.

### 🔐 Password Recovery Flow

**`src/auth/UpdatePasswordScreen.jsx` (NEW)**
- Password reset UI shown after user clicks recovery link from email.
- Input: password confirmation (min 8 chars, must match).
- Calls `updatePassword()` from AuthContext → on success `recovery=false` → exits screen.
- Italian error messages for all Supabase auth codes.

**`src/auth/AuthContext.jsx` (Enhanced)**
- New method `resetPassword(email)`: sends Supabase password reset magic link.
- New method `updatePassword(password)`: updates password in current session.
- New state: `recovery` (boolean, set true when Supabase detects PASSWORD_RECOVERY event).
- Magic link detection: `onAuthStateChange` checks `event === PASSWORD_RECOVERY`.

**`src/auth/LoginScreen.jsx` (Rewritten with 3 modes)**
- **Signup mode**: name + email + password fields. Validation: name required, password ≥8 chars.
- **Forgot password mode**: email only, sends reset link.
- **Login mode**: email + password (original).
- All modes use `localizeAuthError()` for Italian Supabase error messages.
- Mode switching clears errors and password field.

**`src/main.jsx` (Updated AuthGate)**
- Priority order: `recovery` → session → profile → `pending` → app.
- If `recovery=true`: show `UpdatePasswordScreen` (even with valid session).
- If no session: show `LoginScreen`.
- If no profile: loading screen.
- If `profile.pending === true`: show new **`PendingScreen`** (wait for admin approval).
- Else: mount `VoyageDesk` app.

### 📝 Self-Service Signup

**Flow**:
1. User fills signup form (name, email, password) → `signUp()`.
2. `AuthContext.signUp()` creates auth user + sets metadata.
3. **Trigger** `handle_new_auth_user()` fires:
   - Creates `public.users`: `id, name, role, avatar, color, capacity, pending=true, active=false`.
   - Creates `public.user_contacts`: `user_id, email`.
4. User's `profile.pending=true` → `PendingScreen` shown (wait for admin).
5. Admin approves → `pending=false, active=true` → app unlocks.

**New component `PendingScreen`** (in `main.jsx`)
- Shown when `profile.pending === true`.
- Displays: "Account in attesa" + user greeting + "Un amministratore deve approvare…"
- Button: "Esci" (logout).
- Prevents app access until approval.

### ✅ Team Member Approval (Persistence Fix)

**Bug Fixed**: `APPROVE_TEAM_MEMBER` + `TOGGLE_TEAM_MEMBER_ACTIVE` only mutated local state → on reload, lost; approval didn't persist.

**Solution**:
- **`src/lib/api.js`** new `Users.approve(id)`: persists `pending=false, active=true` to Supabase (admin-only via RLS).
- **`src/VoyageDesk.jsx`** dispatch wrappers: both actions now call API + Supabase, with error toast.
- **`state.team` added to deps**: read current member state correctly.

**Result**: approval persists to DB, survives reload.

### 🔒 Security Hardening

**Migration `20260619_security_dedupe_signup_trigger.sql` (Applied to Production)**

1. **Codify production function**: `handle_new_auth_user()` (was live but untracked in repo).
   - Avatar, color, capacity generation from metadata.
   - Idempotent: `ON CONFLICT DO NOTHING`.

2. **Remove duplicate**: Drop old `trg_on_auth_user_created` + `handle_new_user()` (redundant).

3. **Revoke EXECUTE on trigger**: Clients cannot call as RPC (trigger fires normally).

4. **Keep EXECUTE for helpers**: `is_admin()` + `is_manager_or_admin()` (called inside RLS policies, safe).

**Result**: repo↔prod synced, signup fully documented, no client RPC exposure.

---

## v2.8-dev — Micro-feature loop frontend-only Round 16–23 (sessione 26)

> Branch `claude/handoff-changelog-roadmap-wm7scp`. Continuazione del loop di sessione 25 (Rounds 8–15). 8 round ulteriori tutti frontend-only, senza DB né librerie esterne.

### ⏱ Round 23 — Pill ore-in-coda nel greeting Dashboard

#### Riepilogo workload visibile al primo sguardo

- **`Dashboard.jsx`**: sotto il saluto "Buongiorno, Marco ☀️" appare un pill `⏱ Xh in coda` con il totale delle ore stimate della coda personale (sum `estimatedHours` sui task aperti assegnati all'utente). Quando ci sono task scaduti il pill diventa rosso e aggiunge `· N scadute`. Non mostrato per Admin. Visibile solo se la somma > 0.

### ⏳ Round 22 — Campo ore stimate nel QuickAddTask

#### Stima inseribile alla creazione del task

- **`QuickAddTask.jsx`**: aggiunto input numerico "ORE ⏱" (step 0.5, max 100) nella riga Assegna A / Scadenza. Il valore era precedentemente hardcoded a 1. Default a 1h se vuoto al submit. La griglia 2-colonne diventa 3-colonne (`1fr 1fr 80px`) per ospitare il campo senza spostare la struttura visiva.

### 🔴 Round 21 — Filtro assegnatario nella OverdueQueue

#### Filtra task scaduti per agente (speculare a Round 15)

- **`Dashboard.jsx` — `OverdueQueue`**: chip avatar+nome+contatore per filtrare i task scaduti per agente assegnato. Chip "Tutti" (rosso pieno) + chip per ogni assegnatario presente. Badge header aggiorna `N/M` quando filtro attivo. Stato vuoto dedicato per assegnatario senza task scaduti nel filtro. Visibile solo quando ci sono > 1 assegnatari.

### 👥 Round 20 — Ore stimate in coda per membro nel Team view

#### Workload in ore oltre al conteggio task

- **`Team.jsx`**: riga sotto la barra capacità nella card membro ora mostra `N/M task · ⏱ Xh` quando il membro ha task attivi con `estimatedHours > 0`. Calcolato con `reduce` su `active` per sommare le ore stimate. Visibile solo quando la somma è > 0.

### 🗓️ Round 19 — Mini-avatar assegnatari nel day view CalendarPlanner

#### Avatar assegnatari visibili sulle card evento senza aprire il dettaglio

- **`CalendarPlanner.jsx`** — vista giornaliera time-grid: riga inferiore delle card evento ora mostra ora/durata a sinistra e avatar 14px degli assegnatari a destra. Max 3 avatar + `+N` per eventuali ulteriori. Visibili solo quando `height >= 42px` (evento ≥ 1h) per non sovraffollare card piccole. Usa il componente `Avatar` già esistente.

### ↓ Round 18 — Export CSV coda personale

#### Scarica le task filtrate correnti come file CSV

- **`Dashboard.jsx`**: bottone `↓ CSV` affiancato al badge contatore nel header della `PersonalQueue`. Visibile solo quando `filtered.length > 0` (rispetta filtro data Driver). Helper `_esc` e `exportTasksCSV` definiti a module-scope. CSV con BOM UTF-8, colonne: Titolo, Categoria, Priorità, Stato, Cliente, Pratica, Assegnati, Scadenza, Ore stimate. Nome file `coda-personale-YYYY-MM-DD.csv`.

### 👤 Round 17 — Ore stimate nel pannello task del cliente

#### Riepilogo ore per cliente nel ClienteTaskPanel

- **`ClientiView.jsx` — `ClienteTaskPanel`**: sotto il titolo "Task di [cliente]" viene mostrato un summary row multi-colonna: `N aperti · Xh stimate` (in muted) + `N completati · Yh` (in verde) + `Totale: Zh` (in navy bold) quando almeno un task ha `estimatedHours > 0`. Calcolato con `reduce` su `open`/`done`.

### 🗑️ Round 16 — Filtro periodo nel Cestino

#### Chip temporale per navigare lo storico task eliminati

- **`Trash.jsx`**: riga di chip "Periodo:" con 4 opzioni: **Tutti** | **Ultimi 7 gg** | **Questo mese** | **Mese scorso**. Il badge in cima al header mostra `N di M task — filtrati per periodo` quando un filtro è attivo. Stato vuoto dedicato con bottone "Mostra tutti" per resettare. Helper `filterByPeriod` a module-scope con calcoli date basati su `deletedAt`. Chip visibili solo se ci sono task nel cestino.

---

## v2.8-dev — Candidati low-risk: driver/dark mode + ux switch + bacheca tag/reazioni + template chat + admin rollback (sessione 25)

> Branch `claude/handoff-changelog-roadmap-xlkae9`. **Round 1:** feature low-risk portate da PR #62 (commit isolati), depurate dalle parti obsolete (chip pratica) e dai moduli rimossi in #63. **Round 2:** micro-feature frontend-only prima dell'implementazione OneDrive/WhatsApp. **Round 3:** admin rollback automatico.

### 👥 Round 15 — Filtro per agente nella UrgentOthersQueue

#### Chip per filtrare i task urgenti del team per singolo agente

- **`Dashboard.jsx` — `UrgentOthersQueue`**: quando la sezione "Urgenti del team" contiene task di più di un agente, appare una riga di chip filtro sotto l'intestazione. Chip **"Tutti"** (arancione pieno) + un chip per ciascun agente presente (avatar 16px + nome + contatore task). Click attiva il filtro; click sulla stessa chip lo azzera.
- Il contatore nel badge in alto aggiorna dinamicamente: mostra `N visibili / M totali` quando un filtro è attivo.
- `presentAgents` calcolato con `Set` su `tasks.map(t => t.assignees?.[0])` — mostra solo gli agenti che hanno effettivamente task urgenti nella finestra 24h.
- La riga di chip è nascosta se tutti i task appartengono allo stesso agente (`presentAgents.length <= 1`).

### ⚡ Round 14 — Avanzamento status rapido nella PersonalQueue

#### Bottoni inline per cambiare status senza aprire il TaskSlideOver

- **`Dashboard.jsx` — `PersonalQueue`**: ogni card mostra (in fondo, sopra l'area cliccabile) una riga di 2 micro-bottoni contestuali in base allo status corrente:
  - `todo` → **▶ Avvia** (→ `inprogress`) + **✓ Fatto** (→ `done`)
  - `inprogress` → **⏸ Attesa** (→ `awaiting_client`) + **✓ Fatto** (→ `done`)
  - `awaiting_*` → **▶ Riprendi** (→ `inprogress`) + **✓ Fatto** (→ `done`)
  - `done`: nessun bottone (task già chiusi)
- Click sui bottoni chiama `UPDATE_TASK` e stoppa la propagazione (evita apertura TaskSlideOver). Hover: bordo pieno + testo bianco.

### 💬 Round 13 — Cerca nei messaggi (ChatPanel)

#### Ricerca full-text nei messaggi della conversazione attiva

- **`ChatPanel.jsx` — `ConversationView`**: pulsante 🔍 in alto a destra nell'header della conversazione. Click apre/chiude una barra di ricerca sotto l'header (sfondo `--navy-dark`). Il campo filtra i messaggi di testo visibili per keyword (case-insensitive); i messaggi vocali e file non vengono esclusi se il testo non coincide. Contatore "N risultati" aggiornato in tempo reale. Pulsante ✕ chiude e azzera la ricerca. Il filtro si resetta automaticamente alla chiusura del pannello.

### 📅 Round 12 — Filtro per categoria nel CalendarPlanner

#### Chip filtro categoria nel calendario (mese / settimana / giorno / distribuzione)

- **`CalendarPlanner.jsx`**: riga di chip categoria appare sotto l'header del calendario quando sono presenti più di una categoria con `dueDate`. Chip **"Tutte"** (Navy pieno) + un chip per ogni categoria presente (icona + label, colore categoria). Click su categoria attiva filtra tutte le viste (mese, settimana, giornata, distribuzione agenti); click sulla stessa categoria la deseleziona.
- `matchesCat(t)` helper locale applicato a `getTasksForCalDay`, `getTasksForDay`, e ai contatori della tabella distribuzione settimanale.
- `presentCats` calcolato da `Set` sui task visibili con `dueDate` — mostra solo i chip delle categorie effettivamente presenti nel calendario.

### 🔴 Round 11 — Badge urgenze personali nel nav laterale

#### Indicatore rosso nel nav per task scaduti/urgenti assegnati all'utente

- **`Sidebar.jsx`**: il badge dorato esistente sulla voce "Dashboard" (coda non assegnata) è ora affiancato da un badge **rosso** che conta i task dell'utente corrente che sono scaduti o in scadenza entro 24h (`isOverdue || isUrgent`, status ≠ `done`). Tooltip descrittivo al hover.
- Badge rosso visibile anche nella **BottomNav** (mobile/tablet) per la stessa voce Dashboard.
- `getNavBadges(state)` aggiornato: nuovo campo `dashboardUrgent` calcolato filtrando per `state.currentUserId`. Badge scompare a zero.

### ⌨️ Round 10 — Scorciatoie tastiera globali

#### Shortcut da tastiera per le azioni più frequenti

- **`K`** (senza modificatori, fuori da input): apre il modale **Nuovo Task rapido** (`QuickAddTask`).
- **`Ctrl+K`** / `Cmd+K`: porta il focus alla barra di ricerca della Topbar (già presente, ora documentata).
- **`?`**: apre/chiude l'overlay `KeyboardHelpOverlay` — lista di tutte le scorciatoie disponibili con descrizione e `<kbd>` visivo.
- **`Esc`**: chiude l'overlay scorciatoie (gli altri modali gestiscono già Esc tramite click-outside).
- Le shortcut non si attivano quando il focus è su un `<input>`, `<textarea>` o `<select>` per evitare conflitti con la digitazione.

### 👤 Round 9 — Pannello task del cliente nella vista Clienti

#### Click su una card cliente → mostra i task collegati inline

- **`ClientiView.jsx`**: nuova funzione `ClienteTaskPanel` — pannello `slide-up` sotto la griglia che elenca tutti i task (attivi e visibili) il cui campo `client` contiene il nome del cliente selezionato (match case-insensitive). Contatori "N aperti · N completati" nell'header. Ogni riga task è cliccabile → apre il `TaskSlideOver` tramite `SET_SELECTED_TASK`.
- Click sull'avatar/nome di una card seleziona (e deseleziona) il cliente. La card selezionata ha bordo blu evidenziato (`--navy`). Il pannello si chiude con il pulsante ✕ o riselezionando la stessa card.
- Usa `PriorityBadge` + `StatusBadge` + icona categoria per la riga task. Filtra con `isActiveTask` + `canViewTask` rispettando i permessi utente corrente.

### 🔍 Round 8 — Sort e ricerca avanzata nella vista Clienti

#### Ordinamento e ricerca estesa nell'anagrafica clienti

- **`ClientiView.jsx`**: nuovi chip di ordinamento sotto la barra di ricerca — **Nome A-Z**, **Nome Z-A**, **Più recenti** (per `createdAt`), **Città A-Z** — con evidenziazione blu del criterio attivo.
- Ricerca estesa a **telefono** e **note** (prima era solo nome/email/città). Il placeholder aggiornato riflette i nuovi campi ricercabili.
- Sorting stabile: `localeCompare` con locale `"it"` per testo; `Date` per cronologico. Derivato via `useMemo` per evitare re-ordini a ogni keystroke.

### 👥 Round 7 — Team view: filtro ruolo, badge sovraccarico, sezione pending

#### Miglioramenti alla vista Team & Assegnazioni

- **Chip filtro per ruolo** (v2.8): riga di chip sopra la griglia con i ruoli effettivamente presenti (Tutti / Manager / Senior Agent / Junior Agent / Driver). Contatore per ruolo. Resetta la selezione membro corrente al cambio filtro.
- **Badge "⚠ Sovraccarico"**: appare in alto a destra sulla card quando carico > 85% della capacità; bordo card rosso tratteggiato.
- **Badge "JR"** giallo sui Junior Agent (coerente con UserSwitcher/Dashboard).
- **Sezione "In attesa di approvazione"**: sotto la griglia principale, mostra i membri `pending=true` con avatar sfumato e badge "⏳ In attesa". Contatore badge nel header della pagina.

### 💡 Round 6 — Auto-categoria in QuickAddTask

#### Suggerimento automatico di categoria basato su keyword nel titolo

- `QuickAddTask`: funzione `suggestCategory(title, availableCats)` — mappa ~40 keyword italiane a 10 categorie (es. "volo/aereo/bigliett" → Booking, "hotel/albergo/bungalow" → Hotel, "visto/passaporto" → Visa, "fattura/acconto/saldo" → Pagamenti, ecc.). Auto-applica la categoria finché l'utente non la modifica manualmente. Label "CATEGORIA" mostra badge blu `💡 auto` quando il valore è suggerito. Se l'utente cambia manualmente ma esiste una suggestion diversa, appare link "💡 Usa categoria suggerita: X".

### 🔀 Round 5 — Ordinamento coda personale

#### Chip di ordinamento nella coda personale (Scadenza / Priorità / Cliente / Stato)

- `PersonalQueue`: nuovo stato locale `sortBy`. Quattro chip: **Scadenza** (default), **Priorità** (critical → low), **Cliente** (A-Z), **Stato** (todo → done). Tie-breaker sempre per scadenza. Sottotitolo si aggiorna dinamicamente. Non visibile per il Driver (che ha già il filtro data giornaliera).
- Constanti `QUEUE_SORT_OPTIONS`, `PRIO_ORDER`, `STATUS_ORDER` definite module-local.

### 👥 Round 4 — Permessi granulari sub-ruolo Senior vs Junior Agent

#### 🔒 Junior Agent: permessi ridotti rispetto a Senior Agent

- **`appGlobals.js`**: Nuovi helper `isJuniorAgent(userId)` e `isSeniorAgent(userId)` (leggono `m.role.toLowerCase().includes("junior")`). `canEditTask`: Junior Agent può modificare solo task dove è esplicitamente in `assignees` — non può raccogliere task dalla coda globale non assegnata. `canCreateTaskCategory`: Junior Agent non può creare task nelle categorie sensibili `payment` e `admin`.
- **`Dashboard.jsx`**: `UnassignedQueue` ora riceve `uid`; per Junior Agent il bottone "Prendi in carico" è sostituito da "🔒 Chiedi a un Senior per l'assegnazione" (grigio, non cliccabile); sottotitolo della coda adattato. Badge "JUNIOR" (giallo) nel header Dashboard accanto al ruolo.
- **`Topbar.jsx`**: Badge "JUNIOR" nel dropdown UserSwitcher per ogni membro Junior Agent.

### 🔐 Round 3 — Admin rollback automatico

#### ⏱ Countdown di 60s per sessioni Admin (rollback automatico)

- **`reducer.js`**: `SET_CURRENT_USER` ora registra `adminRollbackTo` (userId precedente) e `adminSwitchedAt` (ISO timestamp) quando si passa **da un non-Admin a un Admin**. Aggiorna il toast in "rollback automatico in 60s". Nuova azione `CANCEL_ADMIN_ROLLBACK` per cancellare il countdown senza cambiare utente.
- **`VoyageDesk.jsx`**: componente `AdminRollbackBanner` — banner arancione fisso sotto la Topbar. Calcola i secondi residui dall'ISO timestamp (sopravvive ai re-render), decrementa via `setInterval` e auto-dispatcha `SET_CURRENT_USER` allo scadere. Pulsanti: **"Rimani come Admin"** (cancella il rollback) e **"Torna ora →"** (rollback immediato). Nessun localStorage, solo-sessione.
- Chiude completamente il roadmap item "Notifica in-app al cambio utente (rollback automatico dopo X secondi?)".

### 🎨 Round 2 — Micro-feature pre-OneDrive/WhatsApp

#### ⚠️ Warning toast su switch verso Admin
- `SET_CURRENT_USER`: se il nuovo profilo è Admin, toast `type=warning` con cue esplicito ("Ricordati di tornare al tuo profilo a fine sessione"). Evita di lasciare la sessione mock aperta come Admin per errore.
- `Toast`: supporta `type="warning"` (oro `#C8832A`, icona ⚠). Rimosso `whiteSpace:nowrap` (messaggi più lunghi vanno a capo, max-width 560px).

#### 🏷️ Bacheca: tag/categorie filtrabili sui post-it
- `NoticeEditorModal`: input "Tag" con chip + draft (Enter/virgola conferma, Backspace su input vuoto rimuove l'ultimo). Max 5 tag normalizzati lowercase, max 20 char.
- `NoticeBoard`: barra filtro tag in header (chip clickabili, **OR**, bottone "azzera"); chip nel footer del post-it (click toggla il filtro). Visibile solo se almeno un post-it ha tag.

#### 😀 Bacheca: reazioni emoji sui post-it
- Reducer: `TOGGLE_NOTICE_REACTION` (stesso shape della chat: `{ emoji: [userId, ...] }`, toggle currentUser, cleanup vuoti).
- `NoticeBoard`: bottone 😀 in toolbar apre picker con 6 emoji (👍 ❤️ 🎉 👀 🔥 ✅). Chip riassuntive con tooltip "chi ha reagito"; click toggla la propria reazione.
- Fix collaterale: edit notice ora propaga anche `tags` (non più persi).

#### 💬 Template messaggi chat (Impostazioni agenzia)
- `state.messageTemplates`: array `{ id, label, text }`. Mock iniziale con 4 frasi tipiche (conferma documenti, richiesta passaporti, sollecito acconto, voucher pronto).
- Reducer: `ADD/UPDATE/DELETE_MESSAGE_TEMPLATE` (admin-only, log attività).
- `AdminView` tab Sistema: nuova sezione **Template messaggi chat** con CRUD inline (label max 40, testo max 500).
- `ChatPanel` composer: pulsante 📋 (a fianco di 📎) apre dropdown template; click inserisce il testo (append con newline se input non vuoto, overwrite altrimenti). Reso solo se templates non vuoti.

### 🎨 Round 1 — Cherry-pick da PR #62 (driver + dark mode)

#### 🚐 Filtro data/ora nella coda personale Driver (vista transfer)

- **`src/components/dashboard/Dashboard.jsx`**: `PersonalQueue` accetta `enableDateFilter` (attivo per `role === "driver"`). Chip **Tutte / Oggi / Domani** + `<input type="date">` per filtrare i transfer per giornata; contatore `filtrati/totale`; orario (`formatTime`) mostrato nelle card. Titolo/sottotitolo dedicati ("La mia coda transfer"). Empty-state contestuale (📭) quando il filtro non produce risultati.
- Risolve il bisogno di Giulia (Driver) di una vista transfer-oriented.

#### 🌙 Dark mode con toggle in Topbar

- **Token semantici** (`src/VoyageDesk.jsx` FontLoader): `--card` (superficie card, sostituisce gli `#fff` inline dei contenuti) e `--heading` (titoli su card, sostituisce `color: var(--navy)`). In light coincidono coi valori storici → **nessun cambiamento visivo**.
- **Blocco `[data-theme="dark"]`**: superfici scure, testo chiaro, `color-scheme: dark`. La **shell** (topbar/sidebar/bottom-nav) resta brand-celeste per scelta di design (evita testo invisibile sui controlli). `--navy` resta scuro (bg bottoni con testo bianco).
- **Toggle 🌙/☀️ in Topbar** (`src/components/shell/Topbar.jsx`): stato solo-sessione, **nessun localStorage** (vincolo CLAUDE.md), `data-theme` applicato su `<html>` via `useEffect`.
- Sostituzioni `#fff`→`var(--card)` e `var(--navy)`→`var(--heading)` propagate ai componenti contenuto (Dashboard, AdminView, Calendar, Chat, Clienti, Trash, Team, modali, ui). `TaskSlideOver`/`ClientiView` adattati a post-#63 (input `praticaRef` al posto del select pratica; badge dossier non reintrodotto).

#### 🔍 Revisione PR aperte

- **PR #62 / #64**: partite da un branch-point **precedente** alla rimozione Pratiche/Fornitori (#63). Mergiate as-is **reintrodurrebbero** `PraticheView.jsx`/`FornitoriView.jsx` e le migration dossier, e si sovrappongono tra loro sulla feature "inviti reali via Supabase" (Fase 3). Decisione: **non mergiare as-is**; estratti solo i commit-feature puliti e low-risk (driver filter, dark mode). La feature "inviti reali" resta a Fase 3 (da concordare).

### Caveat

Nessuno.

---

## v2.7-dev — Rimozione completa Pratiche & Fornitori; campo libero praticaRef nelle task (sessione 24)

> PR #63 su branch `claude/phase-3-password-protection-kw3hz8` · ready for review · CI Vercel verde.
> Migration `20260616_remove_pratiche_fornitori.sql` **già applicata in produzione**.

### ⛔ Decisione architetturale

Su richiesta esplicita dell'utente, i moduli **Pratiche** (dossiers/viaggi) e **Fornitori** (suppliers) sono stati **eliminati permanentemente** dal frontend e dal database. Il modulo **Clienti** è rimasto intatto. Non reintrodurre pratiche né fornitori in nessuna forma.

### 🗑️ File eliminati

- `src/components/dossiers/PraticheView.jsx`
- `src/components/suppliers/FornitoriView.jsx`

### 📦 Campo `praticaRef` (testo libero) in sostituzione di `dossier_id`

- **DB**: `tasks.dossier_id` (UUID FK) → `tasks.pratica_ref text` (campo libero, nessuna FK).
- **Mapper** (`src/lib/mappers.js`): `fromDbTask` → `praticaRef`; `toDbTask`/`toDbTaskPatch` → `pratica_ref`.
- **UI**: `TaskSlideOver`, `QuickAddTask`, `BulkTaskCreator` (ManualTab + TemplateTab) sostituiscono il select pratica con un input testo "N° PRATICA".

### 🔌 Cleanup layer dati

- **`src/lib/api.js`**: rimossi `Suppliers`, `Dossiers`, `DossierSuppliers`. Rimasto `Clients`.
- **`src/lib/mappers.js`**: rimossi `fromDbSupplier/toDbSupplier`, `fromDbDossier/toDbDossier`, `fromDbDossierSupplier/toDbDossierSupplier`. Rimasti `fromDbClient/toDbClient`, `fromDbNotification`.
- **`src/state/reducer.js`**: rimossi casi `SET/ADD/UPDATE/DELETE_SUPPLIER` e `SET/ADD/UPDATE/DELETE_DOSSIER`; rimosso `suppliers: []` e `dossiers: []` da `makeInitialState`.

### 🖥️ Cleanup componenti

- **`src/VoyageDesk.jsx`**: CRM hydration ora carica solo Clienti; rimossi `targetDossierId`, `openDossierById`, dispatch supplier/dossier, props `dossiers` a Topbar/TaskSlideOver/ChatPanel/QuickAddTask/BulkTaskCreator.
- **`src/components/shell/Sidebar.jsx`**: voci nav "fornitori" e "pratiche" rimosse; `imminentDossiers` badge rimosso; `getNavBadges` → `{ admin, dashboard }`.
- **`src/components/shell/Topbar.jsx`**: `dossier_status`/`dossier_departure` rimossi da `NOTIF_ICONS`, `NOTIF_CATEGORIES`, `notifTitle`; filtro dossier e `onOpenDossier` rimossi da `NotificationsPanel`.
- **`src/components/tasks/TaskSlideOver.jsx`**: sezione "PRATICA COLLEGATA" (select FK) → campo testo "N° PRATICA" (legato a `task.praticaRef`).
- **`src/components/clients/ClientiView.jsx`**: badge contatore dossier rimosso da `ClienteCard`.
- **`src/components/modals/QuickAddTask.jsx`**: select pratica → `praticaRef` text input.
- **`src/components/modals/BulkTaskCreator.jsx`**: select pratica rimosso da ManualTab e TemplateTab → text input "N° PRATICA"; prop `dossiers` rimossa.
- **`src/components/chat/ChatPanel.jsx`**: `DossierRefChip`, `renderTextWithRefs` rimossi → `MentionText`; `dossiers` rimosso da `ChatContext` e props.
- **`src/components/calendar/CalendarPlanner.jsx`**: tutti i blocchi di rendering eventi dossier rimossi (mese/settimana/giorno/settimana-piena), `getDossierEventsForDay`, `openDossiers`, costanti `SKY`/`SKY_DARK` (−101 righe nette).

### 🗄️ Migration DB (`20260616_remove_pratiche_fornitori.sql`)

Applicata in produzione su `vmxvnxsqfisucugcpqlc` — **non va riapplicata**:

1. Cron `notify_dossier_departure_daily` unscheduled
2. Drop triggers `trg_notify_dossier_status`, `dossiers_auto_number`
3. Drop functions `notify_dossier_status()`, `notify_dossier_departure()`, `generate_dossier_number()`
4. `ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS pratica_ref text`
5. Migrazione dati: `UPDATE tasks SET pratica_ref = dossiers.number WHERE dossier_id = dossiers.id`
6. `ALTER TABLE public.tasks DROP COLUMN dossier_id`
7. Drop tables `dossier_suppliers`, `dossiers`, `suppliers` (CASCADE)
8. Drop sequence `dossier_number_seq`

### Caveat

Nessuno.

---

## v2.6-dev — Micro-miglioramenti UI: auto-collapse sidebar + export log CSV + skeleton loading (sessione 23)

> PR #60 (**mergeata** in `main`, squash `46dbe0a`). Quick win frontend a basso rischio.

### 💀 Skeleton loading (viste CRM)

- **`src/components/ui/SkeletonCards.jsx`** (nuovo): griglia di card placeholder con shimmer (classe `.skeleton`), responsive.
- **`src/VoyageDesk.jsx`**: nuovo flag `crmLoading` (true finché non completa il primo fetch CRM da Supabase, `.finally`), passato a Clienti/Fornitori/Pratiche.
- **`ClientiView` / `FornitoriView` / `PraticheView`**: mostrano `SkeletonCards` durante l'idratazione iniziale (prima che arrivino i dati) invece di lampeggiare l'empty-state "Nessun…"; sottotitolo "Caricamento…" al posto di "0 …".

### 🖥️ Auto-collapse Sidebar (desktop stretto 1025–1280px)

- **`src/components/shell/Sidebar.jsx`**: la sidebar si collassa automaticamente quando la finestra entra nella fascia 1025–1280px (dove 210px di nav rubano spazio) e si ri-espande sopra i 1280px. Effetto guardato per banda (`prevBandRef`): agisce solo sulle transizioni, quindi **non contrasta il toggle manuale** dentro la stessa banda. Su mount in fascia stretta parte già collassata.

### 📄 Export Log attività in CSV (Admin)

- **`src/components/admin/AdminView.jsx`**: pulsante "Esporta CSV" nel tab Log attività → scarica le righe **del filtro attivo** (Tutte/Task/Cestino/Admin) come CSV (`Data/ora, Tipo, Descrizione`, con BOM UTF-8). Disabilitato se la lista filtrata è vuota.
- Refactor: `downloadFile` ed `escapeCSV` (prima locali a `AdminIOTab`) **hoistati a module-scope** e condivisi tra i tab Import/Export e Log (no duplicazione).

---

## v2.5-dev — Fase 2 chiusa: queue_stale versionata + chat "Occupato" + cleanup roadmap (sessione 23)

> PR #60 (**mergeata** in `main`, squash `46dbe0a`).

### ⏳ Notifica coda globale stantia (`queue_stale`)

- **`supabase/migrations/20260615_queue_stale_notifications.sql`** (nuovo): `notify_queue_stale()` (`SECURITY DEFINER`) + cron orario `notify_queue_stale_hourly` (`5 * * * *`). Notifica i manager/admin attivi non-pending per i task in **coda globale** (nessun assegnatario, status `todo`, non cestinati) creati da **> 4h**. De-dup 4h. Payload `{ task_id, task_title, stale_since }`.
- La funzione + il cron erano **già live** (sessione 22) ma non versionati né registrati in `schema_migrations`: questa migration riallinea repo↔DB e registra la migration. Frontend già pronto (`NOTIF_ICONS['queue_stale']='⏳'`, `notifTitle`, categoria Task).

### 💬 Stato chat "Occupato" manuale

- **`src/components/chat/ChatPanel.jsx`**: `computePresence` riconosce lo stato `busy` (pallino rosso `#C0392B`); `PRESENCE_LABELS` per i tooltip (Online/Assente/Occupato/Offline); toggle "Occupato/Online" nell'header chat (prop `myBusy`/`onToggleBusy`).
- **`src/VoyageDesk.jsx`**: stato `myBusy` + `myBusyRef` + `toggleMyBusy`; l'heartbeat presence (`beat()`) invia `busy` invece di `online` quando il flag è attivo, senza far ripartire l'effetto presence. Tab nascosta → `away` (override temporaneo), poi torna a `busy` al ritorno. Chiude la voce "stato occupato manuale" della Fase 2.

### 🗑️ Rimozione Fase 3 Business

- **Fase 3 Business eliminata** da `ROADMAP.md` / `CLAUDE.md` / `CHANGELOG.md` / handoff (Report & Analytics, modulo finanziario, catalogo destinazioni) su richiesta utente. Ex-Fase 4 "Scala & accessi" rinumerata a Fase 3.

---

## v2.4-dev — Fase 2 Operatività completa: notifiche pratica, calendario, assegnatari, filtri (sessione 22)

> Branch sessione 22 — PR #57 (commit `b0e5a0c`). Base: `main` (post quick wins v17). Chiude il caveat **#28** → **Fase 2 completa, nessun caveat aperto**. Handoff: `docs/HANDOFF_SESSION_2026-06-15_v21.md` (consolida l'ex v20).

### 🔔 Trigger DB notifiche pratica (caveat #28)

- **`supabase/migrations/20260614_dossier_notifications.sql`** (nuovo): `notify_dossier_status()` (trigger `AFTER UPDATE OF status` su `dossiers` → notifica a `created_by` + manager/admin attivi non-pending, escluso l'attore) e `notify_dossier_departure()` (pg_cron giornaliero `0 7 * * *` UTC, pratiche confermate/in_corso con partenza ≤3gg, de-dup 20h). Entrambe `SECURITY DEFINER` + `revoke all`. Già applicata in prod (version `20260614212448`); file in repo per version control.

### 📅 Calendario — pratiche in tutte le viste

- **`src/components/calendar/CalendarPlanner.jsx`**: pratiche con `departureDate`/`returnDate` come eventi distinti (colore diverso dai task) in vista mese, settimana, settimana-piena e giorno (partenza ✈️ / ritorno 🛬).

### 👥 TaskSlideOver — assegnatari editable

- **`src/components/tasks/TaskSlideOver.jsx`**: assegnatari modificabili inline — chip con `×`, pulsante "+ Aggiungi" (select da `getAssignableTeam`), dispatch `UPDATE_TASK`. Rispetta `canEditTask`.

### 🧰 Filtri — notifiche e coda globale

- **`src/components/shell/Topbar.jsx`**: `NotificationsPanel` con filtri per categoria (Task / Pratiche / Menzioni).
- **`src/components/dashboard/Dashboard.jsx`**: `UnassignedQueue` con filtri per categoria e priorità.

### 💬 Chat — riferimenti pratica inline

- **`src/components/chat/ChatPanel.jsx`**: parser `PR-YYYY-NNN` (`DOSSIER_REF_RE`) → chip cliccabile (`DossierRefChip`) che apre la vista Pratiche; `ChatContext` trasporta `dossiers`. **`src/VoyageDesk.jsx`**: passa `dossiers` a `ChatPanel`.

### 📋 Docs

- **`docs/ROADMAP.md`**: **Fase 3 Business rimossa** (modulo finanziario, Report & Analytics, catalogo destinazioni); Fase 4 → Fase 3 (Scala & accessi); moduli Fase 2 → 🔶/✅. **`docs/CLAUDE.md`**: Priorità 2 completa `(session 22)`, rimossa Priorità 3 Business.

### Build

```
dist/assets/index-*.js   261.35 kB │ gzip: 62.14 kB   (+2.3 kB gz vs v2.3)
✅ Build verde.
```

### Caveat

- **#28** ✅ chiuso. **Nessun caveat aperto.**

---

## v2.3-dev — Quick wins v17: badge partenze, deep-link notifiche, selettore pratica, tema celeste (sessione 21)

> Branch `claude/handoff-v17-quick-wins-03nn3u` — PR #56 (draft). Base: `main` (post Fase 1 completa).

### 🔔 Badge sidebar "Pratiche" — partenze imminenti

- **`src/components/shell/Sidebar.jsx`** (`getNavBadges`): nuovo contatore `pratiche` = pratiche con `departureDate` nei prossimi 7 giorni e status non `completata`/`annullata`. Badge dorato in Sidebar desktop (collapsed/expanded) e BottomNav mobile.

### 📁 Deep-link notifiche → Pratica (caveat #28)

- **`src/components/shell/Topbar.jsx`**: `NotificationsPanel` gestisce `payload.dossier_id` oltre a `payload.task_id`; click naviga a PraticheView con il dettaglio della pratica già aperto. Nuovi tipi `dossier_status` (📁) e `dossier_departure` (✈️) con titoli italiani in `notifTitle`. Prop `onOpenDossier` aggiunta a `Topbar` e `NotificationsPanel`.
- **`src/components/dossiers/PraticheView.jsx`**: prop `initialDossierId` + `useEffect`/`useRef` per aprire il dettaglio corretto al mount senza loop.
- **`src/VoyageDesk.jsx`**: callback `openDossierById` + state `targetDossierId`; passati a Topbar e PraticheView.

### 📑 Selettore pratica in BulkTaskCreator

- **`src/components/modals/BulkTaskCreator.jsx`**: select "Pratica collegata" in `ManualTab` (impostazioni comuni) e `TemplateTab` (configurazione); visibile solo se esistono pratiche non annullate; `dossierId` propagato in tutti i task creati. Prop `dossiers` aggiunta al componente principale.
- **`src/VoyageDesk.jsx`**: passa `dossiers={state.dossiers}` a `BulkTaskCreator`.

### 🎨 Tema celeste — Topbar, Sidebar, BottomNav

- Nuova variabile CSS `--sky: #87CEEB` in `:root` (FontLoader in `VoyageDesk.jsx`).
- Topbar, Sidebar desktop e BottomNav mobile: background da `--navy`/`--navy-dark` → `--sky`.
- Testi adattati: bianco → navy/rgba(navy). Bottoni: vetro traslucido `rgba(255,255,255,0.45)`. Bordi: `rgba(15,32,68,*)`.
- Invariati: palette contenuto (card, modal, superfici bianche), accenti gold, badge.

### Build

```
dist/assets/index-*.js   253.08 kB │ gzip: 59.87 kB   (+0.4 kB gz vs v2.2)
✅ Build verde. Vercel preview: Ready.
```

### Caveat

- **#28** (nuovo) 🟡: UI deep-link notifiche pratica pronta; trigger DB `dossier_status`/`dossier_departure` da creare.

---

## v2.2-dev — Fase 1 completa: Task↔Pratica, Fornitori pratica, Filtro ricerca (sessione 20)

> Cumulativo sopra v2.1-dev. **Mergeati in `main`** (squash, in ordine): #51 (Task↔Pratica), #52 (Fornitori pratica), #53 (filtro pratica ricerca). Chiusi i caveat **#26** e **#27** → **Fase 1 completa**.

### 🔗 Collegamento Task ↔ Pratica (PR #51, caveat #26)

- **`src/lib/mappers.js`**: `fromDbTask`/`toDbTask`/`toDbTaskPatch` mappano `dossier_id` ↔ `dossierId` (prima il campo non veniva tradotto → il collegamento non si persisteva).
- **`QuickAddTask`**: select "Pratica collegata" (esclude le pratiche `annullata`) → popola `dossierId` alla creazione.
- **`TaskSlideOver`**: sezione "Pratica collegata" con select → dispatcha `UPDATE_TASK` con `dossierId`.
- **`VoyageDesk`**: passa `state.dossiers` a entrambi.
- Il collegamento reale è `tasks.dossier_id → dossiers.id` (FK UUID), distinto da `tasks.client_id` (testo libero legacy). `PraticheView` ora conta davvero i task collegati.

### 🤝 Fornitori della pratica (PR #52, caveat #27)

- **`src/lib/mappers.js`**: `fromDbDossierSupplier` / `toDbDossierSupplier` (`service_type`, `cost`, `notes` + fornitore embedded).
- **`PraticheView`** → nuovo `FornitoriPanel` in `PraticaDetail`: carica i fornitori via `DossierSuppliers.list`, form di aggiunta (fornitore + servizio + costo), rimozione ottimistica con rollback, toast su errore.
- Dati di dettaglio per-pratica gestiti in stato locale del pannello (no realtime, no stato globale).

### 🔍 Filtro pratica nella Ricerca avanzata (PR #53)

- **`AdvancedSearchPanel`**: sezione "Pratica" (select) che filtra i task per `dossierId`; keyword search arricchita con numero+titolo della pratica collegata; badge `📁 PR-YYYY-NNN` nei risultati.
- Completa la nota roadmap "filtro numero di pratica nella Ricerca avanzata".

### Build

```
dist/assets/index-*.js   252.04 kB │ gzip: 59.47 kB   (+1.3 kB gz vs Fase 1 base)
✅ Build verde a ogni step.
```

### Stato caveat

- **#26** ✅ chiuso (Task↔Pratica)
- **#27** ✅ chiuso (DossierSuppliers UI)
- **Nessun caveat aperto** — Fase 1 completa.

---

## v2.1-dev — Fase 1 CRM: Anagrafica Clienti, Fornitori, Pratiche (sessione 19)

> Cumulativo sopra v2.0-dev. **Mergeati in `main`** (squash): #46 (#2), #47 (#25), #48 (docs v13). **In PR draft**: #49 (Fase 1 CRM), #50 (docs v14).

### 🏗️ DB — Trigger auto-numerazione pratiche

- `supabase/migrations/20260614_fase1_dossier_autonumber.sql`:
  - `CREATE SEQUENCE dossier_number_seq START 1`
  - Funzione `generate_dossier_number()`: genera `PR-YYYY-NNN` via `lpad(nextval(...)::text, 3, '0')`. Idempotente: genera il numero solo se `NEW.number IS NULL OR ''`.
  - Trigger `dossiers_auto_number` BEFORE INSERT su `dossiers`.
- Le tabelle `clients`, `suppliers`, `dossiers`, `dossier_suppliers` e tutte le RLS policy erano già presenti nel DB. Il trigger era l'unico elemento mancante.

### 🔌 API layer (`src/lib/api.js`)

Nuovi oggetti:
- `Clients`: `list / get / create / update / remove`
- `Suppliers`: stessa struttura
- `Dossiers`: `list` con join `*, clients(id,name,email,phone)`; `get` con join profondo `dossier_suppliers(*, suppliers(*))`; `create / update / remove`
- `DossierSuppliers`: `list(dossierId) / add / remove`
- Nessun `withOrigin()` (tabelle CRM non hanno colonna `origin_client` né subscribe realtime).

### 🗺️ Mappers (`src/lib/mappers.js`)

- `fromDbClient(row)` → `{id, name, email, phone, address, city, notes, createdAt}`
- `toDbClient(client)` → `{name, email, phone, address, city, notes}`
- `fromDbSupplier` / `toDbSupplier` — aggiungono `category`, `country`
- `fromDbDossier(row)` → include `client: fromDbClient(row.clients)` embedded, `departureDate`, `returnDate`, `paxAdults`, `paxChildren`, `budgetTotal`
- `toDbDossier` — omette `id` e `number` (generati server-side)

### 🔁 Reducer (`src/state/reducer.js`)

Nuove azioni in `baseReducer`:
- `SET_CLIENTS`, `ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`
- `SET_SUPPLIERS`, `ADD_SUPPLIER`, `UPDATE_SUPPLIER`, `DELETE_SUPPLIER`
- `SET_DOSSIERS`, `ADD_DOSSIER`, `UPDATE_DOSSIER`, `DELETE_DOSSIER`

`makeInitialState` aggiornato: `clients: [], suppliers: [], dossiers: []`.

### 🖥️ Componenti UI

- **`src/components/clients/ClientiView.jsx`** (~200 righe): card con avatar iniziali, email/tel cliccabili, badge pratiche, modal add/edit, conferma delete, ricerca per nome/email/città.
- **`src/components/suppliers/FornitoriView.jsx`** (~220 righe): filtro categoria (7 valori), ricerca testo, modal add/edit con select categoria.
- **`src/components/dossiers/PraticheView.jsx`** (~330 righe): lista con KPI badge per status, filtro status chip, card con numero/titolo/cliente/destinazione/date/pax/budget/task-count, slide-over dettaglio con cambio status + task collegati + elimina.

### 🔗 Wiring

- **Sidebar**: +3 voci `Clienti / Fornitori / Pratiche` (ruoli admin/manager/agent; driver non vede CRM).
- **VoyageDesk**: idratazione CRM one-shot (`Promise.all` al mount, no realtime); dispatch CRM con sync Supabase fire-and-forget; `ADD_DOSSIER` backfilla il `number` con quello generato dal trigger; `renderView` esteso con i 3 nuovi case.

### Build

```
dist/assets/index-*.js    245.71 kB │ gzip: 58.15 kB   (+7.25 kB gz vs Phase 2g — 3 nuove viste)
117 moduli trasformati. ✅
```

### Note permessi

- Driver non vede le viste CRM.
- RLS DB: select/insert/update per admin+manager+agent; delete solo admin+manager.

### Caveat aperti post-Fase 1

- **#26** — Collegamento Task ↔ Pratica: `tasks.dossier_id` non popolato da QuickAddTask/TaskSlideOver (UI mancante, schema pronto).
- **#27** — DossierSuppliers: nessuna UI per collegare fornitori a una pratica (`PraticaDetail` manca il pannello fornitori).

---

## v2.0-dev — Step P Phase 2g + quick win Pri 2/3 (sessione 18)

> Cumulativo sopra v1.9-dev. **Mergeati in `main`** (squash): #41 (Phase 2g), #42 (#10), #43 (#18), #44 (#3), #45 (#8). **In PR draft**: #46 (#2), #47 (#25).

### ⚡ Phase 2g — code-splitting `React.lazy` (PR #41)
- `React.lazy` + `<Suspense>` su 4 componenti pesanti on-demand: `AdminView` (Suspense su `renderView()`), `BulkTaskCreator` e `TaskSlideOver` (Suspense overlay) in `VoyageDesk.jsx`; `AIDayPlanner` in `Dashboard.jsx`. Named export → `import(...).then(m => ({ default: m.X }))`.
- Nuovo `LazyFallback` (spinner inline che riusa il keyframe `spin`): overlay per i modali, riempimento area per la vista.
- Bundle `index`: **268.60 → 205.13 kB** (64.11 → **50.90 kB gz, −20%**) + chunk async AdminView 7.12 / Bulk 6.00 / AIDayPlanner 3.28 / TaskSlideOver 2.18 kB gz. **Step P COMPLETO (Phase 1 → 2g).**

### 🔁 Caveat #10 — `useDebouncedTableSubscription` (PR #42)
- Nuovo `src/hooks/useDebouncedTableSubscription.js`: astrae idratazione + subscribe realtime + reload debounced + generation counter (anti-stale, caveat #21) + cleanup. `reload(isCurrent)` fonde `cancelled`+gen-counter; `reload` in un `ref` (no re-subscribe per render).
- `VoyageDesk.jsx`: 4 effetti (tasks+comments, notices, notifications, chat) → 4 chiamate dichiarative. **Presence effect intatto** (heartbeat + callback incrementale).

### 🔤 Caveat #18 — mojibake import CSV (PR #43)
- `BulkTaskCreator` ImportTab: `readAsArrayBuffer` + `Uint8Array` + `XLSX type "array"` (era `readAsBinaryString` + `type "binary"`). SheetJS decodifica UTF-8 e rimuove il BOM dei CSV; invariato per xlsx/xls.

### 🟢 Caveat #3 — heartbeat presence (PR #44)
- `VoyageDesk.jsx`: heartbeat 45s → 30s, allineato al tick di ageing.

### 📅 Caveat #8 — distribuzione agenti calendario (PR #45)
- `CalendarPlanner`: `agentWeekDays` segue `weekOffset` anche in vista `week-full` (prima solo `week`).

### 🏷️ Caveat #2 — @menzioni robuste commenti + chat (PR #46, draft — DB già live via MCP)
- `supabase/migrations/20260614_mention_composite_names.sql`:
  - `find_mentioned_users(text)`: matcher condiviso **greedy** contro i nomi utenti reali (longest-first), boundary iniziale (no falsi positivi email) + azzeramento span (no prefissi dentro nomi più lunghi). Sostituisce la regex fragile di `20260610_step_j_fix4.sql`.
  - `notify_task_comment` riscritto sul matcher; **nuovo** `notify_message_mention` su `messages` (menzioni in chat ai partecipanti, escluso il mittente).
- UI: `src/lib/mentions.js` (gemello JS, stessi boundary) + `src/components/ui/MentionText.jsx` (chip; "a me" più marcata) in `ChatPanel` e `TaskSlideOver`.

### 👤 Caveat #25 — profilo persistente (PR #47, draft)
- `ProfileEditor.handleSave`: `Users.updateProfile(id, {name, avatar, color, photo_url})` con sessione attiva (accanto a `updateContact` per email/phone). Trigger anti-escalation lascia passare questi campi.
- `AuthContext`: normalizza `photo_url` → `photoUrl` → foto persistita ri-mostrata dopo reload. Nessuna migration.

---

## v1.9-dev — Step P: component extraction clusters (Phase 2f) (sessione 17)

> Cumulativo sopra v1.8-dev. Tutte le PR della Phase 2f sono **mergeate in `main`** (squash): #39 → #40 → #41 → #42 → #43 → #44 → #45 → #47.

Proseguimento dell'estrazione dall'albero componenti del monolite `src/VoyageDesk.jsx` in **8 cluster logici**, ciascuno con propria PR (draft), build verde, preview Vercel. Risultato cumulativo di Phase 2e + 2f: **7313 → 903 righe** (−6410, −88%); creazione della struttura modulare `src/components/` con 9 sottodirectory e 20 file estratti. **VoyageDesk.jsx è ora uno shell di orchestrazione**, importa e monta i componenti estratti. Nessuna modifica di comportamento (bundle `index` invariato ~268.6 kB / 64.1 kB gz).

### 🎁 Phase 2f — Estrazione 8 cluster componenti (PR #39–#47, 8 sessioni di estrazione)

| # | Cluster | Cartella target | File | Δ monolite |
|---|---------|-----------------|------|-----------|
| 1 | Modali | `src/components/modals/` | ProfileEditor, BulkTaskCreator, AIDayPlanner, NoticeEditorModal, QuickAddTask, AddTeamMemberModal, AddCategoryModal (7 file) | −1200 |
| 2 | Dashboard | `src/components/dashboard/` | Dashboard, NoticeBoard (2 file) | −1100 |
| 3 | Calendario | `src/components/calendar/` | CalendarPlanner (1 file, ~1250 righe) | −1250 |
| 4 | Chat | `src/components/chat/` | ChatPanel (1 file, ~1250 righe, 9 sub-componenti + helper) | −1250 |
| 5 | Task | `src/components/tasks/` | TaskSlideOver (1 file) | −200 |
| 6 | Admin | `src/components/admin/` | AdminView, adminStyles.js (2 file, stile consolidato) | −900 |
| 7 | Viste | `src/components/views/` | Team, Trash (2 file) | −500 |
| 8 | Shell | `src/components/shell/` | Topbar, Sidebar (+BottomNav locale), FAB (3 file) | −610 |

**Cumulativo Phase 2f:** −6410 righe dal monolite.

### Dettagli estrazione

- **Verbatim copy + import resolution**: ogni componente copiato integralmente da VoyageDesk.jsx, senza refactoring durante l'estrazione. Aggiunti import per dipendenze (`appGlobals`, `taskConstants`, `dispatch`, ecc.). Nessun cambio di comportamento — validazione Babel per ogni commit.
- **Helper co-locati**: i 9 sub-componenti di `ChatPanel` (ReactionPicker, VoicePlayer, MessageTextContent, ChatMessage, VoiceRecorder, ConversationView, ConversationList, NewConversationView), le 5 tab di `AdminView` (AdminTeamTab, AdminIOTab, AdminStatsTab, AdminCategoriesTab, AdminLogTab), le 4 tab di `BulkTaskCreator`, e i calcolatori iCal di `CalendarPlanner` rimangono come dichiarazioni module-local (non esportate). Clustering a livello logico.
- **CRLF preservation**: il monolite ha line endings CRLF. Ogni commit verificato con `git diff --numstat src/VoyageDesk.jsx` per garantire solo CRLF (0 valori anomali nelle colonne aggiunte/rimozioni oltre la colonna righe).
- **Build verification**: ogni commit con `npm run build` verifica che chunk `index` rimane ~268.6 kB (invarianza = refactor puro, nessun cambio comportamento).
- **Live binding intatta**: `export let TEAM`/`CATEGORIES`/`CURRENT_USER` in `appGlobals.js` e i setter rimangono il canale centrale. Nessun refactor a Context puro in questo step.
- **Stile admin consolidato**: nuovo `src/components/admin/adminStyles.js` raccoglie 13 variabili di stile (sectionH, cardStyle, labelStyle, fieldStyle, btnPrimary, btnGold, btnGhost, btnDanger, btnWarning, modalOverlay, modalCard, etc.) che erano duplicate in `AddTeamMemberModal` e `AddCategoryModal`. Entrambe ora importano e usano le stesse costanti.

### Bonus — `src/lib/xlsx.js` estrazione

Estratta la **lazy loader per SheetJS** (`loadXLSX()`) in modulo dedicato, usato da `ImportTab` (BulkTaskCreator) e `AdminIOTab` (AdminView). Rimane un `let _xlsxPromise = null` che cachea la promise di import on-demand.

### Stato post-Phase 2f

- `src/VoyageDesk.jsx`: **903 righe**. Contiene solo FontLoader (stili), AppContext, helper `t()` e `initialConversations/initialMessages` (mock chat), esportazione root `VoyageDesk` + orchestratore `VoyageDeskInner`. Delimitatori sezione (commenti `// ─── `) rimasti come breadcrumb rimando.
- `src/components/`: 9 directory (`ui/`, `modals/`, `dashboard/`, `calendar/`, `chat/`, `tasks/`, `admin/`, `views/`, `shell/`) + 20 file per cluster. Struttura logica, facile localizzare dove è ciascun componente.
- **Bundle:** chunk `index` invariato ~268.6 kB / 64.1 kB gz (refactor puro, zero cambio comportamento).
- **Tutti i test**: build verde, Vercel preview Ready per ogni PR, no CI failures.

### Caveat #15 — stato dopo Step P (Phase 1 → 2f)
✅ **COMPLETA**: `src/VoyageDesk.jsx` a **903 righe** (era 8325 in inizio Step P). Tutta la logica non-React e l'intero tree componenti sono fuori dal monolite. VoyageDesk.jsx è ora un file di orchestrazione puro.

---

## v1.8-dev — Step P: refactor monolite (Phase 1 → 2e) (sessione 16)

> Cumulativo sopra v1.7-dev. Tutte le PR della catena Step P sono **mergeate in `main`** (squash): #32 → #33 → #34 → #35 → #36 → #38.

Refactor del monolite `src/VoyageDesk.jsx` (caveat #15) in micro-PR incrementali, ciascuna con preview Vercel indipendente e build verde. Risultato cumulativo: **8325 → 7313 righe** (−1012, ~−12%); create le cartelle `src/state/` e `src/components/` + i moduli `lib/taskConstants.js` e `lib/taskUtils.js`. Nessuna modifica di comportamento (bundle `index` byte-identico a ogni fase).

### 🧹 Phase 1 — rimozione mutazione in-place globali (PR #32, `f5e0caf`)
- Rimossi `_syncTeam`/`_syncCategories`/`_syncCurrentUser` (mutavano i `let` module-level con `.length = 0` + `forEach push`). Sostituiti con **riassegnazione diretta** in tutti i 12 punti del reducer + `makeInitialState`. Le utility chiudono sulla *variabile* `let`, non sul valore → continuano a leggere il valore corrente. `docs/CLAUDE.md` aggiornato.

### 📦 Phase 2a — costanti + utility pure (PR #33, `013c900`)
- `src/lib/taskConstants.js` (nuovo): `PRIORITIES`, `STATUSES`, `STATUS_LABELS`, `STATUS_COLORS`, `NOTICE_COLORS`, `TASK_TEMPLATES`.
- `src/lib/taskUtils.js` (nuovo): `formatDate`/`formatTime`, `getDayKey`, `isOverdue`/`isUrgent`, `isActiveTask`/`getActiveTasks`/`getTrashedTasks`, `isMyTask`, `isInGlobalQueue` (utility pure, nessuna dipendenza dai globali). ~−300 righe dal monolite.

### 🗂️ Phase 2b — dati mock (PR #34, `19eebc2`)
- `src/state/mockData.js` (nuovo, cartella `state/` creata): `INITIAL_TEAM` (7), `INITIAL_CATEGORIES` (10), `INITIAL_TASKS` (27), `INITIAL_NOTICES` (3), `MOCK_NOTIFICATIONS` (6) + helper privato `d()`. Rinominato `NOTIFICATIONS` → `MOCK_NOTIFICATIONS` (solo fallback offline/demo). ~−100 righe.

### 🔌 Phase 2c — globali mutabili + helper permessi (PR #35, `1bc4e0b`)
- `src/state/appGlobals.js` (nuovo): `TEAM`/`CATEGORIES`/`CURRENT_USER` come **live ES-module bindings** + setter `setTeam`/`setCategories`/`setCurrentUser`; tutti gli helper team + permessi (`getMember`, `getAssignableTeam`, `getRoleType`, `isAdmin`, `isDriver`, `canViewTask`, `canEditTask`, `canCreateTaskCategory`, `canAccessAdmin`, `getAvailableCategories`, `getVisibleTasks`).
- **Insight**: `export let X` + `setX()` funziona perché gli importatori leggono la live binding; i moduli esterni non possono riassegnare un `let` importato (read-only) → i setter sono obbligatori. ~−70 righe.

### 🎛️ Phase 2d — reducer + makeInitialState (PR #36, `c063500`)
- `src/state/reducer.js` (nuovo, ~400 righe): `baseReducer`, `reducer` (wrapper Admin pre-check + activity log), `LOGGED_ACTIONS`, `buildLogEntry`, `ADMIN_ONLY_ACTIONS`, `makeInitialState`. VoyageDesk.jsx perde l'intero blocco reducer (~−370 righe): resta solo `AppContext` + albero componenti.
- **Gotcha CRLF**: il monolite ha line endings CRLF; una normalizzazione accidentale a LF gonfiava il diff a migliaia di righe. Risolto con riconversione CRLF prima del push. Lesson learned in CLAUDE.md (nota #7).

### 🧩 Phase 2e — avvio estrazione albero componenti (PR #38, `79b5b42`)
- Primo slice della **component extraction** in `src/components/`: foundation responsive + primitive presentazionali a basse dipendenze.
  - `components/Viewport.jsx`: `ViewportContext`, `useViewport`, `ViewportProvider`.
  - `components/SwipeActions.jsx`: swipe mobile (Fatto/Cestino/Inoltra).
  - `components/ui/`: `Avatar`, `PriorityBadge`, `CategoryChip`, `StatusBadge`, `Toast`.
- VoyageDesk.jsx importa gli estratti; definizioni inline rimosse (7668 → 7313 righe). Delimitatori di sezione lasciati come note di rimando. Build: 91 moduli (+7 file), `index` 268.57 kB invariato.

### Caveat #15 — stato dopo Step P (Phase 1 → 2e)
🔶 **Parziale**: `src/VoyageDesk.jsx` a 7313 righe (era 8325). Tutta la logica non-React è fuori dal monolite; l'estrazione dell'albero componenti è **avviata** (atoms + foundation). Restano da estrarre i cluster grandi: modali, dashboard/code, calendar, chat, tasks, admin, viste, shell.

---

## v1.7-dev — Step R + Step S: drift DB + user_contacts (sessione 15)

> Cumulativo sopra v1.6-dev.

- **Step R** (PR #30, `6245a14`): versionate 14 migrazioni mancanti → repo ricostruibile da zero. Caveat #19 chiuso.
- **Step S** (PR #31, `75358e2`): cablato `email`/`phone` su `public.user_contacts` (`Users.getContacts`/`updateContact`; `loadProfile` rimergia i contatti; `ProfileEditor.handleSave` persiste). Caveat #24 chiuso.
- Dettaglio in `docs/HANDOFF_SESSION_2026-06-13_v9.md` §1-3.

---
## v1.6-dev — Step Q: Hardening realtime + chat (sessione 14)

> Cumulativo sopra v1.5-dev (PR #22 + #23 mergeate, code-review chiusa, handoff v7 attivo).

Chiude i 4 finding aperti della code-review di sessione 13 (#2 race init/realtime, #5 withOrigin parziale, #6 toast reactions/markRead, #9 markRead batch) + caveat #4 verificato come non-issue.

### 🛰️ Q.1 — withOrigin completo (caveat #23, finding #5)
- `supabase/migrations/20260612_origin_tagging_comments_users.sql` (applicata via MCP):
  - `origin_client uuid` su `public.comments` e `public.users` (nullable, retrocompat).
  - `REPLICA IDENTITY FULL` su entrambe (il filtro echo funziona anche su DELETE).
- `src/lib/api.js`: `withOrigin` su `Comments.create`, `Users.updateProfile`, `Users.setActive`, `Users.setPresence`. Step L copriva tasks/notices/conversations/messages; mancavano queste due tabelle live.

### ⚡ Q.2 — Race init / realtime con generation counter (caveat #21, finding #2)
- `src/VoyageDesk.jsx`: i tre `useEffect` di idratazione live (tasks+notices, notifications, chat) usavano solo un flag `cancelled` (gestiva solo l'unmount). Se un `reload()` era in volo e un evento realtime ne triggerava un secondo, l'ordine di completamento non era garantito → un load più vecchio poteva sovrascrivere uno più nuovo.
- Pattern: contatore locale `loadGen` (separato per tasks/notices, condiviso per chat conv+msgs), snapshot prima della/e fetch, check post-await/then → scarta se non è l'ultimo.

### 🔔 Q.3 — Toast su errori reactions/markRead chat (caveat #22, finding #6)
- `src/VoyageDesk.jsx`: gli errori di `MessagesAPI.setReactions` e `MessagesAPI.markRead` nel wrapper `setMessagesRaw` venivano solo loggati. Ora dispatch toast `error` con messaggio specifico, allineato al pattern degli altri errori chat (`msg.send`).

### 📨 Q.4 — RPC bulk markRead chat (caveat #6, finding #9)
- `supabase/migrations/20260612_messages_mark_read_bulk.sql` (applicata via MCP):
  - `public.messages_mark_read(conv_id uuid, reader_id uuid, origin uuid)` → integer. Un singolo UPDATE che appende `reader_id` ad `read_by` per tutti i messaggi non letti della conv (escluso `sender = reader`). Imposta anche `origin_client = origin` per il filtro echo realtime.
  - `security invoker` + `grant authenticated`.
- `src/lib/api.js`: `Messages.markReadBulk(conversationId, userId)` chiama la RPC con `origin = getClientId()`.
- `src/VoyageDesk.jsx`: nuovo `markConversationRead(convId)` in `VoyageDeskInner`. Bypassa il wrapper `setMessages` (che farebbe N UPDATE) → update locale ottimistico via `setMessagesRaw` + 1 RPC. Passato a `ChatPanel` → `ConversationView`; l'effetto "mark as read on open" lo chiama invece di mappare i messaggi via `setMessages`. Costo aprire una conv non letta: **da N round-trip + N eventi realtime a 1 + 1**.

### ✅ Q.5 — Index `messages(conversation_id)` (caveat #20)
Già presente: `idx_messages_conversation(conversation_id, created_at DESC)` copre `listForConversation` (PG può traversarlo bidirezionalmente).

### 🔍 Q.6 — RLS realtime users (caveat #4) → non-issue
Verifica policy `users_select_all`: `qual='true'` per ruolo `authenticated` → tutti gli utenti loggati vedono tutti gli utenti, by-design (roster team completo). Realtime consegna correttamente eventi per ogni riga `SELECT`-abile → nessun leak da bloccare. Caveat #4 chiuso come non-issue (intenzionale).

### Verifica build (commit ultimo Q.4)
```
dist/index.html                     0.50 kB │ gzip:   0.30 kB
dist/assets/react-*.js            140.87 kB │ gzip:  45.26 kB
dist/assets/supabase-*.js         211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js            266.31 kB │ gzip:  64.25 kB  (+~0.3 kB gz vs PR #22)
dist/assets/xlsx-*.js             429.03 kB │ gzip: 143.08 kB
```

---

## v1.5-dev — Storage file chat + Logout UI (sessione 13)

> Cumulativo sopra v1.4-dev (Step N mergeato su `main` via PR #18).

### 📎 Step M — Storage file chat reale (caveat #7)
- `supabase/migrations/20260611_chat_files_storage.sql` (applicata via MCP):
  - Nuova colonna `messages.file_url text` (path nel bucket, non URL pubblica).
  - Bucket privato `chat-files` (limite 25 MB/file).
  - Policy RLS su `storage.objects`: path convention `<conversation_id>/<uuid>-<nomefile>` — select/insert consentiti solo ai partecipanti della conversazione (admin può leggere), delete solo a owner/admin.
- `src/lib/api.js`:
  - `Messages.uploadFile(file, conversationId)`: upload sul bucket con nome file sanificato, ritorna `{ path }`.
  - `Messages.getFileUrl(path)`: signed URL temporanea (1h) per download/preview.
- `src/lib/mappers.js`: `file_url ↔ fileUrl` in `fromDbMessage`/`toDbMessage`. `fileSize` reale è ora bigint in byte.
- `src/VoyageDesk.jsx` (Chat):
  - `sendFile` non genera più sample hardcoded: il menu allegati apre il picker nativo (accept per PDF / immagini / Office), fa upload reale e invia il messaggio con `fileName`/`fileSize` (byte)/`fileType`/`fileUrl`. Indicatore ⏳ durante l'upload, toast su errore.
  - Nuovi helper `fileKindFromName` (icona da estensione) e `formatFileSize` (byte → "245 KB", passthrough per le stringhe dei vecchi mock).
  - Click sul bubble file → signed URL → apertura in nuova tab. I vecchi messaggi sample (senza `fileUrl`) restano renderizzati ma non cliccabili.
  - Conv mock (id non-UUID, smoke-test senza login): nessun upload, messaggio solo locale.

### 🚪 Step O — Logout UI (caveat #16)
- `src/VoyageDesk.jsx` (`UserSwitcher`): nuova voce "🚪 Esci" in fondo al menu utente. On click: `setPresence('offline')` best-effort → `signOut()` di `AuthContext` → l'`AuthGate` in `main.jsx` ri-renderizza `LoginScreen`. Stato "Uscita…" durante l'operazione, toast su errore.
- Niente più finestre incognito / pulizia manuale `sb-*-auth-token` per cambiare utente.

### 🩹 Fix code-review sessione 13 (PR #22, squash `787a132`)

Code-review approfondita (7 angoli × 6 candidati → verifica 1-vote, ~40 candidati grezzi → 10 finding sopravvissuti). 6 finding chiusi qui; 4 restano aperti → Step Q.

**🔴 Finding #1 (alta) — Eco DELETE realtime (regressione Step L)**
- `src/lib/api.js` (`subscribeToTable`): il filtro `origin_client` leggeva solo `payload.new` → gli eventi DELETE (che hanno solo `payload.old`) non venivano mai filtrati e tornavano sul tab che li ha originati, ricomparendo brevemente in UI fino al refetch.
- Ora `payload?.new?.origin_client ?? payload?.old?.origin_client` con fallback su `payload.new`.
- `supabase/migrations/20260611_replica_identity_full.sql`: `REPLICA IDENTITY FULL` su `public.tasks`/`notices`/`conversations`/`messages` — di default `payload.old` contiene solo la PK; con FULL contiene la riga intera (incluso `origin_client`). Applicata via MCP e verificata (`relreplident='f'` su tutte e 4).

**🔴 Finding #3 (alta) — Caveat #17 risolto (TEAM mock al primo login)**

Doppia causa radice:
1. `src/auth/AuthContext.jsx` + `src/main.jsx` (`AuthGate`): `onAuthStateChange` imposta `session` prima che `loadProfile` completi. `AuthGate` montava `VoyageDesk` con `initialTeam=[]` e `useReducer` (che inizializza una volta sola) congelava i mock seed. Ora `AuthGate` resta in loading finché `profile` non è disponibile.
2. `src/VoyageDesk.jsx` (`makeInitialState`): `team: TEAM` / `categories: CATEGORIES` erano **alias** dei `let` globali. I `_syncTeam`/`_syncCategories` mutano i globali in-place, quindi cambiavano lo state sotto React senza nuovo riferimento → niente re-render. Ora lo state riceve **copie** (`[...TEAM]`, `[...CATEGORIES]`).

**🔴 Finding #4 (media) — Ordinamento conversazioni stantio**
- `src/lib/api.js` (`Conversations.update`): pin/rename non toccavano `updated_at` (nessun trigger `moddatetime` sul DB) ma `listMine` ordina per `updated_at DESC` → la lista non si riordinava dopo refresh. Ora il patch di default imposta `updated_at = now()` (sovrascrivibile dal chiamante).

**🟢 Minori**
- `src/lib/api.js` (`Messages.getFileUrl`): cache in-memory `Map<path,{url,expiresAt}>` con TTL 55min (signed URL dura 1h, buffer 5min). Click ripetuti sullo stesso allegato non rigenerano la URL.
- `src/VoyageDesk.jsx` (`sendFile`): validazione client `MAX_FILE_SIZE=25MB` (allineata al limite bucket) + guardia `mountedRef` contro `setState` dopo unmount se l'utente chiude la chat mid-upload.
- `src/VoyageDesk.jsx` (`openTaskById`): `dispatch` aggiunto nelle deps del `useCallback`. Per evitare TDZ (`dispatch` era dichiarato 140 righe dopo), la definizione di `dispatch` + `currentUserIdRef` è stata spostata prima del callback (refactor neutro).

### 📋 Finding aperti → Step Q

| # | Severità | Cosa |
|---|----------|------|
| 2 | 🟡 media | Race init chat / realtime: `reload()` async non awaitato prima del subscribe, un evento realtime può sovrascrivere dati più nuovi |
| 5 | 🟡 media | `withOrigin` mancante su `Comments.create`, `Users.updateProfile`, `Users.setPresence` → eco realtime su comments/users |
| 6 | 🟡 media | Errori di `setReactions`/`markRead` chat solo `console.log`, niente toast né rollback ottimistico |
| 10 | 🟢 bassa | Tre `useEffect` quasi identici (subscribe+debounce) duplicano la logica → hook `useDebouncedTableSubscription` |

### 🆕 Caveat aperti aggiornati (sessione 13 — vedi `HANDOFF_SESSION_2026-06-11_v7.md`)

- **#5** definitivamente chiuso (eco realtime, anche DELETE).
- **#7** chiuso (Step M).
- **#16** chiuso (Step O).
- **#17** chiuso (PR #22 — doppia causa: race AuthGate + alias mutabile).
- **#19 NEW** — Drift repo↔DB: `20260610_step_j_fix2.sql` manca dal repo (applicata solo via MCP), DDL tabelle base non versionato, def stale `notify_queue_stale` in `notifications_extra.sql`. → Step R.
- **#20 NEW** — Index mancante su `messages(conversation_id)` (FK non indicizzata, usata da `listForConversation`). → Step Q.
- **#21 NEW** — Race init chat / realtime (finding #2). → Step Q.
- **#22 NEW** — Errori reactions/markRead chat senza toast (finding #6). → Step Q.
- **#23 NEW** — `withOrigin` parziale: mancante su comments/users (finding #5). → Step Q.

---

## v1.4-dev — Code-splitting bundle (sessione 12)

> Cumulativo sopra v1.3-dev (Step L mergeato su `main` via PR #16). Step N mergeato su `main` via PR #18 (squash `66f5ba7`).

### 🆕 Caveat aperti rilevati in sessione 12 (vedi `HANDOFF_SESSION_2026-06-11_v6.md`)
- **#16 — Logout mancante UI**: `AuthContext.signOut` esiste ma non è collegato a nessun componente. Workaround attuale: pulire `localStorage` (`sb-*-auth-token`). Da risolvere con Step O.
- **#17 — TEAM seed locale**: al primo login si vedono i nomi mock vecchi, sovrascritti solo dopo refresh esplicito. Cosmetico.
- **#18 — Encoding mojibake intestazioni preview CSV**: "PrioritÃ " al posto di "Priorità". Solo preview, non blocca l'import.

### 📦 Step N — Code-splitting (caveat #15)
Obiettivo: ridurre il chunk JS iniziale (era un unico bundle da ~1039 KB / 303 KB gz, con warning Vite >500 KB).

- **Lazy-load `xlsx`** (`src/VoyageDesk.jsx`): rimosso l'`import * as XLSX` statico. Nuovo helper module-level `loadXLSX()` che fa `import("xlsx")` on-demand e cachea la promise. I due unici call site (`handleFile` parsing import, `exportExcel`) ora sono `async` e fanno `const XLSX = await loadXLSX()`. SheetJS (~429 KB) esce dal bundle iniziale e diventa un chunk async caricato solo quando l'utente importa/esporta un file.
- **`vite.config.js` — `manualChunks`**: `react`+`react-dom` e `@supabase/supabase-js` in chunk vendor dedicati. Cambiano di rado → restano in cache del browser tra i deploy.

**Risultato build:**

| Chunk | Prima | Dopo |
|-------|-------|------|
| principale (app) | 1039 KB (303 KB gz) | **262 KB (63 KB gz)** |
| `react` vendor | — | 141 KB (45 KB gz) |
| `supabase` vendor | — | 211 KB (54 KB gz) |
| `xlsx` (async, on-demand) | incluso nel bundle | 429 KB (143 KB gz), **fuori dal load iniziale** |

Load iniziale in gzip: ~303 KB → **~162 KB**. Warning Vite >500 KB rimosso. Target handoff "chunk principale ~400 KB" superato (262 KB).

> Nota: lo split a livello di componente (`React.lazy` su `CalendarPlanner`/`AdminView`/`Trash`/`BulkTaskCreator`/`AIDayPlanner`) richiede prima di estrarre i componenti dal monolite `VoyageDesk.jsx` in moduli separati — rimandato (vedi caveat #15, ancora aperto per il refactor strutturale).

---

## v1.3-dev — Origin-tagging realtime (sessione 12)

> Cumulativo sopra v1.2-dev (PR #15 mergeata su `main`).

### 🛰️ Step L — Origin-tagging realtime (caveat #5)
- `supabase/migrations/20260611_origin_tagging.sql`: nuova colonna `origin_client uuid null` su `public.tasks`, `public.notices`, `public.conversations`, `public.messages`. Colonna nullable per retrocompat (client che non taggano restano funzionanti, le righe già esistenti rimangono `NULL`).
- `src/lib/clientId.js` (nuovo): `getClientId()` ritorna un UUID stabile per tab, persistito in `sessionStorage` (chiave `vd_client_id`). Fallback in-memory se `sessionStorage` non disponibile. Cache in modulo per evitare letture ripetute.
- `src/lib/api.js`:
  - Nuovo helper `withOrigin(payload)` che aggiunge `origin_client: getClientId()`.
  - `Tasks.create/update/softDelete/restore`, `Notices.create/update/togglePin`, `Conversations.create/update`, `Messages.send/setReactions/markRead` ora taggano automaticamente ogni mutation. I call site in `VoyageDesk.jsx` non richiedono modifiche.
  - `subscribeToTable(table, handler)` ora filtra payload con `payload.new.origin_client === getClientId()` PRIMA di invocare l'handler: il client che ha generato la mutation scarta l'eco realtime ed evita il flash di re-render dopo l'update ottimistico. `DELETE` (senza `payload.new`) viene sempre propagato.
- **Effetto**: caveat #5 risolto. Update ottimistici (es. cambio stato task, send messaggio chat, pin notice) non producono più il flicker del refetch successivo.

---

## v1.2-dev — Notifiche complete (sessione 11)

> Cumulativo sopra v1.1-dev. PR su branch `claude/step-j-notifications`.

### 🔔 Step J — Notifiche complete
- `supabase/migrations/20260610_notifications_extra.sql`:
  - **Anti-eco `task_assigned`**: la funzione `notify_task_assigned` ora salta l'utente che effettua l'auto-assegnazione (`auth.uid()`), risolvendo il caveat #1.
  - **Trigger `trg_notify_task_comment`** su `INSERT` di `public.comments`: per ogni nuovo commento genera (a) notifica `mention` per ogni `@nome` matchato in `users.name` (case-insensitive, escluso autore), (b) notifica `comment` per ogni `assignee` non già menzionato e non autore.
  - **Funzione `notify_task_due`**: scansiona task con `due_date` nelle 24h successive (non `done`, non cestinate) e genera notifica `task_due` per ogni assignee, de-duplicando entro 22h sullo stesso `task_id`.
  - **Funzione `notify_queue_stale`**: task in coda globale (`assignees = []`, `status = todo`) creati da > 4h → notifica `queue_stale` a tutti i Manager / Admin / Senior Agent attivi (de-duplica entro 4h).
  - **pg_cron**: `notify_task_due_daily` (`0 8 * * *` UTC), `notify_queue_stale_hourly` (`5 * * * *`). `create extension if not exists pg_cron;` + idempotenza via `cron.unschedule`.
- `src/VoyageDesk.jsx`:
  - `NotificationsPanel` accetta `onOpenTask`: click su notifica con `payload.task_id` apre la `TaskSlideOver` e chiude il pannello.
  - Hover effect sulle notifiche navigabili, cursore `pointer` quando il payload contiene `task_id`.
  - `notifTitle`: titoli arricchiti per `mention` (mostra task_title) e `queue_stale` (mostra task_title).
  - Nuovo callback `openTaskById(taskId)` in `VoyageDeskInner`: lookup task non cestinata + `SET_SELECTED_TASK`.
  - `Topbar`: nuovo prop `onOpenTask` propagato al panel.

### Caveat residui dopo Step J
- ~~#1 Auto-assegnazione genera notifica~~ → risolto.
- #2 ridotto: rimangono solo eventuali edge case su mention con nomi composti molto simili tra loro.
- I cron job dipendono da `pg_cron` installato sul progetto (incluso nella migrazione). Verificare in dashboard Supabase > Database > Extensions dopo l'apply.

### 🔧 Step J — Fix post-applicazione (`20260610_step_j_fix.sql`)
- **Grant EXECUTE** su `public.is_manager_or_admin()` ai ruoli `authenticated` e `anon`: la funzione era usata in policy RLS di `tasks` ma non eseguibile dall'utente loggato → tutti INSERT/UPDATE tasks fallivano con `permission denied for function is_manager_or_admin`.
- `notify_queue_stale` allineata ai ruoli reali in `public.users` (lowercase `manager`,`admin`); rimosso `Senior Agent` inesistente nello schema.

### 🐛 fix(#11) — Notifiche mock fittizie in UI
- `src/VoyageDesk.jsx` (`Topbar`): la logica precedente faceva fallback all'array `NOTIFICATIONS` (mock "Newsletter Giugno", "Hotel Overwater Bungalow", ecc.) ogni volta che `public.notifications` era vuota.
- Ora gate-ata dietro `import.meta.env.DEV && VITE_SHOW_MOCK_NOTIFICATIONS === 'true'`. Default off → in produzione mai mock; in dev solo se la flag è esplicitamente attivata.
- Comportamento: lista vuota da DB → badge a 0 e pannello vuoto (corretto).

### 🔗 Step K — Task link in chat via `task_ref` UUID
- `src/VoyageDesk.jsx`:
  - `ChatPanel`: nuovo state `prefillTaskRef` popolato insieme a `prefillText` quando `intent.taskLink` apre la chat da una task. Passato a `ConversationView` come `initialTaskRef`. Resettato su `onBack` e `onInitialInputConsumed`.
  - `ConversationView`: nuovo state `pendingTaskRef`. `sendText` allega `taskRef: pendingTaskRef` al messaggio se il testo contiene ancora il pattern `🔗 Riferimento task`. Il taskRef è consumato dopo la send.
  - `MessageTextContent`: lookup preferito per `taskRef` UUID; fallback al match per titolo per messaggi vecchi (deprecato, compat).
- Mappers (`src/lib/mappers.js`): già supportava `task_ref` ↔ `taskRef`. Nessuna modifica al DB.
- Risolve caveat #9: rinominare un task non rompe più i pill di riferimento nei messaggi già inviati.

### 🐛 fix(#14) — Demo switch (ACCEDI COME) confondeva RLS
- `src/VoyageDesk.jsx` (`UserSwitcher`): il blocco "ACCEDI COME (DEMO MULTI-RUOLO)" cambiava solo `currentUser` lato UI, mentre `auth.uid()` server-side restava l'utente reale loggato → RLS leggeva sempre come utente reale, falsando i test di notifiche/presence/permessi.
- Ora gate-ato dietro `import.meta.env.DEV && VITE_DEMO_SWITCH === 'true'`. Default off in prod e in dev. Attivabile solo esplicitamente in `.env.local` per test multi-ruolo controllati.
- Resta visibile sempre "Modifica profilo" — solo la lista candidati e il titolo "ACCEDI COME" sono gate-ati.

---

## v1.1-dev — Robustezza sync + Notifiche + Calendario + Chat estesa + Dashboard (sessione 10)

> Cinque step in cumulativo sopra v1.0-dev. PR da aprire su branch `claude/step-e-sync-robustness`.

### 🛡️ Step E — Robustezza sync
- Reducer: nuovo case `SHOW_TOAST` come canale unificato per notificare errori dal layer di persistenza.
- Wrapper dispatch (Supabase): ogni `Promise.catch` ora emette toast rosso con messaggio leggibile invece del solo `console.error`.
- Idratazioni iniziali `TasksAPI.list`, `NoticesAPI.list`, `ConversationsAPI.listMine`, `MessagesAPI.listAll`: errori convertiti in toast.
- Persist chat (`setConversations`, `setMessages`): toast su fallimento `conv.create`, `conv.update`, `msg.send`.
- `LoginScreen.localizeAuthError`: mappa codici Supabase (`invalid_credentials`, `email_not_confirmed`, `user_banned`, `rate_limit`, errori di rete) in messaggi italiani; `try/catch` su `signIn`.
- `ChatPanel`: nuovo prop `loading` + mini-spinner che evita il flash "nessun messaggio" durante l'idratazione iniziale in modalità Supabase. Stato `chatLoading` setato `false` dopo il primo reload.
- Nuovo keyframe globale `@keyframes spin`.

### 🔔 Step F — Notifiche reali
- `supabase/migrations/20260609_notifications.sql`:
  - tabella `public.notifications` (`id`, `user_id`, `type`, `payload jsonb`, `read`, `created_at`);
  - indici su `(user_id, read, created_at desc)` e `(created_at desc)`;
  - RLS: SELECT/UPDATE/DELETE solo per `user_id = auth.uid()`; nessun INSERT lato client (solo trigger server);
  - `notifications` aggiunta a `supabase_realtime`;
  - funzione `notify_task_assigned` + trigger `trg_notify_task_assigned` su INSERT/UPDATE OF `assignees` su `public.tasks`: genera una notifica `task_assigned` per ogni nuovo assignee.
- `src/lib/api.js`: `Notifications.{list, listUnread, markRead, markAllRead, remove}`.
- `src/lib/mappers.js`: `fromDbNotification` (camelCase, `createdAt`).
- `src/VoyageDesk.jsx`:
  - state `notifications` + effect di idratazione + realtime subscribe;
  - `markNotificationRead` / `markAllNotificationsRead` (ottimistici + toast su errore);
  - `Topbar` passa `notifications` e gli handler a `NotificationsPanel`;
  - `NotificationsPanel` ridisegnato: `notifTitle` per type da payload, `notifTime` relativo ("5 min fa"), click su non-lette le marca lette, header con bottone "Segna tutte lette";
  - `NavBadge` su `Sidebar` e `BottomNav`: Admin = agenti pending, Dashboard = task in coda globale.

### 🗓️ Step G — Calendario avanzato
- `CalendarPlanner`: `viewMode` esteso a `"day"` e `"week-full"` (oltre a `month` e `week`).
- **Vista Giorno**: colonna ore 00–23 (slot 44px), eventi posizionati assoluti per `dueDate + estimatedHours`, linea orizzontale dorata per l'ora corrente se è il giorno odierno.
- **Vista Settimana piena**: griglia 7 giorni × 24 ore con eventi assoluti per giorno/ora; sfondo giallo tenue sulla colonna del giorno corrente.
- Toggle ordinato: Giorno · Settimana · Sett. piena · Mese.
- Navigazione prev/today/next: gestisce il `dayDate` in vista Giorno, `currentMonth` in vista Mese, `weekOffset` in vista Settimana/Sett. piena.
- **Export iCal**: bottone "⤓ iCal" in header. `exportTasksToIcs` costruisce un `.ics` RFC5545 conforme con DTSTART/DTEND su `estimatedHours`, escape caratteri, download via Blob + `URL.createObjectURL`. Filename `voyagedesk-tasks-YYYY-MM-DD.ics`.

### 💬 Step H — Estensioni chat
- `MessageTextContent`: parser regex `🔗 Riferimento task: "TITLE"
📅 Scadenza:...

` → rende una pill cliccabile sopra il messaggio. Click → `dispatch({ type: "SET_SELECTED_TASK", payload: t })` apre il `TaskSlideOver`. Disabled se la task non esiste.
- `ChatContext` espone ora `tasks`, `currentUserId`, `dispatch`, `presenceMap`.
- `ConversationList.matchesSearch` esteso: filtro su nome conversazione + nomi partecipanti + ultimi 30 messaggi (testo + filename).
- **Presence online/away/offline**:
  - `supabase/migrations/20260609_user_presence.sql`: colonne `status` (`online`|`away`|`offline`) e `last_seen_at` su `public.users`, policy `users update self presence`, `users` in `supabase_realtime`.
  - `Users.setPresence(id, status)`.
  - `VoyageDeskInner`: state `presenceMap`, heartbeat ogni 45s, `visibilitychange` → `away`, `beforeunload` → `offline`, subscribe realtime a `users`. Tick di re-render ogni 30s per l'ageing.
  - `computePresence(user)` da `last_seen_at`: <60s online, <5min away, altrimenti offline. Colori: `#2D7A4F` / `#E0A800` / `#94a3b8`.
  - `ConversationList`: indicatore presenza sull'avatar diretto ora dinamico (era `var(--success)` fisso).

### 🚀 Step I — Quick wins Dashboard
- `Dashboard.takeOwnership`: se la task era in `todo`, viene automaticamente spostata in `inprogress` insieme all'auto-assegnazione; toast custom `Hai preso in carico: [titolo]` con `swipe: true` (undoable).
- Badge Admin (agenti pending) e Dashboard (coda globale) già consegnati nello Step F.

---

# CHANGELOG — VoyageDesk

## v1.0-dev — Persistenza Supabase + Auth (sessione 9, PR #13)

> Migrazione da dati in-memory a Supabase: autenticazione reale, tutti i dati principali persistiti e sincronizzati in realtime.

### 🔐 Autenticazione reale
- `src/auth/AuthContext.jsx` — `AuthProvider` con `session`, `profile`, `team`; `signIn`/`signOut` via Supabase Auth.
- `src/auth/LoginScreen.jsx` — form login email/password, gestione errori.
- `src/main.jsx` — `AuthGate`: mostra `LoginScreen` senza sessione, `VoyageDesk` con sessione (loading state intermedio).

### 🗃️ Layer dati
- `src/lib/supabase.js` — client Supabase (env vars Vite).
- `src/lib/api.js` — CRUD per Users, Tasks, Comments, Notices, Conversations, Messages; `subscribeToTable` helper realtime.
- `src/lib/mappers.js` — `fromDb`/`toDb` + patch per Task, Comment, Notice, Conversation, Message; helpers `isUuid`/`newId`.

### 📦 VoyageDesk — modalità Supabase
- `makeInitialState({ team, currentUserId })` — factory che sincronizza i `let` globali TEAM/CURRENT_USER se riceve dati reali dal DB; senza argomenti usa i mock (dev/preview).
- `VoyageDeskInner` accetta `initialTeam` e `initialCurrentUserId` props.
- Effect mount: idrata tasks, notices, conversations, messages dal DB.
- Realtime: subscribe su tasks, comments, notices, conversations, messages con reload debounced 200ms.
- Dispatch wrapper: persiste fire-and-forget ADD/UPDATE/MOVE/DELETE/PURGE/EMPTY_TRASH per task, ADD_COMMENT, ADD/UPDATE/DELETE/TOGGLE_PIN per notice, create/update per conversation, send/reactions/readBy per messages.
- `ADD_COMMENT`: autore usa `getMember(CURRENT_USER)?.name` (era hardcoded "Marco Ferretti").
- Nuovi id normalizzati in UUID per tutte le entità create lato app (era "t"+Date.now()).

### 🗄️ Supabase DB — migrazioni
- `users_add_capacity_and_avatar` — colonna `capacity int default 10` + avatar iniziali su seed.
- `enable_realtime_for_app_tables` — tasks, comments, notices in publication.
- `enable_realtime_for_chat_tables` — conversations, messages in publication.

### 📁 Infrastruttura
- `.gitignore` aggiunto (node_modules, dist, .env).
- `package-lock.json` pinnato.

### ⚠️ Caveat noti
- Errori sync solo in console (nessun toast utente se la persist fallisce).
- Reload completo a ogni evento realtime (non incrementale).
- File allegati in chat: `fileSize` su DB è `null` (storage da integrare).
- `UNDO_LAST_ACTION` opera solo in-memory.

### 📈 Metriche
- `src/VoyageDesk.jsx`: ~7071 → **~7420 righe** (+349).
- File aggiunti: 4 (`auth/AuthContext.jsx`, `auth/LoginScreen.jsx`, `lib/supabase.js` già contato, `lib/mappers.js`).

---

## v0.9-dev — Ristrutturazione UI + Profilo + Handoff (sessione 8)

> Semplificazione interfaccia, unificazione viste, nuovo profilo utente, preparazione per migrazione a progetto Vite.

### 🗑️ Rimossi dalla Dashboard
- **KPI Cards** (4 counter: Task Visibili, In Scadenza, Completati Oggi, In Lavorazione) — rimossi con intero contenitore e variabili.
- **Pannello "Attività Settimanale"** (grafico a barre mock) — rimosso.
- **Pannello "Per Categoria"** (barre progresso) — rimosso.

### 📊 Dashboard: nuove tab code
- **4 tab cliccabili** (Coda Globale 🌐, Coda Personale 👤, Scadute 📅, Urgenti ⚠️) con badge contatore.
- Filtro a sezione singola: una sola coda visibile alla volta.
- Default: Coda Personale. Driver: vede solo Personale + Scadute.
- Nuovo componente `QueueTab` (card tab) + `OverdueQueue` (task scaduti visibili).
- Bacheca avvisi spostata sopra le tab.

### 📅 Calendario unificato
- Fusi **Calendar** e **Planning** in un unico componente `CalendarPlanner`.
- Toggle **Mese / Settimana** in header.
- Distribuzione settimanale agenti sempre visibile sotto entrambe le viste.
- Rimossa voce "Pianificazione" da sidebar/bottom-nav → una sola voce 📅 Calendario.
- Rimossi componenti `Calendar` e `Planning`.

### 🗂️ Kanban rimosso
- Rimossi `KanbanCard`, `KanbanColumn`, `Kanban` (~190 righe).
- Rimossa voce "Kanban Board" da sidebar/bottom-nav.
- FAB multi-task (📑) ora visibile in tutte le viste (tranne Cestino/Admin).

### ↻ Ripristino dal cestino con modifica
- Click "Ripristina" → modale precompilato con tutti i campi (titolo, categoria, priorità, stato, scadenza, cliente, assegnatari, descrizione).
- Modifica opzionale prima della conferma.
- Nuova action implicita: UPDATE_TASK + RESTORE_TASK in sequenza.

### 👤 Profilo personale
- Nuovo componente `ProfileEditor` accessibile dal dropdown UserSwitcher.
- Campi: nome visualizzato, avatar (emoji/iniziali o upload foto base64), colore avatar, email, telefono. Ruolo read-only.
- Nuova action `UPDATE_OWN_PROFILE` (non admin-only, modifica solo il proprio profilo).
- `Avatar` aggiornato: mostra `<img>` se `photoUrl` presente.
- Nuovi campi member: `email`, `phone`, `photoUrl`.
- Foto visibile anche in topbar button e lista utenti.

### 📱 Fix responsive
- **Dashboard**: `minWidth: 0` + `overflow: hidden` sul container padre.
- **PersonalQueue, UnassignedQueue, UrgentOthersQueue, OverdueQueue, NoticeBoard**: padding mobile ridotto (`14px 12px` vs `18px 22px`) + `overflow: hidden`.
- **NotificationsPanel**: `position: fixed` su mobile con `left: 12px; right: 12px` (non sfora più).

### 📦 Handoff per GitHub
- Preparato pacchetto completo per repository GitHub + Claude Code:
  - `README.md`, `CLAUDE.md`, `PROJECT_SPEC.md`, `CHANGELOG.md`, `ROADMAP.md`
  - Setup Vite (`package.json`, `vite.config.js`, `index.html`, `src/main.jsx`)
  - `.gitignore`

### 📈 Metriche
- File: 6617 → **7071 righe** (netto dopo rimozioni e aggiunte).
- Componenti rimossi: 5 (Calendar, Planning, KanbanCard, KanbanColumn, Kanban).
- Componenti aggiunti: 5 (QueueTab, OverdueQueue, CalendarPlanner, ProfileEditor, RestoreEditModal inline).

---

## v0.8 — Sistema Permessi per Ruolo + User Switcher (sessione 7b)

> Introduce un sistema completo di permessi per ruolo, multi-utente mock con switcher, nuove code nella Dashboard, e integrazione chat con link ai task urgenti.

### 🔐 Sistema Permessi (UTILS — helper centralizzati)
- **`getRoleType(userId)`** → `admin` | `manager` | `agent` | `driver`. Derivato dal campo `role` del team member.
- **`canViewTask(task, userId)`** — Admin: tutto. Manager/Agent: proprie + coda globale + urgenti altrui (<24h). Driver: solo proprie task.
- **`canEditTask(task, userId)`** — Admin: tutto. Manager/Agent: proprie + globali. Driver: solo transfer + proprie/globali.
- **`canCreateTaskCategory(category, userId)`** — Driver: solo `transfer`. Altri: tutte.
- **`canAccessAdmin(userId)`** — solo Admin.
- **`getAvailableCategories(userId)`** — Driver: solo `{ transfer }`. Altri: tutte.
- **`isUrgent(task)`** — scadenza < 24h, non done, non scaduto.
- **`getVisibleTasks(tasks, userId)`** — filtro lista completo.
- **Helper di supporto**: `isMyTask`, `isInGlobalQueue`, `isAdmin`, `isDriver`.

### 🔒 Reducer con check permessi
- **Tutte le mutazioni task** (`MOVE_TASK`, `UPDATE_TASK`, `DELETE_TASK`, `ADD_TASK`, `ADD_TASKS_BULK`, `ADD_COMMENT`) verificano `canEditTask`/`canCreateTaskCategory` → toast rosso "Non hai i permessi" se bloccato.
- **`SET_VIEW`** e **`SET_SELECTED_TASK`** verificano `canAccessAdmin`/`canViewTask`.
- **11 azioni admin** (`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, ecc.) bloccate centralmente nel wrapper reducer via `ADMIN_ONLY_ACTIONS` set.
- **Cestino** (`RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`) → solo Admin.

### 🔄 UserSwitcher + SET_CURRENT_USER
- **`CURRENT_USER`** da `const` a **`let`** sincronizzato via `_syncCurrentUser(id)`.
- Nuovo campo **`state.currentUserId`** + action **`SET_CURRENT_USER`** (aggiorna stato + globale + redirect se view non permessa).
- Nuovo componente **`UserSwitcher`** in Topbar: dropdown con tutti gli agenti non-pending, ordinati per ruolo, indicatore ✓ sull'utente attivo. Sostituisce l'avatar statico.
- Al cambio utente: chiusura di chat/modali, redirect a dashboard se la view corrente è vietata.

### 🚐 Nuova categoria `transfer`
- Aggiunta in `CATEGORIES`: icona 🚐, colore lilla `#7B4F9E`, bg `#F3F0F9`.
- 2 task demo assegnati a Giulia (Driver): `t26` (Transfer Linate → Hotel) e `t27` (Transfer Hotel → Stazione).

### 📊 Dashboard ridisegnata
- **Saluto dinamico**: "Buongiorno, {firstName}" + badge ruolo per non-admin.
- **KPI "Task Visibili"** invece di "Task Totali" (filtrate per ruolo).
- **3 code condizionali**:
  - **`PersonalQueue`** (nuova) — le mie task non chiuse, ordinate per scadenza, con SwipeActions e indicatori urgent/overdue. Visibile a tutti.
  - **`UnassignedQueue`** (esistente) — nascosta a Driver.
  - **`UrgentOthersQueue`** (nuova) — task altrui con scadenza <24h, **read-only**, con bottone "💬 contatta" sotto ogni card. Bottone apre la chat con l'agente intestatario e messaggio precompilato (titolo + scadenza del task). Nascosta a Driver e Admin.

### 💬 ChatPanel esteso
- Nuove props: `intent`, `tasks`, `currentUserId`.
- **`intent: { toUser, taskLink }`** — all'apertura, cerca/crea conversazione diretta e precompila l'input con riferimento al task (titolo + data).
- Nuovo **`ChatContext`** per condividere tasks/currentUserId nella chat.
- `ConversationView`: nuove props `initialInput`, `onInitialInputConsumed`.

### 🧭 Sidebar / BottomNav filtrate per ruolo
- `NAV_ITEMS`: nuovo campo `roles` (array di ruoli ammessi).
- **`getNavItemsForUser(userId)`** — filtra voci nav.
- Trash + Admin → solo `admin`. Team + Planning → no `driver`.

### 📱 Filtri visibilità nelle viste
- **Kanban, Calendar, Team, Planning** filtrano via `canViewTask(t, uid)`.
- **QuickAddTask**: `Object.entries(availableCats)` invece di `CATEGORIES` diretto. Driver vede solo Transfer.
- **SwipeActions**: disabilitato automaticamente se `!canEditTask(task, CURRENT_USER)`.

### 📈 Metriche
- File da 6048 → **6617 righe** (+569 netti nella sessione permessi).
- Sintassi validata con Babel a ogni step intermedio.

---

## v0.7 — Swipe Actions mobile/tablet (sessione 7a)

> Swipe gesture per azioni rapide su task: Completato, Cestino, Inoltra con supporto Undo.

### 📱 Componente `SwipeActions`
- Wrapper riusabile (~210 righe). Touch swipe orizzontale verso destra.
- **Soglia 40%** larghezza card → "blocca aperto" (pannello 210px con 3 bottoni).
- Sotto soglia → torna chiuso con animazione spring.
- Tap fuori → chiude.
- Su desktop → componente trasparente (non intercetta).

### ✅ 3 azioni rivelate
- **✅ Fatto** (verde `--success`) → `MOVE_TASK` a `done`.
- **🗑 Cestino** (rosso `--danger`) → `DELETE_TASK`.
- **↪ Inoltra** (oro `--gold`) → apre dropdown con lista `getAssignableTeam()` per riassegnazione.

### ↶ Sistema Undo
- Nuovo campo **`state.lastAction`** in `initialState`.
- Nuova action **`UNDO_LAST_ACTION`** nel reducer (gestisce MOVE/DELETE/UPDATE).
- `MOVE_TASK`, `DELETE_TASK`, `UPDATE_TASK` ora accettano `swipe: true` per attivare undo.
- **Toast esteso**: supporta bottone "↶ Annulla" dorato, durata **5s** invece di 3s per azioni undoable.

### 🔌 Integrato in
- `KanbanCard` (mobile — **sostituisce il vecchio `<select>`** di v0.6, con hint "← scorri per azioni").
- `UnassignedQueue` (coda Dashboard).
- `Calendar` → dettaglio giorno.
- **Trash escluso**: le azioni Completato/Cestino/Inoltra non si applicano a task già cestinati.

### 📈 Metriche
- File da 5738 → **6048 righe** (+310).
- Sintassi validata con Babel a ogni step intermedio.

---

## v0.6 — Responsive (sessione 6)

> Full pass responsive su tutte le viste. Target: desktop + tablet + mobile (mobile-first, 320px+).

### 🧱 Fondamenta responsive
- **`ViewportProvider`** + hook **`useViewport()`** → espone `width`, `isMobile` (≤640px), `isTablet` (641–1024px), `isDesktop` (>1024px). Listener `resize` con `requestAnimationFrame` per smoothness.
- **Meta viewport** iniettato automaticamente al mount se assente (`width=device-width, initial-scale=1, viewport-fit=cover`).
- **Classi CSS responsive** definite nel `FontLoader` (media query con `!important` per superare gli stili inline):
  - `.vd-grid-kpi` → 4col → 2col (≤1024) → 1col (≤640)
  - `.vd-grid-2col`, `.vd-grid-3col`, `.vd-grid-dash-main` → collassano a 2col tablet, 1col mobile
  - `.vd-grid-collapse` → 1col su mobile (utility per form a colonne fisse strette)
  - `.vd-hide-mobile` → `display:none` ≤640px
  - `.vd-row-wrap` → forza `flex-wrap:wrap` ≤640px
  - `.vd-pad` → riduce padding container (32 → 18 → 14)
  - `.vd-bottom-nav` → bottom navigation visibile solo ≤1024px
  - `.vd-main-scroll` → `padding-bottom:70px` ≤1024px (spazio per la bottom nav)
- Override delle griglie con `grid-column:auto` per layout speciali (es. weekly chart con `gridColumn:"1/3"`).

### 🧭 Navigazione mobile/tablet
- Nuovo componente **`BottomNav`** (7 voci icona+label, scorre se necessario, evidenzia voce attiva con bordo dorato).
- **`Sidebar`** ritorna `null` su tablet/mobile (`isDesktop` false).
- Padding-bottom del main aumentato su mobile per non sovrapporsi alla bottom nav.

### 📱 Adattamenti per vista
- **Topbar**: padding/gap adattivi, logo testuale e blocco "nome utente + ruolo" nascosti su mobile (resta avatar), placeholder search corto, `AdvancedSearchPanel` fluido full-width (`position:fixed` su mobile, dropdown su desktop).
- **Dashboard**: padding 28→16, font header 26→21, KPI 4→2→1, griglia chart+categoria 3→2→1, scadenze/workload 2→1, coda globale con `minmax(min(100%, 280px), 1fr)`.
- **Kanban**: Board orizzontale con `scrollSnapType:"x mandatory"` su mobile. Colonne larghezza fissa **82vw** + `scrollSnapAlign:"center"`. **Drag & drop disattivato su mobile** (touch inaffidabile).
- **Calendar**: celle 100px→52px su mobile, pallini-conteggio colorati per categoria.
- **Planning**: griglia 7-giorni con scroll orizzontale snap + colonne 60vw.
- **TaskSlideOver** e **ChatPanel**: full-screen (`width:"100vw"`) su mobile.
- **QuickAddTask**: overlay con `padding:16`, card `maxWidth:"100%"` + `maxHeight:"90vh"` + `overflowY:"auto"`.

### 🎯 Dettagli sopra la bottom nav
- **FAB**: `bottom: 28/32` desktop → `80/84` mobile.
- **Toast**: `bottom: 24` → `80` su mobile.
- **NotificationsPanel**: larghezza `min(360px, calc(100vw - 24px))`.

### 📈 Metriche
- File da 5581 → **5738 righe** (+157).

---

## v0.5 — Ricerca avanzata + Admin + Coda globale + Bacheca + God Mode (sessione 5)

> Macro-release che chiude lo Step 2 di v0.4 e introduce il pannello Admin completo, la coda di task non assegnati, la bacheca avvisi e un giro di hardening generale (God Mode).

### 🔍 Ricerca avanzata topbar (chiusura v0.4)
- Nuovo componente `AdvancedSearchPanel`, accessibile da pulsante 🎛️ accanto alla search bar.
- Filtri: parola chiave, range date, multi-select categoria / status / agente.
- Default: cestinati esclusi + toggle "Includi cestinati".
- Click-outside e ESC per chiudere, autofocus keyword, anteprima risultati live ordinati per `dueDate`.

### ⚙️ Pannello Admin (nuova vista nella sidebar)
- 5 tab: Team, Import/Export, Sistema, Categorie, Log attività.
- **2 agenti pending pre-caricati** in mock per demo: Elena Marini, Matteo De Luca.

### 🙋 Coda globale (task non assegnati)
- Nuovo componente `UnassignedQueue` in Dashboard. 3 task di demo non assegnati.

### 📌 Bacheca avvisi
- Sticky notes con rotazione, 5 colori palette. Crea/modifica/pin/elimina. 3 avvisi pre-caricati.

### 🔧 Modifiche al reducer / stato
- `TEAM` e `CATEGORIES` da `const` → `let` mutabili.
- Wrapper reducer per activity log automatico.

### 🐛 God Mode — 7 bug risolti

### 📈 Metriche
- File da 3807 → **5581 righe** (+1774).

---

## v0.4 — Cestino (sessione 4, parziale)

- Soft delete + vista Cestino dedicata + filtri attivi ovunque.

---

## v0.3 — Bugfix + AI Planner + Bulk Task Creator (sessione 3)

- Badge chat fix, AI Day Planner, Bulk Task Creator con 4 tab.

---

## v0.2 — Modulo Chat (sessione 2)

- ChatPanel completo con vocali, file, reply, reazioni, typing, read receipts.

---

## v0.1 — Prima implementazione (sessione 1)

- Core app: Dashboard, Kanban, Calendar, Team, Planning, ricerca, notifiche.
