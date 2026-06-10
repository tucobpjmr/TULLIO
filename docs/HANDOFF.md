# VoyageDesk — Handoff per nuova sessione di sviluppo

> Leggi questo documento all'inizio di ogni nuova sessione prima di fare qualsiasi modifica.

---

## Cos'è VoyageDesk

Sistema gestionale per agenzie viaggi e tour operator. React 18, single-file (`src/VoyageDesk.jsx`, ~9000 righe), Vite build. Nessun backend reale — dati solo in memoria.

---

## Stato corrente: v0.10

### Funzionalità complete

- **Dashboard**: coda personale, coda globale, urgenti altrui, bacheca avvisi, scadenze prossime, carico team.
- **Kanban**: 5 stati (todo → inprogress → awaiting_client → awaiting_supplier → done), drag & drop desktop, swipe mobile.
- **Calendario**: viste Mese / Settimana / Giorno, click drill-down settimana→giorno, export iCal.
- **Team**: card agenti, % carico, distribuzione settimanale.
- **Pratiche**: CRUD completo, collegamento task/clienti/fornitori, numerazione PR-YYYY-NNN, timeline stati, riepilogo economico.
- **Clienti/Fornitori (CRM base)**: CRUD, liste, pannello dettaglio.
- **Admin** (6 tab): Team, Import/Export, Sistema/KPI, Categorie, Log attività, ⚙️ Impostazioni.
- **Impostazioni agenzia**: dati agenzia, CRUD template messaggi (con variabili `{{cliente}}`, `{{data}}`, `{{agenzia}}`), preferenze UI (banner benvenuto, conferma azioni distruttive).
- **Notifiche reali**: generate dinamicamente da azioni (ADD_TASK, ADD_COMMENT, APPROVE_TEAM_MEMBER), filtrabili per tipo, click-to-navigate al task/view, mark-read, dismiss, relTime.
- **Badge nav**: Sidebar/BottomNav con conteggio pending (Admin) e coda globale (Dashboard).
- **Chat**: messaggi testo/file/vocali, risposte, reazioni emoji, ricerca nel testo dei messaggi, presenza (Online/Occupato/Offline), task link cliccabili `[task:ID]`, template rapidi ⚡, task picker 📋.
- **Permessi ruolo**: Admin / Manager/Agent / Driver — helper `canViewTask`, `canEditTask`, `getNavItemsForUser`.
- **Responsive**: sidebar desktop collassabile, bottom nav mobile/tablet, SwipeActions mobile.

---

## Struttura del codice

Il file `src/VoyageDesk.jsx` è diviso in sezioni delimitate da commenti `// ─── TITOLO ───`. Ordine dall'alto:

1. Import + FontLoader + CSS globale
2. MOCK DATA (TEAM, CATEGORIES, INITIAL_TASKS, INITIAL_CLIENTS, INITIAL_SUPPLIERS, INITIAL_PRATICHE, INITIAL_NOTICES)
3. `generateInitialNotifications()` — notifiche iniziali dinamiche
4. NOTIFICATIONS (costanti NOTIF_ICONS, NOTIF_COLORS, relTime, NOTIF_FILTERS)
5. TASK TEMPLATES (per BulkTaskCreator)
6. PERMISSION HELPERS (`getRoleType`, `isAdmin`, `isDriver`, `canViewTask`, `canEditTask`, …)
7. SwipeActions
8. `buildLogEntry` + `_makeNotif` + `_addNotif`
9. `baseReducer` — tutte le action
10. `DEFAULT_UI_PREFERENCES` + `initialState`
11. UTILS (getMember, getAssignableTeam, formatDate, formatTime, isOverdue, isUrgent, getDayKey, isActiveTask, getActiveTasks, getTrashedTasks, useViewport, getNavBadgeCount, getNavItemsForUser)
12. UI PRIMITIVES (Avatar, PriorityBadge, StatusBadge, CategoryChip)
13. Topbar → AdvancedSearchPanel → UserSwitcher/ProfileEditor → NotificationsPanel
14. Sidebar + BottomNav (con badge)
15. BulkTaskCreator (4 tab)
16. QuickAddTask (modale)
17. AIDayPlanner
18. TaskSlideOver
19. Dashboard (NoticeBoard + NoticeEditorModal + code)
20. CalendarPlanner (Mese + Settimana + Giorno + iCal helpers)
21. Team
22. Pratiche/Clienti/Fornitori (CRM + Pratiche)
23. Trash (AdminTrashTab + RestoreEditModal)
24. Admin tabs (AdminTeamTab, AdminIOTab, AdminStatsTab, AdminCategoriesTab, AdminLogTab, AdminSettingsTab)
25. AdminView (6 tab)
26. CHAT (ChatContext, presence, task link parsing, INITIAL_MESSAGE_TEMPLATES, ChatMessage, ConversationView, ConversationList, NewConversationView, ChatPanel)
27. FAB + Toast
28. VoyageDeskInner (reducer + stato + routing viste)
29. ViewportProvider + VoyageDesk (export default)

---

## Modello dati: initialState

