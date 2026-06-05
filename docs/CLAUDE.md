# CLAUDE.md — Istruzioni per Claude Code

## Identità progetto

**VoyageDesk** è un sistema gestionale per agenzie viaggi e tour operator. Single-file React (`src/VoyageDesk.jsx`, ~10456 righe, v0.11-dev). Vite + React 18, zero backend, dati in memoria.

## Ruolo

Agisci come sviluppatore full-stack specializzato in sistemi gestionali per travel industry. Rispondi in italiano, sintetico.

---

## Regole di sviluppo

### Stile codice
- React 18 con hooks (useState, useReducer, useContext, useRef, useEffect, useCallback, useMemo)
- CSS inline + CSS variables (definite in `:root` dentro FontLoader) — NO Tailwind, NO librerie CSS
- Stato globale: useReducer + Context. Chat: useState
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
- **Permessi**: ogni nuova feature che tocca task o viste deve usare i canXxx helpers. Ogni nuova voce nav in `NAV_ITEMS` deve avere il campo `roles`
- **Sync globale**: TEAM/CATEGORIES/CURRENT_USER sono `let` mutabili sincronizzati via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`
- **FK nullable**: clientId, practiceId su Task sono opzionali. `Task.client` (stringa) mantenuto in sync per backwards compat
- **Notifiche**: stored (`state.notifications`) + computed (calcolate live da `buildComputedNotifications`). Le computed non persistono, non si eliminano

### Cosa NON fare
- Non usare localStorage/sessionStorage (vincolo artifact, da rimuovere post-migrazione Vite)
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare drag&drop su mobile (usare SwipeActions)

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

---

## Breakpoints responsive

| Nome | Range | Hook |
|------|-------|------|
| Mobile | ≤ 640px | `isMobile` |
| Tablet | 641–1024px | `isTablet` |
| Desktop | > 1024px | `isDesktop` |

Navigazione: Desktop → Sidebar collassabile. Tablet/Mobile → BottomNav.

---

## Modello dati corrente

### Task
```js
{
  id, title, category, priority, status,
  assignees: [memberId],       // [] = coda globale non assegnata
  client: string|null,         // stringa per display — mantenuta in sync con clientId
  clientId: string|null,       // FK → clients[].id
  practiceId: string|null,     // FK → practices[].id
  dueDate: ISO|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO|null          // soft-delete
}
```

### Client
```js
{
  id, name, type,              // 'family'|'couple'|'corporate'|'group'|'solo'
  email, phone,
  notes: string,
  tags: [string],
  createdAt: ISO
}
```

### Supplier
```js
{
  id, name, type,              // 'hotel'|'airline'|'transport'|'tour'|'insurance'|'restaurant'|'activity'|'other'
  email, phone, website,
  rating: 1–5,
  notes: string,
  tags: [string],
  createdAt: ISO
}
```

### Practice
```js
{
  id,
  number: 'PR-YYYY-NNN',       // buildPracticeNumber(practices, year)
  title,
  clientId: string|null,       // FK → clients[].id
  supplierIds: [string],       // FK → suppliers[].id (multipli)
  status,                      // 'draft'|'confirmed'|'active'|'completed'|'cancelled'
  startDate: ISO|null,
  endDate: ISO|null,
  destination: string,
  totalBudget: number,
  notes: string,
  events: [{ id, date, text, icon }],  // timeline eventi interna
  createdAt: ISO
}
```

### Notification (stored)
```js
{
  id,
  type,                        // NOTIFICATION_TYPES: task_assigned|task_commented|task_overdue|...
  title, body,
  forUserId: string|null,      // null = broadcast
  taskId: string|null,
  practiceId: string|null,
  createdAt: ISO,
  readBy: [userId]             // array degli utenti che l'hanno letta
}
```

### Agency Settings
```js
{
  name, email, phone, website, address, vatNumber, logoUrl, primaryColor
}
```

### Message Template
```js
{ id, name, body, category }
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

### Categorie task
`booking`, `hotel`, `visa`, `client`, `payment`, `marketing`, `supplier`, `admin`, `itinerary`, `transfer`

### Priorità task
`critical`, `high`, `medium`, `low`

### Stati task
`todo`, `inprogress`, `awaiting_client`, `awaiting_supplier`, `done`

### Practice statuses
`draft`, `confirmed`, `active`, `completed`, `cancelled`

### Supplier types
`hotel`, `airline`, `transport`, `tour`, `insurance`, `restaurant`, `activity`, `other`

### Client types
`family`, `couple`, `corporate`, `group`, `solo`

---

## Stato iniziale (`initialState`)

```js
{
  tasks: [...],
  clients: INITIAL_CLIENTS,         // 6 clienti mock
  suppliers: INITIAL_SUPPLIERS,     // 7 fornitori mock
  practices: INITIAL_PRACTICES,     // 5 pratiche mock
  notifications: INITIAL_NOTIFICATIONS,
  agency: { name: 'VoyageDesk', ... },
  messageTemplates: [...],          // 5 template predefiniti
  notices: [...],
  team: TEAM,
  categories: CATEGORIES,
  view: 'dashboard',
  selectedTaskId: null,
  searchQuery: '',
  showAdvancedSearch: false,
  showNotifications: false,
  filters: {},
  sidebarCollapsed: false,
  toast: null,
  activityLog: []
}
```

