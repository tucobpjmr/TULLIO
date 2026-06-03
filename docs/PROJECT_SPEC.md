# VoyageDesk — Specifiche Tecniche

## 🎯 Scopo
Applicazione gestionale per agenzie viaggi/tour operator. Gestisce task operativi, team, clienti, comunicazione interna.

## 🏗️ Stack Tecnico
- **Framework**: React 18 (hooks: useState, useReducer, useContext, createContext, useRef, useEffect, useCallback, useMemo)
- **Stile**: CSS inline + CSS variables + classi CSS responsive nel `FontLoader` (NO Tailwind, NO librerie CSS esterne)
- **Stato globale**: useReducer + Context pattern
- **Stato locale chat**: useState (può essere migrato a reducer in futuro)
- **DnD**: HTML5 Drag & Drop API nativo (disabilitato su mobile — vedi sezione Responsive)
- **Routing**: state-based switch (no react-router)
- **Persistenza**: nessuna (tutto in memoria)
- **Font**: Playfair Display (display) + DM Sans (UI body) via Google Fonts
- **Lingua UI**: italiano
- **Dipendenze esterne**: solo SheetJS (`xlsx`) per import CSV/Excel ed export Excel — eccezione documentata al "no libs"

## 🎨 Design System

### Palette colori (CSS variables in `:root`)
```css
--navy: #0F2044;           /* primario */
--navy-light: #1a3060;
--navy-dark: #08152d;
--gold: #D4A843;            /* accent */
--gold-light: #e8c46a;
--gold-dark: #b8902e;
--surface: #FAFAF7;          /* sfondo principale */
--surface2: #F0EEE8;         /* sfondo secondario */
--surface3: #E8E5DC;
--success: #2D7A4F;
--warning: #C8832A;
--danger: #C0392B;
--text: #1A1A2E;
--text-muted: #6B6B80;
--text-light: #9999AA;
--border: #E0DDD5;
```

### Tipografia
- Headings/display: `Playfair Display` (classe `.playfair`)
- UI/body: `DM Sans` (default)

### Animazioni CSS keyframes
- `fadeIn`, `slideRight`, `slideUp` — transizioni viste
- `toastIn`, `toastOut` — toast notification
- `recordPulse`, `wave` — recorder vocale
- `typing` — indicatore "sta scrivendo"

## 📱 Responsive (v0.6+)

### Breakpoints
- **Mobile**: ≤ 640px
- **Tablet**: 641 – 1024px
- **Desktop**: > 1024px

### Strategia
1. **Hook `useViewport()`** → restituisce `{ width, isMobile, isTablet, isDesktop }`.
2. **Classi CSS responsive** nel `FontLoader` con `!important`.
3. **Meta viewport** iniettato automaticamente al mount del `ViewportProvider`.

### Navigazione
- **Desktop (> 1024px)**: `Sidebar` sinistra (collassabile a 60px)
- **Tablet/Mobile (≤ 1024px)**: `BottomNav` con icone+label corte, `Sidebar` nascosta

### Adattamenti specifici
- **Kanban**: drag&drop disabilitato su mobile; SwipeActions (v0.7) per azioni rapide. Board con `scroll-snap-type: x mandatory` e colonne 82vw.
- **Planning**: griglia 7-giorni con scroll orizzontale snap (60vw per giorno) su mobile.
- **Calendar**: celle compatte 52px con pallini-conteggio colorati invece dei titoli.
- **TaskSlideOver** e **ChatPanel**: full-screen (`100vw`) su mobile.
- **Modali centrate**: `padding:16` sull'overlay + `maxWidth:100%` + `maxHeight:90vh` + `overflowY:auto`.
- **FAB**, **Toast**, **NotificationsPanel**: posizionati per non sovrapporsi alla bottom nav.

## 🔐 Permessi per Ruolo (v0.8)

### Ruoli
| Ruolo | Derivato da `role` in TEAM | Codice helper |
|---|---|---|
| Admin | `role` contiene "admin" | `getRoleType(uid) === "admin"` |
| Manager | `role` contiene "manager" | `getRoleType(uid) === "manager"` |
| Agent | `role` contiene "agent" | `getRoleType(uid) === "agent"` |
| Driver | `role` contiene "driver" | `getRoleType(uid) === "driver"` |

### Matrice permessi
| Azione | Admin | Manager/Agent | Driver |
|---|---|---|---|
| Visualizzare task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Visualizzare coda globale | ✅ | ✅ | ❌ |
| Visualizzare urgenti altrui (<24h) | ✅ | ✅ (read-only) | ❌ |
| Modificare task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Modificare coda globale | ✅ | ✅ | ❌ |
| Creare task (tutte le categorie) | ✅ | ✅ | ❌ (solo transfer) |
| Azioni Admin (team/categorie/backup) | ✅ | ❌ | ❌ |
| Cestino (restore/purge/svuota) | ✅ | ❌ | ❌ |
| Accesso vista Admin/Trash | ✅ | ❌ | ❌ |
| SwipeActions | ✅ (solo mobile) | ✅ su editabili | ✅ su editabili |

