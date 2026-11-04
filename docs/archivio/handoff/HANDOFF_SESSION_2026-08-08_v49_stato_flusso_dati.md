# HANDOFF — sessione 49 (8 agosto 2026)

> Branch `claude/app-architecture-security-review-8olt5n`, sopra `69d3698`.
> Chiude quattro rilievi di priorità **Alta** dell'audit sulla gestione dello
> stato e il flusso dati: **S-1, S-2, S-3, S-5**. Un quinto commit fuori
> perimetro (echo DELETE) emerso lavorando su S-1. **S-4** non è stato
> nemmeno assegnato — non ne esiste descrizione in questa sessione, solo il
> numero nella tabella delle priorità originale.

## In una riga

Quattro correzioni indipendenti sul realtime e sulla persistenza, ognuna in
un commit a sé e revertabile da sola, più una migrazione **scritta ma non
ancora applicata** che va eseguita a mano prima che il codice di S-1 vada in
produzione.

## Stato misurato

| | Prima (69d3698) | Dopo |
|---|---|---|
| Test | 831 verdi + 7 skipped | **870 verdi + 7 skipped** (+39, 3 file nuovi) |
| ESLint | 0 errori, 19 warning | **invariato** |
| Build produzione | ok | ok |
| `reducer.js` | ~504 righe effettive | **539** (deroga a 550 in `eslint.config.js`, margine 11) |

## Come sono nati questi quattro rilievi

Non da un audit scritto a file: da un'analisi diretta in conversazione
("gestione dello stato e flusso dati"), poi selezionati a mano (S-1, S-3,
S-5) e assegnati a **tre agenti paralleli**, uno per fix. **S-2** è stato
aggiunto dopo, incollato dall'utente da una copia della sua risposta perché
il testo originale era andato perso in una compattazione del contesto — non
esiste quindi un file `docs/AUDIT_*` per questa sessione, a differenza delle
precedenti. Se serve rileggere la formulazione esatta di un rilievo, non
c'è: solo questo handoff e i messaggi dei commit.

## Cosa è cambiato, e perché

### S-1 · Il contratto di `origin_client` non era garantito dallo schema

`subscribeToTable` (`src/lib/api.js`) scarta l'eco della propria scrittura
leggendo `payload.new.origin_client`. Delle 12 tabelle pubblicate su
`supabase_realtime`, **quattro non avevano la colonna**: `clients`,
`task_history`, `liste_viaggio`, `movimenti_lista`. Il filtro non falliva,
degradava in silenzio in "nessun filtro" — traffico, non un errore.

- **`clients`**: `Clients.create/update` erano le uniche mutazioni a non
  passare da `withOrigin`. Corretto in `src/lib/api.js`.
- **`task_history`**: il caso peggiore — `tasks` è taggata correttamente e
  il difetto passava comunque, perché il trigger `log_task_history()`
  scrive in una tabella figlia anch'essa realtime, senza origine.

Migrazione `supabase/migrations/20260808120000_origin_client_clients_task_history.sql`
(⛔ **NON APPLICATA**, vedi sotto):
1. `alter table clients/task_history add column origin_client uuid`
2. `create or replace log_task_history()` — propaga `NEW.origin_client` (la
   riga `tasks` madre) in tutte e sei le insert (created, status, priority,
   due_date, assignees, trashed/restored)
3. `create or replace modifica_lista()` — imposta `origin_client = NULL`
   quando rinomina un cliente da Liste. **Senza questo il punto 1 sarebbe
   una regressione**: la rinomina lascerebbe in riga l'origine dell'ultima
   modifica anagrafica, e proprio quell'utente scarterebbe come eco propria
   la rinomina fatta da qualcun altro. Corpo copiato da
   `pg_get_functiondef` in produzione, unica differenza la riga aggiunta.

**Deviazione consapevole**: nessuna `REPLICA IDENTITY FULL` sulle tabelle
nuove. Sulle DELETE l'origine letta con FULL sarebbe quella dell'ULTIMA
SCRITTURA (chi ha modificato la riga per ultimo), non di chi cancella:
filtrarci sopra nasconderebbe la cancellazione proprio a chi l'ha toccata
per ultimo. Vedi il blocco (a) in fondo alla migrazione, che documenta anche
perché le sette tabelle già a FULL (`tasks` compresa) avevano lo stesso
problema — è il quinto commit, sotto.

**Perimetro dichiaratamente ridotto**: `liste_viaggio`/`movimenti_lista`
restano senza tagging. Sono 16 RPC — `create or replace` con un parametro in
più produce un *overload*, non una sostituzione, e con le migrazioni
applicate a mano un client che mandasse `p_origin` a un DB non ancora
migrato romperebbe ogni scrittura del modulo. È anche il modulo che perde
meno dal difetto: il refetch a ogni scrittura è già la scelta esplicita
(niente ottimistico in Liste).

