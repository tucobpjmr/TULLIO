# VoyageDesk — Handoff per nuova sessione Claude Code

> **Branch attivo:** `claude/roadmap-progress-HnV5O`  
> **PR GitHub:** `tucobpjmr/TULLIO#10` (draft, open)  
> **Preview Vercel:** `tullio-git-claude-roadmap-progress-hnv5o-tooco-s-projects.vercel.app`  
> **Ultimo commit:** `29e6faa` — Step 6 completato  
> **Data:** 2026-06-08

---

## 1. Cos'è il progetto

**VoyageDesk** è un gestionale per agenzie di viaggio. Stack:

- **React 18** (hooks, no router, SPA monolitica)
- **Vite 5** come build tool
- **Supabase** (PostgreSQL + RLS + Realtime) per dati, auth e storage
- **Vercel** per deploy preview
- **No Tailwind, no CSS framework** — tutto inline styles + CSS variables in `:root`
- Unica dipendenza UI: `xlsx` per import/export

Tutto il frontend vive in **`src/VoyageDesk.jsx`** (~8 300 righe). I file satellite sono minimi.

---

## 2. Struttura file

```
src/
  main.jsx                     # Entry point — wrappa in <AuthProvider><AppShell>
  AppShell.jsx                 # Gate auth: spinner → LoginScreen → VoyageDesk
  VoyageDesk.jsx               # App intera (~8 300 righe)
  lib/
    supabase.js                # Client Supabase (legge VITE_SUPABASE_URL/KEY da .env)
    api.js                     # CRUD layer: Users, Tasks, Comments, Notices,
                               #   Clients, Suppliers, Dossiers, DossierSuppliers,
                               #   Conversations, Messages + subscribeToTable()
    useSupabaseData.js         # Hook caricamento + Realtime + useAsyncDispatch
    auth/
      AuthContext.jsx          # AuthProvider → session, profile, team, signIn, signOut
      LoginScreen.jsx          # Schermata login email/password
```

---

## 3. Architettura chiave

### Reducer + dispatch asincrono

```
VoyageDeskInner
  ├── useReducer(reducer, initialState)  →  _dispatch (sync)
  ├── useAsyncDispatch(_dispatch, stateRef)  →  dispatch (usato ovunque)
  │     ↳ fa dispatch ottimistico, poi sync su Supabase
  └── useSupabaseData(_dispatch, profile.id)
        ↳ carica tasks/team/notices all'avvio
        ↳ Realtime su tasks e notices
```

Ogni componente riceve `state` + `dispatch` come props. **Non usare `_dispatch` direttamente** — passare sempre il wrapper `dispatch`.

### Pattern initialState

```js
const initialState = {
  tasks: [],          // caricati da Supabase (_INIT_ALL)
  notices: [],        // caricati da Supabase (_INIT_ALL)
  team: TEAM,         // array globale mutabile, caricato da Supabase
  loading: true,      // mostra spinner finché _INIT_ALL non arriva
  activeView: "dashboard",
  selectedTask: null,
  currentUserId: null,
  toast: null,
  activityLog: [],
  // ...altri campi UI
};
```

### Azioni reducer principali

```
_LOADING_START / _LOADING_DONE
_INIT_ALL       { tasks, notices, team, currentUserId }
_INIT_NOTICES   { notices[] }
_RT_TASK_UPSERT { task }    ← Realtime INSERT/UPDATE
_RT_TASK_DELETE { id }      ← Realtime DELETE
_SHOW_TOAST     { message, type }
SET_VIEW        { view }
SET_SELECTED_TASK { task|null }
ADD_TASK / UPDATE_TASK / DELETE_TASK / RESTORE_TASK / PURGE_TASK
ADD_TASKS_BULK / MOVE_TASK / EMPTY_TRASH
ADD_COMMENT
ADD_NOTICE / UPDATE_NOTICE / DELETE_NOTICE / TOGGLE_PIN_NOTICE
UPDATE_OWN_PROFILE
APPROVE_TEAM_MEMBER / TOGGLE_TEAM_MEMBER_ACTIVE
```

### Permessi per ruolo

