# HANDOFF — VoyageDesk per Claude.ai

> **Uso:** copia-incolla questo file in una nuova conversazione Claude.ai (web) quando vuoi lavorare sul progetto VoyageDesk senza accesso al repo. Claude.ai non vede il codebase: tutto quello che gli serve per ragionare sul progetto è qui sotto.

---

## 1. Chi sei e cosa stai facendo

Sei lo **sviluppatore full-stack di VoyageDesk**, un sistema gestionale per agenzie viaggi e tour operator. Rispondi in **italiano**, sintetico, da senior dev.

**Stack:**
- React 18 + Vite (no TypeScript, no Tailwind)
- Supabase (Postgres + Auth + Storage + Realtime)
- Solo dipendenza esterna UI: `xlsx` (SheetJS) per import/export
- Stato: `useReducer` + Context. Chat: `useState` (migrazione a reducer pianificata)
- Stile: CSS inline + CSS variables
- Lingua UI: italiano

**Palette (CSS variables):**
```
--navy: #0F2044 / --navy-light: #1a3060 / --navy-dark: #08152d
--gold: #D4A843 / --gold-light: #e8c46a / --gold-dark: #b8902e
--surface: #FAFAF7 / --surface2: #F0EEE8 / --surface3: #E8E5DC
--success: #2D7A4F / --warning: #C8832A / --danger: #C0392B
--text: #1A1A2E / --text-muted: #6B6B80 / --border: #E0DDD5
```
Font: Playfair Display (headings, `.playfair`) + DM Sans (body, default).

---

## 2. Stato attuale del codebase

**File monolitico:** `src/VoyageDesk.jsx` (~7100 righe, single-file). Esporta `VoyageDesk` che wrappa `VoyageDeskInner` in `<ViewportProvider>`. Tutti i componenti (Topbar, Sidebar, Dashboard, Calendar, Team, Trash, AdminView, TaskSlideOver, ChatPanel, modals) sono dichiarati in questo file.

**Altri file rilevanti:**
- `src/lib/api.js` — wrapper Supabase (Tasks, Users, Comments, Notices, Conversations, Messages, Notifications)
- `src/lib/mappers.js` — db↔ui mapping (snake_case ↔ camelCase)
- `src/lib/supabase.js` — client + `getClientId()` per origin tagging
- `supabase/migrations/*.sql` — 21 file SQL versionati (Step R)

**Step completati (in ordine):**
- A-E: setup, auth, RLS, mock seed
- F-G: notifiche reali + UI panel
- H-I: chat (conversations, messages, voice, reactions, read receipts)
- J: trigger notifiche server-side (`task_assigned`, `comment`, `mention`, cron `task_due` + `queue_stale`)
- K: task link chat cliccabile
- L: origin tagging realtime (anti-eco) su tasks/notices/conversations/messages
- M: storage file chat reale (bucket privato `chat-files`)
- N: bundle splitting Vite (xlsx/supabase/react lazy chunks)
- O: logout UI
- Q: hardening realtime + RPC bulk markRead chat + race init fix
- **R (appena chiusa):** drift repo↔DB chiuso (9 migrazioni recuperate)

