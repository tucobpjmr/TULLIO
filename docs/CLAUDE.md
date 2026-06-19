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
- **Sync globale**: TEAM/CATEGORIES/CURRENT_USER vivono in `src/state/appGlobals.js` come `export let` (live ES-module bindings). Il reducer (`src/state/reducer.js`) li aggiorna chiamando i setter `setTeam`/`setCategories`/`setCurrentUser`; i moduli esterni leggono direttamente la live binding. **NON** usare il vecchio pattern `_syncTeam`/`_syncCategories`/`_syncCurrentUser` (rimosso in Step P Phase 1)

### Cosa NON fare
- Non usare localStorage/sessionStorage (vincolo artifact, da rimuovere post-migrazione Vite)
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare drag&drop su mobile (usare SwipeActions)

## Palette colori

```css
--navy: #0F2044;        --navy-light: #1a3060;     --navy-dark: #08152d;
--sky: #87CEEB;         /* shell: topbar, sidebar, bottom-nav */
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
  client: string|null,       // campo testo libero (NON FK)
  praticaRef: string|null,   // campo testo libero "N° pratica" (es. "PR-2026-001") — NON FK
  dueDate: ISO|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO|null        // soft-delete
}
```

> ⛔ `dossierId` / `dossier_id` NON ESISTONO PIÙ (rimossi in sessione 24, migration `20260616`). Usare `praticaRef`/`pratica_ref` (testo libero).

### Cliente (CRM)
```js
{
  id: UUID,
  name: string,              // required
  email: string|null,
  phone: string|null,
  address: string|null,
  city: string|null,
  notes: string|null,
  createdAt: ISO
}
```

> ⛔ **Fornitore** e **Pratica di viaggio** (Dossier) sono stati **RIMOSSI DEFINITIVAMENTE** in sessione 24. Non reintrodurli.

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

### CRM Clienti
`SET_CLIENTS`, `ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`

> ⛔ Le azioni CRM Fornitori (`*_SUPPLIER`) e CRM Pratiche (`*_DOSSIER`) sono state **rimosse** in sessione 24.

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

## Struttura componenti attuali (post Phase 2f + Fase 1 CRM)

```
VoyageDesk (export default, ViewportProvider wrapper)
└── VoyageDeskInner
    ├── shell/Topbar
    │   ├── AdvancedSearchPanel (locale)
    │   ├── UserSwitcher → modals/ProfileEditor
    │   └── NotificationsPanel (locale)
    ├── shell/Sidebar (desktop) / shell/BottomNav (mobile/tablet)
    ├── [Vista attiva — renderView switch]
    │   ├── dashboard/Dashboard
    │   │   ├── dashboard/NoticeBoard + modals/NoticeEditorModal
    │   │   ├── QueueTab (locale in dashboard/Dashboard)
    │   │   ├── PersonalQueue / UnassignedQueue / OverdueQueue / UrgentOthersQueue (locale)
    │   │   └── Scadenze Prossime + Carico Team (locale)
    │   ├── calendar/CalendarPlanner (mese + settimana + distribuzione + helper iCal)
    │   ├── clients/ClientiView          ← mantenuto (anagrafica clienti)
    │   ├── suppliers/FornitoriView      ← ⛔ RIMOSSO sessione 24
    │   ├── dossiers/PraticheView        ← ⛔ RIMOSSO sessione 24
    │   ├── views/Team
    │   ├── views/Trash
    │   └── admin/AdminView (5 tab locale, stili da adminStyles.js)
    ├── tasks/TaskSlideOver
    ├── chat/ChatPanel (~1250 righe; 9 sub-componenti + helper locali)
    ├── modals/QuickAddTask
    ├── modals/BulkTaskCreator (4 tab locale)
    ├── modals/AIDayPlanner
    ├── shell/FAB
    └── ui/Toast
```

Tutti i componenti sono **moduli separati** in `src/components/`; helper e sub-componenti rimangono **module-local** (non esportati).

## Roadmap prossimi step

