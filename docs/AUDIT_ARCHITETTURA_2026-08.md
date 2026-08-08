# Audit architetturale e di sicurezza — agosto 2026

Analisi del repository `tucobpjmr/tullio` (VoyageDesk 0.9.0) al 7 agosto 2026.

**Metodo e marcatura delle fonti.** Ogni affermazione è marcata con come è stata
verificata, seguendo la convenzione già in uso in `docs/SICUREZZA.md`:

- ✅ **verificato sul database live** — progetto `vmxvnxsqfisucugcpqlc`, via
  `execute_sql` / `get_advisors`
- 📄 **verificato nel repo** — letto nel sorgente o nei file di migrazione
- 🔬 **misurato** — `npx vitest run`, `npx eslint .` eseguiti in questa sessione

La distinzione non è pedanteria: è la stessa ragione per cui `docs/CLAUDE.md`
avverte che la storia delle migrazioni nel repo non coincide con
`schema_migrations`. Una parte non trascurabile dei rilievi di questo documento
nasce proprio da affermazioni scritte una volta e mai più rimisurate.

---

## 1. Executive Summary

**Stato di salute: buono.** Questo non è un progetto in debito tecnico: è un
progetto che ha già pagato il suo debito tecnico e ne conserva la
documentazione. Le prove:

| Indicatore | Valore | Fonte |
|---|---|---|
| Test | **831 verdi + 7 skipped**, 69 file (789 su 64 al 7 agosto) | 🔬 |
| ESLint | **0 errori**, 19 warning (tutti `no-multi-comp`, arretrato dichiarato) | 🔬 |
| Advisor sicurezza Supabase | **0 errori**, 10 warning, tutti attesi | ✅ |
| Tabelle senza RLS | **0** | ✅ |
| GRANT su `public` per il ruolo `anon` | **0** | ✅ |
| Sink HTML (`dangerouslySetInnerHTML`/`innerHTML`) | **0** | 📄 |
| Migrazioni di sicurezza recenti applicate in produzione | **11 su 11** | ✅ |

Il refactoring del monolite è reale e riuscito: `VoyageDesk.jsx` è sceso a 369
righe di sola orchestrazione, le decisioni di autorizzazione sono funzioni pure
in `lib/permissions.js` invocate **dagli stessi due livelli** (reducer e
registry di persistenza) con un test che ne verifica la coincidenza, e il
registry dichiarativo di `state/persistence.js` ha eliminato lo `switch` da 283
righe che duplicava a mano i controlli di permesso.

**La cosa più importante che ho verificato, e che vale la pena dire per prima:
non ho trovato vulnerabilità critiche.** Ho cercato specificamente le classi che
in un gestionale multi-ruolo fanno danno — escalation di privilegi, RLS
mancante, chiavi esposte, XSS, IDOR sugli allegati, redirect aperti negli
inviti — e ognuna risulta già chiusa, in molti casi con la motivazione scritta
accanto alla correzione. Le migrazioni del 6 agosto (bucket avatar reso privato,
MIME allowlist sugli allegati, revoca dei GRANT ad `anon`, matrice categoria per
ruolo portata in RLS, gate `pending` negli helper) **sono tutte applicate al
database di produzione**, verificato riga per riga e non solo per presenza del
file. ✅

Il baricentro dei problemi residui si è quindi spostato dalla sicurezza a due
aree diverse:

1. **Scalabilità del modello di sincronizzazione.** Il pattern
   "ricarico tutto a ogni evento realtime" è applicato uniformemente, ed è
   stata una scelta consapevole e giusta quando i dati erano pochi. I dati non
   sono più pochi: **616 liste viaggio e 5.315 movimenti** ✅. Ogni movimento
   registrato da chiunque provoca, su ogni client connesso, tre query complete.
   È il problema con la traiettoria peggiore del progetto.

2. **Disallineamento fra la documentazione e ciò che il codice fa oggi.**
   `docs/SICUREZZA.md` è un documento eccellente e sopra la media, e proprio per
   questo è pericoloso quando invecchia: oggi descrive la CSP come non
   bloccante, mentre in produzione **blocca**, e descrive il vincolo del Junior
   Agent come non applicato dal database, mentre il database lo applica. Chi lo
   legge per prendere una decisione la prende su premesse false.

Un'osservazione trasversale, perché spiega diversi rilievi che seguono: la
qualità di questo codice è tenuta insieme da **commenti molto lunghi e molto
buoni** che spiegano il *perché* di ogni scelta. È una pratica rara e da
difendere. Il suo costo è che un commento sbagliato pesa qui più che altrove,
perché qui i commenti vengono creduti — e i rilievi ALTA-3 e MEDIA-3 sono
esattamente questo caso.

---

## 2. Tabella delle priorità

| # | Priorità | Area | Problema | File |
|---|---|---|---|---|
| — | **CRITICI** | — | **Nessuno.** Nessuna vulnerabilità sfruttabile né difetto che comprometta i dati. | — |
| A-1 | ~~Alta~~ ✔ **risolto** | Performance | Refetch completo di liste + cestino + saldi a ogni evento su `movimenti_lista` (5.315 righe) | `useListeData.js:46-68` |
| A-2 | ~~Alta~~ ✔ **risolto** | Correttezza | `clients` (818 righe) è l'unica entità senza subscription realtime: le modifiche altrui non arrivano mai | `useAppHydration.js:143-153` |
| A-3 | ~~Alta~~ ✔ **risolto** | Sicurezza (doc) | `SICUREZZA.md` afferma che la CSP non blocca e che il vincolo Junior non è nel DB: entrambe false oggi | `docs/SICUREZZA.md` §4-§6-§8 |
| M-1 | ~~Media~~ ✔ **risolto** | Architettura | `AdminView` è l'unica vista che riceve `state` intero e lo drilla in 5 tab | `AdminView.jsx:13,65-69` |
| M-2 | ~~Media~~ ✔ **risolto** | Duplicazione | Autocomplete cliente **quadruplicato** (logica + markup dropdown) — `TemplateTab` era sfuggito al conteggio | `TaskSlideOver.jsx:79-85`, `QuickAddTask.jsx:61-69`, `ManualTab.jsx:141-144`, `TemplateTab.jsx:101-105` |
| M-3 | ~~Media~~ ✔ **risolto** | Sicurezza | Macchinario di cambio-utente (`SET_CURRENT_USER` + banner rollback) vivo nel bundle di produzione | `reducer.js:139-179`, `AdminRollbackBanner.jsx` |
| M-4 | ~~Media~~ ✔ **risolto** | Test | Nessun test verifica le policy RLS: il livello che conta davvero non è coperto | `src/test/**` |
| M-5 | ~~Media~~ ✔ **risolto** | Correttezza | `stateRef` aggiornato in `useEffect`: finestra di stato stale su dispatch multipli nello stesso tick | `useSyncedDispatch.js:27` |
| B-1 | ~~Bassa~~ ✔ **risolto** | Performance | Refetch completo anche su `tasks` (246 task + 569 righe di cronologia) | `useAppHydration.js:32-46` |
| B-2 | Bassa | Config | `leaked_password_protection` ancora disabilitata | dashboard Supabase |
| B-3 | ~~Bassa~~ ✔ **risolto** | Duplicazione | Due formattatori di data e due limiti di dimensione file non riconciliati — sono divergenze **volute**, ora dichiarate | `taskUtils.js:4`, `listeApi.js:411`, `fileUtils.js:6`, `chatFiles.js:9` |
| B-4 | ~~Bassa~~ ✔ **risolto** | Lint | Il conteggio era già stale: 19 `react/no-multi-comp` (decisi e documentati in `eslint.config.js`) + **4** `exhaustive-deps`, non 22+1 | vari |

---

## 2-bis. Stato di avanzamento

