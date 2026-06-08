# VoyageDesk — Handoff Document
**Data:** 2026-06-08  
**Branch:** `claude/claude-md-docs-WfgBu`  
**PR:** tucobpjmr/TULLIO#8 (draft)  
**Deploy preview:** https://tullio-git-claude-claude-md-docs-wfgbu-tooco-s-projects.vercel.app

---

## Stato attuale

La migrazione da single-file (`src/VoyageDesk.jsx`, ~7071 righe) a progetto Vite multi-file è **completa**. Il modulo **Fase 1** (CRM base) è completo con tre sezioni operative.

**Build:** ✓ 87 moduli, 0 warning  
**CI/CD:** Vercel auto-deploy su ogni push → Ready ✓

---

## Cosa è stato fatto in questa sessione

### 1. CLAUDE.md (root)
Creato `/CLAUDE.md` sintetizzando `docs/CLAUDE.md` + `docs/PROJECT_SPEC.md`. Contiene architettura, convenzioni, data model, helper, reducer actions, design system, roadmap.

### 2. Split multi-file (commit `fb68024`)
54 file creati — struttura completa:

```
src/
├── main.jsx                        # Entry point React
├── App.jsx                         # Root component (VoyageDeskInner + renderView)
├── VoyageDesk.jsx                  # Shim backward-compat → App.jsx
├── styles/GlobalStyles.jsx         # FontLoader, CSS variables, keyframes, classi .vd-*
├── contexts/
│   ├── AppContext.jsx              # useReducer + reducer + initialState + AppContext
│   └── ViewportContext.jsx         # useViewport() hook
├── data/
│   ├── mockData.js                 # TEAM, CATEGORIES, CURRENT_USER, INITIAL_TASKS, …
│   ├── taskTemplates.js            # TASK_TEMPLATES, INITIAL_NOTICES, NOTICE_COLORS
│   ├── mockClients.js              # INITIAL_CLIENTS (6 clienti demo)
│   ├── mockSuppliers.js            # INITIAL_SUPPLIERS (6 fornitori demo), SUPPLIER_TYPES
│   └── mockPratiche.js             # INITIAL_PRATICHE (4 pratiche demo), PRATICA_STATI
├── utils/
│   ├── helpers.js                  # getMember, formatDate, isOverdue, getActiveTasks, …
│   └── permissions.js              # RBAC helpers + NAV_ITEMS
├── components/
│   ├── ui/                         # Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast
│   ├── layout/                     # Topbar, Sidebar, BottomNav, NotificationsPanel
│   ├── search/AdvancedSearchPanel.jsx
│   ├── tasks/                      # QuickAddTask, TaskSlideOver
│   ├── queues/                     # PersonalQueue, UnassignedQueue, UrgentOthersQueue, OverdueQueue, QueueTab
│   ├── bulk/BulkTaskCreator.jsx
│   ├── chat/                       # ChatPanel, ConversationList, ConversationView, Message, VoiceRecorder, …
│   ├── admin/                      # AdminView, AdminTeam, AdminCategorie, AdminLog, AdminImportExport, AdminSistema
│   ├── SwipeActions.jsx
│   ├── AIDayPlanner.jsx
│   ├── NoticeBoard.jsx
│   └── FAB.jsx
└── views/
    ├── Dashboard.jsx
    ├── CalendarPlanner.jsx
    ├── Team.jsx
    ├── Trash.jsx
    ├── Clienti.jsx                 # CRM clienti
    ├── Fornitori.jsx               # Anagrafica fornitori
    └── Pratiche.jsx                # Pratiche di viaggio
```

### 3. Fase 1 — Clienti (commit `a1ca024`)
- Vista `Clienti` con griglia 3 colonne, KPI strip (totale/privati/aziende), ricerca + filtro tipo
- Slide-over dettaglio con task collegati
- Form modale creazione/modifica
- Soft-delete (cestino) con `deletedAt`
- 6 clienti demo in `mockClients.js`
- Reducer cases: `ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`, `RESTORE_CLIENT`, `SET_SELECTED_CLIENT`

### 4. Fase 1 — Fornitori (commit `0c01306`)
- Vista `Fornitori` con stesse feature di Clienti + rating stelle (1-5), scadenza contratto con alert colore (rosso=scaduto, arancio=<60gg)
- 8 tipologie fornitore con icone dedicate
- 6 fornitori demo in `mockSuppliers.js`
- Reducer cases: `ADD_SUPPLIER`, `UPDATE_SUPPLIER`, `DELETE_SUPPLIER`, `RESTORE_SUPPLIER`

