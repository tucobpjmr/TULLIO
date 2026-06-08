# CLAUDE.md — Istruzioni per Claude Code

## Identità progetto

**VoyageDesk** è un sistema gestionale per agenzie viaggi e tour operator. Attualmente è un single-file React (`src/VoyageDesk.jsx`, ~7071 righe). L'obiettivo immediato è portarlo in un progetto Vite reale per abilitare persistenza, multi-file, TypeScript e test.

## Ruolo

Agisci come sviluppatore full-stack specializzato in sistemi gestionali per travel industry. Rispondi in italiano, sintetico.

## Regole di sviluppo

### Stile codice
- React 18 con hooks (useState, useReducer, useContext, useRef, useEffect, useCallback, useMemo)
- CSS inline + CSS variables (definite in `:root` dentro FontLoader) — NO Tailwind, NO librerie CSS
- Stato globale: useReducer + Context. Chat: useState (migrazione a reducer pianificata)
- Lingua UI: **italiano** (label, placeholder, toast, tutto)
- Font: Playfair Display (headings, classe `.playfair`) + DM Sans (body, default)
- Dipendenza esterna unica: SheetJS (`xlsx`) per import CSV/Excel ed export Excel

### Convenzioni naming
- Componenti: PascalCase (`PersonalQueue`, `CalendarPlanner`)
- Helper/utility: camelCase (`canViewTask`, `getAssignableTeam`)
- Actions reducer: UPPER_SNAKE_CASE (`ADD_TASK`, `UPDATE_OWN_PROFILE`)
- CSS variables: kebab-case (`--navy`, `--gold-dark`)
- Sezioni nel file: delimitatori `// ─── TITOLO ───`

### Pattern da rispettare
- **Immutabilità**: sempre spread `{ ...state, tasks: [...] }`, mai mutare direttamente
- **Hover**: `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`
- **Animazioni ingresso**: classi `slide-up`, `fade-in`, `slide-right`
- **Responsive**: `const { isMobile, isDesktop } = useViewport()` dentro ogni componente che adatta il layout
- **Permessi**: ogni nuova feature che tocca task o viste deve usare `canViewTask`/`canEditTask`. Ogni nuova voce nav in `NAV_ITEMS` deve avere il campo `roles`
- **Sync globale**: TEAM/CATEGORIES/CURRENT_USER sono `let` mutabili sincronizzati via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`

### Cosa NON fare
- Non usare localStorage/sessionStorage (vincolo artifact, da rimuovere post-migrazione Vite)
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

### Clienti (CRM base, no Driver)
`ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`

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
getMember(id)                    — legge dal TEAM globale
getAssignableTeam()              — agenti attivi e non-pending
formatDate(iso), formatTime(iso) — formattazione date
isOverdue(task), isUrgent(task)  — check scadenze
getDayKey(iso)                   — stringa data
isActiveTask(t)                  — true se non cestinato
getActiveTasks(tasks)            — filtra non-cestinati
getTrashedTasks(tasks)           — filtra cestinati
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
canViewClients(userId), canManageClients(userId)
getClient(id, clients?)          — lookup cliente per id
getTasksByClient(tasks, client)  — task collegati per clientId o per nome legacy
```

## Classi CSS responsive (definite in FontLoader)

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

## Struttura componenti attuali

```
VoyageDesk (export default, ViewportProvider wrapper)
└── VoyageDeskInner
    ├── Topbar
    │   ├── AdvancedSearchPanel
    │   ├── UserSwitcher → ProfileEditor
    │   └── NotificationsPanel
    ├── Sidebar (desktop) / BottomNav (mobile/tablet)
    ├── [Vista attiva — renderView switch]
    │   ├── Dashboard
    │   │   ├── NoticeBoard + NoticeEditorModal
    │   │   ├── QueueTab (x4)
    │   │   ├── PersonalQueue / UnassignedQueue / OverdueQueue / UrgentOthersQueue
    │   │   └── Scadenze Prossime + Carico Team
    │   ├── CalendarPlanner (mese + settimana + distribuzione agenti)
    │   ├── Team
    │   ├── Trash (con RestoreEditModal)
    │   └── AdminView (5 tab)
    ├── TaskSlideOver
    ├── ChatPanel
    │   ├── ConversationList / ConversationView / NewConversationView
    │   ├── Message + VoicePlayer + ReactionsPopover
    │   └── VoiceRecorder
    ├── QuickAddTask (modale)
    ├── BulkTaskCreator (modale, 4 tab)
    ├── AIDayPlanner (modale)
    ├── FAB
    └── Toast
```

## Roadmap prossimi step

### Priorità 1 — Migrazione a progetto Vite
- [ ] Creare progetto Vite + React
- [ ] Splittare `VoyageDesk.jsx` in moduli (componenti, reducer, utils, mock-data, styles)
- [ ] Aggiungere persistenza (localStorage iniziale, poi backend)

### Priorità 2 — Modello dati completo
- [ ] Anagrafica Clienti (CRM base)
- [ ] Anagrafica Fornitori
- [ ] Pratiche di viaggio (aggrega task + clienti + fornitori)

### Priorità 3 — Operatività
- [ ] Notifiche reali (collegate ad azioni)
- [ ] Estensioni chat (task link cliccabile, ricerca conversazioni)
- [ ] Dark mode

### Priorità 4 — Business
- [ ] Modulo finanziario (dopo Pratiche)
- [ ] Report & Analytics avanzati

Vedi `docs/ROADMAP.md` per il dettaglio completo con dipendenze e stime.

## Note tecniche importanti

1. **Architettura root**: `VoyageDesk` wrappa `VoyageDeskInner` dentro `<ViewportProvider>`. Tutti i componenti con `useViewport()` devono essere dentro questo provider.
2. **TEAM/CATEGORIES/CURRENT_USER** sono `let` mutabili — pattern ibrido con sync nel reducer. Funziona ma è da migrare a Context puro.
3. **Chat e AI**: usano `fetch` su `https://api.anthropic.com/v1/messages` — funziona solo in ambiente Claude.ai artifacts. Per dev locale, mockare o usare API key.
4. **activityLog**: max 100 entry, poi taglia le più vecchie.
5. **Backup JSON**: Admin → Import/Export include tutto lo stato persistente. Ripristino sovrascrive.
6. **DnD**: disabilitato su mobile. Usare SwipeActions per azioni rapide.