```js
{
  tasks,                // [{id, title, category, priority, status, assignees, client, dueDate, estimatedHours, description, comments, deletedAt}]
  clients,              // [{id, name, email, phone, address, notes, tags, createdAt}]
  suppliers,            // [{id, name, category, contact, email, phone, notes}]
  pratiche,             // [{id, numero, title, clientId, status, assignees, supplierId, budget, …}]
  team,                 // [{id, name, role, avatar, color, capacity, active, pending, email, phone, photoUrl}]
  categories,           // {booking:{label,icon,color}, hotel:…, …}
  agencyName,           // string
  agencySettings,       // {address, phone, email, website, vatNumber}
  messageTemplates,     // [{id, name, text}] — variabili {{cliente}}, {{data}}, {{agenzia}}
  uiPreferences,        // {density, defaultView, confirmDestructive, showWelcomeBanner}
  notices,              // [{id, text, author, color, pinned, createdAt}]
  notifications,        // [{id, type, title, time, read, taskId?, memberId?}]
  activityLog,          // max 100 entry
  activeView,           // "dashboard"|"kanban"|"calendar"|"team"|"planning"|"trash"|"admin"
  selectedTask,         // task aperto in TaskSlideOver, o null
  toast,                // {message, type} o null
  searchQuery,
  showNotif,
  sidebarCollapsed,
  filters,              // {assignee, category, priority, status, client}
  lastAction,           // per undo swipe
  currentUserId,        // utente loggato
}
```

---

## Reducer actions

### View/UI
`SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`

### Task CRUD
`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

### Cestino
`DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

### Profilo
`UPDATE_OWN_PROFILE`

### Admin Team
`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

### Admin Categorie
`ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

### Admin Backup/Settings
`SET_AGENCY_NAME`, `UPDATE_AGENCY_SETTINGS`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

### Impostazioni (v0.10, ADMIN_ONLY)
`ADD_MESSAGE_TEMPLATE`, `UPDATE_MESSAGE_TEMPLATE`, `DELETE_MESSAGE_TEMPLATE`, `SET_UI_PREFERENCE`, `RESET_UI_PREFERENCES`

### Notifiche (v0.10)
`MARK_NOTIF_READ`, `MARK_ALL_NOTIF_READ`, `DISMISS_NOTIF`, `DISMISS_READ_NOTIFS`

### Bacheca
`ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

### Altro
`UNDO_LAST_ACTION`, `SET_CURRENT_USER`

---

## Regole e vincoli

1. **CSS**: solo inline styles + CSS variables (niente Tailwind, niente librerie CSS).
2. **Hover**: sempre `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`.
3. **Stato globale**: `TEAM`, `CATEGORIES`, `CURRENT_USER` sono `let` mutabili sincronizzati via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. Non usare localStorage.
4. **Immutabilità**: sempre spread, mai mutare direttamente lo state.
5. **Permessi**: ogni nuova feature su task/viste deve usare `canViewTask`/`canEditTask`. Ogni voce nav deve avere il campo `roles`.
6. **Lingua UI**: tutto in italiano (label, toast, placeholder).
7. **Dipendenza unica**: SheetJS (`xlsx`) per import/export Excel.
8. **Chat**: usa `fetch` su `api.anthropic.com` — funziona solo in ambiente Claude.ai. In dev locale, mockare.
9. **Notifiche**: usare `_makeNotif` + `_addNotif` nel reducer per aggiungere notifiche automatiche.
10. **Task link in chat**: formato `[task:ID]` — renderizzato come chip cliccabile da `RenderedMessageText`.
11. **iCal**: helper `exportTasksToICal` disponibile globalmente.

---

## Prossimi step consigliati (in ordine di valore)

1. **Persistenza dati** — localStorage iniziale. Scaffolding Supabase già in `src/lib/supabase.js` e `src/lib/api/`. Questo sblocca tutto il resto.
2. **Login vero & AuthContext** — scaffolding in `src/lib/auth/AuthContext.jsx` e `src/components/LoginScreen.jsx`.
3. **Report & Analytics avanzati** — estende i KPI già presenti in AdminStatsTab (margini, trend temporali, export PDF).
4. **Migliorie incrementali**:
   - Modifica assegnatari da TaskSlideOver
   - Filtro coda globale (per categoria/priorità)
   - Bacheca: menzioni @utente
   - Auto-move in "In Corso" al "Prendi in carico"
5. **Catalogo destinazioni / pacchetti**.
6. **Dark mode** — CSS variables già pronte in `:root`.
7. **Separazione multi-file + TypeScript + Vitest**.

---

## Come testare in locale

```bash
npm install
npm run dev   # http://localhost:5173
```

Il build Vite è il check sintattico: `./node_modules/.bin/vite build`.

---

## Design system

Palette: `--navy #0F2044`, `--gold #D4A843`, `--surface #FAFAF7`, `--danger #C0392B`, `--success #2D7A4F`, `--warning #C8832A`.
Font: Playfair Display (headings, classe `.playfair`) + DM Sans (body).
Animazioni: classi `slide-up`, `fade-in`, `slide-right`.
Breakpoints: mobile ≤640px (`isMobile`), tablet 641–1024px (`isTablet`), desktop >1024px (`isDesktop`).
