# CLAUDE.md — Istruzioni per Claude Code

> Gli altri documenti in `docs/` sono indicizzati in [`INDEX.md`](INDEX.md),
> che distingue ciò che è vigente dai ~40 handoff di sessione, che sono un log
> storico e non una specifica.

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
- **Permessi**: ogni nuova feature che tocca task o viste deve usare `canViewTask`/`canEditTask` da `src/lib/permissions.js` (funzioni PURE, primo argomento `team`). Nei componenti NON si importano direttamente: si passa da `useAppData()` (`src/state/AppDataContext.jsx`), che le espone già legate a `state.team` — `const { canEditTask, categories, getMember } = useAppData()`. Ogni nuova voce nav in `NAV_ITEMS` deve avere il campo `roles`
- **Reducer puro**: `src/state/reducer.js` non deve avere effetti collaterali — niente chiamate a `setTeam`/`setCategories`/`setCurrentUser`, niente scritture fuori dallo state. La fonte di verità è `state.team` / `state.categories` / `state.currentUserId`. Blindato da `src/test/reducerPurity.test.js`
- **Stili**: z-index, bottoni e campi vengono da `src/styles/tokens.js`. ⛔ Mai un `zIndex` numerico inline: la scala è nominata e ordinata lì (erano 23 valori magici da 1 a 9999, la causa dei bug di sovrapposizione). `admin/adminStyles.js` e `modals/bulk/bulkStyles.js` derivano dai token e dichiarano i propri delta
- **Modali**: un modale centrato usa `components/ui/Modal.jsx`, che porta con sé portale (obbligatorio: un antenato con `transform` rompe il `position: fixed`), overlay, chiusura con Esc, blocco dello scroll di fondo e `role="dialog"`. ⛔ Non ricostruire l'overlay a mano
- **Un file, una responsabilità**: sopra le 500 righe si spezza, e mai un secondo componente "solo per ora" in un file che ne ha già uno. Entrambe le metà sono misurate in `eslint.config.js` (blank/comment esclusi): `max-lines` è un **errore**, a zero violazioni, con un'unica deroga dichiarata (`src/state/reducer.js`, tetto 550, perché è UNO switch e spezzarlo distribuirebbe su più file le transizioni di una sola macchina a stati); `react/no-multi-comp` è un **warning**, con 19 casi aperti in 12 file (Sidebar/BottomNav, TaskCard/TaskRow, i tre chip di QueueShell…), tutti in file ampiamente sotto soglia. La differenza fra i due non è di severità: max-lines è un errore *perché* l'arretrato è chiuso — un warning con un arretrato aperto è rumore che si impara a saltare, ed è successo davvero (sei file sono rimasti sopra soglia per intere sessioni). Nei test la regola è spenta: una sonda usa-e-getta non è un secondo componente. `VoyageDesk.jsx` è un ORCHESTRATORE — compone hook e viste, non implementa: idratazione/notifiche/presenza/push/chat vivono in `src/hooks/use*.js`
- **Modulo Liste viaggio**: ha il proprio stato (non passa dal reducer) ma la STESSA architettura dati del core — `useListeData` usa `useDebouncedTableSubscription` come tutto il resto. Il core NON importa `lib/listeApi.js`: la porta d'ingresso è `components/liste/listeModuleApi.js`, che espone domande (`listeRicercabili`, `conteggioListePerCliente`) e non query
- **Scritture delle Liste**: si dichiarano in `components/liste/listePersistence.js` (`LISTE_WRITES`: `run` / `successMsg` / `guard` / `mapError`) e si eseguono con `useListeWrite(dispatch)` → `esegui("nomeOperazione", …args)`, che ritorna `{ ok, data }`. Il registry nomina OPERAZIONI DI DOMINIO, non RPC: `riapriLista`/`esaurisciLista` sono due entry sulla stessa `cambiaStato`, perché hanno due messaggi diversi. ⛔ Niente update ottimistico né rollback qui, a differenza del core, ed è voluto: ogni scrittura è una RPC transazionale seguita da un reload, il modulo non mostra mai uno stato che il database non abbia confermato, e introdurre un livello ottimistico creerebbe la classe di disallineamenti che il registry del core esiste per chiudere. `resetTotale` porta il proprio `guard` admin (prima l'unico gate lato client era il bottone nascosto) e la costante `CONFERMA_RESET`, che è metà del contratto della RPC. `no-restricted-properties` vieta i metodi di scrittura di `ListeAPI` dentro `src/components/liste/**` — le letture restano dirette
- **Scritture della chat**: la chat non passa dal reducer. Ogni scrittura ha un comando esplicito in `src/components/chat/chatCommands.js` (`createConversation` / `sendMessage` / `setMessagePinned` / `markConversationRead` / `toggleReaction` / `removeConversation` / `updateConversation`). ⛔ **Mai chiamate di rete dentro l'updater di `setState`**: `setConversations`/`setMessages` sono normali setter React e i loro updater devono restare PURI — React 18 li invoca due volte in StrictMode e può rieseguirli in Concurrent. Prima la persistenza era dedotta differenziando prev/next dentro l'updater, e creare una conversazione faceva due INSERT in sviluppo. Blindato da `src/test/chatCommands.test.js`
- **Persistenza**: una action che deve scrivere su Supabase si dichiara in `src/state/persistence.js` (`guard` / `normalize` / `persist` / `rollback` / `mapError`), NON aggiungendo un ramo a un `switch`. L'orchestrazione è in `src/hooks/useSyncedDispatch.js` e non va toccata. Se l'action ha una regola di permesso, il `guard` deve usare le stesse funzioni di `lib/permissions.js` del reducer: `src/test/persistenceGuards.test.js` verifica che i due verdetti coincidano e fallisce se divergono. Lo stesso file verifica anche la COMPLETEZZA del registry: legge i `case` dal sorgente del reducer (non da una lista scritta a mano, che sarebbe una terza copia da tenere allineata) e pretende che ogni azione o abbia la sua entry o sia dichiarata in uno di quattro elenchi motivati — solo-client, idratazione, compensazione, e un registro di lacune note. Aggiungere un case senza entry non produce un errore visibile ma una UI che si aggiorna su un database che non riceve niente: da oggi il test si ferma. Nel registro delle lacune stanno oggi i template di messaggio, le reazioni agli avvisi e il ramo legacy "agente senza account" di `ADD_TEAM_MEMBER`: vivono solo in memoria e al reload spariscono, e non hanno un endpoint a cui appoggiarsi — manca il data layer, non la entry
- **⛔ Un solo percorso di scrittura**: dal corpo di un componente non si chiama il data layer per mutare un'entità che vive nello state. Il registry è l'unico punto in cui esistono insieme doppio controllo di permesso, rollback dello stato ottimistico e tag `origin_client` (che fa scartare l'eco realtime della propria scrittura); una chiamata diretta non ne ha nessuno dei tre, e quando fallisce lascia l'utente davanti a un dato che il database non ha. Non è teorico: `ProfileEditor` ha persistito da sé per diverse versioni — dispatch ottimistico, due `await UsersAPI` a mano, nessun rollback e `onClose()` incondizionato — e un salvataggio rifiutato chiudeva la modale mostrando il profilo aggiornato. Ora è la entry `UPDATE_OWN_PROFILE`. Il confine è misurato da `no-restricted-imports` + `no-restricted-properties` in `eslint.config.js`, scoped a `src/components/**`: restano diretti storage ed Edge Function (`TaskFiles`, `Messages`, `Users.uploadAvatar`/`getAvatarUrl`, `Users.invite`), che non hanno un corrispettivo nello state. Le LETTURE per l'idratazione stanno in `src/hooks/`, fuori dalla restrizione
- **Card di un task**: non riscrivere il markup a mano. `TaskCard` (card verticale) e `TaskRow` (riga di elenco) stanno in `src/components/tasks/TaskCard.jsx` e coprono code, archivio, calendario e CRM. Le differenze fra call site passano dagli slot (`badges`, `subheader`, `meta`, `footer`) e dai parametri di bordo/accento; nel componente sta solo lo scheletro. Entrambi sono `memo`: le callback passate come prop (`onOpen`) vanno da `useCallback`, altrimenti la memoizzazione non serve a niente
- **File grandi**: sopra le 500 righe si spezza — ora è un errore di lint, non un warning. I casi già fatti seguono tutti lo stesso criterio: un file per componente, gli helper puri in `lib/` o in un `*.js` accanto. Oltre a `chat/`, `modals/bulk/` e `tasks/TaskCard`: `liste/modals/` (i 13 modali che stavano in `listeModals.jsx`), i quattro editor in linea di `ListaDetail`, `calendar/` (`calendarIcs.js` / `calendarRecurrence.js` / `calendarLayout.js` per la matematica pura, `CalendarDayGrid` / `CalendarWeekGrid` per le due griglie orarie che erano IIFE anonime dentro il return), `tasks/TaskAttachments.jsx` + `taskHistory.js`, `modals/CropModal.jsx`
- **Le viste NON ricevono `state`**: leggono i task da `useTasks()` (`src/state/TasksContext.jsx`), i clienti da `useClients()` (`src/state/ClientsContext.jsx`), team/categorie/utente da `useAppData()`, e si fanno passare come prop solo le fette piccole che consumano davvero (`notices`, `dashboardQueue`, `listeTarget`). `state` è un oggetto NUOVO dopo qualunque azione — un toast che compare, lo stesso toast che sparisce dopo tre secondi, un carattere digitato nella ricerca globale: finché era una prop, ognuna di quelle azioni ri-renderizzava per intero la vista attiva, ed era anche il motivo per cui il `memo` di TaskCard/TaskRow non produceva alcun effetto. ⛔ **Il provider da solo non basta**: la vista va anche avvolta in `memo`, altrimenti si ri-renderizza comunque insieme al genitore. E il bail-out regge solo se sono stabili SIA le prop SIA i contesti consumati — un `categories={{}}` o un `notices={[]}` scritti inline lo annullano (nell'app vengono tutti dallo state del reducer, che sostituisce un riferimento solo quando quel dato cambia). Misurato da `src/test/domainProviders.test.jsx`, che conta i render della Dashboard: è una proprietà che si rompe in silenzio, senza che nessun test funzionale diventi rosso. Migrate: Dashboard, CalendarPlanner, ClientiView, Archive, Trash, ListeViaggio. Restano su `state` la Topbar (ha la ricerca: deve ri-renderizzare) e AdminView
- **Niente stato globale mutabile**: `src/state/appGlobals.js` (TEAM/CATEGORIES/CURRENT_USER + `syncLegacyGlobals`) è stato ELIMINATO. Team, categorie e utente corrente vivono solo nello state del reducer e raggiungono i componenti da `<AppDataProvider>` (montato in `VoyageDeskInner`) via `useAppData()`. Una regola `no-restricted-imports` in `eslint.config.js` fa fallire il lint se il modulo riappare. Fuori dai componenti (reducer, `persistence.js`, script) si usano le funzioni pure di `src/lib/permissions.js` passando `state.team`
- **Test di componenti**: chi usa `useAppData()` va montato dentro il provider. Helper in `src/test/helpers/appData.jsx`: `renderWithAppData(ui, { team, categories, currentUserId })`, oppure `DEMO_APP_CTX` per il contesto demo (INITIAL_TEAM/INITIAL_CATEGORIES/"marco"). L'hook SOLLEVA fuori dal provider: è voluto, un fallback silenzioso ai mock ricreerebbe il valore globale implicito appena rimosso

### Cosa NON fare
- Non usare localStorage/sessionStorage (vincolo artifact, da rimuovere post-migrazione Vite)
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare drag&drop su mobile (usare SwipeActions)
- ⛔ Non lanciare `supabase db push`: la storia delle migrazioni nel repo non
  coincide con `schema_migrations` sul database e il push ne rigiocherebbe 56
  già applicate. Procedura corretta in `docs/MIGRAZIONI_SUPABASE.md`
- Committare una migrazione non significa averla applicata: le due cose sono
  separate su questo progetto, e vanno verificate separatamente.
  `npm run verifica:rpc` confronta le RPC chiamate dal codice con quelle
  presenti sul database (gira anche ogni giorno in CI)

## Palette colori

```css
--navy: #0F2044;        --navy-light: #1a3060;     --navy-dark: #08152d;
--sky: #D0EEF9;         /* shell: topbar, sidebar, bottom-nav (celeste tenue) */
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
  deletedAt: ISO|null,       // soft-delete
  completedAt: ISO|null      // data completamento — gestita dal DB (trigger set_task_completed_at), sola lettura lato app
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

> ⚠️ `clients` è **condivisa con il modulo Liste viaggio**: `liste_viaggio.client_id`
> è una FK (il TITOLARE) e le liste mostrano `clients.name` come intestazione;
> `lista_beneficiari` aggiunge zero o più COINTESTATARI (stessa FK, es. marito
> e moglie), ciascuno con una propria scheda. `tasks.client_id` è invece una
> copia testuale del nome (nessun vincolo). Rinominare un cliente cambia tutte
> le sue liste e lascia indietro i task; eliminarlo è rifiutato dalla FK se ha
> liste — come titolare o cointestatario — cestino compreso. Regole e
> protezioni in `docs/ANAGRAFICA_E_LISTE.md`.

> ⛔ **Fornitore** e **Pratica di viaggio** (Dossier) sono stati **RIMOSSI DEFINITIVAMENTE** in sessione 24. Non reintrodurli.

### Team member
```js
{
  id, name, role, avatar, color, capacity,
  active: boolean, pending: boolean,
  email: string|undefined, phone: string|undefined,
  photoUrl: string|undefined   // URL pubblica del bucket `avatars` (Users.uploadAvatar), o null
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
// src/lib/permissions.js — funzioni pure, `team` esplicito
getRoleType(team, userId)        — "admin"|"manager"|"agent"|"driver"
isAdmin(team, userId), isDriver(team, userId)
canViewTask(team, task, userId)
canEditTask(team, task, userId)
canCreateTaskCategory(team, cat, userId)
canAccessAdmin(team, userId)
canAccessListe(team, userId)     — modulo Liste: rispecchia can_liste() sul DB
                                   (admin|manager|agent AND active). NON usare
                                   `!isDriver(...)`: erano cinque formulazioni
                                   della stessa regola, divergenti sui ruoli
                                   fuori enum e sugli utenti disattivati
getAvailableCategories(categories, team, userId)
getVisibleTasks(team, tasks, userId)
// src/state/AppDataContext.jsx — le stesse regole, legate allo state React.
// Firme identiche a quelle di lib/permissions.js ma SENZA il primo argomento
// `team`: lo lega il provider. È l'unico modo di accedervi dai componenti.
useTasks()                       — state.tasks (src/state/TasksContext.jsx)
useClients()                     — state.clients (src/state/ClientsContext.jsx)
useAppData()                     — { team, categories, currentUserId,
                                     getMember, getAssignableTeam,
                                     getRoleType, isAdmin, isDriver, isJuniorAgent, isSeniorAgent,
                                     canViewTask, canEditTask, canCreateTaskCategory,
                                     canAccessAdmin, canAccessListe,
                                     getVisibleTasks, getAvailableCategories }
isMyTask(task, userId)
isInGlobalQueue(task)
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
    │   ├── views/Trash
    │   └── admin/AdminView (5 tab locale, stili da adminStyles.js)
    ├── tasks/TaskSlideOver
    ├── tasks/TaskCard (TaskCard + TaskRow condivisi da code/archivio/calendario/CRM)
    ├── chat/ChatPanel (orchestratore; il resto in chat/*.js + chat/message/)
    ├── modals/QuickAddTask
    ├── modals/BulkTaskCreator (shell; le 4 tab in modals/bulk/)
    ├── shell/FAB
    └── ui/Toast
```

Tutti i componenti sono **moduli separati** in `src/components/`; helper e sub-componenti rimangono **module-local** (non esportati).

## Roadmap prossimi step (Blocchi Operatività 100%)

> ⛔ **Fase 1 — Pratiche & Fornitori RIMOSSI** (sessione 24, PR #63). Non ripristinare.
> ⛔ **Fase 3 Business RIMOSSA** (sessione 23). Non ripristinare.
> ✅ **Block 1 — Authentication & Onboarding COMPLETO** (sessione 27). Password recovery, signup, approval system, security hardening.

### ✅ Block 1 — Autenticazione & Onboarding (COMPLETO — sessione 27)
- [x] Password recovery (email magic link) ✅
- [x] Self-service signup (form + validation) ✅
- [x] Team member approval (pending gate) ✅
- [x] Approval persistence fix (DB write + dispatch) ✅
- [x] Security hardening (trigger dedup + RLS) ✅

**Deliverables**: `UpdatePasswordScreen.jsx`, 3-mode `LoginScreen.jsx`, `PendingScreen`, `Users.approve()` API, dispatch wrappers, migration `20260619_security_dedupe_signup_trigger.sql`.

### 🟡 Block 2 — RLS Hardening for Pending Users (DEFERRED — optional)
- [ ] Pending user read access isolation
- [ ] Email confirmation requirement
- [ ] Approval notification to admin

**Why deferred**: No real users yet; safer when live data exists.

### ✅ Block 3 — Email Confirmation & Admin Controls (COMPLETO — sessione 28)
- [x] Approval notification (→admin): trigger `notify_user_pending` + notifica `user_pending` ✅
- [x] Admin invite via email: Edge Function `invite-user` + `Users.invite()` + campo email in `AddTeamMemberModal` ✅
- [x] Email confirmation: frontend pronto (`email_not_confirmed` gestito) — toggle dashboard manuale (Supabase Auth settings) ✅
- [ ] Resend confirmation email UI (deferred)
- [ ] Admin **bulk** invite (deferred)
- [ ] Leaked password protection (deferred)

### ✅ Block 4 — Account Management (COMPLETO — sessione 33)
- [x] Cambia password in-app (`ProfileEditor` — sezione collassabile, min 8 char, conferma) ✅
- [x] Elimina account self-service (typed confirmation `ELIMINA`, ban 87600h, preserva chat) ✅
- [x] Presenza + last-seen in AdminView (dot colorato + "ultimo accesso X min fa") ✅
- [x] Edge Function `delete-account` (v2, verify_jwt, ban + active=false) ✅

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
2. **Permessi e stato condiviso**: fonte di verità UNICA, lo state React (`state.team`, `state.categories`, `state.currentUserId`). Le regole sono funzioni pure in `src/lib/permissions.js`; i componenti vi accedono da `useAppData()` (`src/state/AppDataContext.jsx`), il cui provider è alimentato dallo stesso state del reducer. Lo specchio mutabile `state/appGlobals.js` — tre `let` di modulo allineati da `syncLegacyGlobals()` **nel corpo del render** di `VoyageDeskInner` — è stato eliminato: leggeva fuori dal ciclo di render (un componente `memo` poteva mostrare permessi vecchi) e scrivere stato esterno durante il render non è sicuro sotto Concurrent Rendering. Con lo shim è sparito anche `hooks/usePermissions.js`, che ne era il sostituto previsto ma non aveva mai acquisito un solo consumatore: tenerlo accanto a `useAppData()` avrebbe lasciato due modi paralleli di fare la stessa cosa.
3. **Nessuna chiamata a modelli AI**: la chat è interna al team e passa da Supabase (tabelle `conversations`/`messages` + realtime). Le vecchie note su `fetch` verso `api.anthropic.com` si riferivano a codice non più presente.
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
│   ├── bulkImport.js        normalizzazione valori CSV/Excel + auto-mappatura colonne (puro)
│   ├── clientId.js          UUID per tab (origin-tagging realtime)
│   ├── mappers.js           DB ↔ camelCase (fromDbClient/toDbClient, fromDbNotification; Supplier/Dossier RIMOSSI sessione 24)
│   ├── supabase.js
│   ├── taskConstants.js     PRIORITIES/STATUSES/STATUS_*/NOTICE_COLORS/TASK_TEMPLATES (Phase 2a)
│   ├── taskUtils.js         formatDate/formatTime/isUrgent/isMyTask/... (Phase 2a)
│   ├── xlsx.js              loadXLSX() lazy loader (Phase 2f)
│   └── mentions.js          findMentions() — parser @menzioni (caveat #2, gemello DB)
├── hooks/                   (sessione 18)
│   ├── useDebouncedTableSubscription.js   idratazione+subscribe realtime debounced (caveat #10)
│   └── useSyncedDispatch.js               reducer + persistenza Supabase (orchestratore)
├── state/                   (Phase 2b–2d)
│   ├── mockData.js          INITIAL_TEAM/CATEGORIES/TASKS/NOTICES + MOCK_NOTIFICATIONS
│   ├── AppDataContext.jsx   team/categorie/utente + permessi per i componenti (useAppData)
│   ├── persistence.js       registry action → operazione Supabase (guard/normalize/persist/rollback)
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
│   │   ├── BulkTaskCreator.jsx  shell: scelta modalità + tab bar + guardia "non salvato"
│   │   ├── NoticeEditorModal.jsx
│   │   ├── QuickAddTask.jsx
│   │   ├── AddTeamMemberModal.jsx
│   │   └── AddCategoryModal.jsx
│   ├── modals/bulk/
│   │   ├── ManualTab.jsx / DuplicateTab.jsx / ImportTab.jsx / TemplateTab.jsx
│   │   ├── RowAttachments.jsx  allegati di riga (upload dopo la persistenza)
│   │   └── bulkStyles.js       stili condivisi dalle 4 tab
│   ├── dashboard/
│   │   ├── Dashboard.jsx (esporta Dashboard; contiene 4 Queue + QueueTab locali)
│   │   └── NoticeBoard.jsx
│   ├── calendar/
│   │   └── CalendarPlanner.jsx (contiene helper iCal locali)
│   ├── chat/
│   │   ├── ChatPanel.jsx        orchestratore: navigazione, ponte Supabase, context
│   │   ├── ConversationView.jsx / ConversationList.jsx / NewConversationView.jsx
│   │   ├── MessageComposer.jsx  allegati, template, microfono, invio
│   │   ├── ForwardPicker.jsx
│   │   ├── chatContext.js       ChatContext + useChatContext
│   │   ├── chatPresence.js      record utente → stato di presenza
│   │   ├── chatFormat.js        orari, nome conv., ultimo messaggio, getUnreadCount
│   │   ├── chatReactions.js     emoji + reazioni recenti (localStorage + DB)
│   │   ├── chatFiles.js         limite upload, classificazione allegati
│   │   ├── chatReducers.js      convViewReducer + chatPanelReducer
│   ├── chatCommands.js      scritture chat: stato locale + persistenza (comandi espliciti)
│   │   └── message/             ChatMessage, MessageTextContent, ReactionPicker,
│   │                            VoicePlayer, VoiceRecorder
│   ├── tasks/
│   │   ├── TaskSlideOver.jsx
│   │   └── TaskCard.jsx         TaskCard (card) + TaskRow (riga), entrambi memo
│   ├── admin/
│   │   ├── AdminView.jsx (contiene 5 tab locali)
│   │   └── adminStyles.js (13 costanti stile consolidate)
│   ├── clients/
│   │   └── ClientiView.jsx              ← anagrafica clienti (mantenuta)
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

Le notifiche nascono **solo da trigger DB / funzioni server-side** (RLS vieta insert client) — per nuove notifiche serve un trigger o una funzione `SECURITY DEFINER` schedulata via pg_cron. Tipi notifica attivi (`NOTIF_ICONS`/`notifTitle` in `Topbar.jsx`): `task_assigned`, `task_due`, `comment`, `mention`, `queue_stale`, `user_pending` (Block 3 — trigger `notify_user_pending`). ~~`dossier_status`~~ e ~~`dossier_departure`~~ **RIMOSSI** (sessione 24).

Vedi `docs/HANDOFF_SESSION_2026-06-21_v33_block4_account_management.md` (handoff attivo) per lo stato corrente dopo sessione 33 (Block 4: shell sky blue, presenza admin, cambio password in-app, eliminazione account self-service).
