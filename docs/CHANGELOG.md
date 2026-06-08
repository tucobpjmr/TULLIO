# CHANGELOG — VoyageDesk

## v0.10-dev — Auth Supabase + Persistenza Team (sessione 9)

> Integrazione autenticazione reale Supabase, gate login, team live dal DB, logout nel dropdown utente. Primo step della roadmap persistenza.

### 🔐 Auth Supabase end-to-end
- **`src/lib/supabase.js`**: client Supabase (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
- **`src/lib/auth/AuthContext.jsx`**: AuthProvider con session, profile, team, signIn, signOut, refreshTeam. Legge `public.users` al login.
- **`src/lib/auth/LoginScreen.jsx`**: schermata login dark-mode (email + password). Stile indipendente dall'app.
- **`src/main.jsx`**: gate auth — mostra LoginScreen se `!session`, SplashScreen durante loading, altrimenti BootstrappedApp.

### 👥 Team reale dal DB (step 2a)
- **`src/lib/auth/mapMember.js`**: adatta la riga `public.users` Supabase alla shape `TEAM` del monolite (role machine→label, avatar dalle iniziali, capacity hardcoded).
- **`_syncTeam` / `_syncCurrentUser`**: esportate da `VoyageDesk.jsx` per permettere il bootstrap da `main.jsx`.
- **`_remapMockIds`**: rimappa gli ID stringa ("marco", "sofia"…) ai UUID Supabase nei mock task/notices/chat, così assignees e conversazioni restano coerenti con il team reale.
- **`makeInitialState()`**: sostituisce l'oggetto `initialState` statico con una factory lazy — legge TEAM/CURRENT_USER già aggiornati dal bootstrap.

### 🔑 Logout nel dropdown UserSwitcher
- Voce "↩ Esci dall'account" in fondo al dropdown, con email di sessione visibile.
- Rimosso il FloatingLogoutButton overlay che copriva notifiche e chat.
- `UserSwitcher` importa `useAuth` e chiama `signOut()` di Supabase.

### 🛠️ Fix
- Rinominato `Authconttext.jsx` → `AuthContext.jsx` (typo).
- Corretti import path in `AuthContext.jsx` (`../lib/supabase` → `../supabase`) e `LoginScreen.jsx`.
- Aggiunto `.gitignore` (node_modules, dist, .env).

### 🗄️ Supabase (progetto: `tullio`, ref: `vmxvnxsqfisucugcpqlc`, region: `eu-west-1`)
- 6 tabelle esistenti con RLS: `users`, `tasks`, `comments`, `notices`, `conversations`, `messages`.
- 5 utenti seedati e confermati, password: `tullio2026`.

| Email | Ruolo |
|---|---|
| marco@tullio.local | manager |
| roberto@tullio.local | admin |
| sofia@tullio.local | agent |
| luca@tullio.local | agent |
| giulia@tullio.local | driver |

### 🌐 Vercel (progetto: `tullio`, team: `tooco-s-projects`)
- Env vars presenti: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (Production + Preview).
- Branch di sviluppo: `claude/trusting-einstein-GQM9K`, PR #6.
- Preview URL: https://tullio-git-claude-trusting-einstein-gqm9k-tooco-s-projects.vercel.app

### 📈 Metriche
- File: 7071 → **7127 righe** (delta minimo: solo export e factory).
- File nuovi: `.gitignore`, `package-lock.json`, `src/lib/supabase.js`, `src/lib/auth/AuthContext.jsx`, `src/lib/auth/LoginScreen.jsx`, `src/lib/auth/mapMember.js`, `src/lib/api.js`.

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
