# HANDOFF — VoyageDesk (Claude Code / cowork)

> **Uso:** apri una nuova sessione Claude Code o cowork sulla repo `tucobpjmr/TULLIO`, carica/leggi questo file e prosegui dal punto in cui è stato lasciato. Hai accesso al repo, al tool MCP GitHub e a Vercel.
>
> Rispondi in **italiano**, sintetico, da senior dev.

---

## 1. Chi sei e cosa stai facendo

Sei lo **sviluppatore full-stack di VoyageDesk**, un gestionale per agenzie viaggi e tour operator.

**Stack:**
- React 18 + Vite (no TypeScript, no Tailwind)
- Supabase (Postgres + Auth + Storage + Realtime)
- Unica dipendenza UI esterna: `xlsx` (SheetJS) per import/export
- Stato: `useReducer` + `AppContext` (i componenti leggono `team`/`categories`/`currentUserId` via hook). Chat: `useState` (migrazione a reducer pianificata)
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

**File principale:** `src/VoyageDesk.jsx` (~4.780 righe, da una baseline di ~8.270 → **−42%**).

**Struttura moduli già estratti** (Step P, Fasi 1 + 2/PR1-3):
```
src/
  VoyageDesk.jsx              # wrapper + AppContext.Provider + ChatPanel + restanti views
  hooks/
    useViewport.jsx
  state/
    constants.js              # PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS
    contexts.js               # AppContext, useTeam, useCategories, useCurrentUserId
    seed.js                   # INITIAL_TEAM/CATEGORIES/TASKS/NOTICES, NOTIFICATIONS, TASK_TEMPLATES, NOTICE_COLORS
    permissions.js            # getMember, isAdmin, canViewTask, canEditTask, ecc. (puri)
    navigation.js             # NAV_ITEMS, getNavItemsForUser, getNavBadges
    reducer.js                # baseReducer, reducer wrapper, makeInitialState, buildLogEntry
  utils/
    formatters.js             # formatDate, formatTime, getDayKey
    taskFilters.js            # isOverdue, isUrgent, isMyTask, isInGlobalQueue, ecc.
  components/
    atoms/index.jsx           # Avatar, PriorityBadge, CategoryChip, StatusBadge
    layout/
      FontLoader.jsx
      Toast.jsx
      FAB.jsx
      NavBadge.jsx
      NotificationsPanel.jsx  # + NOTIF_ICONS/notifTitle/notifTime co-locati
      UserSwitcher.jsx
      AdvancedSearchPanel.jsx
      Sidebar.jsx
      BottomNav.jsx
      Topbar.jsx
    team/
      ProfileEditor.jsx       # + AVATAR_EMOJIS/AVATAR_COLORS
    shared/
      SwipeActions.jsx
    dashboard/
      Dashboard.jsx
      PersonalQueue.jsx
      UrgentOthersQueue.jsx
      UnassignedQueue.jsx
      OverdueQueue.jsx
      QueueTab.jsx
      NoticeBoard.jsx
      NoticeEditorModal.jsx
    ai/
      AIDayPlanner.jsx
```

**Altri file rilevanti:**
- `src/lib/api.js` — wrapper Supabase (Tasks, Users, Comments, Notices, Conversations, Messages, Notifications)
- `src/lib/mappers.js` — db↔ui mapping (snake_case ↔ camelCase)
- `src/lib/supabase.js` — client + `getClientId()` per origin tagging
- `supabase/migrations/*.sql` — 21 file SQL versionati (Step R)

