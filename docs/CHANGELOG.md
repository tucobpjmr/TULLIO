# CHANGELOG — VoyageDesk

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