### S-2 · Nessun recupero dopo un buco di connessione

Postgres Changes non offre ripresa da offset: se il socket cade (schermo
bloccato, cambio rete, tab in background) supabase-js riaggancia il canale
da solo, ma gli eventi persi nel frattempo non arrivano mai. Prima di questo
fix l'app non aveva alcun modo di saperlo: nessun listener `online`
nell'intero `src/`, e l'unico `visibilitychange` era quello dell'heartbeat
di presence (aggiorna lo stato *altrui*, non i nostri dati).

Corretto in `useDebouncedTableSubscription.js`, punto centrale condiviso da
**tutti** i consumatori (`useAppHydration`, `useNotifications`,
`useChatData`, `useListeData`): due nuovi listener, `online` e
`visibilitychange` verso `visible`, innescano lo stesso reload completo
(`tabelle = null`) dell'idratazione iniziale — l'unico corretto, perché non
c'è modo di sapere cosa si è perso. Debounce dedicato di 300ms per coalescere
i due segnali se arrivano vicini (sbloccare lo schermo spesso riaggancia
anche la rete), e assorbe **subito**, alla ricezione del segnale — non allo
scadere del suo timer — un reload parziale già in coda nel debounce
normale. Il test l'ha preso alla prima stesura: col `delay` di default a
200ms, il timer del reload parziale vinceva la corsa contro i 300ms di
quello di ripresa e partivano entrambi.

Zero modifiche richieste ai quattro consumatori: gestiscono già
`tabelle = null` come branch dell'idratazione iniziale.

### S-3 · Il reload manuale delle Liste scavalcava la protezione anti-race

`ListeViaggio.jsx` → `reloadAll()` chiamava `loadHome()` senza argomenti,
firma `(isCurrent = () => true, tabelle = null)`. Due difetti in una riga:

1. Il **gen-counter era disattivato** — un reload manuale lento e uno
   realtime veloce potevano atterrare invertiti, vinceva il più vecchio.
2. `tabelle = null` è il codice di "idratazione iniziale, carica tutto": il
   ramo selettivo di A-1 (audit di agosto) non scattava mai su questo
   percorso, che è il più caldo — `ListaDetail` chiama `onReload()` dopo
   **ogni** scrittura.

La generazione (`genRef`) è ora dentro `useListeData` e vale per tutti i
chiamanti. 12 call site dichiarano cosa la scrittura può aver invalidato
(`TABELLE_MOVIMENTO` vs `TABELLE_LISTA`). `loadDetail` ha la sua guardia
(`detailGenRef`), con bump esplicito alla chiusura.

### S-5 · Un refetch concorrente annullava una scrittura in volo

Fra il dispatch ottimistico e il commit passano centinaia di ms. Se in
quella finestra l'evento realtime di un **altro** utente fa ripartire
`Tasks.list()`, la SELECT può arrivare prima del nostro commit — e non si
autocorregge: l'eco della nostra scrittura porta il nostro `origin_client`
ed è scartata, quindi nessun refetch successivo rimette a posto la UI.
L'utente vede la propria modifica sparire senza sapere che sul DB c'è.