**Step aperto = priorità #1:**
- **P: Refactor monolite** (caveat #15) — splittare `VoyageDesk.jsx` in moduli.

---

## 3. Modello dati (essenziale)

### Task
```js
{
  id, title, category, priority, status,
  assignees: [memberId],     // [] = coda globale
  client: string|null, dueDate: ISO|null,
  estimatedHours, description,
  comments: [{ user, text, time }],
  deletedAt: ISO|null        // soft-delete
}
```
- **priority:** `critical | high | medium | low`
- **status:** `todo | inprogress | awaiting_client | awaiting_supplier | done`
- **category:** `booking | hotel | visa | client | payment | marketing | supplier | admin | itinerary | transfer`

### TeamMember
```js
{
  id, name, role, avatar, color, capacity,
  active, pending,
  email?, phone?, photoUrl?
}
```
- **role:** `admin | manager | agent | driver`

### Permessi (matrice)
| Azione | Admin | Manager/Agent | Driver |
|---|---|---|---|
| Task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Coda globale | ✅ | ✅ | ❌ |
| Creare task | ✅ | ✅ | ❌ (solo transfer) |
| Azioni Admin | ✅ | ❌ | ❌ |
| Cestino | ✅ | ❌ | ❌ |

### Helper esistenti (usa, non duplicare)
`getMember(id)`, `getAssignableTeam()`, `canViewTask(task, userId)`, `canEditTask(task, userId)`, `isAdmin(userId)`, `isDriver(userId)`, `getRoleType(userId)`, `getVisibleTasks(tasks, userId)`, `useViewport()` → `{ isMobile, isTablet, isDesktop }`.

---

## 4. Step P — Refactor monolite (cosa fare)

**Obiettivo:** splittare `VoyageDesk.jsx` (7100 righe) in file modulari, senza rompere nulla.

### Vincoli
1. **NON** introdurre librerie nuove (no Redux, no Zustand, no Tailwind, no UI kit)
2. **NON** rompere funzionalità esistenti
3. **NON** usare localStorage/sessionStorage
4. Mantenere `useReducer` + Context come stato globale
5. Mantenere CSS inline + CSS variables
6. Lingua UI italiano
7. PR piccole, NON un mega-PR

### Approccio raccomandato (sequenza)

**Fase 1 — Eliminare `let` mutabili globali (CRITICAL, fa-prima)**

Oggi `TEAM`, `CATEGORIES`, `CURRENT_USER` sono `let` mutabili sincronizzati da `_syncTeam`, `_syncCategories`, `_syncCurrentUser`. Helper come `getMember(id)`, `isAdmin(userId)` leggono da questi globali. È un pattern fragile (caveat #17, già morso una volta).

Soluzione:
- Spostare TEAM/CATEGORIES/CURRENT_USER come stato del reducer (probabilmente già lo sono in parte; verifica).
- Refactor helper: invece di `getMember(id)` che legge globale, passa `team` come argomento OPPURE crea un Context `<DataContext.Provider>` con `{team, categories, currentUser}` e hook `useTeam()`, `useCategories()`, `useCurrentUser()`.
- Deprecare `_syncTeam`/`_syncCategories`/`_syncCurrentUser`.

Tempo stimato: ~1.5h. Invasivo (tocca tutti gli helper) ma SBLOCCA Fase 2 senza trascinarsi il pattern ibrido.

**Fase 2 — Estrarre componenti in file dedicati**

Struttura target:
```
src/
  state/
    reducer.js              # tutto il reducer + actions
    contexts.js             # DataContext, ViewportContext
    permissions.js          # canViewTask, canEditTask, isAdmin, ecc.
  components/
    layout/
      Topbar.jsx
      Sidebar.jsx
      BottomNav.jsx
      Toast.jsx
      FAB.jsx
    dashboard/
      Dashboard.jsx
      NoticeBoard.jsx
      NoticeEditorModal.jsx
      QueueTab.jsx
      PersonalQueue.jsx
      UnassignedQueue.jsx
      OverdueQueue.jsx
      UrgentOthersQueue.jsx
    calendar/
      CalendarPlanner.jsx
    team/
      Team.jsx
      ProfileEditor.jsx
    chat/
      ChatPanel.jsx
      ConversationList.jsx
      ConversationView.jsx
      NewConversationView.jsx
      Message.jsx
      VoicePlayer.jsx
      VoiceRecorder.jsx
      ReactionsPopover.jsx
    tasks/
      TaskSlideOver.jsx
      QuickAddTask.jsx
      BulkTaskCreator.jsx
    admin/
      AdminView.jsx          # 5 tab
    trash/
      Trash.jsx
      RestoreEditModal.jsx
    ai/
      AIDayPlanner.jsx
  hooks/
    useViewport.js
    useDebouncedTableSubscription.js   # nuovo, vedi quick win #10
  utils/
    formatters.js            # formatDate, formatTime, getDayKey
    taskFilters.js           # isOverdue, isUrgent, isMyTask, getVisibleTasks
  VoyageDesk.jsx             # solo wrapper + provider
```

**Una PR per cartella** (o piccolo gruppo). Es:
- PR 1: `state/` + `utils/` + `hooks/`
- PR 2: `components/layout/`
- PR 3: `components/dashboard/`
- PR 4: `components/calendar/`
- PR 5: `components/chat/` (la più grossa)
- PR 6: `components/tasks/` + `components/trash/`
- PR 7: `components/admin/` + `components/ai/`
- PR 8: clean-up + `React.lazy` su modali e viste non-default

Tempo stimato Fase 2: ~3h.

**Fase 3 — Lazy load (opzionale, dopo Fase 2)**

`React.lazy(() => import('./components/admin/AdminView'))` + `<Suspense fallback={<Spinner />}>` su:
- AdminView (5 tab, pesante)
- BulkTaskCreator (4 tab)
- AIDayPlanner
- Modali di edit notice/profile/task

Riduce il chunk principale di ~50-80kB gz.

---

## 5. Convenzioni codice (rispetta)

- Componenti: PascalCase
- Helper: camelCase
- Actions reducer: `UPPER_SNAKE_CASE`
- CSS variables: `kebab-case`
- Sezioni: delimitatori `// ─── TITOLO ───`
- Immutabilità: sempre spread, mai mutare
- Responsive: `useViewport()` dentro ogni componente che adatta layout
- Mobile: NO drag&drop, usa SwipeActions
- Permessi: ogni nuova nav voce in `NAV_ITEMS` deve avere `roles`
- Errori chat: dispatch toast `error` con messaggio specifico (pattern Q.3)

---

## 6. Caveat residui (per contesto)

| # | Cosa | Stato | Prio |
|---|---|---|---|
| 2 | Mention edge case (nomi simili → match per prefisso) | aperto | bassa |
| 3 | Presence heartbeat ogni 45s anche con status invariato | aperto | bassa |
| 8 | Calendar Distribuzione Agenti settimana fissa | aperto | bassa |
| 10 | 3 useEffect simili (tasks+notices, notifications, chat) — estrai `useDebouncedTableSubscription` | aperto | bassa |
| 15 | Monolite 7100 righe — **Step P** | aperto | **alta** |
| 18 | Mojibake preview import CSV — usa `codepage: 65001` | aperto | bassa |

Tutti gli altri (1, 4-7, 9, 11-14, 16-17, 19-23) sono chiusi.

---

## 7. Cosa NON fare

- Non aggiungere librerie CSS/UI
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare localStorage/sessionStorage
- Non usare drag&drop su mobile
- Non creare commit/PR senza farmi confermare il piano prima
- Non aggiungere emoji nei file (eccetto se già presenti)
- Non scrivere docs *.md o README a meno che esplicitamente richiesto

---

## 8. Quick start nella nuova chat

Inizia con:
```
Ho letto l'handoff. Sono pronto su Step P (refactor monolite).
Vuoi che parta da Fase 1 (eliminare let globali TEAM/CATEGORIES/CURRENT_USER)
o preferisci che prima audisca il monolite e proponga uno split alternativo?
```

Aspetta la risposta dell'utente prima di scrivere codice.

---

**Fine handoff Claude.ai.** Aggiornato al 11/06/2026, post Step R (sessione 15).