### Implementazione
- **Helper centralizzati** nelle UTILS: `canViewTask`, `canEditTask`, `canCreateTaskCategory`, `canAccessAdmin`, `getAvailableCategories`, `isUrgent`, `getVisibleTasks`, `getNavItemsForUser`.
- **Reducer**: check permessi in ogni case di mutazione task. Toast rosso se bloccato. `ADMIN_ONLY_ACTIONS` set nel wrapper reducer.
- **Viste**: tutte filtrano via `canViewTask(t, uid)`.
- **Sidebar/BottomNav**: `NAV_ITEMS` con campo `roles`, filtrate via `getNavItemsForUser`.
- **SwipeActions**: disabilitato se `!canEditTask(task, CURRENT_USER)`.
- **QuickAddTask**: categorie filtrate via `getAvailableCategories`.

### Multi-utente mock
- `CURRENT_USER` → `let` sincronizzato via `_syncCurrentUser`.
- `state.currentUserId` + action `SET_CURRENT_USER`.
- **`UserSwitcher`** in Topbar: dropdown con agenti non-pending.

## 📱 Swipe Actions (v0.7)

### Componente `SwipeActions`
Wrapper riusabile per task su mobile/tablet. Touch swipe orizzontale verso destra.

### Comportamento
- Soglia 40% larghezza card → "blocca aperto" (pannello 210px).
- Sotto soglia → torna chiuso con animazione spring.
- Tap fuori → chiude. Su desktop → trasparente.

### 3 azioni
| Bottone | Colore | Action |
|---|---|---|
| ✅ Fatto | `--success` verde | `MOVE_TASK` → `done` |
| 🗑 Cestino | `--danger` rosso | `DELETE_TASK` |
| ↪ Inoltra | `--gold` oro | dropdown agenti → `UPDATE_TASK` |

### Undo
- `state.lastAction` → snapshot pre-modifica.
- `UNDO_LAST_ACTION` → ripristina MOVE/DELETE/UPDATE.
- Toast con "↶ Annulla" (5s invece di 3s).
- Le azioni da swipe inviano `swipe: true` nella dispatch.

### Integrato in
- `KanbanCard` (mobile)
- `UnassignedQueue` (coda Dashboard)
- `PersonalQueue` (v0.8)
- `Calendar` → dettaglio giorno

## 📁 Struttura del file

Il codice è organizzato in **sezioni delimitate da commenti `─── TITOLO ───`**:

1. **FontLoader** — CSS globale + variables + keyframes + classi `.vd-*` responsive
2. **ViewportContext** — `ViewportProvider` + `useViewport()` hook
3. **MOCK DATA** — TEAM, CATEGORIES, PRIORITIES, STATUSES, INITIAL_TASKS, NOTIFICATIONS, CURRENT_USER, _syncCurrentUser
4. **TASK_TEMPLATES**
5. **AppContext & reducer** — stato globale, baseReducer, wrapper reducer con ADMIN_ONLY_ACTIONS + LOGGED_ACTIONS
6. **Utility functions** — getMember, getAssignableTeam, formatDate, formatTime, isOverdue, getDayKey, isActiveTask, getActiveTasks, getTrashedTasks
7. **Permessi (v0.8)** — getRoleType, canViewTask, canEditTask, canCreateTaskCategory, canAccessAdmin, getAvailableCategories, isUrgent, getVisibleTasks, isMyTask, isInGlobalQueue, getNavItemsForUser
8. **SwipeActions (v0.7)** — componente wrapper swipe con gesture + 3 bottoni + forward menu
9. **UI primitives** — Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast (con undo)
10. **AdvancedSearchPanel** — pannello ricerca topbar
11. **Layout** — Topbar, UserSwitcher (v0.8), NotificationsPanel, Sidebar (filtrato per ruolo), BottomNav (filtrato per ruolo)
12. **Bulk Task Creator** — modale principale + 4 tab
13. **AIDayPlanner**
14. **NoticeBoard** + **NoticeEditorModal**
15. **PersonalQueue (v0.8)** — coda personale con swipe
16. **UrgentOthersQueue (v0.8)** — urgenti altrui read-only con 💬 contatta
17. **UnassignedQueue** — coda globale
18. **Views** — Dashboard (4 tab code + QueueTab + OverdueQueue), CalendarPlanner (mese+settimana unificato), Team
19. **Modali** — QuickAddTask (categorie filtrate per ruolo), TaskSlideOver
20. **Chat module** — ChatContext, ChatPanel (con intent), ConversationList, ConversationView (con initialInput), NewConversationView, Message, VoiceRecorder, VoicePlayer, ReactionsPopover
21. **FAB**
22. **Trash** (vista Cestino)
23. **AdminView** + 5 tab Admin + stili condivisi
24. **ROOT APP** — `VoyageDesk` (export default, wrappa in `ViewportProvider`) → `VoyageDeskInner` (con chatIntent, openChatTo)

