# CHANGELOG — VoyageDesk


## v2.8-dev — Candidati low-risk: filtro data/ora coda Driver + dark mode (sessione 25)

> Branch `claude/handoff-changelog-roadmap-xlkae9`. Feature low-risk portate da PR #62 (commit isolati), depurate dalle parti obsolete (chip pratica) e dai moduli rimossi in #63.

### 🚐 Filtro data/ora nella coda personale Driver (vista transfer)

- **`src/components/dashboard/Dashboard.jsx`**: `PersonalQueue` accetta `enableDateFilter` (attivo per `role === "driver"`). Chip **Tutte / Oggi / Domani** + `<input type="date">` per filtrare i transfer per giornata; contatore `filtrati/totale`; orario (`formatTime`) mostrato nelle card. Titolo/sottotitolo dedicati ("La mia coda transfer"). Empty-state contestuale (📭) quando il filtro non produce risultati.
- Risolve il bisogno di Giulia (Driver) di una vista transfer-oriented.

### 🌙 Dark mode con toggle in Topbar

- **Token semantici** (`src/VoyageDesk.jsx` FontLoader): `--card` (superficie card, sostituisce gli `#fff` inline dei contenuti) e `--heading` (titoli su card, sostituisce `color: var(--navy)`). In light coincidono coi valori storici → **nessun cambiamento visivo**.
- **Blocco `[data-theme="dark"]`**: superfici scure, testo chiaro, `color-scheme: dark`. La **shell** (topbar/sidebar/bottom-nav) resta brand-celeste per scelta di design (evita testo invisibile sui controlli). `--navy` resta scuro (bg bottoni con testo bianco).
- **Toggle 🌙/☀️ in Topbar** (`src/components/shell/Topbar.jsx`): stato solo-sessione, **nessun localStorage** (vincolo CLAUDE.md), `data-theme` applicato su `<html>` via `useEffect`.
- Sostituzioni `#fff`→`var(--card)` e `var(--navy)`→`var(--heading)` propagate ai componenti contenuto (Dashboard, AdminView, Calendar, Chat, Clienti, Trash, Team, modali, ui). `TaskSlideOver`/`ClientiView` adattati a post-#63 (input `praticaRef` al posto del select pratica; badge dossier non reintrodotto).

### 🔍 Revisione PR aperte

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
