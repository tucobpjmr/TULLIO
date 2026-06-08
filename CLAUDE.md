# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Identity

**VoyageDesk** è un sistema gestionale per agenzie viaggi e tour operator. L'app è attualmente un **single-file React** (`src/VoyageDesk.jsx`, ~7071 righe) in transizione verso un progetto Vite multi-file con Supabase come backend.

Versione corrente: **v0.9-dev**. Lingua UI: **italiano** (label, placeholder, toast, tutto).

## Commands

```bash
npm install       # Install dependencies
npm run dev       # Dev server at http://localhost:5173 (hot reload)
npm run build     # Production build → dist/
npm run preview   # Serve production build
```

No test framework or linter is configured yet (planned post-TypeScript migration).

## Architecture

### Single-file structure (`src/VoyageDesk.jsx`)

The file is organized in numbered sections separated by `// ─── TITOLO ───` delimiters. **Never remove these delimiters.** Sections in order:

1. `FontLoader` — CSS globale, CSS variables (`:root`), keyframes, classi `.vd-*` responsive
2. `ViewportContext` — `ViewportProvider` + `useViewport()` hook
3. `MOCK DATA` — TEAM, CATEGORIES, INITIAL_TASKS, CURRENT_USER, `_syncCurrentUser`
4. `TASK_TEMPLATES`
5. `AppContext & reducer` — `baseReducer` + wrapper reducer (permessi + activity log)
6. `Utility functions` — `getMember`, `formatDate`, `isOverdue`, `getDayKey`, ecc.
7. `Permessi (v0.8)` — helpers per RBAC
8. `SwipeActions (v0.7)` — gesture mobile
9. `UI primitives` — Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast
10. Layout: Topbar, UserSwitcher, NotificationsPanel, Sidebar, BottomNav
11. Modali feature: BulkTaskCreator, AIDayPlanner, NoticeBoard
12. Code (PersonalQueue, UnassignedQueue, UrgentOthersQueue, OverdueQueue)
13. Views: Dashboard, CalendarPlanner, Team
14. Modali task: QuickAddTask, TaskSlideOver
15. `Chat module` — ChatContext, ChatPanel, ConversationList, ConversationView, Message, VoiceRecorder
16. FAB, Trash, AdminView (5 tab)
17. `ROOT APP` — `VoyageDesk` (export default) wraps `VoyageDeskInner` in `<ViewportProvider>`

### Component tree (top-level)

```
VoyageDesk (ViewportProvider)
└── VoyageDeskInner
    ├── Topbar → AdvancedSearchPanel, UserSwitcher → ProfileEditor, NotificationsPanel
    ├── Sidebar (desktop) / BottomNav (tablet+mobile)
    ├── [Vista attiva via switch]
    │   ├── Dashboard → NoticeBoard, QueueTab ×4, code, scadenze, carico team
    │   ├── CalendarPlanner (mese + settimana + distribuzione agenti)
    │   ├── Team, Trash, AdminView (5 tab)
    ├── TaskSlideOver, ChatPanel, QuickAddTask, BulkTaskCreator, AIDayPlanner, FAB, Toast
```

### State management

