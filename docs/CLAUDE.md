# CLAUDE.md — Istruzioni per Claude Code

## Identità progetto

**VoyageDesk** — gestionale per agenzie viaggi e tour operator.
- File principale: `src/VoyageDesk.jsx` (~**8025 righe**, single-file React)
- Stack: React 18 + Vite + SheetJS (`xlsx`) + Supabase (infrastruttura pronta, non ancora attiva)
- Deploy: Vercel (preview automatico su ogni PR)
- Repo: `tucobpjmr/TULLIO`

## Ruolo

Sviluppatore full-stack specializzato in gestionali travel industry. Rispondi in **italiano**, tono sintetico.

## Regole di sviluppo

### Stile codice
- React 18 hooks: `useState`, `useReducer`, `useContext`, `useRef`, `useEffect`, `useCallback`, `useMemo`
- CSS inline + CSS variables (`:root` in `FontLoader`) — NO Tailwind, NO librerie CSS esterne
- Stato globale: `useReducer` + `AppContext`. Chat: `useState` (migrazione a reducer pianificata)
- UI in **italiano** (label, placeholder, toast, messaggi errore, tutto)
- Font: Playfair Display (headings `.playfair`) + DM Sans (body, default)
- Dipendenza esterna unica: `xlsx` (SheetJS) per import/export CSV/Excel

### Convenzioni naming
- Componenti: `PascalCase` (`ClientiView`, `CalendarPlanner`)
- Helper/utility: `camelCase` (`canViewTask`, `getNotifications`)
- Azioni reducer: `UPPER_SNAKE_CASE` (`ADD_CLIENT`, `MARK_NOTIF_READ`)
- CSS variables: `kebab-case` (`--navy`, `--gold-dark`)
- Sezioni nel file: delimitatori `// ─── TITOLO ───`

### Pattern obbligatori
- **Immutabilità**: spread `{ ...state, tasks: [...] }`, mai mutare direttamente
- **Hover**: `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`
- **Animazioni ingresso**: classi `slide-up`, `fade-in`, `slide-right`
- **Responsive**: `const { isMobile, isDesktop } = useViewport()` in ogni componente che adatta il layout
- **Permessi**: ogni nuova feature su task/viste usa `canViewTask`/`canEditTask`. Ogni voce NAV_ITEMS ha `roles`
- **Sync globale**: `TEAM`/`CATEGORIES`/`CURRENT_USER` sono `let` mutabili — sync via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`

### Cosa NON fare
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere i delimitatori `// ─── SEZIONE ───`
- Non usare drag & drop su mobile (SwipeActions già implementate)
- Non usare `localStorage` (dati in memoria; Supabase è il prossimo passo)

---

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

---

## Modello dati (state)

### Task
```js
{
  id, title, category, priority, status,
  assignees: [memberId],  // [] = coda globale (non assegnato)
  client: string|null,    // nome cliente (stringa, match con client.name in Clienti)
  dueDate: ISO|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO|null     // soft-delete
}
```

### Cliente (CRM base) — `state.clients`
```js
{
  id,                     // "cl1" o "cl-{timestamp}"
  name,                   // stringa — chiave per collegamento ai task
  type: "privato"|"azienda",
  email, phone, address,
  notes, tags: string[],
  createdAt, lastContact: ISO,
  totalSpend: number
}
```

### Team member — `state.team`
```js
{
  id, name, role, avatar, color, capacity,
  active: boolean, pending: boolean,
  email?, phone?, photoUrl?   // base64 o null
}
```

### Categorie task (mutabili via Admin) — `state.categories`
`booking`, `hotel`, `visa`, `client`, `payment`, `marketing`, `supplier`, `admin`, `itinerary`, `transfer`

### Priorità: `critical` · `high` · `medium` · `low`
### Stati task: `todo` · `inprogress` · `awaiting_client` · `awaiting_supplier` · `done`

### initialState completo
```js
{
  tasks: INITIAL_TASKS,
  team: TEAM,
  categories: CATEGORIES,
  clients: INITIAL_CLIENTS,       // nuovo — v0.10
  agencyName: "VoyageDesk",
  notices: INITIAL_NOTICES,
  activityLog: [],
  activeView: "dashboard",
  selectedTask: null,
  toast: null,
  searchQuery: "",
  showNotif: false,
  sidebarCollapsed: false,
  filters: { assignee, category, priority, status, client },
  lastAction: null,               // undo swipe actions
  currentUserId: "marco",
  readNotifIds: [],               // nuovo — v0.12: ID notifiche già lette
}
```

---

## Reducer actions

### View / UI
`SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`

### Task CRUD
`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

### Cestino
`DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

### Profilo personale
`UPDATE_OWN_PROFILE`

### Clienti CRM (v0.10)
`ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`, `IMPORT_CLIENTS`

### Notifiche (v0.12)
`MARK_NOTIF_READ`, `MARK_ALL_NOTIF_READ`

### Admin Team (ADMIN_ONLY)
`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

### Admin Categorie (ADMIN_ONLY)
`ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

### Admin Settings (ADMIN_ONLY)
`SET_AGENCY_NAME`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