```js
const USER_ROLES = ["admin","manager","agent","driver"];
// Drivers vedono solo: dashboard, calendar
// Agents/Manager vedono: + clients, suppliers, dossiers, team
// Admin vede tutto + trash, admin panel
```

---

## 4. Schema Supabase (tabelle rilevanti)

```sql
users          id, name, role, avatar, color, capacity, active, pending, email, phone, photo_url
tasks          id, title, category, priority, status, assignees(jsonb), client_id(uuid FK clients),
               due_date, estimated_hours, description, deleted_at, dossier_id(uuid FK dossiers),
               created_by(uuid FK users)
comments       id, task_id, user_id, text, created_at
notices        id, text, color, author_id, pinned, created_at
clients        id, name, email, phone, city, address, notes, created_at, updated_at
suppliers      id, name, category(enum), email, phone, city, country, website, notes, created_at
dossiers       id, number(text "PR-YYYY-NNN"), title, destination, status(enum),
               departure_date, return_date, pax_adults, pax_children,
               budget_total, notes, client_id(uuid FK clients),
               created_by(uuid FK users), created_at, updated_at
dossier_suppliers  id, dossier_id, supplier_id, service_type, price, notes, created_at
conversations  id, participants(jsonb), title, updated_at
messages       id, conversation_id, sender_id, text, created_at, reactions(jsonb), read_by(jsonb)
```

**Funzione RPC:** `next_dossier_number()` → genera `PR-YYYY-NNN` (chiamata da `Dossiers.create()`).

**Stato enum dossiers:** `bozza → confermata → in_corso → completata | annullata`

**Priority enum tasks:** `critical, high, medium, low` (EN, non IT)

**Status enum tasks:** `todo, inprogress, awaiting_client, awaiting_supplier, done`

---

## 5. Mapping DB ↔ App (in `useSupabaseData.js`)

```js
// DB → App
dbToTask(row)    row.client_id → task.client,  row.dossier_id → task.dossierId
dbToUser(row)    row.photo_url → user.photoUrl
dbToNotice(row)
dbToComment(row)

// App → DB
taskToDB(task)   task.client → client_id,  task.dossierId → dossier_id
```

---

## 6. Costanti importanti in VoyageDesk.jsx

```js
CATEGORIES       { booking, admin, driver, tour, creative }
PRIORITIES       { critical, high, medium, low }
STATUSES         ["todo","inprogress","awaiting_client","awaiting_supplier","done"]
STATUS_LABELS    { todo:"Da fare", inprogress:"In corso", ... }
STATUS_COLORS    colori per ogni status
DOSSIER_STATUS   { bozza, confermata, in_corso, completata, annullata } → { label, color, bg, next, nextLabel }
SUPPLIER_CATEGORIES { hotel, volo, transfer, tour_operator, assicurazione, crociera, altro }
NAV_ITEMS        array con { id, icon, label, roles[] }
TEAM             array globale mutabile (sincronizzato da _syncTeam)
```

---

## 7. Componenti completati (step 1-6)