### 5. Fase 1 — Pratiche di viaggio (commit `fa82e37` + `c6ea2a3`)
- Vista `Pratiche` con 5-KPI strip (totale/bozze/confermate/in_corso/completate) + budget totale
- `StatoTimeline` interattiva: avanza stato cliccando il cerchio successivo (bozza→confermata→in_corso→completata)
- `PraticaCard` con barra colorata in cima (colore = stato), numero pratica, cliente, destinazione, date, pax, budget, badge task aperti
- `PraticaDetail` slide-over: timeline azioni, info grid, budget widget navy/gold, note, task collegati
- `PraticaFormModal`: cliente dropdown, stato, destinazione, date, adulti/bambini, budget, **numero operatore** (testo libero), note
- Numerazione progressiva automatica `PR-YYYY-NNN`
- 4 pratiche demo collegate a clienti e task esistenti
- Reducer cases: `ADD_PRATICA`, `UPDATE_PRATICA`, `DELETE_PRATICA`, `RESTORE_PRATICA`
- **Fornitori rimossi dalle Pratiche** (per scelta del cliente) — sostituiti da campo "Numero operatore"

---

## Struttura stato globale (`initialState`)

```js
{
  tasks: INITIAL_TASKS,           // task con soft-delete
  team: TEAM,                     // agenti (mutabile via _syncTeam)
  categories: CATEGORIES,         // categorie (mutabile via _syncCategories)
  agencyName: "VoyageDesk",
  notices: INITIAL_NOTICES,       // bacheca avvisi
  clients: INITIAL_CLIENTS,       // clienti con soft-delete
  selectedClientId: null,
  suppliers: INITIAL_SUPPLIERS,   // fornitori con soft-delete
  pratiche: INITIAL_PRATICHE,     // pratiche con soft-delete
  activityLog: [],                // max 100 entry
  activeView: "dashboard",
  selectedTask: null,
  toast: null,
  searchQuery: "",
  showNotif: false,
  sidebarCollapsed: false,
  filters: { assignee, category, priority, status, client },
  lastAction: null,               // per UNDO via swipe
  currentUserId: CURRENT_USER,
}
```

## NAV_ITEMS (con ruoli)

| ID | Label | Ruoli |
|----|-------|-------|
| `dashboard` | Dashboard | tutti |
| `calendar` | Calendario | tutti |
| `clients` | Clienti | admin, manager, agent |
| `suppliers` | Fornitori | admin, manager, agent |
| `pratiche` | Pratiche | admin, manager, agent |
| `team` | Team | admin, manager, agent |
| `trash` | Cestino | admin |
| `admin` | Admin | admin |

---

## Prossimi step (Fase 2)

### Fase 2a — Collegamento Task ↔ Pratica (priorità alta)
Attualmente `pratica.taskIds[]` è popolato solo nei dati demo. Serve UI per:
- Associare/dissociare task a una pratica dal form pratica
- Mostrare il numero pratica nella TaskSlideOver
- Filtrare task per pratica nella Dashboard

### Fase 2b — Miglioramenti operativi
- **Notifiche push reali** (Web Notifications API o polling)
- **Dark mode** (toggle in Topbar, CSS variables condizionali)
- **Export pratiche** PDF/Excel (SheetJS già presente)

### Fase 2c — Calendario avanzato
- Vista agenda per pratica (timeline visuale partenze/ritorni)
- Filtro calendario per cliente o pratica

### Fase 3 — Business intelligence
- Modulo finanziario (margini, costi, ricavi per pratica)
- Report & Analytics (fatturato mese, pratiche per stato, top clienti)

---

## Note tecniche importanti

- **Niente localStorage**: il progetto gira ancora in-memory. Il layer Supabase (`src/lib/`) esiste ma non è attivato.
- **Mutable globals**: `TEAM`, `CATEGORIES`, `CURRENT_USER` sono `export let` in `mockData.js` e mutati in-place da `_syncTeam`/`_syncCategories`/`_syncCurrentUser` nel reducer. Questo è intenzionale per compatibilità con i componenti che li importano direttamente.
- **Chat**: stato locale in `ChatPanel` (non in AppContext). Migrazione a reducer pianificata in Fase 2.
- **SheetJS**: unica dipendenza UI esterna, usata in `AdminImportExport` e `BulkTaskCreator`.
- **src/lib/auth/**: `LoginScreen` e `AuthContext` esistono ma **non sono collegati** all'app principale (App.jsx non li usa). Erano presenti prima della sessione corrente.
