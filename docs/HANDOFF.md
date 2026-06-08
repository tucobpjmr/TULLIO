# 📦 HANDOFF — VoyageDesk v0.9

Documento di passaggio di consegne per riprendere lo sviluppo in una nuova sessione (Claude.ai, Claude Code, o IDE).

> **Branch corrente**: `claude/endorf-review-next-step-Gu3dm` · **PR**: #11 (draft) · **Repo**: `tucobpjmr/TULLIO`

---

## 🎯 Cos'è VoyageDesk

Gestionale single-file React per agenzie viaggi / tour operator. Lingua UI: italiano. Stato: progetto Vite reale (`src/VoyageDesk.jsx`, ~9210 righe), deploy automatico su Vercel.

**URL preview**: `https://tullio-git-claude-endorf-review-next-st-82dfc2-tooco-s-projects.vercel.app`

---

## 📊 Stato attuale (v0.9)

### ✅ Fase 1 — Modello dati completo
- **Clienti** (CRM base): 3 tipi (privato/azienda/gruppo), CRUD, pannello dettaglio con task associati.
- **Fornitori**: 6 tipologie (hotel/vettore/tour operator/transfer/assicurazioni/altro), CRUD.
- **Pratiche di viaggio**: numerazione `PR-YYYY-NNN`, 5 stati (Bozza/Confermata/In corso/Completata/Annullata), riepilogo economico (budget/ricavi/costi/margine), timeline storico stati, collegamento task + fornitori.

### ✅ Fase 2 — Operatività quotidiana
- **Notifiche reali**: array dinamico in `state.notifications`. Iniettate da `ADD_TASK` (assigned), `ADD_COMMENT` (comment), `APPROVE_TEAM_MEMBER` (pending). Generate iniziali da task scaduti, coda globale, agenti pending. Tipi: `overdue`/`assigned`/`comment`/`pending`/`queue`/`pratica`. NotificationsPanel con 6 filtri, "segna tutte lette", dismiss singolo/bulk, click-to-navigate.
- **Badge nav**: pallini rossi su Sidebar e BottomNav per Dashboard (coda globale) e Admin (agenti pending) via `getNavBadgeCount`.
- **Calendario avanzato**: tre viste (📅 Mese, 📆 Settimana, 🗓️ Giorno). Vista Giorno con timeline oraria 08:00→20:00, multi-assignee avatar, sezione "fuori orario". Drill-down: click sull'header giorno in vista Settimana → apre vista Giorno. Export iCal mock (RFC 5545) per la vista corrente.
- **Estensioni chat**:
  - Pattern `[task:ID]` parsato → chip inline cliccabile + rich preview card (se messaggio breve con un solo link).
  - Picker task nel composer (bottone 📋).
  - Ricerca full-text nei messaggi con highlight `<mark>`.
  - Presence states mock: online/busy/offline con colori distinti.
- **Impostazioni agenzia** (nuova tab Admin "⚙️ Impostazioni"):
  - Dati agenzia (nome, email, telefono, timezone, indirizzo).
  - Template messaggi (5 pre-caricati, CRUD): variabili `{{cliente}}`, `{{data}}`, `{{agenzia}}` risolte runtime.
  - Preferenze UI: densità (comfortable/compact), vista iniziale, toggle confirmDestructive + showWelcomeBanner.
  - Bottone ⚡ nel composer chat per inserire template.

### Permessi (v0.8)
Matrice ruoli rispettata in ogni nuova feature: Admin/Manager/Agent/Driver. Helper centralizzati in UTILS. Driver vede solo categoria `transfer`, niente coda globale, niente Pratiche/Clienti/Fornitori.

---

## 🛠️ Struttura del codice

### File principale: `src/VoyageDesk.jsx` (~9210 righe)

Sezioni delimitate da commenti `// ─── TITOLO ───`:

