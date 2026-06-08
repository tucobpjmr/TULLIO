# Handoff — Bug-fix VoyageDesk

Branch: `claude/kind-edison-Waq2e`
PR draft: [#9](https://github.com/tucobpjmr/TULLIO/pull/9) — *"Step 1/10: fix typo nel file AuthContext e path import rotto"*
Base audit: vedi sezione "Lista bug originale" in fondo.

Questo file serve come prompt riusabile per riprendere il lavoro in una nuova sessione. È self-contained: non serve scorrere la chat precedente.

---

## 1. Stato corrente — cosa è stato fatto

| Step | Commit | Bug risolti | Cosa cambia |
|---|---|---|---|
| **1** | `Fix typo in AuthContext filename…` | #1, #2, #12 | Rinominato `Authconttext.jsx` → `AuthContext.jsx` (`git mv`). Corretto import `'../lib/supabase'` → `'../supabase'`. Commenti header allineati. |
| **2** | `Wire AuthProvider and Login gate…` | #3, #9, #17 | `main.jsx` ora monta `AuthProvider` + gate `LoadingScreen`/`LoginScreen`/`VoyageDesk`. `supabase.js` espone `isSupabaseConfigured` e non crasha all'import se mancano le env. `AuthContext.onAuthStateChange` rispetta il flag `mounted`. |
| **3** | `Move Claude API call to a Vercel serverless function` | #4, #11, #27 | Creata `api/ai-day-planner.js` (Node serverless). Inietta `ANTHROPIC_API_KEY` server-side, header `anthropic-version`, modello default `claude-sonnet-4-6` (override via `ANTHROPIC_MODEL`). Client `VoyageDesk.jsx` POST su `/api/ai-day-planner`. |
| **4** | `Wire AppContext so leaf components read currentUserId…` | #5 (parte), #24 | `AppContext.Provider` in `VoyageDeskInner` con `{ currentUserId, team, categories }` memoizzati. Hook `useAppCtx()` con fallback ai globali. Migrati 4 leaf components: `SwipeActions`, `QuickAddTask`, `AIDayPlanner`, `NoticeBoard`. |
| **5** | `Stabilize close-on-outside-click effects and tighten list keys` | #6, #7 | `AdvancedSearchPanel`: pattern ref stabile per `onClose` (effect attach 1× al mount). Migrati `key={i}` con identità naturale dove sensato: preview task, comments, calendario settimana, agent-week table. |
| **6** | `Centralize day-level date helpers` | #8 | Aggiunti `formatYMD`/`sameDay`/`isToday`, `getDayKey` ora alias. Tutti i `toDateString() === toDateString()` (~10 siti) migrati. |
| **7** | `Tighten null-safety around member lookups` | #14 (verificato), #15 | Constante `UNKNOWN_MEMBER` (frozen) + helper `getMemberOrUnknown(id)`. Fix optional chaining incompleto in 2 punti chat (`?.name?.split`). |

Build sempre verificato con `VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vite build` (e senza, per il path config-error).

---

## 2. Decisioni operative prese durante la sessione

1. **Le variabili globali `CURRENT_USER`/`TEAM`/`CATEGORIES` restano in vita** per ora: vengono lette dalle utility out-of-tree (`getMember`, `canEditTask`, `getAvailableCategories`, ecc.). Eliminarle richiede prima di portare quelle utility a ricevere `currentUserId` come parametro — vedi step 4b.
2. **`/api/ai-day-planner.js` funziona solo in deploy Vercel** (o con `vercel dev` localmente). In `npm run dev` puro la route non esiste; il pianner mostra l'errore della function. Se serve dev locale, aggiungere un proxy in `vite.config.js` o usare `vercel dev`.
3. **Env vars richieste su Vercel prima del merge della PR #9**:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `ANTHROPIC_API_KEY` (server-side, **NON** prefisso `VITE_`)
   - (opzionale) `ANTHROPIC_MODEL` per override del default `claude-sonnet-4-6`
4. **Schema DB Supabase**: non verificato in questa sessione. Prima dello step 8 va controllato con `list_tables` MCP che esistano `users, tasks, comments, notices, conversations, messages` con le colonne attese dal layer `src/lib/api.js`.
5. **Build size warning**: il bundle è ~1MB (gzip 296KB) post-step 2. Sopra la soglia Vite di 500KB. Non è regressione bloccante — verrà affrontato nello step 10 (split file monolitico + dynamic import).

---

## 3. Roadmap residua

### Step 4b — Migrazione Chat (sub-step emerso, prima di chiudere #5)

Il sotto-sistema Chat ha **~25 letture di `CURRENT_USER` globale** in 5-6 componenti diversi. Esiste già `ChatContext` (`VoyageDesk.jsx:4705`) con `currentUserId` come campo ma i figli non lo consumano. Siti (ricostruire posizione con grep `\bCURRENT_USER\b`):

- ChatPanel inner — riga ~5703
- ChatList — riga ~5463
- ChatMessage (`isMine`, reactions, readBy) — righe 4910, 5140-5216
- NewConversation — righe 5558-5578
- Conv list rendering — righe 5494-5512

**Approccio**: in ogni componente che oggi legge `CURRENT_USER`, sostituire con `useContext(ChatContext).currentUserId`. Rimuovere il fallback `currentUserId || CURRENT_USER` in `ChatPanel` perché ora arriva sempre come prop.

Bug coperti: #5 (chiude il residuo).

### Step 4c — Rimozione globali `CURRENT_USER`/`TEAM`/`CATEGORIES`

Solo dopo 4b. Modificare le utility (`getMember`, `getMemberOrUnknown`, `canEditTask`, `canViewTask`, `canAccessAdmin`, `canCreateTaskCategory`, `getAvailableCategories`, `getAssignableTeam`) per ricevere `team`/`currentUserId` come parametro, eliminare `_syncCurrentUser`/`_syncTeam`/`_syncCategories` e le `let` globali. Reducer torna a operare solo su `state`.

Bug coperti: #5 (chiusura totale).

### Step 8 — Cablare layer API Supabase

Sostituire i mock `INITIAL_TASKS`/`INITIAL_NOTICES`/`initialConversations`/`initialMessages` con dati reali via `src/lib/api.js`.

**Pre-requisiti**:
- Verificare schema con `mcp__Supabase__list_tables` (entità: `users, tasks, comments, notices, conversations, messages`)
- Decisione utente: vuole completare l'integrazione Supabase oppure tenere la modalità mock dietro un flag? La presenza di `@supabase/supabase-js` in `package.json` + auth gate suggerisce di andare avanti.

**Sotto-step suggerito**:
1. **8a — Tasks**: caricamento iniziale via `Tasks.list()` in un `useEffect` del reducer wrapper; `dispatch({type:"SET_TASKS", payload})`. CRUD locale ora chiama anche `Tasks.create/update/softDelete`. Optimistic update + rollback su errore.
2. **8b — Comments**: stesso pattern per i commenti della task selezionata.
3. **8c — Notices**: bacheca via `Notices.list/create/togglePin/remove`.
4. **8d — Chat (Conversations + Messages)**: il più complesso. Usare `subscribeToTable` per realtime. Considerare paginazione messaggi (oggi `limit:200`).
5. **8e — Activity log**: capire se va lato server o client.

**Bug coperti**: #3 (residuo: tasks/comments/notices/messages davvero persistiti), #10 (allineamento select query), #18 (filtri realtime).

**Rischio**: errori RLS se le policy non sono allineate al ruolo. Testare con utente non-admin.

### Step 9 — Memoizzare filtri/funzioni in liste pesanti

Bug #13. Siti caldi identificati nell'audit:
- `Team` component (riga ~4587): per ogni membro ricalcola `memberTasks(m.id) → filter active/done → percentuale`. Wrappare con `useMemo(() => team.map(m => ({ ...m, stats: compute() })), [team, state.tasks])`.
- `inp()` in form manuale (~2098): definita ad ogni render con nuovi oggetti style. `useCallback`/factory fuori dal render.
- Calendar `getTasksForCalDay`/`getTasksForDay` (riga ~4319-4339): per ogni cella scorre `state.tasks`. Pre-computare un `Map<dayKey, Task[]>` con `useMemo` su `[state.tasks, uid]`.
- Chat: `getUnreadCount` in loop reduce a `VoyageDeskInner:6960`. Memoizzare per conversation.

### Step 10 — Tooling & test

Bug #19, #20, #21, #22.

1. **ESLint + react-hooks plugin**: avrebbe intercettato #1 e #2 al primo run. Config minimo:
   - `eslint`, `@vitejs/plugin-react` (già presente), `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
   - Rule chiave: `react-hooks/exhaustive-deps` warn (non error, per non bloccare il file monolitico esistente)
   - Script `"lint": "eslint src api"`
2. **Test minimi** (vitest + @testing-library/react):
   - Helper date: `sameDay`, `isToday`, `formatYMD` — input ISO con timezone diverso → atteso ok
   - Reducer: `SET_CURRENT_USER`, `MOVE_TASK` (permessi), `RESTORE_TASK`
   - `getAvailableCategories(role)` per i 4 ruoli
3. **Split file monolitico**: progressivo, partire da blocchi indipendenti:
   - `src/components/Chat/*` (~1000 righe, già con suo context)
   - `src/components/Calendar/*`
   - `src/components/BulkTaskCreator/*`
   - `src/state/reducer.js`, `src/state/permissions.js`
   - `src/utils/date.js` (gli helper centralizzati nello step 6)
   - `src/data/mocks.js` (`INITIAL_TASKS`, `INITIAL_CONVERSATIONS`, ecc.)
4. **Vite 6**: aggiornamento opzionale, segnalato dall'audit ma non bloccante.

---

## 4. Bug residui dell'audit originale non ancora toccati

| # | Categoria | Sintesi | Step previsto |
|---|---|---|---|
| #5 (residuo Chat) | Pattern | Letture `CURRENT_USER` nella Chat | 4b |
| #10 | Coerenza dati | `users(photo_url)` chiesto nei comments select ma non altrove — verificare schema | 8 |
| #13 | Performance | Filtri non memoizzati | 9 |
| #16 | Date | `d(daysOffset)` mock sensibile al fuso | (mock only, lasciato) |
| #18 | Realtime | `subscribeToTable` senza filtro | 8 |
| #19 | Build | Vite 5 → 6 | 10 |
| #20 | Tooling | Niente ESLint | 10 |
| #21 | Manutenibilità | `VoyageDesk.jsx` ancora monolitico (7071 → ~7100 righe) | 10 |
| #22 | Test | Nessun test esistente | 10 |
| #25 (Chat) | Reducer-pattern | `_syncCurrentUser`/`_syncTeam`/`_syncCategories` side-effect dentro reducer (anti-pattern React) | 4c |

---

## 5. Come riprendere — prompt suggerito

> Riprendi il bug-fix di VoyageDesk dal branch `claude/kind-edison-Waq2e` (PR #9). Leggi `docs/HANDOFF.md` per lo stato corrente e procedi con lo **Step <N>**. Lavora come finora: ogni step in commit separato sul branch, build verificato (`VITE_SUPABASE_URL=… VITE_SUPABASE_ANON_KEY=… npx vite build`), push, e aggiornamento del CHANGELOG di sessione in fondo alla PR.

Prima di toccare lo step 8 chiedere conferma: "Vuoi cablare Supabase davvero (richiede schema + RLS pronti) o tenere i mock con un flag in attesa?"

---

## 6. Lista bug originale dell'audit — referenza rapida

(Numerazione mantenuta dalla sessione iniziale, riportata qui per non perdere il filo. Severità: 🔴 critico, 🟠 alto, 🟡 medio, 🟢 basso.)

- 🔴 #1 typo `Authconttext.jsx` — ✅
- 🔴 #2 path import `../lib/supabase` rotto — ✅
- 🔴 #3 auth/Supabase mai cablato in `main.jsx` — ✅ (residuo Chat in 4b, mock→DB in 8)
- 🔴 #4 chiamata Anthropic senza `x-api-key` — ✅
- 🟠 #5 `CURRENT_USER`/`TEAM`/`CATEGORIES` globali — ✅ parziale (4b/4c)
- 🟠 #6 `useEffect` con `onClose` nel dep array — ✅
- 🟠 #7 `key={i}` su liste mutabili — ✅
- 🟠 #8 confronti date con `.toDateString()` — ✅
- 🟠 #9 `loading` di AuthContext non usato — ✅
- 🟡 #10 select Supabase incoerente — ⏳ (8)
- 🟡 #11 modello Claude obsoleto — ✅
- 🟢 #12 commento header file sbagliato — ✅
- 🟡 #13 funzioni inline non memoizzate — ⏳ (9)
- 🟡 #14 `assignees.map` su null — ✅ (falso positivo verificato)
- 🟡 #15 fallback `getMember` incompleto — ✅
- 🟡 #16 `d()` mock timezone — ⏸ (mock only)
- 🟡 #17 race in `onAuthStateChange` — ✅
- 🟡 #18 `subscribeToTable` senza filtro — ⏳ (8)
- 🟢 #19 Vite 5 — ⏳ (10)
- 🟢 #20 niente ESLint — ⏳ (10)
- 🟢 #21 file monolitico — ⏳ (10)
- 🟢 #22 niente test — ⏳ (10)
- 🟡 #24 `QuickAddTask` con context — ✅
- 🟡 #27 modello come costante — ✅