---

## Reducer actions disponibili

### View/UI
`SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`, `SET_CURRENT_USER`

### Task CRUD
`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

### Cestino
`DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

### Clienti (MANAGER/ADMIN)
`ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`
- `DELETE_CLIENT` → cascade nullifica `clientId` su task e pratiche

### Fornitori (MANAGER/ADMIN)
`ADD_SUPPLIER`, `UPDATE_SUPPLIER`, `DELETE_SUPPLIER`
- `DELETE_SUPPLIER` → cascade rimuove id da `practice.supplierIds`

### Pratiche (MANAGER/ADMIN)
`ADD_PRACTICE`, `UPDATE_PRACTICE`, `DELETE_PRACTICE`, `ADD_PRACTICE_EVENT`
- `DELETE_PRACTICE` → cascade nullifica `practiceId` su task

### Notifiche
`MARK_NOTIFICATION_READ`, `MARK_ALL_NOTIFICATIONS_READ`, `DELETE_NOTIFICATION`, `ADD_NOTIFICATION`

### Impostazioni agenzia (ADMIN)
`UPDATE_AGENCY_SETTINGS`

### Template messaggi (ADMIN)
`ADD_MESSAGE_TEMPLATE`, `UPDATE_MESSAGE_TEMPLATE`, `DELETE_MESSAGE_TEMPLATE`

### Profilo personale
`UPDATE_OWN_PROFILE`

### Admin Team (ADMIN_ONLY)
`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

### Admin Categorie (ADMIN_ONLY)
`ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

### Admin Backup (ADMIN_ONLY)
`SET_AGENCY_NAME`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

### Bacheca
`ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

### Altro
`UNDO_LAST_ACTION`

---

## Helper utility (da usare, non duplicare)

### Task / team
```
getMember(id)
getAssignableTeam()
formatDate(iso), formatTime(iso)
isOverdue(task), isUrgent(task)
getDayKey(iso)
isActiveTask(t), getActiveTasks(tasks), getTrashedTasks(tasks)
useViewport()
getRoleType(userId)
isAdmin(userId), isDriver(userId)
canViewTask(task, userId)
canEditTask(task, userId)
canCreateTaskCategory(cat, userId)
canAccessAdmin(userId)
getAvailableCategories(userId)
isMyTask(task, userId)
isInGlobalQueue(task)
getVisibleTasks(tasks, userId)
getNavItemsForUser(userId)     — NAV_ITEMS filtrati per ruolo
```

### Clienti / Fornitori / Pratiche
```
getClient(clients, id)                    — lookup per id
getClientTaskCount(tasks, clientId)
clientTypeIcon(type), clientTypeLabel(type)
getSupplier(suppliers, id)
supplierTypeMeta(type)                    — { icon, label, color }
getSupplierPracticeCount(practices, supplierId)
getPractice(practices, id)
getPracticeTasks(tasks, practiceId)
practiceStatusMeta(status)                — { label, color, bg }
formatMoney(amount)                       — '€ 1.234,56'
buildPracticeNumber(practices, year)      — 'PR-YYYY-NNN' progressivo
```

### Notifiche
```
buildNotification(type, data)             — crea oggetto notification
isNotificationForUser(notif, userId)
relativeTime(iso)                         — '2 ore fa', 'ieri', ecc.
buildComputedNotifications(state, userId) — live: overdue, coda lunga, pending
getNotificationsForUser(state, userId)    — merge stored + computed, unread-first
```

### Chat
```
parseMessageRefs(text)                    — ['PR-2026-001', ...]
renderMessageTextWithLinks(text, ctx)     — splits testo in span/link cliccabili
```

---

## Permessi per ruolo

| Azione | Admin | Manager | Agent | Driver |
|--------|-------|---------|-------|--------|
| Vedere task proprie | ✅ | ✅ | ✅ | ✅ (solo transfer) |
| Vedere coda globale | ✅ | ✅ | ✅ | ❌ |
| Modificare task | ✅ | ✅ | ✅ proprie | ✅ solo transfer proprie |
| Clienti/Fornitori/Pratiche | ✅ | ✅ | ✅ read | ❌ |
| Azioni Admin | ✅ | ❌ | ❌ | ❌ |
| Cestino | ✅ | ❌ | ❌ | ❌ |

### Helpers permessi clienti/fornitori/pratiche
```
canViewClients(userId)        canManageClients(userId)        canDeleteClient(userId)
canViewSuppliers(userId)      canManageSuppliers(userId)      canDeleteSupplier(userId)
canViewPractices(userId)      canManagePractices(userId)      canDeletePractice(userId)
```
Driver: tutti e tre i canView restituiscono false → NAV_ITEMS e SET_VIEW escludono quelle viste.

---

## NAV_ITEMS (ordine attuale)

```
dashboard  📊  tutti i ruoli
calendar   📅  tutti
practices  📁  admin|manager|agent
clients    👥  admin|manager|agent
suppliers  🤝  admin|manager|agent
team       👤  admin|manager
trash      🗑️  admin
admin      ⚙️  admin
```

---

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

---

## Struttura componenti

```
VoyageDesk (export default, ViewportProvider wrapper)
└── VoyageDeskInner
    ├── Topbar
    │   ├── AdvancedSearchPanel   (cerca task + cliente + numero pratica)
    │   ├── UserSwitcher → ProfileEditor
    │   └── NotificationsPanel    (stored + computed, filtri tipo, segna lette)
    ├── Sidebar (desktop) / BottomNav (mobile/tablet)
    ├── [Vista attiva — renderView switch]
    │   ├── Dashboard
    │   │   ├── NoticeBoard + NoticeEditorModal
    │   │   ├── PersonalQueue / UnassignedQueue / OverdueQueue / UrgentOthersQueue
    │   │   └── Scadenze Prossime + Carico Team
    │   ├── CalendarPlanner
    │   │   ├── Vista Mese (default)
    │   │   ├── Vista Giorno (griglia oraria 07-20 + pratiche multi-day)
    │   │   └── Export iCal (.ics) — RFC 5545
    │   ├── PracticesView
    │   │   ├── PracticeStatusBadge
    │   │   ├── PracticeEditorModal  (CRUD + eventi timeline)
    │   │   └── PracticeDetail       (pannello laterale: tasks, fornitori, eventi)
    │   ├── ClientsView
    │   │   ├── ClientAvatar + ClientTag
    │   │   ├── ClientEditorModal    (CRUD)
    │   │   └── ClientDetailPanel    (pannello laterale: task, pratiche collegate)
    │   ├── SuppliersView
    │   │   ├── SupplierAvatar + RatingStars
    │   │   ├── SupplierEditorModal  (CRUD)
    │   │   └── SupplierDetailPanel  (pannello laterale: pratiche collegate)
    │   ├── Team
    │   ├── Trash (con RestoreEditModal)
    │   └── AdminView (6 tab: sistema, team, categorie, impostazioni, backup, log)
    │       └── AdminSettingsTab     (profilo agenzia + CRUD template messaggi)
    ├── TaskSlideOver
    │   ├── ClientTag cliccabile → SET_VIEW clients
    │   └── PracticeStatusBadge cliccabile → SET_VIEW practices
    ├── ChatPanel
    │   ├── ConversationList         (ricerca messaggi, dot presenza online/occupato)
    │   ├── ConversationView         (template picker ⚡, rich preview task/pratica)
    │   │   └── ChatMessage          (renderMessageTextWithLinks → PR-YYYY-NNN cliccabili)
    │   └── NewConversationView
    ├── QuickAddTask                 (dropdown Cliente + dropdown Pratica filtrata)
    ├── BulkTaskCreator
    ├── AIDayPlanner
    ├── FAB
    └── Toast
