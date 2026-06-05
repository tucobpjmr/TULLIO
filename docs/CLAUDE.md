# CLAUDE.md — Istruzioni per Claude Code

## Identità progetto

**VoyageDesk** è un sistema gestionale per agenzie viaggi e tour operator.
Il progetto è un'app Vite + React 18 con ~35 moduli separati (splitting completato in `claude/file-splitting-LiFlQ`).

## Ruolo

Agisci come sviluppatore full-stack specializzato in sistemi gestionali per travel industry. Rispondi in italiano, sintetico.

## Regole di sviluppo

### Stile codice
- React 18 con hooks (useState, useReducer, useContext, useRef, useEffect, useCallback, useMemo)
- CSS inline + CSS variables (definite in `src/styles/globals.css`) — NO Tailwind, NO librerie CSS
- Stato globale: useReducer + Context (`src/context/AppContext.js` + `src/reducers/appReducer.js`)
- Stato locale chat: useState (migrazione a reducer pianificata)
- Lingua UI: **italiano** (label, placeholder, toast, tutto)
- Font: Playfair Display (headings, classe `.playfair`) + DM Sans (body, default)
- Dipendenza esterna unica: SheetJS (`xlsx`) per import CSV/Excel ed export Excel

### Convenzioni naming
- Componenti: PascalCase (`PersonalQueue`, `CalendarPlanner`)
- Helper/utility: camelCase (`canViewTask`, `getAssignableTeam`)
- Actions reducer: UPPER_SNAKE_CASE (`ADD_TASK`, `UPDATE_OWN_PROFILE`)
- CSS variables: kebab-case (`--navy`, `--gold-dark`)
- Sezioni nei file: delimitatori `// ─── TITOLO ───`

### Pattern da rispettare
- **Immutabilità**: sempre spread `{ ...state, tasks: [...] }`, mai mutare direttamente
- **Hover**: `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`
- **Animazioni ingresso**: classi `slide-up`, `fade-in`, `slide-right` (definite in `globals.css`)
- **Responsive**: `const { isMobile, isDesktop } = useViewport()` dentro ogni componente che adatta il layout
- **Permessi**: ogni nuova feature che tocca task o viste deve usare `canViewTask`/`canEditTask`. Ogni nuova voce nav deve avere il campo `roles`
- **Sync globale**: TEAM/CATEGORIES/CURRENT_USER sono `let` mutabili sincronizzati via `_syncTeam`/`_syncCategories`/`_syncCurrentUser` (in `src/data/mockData.js`)

### Cosa NON fare
- Non usare localStorage/sessionStorage (nessuna persistenza per ora — pianificata in roadmap)
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare drag&drop su mobile (usare SwipeActions)

## Palette colori

```css
--navy: #0F2044;        --navy-light: #1a3060;     --navy-dark: #08152d;
--gold: #D4A843;        --gold-light: #e8c46a;     --gold-dark: #b8902e;
--surface: #FAFAF7;     --surface2: #F0EEE8;       --surface3: #E8E5DC;
--success: #2D7A4F;     --warning: #C8832A;        --danger: #C0392B;
--text: #1A1A2E;        --text-muted: #6B6B80;     --text-light: #9999AA;
--border: #E0DDD5;
```

## Breakpoints responsive

| Nome | Range | Hook |
|------|-------|------|
| Mobile | ≤ 640px | `isMobile` |
| Tablet | 641–1024px | `isTablet` |
| Desktop | > 1024px | `isDesktop` |

Navigazione: Desktop → Sidebar collassabile. Tablet/Mobile → BottomNav.

## Struttura file (post-splitting)