1. **FontLoader** — CSS globale + CSS variables + keyframes + classi `.vd-*` responsive
2. **ViewportContext** — `ViewportProvider`, hook `useViewport()`
3. **MOCK DATA** — TEAM, CATEGORIES, PRIORITIES, STATUSES, INITIAL_TASKS, INITIAL_CLIENTS, INITIAL_SUPPLIERS, INITIAL_PRATICHE, INITIAL_NOTICES, INITIAL_MESSAGE_TEMPLATES, DEFAULT_UI_PREFERENCES, CURRENT_USER
4. **TASK_TEMPLATES**
5. **AppContext & reducer** — `initialState`, `baseReducer`, wrapper `reducer` con ADMIN_ONLY_ACTIONS + LOGGED_ACTIONS
6. **Utility functions** — `getMember`, `formatDate`, `isOverdue`, `getActiveTasks`, ecc.
7. **Permessi (v0.8)** — `getRoleType`, `canViewTask`, `canEditTask`, `getNavItemsForUser`, ecc.
8. **SwipeActions (v0.7)**
9. **UI primitives** — Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast
10. **AdvancedSearchPanel**
11. **Layout** — Topbar, UserSwitcher, NotificationsPanel, Sidebar, BottomNav, `getNavBadgeCount`
12. **Bulk Task Creator** — 4 tab
13. **AIDayPlanner**
14. **NoticeBoard** + NoticeEditorModal
15. **PersonalQueue / UrgentOthersQueue / UnassignedQueue**
16. **Views** — Dashboard, CalendarPlanner (mese/settimana/giorno + iCal), Team
17. **Modali** — QuickAddTask, TaskSlideOver
18. **Chat module** — ChatContext, ChatPanel, ConversationList, ConversationView, NewConversationView, ChatMessage, VoiceRecorder, VoicePlayer, ReactionPicker; `parseMessageText`, `TaskLinkChip`, `RenderedMessageText`, `PRESENCE_STATES`, `getPresence`
19. **FAB**
20. **Trash**
21. **AdminView** + 6 tab (Team, **Impostazioni**, Import/Export, Sistema, Categorie, Log)
22. **AdminSettingsTab** (v0.9): dati agenzia, template messaggi CRUD, preferenze UI
23. **Anagrafica Clienti / Fornitori / Pratiche** (v0.9)
24. **ROOT APP** — `VoyageDesk` (export default, wrappa `ViewportProvider`) → `VoyageDeskInner`

### File ausiliari (già scaffoldati per migrazione)
- `src/lib/supabase.js` — config Supabase client (non ancora collegato al reducer)
- `src/lib/auth/AuthContext.jsx` — context auth (non ancora collegato)
- `src/lib/api/` — API layer entità (non ancora collegato)
- `src/components/LoginScreen.jsx` — schermata login (non ancora collegata)
- `vite.config.js` — config Vite standard
- `index.html` — entry point

> **Nota**: il flusso di auth/persistenza è stato scaffoldato ma non è collegato al reducer attuale. Il prossimo grosso step (Fase 4) lo wira definitivamente.

---

## 🧬 Modelli dati chiave

```js
Task         { id, title, category, priority, status, assignees[], client, dueDate, estimatedHours, description, comments[], deletedAt }
Client       { id, name, type: "privato"|"azienda"|"gruppo", email, phone, address, notes, createdAt }
Supplier     { id, name, type: "hotel"|"vettore"|"tour_operator"|"transfer"|"assicurazioni"|"altro", email, phone, address, website, notes, createdAt }
Pratica      { id: "PR-YYYY-NNN", title, clientId, status, destination, startDate, endDate, pax, budget, revenue, cost, taskIds[], supplierIds[], notes, createdAt, createdBy, statusHistory[] }
Notification { id, type, title, taskId?, memberId?, time: ISO, read: boolean }
MessageTpl   { id, name, category, body, createdAt }  // body con {{cliente}} {{data}} {{agenzia}}
UIPrefs      { density: "comfortable"|"compact", defaultView, confirmDestructive, showWelcomeBanner }
TeamMember   { id, name, role, avatar, color, capacity, active, pending, email?, phone?, photoUrl? }
Notice       { id, text, color, author, createdAt, pinned }
Conversation { id, type: "direct"|"group", participants[], name?, icon?, pinned? }
Message      { id, sender, time, type: "text"|"voice"|"file", text?, duration?, waveform?, fileName?, fileSize?, fileType?, replyTo?, reactions, readBy[] }
```