```

---

## Stato della roadmap

| Fase | Stato |
|------|-------|
| Fase 1 — Modello dati (Clienti, Fornitori, Pratiche, Collegamento Task) | ✅ v0.10-dev |
| Fase 2 — Operatività (Notifiche, Calendario avanzato, Chat estesa, Impostazioni) | ✅ v0.11-dev |
| Fase 3 — Scala & accessi (multi-utente reale, AI esteso) | ⬜ prossimo |

Vedi `docs/ROADMAP.md` per il dettaglio completo.

---

## Note tecniche importanti

1. **Architettura root**: `VoyageDesk` wrappa `VoyageDeskInner` dentro `<ViewportProvider>`. Tutti i componenti con `useViewport()` devono essere dentro questo provider.
2. **TEAM/CATEGORIES/CURRENT_USER** sono `let` mutabili — pattern ibrido con sync nel reducer. Funziona ma è da migrare a Context puro.
3. **Chat e AI**: usano `fetch` su `https://api.anthropic.com/v1/messages` — funziona solo in ambiente Claude.ai artifacts. Per dev locale, mockare o usare API key.
4. **activityLog**: max 100 entry, poi taglia le più vecchie.
5. **Backup JSON** (versione `0.10`): Admin → Import/Export include `tasks`, `notices`, `clients`, `suppliers`, `practices`, `notifications`, `agency`, `messageTemplates`, `team`, `categories`, `activityLog`. Ripristino sovrascrive tutto.
6. **DnD**: disabilitato su mobile. Usare SwipeActions per azioni rapide (Fatto/Cestino/Inoltra con undo 5s).
7. **Notifiche auto-generate**: `UPDATE_TASK` genera `task_assigned` quando assignees cambia; `ADD_COMMENT` genera `task_commented`; `ADD_TASKS_BULK` genera `task_bulk_created`.
8. **buildPracticeNumber**: scansiona pratiche esistenti per anno corrente, restituisce `PR-YYYY-NNN` col progressivo massimo + 1, padding a 3 cifre.
9. **ChatContext**: contiene `{ tasks, practices, messageTemplates, dispatch, currentUserId }` — usato da `ChatMessage` per rich preview e click navigation.