- **Global state**: `useReducer` + `createContext` pattern in `AppContext`.
- **TEAM / CATEGORIES / CURRENT_USER**: `let` mutabili globali tenuti in sync via `_syncTeam` / `_syncCategories` / `_syncCurrentUser` nel reducer. Pattern ibrido — da migrare a Context puro.
- **Chat state**: `useState` locale in `ChatContext` (separato dall'AppContext, migrazione a reducer pianificata).
- `state.lastAction` abilita `UNDO_LAST_ACTION` per azioni da swipe.

### Routing

State-based switch su `state.view` — no react-router.

### Backend (pronto ma non attivato)

`src/lib/supabase.js`, `src/lib/api.js`, `src/lib/auth/` sono presenti per la migrazione Supabase. Richiedono `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` in `.env`.

## Development Rules

### Code style

- React 18 hooks: `useState`, `useReducer`, `useContext`, `useRef`, `useEffect`, `useCallback`, `useMemo`
- CSS: **inline styles + CSS variables** definite in `FontLoader`. NO Tailwind, NO librerie CSS esterne.
- Dipendenza esterna unica: **SheetJS (`xlsx`)** per import CSV/Excel ed export.
- Aggiornamenti stato sempre **immutabili**: `{ ...state, tasks: [...state.tasks, newTask] }`
- Hover: `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`
- Animazioni ingresso: classi `slide-up`, `fade-in`, `slide-right`

### Naming

| Tipo | Convenzione | Esempio |
|------|-------------|---------|
| Componenti | PascalCase | `PersonalQueue`, `TaskSlideOver` |
| Helper/utility | camelCase | `canViewTask`, `getMember` |
| Reducer actions | UPPER_SNAKE_CASE | `ADD_TASK`, `UPDATE_OWN_PROFILE` |
| CSS variables | kebab-case | `--navy`, `--gold-dark` |

### Responsive

```js
const { isMobile, isTablet, isDesktop } = useViewport(); // dentro ogni componente che adatta il layout
```

| Breakpoint | Range | Navigazione |
|------------|-------|-------------|
| Mobile | ≤ 640px | BottomNav |
| Tablet | 641–1024px | BottomNav |
| Desktop | > 1024px | Sidebar collassabile |

Classi CSS responsive disponibili (da `FontLoader`):
`.vd-grid-kpi`, `.vd-grid-2col`, `.vd-grid-3col`, `.vd-grid-dash-main`, `.vd-grid-collapse`, `.vd-hide-mobile`, `.vd-row-wrap`, `.vd-pad`, `.vd-bottom-nav`, `.vd-main-scroll`

Drag & drop disabilitato su mobile — usare `SwipeActions` per azioni rapide.

### Permissions (RBAC)

Ogni nuova feature che tocca task o navigazione deve rispettare la matrice. **Non duplicare la logica — usare gli helper esistenti.**

| Azione | Admin | Manager/Agent | Driver |
|--------|-------|---------------|--------|
| Vedere task proprie | ✅ | ✅ | ✅ (solo `transfer`) |
| Vedere coda globale | ✅ | ✅ | ❌ |
| Modificare task proprie | ✅ | ✅ | ✅ (solo `transfer`) |
| Creare task (tutte cat.) | ✅ | ✅ | ❌ (solo `transfer`) |
| Azioni Admin | ✅ | ❌ | ❌ |
| Cestino | ✅ | ❌ | ❌ |

Il wrapper reducer blocca automaticamente `ADMIN_ONLY_ACTIONS` per non-admin, emettendo un toast rosso.

Ogni voce nuova in `NAV_ITEMS` deve avere il campo `roles`.

### What NOT to do

- Non usare `localStorage`/`sessionStorage` (vincolo artifact — da rimuovere post-migrazione Vite)
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere i delimitatori di sezione (`// ─── TITOLO ───`)

## Key Data Models

```js
// Task
{ id, title, category, priority, status,
  assignees: [memberId],  // [] = coda globale
  client, dueDate, estimatedHours, description,
  comments: [{ user, text, time }],
  deletedAt }  // soft-delete

// Team member
{ id, name, role, avatar, color, capacity,
  active, pending, email, phone, photoUrl }  // photoUrl = base64

// Categoria (mutabile via Admin)
{ icon, label, color, bg }
```

Categorie task: `booking`, `hotel`, `visa`, `client`, `payment`, `marketing`, `supplier`, `admin`, `itinerary`, `transfer`
Priorità: `critical`, `high`, `medium`, `low`
Stati: `todo`, `inprogress`, `awaiting_client`, `awaiting_supplier`, `done`

## Helper Utilities (do not duplicate)

```
getMember(id)                    legge dal TEAM globale
getAssignableTeam()              agenti attivi e non-pending
formatDate(iso), formatTime(iso)
isOverdue(task), isUrgent(task)
getDayKey(iso)
isActiveTask(t), getActiveTasks(tasks), getTrashedTasks(tasks)
useViewport()
getRoleType(userId)              → "admin"|"manager"|"agent"|"driver"
isAdmin(userId), isDriver(userId)
canViewTask(task, userId)
canEditTask(task, userId)
canCreateTaskCategory(cat, userId)
canAccessAdmin(userId)
getAvailableCategories(userId)
isMyTask(task, userId)
isInGlobalQueue(task)
getVisibleTasks(tasks, userId)
getNavItemsForUser(userId)       NAV_ITEMS filtrati per ruolo
```

## Reducer Actions Reference

**View/UI**: `SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`

**Task CRUD**: `ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

**Cestino**: `DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

**Profilo**: `UPDATE_OWN_PROFILE` (non admin-only), `SET_CURRENT_USER`

**Admin team** ⚠️: `ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

**Admin categorie** ⚠️: `ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

**Admin settings** ⚠️: `SET_AGENCY_NAME`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

**Bacheca**: `ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

**Undo**: `UNDO_LAST_ACTION`

## Key Patterns

**Dispatch con swipe flag** (attiva toast undoable + salva `lastAction`):
```js
dispatch({ type: "MOVE_TASK", payload: { taskId: task.id, newStatus: "done" }, swipe: true });
```

**Apertura chat con intent**:
```js
openChatTo({ toUser: owner.id, taskLink: task.id });
// Trova/crea conversazione diretta → precompila messaggio con titolo+data del task
```

**AI Day Planner**: usa `fetch` a `https://api.anthropic.com/v1/messages` — funziona nativamente in Claude.ai Artifacts, richiede API key in dev locale.

**Activity log**: max 100 entry, le più vecchie vengono tagliate automaticamente.

**Backup JSON** (Admin → Import/Export): sovrascrive l'intero stato persistente al ripristino.

## Design System

```css
/* Palette */
--navy: #0F2044;    --navy-light: #1a3060;  --navy-dark: #08152d;
--gold: #D4A843;    --gold-light: #e8c46a;  --gold-dark: #b8902e;
--surface: #FAFAF7; --surface2: #F0EEE8;    --surface3: #E8E5DC;
--success: #2D7A4F; --warning: #C8832A;     --danger: #C0392B;
--text: #1A1A2E;    --text-muted: #6B6B80;  --text-light: #9999AA;
--border: #E0DDD5;
```

Font: `Playfair Display` (headings, classe `.playfair`) + `DM Sans` (body, default).

## Roadmap (prossimi step)

1. **Migrazione Vite multi-file** — split `VoyageDesk.jsx` in moduli; abilitare localStorage poi Supabase
2. **Dati completi** — Anagrafica Clienti (CRM), Fornitori, Pratiche di viaggio
3. **Operatività** — notifiche reali, dark mode, estensioni chat
4. **Business** — modulo finanziario, report & analytics

Dettaglio completo con stime in `docs/ROADMAP.md`. Specifiche tecniche complete in `docs/PROJECT_SPEC.md`.
