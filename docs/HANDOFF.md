# 🧭 HANDOFF — Sessione Claude Code successiva

> **Scopo**: dare a una nuova sessione Claude Code (web o CLI) il contesto minimo per riprendere lo sviluppo di VoyageDesk dove l'ultima sessione si è fermata.

---

## ⚡ TL;DR — Cosa fare appena entri

1. **Leggi questo file** e poi `docs/CLAUDE.md` (convenzioni di codice e modello dati).
2. **Controlla branch**: lavora su `claude/confident-cerf-riJHb` (PR draft #2 aperta su `main`).
3. **Build sanity check**: `npm install && npm run build` (atteso ~900 kB bundle, ~261 kB gzip).
4. **Decidi il prossimo step** dalla sezione "Cosa è pendente" più sotto.

Niente "scoperta" da fare: il modello dati è chiuso, le anagrafiche e le pratiche funzionano, il calendario è completo. Le prossime mosse riguardano **business intelligence (Fase 3)** e **refactor strutturale**.

---

## 📦 Stato corrente — v0.9.10

| Area | Stato | Note |
|---|---|---|
| Vite project | ✅ | `package.json`, `vite.config.js`, `index.html`, `src/main.jsx` |
| Persistenza | ✅ | `localStorage` versioned (`voyagedesk:state:v1`, `voyagedesk:chat:v1`). Reset da Admin. |
| Modello dati (Fase 1) | ✅ | Clienti, Fornitori, Pratiche `PR-YYYY-NNN` con stati/economia/timeline. Collegamenti task↔cliente↔fornitore↔pratica. |
| Operatività (Fase 2) | ✅ | Notifiche reali + overdue auto, dark mode, presence status, chat (task link + ricerca testo), calendario (mese/settimana/giorno + iCal export). |
| Permessi per ruolo | ✅ | Admin/Manager/Agent/Driver con matrice in `CLAUDE.md`. |
| Responsive | ✅ | Desktop + tablet + mobile (320px+). |
| File monolitico | ⚠️ | `src/VoyageDesk.jsx` ~**10720 righe**. Splittare è il prossimo step della traccia tecnica. |
| TypeScript / Test | ❌ | Da fare dopo lo splitting. |
| Backend | ❌ | Solo localStorage. |

---

## 🌳 Branch & PR

- **Branch corrente**: `claude/confident-cerf-riJHb`
- **PR draft**: `tucobpjmr/TULLIO#2` (https://github.com/tucobpjmr/TULLIO/pull/2)
- **Base**: `main`
- **Commit più recente al momento dell'handoff**: vedi `git log --oneline -5`

**Quando crei nuove modifiche**: continua su questo branch (vedi `CLAUDE.md` per le regole di dev branch) e aggiorna la stessa PR, oppure crea un PR nuovo su `main` se preferisci scope più focalizzato.

---

## 📁 File chiave

Leggili in quest'ordine se vuoi capire cosa hai sotto le mani:

1. **`docs/CLAUDE.md`** — convenzioni codice, modello dati completo, matrice permessi, reducer actions, helpers, ruoli, breakpoint responsive.
2. **`docs/ROADMAP.md`** — stato per fase, voci spuntate, sequenza consigliata.
3. **`docs/CHANGELOG.md`** — storico versioni con dettaglio di ogni fix.
4. **`docs/PROJECT_SPEC.md`** — specifiche tecniche (palette, font, tipologie entità).
5. **`src/VoyageDesk.jsx`** — l'unico file React del progetto. Sezioni delimitate da commenti `// ─── TITOLO ───`. Punti di ingresso utili:
   - `// ─── MOCK DATA ───` → tutti i mock (team, categories, clients, suppliers, practices, notifications, ecc.)
   - `// ─── CONTEXT & REDUCER ───` → state slice + actions + `generateNotifications`
   - `// ─── PERMESSI (v0.8) ───` → helper `canViewTask`/`canEditTask`/`canManagePractices`/...
   - `// ─── ROOT APP ───` → `VoyageDeskInner` con tutti i top-level dispatch/state

---

## 🧰 Comandi quick-start

```bash
# Setup (prima volta)
npm install

# Dev server
npm run dev          # http://localhost:5173

# Build di verifica (~900 kB bundle, ~261 kB gzip)
npm run build

# Preview build
npm run preview
```

**Nessun test suite ancora**: non c'è `npm test`. Verifica manualmente via dev server.

---

## 🎭 Account demo (multi-utente mock)

Switchabili dal dropdown UserSwitcher in alto a destra:

| Utente | Ruolo | Cosa vede |
|---|---|---|
| **Marco Ferretti** (default) | Manager | Tutto tranne Admin |
| **Sofia Conti** | Senior Agent | Come Marco |
| **Luca Moretti** | Junior Agent | Come Sofia |
| **Giulia Ricci** | Driver | Solo task transfer + agenda transfer-oriented in Dashboard. Niente nav Pratiche/Clienti/Fornitori/Team/Trash/Admin. |
| **Roberto Esposito** | Admin | Accesso completo, incluso Cestino + Pannello Admin |

Per ogni utente, le **notifiche** filtrano per `recipientId === currentUserId`. Switcha utente per vedere notifiche diverse.

---

## ⏭ Cosa è pendente — Suggerimenti per la prossima sessione

In ordine di valore/effort:

### 1. 💰 Modulo finanziario (Fase 3 — 🔴 L)
Sblocca grazie al riepilogo economico delle Pratiche (`totalValue`, `cost`, `paid`, `events.type === "payment"`).

Idee di scope:
- Nuova vista "Finanze" o tab nel pannello Admin
- KPI: ricavo totale, costo totale, margine medio, % incassato, scadenze pagamenti
- Grafico margine per pratica (BarChart inline)
- Lista pagamenti pendenti (pratiche con `paid < totalValue` e in_progress/confirmed)
- Export Excel (già abbiamo `xlsx` come dipendenza)

### 2. 📊 Report & Analytics avanzati (Fase 3 — 🟡 M-L)
Estendere `AdminStatsTab`:
- Trend temporale: task chiuse/aperte per settimana
- Margini per cliente / categoria
- Tempo medio completamento task per agente
- Export PDF (libreria `jsPDF` o stampa via browser print API)

### 3. 🔧 Splitting `VoyageDesk.jsx` (Traccia tecnica — 🟡 M)
File a 10720 righe. Splittare in moduli sblocca:
- TypeScript (dopo lo split)
- Test unitari con Vitest
- Code splitting Vite reale

Struttura proposta:
```
src/
├── VoyageDesk.jsx          # solo root + ViewportProvider
├── store/
│   ├── reducer.js          # baseReducer + wrapper + generateNotifications
│   ├── initialState.js
│   └── actions.js          # eventualmente action creators
├── data/
│   ├── team.js
│   ├── categories.js
│   ├── clients.js
│   ├── suppliers.js
│   ├── practices.js
│   ├── tasks.js
│   └── chat.js
├── utils/
│   ├── permissions.js
│   ├── format.js           # formatDate/Time/Eur, getDayKey...
│   ├── client.js           # getClient, resolveLegacyClientId
│   ├── supplier.js
│   ├── practice.js         # getPractice, generatePracticeNumber, getPracticeMargin
│   └── notification.js
├── styles/
│   └── FontLoader.jsx
├── components/
│   ├── primitives/         # Avatar, PriorityBadge, CategoryChip, StatusBadge, NavBadge, Toast
│   ├── layout/             # Topbar, Sidebar, BottomNav, UserSwitcher, ProfileEditor, NotificationsPanel
│   ├── views/              # Dashboard, CalendarPlanner, Team, Trash, AdminView, ClientsView, SuppliersView, PracticesView
│   ├── task/               # TaskSlideOver, QuickAddTask, BulkTaskCreator, SwipeActions
│   ├── chat/               # ChatPanel, ConversationList, ConversationView, Message, VoiceRecorder, TaskLinkChip
│   └── modals/             # ClientEditModal, SupplierEditModal, PracticeEditModal, AIDayPlanner, NoticeEditorModal
└── persistence/
    └── localStorage.js
```

**Attenzione ai globali mutabili**: `TEAM`, `CATEGORIES`, `CURRENT_USER` sono `let` mutabili sincronizzati nel reducer via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. Lo splitting deve preservare queste sincronizzazioni (oppure migrarle finalmente a Context puro — vedi roadmap traccia tecnica).

### 4. 🌐 Backend reale (Traccia tecnica — 🔴 L)
Sostituire `localStorage` con un backend. Schema state già normalizzato (tasks/clients/suppliers/practices con `id` consistenti). Candidati:
- **Supabase** (auth + Postgres + realtime) — già MCP server configurato in questa workspace.
- **Firebase** (più semplice ma vendor lock).
- Backend custom Node + Postgres.

Prima però andrebbe TypeScriptato lo schema.

### 5. ⚙️ Impostazioni agenzia residue (Fase 2 stretch — 🟡 S)
- Template messaggi chat (es. "Conferma viaggio standard")
- Preferenze UI utente (formato date, lingua) — al momento solo dark mode

### 6. 💬 Rich preview pratiche in chat (Fase 2 stretch — 🟡 M)
Quando un messaggio chat contiene un riferimento a `PR-YYYY-NNN`, mostrare una card preview espandibile sotto la bubble (tipo `TaskLinkChip` ma per pratiche).

---

## ⚠️ Gotchas / Cose da sapere

### Globali mutabili
`TEAM`, `CATEGORIES`, `CURRENT_USER` sono `let` mutabili globali. Sono sincronizzati nel reducer via `_syncTeam` / `_syncCategories` / `_syncCurrentUser`. Anche `loadPersistedState` li risincronizza all'hydration. **Non leggere direttamente lo state slice senza considerare questi globali**: gli helper `getMember`, `getClient`, `getSupplier`, ecc. leggono i globali.

### Persistenza & quote
- Chat persiste anche i waveform vocali in base64 → attenzione a quota localStorage (~5MB) in scenari reali.
- `PERSIST_OMIT` esclude `toast`, `lastAction`, `selectedTask`, `selectedClient`, `selectedSupplier`, `selectedPractice`, `showNotif`, `searchQuery`, `filters`. Aggiungi a questa lista per nuovi campi UI volatili.
- `PERSIST_VERSION = 1`. Se cambi la shape, bumpa per invalidare payload obsoleti.

### Permessi
Ogni nuova feature che tocca task/viste deve usare `canViewTask`/`canEditTask`. Ogni voce nav nuova in `NAV_ITEMS` deve avere il campo `roles`. Non bypassare il sistema di permessi: anche i Driver hanno restrizioni precise (solo task `transfer`).

### Generazione notifiche
Le notifiche sono prodotte dal wrapper reducer `generateNotifications(prevState, nextState, action)`. Per aggiungere un trigger:
1. Aggiungi un branch `if (action.type === "...")` dentro `generateNotifications`.
2. Usa l'helper `_mk(type, recipientId, text, relatedType, relatedId)`.
3. Non emettere notifiche per `recipientId === me` (il sender).

### Chat API esterna
ChatPanel + AI Day Planner usano `fetch` su `https://api.anthropic.com/v1/messages`. Era pensato per claude.ai artifacts. **In dev locale serve mock o API key**. Se vuoi sviluppare con AI funzionante, configura `import.meta.env.VITE_ANTHROPIC_API_KEY` e aggiungi il bearer.

### Dark mode
Funziona via `html[data-theme="dark"]` che override le CSS vars in `FontLoader`. **Le tinte hex inline (es. `#fff`)** restano statiche per coerenza (in genere sono testo su sfondo navy che non cambia). Se aggiungi nuovi componenti, **usa sempre `var(--*)`** per i colori.

### iCal export
Esporta solo task assegnate all'utente corrente con `dueDate`. Il `.ics` generato è compatibile con Google Calendar / Apple Calendar / Outlook. Se serve esportare tutti i task (admin), basta passare un userId diverso o togliere il filtro `assignees.includes(userId)` in `exportIcal`.

### Numerazione pratiche
`generatePracticeNumber()` scansiona l'anno corrente. **Quando arriva il 2027**, il primo PR ricomincia da `001`. Atteso.

---

## 🎯 Convenzioni minime (vedi CLAUDE.md per il dettaglio)

- **React 18 + hooks**, `useReducer + Context` per state globale, `useState` locale chat.
- **CSS inline + variables**, NO Tailwind, NO librerie CSS.
- **Lingua UI**: italiano (label, placeholder, toast).
- **Naming**: PascalCase componenti, camelCase helpers, UPPER_SNAKE_CASE actions, kebab-case CSS vars.
- **Immutabilità**: sempre spread, mai mutare direttamente.
- **Hover**: `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`.
- **Animazioni ingresso**: classi `slide-up`, `fade-in`, `slide-right`.
- **Responsive**: `const { isMobile, isDesktop } = useViewport()`.
- **No drag&drop su mobile**: usare SwipeActions.

---

## 🧪 Verifica rapida a inizio sessione

Per assicurarti che tutto giri:

```bash
npm install
npm run build  # deve dare "✓ built in ~2s", ~899 kB bundle
npm run dev    # apre http://localhost:5173
```

Nel browser, controlla in quest'ordine:
1. Dashboard carica e mostra le 4 tab (Coda Globale, Personale, Scadute, Urgenti) per Marco.
2. Topbar 🔔 → 3 notifiche per Marco con badge "3 da leggere".
3. Click su una notifica task → si apre TaskSlideOver.
4. Switcha a Roberto → vista Admin accessibile, badge "2" su voce Admin (Elena + Matteo pending).
5. Switcha a Giulia → vede agenda Driver con chip Oggi/Domani/Tutte.
6. UserSwitcher → toggle "🌙 Tema scuro" → tutta la UI scura. Refresh → preferenza persiste.
7. Calendario → toggle "🗓 Giorno" → vista giornaliera con time-grid + now-line. Click "📥 iCal" → scarica `.ics`.
8. Admin → Import/Export → "Esporta backup JSON" → contiene `clients`, `suppliers`, `practices`, `notifications`, `theme`.

Se uno di questi step fallisce, **investiga prima di iniziare nuove feature**.

---

## 📞 Quando in dubbio

- **Convenzioni**: `docs/CLAUDE.md`
- **Storico**: `docs/CHANGELOG.md`
- **Roadmap**: `docs/ROADMAP.md`
- **Specifica tecnica**: `docs/PROJECT_SPEC.md`
- **Stato repo**: `git log --oneline -20 && git status`
- **Stato PR**: vedi `mcp__github__pull_request_read` su `tucobpjmr/TULLIO#2`

Buon lavoro 🚀
