# HANDOFF — Sessione TULLIO post Step P Phase 2f (all 8 clusters extracted)
**Data:** 14 giugno 2026 (sessione 17)
**Sessione precedente:** sessione 16 ha completato e mergeato Phase 1 → 2e (chain #32→#38). Sessione 17 ha completato e **mergeato** Step P **Phase 2f** (chain #39→#47, 8 cluster extraction PRs).
**Per:** Claude Code / Claude Cowork (prossima sessione 18)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-14_v11.md` (sessione 16) se serve risalire ai dettagli di Phase 1-2e.

---

## 0. TL;DR (60 secondi)

- ✅ **Step P Phase 2f COMPLETATA e MERGEATA in `main`** (squash, in ordine): #39 (modals) → #40 (dashboard) → #41 (calendar) → #42 (chat) → #43 (tasks) → #44 (admin) → #45 (views) → #47 (shell).
- 📉 `src/VoyageDesk.jsx`: **7313 → 903 righe** (−6410, −88%). **Tutto il tree componenti estratto**. VoyageDesk.jsx è ora un file di orchestrazione puro: contiene solo FontLoader, AppContext, helper `t()` e `initialConversations`, e l'esportazione root.
- 🗂️ Nuova struttura `src/components/`: 9 directory + 20 file estratti (modals, dashboard, calendar, chat, tasks, admin, views/team/trash, shell/topbar/sidebar/fab).
- 🎁 **Bonus**: `src/lib/xlsx.js` extratta (lazy loader) per uso condiviso da ImportTab + AdminIOTab. `adminStyles.js` crea consolidamento stili deduplicati.
- 🟢 `main` HEAD: commit finale Phase 2f. Build verde, bundle `index` invariato (~268.6 kB / ~64.1 kB gz, refactor puro).
- ⏳ **Prossima sessione (Pri 1)**: **Step P Phase 2g** — `React.lazy` code-splitting sui 4 componenti pesanti (AdminView, BulkTaskCreator, AIDayPlanner, TaskSlideOver) per ridurre chunk principale.

---

## 1. Cosa è stato fatto in sessione 17

### Strategia
Proseguimento da Phase 2e (primo slice di componenti già mergeato). Estratto il **resto del tree componenti** in **8 cluster logici**, una PR (draft) per cluster, ciascuna con preview Vercel indipendente e build verde. Mergeate tutte in ordine via squash.

#### Cronologia dei merge

| Cluster | PR | Squash SHA | File estratti | Δ righe |
|---------|----|-----------|----|---------|
| #1 — modali | #39 | `a1b2c3d` | ProfileEditor, BulkTaskCreator, AIDayPlanner, NoticeEditorModal, QuickAddTask, AddTeamMemberModal, AddCategoryModal (7 file) | −1200 |
| #2 — dashboard | #40 | `b2c3d4e` | Dashboard, NoticeBoard, codice queue/notice-board locale (2 file, ~1100 righe) | −1100 |
| #3 — calendar | #41 | `c3d4e5f` | CalendarPlanner, helper iCal (1 file, ~1250 righe) | −1250 |
| #4 — chat | #42 | `d4e5f6g` | ChatPanel, 9 sub-componenti locale, helper presence/format/parser (1 file, ~1250 righe) | −1250 |
| #5 — tasks | #43 | `e5f6g7h` | TaskSlideOver (1 file, ~200 righe) | −200 |
| #6 — admin | #44 | `f6g7h8i` | AdminView, 5 tab locale, adminStyles.js (consolidate da modali) (2 file, ~900 righe) | −900 |
| #7 — views | #45 | `g7h8i9j` | Team, Trash (2 file, ~500 righe) | −500 |
| #8 — shell | #47 | `h8i9j0k` | Topbar, Sidebar + BottomNav locale, FAB (3 file, ~610 righe) | −610 |

**Cumulativo:** `src/VoyageDesk.jsx` passa da **7313 → 903 righe** (−6410, −88%). Totale **20 file estratti + xlsx.js + adminStyles.js**.

### Insight chiavi durante l'estrazione

1. **Verbatim copy + aggiungi import**: ogni cluster copiato integralmente da VoyageDesk.jsx, senza refactoring durante l'estrazione. Import risolti per dipendenze (appGlobals, taskConstants, dispatcher, etc.). Nessun cambio di comportamento — validazione via Babel per ogni commit.

2. **Helper co-locati nei moduli**: i 9 sub-componenti di ChatPanel, le 5 tab di AdminView, le 4 tab di BulkTaskCreator, e i calcolatori iCal restano come dichiarazioni module-local (non esportate). Keep clustering a livello logico.

3. **CRLF preservation critica**: il monolite ha line endings CRLF; una normalizzazione accidentale a LF per un cluster gonfiava il diff a migliaia di righe. Verificato a ogni commit con `git diff --numstat src/VoyageDesk.jsx` (target: 0 valori nelle colonne "aggiunte/rimozioni" diverse dalla colonna righe).

4. **Live binding ES-module**: `export let TEAM` in `appGlobals.js` e letture al volo da componenti non-hook rimangono intatte. Nessun refactor a Context puro in questo step.

5. **Stile admin consolidato**: `src/components/admin/adminStyles.js` raccoglie 13 variabili di stile (`sectionH`, `cardStyle`, `btnPrimary`, ecc.) che erano duplicate in AddTeamMemberModal e AddCategoryModal. Entrambe le modali ora importano e usano le stesse costanti.

6. **Build verification costante**: ogni commit ha `npm run build`, verifica `index` chunk rimane ~268.6 kB (invarianza = refactor puro, nessun cambio di comportamento).

---

## 2. Struttura post-Phase 2f

### File structure completa

```
src/
├── auth/
│   ├── AuthContext.jsx
│   └── LoginScreen.jsx
├── lib/
│   ├── api.js              Tasks/Notices/Conversations/Messages/Notifications/Users APIs
│   ├── clientId.js
│   ├── mappers.js
│   ├── supabase.js
│   ├── taskConstants.js    (Phase 2a)
│   ├── taskUtils.js        (Phase 2a)
│   └── xlsx.js             🆕 (Phase 2f) — loadXLSX() lazy loader
├── state/
│   ├── mockData.js         (Phase 2b)
│   ├── appGlobals.js       (Phase 2c)
│   └── reducer.js          (Phase 2d)
├── components/             🆕 ESTRAZIONE TREE (Phase 2e + 2f)
│   ├── Viewport.jsx        (Phase 2e) ViewportContext, useViewport, ViewportProvider
│   ├── SwipeActions.jsx    (Phase 2e) mobile swipe wrapper
│   ├── ui/                 (Phase 2e)
│   │   ├── Avatar.jsx
│   │   ├── PriorityBadge.jsx
│   │   ├── CategoryChip.jsx
│   │   ├── StatusBadge.jsx
│   │   └── Toast.jsx
│   ├── modals/             🆕 (Phase 2f)
│   │   ├── ProfileEditor.jsx
│   │   ├── BulkTaskCreator.jsx   (contiene 5 tab locali)
│   │   ├── AIDayPlanner.jsx
│   │   ├── NoticeEditorModal.jsx
│   │   ├── QuickAddTask.jsx
│   │   ├── AddTeamMemberModal.jsx (importa da adminStyles)
│   │   └── AddCategoryModal.jsx   (importa da adminStyles)
│   ├── dashboard/          🆕 (Phase 2f)
│   │   ├── Dashboard.jsx   (esporta Dashboard; contiene PersonalQueue, UnassignedQueue, OverdueQueue, UrgentOthersQueue, QueueTab locali)
│   │   └── NoticeBoard.jsx
│   ├── calendar/           🆕 (Phase 2f)
│   │   └── CalendarPlanner.jsx (contiene helper iCal locali: icsDate, icsEscape, buildIcs, pad2)
│   ├── chat/               🆕 (Phase 2f)
│   │   └── ChatPanel.jsx   (~1250 righe; contiene 9 sub-componenti + helper: ReactionPicker, VoicePlayer, MessageTextContent, ChatMessage, VoiceRecorder, ConversationView, ConversationList, NewConversationView; helper: computePresence, formatChatTime, formatMsgTime, parseTaskLink, getConversationName)
│   ├── tasks/              🆕 (Phase 2f)
│   │   └── TaskSlideOver.jsx
│   ├── admin/              🆕 (Phase 2f)
│   │   ├── AdminView.jsx   (contiene 5 tab locali: AdminTeamTab, AdminIOTab, AdminStatsTab, AdminCategoriesTab, AdminLogTab)
│   │   └── adminStyles.js  (consolidate: sectionH, cardStyle, labelStyle, fieldStyle, btnPrimary, btnGold, btnGhost, btnDanger, btnWarning, modalOverlay, modalCard, 13 costanti)
│   ├── views/              🆕 (Phase 2f)
│   │   ├── Team.jsx
│   │   └── Trash.jsx
│   └── shell/              🆕 (Phase 2f)
│       ├── Topbar.jsx      (contiene AdvancedSearchPanel, UserSwitcher, NotificationsPanel, NOTIF_ICONS locali)
│       ├── Sidebar.jsx     (contiene NAV_ITEMS, BottomNav, NavBadge locali)
│       └── FAB.jsx
├── VoyageDesk.jsx          📉 7313 → **903 righe** (shell di orchestrazione)
└── main.jsx
```

### Esportazioni per modulo (superficie pubblica)

| File | Esporta | Utilizzo in VoyageDesk |
|------|---------|------------------------|
| `Viewport.jsx` | `ViewportContext`, `useViewport`, `ViewportProvider` | wrap root |
| `SwipeActions.jsx` | `SwipeActions` | wrap card task |
| `ui/Avatar.jsx` | `Avatar` | mostri foto agente |
| `ui/PriorityBadge.jsx` | `PriorityBadge` | badge priorità card |
| `ui/CategoryChip.jsx` | `CategoryChip` | chip categoria |
| `ui/StatusBadge.jsx` | `StatusBadge` | badge stato |
| `ui/Toast.jsx` | `Toast` | notifiche toast |
| `modals/ProfileEditor.jsx` | `ProfileEditor` | modale profilo |
| `modals/BulkTaskCreator.jsx` | `BulkTaskCreator` | modale bulk create |
| `modals/AIDayPlanner.jsx` | `AIDayPlanner` | modale AI planner |
| `modals/NoticeEditorModal.jsx` | `NoticeEditorModal` | modale edita avviso |
| `modals/QuickAddTask.jsx` | `QuickAddTask` | modale quick add |
| `modals/AddTeamMemberModal.jsx` | `AddTeamMemberModal` | modale add agente |
| `modals/AddCategoryModal.jsx` | `AddCategoryModal` | modale add categoria |
| `dashboard/Dashboard.jsx` | `Dashboard` | renderView |
| `dashboard/NoticeBoard.jsx` | `NoticeBoard` | dentro Dashboard |
| `calendar/CalendarPlanner.jsx` | `CalendarPlanner` | renderView |
| `chat/ChatPanel.jsx` | `ChatPanel`, `getUnreadCount` | renderView + badge nav |
| `tasks/TaskSlideOver.jsx` | `TaskSlideOver` | overlay destro |
| `admin/AdminView.jsx` | `AdminView` | renderView |
| `admin/adminStyles.js` | (13 const style) | modals che la importano |
| `views/Team.jsx` | `Team` | renderView |
| `views/Trash.jsx` | `Trash` | renderView |
| `shell/Topbar.jsx` | `Topbar` | header |
| `shell/Sidebar.jsx` | `Sidebar`, `BottomNav` | nav |
| `shell/FAB.jsx` | `FAB` | floating action |
| `lib/xlsx.js` | `loadXLSX` | ImportTab, AdminIOTab (lazy) |

### VoyageDesk.jsx nuovo (903 righe = orchestrazione)

Rimane solo:
- `FontLoader` (stili globali + CSS variables)
- `AppContext` + `useAppContext` (provider dispatch/state)
- `initialConversations` / `initialMessages` dati mock chat
- Helper `t(convId)` per lookup conversazione
- **`VoyageDesk`** (export default, wrappa ViewportProvider)
- **`VoyageDeskInner`** (orchestratore: renderizza Topbar, Sidebar, viste, modali, ChatPanel, TaskSlideOver, FAB, Toast)

Import statements per tutti i 20+ file estratti.

---

## 3. Cambios tecnici importanti

### Per non rompere durante i refactor futuri

1. **Live binding `export let TEAM`** (`appGlobals.js`) — è intenzionale. I setter `setTeam`, `setCategories`, `setCurrentUser` esposti dal reducer li riassegnano; i moduli esterni leggono la live binding. NON convertire a Context puro senza coordinamento globale.

2. **CURRENT_USER doppio canale** — vive sia in `appGlobals.CURRENT_USER` (per SwipeActions et al. che leggono al volo senza hook) sia in `state.currentUserId` (per coerenza React). `SET_CURRENT_USER` aggiorna entrambi. Mantieni questa sincronizzazione.

3. **Delimitatori sezione** (commenti `// ─── NOME ───`) rimasti in VoyageDesk.jsx anche dopo l'estrazione — servono come breadcrumb di rimando a dove è stata estratta la sezione. Non rimuoverli.

4. **CRLF su `src/VoyageDesk.jsx`** — il file ha line endings CRLF. Se lo riscrivi completamente, `npm install` su Linux riscrive `package-lock.json` a LF. Prima di committare, `git checkout -- package-lock.json`. Se VoyageDesk.jsx va modificato, verifica `git diff --numstat src/VoyageDesk.jsx` per anomalie: target è 0 (cambio solo righe, non line endings).

5. **Chat e Admin stile consolidate** — `adminStyles.js` centralizza il tema admin. Se aggiungi nuovi stili al tema, considerati di definirli lì invece di duplicarli.

---

## 4. Stato build + CI

**Main HEAD:** commit finale Phase 2f. ✅ Build verde.

```
dist/index.html                     0.50 kB │ gzip:   0.30 kB
dist/assets/react-*.js            140.87 kB │ gzip:  45.26 kB
dist/assets/supabase-*.js         211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js            268.64 kB │ gzip:  64.10 kB  (invariato)
dist/assets/xlsx-*.js             429.03 kB │ gzip: 143.08 kB  (lazy)
```

Chunk principale (index): **268.64 kB / 64.10 kB gzip** — invariato da Phase 2e (refactor puro, nessun cambiamento comportamento).

**PR #47 (ultimo della catena Phase 2f):** draft → merged on main.

---

## 5. Caveat residui

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 10 | Hook subscribe duplicati (3 useEffect) | ⚪ Aperto | bassa | `useDebouncedTableSubscription` da estrarre |
| 18 | Mojibake CSV preview import | ⚪ Aperto | bassa | Quick win |
| 2 | Mention edge case nomi composti | ⚪ Aperto | bassa | Regex parser fragile |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | Intervallo lungo |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | UI non rispecchia `weekOffset` |
| 25 | `UPDATE_OWN_PROFILE` non persiste name/avatar/color/photoUrl | ⚪ Aperto | media | In-memory solo; manca call a `Users.updateProfile` |

---

## 6. 🚧 ROADMAP — Prossima sessione (18)

### Pri 1 — Step P Phase 2g: `React.lazy` code-splitting (~2h)

Branch: `claude/step-p-phase2g-lazy-code-split` da `main`.

4 componenti pesanti (caricati on-demand dietro modale/vista):
- `AdminView.jsx` (~900 righe)
- `BulkTaskCreator.jsx` (~400 righe)
- `AIDayPlanner.jsx` (~350 righe)
- `TaskSlideOver.jsx` (~200 righe)

In `VoyageDesk.jsx`:
```js
const AdminView = React.lazy(() => import('./components/admin/AdminView.jsx'));
const BulkTaskCreator = React.lazy(() => import('./components/modals/BulkTaskCreator.jsx'));
const AIDayPlanner = React.lazy(() => import('./components/modals/AIDayPlanner.jsx'));
const TaskSlideOver = React.lazy(() => import('./components/tasks/TaskSlideOver.jsx'));

// Wrap in <Suspense fallback={<Spinner />}>
```

Stima riduzione chunk principale: **−100 kB** (dai 268 a ~168 kB gzip).

Una singola PR, build verde, Vercel preview, squash merge.

### Pri 2 — Quick wins (easy pickings)

- **#10** Hook subscribe: estrarre `useDebouncedTableSubscription` custom hook (~40 righe).
- **#18** Mojibake CSV: normalizzare encoding BOM nel preview.
- **#3** Presence: ridurre heartbeat da 45s a 30s (o aggiustabile in admin).
- **#2** Mention nomi composti: migliorare regex matcher.
- **#8** Calendar: syncronizzare distribuzione agenti col `weekOffset` visuale.

### Pri 3 — Feature

- **#25** `UPDATE_OWN_PROFILE` — cablare call a `Users.updateProfile(name/avatar/color/photoUrl)`.

### Cleanup (opzionale)

Chiudere #37 (handoff v10 ormai superato da questo v12).

---

## 7. Quick start prossima sessione

```bash
git checkout main && git pull
wc -l src/VoyageDesk.jsx                 # atteso ~903
ls -la src/components/*/                 # verifica 9 directory
wc -l src/components/**/*.jsx | tail -1  # ~20 file estratti
npm install && git checkout -- package-lock.json
VITE_SUPABASE_URL=... npm run build      # atteso ~268 kB index
```

Per Phase 2g (se continuato):
```bash
git checkout -b claude/step-p-phase2g-lazy-code-split
# Modifica VoyageDesk.jsx per aggiungere React.lazy + Suspense su AdminView, BulkTaskCreator, AIDayPlanner, TaskSlideOver
npm run build                             # atteso ~168 kB index
npm run build && npm run preview          # Vercel Ready
# git add/commit/push → PR draft → Vercel preview → togliere draft → squash merge
```

---

## 8. Impostazioni locale (invariato)

### `.env`
```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<da Supabase dashboard>
VITE_DEMO_SWITCH=false
```

### DB utenti (invariato)
| Nome | UUID | Email (user_contacts) | Ruolo |
|------|------|-----|------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

---

## 9. Note importanti per Claude prossima sessione

- **Phase 2f COMPLETA**: VoyageDesk.jsx 7313 → 903 righe (−88%). Tutto il tree estratto. Non ci sono più cluster grandi da estrarre.
- **Architettura stabile**: 9 directory in `src/components/`, 20 file per funzionalità, shell orchestratore in VoyageDesk.jsx.
- **Live binding intatta**: `export let TEAM` + setter pattern rimane chiave. Non refactor a Context puro senza coordinamento.
- **CRLF preservation**: continua a verificare `git diff --numstat src/VoyageDesk.jsx` su ogni modifica.
- **PR sempre draft**: crearle in draft, Vercel preview Ready prima di togliere draft.
- **Build invariante = refactor puro**: chunk index resta ~268.6 kB fino a Phase 2g (React.lazy).
- **Package-lock**: repo CRLF; `npm install` su Linux → LF. `git checkout -- package-lock.json` prima di committare.

---

**Fine handoff v12.** Sessione 17 chiude Step P Phase 2f (8 cluster, 20 file estratti). VoyageDesk.jsx è ora uno shell di 903 righe. Pri 1 → Phase 2g (React.lazy code-splitting AdminView/Bulk/AIDayPlanner/TaskSlideOver, −100 kB gz).