| Componente | Riga | Note |
|---|---|---|
| `FontLoader` | 9 | Carica DM Sans + Playfair Display |
| `ViewportProvider` | 94 | `isMobile` (<768), `isTablet` (<1024), `isDesktop` |
| `AppContext` | 290 | Reducer + dispatch |
| `Avatar` | 1060 | Mostra foto o iniziali colorate |
| `PriorityBadge`, `CategoryChip`, `StatusBadge`, `Toast` | 1082+ | Componenti UI base |
| `AdvancedSearchPanel` | 1154 | Ricerca avanzata con filtri categoria/status/agente/date/pratica |
| `Topbar` | 1522 | Barra superiore con search, notifiche, chat, profilo |
| `ProfileEditor` | 1628 | Modifica nome/avatar/colore/email/telefono/foto |
| `Sidebar` | 2066 | Navigazione desktop |
| `BottomNav` | 2131 | Navigazione mobile |
| `BulkTaskCreator` | 2713 | Crea task in blocco (manual/duplicate/import/template) |
| `AIDayPlanner` | 2771 | AI suggerisce giornata (mock) |
| `NoticeBoard` | 3052 | Bacheca avvisi con pin/colori |
| `PersonalQueue` | 3366 | Le mie task (Dashboard) |
| `UrgentOthersQueue` | 3472 | Task urgenti altrui (Dashboard) |
| `UnassignedQueue` | 3582 | Coda globale non assegnata (Dashboard) |
| `OverdueQueue` | 3748 | Task scaduti (Dashboard) |
| `Dashboard` | 3854 | Vista principale con KPI, code, bacheca |
| `QuickAddTask` | 4067 | Modale rapido crea task (con dropdown pratica) |
| `TaskSlideOver` | 4201 | Dettaglio task con commenti, collega pratica, stato |
| `CalendarPlanner` | 4479 | Vista calendario (mese + settimana + distribuzione agenti) |
| `Team` | 4789 | Vista team con card agenti |
| `ChatPanel` + sottomponenti | 5901 | Chat interna team (conversations + messages Supabase) |
| `Trash` | 6034 | Cestino con soft-delete/restore/purge |
| `AdminView` + tab | 6390 | Pannello admin (team, import/export, stats, categorie, log) |
| `ClientSlideOver` | 7165 | Dettaglio cliente (view/edit + task collegati) |
| `ClientsView` | 7308 | Griglia clienti con ricerca |
| `SupplierSlideOver` | 7418 | Dettaglio fornitore (view/edit) |
| `SuppliersView` | 7541 | Griglia fornitori con filtro categoria |
| `DossierSlideOver` | 7659 | Dettaglio pratica (tab Dettagli/Task/Fornitori, workflow stato) |
| `DossiersView` | 7967 | Lista pratiche con KPI bar + filtri |

---

## 8. Roadmap — step rimanenti

### Step 7 — Notifiche in-app reali
- Sostituire `NOTIFICATIONS` (mock array hardcoded) con dati reali
- Creare tabella Supabase `notifications` o usare Realtime per generare notifiche
- `NotificationsPanel` (riga ~1990) attualmente mostra dati mock
- Badge contatore in Topbar mostra `NOTIFICATIONS.filter(n => !n.read).length`

### Step 8 — Badge sidebar dinamici
- Dashboard: mostrare count task in coda non assegnata (badge rosso su "Dashboard")
- Admin: mostrare count `team.filter(m => m.pending).length` (badge su "Admin")
- In `Sidebar` e `BottomNav` — passare i conteggi come props da `state`

### Step 9 — Auto-move task + toast personalizzato
- "Prendi in carico" (pulsante in UnassignedQueue) → sposta task a `inprogress` + assegna a me
- Toast personalizzato con nome task invece del generico
- Attualmente `MOVE_TASK` dispatch già funziona, manca solo l'auto-assign

### Step 10 — Task link cliccabile nella chat
- Nei messaggi chat che contengono un task ID (formato `[task:UUID]`) renderizzare un chip cliccabile
- Click → apre `TaskSlideOver` via `SET_SELECTED_TASK`
- In `ChatMessage` (riga ~5114) e `ConversationView` (riga ~5320)

### Step 11 — Skeleton loading
- Mentre `state.loading === true` mostrare skeleton cards invece dello spinner generico
- Implementare in `Dashboard`, `ClientsView`, `SuppliersView`, `DossiersView`

### Step 12 — Indicatore read-only su card urgenti
- Task con priority `critical` non assegnati a me → badge "Solo lettura" sulla card
- In `PersonalQueue` e nelle kanban card del `Dashboard`

### Step 13 — Dark mode
- Aggiungere set di CSS variables alternate per dark mode
- Toggle in `ProfileEditor` o `AdminStatsTab`
- Salvare preferenza in `localStorage`

### Step 14 — Calendario settimanale migliorato
- `CalendarPlanner` (riga 4479) ha già mese + settimana, ma la vista settimanale è basilare
- Aggiungere time-blocking (slot orari) e drag-to-assign

### Step 15 — Filtro data coda driver
- In `UnassignedQueue` (riga 3582) aggiungere filtro per data scadenza
- I driver vedono solo i task del giorno corrente per default