```
src/
├── main.jsx                          # entry point → App
├── App.jsx                           # ViewportProvider + AppInner (reducer, viste, chat)
├── styles/
│   └── globals.css                   # CSS vars, keyframes, classi responsive
├── hooks/
│   └── useViewport.jsx               # ViewportContext, useViewport, ViewportProvider
├── context/
│   └── AppContext.js                 # createContext(null)
├── reducers/
│   └── appReducer.js                 # reducer, initialState, LOGGED_ACTIONS
├── data/
│   ├── mockData.js                   # TEAM, CATEGORIES, INITIAL_TASKS, INITIAL_NOTICES…
│   └── taskTemplates.js              # TASK_TEMPLATES
├── utils/
│   ├── core.js                       # getMember, formatDate, isOverdue, getActiveTasks…
│   └── permissions.js                # canViewTask, canEditTask, getRoleType…
├── components/
│   ├── primitives/
│   │   ├── Avatar.jsx
│   │   ├── PriorityBadge.jsx
│   │   ├── StatusBadge.jsx
│   │   └── CategoryChip.jsx
│   ├── layout/
│   │   ├── Topbar.jsx                # ricerca, UserSwitcher, notifiche, chat
│   │   ├── Sidebar.jsx               # navigazione desktop
│   │   └── BottomNav.jsx             # navigazione mobile/tablet
│   ├── queues/
│   │   ├── PersonalQueue.jsx
│   │   ├── UnassignedQueue.jsx
│   │   ├── OverdueQueue.jsx
│   │   └── UrgentOthersQueue.jsx
│   ├── modals/
│   │   ├── QuickAddTask.jsx
│   │   ├── BulkTaskCreator.jsx
│   │   └── AIDayPlanner.jsx
│   ├── search/
│   │   └── AdvancedSearchPanel.jsx
│   ├── TaskSlideOver.jsx
│   ├── NoticeBoard.jsx
│   ├── FAB.jsx
│   ├── Toast.jsx
│   ├── SwipeActions.jsx
│   ├── QueueTab.jsx
│   ├── NotificationsPanel.jsx
│   └── ProfileEditor.jsx
├── views/
│   ├── Dashboard.jsx
│   ├── CalendarPlanner.jsx
│   ├── Team.jsx
│   ├── Trash.jsx
│   └── AdminView.jsx
└── modules/
    └── chat/
        ├── chatData.js               # ChatContext, initialConversations, initialMessages, helper
        └── ChatPanel.jsx             # tutti i componenti chat (ConversationList/View, VoicePlayer…)
```

## Modello dati

### Task
```js
{
  id, title, category, priority, status,
  assignees: [memberId],     // [] = coda globale
  client: string|null,
  dueDate: ISO|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO|null        // soft-delete
}
```

### Team member
```js
{
  id, name, role, avatar, color, capacity,
  active: boolean, pending: boolean,
  email: string|undefined, phone: string|undefined,
  photoUrl: string|undefined   // base64 o null
}
```

### Categorie task (mutabili via Admin)
`booking`, `hotel`, `visa`, `client`, `payment`, `marketing`, `supplier`, `admin`, `itinerary`, `transfer`

### Priorità
`critical`, `high`, `medium`, `low`

### Stati task
`todo`, `inprogress`, `awaiting_client`, `awaiting_supplier`, `done`

### Team mock
Marco (Manager, default), Sofia (Senior Agent), Luca (Junior Agent), Giulia (Driver), Roberto (Admin) + 2 pending (Elena, Matteo)

### Clienti mock
Famiglia Rossi (Maldive), Coppia Bianchi (Giappone), Azienda TechCorp (Incentive), Famiglia Marchetti (Caraibi), Liceo Manzoni (gruppo studenti), Sposi Conte (Vietnam)

## Reducer actions disponibili

### View/UI
`SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`

### Task CRUD
`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

### Cestino
`DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

### Profilo personale (non admin-only)
`UPDATE_OWN_PROFILE`

### Admin Team (ADMIN_ONLY)
`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

### Admin Categorie (ADMIN_ONLY)
`ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

### Admin Backup/Settings (ADMIN_ONLY)
`SET_AGENCY_NAME`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

### Bacheca
`ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

### Altro
`UNDO_LAST_ACTION`, `SET_CURRENT_USER`

## Helper utility (da usare, non duplicare)

```
// src/utils/core.js
getMember(id)                    — legge dal TEAM globale
getAssignableTeam()              — agenti attivi e non-pending
formatDate(iso), formatTime(iso) — formattazione date
isOverdue(task), isActiveTask(t) — check stato task
getDayKey(iso)                   — stringa data
getActiveTasks(tasks)            — filtra non-cestinati
getTrashedTasks(tasks)           — filtra cestinati

// src/utils/permissions.js
useViewport()                    — hook responsive (da src/hooks/useViewport.jsx)
getRoleType(userId)              — "admin"|"manager"|"agent"|"driver"
isAdmin(userId), isDriver(userId)
isUrgent(task)
canViewTask(task, userId)
canEditTask(task, userId)
canCreateTaskCategory(cat, userId)
canAccessAdmin(userId)
getAvailableCategories(userId)
isMyTask(task, userId)
isInGlobalQueue(task)
getVisibleTasks(tasks, userId)
getNavItemsForUser(userId)       — NAV_ITEMS filtrati per ruolo