## 🧩 Modelli Dati

### Task
```js
{
  id: "t1",
  title: string,
  category: "booking"|"hotel"|"visa"|"client"|"payment"|"marketing"|"supplier"|"admin"|"itinerary"|"transfer",
  priority: "critical"|"high"|"medium"|"low",
  status: "todo"|"inprogress"|"awaiting_client"|"awaiting_supplier"|"done",
  assignees: ["marco","sofia",...],  // array di ID membri; può essere [] (coda globale)
  client: string|null,
  dueDate: ISO string|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO string|null  // soft-delete (v0.4)
}
```

### Team member
```js
{
  id, name, role,
  avatar (2-char or emoji),
  color (hex),
  capacity (numero task max),
  active: boolean,
  pending: boolean,
  email: string|undefined,      // v0.9
  phone: string|undefined,      // v0.9
  photoUrl: string|undefined    // base64 foto profilo, v0.9
}
```

### Categoria (mutabile via Admin)
```js
{ icon, label, color, bg }
```

### Conversazione chat
```js
{
  id: "c1",
  type: "direct"|"group",
  participants: [ids],
  name: string|null,
  icon: string,
  pinned: boolean
}
```

### Messaggio chat
```js
{
  id, sender (memberId), time (ISO),
  type: "text"|"voice"|"file",
  text: string,         // se text
  duration: number,     // se voice
  waveform: [0..1,...], // se voice (30 valori)
  fileName, fileSize, fileType, // se file
  replyTo: msgId|undefined,
  reactions: { "👍": [userId,...] },
  readBy: [userId,...]
}
```

### Notice (bacheca)
```js
{ id, text (max 500 char), color, author (memberId), createdAt (ISO), pinned: boolean }
```

## 🔑 Reducer Actions

### View/UI
`SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`

### Task CRUD
`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

### Cestino
`DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

### Admin Team (⚠️ ADMIN_ONLY)
`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

### Admin Categorie (⚠️ ADMIN_ONLY)
`ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

### Admin Backup/Settings (⚠️ ADMIN_ONLY)
`SET_AGENCY_NAME`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

### Bacheca avvisi
`ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

### Undo (v0.7)
`UNDO_LAST_ACTION`

### Utente (v0.8)
`SET_CURRENT_USER`

### Profilo personale (v0.9 — non admin-only)
`UPDATE_OWN_PROFILE`

> **Wrapper reducer**: blocca `ADMIN_ONLY_ACTIONS` per non-admin. Intercetta `LOGGED_ACTIONS` per activity log (max 100).

## ⚠️ Vincoli importanti

1. **Single-file artifact**: tutto deve restare in `VoyageDesk.jsx` come default export.
2. **NO localStorage/sessionStorage**: i dati restano in memoria (vincolo Claude.ai Artifacts).
3. **NO librerie esterne oltre a React core**, **eccezione**: `xlsx` (SheetJS) per import/export.
4. **Responsive completo** (v0.6): target da 320px in su.
5. **Accessibilità**: HTML semantico, ARIA labels dove possibile.
6. **Permessi**: ogni nuova feature che tocca task o viste deve rispettare la matrice permessi (v0.8). Usare gli helper `canViewTask`/`canEditTask`. Ogni nuova voce nav in `NAV_ITEMS` deve avere il campo `roles`.

## 🔄 Pattern usati frequentemente

### Edit di stato (immutable)
```js
setMessages(prev => ({ ...prev, [conv.id]: [...(prev[conv.id] || []), newMsg] }));
```

### Componenti con hover state
`onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`.

### Animazioni d'ingresso
`className="slide-up"` o `"fade-in"` o `"slide-right"` (definite in FontLoader).

### Responsive condizionale
```js
const { isMobile, isDesktop } = useViewport();
style={{ width: isMobile ? "100vw" : 480, padding: isMobile ? 16 : 28 }}
```

### Sincronizzazione globale (TEAM/CATEGORIES/CURRENT_USER)
Il reducer aggiorna sia `state.xxx` sia i riferimenti globali `TEAM`/`CATEGORIES`/`CURRENT_USER` in-place via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`.

### Dispatch con flag swipe (v0.7)
```js
dispatch({ type: "MOVE_TASK", payload: { taskId: task.id, newStatus: "done" }, swipe: true });
// Il flag `swipe: true` attiva: toast undoable, salvataggio lastAction per undo.
```

### Apertura chat con intent (v0.8)
```js
openChatTo({ toUser: owner.id, taskLink: task.id });
// Apre ChatPanel → trova/crea conversazione diretta → precompila messaggio con titolo+data del task.
```
