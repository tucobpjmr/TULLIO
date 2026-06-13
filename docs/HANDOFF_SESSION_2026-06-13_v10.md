# HANDOFF — Sessione TULLIO post Step P (Phase 1 → 2d)
**Data:** 13 giugno 2026 (sessione 16)
**Sessione precedente:** sessione 15 ha mergeato PR #30 (Step R) e PR #31 (Step S). Sessione 16 ha aperto la catena di 5 PR draft #32→#36 (Step P, refactor monolite).
**Per:** Claude Code / Claude Cowork (prossima sessione 17)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-13_v9.md` (sessione 15) se serve risalire a Step R/S.

---

## 0. TL;DR (30 secondi)

- ✅ **Step P avviato e completato fino a Phase 2d** — caveat #15 in chiusura parziale. Estratto dal monolite: costanti task, utility pure, dati mock, globali mutabili + permessi, reducer. `src/VoyageDesk.jsx` passa da **8325 → 7668 righe** (−657, ~−8%).
- 🔗 **5 PR draft chained**, ciascuna basata sulla precedente (NON su `main`). Tutte verdi (Vercel Preview Ready), nessun review comment. Da mergeare in ordine prima di iniziare lavori successivi sul monolite.
- ⏳ **Prossima sessione (Pri 0)**: mergeare la catena #32→#36 in `main` (squash, in ordine). Solo dopo il merge ha senso aprire un Phase 2e.
- ⏳ **Pri 1**: Phase 2e (estrazione componenti React in `src/components/`, ~7600 righe ancora nel monolite) — è il blocco di lavoro più grosso residuo.

---

## 1. Riepilogo lavori sessione 16 (Step P)

### Strategia adottata

Refactor del monolite `src/VoyageDesk.jsx` (~8300 righe) suddiviso in **fasi piccole e indipendenti**, ognuna con una propria PR draft. La catena viene mergeata in ordine, così:
- Ogni PR resta piccola e revisionabile.
- Il preview Vercel valida ogni step in isolamento.
- Eventuali bug bloccano solo la PR coinvolta, non l'intero refactor.

### Phase 1 — Rimozione mutazione in-place dei globali (PR #32)

Branch: `claude/step-p-phase1-remove-mutable-globals` · base: `main`

- Rimossi `_syncTeam`, `_syncCategories`, `_syncCurrentUser` (helper che mutavano in-place i `let` module-level con `.length = 0` + `forEach push`).
- Sostituiti con **riassegnazione diretta** (`TEAM = newTeam`, `CATEGORIES = newCats`, `CURRENT_USER = newId`) in tutti i 12 punti del reducer + `makeInitialState`.
- Le utility (`getMember`, `getRoleType`, ecc.) chiudono sulla **variabile** `let`, non sul valore: JavaScript cattura il binding, quindi la riassegnazione funziona correttamente senza necessità di mutazione.
- Aggiornato `docs/CLAUDE.md` per documentare il nuovo pattern.

### Phase 2a — Costanti + utility pure (PR #33)

Branch: `claude/step-p-phase2a-extract-constants-utils` · base: Phase 1

- **`src/lib/taskConstants.js`** (nuovo): `PRIORITIES`, `STATUSES`, `STATUS_LABELS`, `STATUS_COLORS`, `NOTICE_COLORS`, `TASK_TEMPLATES`.
- **`src/lib/taskUtils.js`** (nuovo): `formatDate`, `formatTime`, `getDayKey`, `isOverdue`, `isUrgent`, `isActiveTask`, `getActiveTasks`, `getTrashedTasks`, `isMyTask`, `isInGlobalQueue`.
- `VoyageDesk.jsx`: rimosse le dichiarazioni inline, aggiunti import dai due nuovi moduli.

### Phase 2b — Dati mock (PR #34)

Branch: `claude/step-p-phase2b-extract-mock-data` · base: Phase 2a

- **`src/state/mockData.js`** (nuovo): `INITIAL_TEAM` (7 membri), `INITIAL_CATEGORIES` (10), `INITIAL_TASKS` (27), `INITIAL_NOTICES` (3), `MOCK_NOTIFICATIONS` (6) + helper privato `d()` per date relative.
- Rinominato `NOTIFICATIONS` → `MOCK_NOTIFICATIONS` (chiarisce che è solo fallback offline/demo).
- VoyageDesk.jsx: `let TEAM = [...INITIAL_TEAM]`, `let CATEGORIES = { ...INITIAL_CATEGORIES }` ora usano gli import (~100 righe rimosse dal monolite).

### Phase 2c — Globali mutabili + helper permessi (PR #35)

Branch: `claude/step-p-phase2c-appglobals` · base: Phase 2b

- **`src/state/appGlobals.js`** (nuovo, ~80 righe): export di `TEAM`, `CATEGORIES`, `CURRENT_USER` come **live ES-module bindings** + setter `setTeam`/`setCategories`/`setCurrentUser`. Esporta anche `getMember`, `getAssignableTeam`, e tutti i permission helper (`getRoleType`, `isAdmin`, `isDriver`, `canViewTask`, `canEditTask`, `canCreateTaskCategory`, `canAccessAdmin`, `getAvailableCategories`, `getVisibleTasks`).
- VoyageDesk.jsx: ora **importa tutto** da `appGlobals.js`; rimosse ~70 righe di dichiarazioni inline (le `let` + l'intera sezione `// ─── PERMESSI`). Tutte le 11 assegnazioni dirette nel reducer (`TEAM = ...`) ora chiamano i setter.