// src/modules/chat/chatData.js
initialConversations, initialMessages
ChatContext
formatChatTime(iso), formatMsgTime(iso), formatDuration(sec)
getConversationName(conv)
getLastMessage(msgs, convId)
getUnreadCount(msgs, convId)
```

## Classi CSS responsive (definite in `src/styles/globals.css`)

```
.vd-grid-kpi        — griglia KPI, collassa su mobile
.vd-grid-2col       — 2 colonne, collassa a 1 su mobile
.vd-grid-3col       — 3 colonne, collassa
.vd-grid-dash-main  — griglia dashboard principale
.vd-grid-collapse   — 1 colonna su mobile
.vd-hide-mobile     — nasconde ≤640px
.vd-row-wrap        — flex-wrap su mobile
.vd-pad             — padding adattivo (32→18→14)
.vd-bottom-nav      — bottom nav visibile ≤1024px
.vd-main-scroll     — padding-bottom per bottom nav
```

## Permessi per ruolo

| Azione | Admin | Manager/Agent | Driver |
|--------|-------|---------------|--------|
| Vedere task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Vedere coda globale | ✅ | ✅ | ❌ |
| Modificare task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Creare task (tutte cat.) | ✅ | ✅ | ❌ (solo transfer) |
| Azioni Admin | ✅ | ❌ | ❌ |
| Cestino | ✅ | ❌ | ❌ |

## Albero componenti

```
App (src/App.jsx)
└── ViewportProvider (src/hooks/useViewport.jsx)
    └── AppInner
        ├── Topbar (src/components/layout/Topbar.jsx)
        │   ├── AdvancedSearchPanel
        │   ├── UserSwitcher → ProfileEditor
        │   └── NotificationsPanel
        ├── Sidebar (desktop) / BottomNav (mobile/tablet)
        ├── [Vista attiva — renderView switch]
        │   ├── Dashboard (src/views/Dashboard.jsx)
        │   │   ├── NoticeBoard
        │   │   ├── QueueTab (x4)
        │   │   ├── PersonalQueue / UnassignedQueue / OverdueQueue / UrgentOthersQueue
        │   │   └── Scadenze Prossime + Carico Team
        │   ├── CalendarPlanner (src/views/CalendarPlanner.jsx)
        │   ├── Team (src/views/Team.jsx)
        │   ├── Trash (src/views/Trash.jsx, con RestoreEditModal inline)
        │   └── AdminView (src/views/AdminView.jsx, 5 tab)
        ├── TaskSlideOver
        ├── ChatPanel (src/modules/chat/ChatPanel.jsx)
        │   ├── ConversationList / ConversationView / NewConversationView
        │   ├── ChatMessage + VoicePlayer + ReactionPicker
        │   └── VoiceRecorder
        ├── QuickAddTask (src/components/modals/)
        ├── BulkTaskCreator (src/components/modals/, 4 tab)
        ├── AIDayPlanner (src/components/modals/)
        ├── FAB + pulsante bulk
        └── Toast
```

## Roadmap prossimi step

### ✅ Completato
- Migrazione a progetto Vite + React 18
- Splitting `VoyageDesk.jsx` → ~35 moduli (branch `claude/file-splitting-LiFlQ`)
- Build verificato: 68 moduli, nessun errore

### Priorità 1 — Modello dati completo (Fase 1 Roadmap)
- [ ] Anagrafica Clienti (CRM base) — entità `Client`
- [ ] Anagrafica Fornitori — entità `Supplier`
- [ ] Pratiche di viaggio (`PR-2026-001`, aggrega task + clienti + fornitori)
- [ ] Collegamento Task ↔ Cliente ↔ Pratica

### Priorità 2 — Operatività
- [ ] Notifiche reali (collegate ad azioni: scadenze, assegnazioni, commenti)
- [ ] Persistenza dati (localStorage iniziale, poi backend)
- [ ] Estensioni chat (task link cliccabile, ricerca conversazioni)

### Priorità 3 — Scala
- [ ] Multi-utente reale + login (richiede backend)
- [ ] TypeScript (dopo persistenza)
- [ ] Test unitari Vitest

Vedi `docs/ROADMAP.md` per il dettaglio completo con dipendenze e stime.

## Note tecniche importanti

1. **Entry point**: `src/main.jsx` → `src/App.jsx` (ViewportProvider + AppInner). Tutti i componenti con `useViewport()` devono essere figli di `ViewportProvider`.
2. **TEAM/CATEGORIES/CURRENT_USER** sono `let` mutabili in `src/data/mockData.js` — pattern ibrido con sync nel reducer via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. Funziona ma è da migrare a Context puro in futuro.
3. **Chat e AI**: `AIDayPlanner` usa `fetch` su `https://api.anthropic.com/v1/messages`. In dev locale, serve API key nell'ambiente o mock.
4. **activityLog**: max 100 entry, poi taglia le più vecchie (in `appReducer.js`).
5. **Backup JSON**: Admin → Import/Export include tutto lo stato persistente. Ripristino sovrascrive.
6. **DnD**: disabilitato su mobile. Usare SwipeActions per azioni rapide.
7. **Build**: `npm run build` (o `npx vite build`) — attualmente 791 KB bundle, warning size normale per il progetto.
