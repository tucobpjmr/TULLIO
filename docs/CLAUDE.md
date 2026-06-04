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
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare drag&drop su mobile (usare SwipeActions)
- Non bypassare la persistenza: lo state passa già per `useReducer` con lazy init `loadPersistedState`. Per nuove slice di state che vuoi persistere, aggiungile al reducer; per quelle volatili UI, aggiungile a `PERSIST_OMIT`.

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
  client: string|null,       // nome legacy/free-text (display fallback)
  clientId: string|null,     // v0.9.5: riferimento ad anagrafica clienti
  dueDate: ISO|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO|null        // soft-delete
}
```

### Client (v0.9.5)
```js
{
  id: "cl-xxx",
  name: string,              // obbligatorio
  type: "famiglia"|"coppia"|"azienda"|"gruppo"|"individuale",
  contactPerson: string|null,
  email: string|null,
  phone: string|null,
  notes: string,
  createdAt: ISO, updatedAt: ISO, deletedAt: ISO|null   // soft-delete
}
```

### Supplier (v0.9.7)
```js
{
  id: "sp-xxx",
  name: string,              // obbligatorio
  type: "hotel"|"transport"|"airline"|"insurance"|"tour-operator"|"visa"|"other",
  contactPerson: string|null,
  email: string|null,
  phone: string|null,
  address: string|null,
  services: string,          // descrizione servizi offerti
  notes: string,             // accordi commerciali, scadenze contrattuali
  createdAt: ISO, updatedAt: ISO, deletedAt: ISO|null   // soft-delete
}
```

### Practice (v0.9.8) — chiude Fase 1
```js
{
  id: "pr-xxx",
  number: "PR-YYYY-NNN",     // auto-progressive via generatePracticeNumber()
  title: string,             // obbligatorio
  clientId: string|null,
  supplierIds: [string],     // multi-fornitori
  status: "draft"|"confirmed"|"in_progress"|"completed"|"cancelled",
  destination: string,
  departureDate: ISO|null, returnDate: ISO|null,
  totalValue: number,        // ricavo €
  cost: number,              // costo fornitori €
  paid: number,              // incassato €
  notes: string,
  events: [{ time, type, text, userId }],  // timeline: created|status|payment|note
  createdAt: ISO, updatedAt: ISO, deletedAt: ISO|null
}
```

Task schema esteso con `practiceId: string|null` (oltre a `clientId` e `supplierId`).

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

### Clienti (v0.9.5 — non admin-only, ma bloccate al Driver)
`ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`, `SET_SELECTED_CLIENT`

### Fornitori (v0.9.7 — stessa regola dei Clienti, bloccate al Driver)
`ADD_SUPPLIER`, `UPDATE_SUPPLIER`, `DELETE_SUPPLIER`, `SET_SELECTED_SUPPLIER`

### Pratiche (v0.9.8 — stessa regola, bloccate al Driver)
`ADD_PRACTICE`, `UPDATE_PRACTICE`, `DELETE_PRACTICE`, `SET_SELECTED_PRACTICE`, `CHANGE_PRACTICE_STATUS`

### Notifiche & Tema (v0.9.9)
`MARK_NOTIFICATION_READ`, `MARK_ALL_NOTIFICATIONS_READ`, `CLEAR_READ_NOTIFICATIONS`, `SET_THEME` (payload `"light"|"dark"|"toggle"`).
Le notifiche sono generate automaticamente dal wrapper reducer in `generateNotifications(prevState, nextState, action)`. Per aggiungere nuovi trigger, estendere quella funzione (non serve una nuova action).

### Presence & Overdue (v0.9.10)
`SET_USER_STATUS` (payload `{ status: "online"|"busy"|"away"|"offline", userId? }` — default `userId = currentUserId`),
`SCAN_OVERDUE_NOTIFICATIONS` (idempotente, una volta al giorno per task).
Lo `SCAN_OVERDUE_NOTIFICATIONS` viene triggerato da `useEffect([state.currentUserId])` in `VoyageDeskInner`.

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
- [x] Creare progetto Vite + React
- [ ] Splittare `VoyageDesk.jsx` in moduli (componenti, reducer, utils, mock-data, styles)
- [x] Aggiungere persistenza (localStorage in `loadPersistedState` / `savePersistedState`). Backend ancora da fare.

### Priorità 2 — Modello dati completo ✅ (chiusa in v0.9.8)
- [x] Anagrafica Clienti (CRM base) — v0.9.5
- [x] Anagrafica Fornitori — v0.9.7
- [x] Pratiche di viaggio — v0.9.8

### Fase 2 — Operatività ✅ (chiusa in v0.9.10)
- [x] Notifiche reali — v0.9.9
- [x] Notifiche schedulate (overdue auto) — v0.9.10
- [x] Dark mode — v0.9.9
- [x] Ricerca chat (testo messaggi) — v0.9.9
- [x] Presence status online/busy/away/offline — v0.9.10
- [x] Calendario settimana — v0.9.6
- [x] Calendario giorno + iCal export — v0.9.10

### Prossimo focus
- **Fase 3**: Modulo finanziario, Report & Analytics avanzati, Catalogo destinazioni.
- **Traccia tecnica**: splittare `VoyageDesk.jsx` (~10720 righe).

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
2. **TEAM/CATEGORIES/CURRENT_USER** sono `let` mutabili — pattern ibrido con sync nel reducer. Funziona ma è da migrare a Context puro. `loadPersistedState` riallinea questi globali alla hydration.
3. **Chat e AI**: usano `fetch` su `https://api.anthropic.com/v1/messages` — funziona solo in ambiente Claude.ai artifacts. Per dev locale, mockare o usare API key.
4. **activityLog**: max 100 entry, poi taglia le più vecchie.
5. **Backup JSON**: Admin → Import/Export include tutto lo stato persistente. Ripristino sovrascrive.
6. **DnD**: disabilitato su mobile. Usare SwipeActions per azioni rapide.
7. **Persistenza (v0.9.1)**: state e chat su `localStorage` (chiavi `voyagedesk:state:v1`, `voyagedesk:chat:v1`). `PERSIST_OMIT` lista i campi UI volatili. `PERSIST_VERSION` bumpabile per invalidare payload obsoleti. Reset disponibile in Admin → Import/Export.