> **Insight ES module**: `export let X` + `setX()` funziona perché gli importatori leggono la live binding — vedono sempre il valore corrente dopo `setX(newVal)`. Senza setter, non è possibile riassegnare `X` da un altro modulo (le import sono read-only).

### Phase 2d — Reducer + makeInitialState (PR #36)

Branch: `claude/step-p-phase2d-reducer` · base: Phase 2c

- **`src/state/reducer.js`** (nuovo, ~400 righe): `baseReducer`, `reducer` (wrapper Admin pre-check + activity log), `LOGGED_ACTIONS`, `buildLogEntry`, `ADMIN_ONLY_ACTIONS`, `makeInitialState`. Importa `STATUS_LABELS` da `taskConstants`, globali/setter/permessi da `appGlobals`, `INITIAL_TASKS`/`INITIAL_NOTICES` da `mockData`.
- VoyageDesk.jsx: rimosse ~370 righe (l'intero blocco reducer); resta solo `AppContext = createContext(null)` e l'albero componenti. Import puliti: rimossi `setTeam/setCategories/setCurrentUser` (solo reducer li usa) e `INITIAL_TEAM/INITIAL_CATEGORIES/INITIAL_TASKS/INITIAL_NOTICES` (solo `MOCK_NOTIFICATIONS` resta usato nei componenti).
- **CRLF preservato**: il monolite ha line endings CRLF; durante l'estrazione un passaggio Python aveva normalizzato a LF, gonfiando il diff a 8000+ righe. Risolto con riconversione CRLF prima del push → diff finale **8 added / 386 removed** + 400 added (nuovo file).
- Build verificata localmente: `vite build` OK, 84 moduli (+1 vs Phase 2c).

### Risultati cumulativi Step P

| Metrica | Pre-Step P | Post Phase 2d |
|---------|------------|----------------|
| `src/VoyageDesk.jsx` (righe) | 8325 | **7668** (−657) |
| Moduli `src/state/` | 0 | 3 (`appGlobals.js`, `mockData.js`, `reducer.js`) |
| Moduli `src/lib/` task | 4 | 6 (+`taskConstants.js`, `taskUtils.js`) |
| Pattern `_sync*` mutation in-place | sì | **rimosso** |

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `75358e2 Step S: wiring email/phone su user_contacts (#31)` (sessione 15)

### PR aperte (tutte draft, CI verde, ZERO review comment)

| PR | Title | Base | Head | Cosa fa |
|----|-------|------|------|---------|
| #32 | Step P Phase 1 — rimuove mutazione in-place globali | `main` | `claude/step-p-phase1-remove-mutable-globals` | `_sync*` → riassegnazione diretta |
| #33 | Step P Phase 2a — costanti + utility pure | #32 | `claude/step-p-phase2a-extract-constants-utils` | crea `lib/taskConstants.js` + `lib/taskUtils.js` |
| #34 | Step P Phase 2b — dati mock | #33 | `claude/step-p-phase2b-extract-mock-data` | crea `state/mockData.js` |
| #35 | Step P Phase 2c — globali + permessi | #34 | `claude/step-p-phase2c-appglobals` | crea `state/appGlobals.js` |
| #36 | Step P Phase 2d — reducer | #35 | `claude/step-p-phase2d-reducer` | crea `state/reducer.js` |

### ⚠️ ORDINE DI MERGE OBBLIGATORIO

Ogni PR ha la base impostata su quella precedente, NON su `main`. Vanno mergeate **in ordine 32 → 33 → 34 → 35 → 36**, perché ogni squash merge aggiorna la base della successiva automaticamente.

```
# Workflow consigliato (squash merge da GitHub UI):
1. PR #32 → squash merge in main → main HEAD avanza
2. GitHub aggiorna automaticamente la base di PR #33 a main (verifica nella UI)
3. PR #33 → squash merge in main
4. … e così via fino a #36
```

Se vuoi controllare la base prima del merge:
```bash
gh pr view 33 --json baseRefName
```
Se la base resta sbagliata, aggiornala con la rebase UI di GitHub o:
```bash
gh pr edit 33 --base main
```

### Note operative (invariate da v9)

- `npm install` su container Linux riscrive `package-lock.json` con LF. Scartare il diff prima di committare: `git checkout -- package-lock.json`.
- `package-lock.json` repo è CRLF.
- `src/VoyageDesk.jsx` è CRLF: tool che lo riscrivono interamente (Python, alcune helper) lo normalizzano a LF. Verificare sempre `git diff --numstat src/VoyageDesk.jsx` prima del push; un numero anomalmente alto indica conversione di line endings — riconvertire prima del commit.

---

## 3. Architettura del codice dopo Step P (Phase 1 → 2d)

```
src/
├── auth/
│   ├── AuthContext.jsx
│   └── LoginScreen.jsx
├── lib/
│   ├── api.js                 ← Tasks/Notices/Conversations/Messages/Notifications/Users APIs
│   ├── clientId.js            ← UUID per tab (origin-tagging realtime)
│   ├── mappers.js             ← DB ↔ camelCase converters
│   ├── supabase.js
│   ├── taskConstants.js  ← 🆕 Phase 2a — PRIORITIES/STATUSES/STATUS_*/NOTICE_COLORS/TASK_TEMPLATES
│   └── taskUtils.js      ← 🆕 Phase 2a — formatDate/formatTime/isUrgent/isMyTask/...
├── state/                ← 🆕 cartella nuova
│   ├── mockData.js       ← 🆕 Phase 2b — INITIAL_TEAM/CATEGORIES/TASKS/NOTICES + MOCK_NOTIFICATIONS
│   ├── appGlobals.js     ← 🆕 Phase 2c — TEAM/CATEGORIES/CURRENT_USER (live bindings) + permessi
│   └── reducer.js        ← 🆕 Phase 2d — baseReducer / reducer / makeInitialState / LOG / ADMIN_ONLY
├── VoyageDesk.jsx        ← 7668 righe (era 8325): solo AppContext + albero componenti
└── main.jsx
```

### Catena di import dopo Step P

```
VoyageDesk.jsx
  ├── auth/AuthContext.jsx (useAuth)
  ├── lib/api.js, mappers.js
  ├── lib/taskConstants.js   ← PRIORITIES, STATUSES, STATUS_LABELS, STATUS_COLORS, NOTICE_COLORS, TASK_TEMPLATES
  ├── lib/taskUtils.js       ← formatDate/Time, isOverdue/Urgent, isActive/Trashed, isMyTask, isInGlobalQueue
  ├── state/mockData.js      ← MOCK_NOTIFICATIONS (solo)
  ├── state/appGlobals.js    ← TEAM/CATEGORIES/CURRENT_USER (live bindings),
  │                            getMember/getAssignableTeam, getRoleType, isAdmin/Driver,
  │                            canViewTask/canEditTask/canCreateTaskCategory/canAccessAdmin,
  │                            getAvailableCategories, getVisibleTasks
  └── state/reducer.js       ← reducer, makeInitialState

state/reducer.js
  ├── lib/taskConstants.js   ← STATUS_LABELS
  ├── state/appGlobals.js    ← TEAM, CATEGORIES, CURRENT_USER + setter + getMember/isAdmin + canAccessAdmin/canViewTask/canEditTask/canCreateTaskCategory
  └── state/mockData.js      ← INITIAL_TASKS, INITIAL_NOTICES

state/appGlobals.js
  ├── state/mockData.js      ← INITIAL_TEAM, INITIAL_CATEGORIES
  └── lib/taskUtils.js       ← isMyTask, isInGlobalQueue, isUrgent
```

### Insight chiave da preservare nei prossimi step

1. **Live bindings ES module**: `export let TEAM` in `appGlobals.js` viene letto dagli importatori come live binding — qualunque chiamata a `setTeam(newTeam)` dal reducer è visibile immediatamente in VoyageDesk.jsx. È **per questo** che `getMember(id) => TEAM.find(...)` continua a funzionare anche dopo riassegnazione.

2. **Setter obbligatori**: i moduli **non possono** riassegnare un `let` importato da fuori (è read-only). Per questo `appGlobals.js` espone `setTeam`/`setCategories`/`setCurrentUser`. Solo il reducer li chiama; VoyageDesk.jsx legge ma non scrive direttamente.

3. **CURRENT_USER doppio canale**: vive sia in `appGlobals.CURRENT_USER` (per i componenti non-hook che leggono al volo, es. `SwipeActions`) sia in `state.currentUserId` (per la coerenza React). Il reducer in `SET_CURRENT_USER` aggiorna **entrambi**.

---

## 4. Stato Supabase (invariato sessione 15)

Nessuna modifica al DB in sessione 16. Vedi `HANDOFF_SESSION_2026-06-13_v9.md` §3 per il rollup migrazioni.

Schema di riferimento `public.users` (dopo `user_contacts_table`, sessione 15): nessuna colonna `email`/`phone`; quelle sono in `public.user_contacts` con RLS own+admin.

---

## 5. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1–8 | (chiusi) | ✅ | — | |
| 9 | (chiuso) | ✅ | — | |
| 10 | Hook subscribe duplicati (3 useEffect) | ⚪ Aperto | bassa | `useDebouncedTableSubscription`. Pri 4 |
| 11–14 | (chiusi) | ✅ | — | |
| 15 | `VoyageDesk.jsx` ~8300 righe | 🔶 **Step P Phase 1+2a-2d aperti (chain #32→#36)** | media | Phase 2e (estrazione componenti) ancora da fare. Dopo merge chain: monolite a 7668 righe. |
| 16–20 | (chiusi o non issue) | ✅ | — | |
| 18 | Mojibake CSV preview import | ⚪ Aperto | bassa | Quick win |
| 19 | Drift repo↔DB | ✅ Step R (#30) | — | |
| 24 | app non aggiornata per user_contacts | ✅ Step S (#31) | — | |
| 2 | Mention edge case nomi composti | ⚪ Aperto | bassa | |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |

### Caveat #25 — UPDATE_OWN_PROFILE non persiste name/avatar/color/photoUrl (riportato da v9)

Riportato da handoff v9 §0: `UPDATE_OWN_PROFILE` aggiorna solo lo stato React, **non** chiama `Users.updateProfile`. Step S ha cablato solo email/phone su `user_contacts`. Da valutare in una sessione futura se persistere anche name/avatar/color/photoUrl.

---

## 6. 🚧 ROADMAP — Prossima sessione (17)

### Pri 0 — Merge catena PR #32→#36 (≈10 min totali)

Vedi §2 sopra per l'ordine obbligatorio. Squash merge per ciascuna. Non aprire nuove PR sul monolite prima di completare il merge.

### Pri 1 — Step P Phase 2e: estrazione componenti React (~4-6h)

Branch consigliato: `claude/step-p-phase2e-components` da `main` (dopo merge della chain).

Il monolite ha ancora ~7600 righe = praticamente tutto l'albero componenti. Strategia consigliata: estrarre per gruppi logici, una PR per gruppo, mantenendo VoyageDesk.jsx come **shell** che importa e orchestra.

Gruppi candidati (in ordine di taglia/sicurezza):

| # | Gruppo | Cartella target | Note |
|---|--------|-----------------|------|
| 1 | Atoms (Avatar, Badge, Toast, FAB, …) | `src/components/atoms/` | Zero dipendenze da stato app → cleanest first |
| 2 | Modali (QuickAddTask, BulkTaskCreator, AIDayPlanner, NoticeEditorModal, ProfileEditor) | `src/components/modals/` | Dipendono da dispatch ma sono autonomi |
| 3 | Dashboard tabs (PersonalQueue, UnassignedQueue, OverdueQueue, UrgentOthersQueue, NoticeBoard) | `src/components/dashboard/` | |
| 4 | Calendar (CalendarPlanner, day/week views, iCal export) | `src/components/calendar/` | |
| 5 | Chat (ChatPanel + sub-componenti) | `src/components/chat/` | il più grosso |
| 6 | Tasks (TaskSlideOver, SwipeActions, KanbanCard) | `src/components/tasks/` | |
| 7 | Admin (AdminView 5 tab) | `src/components/admin/` | |
| 8 | Trash, Team views | `src/components/views/` | |
| 9 | Shell (Topbar, Sidebar, BottomNav) | `src/components/shell/` | |

> **Riferimento storico**: PR #27 (sessione 12, MAI MERGEATA) ha fatto un'estrazione simile in un solo commit gigante. Non riusarla: la strategia di Step P Phase 2 è di micro-PR incrementali e revisionabili.

### Pri 2 — Step P Phase 2f (opzionale): `React.lazy` su modali pesanti

Solo dopo l'estrazione componenti: `React.lazy` su `AdminView`, `BulkTaskCreator`, `AIDayPlanner`, `TaskSlideOver` per ridurre il chunk principale (oggi ~270 KB / 64 KB gz).

### Pri 3 — Quick wins (~1-2h totali)

- **#10**: hook `useDebouncedTableSubscription` per eliminare i 3 `useEffect` duplicati di subscribe.
- **#18**: mojibake intestazioni CSV preview import.
- **#3**: presence heartbeat ottimizzato (Supabase Presence channel invece di UPDATE polling).
- **#2**: mention parser per nomi composti.
- **#8**: Calendar Distribuzione Agenti — usare la settimana selezionata invece di quella corrente fissa.

### Pri 4 — Caveat #25 (UPDATE_OWN_PROFILE persistenza)

Cablare `UPDATE_OWN_PROFILE` con `Users.updateProfile` per `name`/`avatar`/`color`/`photoUrl` (oggi solo in-memory).

---

## 7. Quick start prossima sessione

```bash
# 1. Aggiorna main (deve includere PR #32→#36 mergeate)
git checkout main && git pull

# 2. Verifica che il monolite sia a ~7668 righe (chain mergeato)
wc -l src/VoyageDesk.jsx

# 3. Verifica i nuovi moduli
ls -la src/state/ src/lib/

# 4. Crea il branch del nuovo step
git checkout -b claude/step-p-phase2e-atoms

# 5. Setup
npm install
git checkout -- package-lock.json
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build
```

Se la chain non è stata ancora mergeata, parti dal branch Phase 2d e usalo come base:
```bash
git fetch origin claude/step-p-phase2d-reducer
git checkout -b claude/step-p-phase2e-atoms origin/claude/step-p-phase2d-reducer
```

---

## 8. Configurazione locale (invariato da v9)

### `.env` (esiste, NON committato)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # attivabile in dev se serve
```

---

## 9. Utenti DB (invariato da v9)

| Nome | UUID | Email (in user_contacts) | Ruolo |
|------|------|--------------------------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

---

## 10. Note importanti per Claude nella prossima sessione

- **Merge squash**: convenzione fissa per questo repo. Mantieni anche per la chain Step P.
- **PR sempre draft alla creazione**; togliere draft solo dopo verifica build + Vercel preview Ready.
- **`package-lock.json`**: il file in repo ha CRLF; `npm install` su container Linux lo riscrive con LF. Sempre `git checkout -- package-lock.json` prima di chiudere il turno.
- **CRLF su `src/VoyageDesk.jsx`**: il monolite ha line endings CRLF. Tool che lo riscrivono interamente (Python, alcuni helper) lo normalizzano a LF. Verifica `git diff --numstat src/VoyageDesk.jsx` prima del push; un diff anomalo (es. 8000+ righe) indica conversione. Riconverti con:
  ```bash
  python3 -c "import sys; p='src/VoyageDesk.jsx'; d=open(p,'rb').read().replace(b'\r\n',b'\n').replace(b'\n',b'\r\n'); open(p,'wb').write(d)"
  ```
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<version>_<nome>.sql`. Timestamp completo 16 cifre come prefisso.
- **`send_later` NON disponibile** in questo ambiente. PR-watch tramite `subscribe_pr_activity`. Per check-in periodici sui PR aperti, usa l'utente come trigger.
- **Caveat #15**: parzialmente risolto. Step P Phase 1+2a-2d riducono il monolite da 8325 → 7668 righe e introducono `src/state/`. Phase 2e (estrazione componenti) è il blocco residuo.
- **Insight `export let X` + setter**: documentato in §3 — pattern chiave da non rompere quando si estraggono altri pezzi.

---

**Fine handoff v10.** Sessione 16 chiude Step P Phase 1+2a→2d (5 PR draft chained, #32→#36). Pri 0 → mergea la chain in ordine. Pri 1 → Step P Phase 2e (estrazione componenti React). Buona prossima sessione.