---

## 🔑 Reducer actions complete

```
View/UI:    SET_VIEW, SET_SELECTED_TASK, CLEAR_TOAST, SET_SEARCH, TOGGLE_NOTIF, SET_FILTER, TOGGLE_SIDEBAR
Task CRUD:  ADD_TASK, ADD_TASKS_BULK, UPDATE_TASK, MOVE_TASK, ADD_COMMENT
Cestino:    DELETE_TASK, RESTORE_TASK, PURGE_TASK, EMPTY_TRASH
Profilo:    UPDATE_OWN_PROFILE  (non admin-only)
Notifiche:  MARK_NOTIF_READ, MARK_ALL_NOTIF_READ, DISMISS_NOTIF, DISMISS_READ_NOTIFS
Pratiche:   ADD_PRATICA, UPDATE_PRATICA, DELETE_PRATICA
Clienti:    ADD_CLIENT, UPDATE_CLIENT, DELETE_CLIENT
Fornitori:  ADD_SUPPLIER, UPDATE_SUPPLIER, DELETE_SUPPLIER
Bacheca:    ADD_NOTICE, UPDATE_NOTICE, DELETE_NOTICE, TOGGLE_PIN_NOTICE
Undo:       UNDO_LAST_ACTION
Utente:     SET_CURRENT_USER
Admin Team:       ADD/UPDATE/APPROVE/TOGGLE_ACTIVE/REMOVE_TEAM_MEMBER             (ADMIN_ONLY)
Admin Cat:        ADD/UPDATE/REMOVE_CATEGORY                                       (ADMIN_ONLY)
Admin Backup:     SET_AGENCY_NAME, RESTORE_BACKUP, CLEAR_ACTIVITY_LOG              (ADMIN_ONLY)
Admin Settings:   UPDATE_AGENCY_SETTINGS, ADD/UPDATE/DELETE_MESSAGE_TEMPLATE,
                  SET_UI_PREFERENCE, RESET_UI_PREFERENCES                          (ADMIN_ONLY)
```

Wrapper reducer blocca `ADMIN_ONLY_ACTIONS` per non-admin (toast rosso). `LOGGED_ACTIONS` registra nell'activityLog (max 100).

---

## ⚠️ Vincoli e regole d'oro

1. **Single-file artifact**: tutto in `src/VoyageDesk.jsx`. Non spezzare in moduli senza una decisione esplicita (richiede rifare gli import).
2. **CSS inline + variables** in `:root` dentro FontLoader. **NO Tailwind**, **NO librerie CSS esterne**.
3. **Dipendenze esterne**: solo `react`, `react-dom`, `xlsx` (SheetJS), `@supabase/supabase-js` (scaffold non ancora wired).
4. **Lingua UI**: italiano sempre.
5. **Permessi**: ogni nuova feature task/view deve usare `canViewTask`/`canEditTask`. Ogni nuova voce nav deve avere il campo `roles`.
6. **Immutabilità**: sempre spread, mai mutare.
7. **Hover**: pattern `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`.
8. **Responsive**: `useViewport()` in ogni componente che adatta layout.
9. **Categoria nuova `transfer` 🚐**: Driver vede solo questa.
10. **Sync globale** TEAM/CATEGORIES/CURRENT_USER via `_syncTeam`/`_syncCategories`/`_syncCurrentUser` — pattern ibrido in attesa di Context puro.
11. **Modulo finanziario eliminato** dalla roadmap. Le info economiche restano embedded nelle Pratiche (budget/ricavi/costi/margine) ma non c'è un modulo finanziario separato.

---

## 🚀 Prossimi step suggeriti (ordine di valore)

### 1. Persistenza dati (Fase 4) 🔴 — sblocca tutto
- Step 1: localStorage per `tasks`, `clients`, `suppliers`, `pratiche`, `notices`, `messageTemplates`, `uiPreferences`, `agencySettings`. Hook `useEffect` su state changes.
- Step 2: integrare Supabase (scaffolding già presente in `src/lib/supabase.js`). Tabelle 1:1 con i modelli dati.
- Step 3: gestione conflitti / sync offline.