**Tutti i rilievi sono chiusi tranne B-2**, che non è codice: è un interruttore
nella dashboard Supabase (Auth → Password) e nessuna PR può girarlo.

La chiusura è avvenuta in due passaggi:

- **7 agosto** — A-1, A-2, A-3, M-4.
- **8 agosto** — M-1, M-2, M-3, M-5, B-1, B-3, B-4 (sezione 2-ter).

Questa sezione esiste per una ragione precisa: il rilievo A-3 di questo stesso
documento riguarda una documentazione che afferma cose non più vere. Sarebbe
singolare lasciare che l'audit diventi il primo esempio del problema che
segnala.

| | Esito |
|---|---|
| A-1 | `useDebouncedTableSubscription` passa ora al reload l'insieme delle tabelle che hanno emesso (`null` = idratazione iniziale); `useListeData` ricarica i soli saldi quando `liste_viaggio` non è fra queste. Da 3 query complete a 1 sull'evento più frequente. |
| A-2 | `clients` ha la sua subscription, e la migrazione `20260807215625_clients_realtime` **è applicata** al database ✅ (verificato: la tabella è in `pg_publication_tables`, la RLS è rimasta attiva, l'advisor non ha warning nuovi). |
| A-3 | `docs/SICUREZZA.md` riscritto sui tre punti scaduti: CSP descritta come bloccante (lo è), vincolo Junior descritto con il meccanismo reale (colonna `seniority` + RLS), migrazione `set_updated_at_search_path` riconciliata (applicata sotto una versione diversa da quella nel nome del file, non "mai applicata" come diceva prima). Aggiornati anche i 10 warning attesi dell'advisor (prima 9: mancava `anon_security_definer_function_executable` su `get_migrazioni_applicate()`, funzione nuova dal 6 agosto) e il conteggio migrazioni (103, non più 93). |
| M-4 | `src/test/integration/rls.test.js`: quattro casi (driver/categoria, junior/categoria, utente `pending`, escalation di `users.role`) che aprono una connessione autenticata vera e verificano che **il database** rifiuti, non solo il client. `describe.skip` senza `RLS_TEST_URL` — zero rete se non configurato, quindi non richiede nulla per restare verde in questa PR. Lanciabile con `npm run test:rls` una volta provisionato un progetto di staging (mai produzione). |
| Test | 813 verdi + 7 skipped (806 + 17 in `realtimeGranularita.test.jsx`/`clientiRealtime.test.jsx` + 4 casi RLS skippati senza credenziali), 0 errori ESLint, build ok. |

### Un difetto trovato implementando A-2, e corretto insieme

Non era nell'elenco iniziale perché A-2 lo teneva nascosto, ed è il motivo per
cui le due correzioni non potevano essere separate.

`toDbClient` non spediva l'`id`, e `clients.id` ha default `gen_random_uuid()`:
il database assegnava quindi un id **proprio**, diverso da quello che
`ADD_CLIENT.normalize` aveva già scritto nello stato React. Siccome
`UPDATE_CLIENT` e `DELETE_CLIENT` usano quell'id come clausola `WHERE`, **ogni
modifica a un cliente creato nella stessa sessione colpiva zero righe sul
server**, mentre la UI confermava "Cliente aggiornato!". Lo scarto restava
invisibile proprio perché i clienti erano l'unica entità senza realtime:
nessuna ri-idratazione arrivava a smentire lo stato locale prima del reload.

Aggiungere la subscription senza correggerlo avrebbe trasformato un difetto
latente in uno visibile entro 200 ms — la ri-idratazione avrebbe sostituito la
riga locale con quella del server, con un id diverso, e qualunque pannello
aperto su quell'id si sarebbe rotto. `toDbClient` porta ora l'id; le UPDATE
passano dal nuovo `toDbClientPatch`, che non lo contiene (stessa separazione di
`toDbNotice`/`toDbNoticePatch`).

È anche il miglior argomento a favore del suggerimento strategico n. 3: il
difetto viveva esattamente nel punto in cui i clienti erano l'**eccezione** al
pattern comune. Chiudere l'eccezione l'ha fatto emergere.

---

## 2-ter. Stato di avanzamento (8 agosto 2026, sessione successiva)

| | Esito |
|---|---|
| M-1 | `AdminView` non riceve più `state`, e nessuna delle sue cinque tab neppure: team/categorie/utente arrivano da `AppDataContext`, i task da `TasksContext`, e restano quattro prop mirate (`agencyName`, `notices`, `activityLog`, `messageTemplates`) con identità stabile. La vista è ora avvolta in `memo` come le altre cinque — prima era l'unica dove non poteva agganciarsi a nulla. Blindato da `src/test/adminView.test.jsx`, che monta ogni tab senza `state`: l'invariante è passata da convenzione a misura. |
| M-2 | Estratto `src/components/ui/ClientAutocomplete.jsx` (hook `useClientSuggestions` + componente `ClientSuggestions`). **Le copie erano quattro, non tre**: a `TaskSlideOver`, `QuickAddTask` e `ManualTab` si aggiungeva `TemplateTab`, sfuggito al conteggio dell'audit — che è precisamente il modo in cui questa duplicazione cresceva. Le due varianti di stile superstiti (normale e `compact` per i modali bulk) sono dichiarate in un solo posto, con la ragione dello z-index più alto. 13 test nuovi. |
| M-3 | `case "SET_CURRENT_USER"` esce dal reducer di produzione con un guard `import.meta.env.DEV`, e il montaggio di `AdminRollbackBanner` con lo stesso. 🔬 **Verificato sul bundle buildato**, non dedotto: nessuna delle stringhe del banner sopravvive (`"Sessione Admin attiva"`, `"Rimani come Admin"`, `"Rollback automatico"` → 0 occorrenze), e il case si riduce a `case"SET_CURRENT_USER":return e;`. Il corpo — controllo ruolo, view lock, toast di elevazione, bookkeeping del rollback — non c'è più. |
| M-5 | `stateRef.current = state` assegnato in render invece che in `useEffect`. Il ref non è mai letto durante il render, solo dentro il callback: nessuna impurità osservabile, e la finestra di stato stale fra due dispatch nello stesso handler si chiude. |
| B-1 | Stessa forma di A-1 un piano più in basso. Un evento su `comments` o `task_history` ricarica ora **solo** la tabella figlia che ha emesso, via `TaskThreads` + l'azione `SET_TASK_THREADS`, invece di far girare `TASK_SELECT_WITH_COMMENTS` (join sui nomi, cestino incluso, nessuna paginazione) su ogni client connesso. Un evento su `tasks` — anche coalescato insieme a un commento nella stessa finestra di debounce — continua a ricaricare tutto, che lì è la cosa giusta. 6 test nuovi. |
| B-2 | **Resta aperto.** ✅ Riconfermato sull'advisor live l'8 agosto: `auth_leaked_password_protection` è ancora `WARN`. Non è fattibile da codice — dashboard Supabase → Auth → Password. Costo nullo, valore reale visto che l'accesso è a sola password. |
| B-3 | Non erano due doppioni da riconciliare, ed è il motivo per cui la correzione è un commento e non una fusione. ✅ Verificato su `storage.buckets`: `task-files` ha `file_size_limit` 52428800 e `chat-files` 26214400 — ciascuna costante rispecchia il **proprio** bucket, e allinearle romperebbe la corrispondenza col server che è l'unica ragione per cui esistono. I due formattatori di data ricevono input diversi (timestamp ISO contro colonna `date`) e rendono formati diversi di proposito. Tutti e quattro i punti portano ora il rimando incrociato e la ragione. |
| B-4 | 🔬 Il conteggio dell'audit era già stale quando è stato scritto: misurati **19** `react/no-multi-comp` e **4** `exhaustive-deps`, non 22 e 1. Sui primi la decisione era già stata presa e motivata in `eslint.config.js` (arretrato dichiarato, 19 casi in 12 file, tracciato in `docs/CLAUDE.md`) — non c'era nulla da decidere. I quattro `exhaustive-deps` erano tutti omissioni **volute** — callback del genitore che, se inclusi, avrebbero fatto ripartire l'effetto a ogni render del genitore, con conseguenze reali (un toast che non sparisce più, una RPC di mark-as-read per messaggio in arrivo) — e portano ora un `eslint-disable-next-line` con la ragione accanto. L'arretrato di quella regola è a zero: il prossimo warning è nuovo per definizione. |
| Test | 🔬 **831 verdi + 7 skipped** su 69 file (erano 813+7): +6 `adminView`, +13 `clientAutocomplete`, +6 in `realtimeGranularita`. 0 errori ESLint, 19 warning (tutti `no-multi-comp`, l'arretrato dichiarato). Build di produzione ok. |

### Una verifica chiesta da B-1 che resta parziale, e la correzione applicata a parte

B-1 chiedeva anche di verificare se il progetto abbia un cap di righe lato
PostgREST (`db-max-rows`): con una query senza `.range()` un cap tronca la
risposta **in silenzio**, e il sintomo — "alcune righe non si vedono" — è fra i
più difficili da attribuire.

Quello che si è potuto verificare: ✅ `pg_db_role_setting` non contiene
`pgrst.db_max_rows` per `authenticator`, `anon` o `authenticated`. Quello che
**non** si è potuto verificare: il valore effettivo, perché su Supabase quel
parametro vive nella configurazione della piattaforma (dashboard → Settings →
API → Max rows) e non è leggibile né da SQL né dalle API di gestione — nemmeno
dai tool Supabase MCP, che sono management-plane ma non espongono questa voce.
Un test empirico (una GET REST senza `.range()` su una tabella sopra qualunque
cap plausibile, per vedere quante righe tornano davvero) richiederebbe un JWT
autenticato con ruolo admin/manager/agent, non disponibile in sessione: resta
**da guardare a mano**, una tantum, in dashboard.

✅ **Sessione successiva (8 agosto 2026, stesso giorno):** la correzione non
aspetta più quella misura. `fetchAllRows` — che pagina con `.range()` e si
ferma sul `count` esatto del `Content-Range`, quindi senza dipendere dal
valore del cap — è stato estratto da `listeApi.js` nel modulo condiviso
`src/lib/fetchAllRows.js`, e `Clients.list()` in `lib/api.js` lo usa ora al
posto del `select('*')` nudo. `clients` era a **818 righe** al momento della
scrittura di questa nota: se il cap fosse il default storico di 1000,
l'anagrafica sarebbe stata a meno di 200 clienti dal troncamento silenzioso.
5 nuovi test in `src/test/clientsPaginazione.test.js` (stesso pattern di
`listePaginazione.test.js`) bloccano la regressione.

✅ **Verificato a mano in dashboard l'8 agosto 2026:** `db-max-rows` = **1000**
(il default Supabase). **Deciso di non alzarlo**: il cap lato server è una
rete di sicurezza indipendente dal codice client — se in futuro una nuova
query "prendi tutto" dimenticasse `fetchAllRows`, il cap è l'unica cosa che
limita il danno a un payload grande invece che a un troncamento silenzioso a
una soglia più alta e altrettanto invisibile. Alzarlo sposterebbe solo più in
là nel tempo lo stesso problema che ha causato questa indagine, senza
risolverlo. Misurate anche le altre tabelle lette senza paginazione in
`lib/api.js`: `tasks` 247, `messages` 13, `comments` 7, `notifications` 11,
`notices` 0, `users` 7 — tutte ben sotto soglia, nessun'altra query a rischio
oggi. Con questo il punto B-1 sul cap è chiuso.

---

## 3. Action Plan dettagliato

### A-1 · Refetch completo del modulo Liste a ogni movimento

> ✔ **Risolto** in questa PR — vedi §2-bis. Il testo che segue descrive il
> problema e la correzione applicata.

**File.** `src/components/liste/useListeData.js:46-68`

**Misura.** ✅ `liste_viaggio` = 616 righe, `movimenti_lista` = 5.315 righe.

**Perché è una criticità.** `reload()` non sa *quale* tabella ha generato
l'evento, quindi fa sempre tutto:

```js
const [rListe, rCestino, rSaldi] = await Promise.all([
  ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
]);
```

ed è sottoscritto a due tabelle:

```js
useDebouncedTableSubscription(["liste_viaggio", "movimenti_lista"], reload, …);
```

Registrare **un** movimento — l'operazione più frequente del modulo — fa quindi
scaricare a *ogni client connesso* l'elenco completo delle liste, il cestino
completo e i saldi completi. `ListeAPI` pagina a 1000 righe (`listeApi.js:58`)
ma pagina per *scaricare tutto*, non per scaricarne meno.

Il commento in testa al file è onesto sul fatto che il pattern è "volutamente
più semplice di un merge incrementale". Aveva ragione. Il punto è che la
premessa implicita — che i dati restino piccoli — è scaduta: 5.315 movimenti
non sono un dataset di prova, e la crescita è lineare nell'uso normale del
prodotto.

**Soluzione.** Non serve riscrivere il modello a merge incrementale. Basta
dare a `reload` l'informazione che già esiste ma viene buttata via: *quale*
tabella ha generato l'evento. Un movimento cambia i saldi, mai l'elenco delle
liste né il cestino.

Primo passo, in `hooks/useDebouncedTableSubscription.js` — propagare la tabella:

```js
    const list = Array.isArray(tables) ? tables : [tables];
    // `run` accetta ora l'insieme delle tabelle che hanno generato gli eventi
    // coalescati dal debounce: chi ricarica può così ricaricare solo la parte
    // che quegli eventi possono aver invalidato. `null` = idratazione
    // iniziale, dove non c'è un evento e va caricato tutto.
    let pending = new Set();

    const run = (tabelle) => {
      const my = ++gen;
      return reloadRef.current(() => !cancelled && my === gen, tabelle);
    };

    run(null); // idratazione iniziale: tutto

    const debounced = (payload) => {
      const fn = filterRef.current;
      if (fn && !fn(payload)) return;
      pending.add(payload?.table);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const tabelle = pending;
        pending = new Set();
        run(tabelle);
      }, delay);
    };
```

Secondo passo, in `useListeData.js` — consumarla:

```js
  const reload = useCallback(async (isCurrent = () => true, tabelle = null) => {
    setLoadError(null);
    // Un movimento cambia i saldi e nient'altro: l'elenco delle liste e il
    // cestino non possono essere stati invalidati da un insert su
    // movimenti_lista. Ricaricarli comunque significava, a ogni movimento
    // registrato da chiunque, scaricare 616 liste su ogni client connesso.
    // `tabelle === null` = idratazione iniziale, dove serve tutto.
    const soloSaldi = tabelle !== null
      && tabelle.size > 0
      && !tabelle.has("liste_viaggio");

    if (soloSaldi) {
      const rSaldi = await ListeAPI.saldi();
      if (!isCurrent()) return;
      if (rSaldi.error) { /* … stesso ramo d'errore di sotto … */ return; }
      setDati((d) => ({
        ...d,
        saldi: Object.fromEntries((rSaldi.data || []).map((s) => [s.lista_id, s])),
      }));
      return;
    }

    const [rListe, rCestino, rSaldi] = await Promise.all([
      ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
    ]);
    // … resto invariato …
  }, []);
```

Effetto: da 3 query complete a 1 per l'evento di gran lunga più frequente,
senza toccare il modello mentale del modulo né la sua robustezza (il
gen-counter e il debounce restano quelli).

> **Nota di verifica.** `payload.table` è presente nel payload
> `postgres_changes` di supabase-js. Va confermato con un `console.log` in
> sviluppo prima di fare affidamento sul campo: se mancasse, l'alternativa è
> registrare la tabella nella closure creata da `list.map(...)` in
> `subscribeToTable`, che la conosce per costruzione.

---

### A-2 · `clients` non ha subscription realtime

> ✔ **Risolto** in questa PR, migrazione compresa e applicata — vedi §2-bis.
> Il prerequisito segnalato qui sotto ("va confermato che `public.clients` sia
> pubblicata") si è rivelato **non soddisfatto**: la tabella non era in
> `supabase_realtime`, esattamente come l'inciampo del modulo Liste. È il
> motivo per cui la correzione ha richiesto una migrazione e non solo codice.

**File.** `src/hooks/useAppHydration.js:143-153`

**Misura.** ✅ `clients` = 818 righe.

**Perché è una criticità.** Tutte le altre entità di dominio hanno una
subscription: `tasks`/`comments`/`task_history` (riga 32), `notices` (48),
`categories` (63), `users` (91), e fuori da questo hook `conversations`/
`messages`, `notifications`, `liste_viaggio`/`movimenti_lista`. I clienti no:

```js
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ClientsAPI.list()
      .then((cRes) => { … })
      .finally(() => { if (!cancelled) setCrmLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, dispatch]);
```

Una `useEffect` che parte una volta sola al mount. Chi crea un cliente lo vede
subito (l'aggiornamento ottimistico del reducer), **chiunque altro no, fino a un
reload completo della pagina**.

Non è teorico e non riguarda solo l'anagrafica: il modulo Liste crea clienti per
conto proprio — `AggiungiBeneficiarioModal` passa `newClientName` quando si
aggiunge un beneficiario non ancora in anagrafica. Il flusso concreto che si
rompe: l'utente A crea un cliente aggiungendo un beneficiario, l'utente B apre
l'autocomplete cliente su un task e non lo trova, lo ricrea a mano, e si
ritrovano due righe per la stessa persona. Con 818 clienti già in tabella, la
deduplica a posteriori non è banale.

**Soluzione.** Allinearlo al pattern usato da tutte le altre entità. La
sostituzione è quasi meccanica, e `crmLoading` continua a funzionare perché
`useDebouncedTableSubscription` esegue l'idratazione iniziale al mount:

```js
  const [crmLoading, setCrmLoading] = useState(enabled);

  // I clienti erano l'unica entità di dominio senza subscription: una
  // useEffect al mount e nient'altro. Un cliente creato da un altro utente —
  // anche dal modulo Liste, che ne crea passando newClientName — non arrivava
  // mai in questa sessione, e l'autocomplete lo dava per inesistente. Il
  // risultato osservabile era il doppione in anagrafica, non un dato mancante.
  useDebouncedTableSubscription(["clients"], async (isCurrent) => {
    const { data, error } = await ClientsAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[CRM] hydration", error);
      onError(`Caricamento clienti fallito: ${error.message || ""}`);
      setCrmLoading(false);
      return;
    }
    dispatch({ type: "SET_CLIENTS", payload: (data || []).map(fromDbClient) });
    setCrmLoading(false);
  }, { enabled, deps: [enabled] });
```

> **Prerequisito da verificare prima del merge.** ✅ Va confermato che
> `public.clients` sia pubblicata sulla publication `supabase_realtime`.
> È esattamente l'inciampo già documentato per il modulo Liste, che ha avuto
> bisogno della migrazione `20260806090000_liste_realtime.sql` proprio perché
> una subscription su tabelle non pubblicate non riceve mai un evento — e
> fallisce in silenzio, che è il modo peggiore.
> Controllo: `select * from pg_publication_tables where pubname =
> 'supabase_realtime' and tablename = 'clients';`

---

### A-3 · `docs/SICUREZZA.md` afferma il falso su due punti di sicurezza

> ✔ **Risolto** in questa PR. Le correzioni descritte come "da applicare" nel
> testo che segue sono state applicate: CSP e vincolo Junior riscritti sullo
> stato reale, migrazione `set_updated_at_search_path` riconciliata (era
> "non applicata" perché il file nel repo dichiara una versione diversa da
> quella effettivamente eseguita — non un file mai eseguito), warning
> dell'advisor e conteggio migrazioni aggiornati. Non toccato: il punto 1 di
> §6 (`leaked_password_protection`), che resta un interruttore di dashboard,
> come segnalato anche in B-2.

**File.** `docs/SICUREZZA.md`, §4 (matrice permessi), §5 (XSS), §6 (cosa fare),
§8 (CSP)

**Perché è una criticità.** Questo documento è, dichiaratamente, l'artefatto su
cui si ragiona della postura di sicurezza del progetto. Oggi contiene tre
affermazioni che il codice e il database smentiscono. Non sono imprecisioni di
stile: sono le premesse di decisioni.

**1. La CSP è descritta come non bloccante. Blocca.** 📄

`docs/SICUREZZA.md` §5 e §8:

> `Content-Security-Policy-Report-Only` … **non blocca nulla** … Fino a quando
> non viene promossa a header bloccante, la mitigazione strutturale contro
> l'esfiltrazione del token resta assente.

`vercel.json` spedisce invece l'header **bloccante**:

```json
{ "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; …" }
```

Due conseguenze opposte e entrambe dannose. Chi legge il documento per valutare
il rischio residuo da XSS conclude che la difesa non c'è, mentre c'è. E — più
grave — chi legge §6 punto 3 ("resta da promuoverla a bloccante") crede di
avere ancora un margine di sperimentazione che non ha: aggiungere uno script
inline, un CDN o un endpoint non previsto **rompe la produzione subito**, senza
il periodo di osservazione che il documento promette.

**2. Il vincolo del Junior Agent è descritto come non applicato dal database.
Il database lo applica.** ✅

`docs/SICUREZZA.md` §4:

> ⚠️ **Asimmetria da conoscere.** La restrizione del Junior Agent … è applicata
> dal client e dal guard di persistenza, **non dalla RLS**. Un Junior che
> chiamasse l'API Supabase direttamente … passerebbe … Renderlo tale richiede
> una colonna sotto-ruolo in `public.users` e un predicato RLS che la legga.

Entrambe le cose esistono e sono in produzione, verificate sul database live:
`public.users.seniority` esiste, `private.can_use_task_category(text)` esiste, ed
è cablata nel `WITH CHECK` di `tasks_insert` e `tasks_update`. Le due migrazioni
(`users_seniority`, `rls_task_category_and_pending_gate`) risultano in
`schema_migrations`. §6 punto 4 ("Decidere sul sotto-ruolo Junior … Oggi non è
né l'una né l'altra cosa") è quindi un lavoro già fatto ma ancora elencato come
aperto.

**3. Dati di contorno scaduti.** L'intestazione dice "93 migrazioni nel repo":
📄 sono 102. §6 punto 2 marca `set_updated_at_search_path` come "**non
applicata**": ✅ risulta applicata (`20260806090457`), e infatti il warning
`function_search_path_mutable` **non compare più** nell'advisor.

**Soluzione.** Correzioni puntuali, da applicare al documento:

- §5 e §8: sostituire ogni occorrenza di `Content-Security-Policy-Report-Only`
  con `Content-Security-Policy`; riscrivere la chiusura di §8 da "Come
  promuoverla a bloccante" a una nota di stato — *la policy è bloccante dal
  deploy del 6 agosto; ogni nuova origine (script, font, endpoint, CDN) va
  aggiunta qui prima di essere usata, altrimenti la richiesta viene bloccata in
  produzione*; correggere in §5 la frase "la mitigazione strutturale … resta
  assente".
- §4: sostituire il riquadro ⚠️ sull'asimmetria Junior con la descrizione del
  meccanismo attuale (colonna `users.seniority` + `private.can_use_task_category`
  nel `WITH CHECK` di `tasks_insert`/`tasks_update`), e chiudere §6 punto 4.
- §6 punto 2: marcare come applicata, citando la versione `20260806090457`.
- Intestazione: 102 migrazioni, data al 7 agosto 2026.
- §1: aggiungere il warning nuovo `anon_security_definer_function_executable`
  su `get_migrazioni_applicate()` alla tabella dei warning attesi, con la
  motivazione già scritta nella migrazione `revoke_anon_table_grants`
  (è il ping keep-warm, concesso ad `anon` di proposito). ✅ Oggi l'advisor lo
  segnala e il documento non lo spiega, quindi al prossimo giro sembrerà una
  regressione.

Suggerimento di processo, perché il problema si ripresenterà: le affermazioni
✅ di questo documento hanno una scadenza. Vale la pena aggiungere a
`scripts/verifica-advisor/` un controllo che fallisca quando l'insieme dei
warning dell'advisor **differisce** da quello atteso e scritto nel documento —
in entrambe le direzioni. Un warning nuovo va guardato; un warning sparito va
cancellato dal documento.

---

### M-1 · `AdminView` riceve `state` intero

> ✔ **Risolto** l'8 agosto, come descritto sotto e con un passo in più: le
> prop residue sono passate da `VoyageDesk.jsx` invece che estratte da un
> `state` che `AdminView` continuava a ricevere, quindi la vista esce
> dall'eccezione del tutto e può essere avvolta in `memo` come le altre.
> `src/test/adminView.test.jsx` monta ogni tab senza `state`.

**File.** `src/components/admin/AdminView.jsx:13,65-69`

**Perché.** `VoyageDesk.jsx` documenta esplicitamente l'invariante architetturale
opposta, e spiega perché:

> Le viste NON ricevono più `state`: leggono task e clienti dai provider e si
> fanno passare solo le fette piccole che consumano davvero … `state` cambia
> identità dopo qualunque azione — un toast, un carattere nella ricerca — e
> finché era una prop costringeva la vista attiva a ri-renderizzarsi per intero.

Cinque viste su sei rispettano la regola. `AdminView` no, e la propaga a tutte e
cinque le sue tab:

```jsx
export const AdminView = ({ state, dispatch }) => {
  …
  {tab === "team" && <AdminTeamTab state={state} dispatch={dispatch} />}
  {tab === "io"   && <AdminIOTab   state={state} dispatch={dispatch} />}
  {tab === "stats"&& <AdminStatsTab state={state} dispatch={dispatch} />}
  {tab === "cats" && <AdminCategoriesTab state={state} dispatch={dispatch} />}
  {tab === "log"  && <AdminLogTab  state={state} dispatch={dispatch} />}
```

Conseguenza pratica: con il pannello Admin aperto, **ogni** carattere digitato
nella ricerca della Topbar e **ogni** toast ri-renderizza l'intera vista Admin,
statistiche comprese. È anche l'unica vista dove un futuro `memo` non potrebbe
mai agganciarsi.

Va detto che l'impatto è contenuto — la vista è riservata agli admin e non è
quella dove si passa la giornata. Il motivo per sistemarla è un altro: è
l'eccezione che rende l'invariante non verificabile, e le invarianti con
un'eccezione sono quelle che si perdono.

**Soluzione.** Ogni tab dichiara le fette che consuma. `team`, `categories` e
`currentUserId` sono già in `AppDataContext`; le tab che leggono i task hanno
già `TasksContext`. Restano da passare come prop mirate solo `activityLog`,
`messageTemplates` e `agencyName`:

```jsx
export const AdminView = ({ state, dispatch }) => {
  …
  {/* Ogni tab riceve la sua fetta, non lo state: le prop qui sotto hanno
      identità stabile finché quella fetta non cambia davvero, mentre `state`
      ne cambia a ogni toast. Team, categorie e utente corrente non compaiono
      perché le tab li leggono già da AppDataContext. */}
  {tab === "team"  && <AdminTeamTab dispatch={dispatch} />}
  {tab === "io"    && <AdminIOTab dispatch={dispatch} agencyName={state.agencyName} />}
  {tab === "stats" && <AdminStatsTab />}
  {tab === "cats"  && <AdminCategoriesTab dispatch={dispatch} />}
  {tab === "log"   && <AdminLogTab dispatch={dispatch} activityLog={state.activityLog} />}
```

Da fare tab per tab, verificando con `grep -n "state\." src/components/admin/tabs/`
quali campi ciascuna legge davvero prima di tagliare.

---

### M-2 · Autocomplete cliente triplicato

> ✔ **Risolto** l'8 agosto in `src/components/ui/ClientAutocomplete.jsx`.
> Una correzione al conteggio: le copie erano **quattro**, non tre —
> `TemplateTab.jsx:101-105` non compare nell'analisi qui sotto. Il markup
> estratto è quello reale (ogni voce mostra anche telefono/città/email, che lo
> schizzo sotto omette) e conserva le due varianti di stile già in uso: quella
> dentro i modali bulk ha uno z-index più alto perché deve scavalcare il
> pannello, non solo la card. Il passaggio da `onClick` a `onMouseDown` è già
> in questa estrazione, perché tutte e quattro le copie lo usavano già.

**File.** `TaskSlideOver.jsx:79-85` · `QuickAddTask.jsx:61-69` ·
`ManualTab.jsx:141-144`

**Perché.** La stessa logica non banale — filtro per sottostringa, taglio a 6,
e la regola "nascondi la tendina se l'unico risultato coincide esattamente con
quanto digitato" — è scritta tre volte, con tre nomi di variabili diversi:

```js
// TaskSlideOver.jsx:79
const clientQuery = draft.client.trim().toLowerCase();
const clientMatches = (clientQuery ? clients.filter(c => c.name?.toLowerCase().includes(clientQuery)) : clients).slice(0, 6);
const showClientList = editable && clientFocus && clientMatches.length > 0 &&
  !(clientMatches.length === 1 && clientMatches[0].name?.toLowerCase() === clientQuery);

// QuickAddTask.jsx:61 — identica, senza `editable`
// ManualTab.jsx:141   — identica, dentro una IIFE nel JSX, nomi accorciati
```

più il markup della tendina, ricopiato tre volte con gli stessi valori di stile
(`maxHeight: 180`, `zIndex: Z.swipePanel`, il `setTimeout(…, 150)` sul blur che
serve a non chiudere la tendina prima del click).

Il costo non è l'estetica: è che una modifica al comportamento della ricerca
cliente ha tre punti di applicazione e nessuno che li leghi. Vale la pena notare
che altrove il progetto ha già affrontato e risolto esattamente questo problema
— `lib/searchUtils.js` esiste perché la ricerca dell'anagrafica e quella delle
liste divergevano — quindi lo strumento culturale c'è già.

**Soluzione.** Un hook per la logica e un componente per il markup, in
`src/components/ui/ClientAutocomplete.jsx`:

```jsx
// src/components/ui/ClientAutocomplete.jsx
// La tendina di suggerimento cliente, condivisa da TaskSlideOver, QuickAddTask
// e ManualTab. Prima era scritta tre volte: stessa logica di filtro, stessa
// regola "nascondi se l'unico match è esatto", stesso markup con gli stessi
// valori di stile. Il campo cliente resta testo libero (task.client è una
// stringa, non una FK), quindi questo componente suggerisce e non vincola.
import { useState } from "react";
import { Z } from "../../styles/tokens.js";

const MAX_SUGGERIMENTI = 6;

export function useClientSuggestions(clients, valore, { enabled = true } = {}) {
  const [focus, setFocus] = useState(false);
  const query = (valore || "").trim().toLowerCase();
  const matches = (query
    ? (clients || []).filter(c => c.name?.toLowerCase().includes(query))
    : (clients || [])
  ).slice(0, MAX_SUGGERIMENTI);
  // Un solo risultato identico a ciò che è già scritto non è un suggerimento:
  // è la ripetizione di quanto l'utente ha appena selezionato.
  const visible = enabled && focus && matches.length > 0 &&
    !(matches.length === 1 && matches[0].name?.toLowerCase() === query);
  return {
    matches,
    visible,
    // 150ms: il blur arriva prima del click sulla voce, chiudere subito
    // annullerebbe la selezione.
    inputProps: {
      autoComplete: "off",
      onFocus: () => setFocus(true),
      onBlur: () => setTimeout(() => setFocus(false), 150),
    },
    close: () => setFocus(false),
  };
}

export function ClientSuggestions({ matches, visible, onPick }) {
  if (!visible) return null;
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, zIndex: Z.swipePanel,
      marginTop: 3, background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      maxHeight: 180, overflowY: "auto",
    }}>
      {matches.map(c => (
        <button key={c.id} type="button" onMouseDown={() => onPick(c)} style={{
          display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
          background: "none", border: "none", font: "inherit", cursor: "pointer",
        }}>{c.name}</button>
      ))}
    </div>
  );
}
```

Uso, in `TaskSlideOver.jsx`:

```jsx
const cli = useClientSuggestions(clients, draft.client, { enabled: editable });
…
<div style={{ position: "relative" }}>
  <input value={draft.client} {...cli.inputProps}
         onChange={e => setDraft(d => ({ ...d, client: e.target.value }))}
         onBlur={() => { cli.inputProps.onBlur(); commitText("client", { nullable: true }); }} />
  <ClientSuggestions matches={cli.matches} visible={cli.visible}
                     onPick={(c) => { cli.close(); pickClient(c); }} />
</div>
```

`pickClient` resta dov'è: l'ereditarietà del contatto dall'anagrafica è logica di
TaskSlideOver, non del suggeritore. Nota che `onMouseDown` sostituisce `onClick`
nel componente estratto — è ciò che rende il `setTimeout(…, 150)` sul blur non
più necessario a lungo termine, ma va cambiato in un secondo passo per non
mescolare due modifiche.

---

### M-3 · Il cambio-utente vive ancora nel bundle di produzione

> ✔ **Risolto** l'8 agosto con la prima delle due opzioni (guard `DEV`, non
> rimozione): il cambio-utente demo resta disponibile in sviluppo dietro
> `VITE_DEMO_SWITCH`. 🔬 Verificato sul bundle buildato e non dedotto — le
> stringhe del banner spariscono e il case si riduce a
> `case"SET_CURRENT_USER":return e;`. I test restano verdi: sotto Vitest
> `import.meta.env.DEV` è `true`, come previsto qui sotto.

**File.** `src/state/reducer.js:139-179` · `src/components/shell/AdminRollbackBanner.jsx`
· `src/components/shell/UserSwitcher.jsx:41`

**Perché.** L'unico punto d'ingresso UI è correttamente disattivato:

```js
// UserSwitcher.jsx:41
const SHOW_DEMO_SWITCH = import.meta.env.DEV && import.meta.env.VITE_DEMO_SWITCH === 'true';
```

`import.meta.env.DEV` è `false` nel build di produzione, quindi il ramo viene
eliminato dal bundler. 📄 Ho verificato che non esistano altri dispatcher di
`SET_CURRENT_USER` oltre a `UserSwitcher` e ad `AdminRollbackBanner` (che
compare solo *dopo* uno switch già avvenuto). **Non è quindi una vulnerabilità:
non c'è modo di raggiungerlo in produzione.**

Il rilievo è di superficie residua. Il `case "SET_CURRENT_USER"` resta nel
reducer di produzione, e quel case cambia `state.currentUserId` — cioè
esattamente il valore su cui poggiano *tutte* le decisioni di permesso lato
client, compresa `canAccessAdmin(state.team, state.currentUserId)` che decide se
montare `AdminView`. Il commento in `UserSwitcher` è preciso sul fatto che
questo confonde le RLS ("auth.uid() server-side resta l'utente reale"), quindi
le scritture fallirebbero comunque; ma la vista Admin verrebbe montata, con i
dati che quella sessione può già leggere.

In un progetto che ha appena speso una migrazione (`revoke_anon_table_grants`)
per rimuovere privilegi *non sfruttabili* con la motivazione esplicita — «resta
un errore, smette di essere un incidente» — questo codice è lo stesso caso,
nell'altro strato.

**Soluzione.** Compilare via il codice, non solo l'ingresso. In `reducer.js`:

```js
    case "SET_CURRENT_USER": {
      // Cambio-utente demo: cambia SOLO currentUserId lato client, mentre
      // auth.uid() lato server resta l'utente reale — quindi non concede
      // nessun dato, ma monta viste (Admin) decise da currentUserId. L'unico
      // ingresso UI è già gate-ato da import.meta.env.DEV in UserSwitcher;
      // questo secondo guard toglie il case dal bundle di produzione invece di
      // limitarsi a renderlo irraggiungibile. Stessa logica della migrazione
      // revoke_anon_table_grants: un privilegio non sfruttabile è comunque un
      // privilegio da non concedere.
      if (!import.meta.env.DEV) return state;
      const newId = action.payload;
      …
```

e allo stesso modo rendere condizionale il montaggio del banner in
`VoyageDesk.jsx`:

```jsx
        {import.meta.env.DEV && state.adminRollbackTo && state.adminSwitchedAt && (
          <AdminRollbackBanner … />
        )}
```

> **Attenzione ai test.** 📄 Diversi test dispatchano `SET_CURRENT_USER` per
> esercitare la matrice permessi. Sotto Vitest `import.meta.env.DEV` è `true`,
> quindi restano verdi — ma va verificato con un `vitest run` prima del merge,
> non dato per scontato.

Alternativa, se il cambio-utente demo non serve più a nessuno: rimuovere del
tutto `SET_CURRENT_USER`, `adminRollbackTo`, `adminSwitchedAt`,
`CANCEL_ADMIN_ROLLBACK`, `AdminRollbackBanner` e il ramo demo di
`UserSwitcher`. È meno codice e una decisione in meno da rispiegare. La scelta
fra le due dipende da quanto il test multi-ruolo manuale sia ancora usato, che
è informazione che ha chi sviluppa, non chi legge il repo.

---

### M-4 · Nessun test verifica le policy RLS

> ✔ **Risolto** in questa PR. `src/test/integration/rls.test.js` implementa
> l'idea descritta sotto con quattro casi invece di due (driver/categoria,
> junior/categoria, utente `pending`, escalation di `users.role`), con lo
> stesso meccanismo di skip senza credenziali. Non è stato provisionato un
> progetto di staging in questa sessione — il test esiste e resta pronto, ma
> è ancora `describe.skip` per chiunque non abbia configurato
> `RLS_TEST_URL`/`RLS_TEST_ANON_KEY` e i tre utenti richiesti (setup
> nell'intestazione del file). Non è quindi ancora una misura, resta una
> capacità di misurare.

**File.** `src/test/**`

**Perché.** 🔬 789 test verdi, di cui una parte consistente dedicata ai permessi:
`permissions.test.js` (matrice sulle funzioni pure), `persistenceGuards.test.js`
(guard ≡ verdetto del reducer), `reducerPurity.test.js`, `syncedDispatch.test.jsx`
(un'azione negata non raggiunge il server). È una copertura seria.

Copre però **un solo lato del confine**. Nessun test apre una connessione con il
token di un `driver` e verifica che il database rifiuti davvero l'insert di un
task `payment`. Il documento `SICUREZZA.md` §7 lo riconosce onestamente ("è il
buco di copertura più significativo dell'area sicurezza"), e resta vero.

Perché conta più di quanto sembri: dal 6 agosto le regole di autorizzazione sono
scritte **due volte** — in `lib/permissions.js` e nelle policy/funzioni
`private.*`. È esattamente la configurazione che il registry di persistenza
esiste per evitare in un altro strato ("due switch paralleli da tenere allineati:
qualsiasi divergenza non produce un errore di compilazione"). Qui la divergenza
è possibile e nessun test la intercetterebbe.

**Soluzione.** Un test d'integrazione, fuori da `vitest run` di default perché
richiede credenziali e tocca un database vero. Da eseguire su un branch Supabase
o su un progetto di staging, **mai in produzione**:

```js
// src/test/integration/rls.test.js — richiede RLS_TEST_URL / credenziali di
// staging; escluso dalla suite di default (vedi vite.config.js `test.exclude`).
//
// Perché esiste: da 20260806081127 la matrice categoria-per-ruolo è scritta in
// DUE posti — lib/permissions.js e private.can_use_task_category(). Nessun test
// esistente attraversa il confine: verificano che il client si comporti bene,
// mai che il database rifiuti chi il client non ferma. Questo lo fa.
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RLS_TEST_URL;
const suite = url ? describe : describe.skip; // niente credenziali → skip, non fallimento

suite("RLS: la matrice categoria è applicata dal database", () => {
  let driver;
  beforeAll(async () => {
    driver = createClient(url, process.env.RLS_TEST_ANON_KEY);
    const { error } = await driver.auth.signInWithPassword({
      email: process.env.RLS_TEST_DRIVER_EMAIL,
      password: process.env.RLS_TEST_DRIVER_PASSWORD,
    });
    if (error) throw error;
  });

  it("rifiuta a un driver la creazione di un task fuori da 'transfer'", async () => {
    const { data: { user } } = await driver.auth.getUser();
    const { error } = await driver.from("tasks").insert({
      title: "sonda rls", category: "payment", status: "todo", created_by: user.id,
    });
    // 42501 = insufficient_privilege: è la RLS che rifiuta, non un vincolo
    // qualunque. Asserire solo "error è truthy" farebbe passare il test anche
    // se fallisse per un NOT NULL mancante.
    expect(error).toBeTruthy();
    expect(error.code).toBe("42501");
  });

  it("consente a un driver la categoria 'transfer'", async () => {
    const { data: { user } } = await driver.auth.getUser();
    const { data, error } = await driver.from("tasks")
      .insert({ title: "sonda rls ok", category: "transfer", status: "todo", created_by: user.id })
      .select().single();
    expect(error).toBeNull();
    await driver.from("tasks").delete().eq("id", data.id);
  });
});
```

Anche solo tre o quattro casi — driver/categoria, junior/categoria, utente
`pending` respinto, non-admin che tenta `update` di `users.role` — cambierebbero
la natura dell'affermazione «client e database concordano» da *letta* a
*misurata*. Con `describe.skip` in assenza di credenziali il file non disturba
la CI di chi non le ha.

---

### M-5 · `stateRef` aggiornato in `useEffect`

> ✔ **Risolto** l'8 agosto esattamente come descritto sotto.

**File.** `src/hooks/useSyncedDispatch.js:26-28`

**Perché.**

```js
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
```

`useEffect` gira **dopo** il commit. Fra due `dispatch` chiamati nello stesso
handler, `stateRef.current` è ancora quello *precedente al primo*. Il motivo per
cui il ref esiste (mantenere stabile l'identità di `dispatch`) è giusto; il
punto di aggiornamento no.

L'impatto oggi è limitato, e va detto onestamente: i `guard` sono idempotenti
rispetto a questo scarto, e i casi che leggono lo stato per *calcolare* il
valore da scrivere — `TOGGLE_TEAM_MEMBER_ACTIVE` con `!curr?.active`,
`TOGGLE_PIN_NOTICE` con `!prev?.pinned` — sono guidati da click separati, fra i
quali l'effetto ha già girato. È una latenza, non un bug osservato.

Vale però la pena chiuderla, perché è la classe di difetto che si manifesta solo
quando qualcuno aggiunge un flusso che dispatcha due volte di fila — cosa che il
codice già fa altrove (`pickClient` in `TaskSlideOver.jsx:89-96` dispatcha
`client` e poi `contact`).

**Soluzione.** Assegnare in fase di render. Per un ref che rispecchia una prop o
uno state — senza leggerlo nello stesso render — è il pattern corretto e non
introduce impurità osservabile:

```js
  // Assegnato in RENDER e non in useEffect: l'effetto gira dopo il commit,
  // quindi fra due dispatch nello stesso handler il ref conserverebbe lo stato
  // precedente al primo. I guard non se ne accorgono (sono idempotenti), ma le
  // entry che dal vecchio stato CALCOLANO il valore da scrivere — il `!curr.active`
  // di TOGGLE_TEAM_MEMBER_ACTIVE, il `!prev.pinned` di TOGGLE_PIN_NOTICE —
  // sceglierebbero sul valore sbagliato. Il ref non viene mai letto durante il
  // render, quindi l'assegnazione non rende questo componente impuro.
  const stateRef = useRef(state);
  stateRef.current = state;
```

---

### B-1 · Refetch completo anche su `tasks`

> ✔ **Risolto** l'8 agosto. La correzione non è però "non ricaricare": i
> commenti e la cronologia sono annidati nella riga task, quindi un commento
> nuovo va comunque letto. Ciò che si evita è di rileggerlo passando da
> `TASK_SELECT_WITH_COMMENTS` — nuova API `TaskThreads` per le sole due tabelle
> figlie, nuova azione `SET_TASK_THREADS` che le rinnesta sui task già in
> stato. La verifica sul cap `db-max-rows` resta parziale: vedi §2-ter.

**File.** `src/hooks/useAppHydration.js:32-46`

✅ `tasks` = 246, `task_history` = 569, `comments` = 7. Oggi il volume è
modesto, ma la struttura è la stessa di A-1 e peggiora nello stesso modo:
`TASK_SELECT_WITH_COMMENTS` porta con sé commenti e cronologia con i join sui
nomi, `includeDeleted: true` include il cestino, non c'è paginazione, e la
sottoscrizione è su **tre** tabelle — quindi anche un semplice commento
ricarica l'intero grafo dei task.

La stessa correzione di A-1 (propagare la tabella d'origine) si applica qui:
un evento su `comments` o `task_history` non richiede di ricaricare i task.
Priorità bassa perché il volume attuale non fa male; è il candidato successivo
non appena A-1 è in piedi, visto che il meccanismo sarà già pronto.

Va inoltre verificato ✅ se il progetto ha un cap di righe lato PostgREST
(`db-max-rows`): con una query senza `.range()` un eventuale cap tronca la
risposta **in silenzio**, e il sintomo sarebbe "alcuni task non si vedono", che
è difficilissimo da attribuire.

### B-2 · `leaked_password_protection` disabilitata

✅ Confermato dall'advisor live, già elencato in `SICUREZZA.md` §6 punto 1.
Resta un interruttore nella dashboard (Auth → Password), non fattibile da
codice. Costo nullo, valore reale visto che l'accesso è a sola password.

### B-3 · Formattatori e limiti duplicati

> ✔ **Risolto** l'8 agosto, e la risposta è quella che il rilievo ipotizzava:
> sono scelte, non deriva. ✅ Verificato su `storage.buckets` che i due limiti
> rispecchiano ciascuno il `file_size_limit` del proprio bucket (50 MB
> `task-files`, 25 MB `chat-files`). Tutti e quattro i punti portano ora il
> rimando incrociato e il motivo per cui divergono.

📄 `taskUtils.js:4` (`formatDate`) e `listeApi.js:411` (`fmtDate`) formattano
entrambi date per la UI, con nomi e comportamenti diversi. `fileUtils.js:6`
fissa 50 MB per gli allegati task, `chatFiles.js:9` 25 MB per la chat.

Nessuno dei due è un difetto — il modulo Liste ha di proposito una sua identità
visiva, e i due limiti possono benissimo essere una scelta. Il rilievo è che
*non è scritto da nessuna parte che siano scelte*, quindi il prossimo che tocca
uno dei due non sa se sta allineando o divergendo. Basta un commento incrociato
su ciascuno che rimandi all'altro e dica perché differiscono.

### B-4 · Warning ESLint

> ✔ **Risolto** l'8 agosto. 🔬 Il conteggio qui sotto era già stale: 19
> `no-multi-comp` e 4 `exhaustive-deps`, non 22 e 1. Sui primi la decisione era
> già stata presa e scritta in `eslint.config.js`; i quattro `exhaustive-deps`
> portano ora un disable mirato con la ragione, e quell'arretrato è a zero.

🔬 22 `react/no-multi-comp` e 1 `react-hooks/exhaustive-deps`
(`Toast.jsx:14`, dipendenza `dispatch` mancante — innocua, `dispatch` ha
identità stabile per costruzione in `useSyncedDispatch`). Zero errori.

I 22 `no-multi-comp` sono in larga parte legittimi: un sotto-componente privato
accanto a chi lo usa è più leggibile di un file in più. La raccomandazione non è
di sistemarli, ma di **decidere**: o si disattiva la regola in
`eslint.config.js` con una riga di motivazione, o la si rispetta. 22 warning
permanenti addestrano a non leggere l'output del linter, ed è quello il costo
vero — perché è lo stesso output in cui comparirà il ventitreesimo, che magari
conta.

---

## 4. Top 3 suggerimenti strategici

### 1. Dare al realtime la granularità che gli manca — e iniziare dal modulo Liste

**Perché prima di tutto.** È l'unico rilievo con una traiettoria: gli altri
costano oggi quanto costeranno fra sei mesi, questo no. 616 liste e 5.315
movimenti fanno sì che ogni movimento registrato scarichi tre dataset completi
su ogni client connesso, e sia il numero di righe sia il numero di utenti
crescono. La correzione (A-1) è contenuta — propagare al callback di reload
*quale* tabella ha generato l'evento — e sblocca la stessa correzione per i task
(B-1) senza altro lavoro di impianto.

Da fare per primo anche perché è a rischio bassissimo: non tocca permessi, non
tocca RLS, non cambia il modello di dati, e il gen-counter esistente continua a
proteggere dalle risposte fuori ordine.

### 2. Portare a misura ciò che oggi è affermato: RLS testata, documentazione verificata

> ✔ **Eseguito in questa PR** (A-3, M-4) — vedi §2-bis. Il testo che segue è la
> diagnosi originale, lasciata perché spiega il *perché* della correzione, non
> solo il *cosa*.

Il progetto ha una qualità non comune, e la deve a un metodo esplicito: scrivere
accanto a ogni scelta il perché, e verificare invece di supporre. I due rilievi
A-3 e M-4 sono la stessa crepa in quel metodo, ai due estremi. Da un lato
`SICUREZZA.md` affermava cose che erano vere e non lo erano più — con l'effetto
paradossale di **sottostimare** la postura reale (la CSP blocca, il Junior è
applicato dal DB) e insieme di autorizzare mosse pericolose (aggiungere uno
script inline "tanto è Report-Only"). Dall'altro, la conformità fra i permessi
client e le policy RLS era garantita «dalla lettura, non da un test» — parole
del documento stesso — proprio mentre quelle regole sono scritte in due posti.

Resta una differenza fra le due correzioni, ed è la stessa notata in §2-bis per
M-4: `SICUREZZA.md` oggi descrive lo stato vero, misurato — non richiede altro.
I quattro test d'integrazione RLS invece esistono ma restano `describe.skip`
finché nessuno provisiona un progetto di staging: la frase più importante del
documento è passata da opinione informata a *misurabile*, non ancora a
*misurata*. L'ultimo passo — creare i tre utenti di test e impostare le
variabili d'ambiente — è deliberatamente rimasto fuori da questa sessione:
tocca un progetto Supabase reale (per quanto di staging) e non è una decisione
che spetti a un'analisi di codice.

### 3. Rendere l'architettura verificabile, non solo documentata

`VoyageDesk.jsx` contiene un'invariante scritta bene — *le viste non ricevono
`state`* — con la motivazione tecnica accanto. Cinque viste su sei la
rispettano; `AdminView` no (M-1). Allo stesso modo, tutte le entità di dominio
hanno una subscription realtime tranne `clients` (A-2), e tutte le entità
passano dal registry di persistenza.

Il valore di sistemare queste due eccezioni non è il micro-guadagno di
performance: è che **un'invariante con un'eccezione non è più un'invariante**,
e smette di poter essere controllata — da una persona in review come da un test.
Una volta chiuse, entrambe diventano affermazioni verificabili meccanicamente
(un test che monta ogni vista e asserisce che non riceva `state`; un test che
confronti l'elenco delle entità del reducer con quello delle tabelle
sottoscritte). Il progetto ha già dimostrato di saper fare esattamente questo
con `persistenceGuards.test.js`, che blinda la coincidenza fra guard e reducer:
è lo stesso movimento, applicato a due invarianti che oggi vivono solo nei
commenti.

---

## Appendice — cosa ho verificato e non ho trovato

Elencato perché un audit che riporta solo i problemi non dice quanto in largo ha
guardato, e perché la prossima persona non rifaccia lo stesso lavoro.

| Verifica | Esito |
|---|---|
| Tabelle `public` senza RLS | nessuna ✅ |
| Errori dell'advisor di sicurezza | 0 ✅ (10 warning, tutti attesi e motivati) |
| GRANT residui su `public` per `anon` | 0 ✅ |
| Bucket `avatars` pubblico | no, privato ✅ |
| `allowed_mime_types` su `chat-files` / `task-files` | 36 tipi entrambi, SVG e HTML esclusi ✅ |
| Migrazioni di sicurezza del 6 agosto applicate | 11 su 11 ✅ |
| Colonna `users.seniority` + `private.can_use_task_category` | presenti e cablate in `tasks_insert`/`tasks_update` ✅ |
| `dangerouslySetInnerHTML` / `innerHTML` | 0 occorrenze 📄 |
| Segreti nel bundle client | solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` 📄 |
| Redirect aperto nell'invito (`safeRedirect`) | ristretto a produzione + preview del progetto, label annidate escluse 📄 |
| CORS delle Edge Function | riflette l'Origin solo se del progetto, altrimenti produzione 📄 |
| Autorizzazione delle Edge Function | `invite-user` e `delete-user` admin-only; `delete-account` self-service; `send-push` su secret confrontato a tempo costante 📄 |
| Sink di navigazione con input utente | `window.open(signedUrl, "_blank", "noopener")` e schemi `tel:`/`sms:`/`wa.me` da `sanitizePhone` 📄 |
| Escalation via `users_update_self` | bloccata dal trigger che ripristina `role`/`active`/`pending`/`capacity`/`id` 📄 |
| Coerenza fra file di migrazione e stato applicato | allineata; le versioni in `schema_migrations` non coincidono con i nomi dei file, ma `scripts/verifica-rpc/verifica-migrazioni.js` confronta per nome e gestisce già lo scarto 📄 ✅ |

---

*L'analisi (§1-§4) è stata prodotta senza modificare nulla. Le correzioni di
A-1, A-2, A-3 e M-4 sono state applicate in momenti successivi, su richiesta
esplicita, e sono registrate in §2-bis; la sola DDL eseguita sul database in
tutta la sessione è `20260807215625_clients_realtime`, autorizzata
singolarmente — A-3 e M-4 non hanno toccato il database, solo documentazione,
codice di test e configurazione. M-1, M-2, M-3, M-5 e i quattro rilievi Bassa
priorità restano aperti e non hanno prodotto modifiche.*