`entityId(action)` dichiarato nella entry del registry
(`src/state/persistence.js`), non dedotto nell'orchestratore. `MARK_/
UNMARK_PENDING_WRITE` in `useSyncedDispatch.js`: marca prima di `persist`,
smarca in un `finally` (dopo il rollback). `state.pendingWrites` è una
**Map id → contatore**, non un Set — due scritture ravvicinate sulla stessa
riga non si smarcano a vicenda. Letto da `SET_TASKS`/`SET_TASK_THREADS`.

Oggi `entityId` è dichiarato **solo** sulle entry dei task (vedi "Cosa resta
aperto").

### Quinto commit, fuori perimetro · Non filtrare l'origine sulle DELETE

Emerso lavorando su S-1, riguarda le sette tabelle già a
`REPLICA IDENTITY FULL` (`tasks`, `notices`, `conversations`, `messages`,
`comments`, `users`, `notifications`):

> A modifica un task (origin = A) → B lo purga dal cestino → l'evento DELETE
> arriva ad A con origin = A → A lo scarta come eco propria → nella lista di
> A quel task resta finché non ricarica la pagina.

Non è una perdita: l'eco della *propria* DELETE non era comunque filtrabile
(non porta il tag), quindi quel ramo scartava solo cancellazioni altrui —
esattamente gli eventi che servivano. Stessa decisione di S-1 sulla
`REPLICA IDENTITY`, dal lato opposto. Commit isolato, revertabile senza
toccare il tagging.

## Verifica

Ogni fix porta test **verificati rossi senza la correzione**:

| Fix | File | Casi | Rossi senza il fix |
|---|---|---|---|
| S-1 | `realtimeOriginContract.test.js` | 7 | sì |
| S-2 | `realtimeReconnect.test.jsx` | 6 | sì (4/6) |
| S-3 | `listeReload.test.jsx` | 3 | sì |
| S-5 | `pendingWrites.test.jsx` | 15 | sì (8/15) |
| DELETE | `realtimeEcoDelete.test.js` | 8 | sì (1/8) |

`realtimeOriginContract.test.js` misura l'invariante "pubblicata su realtime
⇒ ha `origin_client`" **sui file di migrazione**, con le due eccezioni
dichiarate e un test che impedisce a quell'elenco di invecchiare senza che
qualcuno lo noti. `realtimeEcoDelete.test.js` è il primo test a guidare il
filtro anti-eco vero (non un mock di `subscribeToTable` come tutti gli
altri test del realtime).

## ⚠️ Migrazione — azione manuale prima del merge in produzione

`supabase/migrations/20260808120000_origin_client_clients_task_history.sql`
è **scritta, committata, NON applicata**. Va eseguita a mano sul DB
**prima** che il codice di S-1 vada live: nel verso sbagliato,
`Clients.create/update` rispondono `PGRST204` e ogni salvataggio in
anagrafica fallisce. Nel verso giusto non c'è finestra scoperta (colonna in
più, nessuno la scrive, resta `NULL`). Nessuna firma di RPC cambia — i due
`create or replace` vanno copiati dal file, non ritrascritti.

## Cosa resta aperto

- **`origin_client` sulle 16 RPC di Liste** (`liste_viaggio`,
  `movimenti_lista`) — da fare in un pezzo solo: 16 `drop function` +
  `create function` con `p_origin`, più il fallback client sul modello di
  `isMissingColumn` in `src/state/persistence.js`.
- **`entityId` su `SET_CLIENTS`/`SET_NOTICES`** — stessa race di S-5, il
  meccanismo è già generico (Map pendingWrites), manca solo dichiararlo
  nella entry.
- **`UNDO_LAST_ACTION`, `EMPTY_TRASH`, `RENAME_CLIENT_IN_TASKS`** — i loro id
  si calcolano dallo state al momento del dispatch, non dall'action: la
  firma `entityId(action)` non li copre. Tre percorsi dove la finestra di
  S-5 resta aperta.
- **S-4**, e il resto dell'audit su performance/scalabilità e UX/gestione
  errori — mai indagati in questa sessione. Se si riprende quel filone,
  ripartire da zero (rifare l'analisi), non cercare un rilievo "S-4" che non
  è mai stato scritto da nessuna parte.

## File toccati

```
nuovi
  supabase/migrations/20260808120000_origin_client_clients_task_history.sql
  src/test/realtimeOriginContract.test.js       7 casi — S-1
  src/test/realtimeEcoDelete.test.js            8 casi — quinto commit
  src/test/pendingWrites.test.jsx               15 casi — S-5
  src/test/listeReload.test.jsx                 3 casi — S-3
  src/test/realtimeReconnect.test.jsx           6 casi — S-2

S-1  src/lib/api.js (Clients.create/update, subscribeToTable, commenti)
S-2  src/hooks/useDebouncedTableSubscription.js
S-3  src/components/liste/useListeData.js, ListeViaggio.jsx, ListaDetail.jsx
S-5  src/state/reducer.js, src/state/persistence.js, src/hooks/useSyncedDispatch.js
     src/test/persistenceGuards.test.js (SOLO_CLIENT: MARK_/UNMARK_PENDING_WRITE)
5°   src/lib/api.js (subscribeToTable — filtro origine solo su INSERT/UPDATE)
doc  docs/CLAUDE.md (Persistenza: pendingWrites; nuova voce: ripresa connessione)
     eslint.config.js (commento conteggio reducer: 504 → 539)
```

## Da dove ripartire

1. **Applicare la migrazione a mano** prima che il codice arrivi in
   produzione (vedi sopra) — è l'unico passo bloccante rimasto.
2. I tre punti in "Cosa resta aperto" sono indipendenti fra loro: nessuno
   blocca gli altri, nessuno richiede lavoro sullo schema tranne il primo.
3. Se si riprende l'audit su performance/scalabilità o UX/errori, non esiste
   nessun file scritto da rileggere — va rifatta l'analisi da capo.