> ⛔ **Fase 1 — Pratiche & Fornitori RIMOSSI** (sessione 24, PR #63). Non ripristinare.
> ⛔ **Fase 3 Business RIMOSSA** (sessione 23). Non ripristinare.

### Priorità 1 — CRM (stato attuale)
- [x] Anagrafica Clienti → `src/components/clients/ClientiView.jsx` ✅ mantenuto
- [x] ~~Anagrafica Fornitori~~ → ⛔ RIMOSSO sessione 24
- [x] ~~Pratiche di viaggio~~ → ⛔ RIMOSSO sessione 24
- [x] Collegamento Task ↔ Pratica → ⛔ Sostituito con campo testo libero `praticaRef` nelle task

### Priorità 2 — Fase 2 Operatività ✅ (chiusa sessione 23)
- [x] Notifiche reali ✅
- [x] Calendario avanzato ✅
- [x] Estensioni chat ✅ (incluso riconoscimento pratica — rimosso in sessione 24)

### Priorità 3 — Scala & accessi (Fase 3)
- [ ] Multi-utente reale & permessi (login vero, isolamento dati)
- [ ] Estensioni chat avanzate (reazioni custom, mock audio/video)
- [ ] AI Assistant — estensioni (genera preventivo da testo, suggerimenti assegnazione)

Vedi `docs/ROADMAP.md` per il dettaglio completo con dipendenze e stime.

## Note tecniche importanti

1. **Architettura root**: `VoyageDesk` wrappa `VoyageDeskInner` dentro `<ViewportProvider>`. Tutti i componenti con `useViewport()` devono essere dentro questo provider.
2. **TEAM/CATEGORIES/CURRENT_USER** vivono in `src/state/appGlobals.js` come `export let` (live ES-module bindings). Setter `setTeam`/`setCategories`/`setCurrentUser` esposti per la riassegnazione dal reducer (`src/state/reducer.js`) — i moduli esterni non possono riassegnare un `let` importato (read-only). Pattern introdotto in Step P Phase 2c, insieme alla rimozione del vecchio `_sync*` (Phase 1). `CURRENT_USER` è a doppio canale: `appGlobals.CURRENT_USER` (letto al volo dai componenti non-hook, es. `SwipeActions`) + `state.currentUserId` (coerenza React); `SET_CURRENT_USER` aggiorna entrambi.
3. **Chat e AI**: usano `fetch` su `https://api.anthropic.com/v1/messages` — funziona solo in ambiente Claude.ai artifacts. Per dev locale, mockare o usare API key.
4. **activityLog**: max 100 entry, poi taglia le più vecchie.
5. **Backup JSON**: Admin → Import/Export include tutto lo stato persistente. Ripristino sovrascrive.
6. **DnD**: disabilitato su mobile. Usare SwipeActions per azioni rapide.
7. **CRLF su `src/VoyageDesk.jsx`**: il monolite ha line endings CRLF. Tool che lo riscrivono interamente (Python, alcuni helper) lo normalizzano a LF gonfiando il diff a migliaia di righe. Verifica sempre `git diff --numstat src/VoyageDesk.jsx` prima del push; se anomalo riconverti con `python3 -c "p='src/VoyageDesk.jsx'; d=open(p,'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'); open(p,'wb').write(d)"`.

## Struttura moduli post Step P + Fase 1 CRM — COMPLETA

```
src/
├── auth/                    AuthContext.jsx, LoginScreen.jsx
├── lib/
│   ├── api.js               Tasks/Notices/Conversations/Messages/Notifications/Users/Clients APIs (Suppliers/Dossiers RIMOSSI sessione 24)
│   ├── clientId.js          UUID per tab (origin-tagging realtime)
│   ├── mappers.js           DB ↔ camelCase (fromDbClient/toDbClient, fromDbNotification; Supplier/Dossier RIMOSSI sessione 24)
│   ├── supabase.js
│   ├── taskConstants.js     PRIORITIES/STATUSES/STATUS_*/NOTICE_COLORS/TASK_TEMPLATES (Phase 2a)
│   ├── taskUtils.js         formatDate/formatTime/isUrgent/isMyTask/... (Phase 2a)
│   ├── xlsx.js              loadXLSX() lazy loader (Phase 2f)
│   └── mentions.js          findMentions() — parser @menzioni (caveat #2, gemello DB)
├── hooks/                   (sessione 18)
│   └── useDebouncedTableSubscription.js   idratazione+subscribe realtime debounced (caveat #10)
├── state/                   (Phase 2b–2d)
│   ├── mockData.js          INITIAL_TEAM/CATEGORIES/TASKS/NOTICES + MOCK_NOTIFICATIONS
│   ├── appGlobals.js        TEAM/CATEGORIES/CURRENT_USER live bindings + setter + permessi
│   └── reducer.js           baseReducer / reducer / makeInitialState / LOGGED_ACTIONS / ADMIN_ONLY
├── components/              (Phase 2e + 2f — ESTRAZIONE COMPLETA + Fase 1 CRM)
│   ├── Viewport.jsx         ViewportContext / useViewport / ViewportProvider
│   ├── SwipeActions.jsx     swipe mobile wrapper
│   ├── ui/
│   │   ├── Avatar.jsx
│   │   ├── PriorityBadge.jsx
│   │   ├── CategoryChip.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── Toast.jsx
│   │   └── MentionText.jsx  evidenzia @menzioni come chip (caveat #2)
│   ├── modals/
│   │   ├── ProfileEditor.jsx
│   │   ├── BulkTaskCreator.jsx (contiene 5 tab locali)
│   │   ├── AIDayPlanner.jsx
│   │   ├── NoticeEditorModal.jsx
│   │   ├── QuickAddTask.jsx
│   │   ├── AddTeamMemberModal.jsx
│   │   └── AddCategoryModal.jsx
│   ├── dashboard/
│   │   ├── Dashboard.jsx (esporta Dashboard; contiene 4 Queue + QueueTab locali)
│   │   └── NoticeBoard.jsx
│   ├── calendar/
│   │   └── CalendarPlanner.jsx (contiene helper iCal locali)
│   ├── chat/
│   │   └── ChatPanel.jsx (~1250 righe; 9 sub-componenti + helper locali)
│   ├── tasks/
│   │   └── TaskSlideOver.jsx
│   ├── admin/
│   │   ├── AdminView.jsx (contiene 5 tab locali)
│   │   └── adminStyles.js (13 costanti stile consolidate)
│   ├── clients/
│   │   └── ClientiView.jsx              ← anagrafica clienti (mantenuta)
│   ├── suppliers/                       ← directory vuota (FornitoriView.jsx RIMOSSO sessione 24)
│   ├── dossiers/                        ← directory vuota (PraticheView.jsx RIMOSSO sessione 24)
│   ├── views/
│   │   ├── Team.jsx
│   │   └── Trash.jsx
│   └── shell/
│       ├── Topbar.jsx (contiene AdvancedSearchPanel, UserSwitcher, NotificationsPanel locali)
│       ├── Sidebar.jsx (contiene NAV_ITEMS 6 voci, BottomNav, NavBadge locali)
│       └── FAB.jsx
├── VoyageDesk.jsx           Shell di orchestrazione (hydration solo Clienti; sessione 24)
└── main.jsx
```

**Step P COMPLETO (Phase 1 → 2g).** **CRM:** solo Clienti attivo (Fornitori e Pratiche rimossi in sessione 24, PR #63). Nessun caveat aperto.

Le notifiche nascono **solo da trigger DB / funzioni server-side** (RLS vieta insert client) — per nuove notifiche serve un trigger o una funzione `SECURITY DEFINER` schedulata via pg_cron. Tipi notifica attivi (`NOTIF_ICONS`/`notifTitle` in `Topbar.jsx`): `task_assigned`, `task_due`, `comment`, `mention`, `queue_stale`. ~~`dossier_status`~~ e ~~`dossier_departure`~~ **RIMOSSI** (sessione 24).

Vedi `docs/HANDOFF_SESSION_2026-06-19_v26.md` (handoff attivo) per lo stato corrente dopo sessione 26 (8 round micro-feature loop frontend-only, Rounds 16–23).
