# HANDOFF — Sessione TULLIO post Step P (Phase 1 → 2e)
**Data:** 14 giugno 2026 (sessione 16)
**Sessione precedente:** sessione 15 ha mergeato PR #30 (Step R) e PR #31 (Step S). Sessione 16 ha completato e **mergeato** la catena Step P (#32→#36) + Phase 2e (#38).
**Per:** Claude Code / Claude Cowork (prossima sessione 17)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-13_v9.md` (sessione 15) se serve risalire a Step R/S.
> *(L'handoff v10 era stato preparato con la chain ancora in draft e non è mai stato mergeato; i suoi contenuti sono confluiti qui aggiornati allo stato reale.)*

---

## 0. TL;DR (30 secondi)

- ✅ **Step P Phase 1 → 2e COMPLETATE e MERGEATE in `main`** (squash, in ordine): #32 → #33 → #34 → #35 → #36 → #38.
- 📉 `src/VoyageDesk.jsx`: **8325 → 7313 righe** (−1012, ~−12%). Tutta la logica non-React è fuori dal monolite; l'estrazione dell'albero componenti è **avviata** (`src/components/` con foundation + UI primitives).
- 🟢 `main` HEAD: `79b5b42`. Build verde, bundle `index` invariato (nessun cambio di comportamento: Step P è un refactor puro).
- ⏳ **Prossima sessione (Pri 1)**: **Step P Phase 2f** — continuare l'estrazione dei componenti per cluster (modali → dashboard/code → calendar → chat → tasks → admin → viste → shell), una PR per gruppo.

---

## 1. Cosa è stato fatto in sessione 16

### Strategia
Refactor del monolite in **micro-PR incrementali**, ciascuna con preview Vercel indipendente e build verde. Mergeate in ordine via squash.

| Phase | PR | Squash SHA | Output | Δ righe |
|-------|----|------------|--------|---------|
| 1 — rimozione mutazione in-place globali | #32 | `f5e0caf` | `_sync*` → riassegnazione diretta | 0 |
| 2a — costanti + utility pure | #33 | `013c900` | `lib/taskConstants.js` + `lib/taskUtils.js` | −300 |
| 2b — dati mock | #34 | `19eebc2` | `state/mockData.js` | −100 |
| 2c — globali + permessi | #35 | `1bc4e0b` | `state/appGlobals.js` (live bindings + setter) | −70 |
| 2d — reducer | #36 | `c063500` | `state/reducer.js` | −370 |
| 2e — componenti (avvio) | #38 | `79b5b42` | `components/Viewport.jsx`, `SwipeActions.jsx`, `ui/` | −355 |

> **Nota merge chain**: dalla 2b in poi i PR risultavano `dirty` per il conflitto da squash accumulato (le phase precedenti erano già in `main` come singolo commit squash, ma i branch ne portavano gli originali). Risolto facendo **rebase del solo commit unico di ciascun branch su `main`** (`git rebase --onto origin/main <prev-phase-head>`), force-push, poi squash-merge. Pattern da riusare se si stackano altre PR.

### Dettaglio insight (da preservare)

1. **Live bindings ES module**: `export let TEAM` in `appGlobals.js` è letto dagli importatori come live binding → ogni `setTeam(newTeam)` dal reducer è visibile immediatamente. È per questo che `getMember(id) => TEAM.find(...)` funziona dopo riassegnazione.
2. **Setter obbligatori**: un modulo **non può** riassegnare un `let` importato (read-only) → `appGlobals.js` espone `setTeam`/`setCategories`/`setCurrentUser`. Solo il reducer li chiama; i componenti leggono ma non scrivono.
3. **CURRENT_USER doppio canale**: vive in `appGlobals.CURRENT_USER` (per componenti non-hook che leggono al volo, es. `SwipeActions`) e in `state.currentUserId` (coerenza React). `SET_CURRENT_USER` aggiorna entrambi.
4. **CRLF**: `src/VoyageDesk.jsx` ha line endings CRLF. Tool che lo riscrivono interamente (Python) lo normalizzano a LF gonfiando il diff. Verifica `git diff --numstat src/VoyageDesk.jsx` prima del push; riconverti se serve (vedi CLAUDE.md nota #7).

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `79b5b42 Step P Phase 2e: carve UI primitives + Viewport (#38)`

### PR aperte residue (NON parte di Step P attivo)
- **#37** `docs: handoff v10 …` — **superato da questo handoff v11**, va chiuso.
- Diverse PR storiche draft mai mergeate (#1–#28, #21, #26, #27, …) — vecchie/sperimentali. In particolare **#27** (estrazione componenti in un commit gigante) **non va riusato**: la strategia di Step P è micro-PR. Valutare un cleanup/chiusura in una sessione futura.

### Note operative
- `npm install` su container Linux riscrive `package-lock.json` con LF → `git checkout -- package-lock.json` prima di committare.
- Hook `~/.claude/stop-hook-git-check.sh` blocca la chiusura con modifiche non committate.

---

## 3. Architettura del codice dopo Step P (Phase 1 → 2e)

```
src/
├── auth/                 AuthContext.jsx, LoginScreen.jsx
├── lib/
│   ├── api.js            Tasks/Notices/Conversations/Messages/Notifications/Users APIs
│   ├── clientId.js       UUID per tab (origin-tagging realtime)
│   ├── mappers.js        DB ↔ camelCase
│   ├── supabase.js
│   ├── taskConstants.js  🆕 2a — PRIORITIES/STATUSES/STATUS_*/NOTICE_COLORS/TASK_TEMPLATES
│   └── taskUtils.js      🆕 2a — formatDate/formatTime/isUrgent/isMyTask/...
├── state/                🆕 (2b–2d)
│   ├── mockData.js       🆕 2b — INITIAL_TEAM/CATEGORIES/TASKS/NOTICES + MOCK_NOTIFICATIONS
│   ├── appGlobals.js     🆕 2c — TEAM/CATEGORIES/CURRENT_USER live bindings + setter + permessi
│   └── reducer.js        🆕 2d — baseReducer / reducer / makeInitialState / LOG / ADMIN_ONLY
├── components/           🆕 (2e — estrazione albero, avviata)
│   ├── Viewport.jsx      ViewportContext / useViewport / ViewportProvider
│   ├── SwipeActions.jsx
│   └── ui/               Avatar, PriorityBadge, CategoryChip, StatusBadge, Toast
├── VoyageDesk.jsx        AppContext + albero componenti React (~7313 righe, era 8325)
└── main.jsx
```

### Catena di import (riferimento per estrazioni future)
```
VoyageDesk.jsx
  ├── auth/AuthContext.jsx (useAuth)
  ├── lib/api.js, mappers.js
  ├── lib/taskConstants.js, lib/taskUtils.js
  ├── state/mockData.js   (solo MOCK_NOTIFICATIONS)
  ├── state/appGlobals.js (TEAM/CATEGORIES/CURRENT_USER + getMember/permessi)
  ├── state/reducer.js    (reducer, makeInitialState)
  └── components/         (Viewport, SwipeActions, ui/*)

state/reducer.js     → taskConstants(STATUS_LABELS), appGlobals(+setter), mockData(INITIAL_TASKS/NOTICES)
state/appGlobals.js  → mockData(INITIAL_TEAM/CATEGORIES), taskUtils(isMyTask/isInGlobalQueue/isUrgent)
components/ui/*       → appGlobals(getMember/CATEGORIES) o taskConstants(PRIORITIES/STATUS_*)
components/SwipeActions.jsx → Viewport(useViewport), appGlobals(CURRENT_USER/getMember/getAssignableTeam/canEditTask), ui/Avatar
components/ui/Toast.jsx     → Viewport(useViewport)
```

> `AppContext` resta ancora dentro `VoyageDesk.jsx`. Quando l'estrazione componenti richiederà di condividerlo, spostarlo in `src/state/AppContext.js` (slice dedicato).

---

## 4. Stato Supabase (invariato dalla sessione 15)

Nessuna modifica DB in sessione 16. Vedi `HANDOFF_SESSION_2026-06-13_v9.md` §3 per il rollup migrazioni. Reminder: `public.users` non ha più `email`/`phone` (sono in `public.user_contacts`, RLS own+admin).

---

## 5. 🐛 Caveat residui

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 10 | Hook subscribe duplicati (3 useEffect) | ⚪ Aperto | bassa | `useDebouncedTableSubscription` |
| 15 | `VoyageDesk.jsx` monolite | 🔶 **Phase 1→2e mergeate** | media | 8325 → 7313 righe. Resta l'estrazione dei cluster grandi di componenti (Phase 2f+) |
| 18 | Mojibake CSV preview import | ⚪ Aperto | bassa | Quick win |
| 19 | Drift repo↔DB | ✅ Step R (#30) | — | |
| 24 | app non aggiornata per user_contacts | ✅ Step S (#31) | — | |
| 2 | Mention edge case nomi composti | ⚪ Aperto | bassa | |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 25 | `UPDATE_OWN_PROFILE` non persiste name/avatar/color/photoUrl | ⚪ Aperto | media | Aggiorna solo lo state React, non chiama `Users.updateProfile`. Step S ha cablato solo email/phone su `user_contacts` |

---

## 6. 🚧 ROADMAP — Prossima sessione (17)

### Pri 1 — Step P Phase 2f: continuare l'estrazione componenti (~4–6h)

Branch consigliato: `claude/step-p-phase2f-<gruppo>` da `main`. Una PR (draft) per gruppo, build verde + Vercel Ready prima di togliere draft. Mantieni VoyageDesk.jsx come **shell** che importa e orchestra.

Gruppi candidati (ordine taglia/sicurezza crescente):

| # | Gruppo | Cartella target | Note |
|---|--------|-----------------|------|
| 1 | Atoms residui (FAB, NavBadge, QueueTab, StatusBadge già fatto) | `src/components/ui/` | basse dipendenze |
| 2 | Modali (QuickAddTask, BulkTaskCreator+4 tab, AIDayPlanner, NoticeEditorModal, ProfileEditor, AddTeamMemberModal, AddCategoryModal) | `src/components/modals/` | dipendono da dispatch ma autonome |
| 3 | Dashboard (PersonalQueue/UnassignedQueue/OverdueQueue/UrgentOthersQueue/NoticeBoard/Dashboard) | `src/components/dashboard/` | |
| 4 | Calendar (CalendarPlanner + iCal export) | `src/components/calendar/` | |
| 5 | Chat (ChatPanel + ~12 sub-componenti) | `src/components/chat/` | il più grosso; ha `ChatContext` proprio |
| 6 | Tasks (TaskSlideOver, SwipeActions già fatto) | `src/components/tasks/` | |
| 7 | Admin (AdminView 5 tab) | `src/components/admin/` | |
| 8 | Trash, Team | `src/components/views/` | |
| 9 | Shell (Topbar+AdvancedSearchPanel+UserSwitcher, Sidebar, BottomNav, NotificationsPanel) | `src/components/shell/` | |

> Quando un gruppo richiede `AppContext`, prima estrarlo in `src/state/AppContext.js` in un commit dedicato dello stesso PR.

### Pri 2 — Step P Phase 2g (opz): `React.lazy` su modali pesanti
Dopo l'estrazione: `React.lazy` su `AdminView`, `BulkTaskCreator`, `AIDayPlanner`, `TaskSlideOver` per ridurre il chunk principale (oggi ~268 KB / 64 KB gz).

### Pri 3 — Quick wins
- **#10** hook `useDebouncedTableSubscription` · **#18** mojibake CSV · **#3** presence channel · **#2** mention nomi composti · **#8** Calendar settimana selezionata.

### Pri 4 — Caveat #25
Cablare `UPDATE_OWN_PROFILE` con `Users.updateProfile` (name/avatar/color/photoUrl, oggi solo in-memory).

### Cleanup (opzionale)
Chiudere #37 (superato) e le vecchie PR draft sperimentali non più rilevanti.

---

## 7. Quick start prossima sessione

```bash
git checkout main && git pull
wc -l src/VoyageDesk.jsx                 # atteso ~7313
ls -la src/state/ src/lib/ src/components/ src/components/ui/
git checkout -b claude/step-p-phase2f-modals   # o il gruppo scelto
npm install && git checkout -- package-lock.json
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build
```

Workflow per ogni gruppo:
1. Crea i file in `src/components/<gruppo>/`, copia il componente **verbatim**, aggiungi gli import necessari (vedi §3 per la mappa dipendenze).
2. In `VoyageDesk.jsx` rimuovi la definizione inline e aggiungi l'import; lascia il delimitatore di sezione come nota di rimando (convenzione CLAUDE.md).
3. `npm run build` deve restare verde e il bundle `index` ~invariato (refactor puro).
4. Verifica `git diff --numstat src/VoyageDesk.jsx` (no normalizzazione LF).
5. PR draft → Vercel Ready → squash merge.

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

- **Merge squash**: convenzione fissa per questo repo.
- **PR sempre draft alla creazione**; togliere draft solo dopo build + Vercel preview Ready.
- **`package-lock.json`** repo è CRLF; `npm install` lo riscrive LF → `git checkout -- package-lock.json` prima di chiudere.
- **CRLF su `src/VoyageDesk.jsx`**: vedi CLAUDE.md nota #7; verifica `git diff --numstat` prima del push.
- **Stacked PR**: se stacki più PR, dopo ogni squash-merge fai `git rebase --onto origin/main <prev-head>` sul branch successivo prima di mergiarlo (vedi §1).
- **`send_later` NON disponibile** in questo ambiente. PR-watch via `subscribe_pr_activity`; nessun self check-in periodico programmabile.
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in `supabase/migrations/<version 16 cifre>_<nome>.sql`.
- **Insight `export let X` + setter** (§1): pattern chiave da non rompere estraendo altri pezzi.

---

**Fine handoff v11.** Sessione 16 chiude Step P Phase 1 → 2e (chain #32→#36 + #38, tutte mergeate). Pri 1 → Phase 2f (estrazione componenti per cluster). Buona prossima sessione.
