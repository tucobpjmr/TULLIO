# HANDOFF — sessione 48 (8 agosto 2026)

> Branch `claude/refactor-tech-optimizations-oxahiv`, sopra `ed99769`.
> Chiude i rilievi rimasti di `docs/AUDIT_ARCHITETTURA_2026-08.md`: **M-1, M-2,
> M-3, M-5, B-1, B-3, B-4**. Resta aperto **solo B-2**, che non è codice.

## In una riga

L'audit di agosto è chiuso tranne un interruttore nella dashboard Supabase.
Nessun cambiamento di comportamento visibile all'utente: sono correzioni
strutturali, più tre misure che smentiscono numeri scritti nell'audit stesso.

## Stato misurato

| | Prima (7 ago) | Dopo |
|---|---|---|
| Test | 813 verdi + 7 skipped, 66 file | **831 verdi + 7 skipped, 69 file** |
| ESLint | 0 errori, 23 warning | **0 errori, 19 warning** (tutti `no-multi-comp`) |
| `exhaustive-deps` | 4 warning | **0** |
| Build produzione | ok | ok |

## Cosa è cambiato, e perché

### M-1 · `AdminView` fuori dall'eccezione

Era l'unica delle sei viste a ricevere `state` intero, e lo drillava a tutte e
cinque le tab: con il pannello Admin aperto, ogni carattere digitato nella
ricerca della Topbar ridisegnava anche le statistiche.

Le tab leggono ora team e categorie da `AppDataContext` e i task da
`TasksContext`. Le quattro fette che non vivono in un contesto — `agencyName`,
`notices`, `activityLog`, `messageTemplates` — arrivano come prop mirate **da
`VoyageDesk.jsx`**, non estratte da uno `state` che `AdminView` continuava a
ricevere: è la differenza fra ridurre l'eccezione e chiuderla. `AdminView` è
ora avvolta in `memo` come le altre cinque.

`src/test/adminView.test.jsx` (6 casi) monta ogni tab **senza** `state`: se
qualcuno reintroducesse una lettura da `state.qualcosa`, il render solleva lì e
non in produzione dentro il `ViewErrorBoundary`. L'invariante è passata da
convenzione a misura.

> ⚠️ `Topbar` e `Sidebar` ricevono ancora `state`. È voluto e fuori dal
> perimetro di M-1: l'invariante riguarda le **viste**, non il guscio, che di
> `state` consuma davvero quasi tutto.

### M-2 · L'autocomplete cliente era quadruplicato, non triplicato

`src/components/ui/ClientAutocomplete.jsx` — hook `useClientSuggestions` per la
logica, componente `ClientSuggestions` per il markup.

**L'audit contava tre copie; erano quattro.** A `TaskSlideOver`, `QuickAddTask`
e `ManualTab` si aggiungeva `TemplateTab`, che nessuno aveva notato — ed è
esattamente il modo in cui questa duplicazione cresceva. Vale la pena tenerlo a
mente rileggendo gli altri conteggi dell'audit: due dei tre numeri che ho
rimisurato erano sbagliati.

Le due varianti di stile superstiti sono dichiarate in un posto solo: quella
`compact` (modali bulk) ha uno z-index più alto perché deve scavalcare il
pannello del modale, non solo la card che la contiene. 13 test nuovi coprono
filtro, taglio a sei, regola del match esatto, ritardo di 150 ms sul blur e
`onMouseDown`-non-`onClick`.

### M-3 · Il cambio-utente esce dal bundle di produzione

Guard `import.meta.env.DEV` sul `case "SET_CURRENT_USER"` nel reducer e sul
montaggio di `AdminRollbackBanner`. Non era una vulnerabilità — l'unico
ingresso UI era già gate-ato — ma quel case cambia `currentUserId`, cioè il
valore su cui poggia `canAccessAdmin`.

**Verificato sul bundle buildato**, non dedotto:

```
"Sessione Admin attiva"   → 0 occorrenze in dist/
"Rimani come Admin"       → 0
"Rollback automatico"     → 0
SET_CURRENT_USER          → case"SET_CURRENT_USER":return e;
```

Il corpo — controllo ruolo, view lock, toast di elevazione, bookkeeping del
rollback — non esiste più in produzione. Resta il cambio-utente demo in
sviluppo dietro `VITE_DEMO_SWITCH=true`, e i test restano verdi perché sotto
Vitest `DEV` è `true`.

### M-5 · `stateRef` assegnato in render

`useSyncedDispatch.js`: `stateRef.current = state` nel corpo del render invece
che in un `useEffect`, che gira dopo il commit. Il ref non è mai letto durante
il render — solo dentro il callback — quindi nessuna impurità osservabile.

### B-1 · Un commento non ricarica il grafo dei task

Stessa forma di A-1, un piano più in basso. `useAppHydration` si sottoscrive a
tre tabelle (`tasks`, `comments`, `task_history`) e ricaricava
`TASK_SELECT_WITH_COMMENTS` per ognuna — join sui nomi, cestino incluso,
nessuna paginazione — su ogni client connesso.

La correzione **non** è "non ricaricare": commenti e cronologia sono annidati
nella riga task, quindi un commento nuovo va comunque letto. Ciò che si evita è
di rileggerlo passando dai task:

- nuova `TaskThreads` in `lib/api.js` per le sole due tabelle figlie;
- nuova azione `SET_TASK_THREADS` che le rinnesta sui task già in stato
  (chiave assente = fetta non ricaricata, che non è "zero righe");
- un evento su `tasks` — anche coalescato con un commento nella stessa finestra
  di debounce — continua a ricaricare tutto, che lì è la cosa giusta.