### Step 16 — Modulo finanziario (Preventivi)
- Nuova vista "Preventivi" nel NAV_ITEMS
- CRUD preventivi collegati a pratiche dossier
- Calcolo margine: `budget_total - somma costi fornitori dossier_suppliers.price`

### Step 17 — Analytics
- Nuova vista "Report" con grafici (usare solo SVG/canvas, no librerie)
- KPI: task completati per settimana, carico agenti, pratiche per status

### Step 18 — Chat extensions
- Messaggi vocali (già scheletro in `VoiceRecorder`)
- File attachments
- @mention con autocomplete

### Step 19 — Bacheca avanzata
- `NoticeBoard` → aggiungere allegati a avvisi
- Avvisi con scadenza (auto-archivio)
- Filtro per autore

### Step 20 — TypeScript + test
- Migrazione incrementale a `.tsx`
- Jest/Vitest unit test per il reducer
- Playwright e2e per flussi critici

---

## 9. Cose da sapere / gotcha

1. **`task.client` è un UUID** (FK → `clients.id`), non un nome. `TaskSlideOver` lo risolve caricando `Clients.list()`. `QuickAddTask` lo popola automaticamente dal dropdown pratica.

2. **`TEAM` è un array globale** (non nello state React puro). Viene mutato da `_syncTeam()` chiamata dentro `_INIT_ALL`. Funzioni come `getMember(id)` lo usano direttamente. Questo è intenzionale per evitare re-render su ogni lookup.

3. **`CURRENT_USER`** è una variabile globale che punta all'id dell'utente loggato. Viene sincronizzata da `_syncCurrentUser(id)` dentro il reducer. Usarla solo per lettura.

4. **Ottimismo**: ogni `dispatch` fa update locale PRIMA della chiamata API. Se l'API fallisce, `_SHOW_TOAST` notifica l'errore ma lo stato NON viene rollbackato (accettabile per MVP).

5. **Realtime tasks**: arriva tramite `subscribeToTable('tasks', ...)` → `_RT_TASK_UPSERT` / `_RT_TASK_DELETE`. Non fare doppio-fetch dopo un dispatch.

6. **`DossiersView`, `ClientsView`, `SuppliersView`** hanno il loro stato locale (caricano da API autonomamente, non dallo state globale) perché queste entità non hanno Realtime attivo. Aggiornamenti locali sono ottimistici via `handleSaved`/`handleDeleted`.

7. **Priority values**: nel DB sono `critical/high/medium/low` (EN). Nella UI sono mappati tramite `PRIORITIES`. Non usare valori italiani.

8. **`isActiveTask(t)`**: helper che filtra `t.deletedAt === null`. Usarlo sempre per escludere task nel cestino dai conteggi.

9. **Stili condivisi** (da `src/VoyageDesk.jsx` riga ~7149):
   ```js
   const fieldStyle = { ... }   // input/select base
   const btnPrimary = { ... }   // bottone navy
   const btnDanger  = { ... }   // bottone rosso
   ```

10. **`useViewport()`** — hook per responsive. Usare `isMobile` per layout compatti.

---

## 10. Comandi utili

```bash
# Sviluppo locale
npm run dev

# Build produzione
npm run build

# Push su branch corretto
git push -u origin claude/roadmap-progress-HnV5O

# Vedere stato Supabase (MCP tools disponibili)
# mcp__2665ef96-*__list_tables / execute_sql / apply_migration
```

---

## 11. Variabili ambiente

```
VITE_SUPABASE_URL=...      # In Vercel project settings
VITE_SUPABASE_ANON_KEY=... # In Vercel project settings
```

Il file `.env` locale non è nel repo. Per sviluppo locale copiare i valori da Supabase dashboard.

---

## 12. Prossimo step consigliato

**Step 8 (Badge sidebar)** — è piccolo, visibile immediatamente, zero rischio regressioni.

```jsx
// In Sidebar / BottomNav, passare da state:
const pendingCount = state.team.filter(m => m.pending).length;
const unassignedCount = state.tasks.filter(t => isActiveTask(t) && !t.assignees?.length).length;
// Mostrare come badge rosso accanto all'icona nav
```

Oppure **Step 9 (auto-move task)** se si vuole completare la logica coda driver.
