# HANDOFF — Session 37 (Qualità & Hardening)

> **Data**: 2026-06-28
> **Branch di lavoro**: `claude/task-video-audio-uploads-it7cbr` (mergiato in `main` via PR #79)
> **PR**: #79 — **MERGIATA** in `main` ✅
> **Sessione precedente**: v36 (go-live completato, app in produzione)

---

## 0. TL;DR

L'app è **in produzione** su `tullio-seven.vercel.app` ed è **stabile**.
Questa sessione ha eseguito una re-analisi completa del progetto con focus su qualità, robustezza,
tooling, test e hardening sicurezza. Nessuna feature aggiuntiva.

| Blocco | Stato |
|---|---|
| AI Day Planner rimosso | ✅ (feature eliminata — costerebbe API Anthropic) |
| `dispatch` stabile (`stateRef`) | ✅ no più re-render inutili |
| ESLint 9 flat config | ✅ `npm run lint` pulito (0 errori, 11 warning) |
| CI GitHub Actions | ✅ `.github/workflows/ci.yml` attivo |
| Test reducer + mapper | ✅ 82 test, 5 file, tutti verdi |
| Hardening storage/RPC Supabase | ✅ migrazione applicata in produzione |
| `safeRedirect()` in invite-user | ✅ open-redirect chiuso |
| Import morti puliti | ✅ `AdminView`, `Sidebar`, `TaskSlideOver`, `VoyageDesk` |
| Merge PR #79 in main | ✅ commit `e7e03d1c6d495dbe627ecf47bcd6d88c2cf6e034` |

---

## 1. Cosa è stato fatto in questa sessione

### 1a. Rimozione AI Day Planner
- `src/components/modals/AIDayPlanner.jsx` — **eliminato** (`git rm`)
- `src/components/dashboard/Dashboard.jsx` — rimossi: `lazy`, `Suspense`, `useState(showAIPlanner)`, il pulsante gold "✨ Pianifica la mia giornata", il rendering condizionale del modal
- `src/lib/api.js` — rimosso il blocco `export const AI = { planDay: ... }`
- `supabase/functions/plan-day/index.ts` — **eliminato** (era stato creato nella stessa sessione poi rimosso)
- `README.md` — rimossa la voce "AI Day Planner"

> **Nota**: la Edge Function `plan-day` è ancora **idle su Supabase** (mai chiamata, 0 costo per invocation).
> Per eliminarla: Supabase Dashboard → tullio → Edge Functions → plan-day → Delete.

### 1b. `dispatch` stabile (stateRef)
- `src/VoyageDesk.jsx` — aggiunto `stateRef` (pattern già usato per `currentUserIdRef`)
- Le deps di `dispatch` erano `[useSupabase, state.tasks, state.notices, state.team]` → ricreato a ogni mutazione
- Ora: deps `[useSupabase]`, i 3 case che leggevano state dentro dispatch usano `stateRef.current`:
  - `EMPTY_TRASH` → `stateRef.current.tasks`
  - `TOGGLE_PIN_NOTICE` → `stateRef.current.notices`
  - `TOGGLE_TEAM_MEMBER_ACTIVE` → `stateRef.current.team`

### 1c. ESLint 9 flat config
- **`eslint.config.js`** (nuovo):
  - `@eslint/js` + `eslint-plugin-react` (jsx-uses-vars/react) + `eslint-plugin-react-hooks`
  - Solo `rules-of-hooks: error` + `exhaustive-deps: warn` (NO React Compiler rules da v7)
  - Ignora `dist/`, `node_modules/`, `supabase/functions/`
- **`package.json`**:
  - Script `"lint": "eslint ."`
  - devDeps aggiunte: `eslint@^9`, `@eslint/js@^9`, `eslint-plugin-react@^7`, `eslint-plugin-react-hooks@^7`, `globals@^17`
- Import morti puliti in: `AdminView.jsx` (TEAM), `Sidebar.jsx` (CURRENT_USER), `TaskSlideOver.jsx` (formatTime), `VoyageDesk.jsx` (useContext, useMemo, useAuth, decine di import da child components)
- `api.js`: `no-useless-escape` fixato in `sanitizeFileName` (regex `[^\w.\-]` → `[^\w.-]`)
- Stato lint: **0 errori, 11 warning** (tutti `exhaustive-deps` in hook esistenti — attesi, non critici)

### 1d. CI GitHub Actions
- **`.github/workflows/ci.yml`** (nuovo):
  - Trigger: `push: [main]` + `pull_request`
  - Steps: `npm ci` → `npm run lint` → `npm test` → `npm run build`
  - Node 20 con cache npm

### 1e. Test: reducer + mappers
- **`src/test/reducer.test.js`** (nuovo, ~172 righe):
  - Setup: `setTeam(TEAM_FIXTURE)` + `setCurrentUser(uid)` da `appGlobals` prima di ogni suite
  - TEAM_FIXTURE: `marco` (admin) + `gina` (junior agent)
  - Suite: task lifecycle admin, permessi (junior bloccato su payment/admin-only, SET_VIEW admin), bacheca avvisi + reaction toggle, CRM clienti, activity log + toast
- **`src/test/mappers.test.js`** (nuovo):
  - Round-trip task (DB→app→DB), `toDbTaskPatch` selective, null-safety su tutti i `fromDb*`, commento fallback name, notice author_id↔author, conversation type/participants/pinned, message fileSize coercion (string "245 KB" → null), client/notification mapping
- **Risultato**: 82 test, 5 file, tutti verdi ✅

### 1f. Hardening sicurezza Supabase
- **`supabase/migrations/20260628_storage_rpc_active_gate.sql`** — applicato in produzione:
  - Policy `storage_active_only` RESTRICTIVE su `storage.objects`: blocca utenti inattivi su `task-files` e `chat-files` esplicitamente (era già bloccato indirettamente via RLS tabelle)
  - `messages_mark_read` RPC: guard `is_active_user()` esplicito (raise exception se inattivo)
  - NON aggiunto `reader_id <> auth.uid()` — romperebbe il user-switcher demo (currentUserId ≠ auth session uid)

### 1g. Open-redirect chiuso in invite-user
- `supabase/functions/invite-user/index.ts` — `safeRedirect()`:
  ```ts
  function safeRedirect(value: unknown): string | undefined {
    if (typeof value !== "string") return undefined;
    let u: URL;
    try { u = new URL(value); } catch { return undefined; }
    if (u.protocol !== "https:") return undefined;
    const host = u.hostname.toLowerCase();
    const ok = host === "tullio-seven.vercel.app" || host.endsWith(".vercel.app");
    return ok ? value : undefined;
  }
  ```
  - Whitelist: `tullio-seven.vercel.app` + `*.vercel.app` (preview deployments)

---

## 2. Stato corrente

### Branch e commit
- Branch: `claude/task-video-audio-uploads-it7cbr` — **mergiato in main** (PR #79)
- Ultimo commit su main: `e7e03d1` (revert AI Day Planner) + `1b2bec4` (fix+chore sessione 37)
- Working tree: **pulito**, nessuna modifica pendente

### Test
```
Test Files  5 passed (5)
Tests       82 passed (82)
```

### Lint
```
0 errors, 11 warnings (tutti exhaustive-deps — attesi)
```

### Supabase
- Progetto: `vmxvnxsqfisucugcpqlc` (eu-west-1)
- Migrazione `20260628_storage_rpc_active_gate.sql` applicata in produzione ✅
- Edge Function `plan-day`: idle, non chiamata, eliminabile manualmente dal dashboard

---

## 3. Architettura attuale (sintesi)

```
src/
├── auth/                    AuthContext.jsx, LoginScreen.jsx (UpdatePasswordScreen inside)
├── lib/
│   ├── api.js               Tasks/Notices/Conversations/Messages/Notifications/Users/Clients
│   │                        (AI block RIMOSSO; sanitizeFileName fixato)
│   ├── mappers.js           DB ↔ camelCase
│   ├── fileUtils.js         MAX_TASK_FILE_SIZE (50MB), mediaKind()
│   └── ...altri moduli lib
├── state/
│   ├── appGlobals.js        TEAM/CATEGORIES/CURRENT_USER + setTeam/setCategories/setCurrentUser
│   ├── reducer.js           baseReducer / reducer / makeInitialState
│   └── mockData.js
├── components/
│   ├── dashboard/Dashboard.jsx   (AIDayPlanner RIMOSSO)
│   ├── modals/               QuickAddTask, BulkTaskCreator, ProfileEditor, NoticeEditorModal,
│   │                         AddTeamMemberModal, AddCategoryModal
│   │                         (AIDayPlanner.jsx ELIMINATO)
│   ├── chat/ChatPanel.jsx
│   ├── tasks/TaskSlideOver.jsx
│   ├── admin/AdminView.jsx  (import TEAM rimosso)
│   ├── shell/               Topbar, Sidebar (import CURRENT_USER rimosso), BottomNav, FAB
│   ├── clients/ClientiView.jsx
│   ├── views/               Team.jsx, Trash.jsx
│   ├── calendar/CalendarPlanner.jsx
│   └── ui/                  Toast, Avatar, PriorityBadge, CategoryChip, StatusBadge, MentionText
├── test/
│   ├── reducer.test.js       (NUOVO — 7 suite)
│   ├── mappers.test.js       (NUOVO — 6 suite)
│   └── ...altri 3 file esistenti
└── VoyageDesk.jsx            (stateRef aggiunto, import morti rimossi)
```

---

## 4. Cosa NON è stato fatto (scope deliberatamente escluso)

- **RLS pending-user isolation** (Block 2) — deferred, nessun utente reale ancora
- **Resend confirmation email UI** — deferred
- **Feature nuove** — questa sessione era solo bugfix/qualità

---

## 5. Prossime sessioni suggerite

Non ci sono task urgenti aperti. Possibili direzioni:
1. **Block 2** — RLS hardening per pending users (email confirmation enforcement)
2. **Nuove feature operatività** — vedi `docs/ROADMAP.md` per il piano completo
3. **Performance** — profiling render con React DevTools se necessario

---

## 6. Note operative per Claude Code

- **Branch**: sempre `claude/task-video-audio-uploads-it7cbr` (o nuovo se richiesto dall'utente)
- **Repo GitHub**: `tucobpjmr/tullio` (scope limitato)
- **Supabase**: progetto `vmxvnxsqfisucugcpqlc` — usare `mcp__Supabase__apply_migration` con cautela
- **Commit message footer**:
  ```
  Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_<ID>
  ```
- **ESLint**: `npm run lint` deve restare 0 errori; i 11 warning `exhaustive-deps` sono accettati
- **Test**: `npm test` deve restare 82/82 ✅
- **AI Day Planner**: rimosso definitivamente — non reintrodurre
- **`reader_id <> auth.uid()`**: non aggiungere a `messages_mark_read` — rompe user-switcher demo