6 test nuovi in `realtimeGranularita.test.jsx`, accanto a quelli di A-1.

### B-3 · Non erano doppioni: erano scelte non dichiarate

Ed è il motivo per cui la correzione è un commento e non una fusione.

✅ Verificato su `storage.buckets`: `task-files` ha `file_size_limit`
52428800 e `chat-files` 26214400. I due limiti nel codice rispecchiano ciascuno
il **proprio** bucket — allinearli "per coerenza" romperebbe la corrispondenza
col server, che è l'unica ragione per cui esistono. I due formattatori di data
ricevono input diversi (timestamp ISO contro colonna `date`) e rendono formati
diversi di proposito. Tutti e quattro i punti portano ora il rimando incrociato
e la ragione.

### B-4 · Il conteggio era stale, e la decisione era già presa

🔬 Misurati **19** `react/no-multi-comp` e **4** `exhaustive-deps`, non 22 e 1.

Sui primi non c'era nulla da decidere: `eslint.config.js` documenta già
l'arretrato (19 casi in 12 file, tracciati anche in `docs/CLAUDE.md`) e la
ragione per cui resta un warning.

I quattro `exhaustive-deps` erano tutti omissioni **volute**, e non innocue come
le dava l'audit: includere `dispatch` in `Toast` significa un toast che non
sparisce più se il dispatch è instabile; includere `markConversationRead` in
`ConversationView` significa una RPC di mark-as-read per messaggio in arrivo.
Portano ora un `eslint-disable-next-line` con la ragione accanto, e
quell'arretrato è a **zero**: il prossimo warning di quella regola è nuovo per
definizione.

## Cosa resta aperto

### B-2 — `leaked_password_protection` (non fattibile da codice)

✅ Riconfermato sull'advisor live l'8 agosto: ancora `WARN`.

**Azione richiesta a una persona:** dashboard Supabase → Authentication →
Password → abilitare "Leaked password protection". Costo nullo, valore reale
visto che l'accesso è a sola password.

### Il cap `db-max-rows`, e perché guardarlo adesso

B-1 chiedeva di verificare se PostgREST tronchi le risposte non paginate. La
verifica è **parziale**, e vale la pena dire cosa manca:

- ✅ `pg_db_role_setting` non contiene `pgrst.db_max_rows` per `authenticator`,
  `anon` o `authenticated`.
- ❌ Il valore effettivo vive nella configurazione della piattaforma
  (dashboard → Settings → API → Max rows) e non è leggibile né da SQL né dalle
  API di gestione. **Va guardato a mano, una volta.**

Perché adesso: ✅ `clients` è a **818 righe** e `Clients.list()` non ha
`.range()`. Se il cap fosse il default storico di 1000, l'anagrafica sarebbe a
meno di 200 clienti dal troncamento **silenzioso** — il sintomo sarebbe
"alcuni clienti non si vedono", fra i più difficili da attribuire.

Se serve, la correzione è un riuso e non un impianto: `fetchAllRows` in
`listeApi.js` pagina già con `.range()` e si ferma sul `count` esatto del
`Content-Range`, cioè **senza dipendere dal valore del cap**. Non l'ho
applicata qui perché è un cambiamento di comportamento fuori dal perimetro di
B-1, e perché la misura che lo giustificherebbe è appunto quella che manca.

## File toccati

```
nuovi
  src/components/ui/ClientAutocomplete.jsx      hook + componente condivisi
  src/test/adminView.test.jsx                   6 casi — l'invariante M-1
  src/test/clientAutocomplete.test.jsx          13 casi — il suggeritore

M-1  src/components/admin/AdminView.jsx + tabs/*.jsx (5) + MessageTemplatesSection.jsx
     src/VoyageDesk.jsx
M-2  src/components/tasks/TaskSlideOver.jsx, modals/QuickAddTask.jsx
     src/components/modals/bulk/{ManualTab,TemplateTab}.jsx
M-3  src/state/reducer.js, src/VoyageDesk.jsx
M-5  src/hooks/useSyncedDispatch.js
B-1  src/lib/api.js, src/state/reducer.js, src/hooks/useAppHydration.js
     src/test/{realtimeGranularita,persistenceGuards}.test.*
B-3  src/lib/{taskUtils,fileUtils,listeApi}.js, src/components/chat/chatFiles.js
B-4  src/components/ui/Toast.jsx, chat/{ChatPanel,ConversationView}.jsx
     eslint.config.js, docs/CLAUDE.md
doc  docs/AUDIT_ARCHITETTURA_2026-08.md (§2, §2-bis, §2-ter + note per rilievo)
```

## Migrazioni

**Nessuna.** Questa sessione non tocca lo schema. `SET_TASK_THREADS` legge da
`comments` e `task_history`, che esistono già e hanno già le loro RLS.

## Da dove ripartire

1. **B-2** e il **cap `db-max-rows`**: entrambi richiedono la dashboard, non una
   PR. Sono gli unici due punti aperti dell'audit.
2. `src/test/integration/rls.test.js` (M-4) è ancora `describe.skip`: esiste la
   capacità di misurare, non la misura. Serve un progetto di staging con
   `RLS_TEST_URL`/`RLS_TEST_ANON_KEY` e i tre utenti descritti nell'intestazione
   del file. **Mai produzione.**
3. Rileggendo l'audit: due dei tre conteggi che ho rimisurato erano sbagliati
   (M-2 e B-4). Vale per gli altri numeri che contiene — rimisurare prima di
   pianificare sopra.