**Branch attivo:** `claude/focused-davinci-47667f`
**PR aperta (draft):** [#27 — Step P refactor monolite](https://github.com/tucobpjmr/TULLIO/pull/27) — 5 commit, build Vercel verde.

**Step completati (in ordine):**
- A–E: setup, auth, RLS, mock seed
- F–G: notifiche reali + UI panel
- H–I: chat (conversations, messages, voice, reactions, read receipts)
- J: trigger notifiche server-side (`task_assigned`, `comment`, `mention`, cron `task_due` + `queue_stale`)
- K: task link chat cliccabile
- L: origin tagging realtime (anti-eco) su tasks/notices/conversations/messages
- M: storage file chat reale (bucket privato `chat-files`)
- N: bundle splitting Vite (xlsx/supabase/react lazy chunks)
- O: logout UI
- Q: hardening realtime + RPC bulk markRead chat + race init fix
- R: drift repo↔DB chiuso (9 migrazioni recuperate)
- **P — Fase 1:** eliminati `let TEAM/CATEGORIES/CURRENT_USER` globali + reducer disaccoppiato + componenti migrati a `AppContext` + hook
- **P — Fase 2/PR 1:** estratti `state/`, `utils/`, `hooks/`
- **P — Fase 2/PR 2:** estratti `components/layout/` + `atoms` + `team/ProfileEditor`
- **P — Fase 2/PR 3:** estratti `components/dashboard/` + `ai/AIDayPlanner` + `shared/SwipeActions`

---

## 3. Step P — Fase 2: cosa resta da fare

Componenti ancora dentro `src/VoyageDesk.jsx` da estrarre, in ordine (una sotto-PR per gruppo):

### PR 4 — `components/calendar/`
- `CalendarPlanner.jsx` (~500 righe, vista calendario month/week/day)
- helpers ICS (`buildIcs`, `icsDate`, `icsEscape`, `exportTasksToIcs`)

### PR 5 — `components/chat/` (la più grossa, ~1200 righe)
- `ChatPanel.jsx` (orchestratore)
- `ConversationList.jsx`, `ConversationView.jsx`, `NewConversationView.jsx`
- `ChatMessage.jsx`, `MessageTextContent.jsx`, `ReactionPicker.jsx`
- `VoicePlayer.jsx`, `VoiceRecorder.jsx`
- formatters chat (`formatChatTime`, `formatMsgTime`, `formatDuration`, `formatFileSize`)
- helpers plain (`getConversationName`, `getUnreadCount`, `getLastMessage`, `EMOJI_REACTIONS`)
- `computePresence` / `PRESENCE_COLORS` (ora nel main file, andranno qui)
- `ChatContext` (ora nel main file)

### PR 6 — `components/tasks/` + `components/trash/`
- `tasks/TaskSlideOver.jsx`, `QuickAddTask.jsx`
- `tasks/BulkTaskCreator.jsx` (+ tabs: `ManualTab`, `DuplicateTab`, `ImportTab`, `TemplateTab`)
- `tasks/bulkStyles.js` (`bulkInputStyle`, `bulkBtnPrimary`, `bulkBtnGhost`, `bulkIconBtnSmall`)
- `trash/Trash.jsx` (+ `RestoreEditModal` inline)

### PR 7 — `components/admin/` + `components/team/Team.jsx`
- `admin/AdminView.jsx` (orchestratore + 5 tab)
- `admin/AdminTeamTab.jsx`, `AddTeamMemberModal.jsx`
- `admin/AdminIOTab.jsx`, `AdminCategoriesTab.jsx`, `AddCategoryModal.jsx`
- `admin/AdminStatsTab.jsx`, `AdminLogTab.jsx`
- `team/Team.jsx` (la view, non il ProfileEditor — già estratto)

### PR 8 — cleanup
- `VoyageDesk.jsx` deve restare solo wrapper + `VoyageDeskInner` (state + effetti + render switch view + chat panel).
- `React.lazy(() => import(...))` + `<Suspense>` su modali e viste non-default: `AdminView`, `BulkTaskCreator`, `AIDayPlanner`, `TaskSlideOver`, `NoticeEditorModal`, `ProfileEditor`. Riduce il chunk principale di ~50-80 kB gz.
- Rimuovi import non più usati nel main file dopo ogni estrazione.

---

## 4. Vincoli (rispettare SEMPRE)

1. **NON** introdurre librerie nuove (no Redux, no Zustand, no Tailwind, no UI kit)
2. **NON** rompere funzionalità esistenti
3. **NON** usare localStorage/sessionStorage
4. Mantenere `useReducer` + Context come stato globale
5. Mantenere CSS inline + CSS variables
6. Lingua UI italiano
7. **PR piccole** — un commit per cartella/gruppo logico
8. **Solo MOVE, zero rewrite** durante l'estrazione. Tweaks di chiarezza ok (es. rimozione `noticeBtnStyle` orphan); refactor di firme/logica NO.

---

## 5. Modello dati (essenziale)

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

### Helper disponibili (usa, non duplicare)
Da `src/state/permissions.js` — passa SEMPRE `team` esplicito:
`getMember(id, team)`, `getAssignableTeam(team)`, `getRoleType(userId, team)`, `isAdmin(userId, team)`, `isDriver(userId, team)`, `canViewTask(task, userId, team)`, `canEditTask(task, userId, team)`, `canCreateTaskCategory(cat, userId, team)`, `canAccessAdmin(userId, team)`, `getAvailableCategories(userId, team, categories)`, `getVisibleTasks(tasks, userId, team)`.

Da `src/state/contexts.js` (hook per i componenti):
`useTeam()`, `useCategories()`, `useCurrentUserId()`.

Da `src/utils/taskFilters.js`:
`isOverdue`, `isUrgent`, `isMyTask`, `isInGlobalQueue`, `isActiveTask`, `getActiveTasks`, `getTrashedTasks`, `HOURS_24`.

Da `src/hooks/useViewport.jsx`:
`useViewport()` → `{ isMobile, isTablet, isDesktop }`.

---

## 6. Convenzioni codice

- Componenti: PascalCase
- Helper: camelCase
- Actions reducer: `UPPER_SNAKE_CASE`
- CSS variables: `kebab-case`
- Sezioni: delimitatori `// ─── TITOLO ───`
- Immutabilità: sempre spread, mai mutare
- Responsive: `useViewport()` dentro ogni componente che adatta layout
- Mobile: NO drag&drop, usa `SwipeActions`
- Permessi: ogni nuova nav voce in `NAV_ITEMS` (`state/navigation.js`) deve avere `roles`
- Errori chat: dispatch toast `error` con messaggio specifico (pattern Q.3)

---

## 7. Workflow operativo per ogni estrazione

1. **Audit** — `grep` i confini del componente, mappa le dipendenze (hooks, atoms, altri componenti) per evitare import circolari.
2. **Crea** il nuovo file con import puliti + il blocco `export const X = ...` copiato 1:1.
3. **Aggiorna** `src/VoyageDesk.jsx`:
   - aggiungi `import { X } from "./components/.../X.jsx";`
   - rimuovi il blocco originale con `awk 'NR<A || NR>B' src/VoyageDesk.jsx > tmp && mv tmp src/VoyageDesk.jsx`
4. **Build** — `npm run build` deve essere verde.
5. **Cleanup import** — togli dal main file gli identificatori che ora servono solo ai moduli estratti.
6. **Commit** con messaggio descrittivo: cosa è stato spostato, dove, perché.
7. **Push** sul branch e aggiorna la descrizione PR #27.
8. Aspetta il check Vercel verde prima della prossima sotto-PR.

---

## 8. Caveat residui (per contesto)

| # | Cosa | Stato | Prio |
|---|---|---|---|
| 2 | Mention edge case (nomi simili → match per prefisso) | aperto | bassa |
| 3 | Presence heartbeat ogni 45s anche con status invariato | aperto | bassa |
| 8 | Calendar Distribuzione Agenti settimana fissa | aperto | bassa |
| 10 | 3 useEffect simili (tasks+notices, notifications, chat) — estrai `useDebouncedTableSubscription` | aperto | bassa (target PR 8) |
| 15 | Monolite — **Step P in corso** | parziale (Fase 2 al 50%) | **alta** |
| 17 | Pattern `let` globali + `_sync*` | **chiuso** in Step P Fase 1 ✅ | — |
| 18 | Mojibake preview import CSV — usa `codepage: 65001` | aperto | bassa |

---

## 9. Cosa NON fare

- Non aggiungere librerie CSS/UI
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare localStorage/sessionStorage
- Non usare drag&drop su mobile
- Non creare commit/PR oltre il branch `claude/focused-davinci-47667f` senza permesso esplicito
- Non aggiungere emoji nei file (eccetto se già presenti)
- Non scrivere docs `*.md` o README a meno che esplicitamente richiesto
- Non riscrivere durante l'estrazione: solo MOVE 1:1

---

## 10. Quick start nella nuova sessione

Inizia con:
```
Ho letto l'handoff. Branch claude/focused-davinci-47667f, PR #27 (draft) aperta con 5 commit.
Sono pronto a riprendere Step P / Fase 2.
Prossimo target: PR 4 — estrazione components/calendar/ (CalendarPlanner + ics helpers).
Procedo o vuoi rivedere prima la preview Vercel della PR?
```

Aspetta la risposta dell'utente prima di scrivere codice. Una volta confermato, applica il workflow operativo (sezione 7) per CalendarPlanner.

---

**Fine handoff Claude Code / cowork.** Aggiornato al 12/06/2026, post Fase 2 PR 3 (sessione 16).