### 2. Login vero & AuthContext (Fase 4) 🟡
- Scaffolding già presente in `src/lib/auth/` e `src/components/LoginScreen.jsx`.
- Sostituisce UserSwitcher mock con sessione reale Supabase auth.
- `CURRENT_USER` derivato da sessione invece di mutable let.

### 3. Report & Analytics avanzati (Fase 3) 🟡
- Estendere AdminStatsTab con: trend temporali (task completati/settimana), breakdown per agente/cliente/categoria, margini Pratiche.
- Export PDF (jsPDF? o stampa via CSS print).

### 4. Migliorie incrementali quick wins ⚪
- **Auto-move "In Corso"** al "Prendi in carico" (singolo cambio dispatch).
- **Filtro coda globale** per categoria/priorità (state.filters esiste già).
- **Modifica assegnatari da TaskSlideOver** (multiselect dropdown).
- **Indicatore read-only** sulle card urgenti altrui (bordo tratteggiato).
- **Coda Driver agenda giornaliera**: vista transfer-oriented.

### 5. Catalogo destinazioni (Fase 3) 🟡
- Galleria card con foto/destinazione/periodo migliore/prezzi indicativi.
- Collegabile a Pratiche in fase di creazione.

### 6. Dark mode ⚪
- CSS variables già pronte. Aggiungere theme switcher in Impostazioni UI.
- Salvare scelta in `uiPreferences.theme`.

### 7. Refactor multi-file ⚙️B 🟡 (quando file > 10k righe)
- Spezzare in: `components/`, `reducer/`, `utils/`, `mock-data/`, `styles/`.
- Poi TypeScript, poi Vitest.

---

## 🧪 Come testare localmente

```bash
npm install
npm run dev      # Vite dev server su localhost:5173
npm run build    # produce dist/ — usato per verificare sintassi
npm run preview  # serve la build
```

`npm run build` è la verifica più rapida che il file sia sintatticamente valido — la build fallisce con errore puntuale e numero di riga.

---

## 🎨 Design system

```css
--navy: #0F2044;         --navy-light: #1a3060;       --navy-dark: #08152d;
--gold: #D4A843;         --gold-light: #e8c46a;       --gold-dark: #b8902e;
--surface: #FAFAF7;      --surface2: #F0EEE8;         --surface3: #E8E5DC;
--success: #2D7A4F;      --warning: #C8832A;          --danger: #C0392B;
--text: #1A1A2E;         --text-muted: #6B6B80;       --text-light: #9999AA;
--border: #E0DDD5;
```

Font: Playfair Display (display, classe `.playfair`) + DM Sans (body, default).

Breakpoints: Mobile ≤ 640px, Tablet 641–1024px, Desktop > 1024px.

---

## 📞 Convenzioni di comunicazione con Claude

- Rispondi in **italiano**, sintetico.
- Aggiorna `docs/CHANGELOG.md` ad ogni feature pubblicata, con sezione versionata.
- Aggiorna `docs/ROADMAP.md` quando una voce passa a ✅.
- **Mai** modificare `node_modules/`, `dist/`, `package-lock.json` manualmente.
- `.gitignore` esistente esclude node_modules, dist, .env.
- Push su branch corrente, **non** su `main`. PR è in modalità draft.
- Convenzione commit: tipo singolo (`feat:` / `fix:` / `refactor:` / `docs:`) + descrizione concisa.

---

## 📚 Riferimenti rapidi

- `docs/PROJECT_SPEC.md` — specifiche tecniche complete (modelli, design system, sezioni codice).
- `docs/CLAUDE.md` — istruzioni stile/convenzioni per Claude.
- `docs/CHANGELOG.md` — storia dettagliata delle versioni.
- `docs/ROADMAP.md` — pianificazione futura.

---

**Ultima sessione completata**: v0.9 — Impostazioni Agenzia (Fase 2 completa). Commit `6af3405` su branch `claude/endorf-review-next-step-Gu3dm`.