### Bacheca
`ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

### Undo / Multi-utente
`UNDO_LAST_ACTION`, `SET_CURRENT_USER`

---

## Helper utility (usare, non duplicare)

```
getMember(id)                    — legge dal TEAM globale
getAssignableTeam()              — agenti attivi e non-pending
formatDate(iso), formatTime(iso) — formattazione date IT
isOverdue(task), isUrgent(task)  — check scadenze
getDayKey(iso)                   — stringa data (toDateString)
isActiveTask(t)                  — true se non cestinato
getActiveTasks(tasks)            — filtra non-cestinati
getTrashedTasks(tasks)           — filtra cestinati
getNotifications(state)          — notifiche dinamiche dal vivo (v0.12)
useViewport()                    — hook responsive
getRoleType(userId)              — "admin"|"manager"|"agent"|"driver"
isAdmin(userId), isDriver(userId)
canViewTask(task, userId)
canEditTask(task, userId)
canCreateTaskCategory(cat, userId)
canAccessAdmin(userId)
getAvailableCategories(userId)
isMyTask(task, userId)
isInGlobalQueue(task)
getVisibleTasks(tasks, userId)
getNavItemsForUser(userId)       — NAV_ITEMS filtrati per ruolo
```

---

## Struttura componenti

```
VoyageDesk (export default, ViewportProvider wrapper)
└── VoyageDeskInner
    ├── Topbar
    │   ├── AdvancedSearchPanel
    │   ├── UserSwitcher → ProfileEditor
    │   └── NotificationsPanel (dinamico, v0.12)
    ├── Sidebar (desktop, con badge live v0.12) / BottomNav (mobile, con badge v0.12)
    ├── [Vista attiva — renderView switch]
    │   ├── Dashboard
    │   │   ├── NoticeBoard + NoticeEditorModal
    │   │   ├── QueueTab (x4: Globale / Personale / Scadute / Urgenti)
    │   │   └── PersonalQueue / UnassignedQueue / OverdueQueue / UrgentOthersQueue
    │   ├── CalendarPlanner (mese + settimana + distribuzione agenti)
    │   ├── ClientiView (v0.10)             ← NUOVO
    │   │   └── ClienteEditModal
    │   ├── Team
    │   ├── Trash (con RestoreEditModal)
    │   └── AdminView (5 tab)
    ├── TaskSlideOver
    ├── ChatPanel
    │   ├── ConversationList / ConversationView / NewConversationView
    │   ├── Message + VoicePlayer + ReactionsPopover
    │   └── VoiceRecorder
    ├── QuickAddTask (modale — v0.11: cliente da dropdown, titolo auto)
    ├── BulkTaskCreator (modale, 4 tab)
    ├── AIDayPlanner (modale)
    ├── FAB
    └── Toast
```

## Navigazione (NAV_ITEMS)

| ID | Icona | Ruoli abilitati |
|----|-------|-----------------|
| `dashboard` | 📊 | tutti |
| `calendar` | 📅 | tutti |
| `clienti` | 👤 | admin, manager, agent |
| `team` | 👥 | admin, manager, agent |
| `trash` | 🗑️ | admin |
| `admin` | ⚙️ | admin |

---

## Note tecniche importanti

1. **Root**: `VoyageDesk` wrappa `VoyageDeskInner` in `<ViewportProvider>`. Ogni `useViewport()` deve stare dentro.
2. **TEAM/CATEGORIES/CURRENT_USER** sono `let` globali — sync via `_sync*`. Pattern ibrido funzionante, migrazione a Context puro pianificata.
3. **Chat & AI Day Planner**: `fetch` su `https://api.anthropic.com/v1/messages`. In dev locale serve API key nell'env.
4. **Notifiche**: generate al volo da `getNotifications(state)`. ID deterministici (`overdue-{taskId}`, `queue-{taskId}`, `pending-{memberId}`). Stato letto in `state.readNotifIds`.
5. **QuickAddTask**: accetta prop `clients` (array da `state.clients`). Titolo auto-generato da categoria + cliente.
6. **Import clienti**: in `ClientiView` tramite SheetJS. Mapping colonne multi-lingua (italiano + inglese). Anteprima con duplicati evidenziati.
7. **activityLog**: max 100 entry, poi taglia le più vecchie.
8. **Backup JSON**: Admin → Import/Export include tutto lo stato. Ripristino sovrascrive.
9. **Supabase**: infrastruttura pronta (`src/lib/supabase.js`, `src/lib/api.js`, `src/lib/auth/`). Non ancora integrata con il componente principale.

---

## Roadmap prossimi step

Vedi `docs/ROADMAP.md` per il dettaglio completo.

### Priorità immediata (Cloud Gold)
1. **Task link cliccabile nella chat** — testo precompilato → click apre TaskSlideOver (S effort)
2. **Filtro coda Driver per data** — vista transfer-oriented per Giulia (S effort)
3. **Modifica assegnatari da TaskSlideOver** — oggi si fa solo dall'edit completo (S effort)
4. **Estensioni chat** — ricerca conversazioni, task link cliccabile (S–M effort)
5. **Persistenza Supabase** — connettere `src/lib/api.js` al componente principale (L effort)
