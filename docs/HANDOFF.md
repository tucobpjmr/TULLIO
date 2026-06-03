# Handoff — Code Quality & Critical Fixes

**Branch:** `claude/inspiring-archimedes-ZuILi`
**PR:** [#1 — fix: 4 criticità (JSON.parse, endpoint AI, identità utente)](https://github.com/tucobpjmr/TULLIO/pull/1)
**Data:** 2026-06-03

Questo documento riassume lo stato del lavoro di hardening del codice di VoyageDesk (`src/VoyageDesk.jsx`) e indica esplicitamente cosa è già stato fatto e cosa resta in roadmap.

---

## 1. Cosa è stato fatto

### Commit 1 — `8ec0bfb` — Criticità 🔴

| Bug | Fix | Linea |
|-----|-----|-------|
| `JSON.parse` della risposta AI senza try/catch → crash | Wrap in try/catch con messaggio utente | ~2742 |
| Fetch diretta a `api.anthropic.com` (CORS + no auth) | Endpoint configurabile via `VITE_AI_ENDPOINT`, default a proxy `/api/ai/plan-day` | ~2715 |
| `TaskSlideOver` firmava commenti come "Marco Ferretti" / avatar "MF" | Usa `getMember(currentUserId)` | ~4074, 4230 |
| Prompt AI hardcoded a "Marco Ferretti (Manager)" | Usa nome e ruolo reali dall'utente loggato | ~2693 |
| `SwipeActions`, queue, AIDayPlanner leggevano `CURRENT_USER` globale | Aggiunto prop `currentUserId` passato dal Dashboard (fallback al globale) | ~785, 3261, 3477, 3643, 4279 |

### Commit 2 — `0944c56` — Igiene repo

- Aggiunto `.gitignore` (era assente): esclude `node_modules/`, `dist/`, `.env`, file di editor.
- Committato `package-lock.json` per build riproducibili.

### Commit 3 — `f0ae562` — Criticità 🟡

| Bug | Fix | Linea |
|-----|-----|-------|
| `parseFloat` su CSV italiani (`"1,5"` → `NaN`) | `.replace(",", ".")` prima del parse | 2361 |
| `parseInt` senza radix + nessun clamp | radix 10 + `Math.max/min` clamp | 2223, 6288, 6430 |
| `setTimeout` orfano in `SwipeActions.closeAndDo` → race unmount | Timer in `useRef`, clearato in cleanup | 785-880 |
| `URL.revokeObjectURL` ritardato senza tracking → leak su export ripetuti | Ref array + cleanup on-unmount | 6457-6485 |
| `useEffect [msgs.length]` → stale closure su ultimo msg | Dipende da `lastMsg.id` + `lastMsg.sender` | 5156-5166 |
| `new Date()` ricreato in ogni render del CalendarPlanner | `todayStr` memoizzato | 4283 |
| `key={i}` su 9 liste dinamiche (anteprime CSV, AI plan, calendario, commenti) | Chiavi stabili (`id`, ISO date, contenuto) | sparse |

### Commit 4 — `e32e2b2` — Criticità 🟢

- **A11y**: helper `clickableProps()` applicato a ~12 click-div principali (chips filtri, card task in tutte le code, day cell calendario, card membro Team, conversazioni chat). Gli utenti keyboard-only ora possono navigare e selezionare con Enter/Space.
- **UX**: il `window.confirm` del cestino ora indica esplicitamente la reversibilità ("Il task potrà essere ripristinato dal Cestino in qualsiasi momento").
- **Validazione**: `QuickAddTask` ha `min=now` su `datetime-local` per evitare scadenze nel passato per typo.

---

## 2. Roadmap fix rimasti

### Priorità ALTA

#### R-1 — Rimuovere `CURRENT_USER`, `TEAM`, `CATEGORIES` mutabili globali
**Impatto:** Alto · **Sforzo:** Medio-alto · **Rischio:** Medio

Le tre variabili globali `let CURRENT_USER`, `let TEAM`, `let CATEGORIES` (linee 121-260 circa) sono mantenute in sync dal reducer tramite `_syncTeam`, `_syncCategories`, `_syncCurrentUser` con mutazione in-place. Conseguenze:

- componenti memoizzati che catturano i riferimenti via closure non si aggiornano dopo update dell'Admin;
- utility a livello modulo (`getMember`, `getAssignableTeam`, `getRoleType`, `canViewTask`) leggono i globali, complicando il testing e creando potenziali stale read.

**Azione:**

1. Convertire le utility che ricevono `userId`/`memberId` in pure: prendere `team` come parametro esplicito (es. `getMember(teamArr, id)`).
2. Eliminare `_syncTeam` / `_syncCategories` / `_syncCurrentUser`.
3. Esporre `team` e `categories` solo via `AppContext`. I componenti li leggono con `useContext(AppContext)`.
4. Aggiornare ogni call site (~30+).

**Suggerimento:** fare un branch dedicato (`refactor/remove-globals`) e procedere per layer (prima utility pure, poi context provider, poi rimozione globali). Build dopo ogni step.

#### R-2 — `useEffect` "mark as read" in `ConversationView`: parent memoization
**Impatto:** Medio · **Sforzo:** Basso · **Rischio:** Basso

`VoyageDesk.jsx:5111-5130`: `setMessages` arriva come prop non memoizzata; l'effect ri-runa ad ogni render del parent. Non è un bug visibile, ma carica lavoro inutile e può portare a flickering del badge "non letto" su chat con molto traffico.

**Azione:**

```jsx
// in VoyageDeskInner o equivalente
const setMessagesStable = useCallback(setMessages, []);
// poi passarlo a ChatPanel come prop
```

In alternativa: dipendere solo da `[conv.id]` e ottenere `setMessages` via ref.

#### R-3 — Split single-file in moduli
**Impatto:** Altissimo sul DX · **Sforzo:** Alto · **Rischio:** Medio

7071 righe / 351 KB in un singolo `VoyageDesk.jsx` rendono HMR lento, IDE in difficoltà e code review impraticabili. Il `README` e la `ROADMAP` già lo prevedono.

**Azione consigliata** (split incrementale, una PR per cartella):

```
src/
├── VoyageDesk.jsx          # root component + provider
├── main.jsx
├── lib/
│   ├── reducer.js
│   ├── constants.js        # TEAM, CATEGORIES, PRIORITIES, STATUSES
│   ├── permissions.js      # canViewTask, canEditTask, isAdmin
│   ├── dates.js            # formatDate, isOverdue, getDayKey
│   └── csv.js              # parsing import/export
├── components/
│   ├── chat/               # ChatPanel, ConversationView, VoicePlayer
│   ├── tasks/              # TaskSlideOver, BulkTaskCreator, SwipeActions
│   ├── dashboard/          # Dashboard, queues, NoticeBoard
│   ├── calendar/           # CalendarPlanner
│   ├── team/               # Team views, MemberCard
│   ├── admin/              # AdminIOTab, etc.
│   └── ai/                 # AIDayPlanner
└── hooks/
    ├── useViewport.js
    └── useToast.js
```

### Priorità MEDIA

#### R-4 — Backend per l'endpoint AI
**Impatto:** Bloccante per la feature in produzione · **Sforzo:** Basso (per un endpoint serverless)

L'endpoint `/api/ai/plan-day` (introdotto in commit 1) non esiste ancora. Implementare:

- una funzione Vercel/Netlify/Cloudflare Workers (es. `api/ai/plan-day.ts`);
- la chiave Anthropic in env server (`ANTHROPIC_API_KEY`);
- proxy che inoltra `messages` + aggiunge headers `x-api-key`, `anthropic-version: 2023-06-01`;
- rate limiting (per IP e/o per utente);
- aggiornare il modello al più recente (`claude-sonnet-4-6` o `claude-opus-4-7`).

#### R-5 — `document.addEventListener` in `SwipeActions`
**Impatto:** Basso (micro-perf) · **Sforzo:** Basso

`VoyageDesk.jsx:804-819`: ad ogni cambio di `opened` aggiunge/rimuove due listener globali. Stabilizzare con `useRef` per il handler e deps `[]`, con logica condizionale dentro.

#### R-6 — Modello AI da aggiornare
Hardcoded `claude-sonnet-4-20250514` → usare l'ID corrente (es. `claude-sonnet-4-6`). Da fare insieme a R-4.

#### R-7 — Toast con Undo invece di `window.confirm`
**Impatto:** UX significativa · **Sforzo:** Medio

I `window.confirm()` bloccanti per soft-delete andrebbero sostituiti da toast con pulsante "Annulla" (5-10s). Pattern già visto in Gmail/Linear.

- Già esiste un meccanismo di toast nel reducer (`CLEAR_TOAST` a riga 1085 ca.). Estenderlo per supportare azioni.
- Eliminare `window.confirm` da 8 spot (`:4122, :5854, :5861, :6325, :6529, :6775, :6782, :6917`).

### Priorità BASSA

#### R-8 — Splittare CSS inline in classi
File a 351KB pesa per buona parte di stili inline; un sistema basato su CSS variables (già in uso) + classi utility ridurrebbe re-render e size. Da fare con R-3.

#### R-9 — Vocali "simulate playback" → audio reale o etichetta mock
`VoicePlayer` simula il playback con `setInterval`. Allineare `README`/`PROJECT_SPEC` o implementare con MediaRecorder/Audio API.

#### R-10 — Test
Zero test automatici. Almeno:

- smoke test su `reducer.js` (azioni principali: ADD_TASK, MOVE_TASK, RESTORE_BACKUP);
- snapshot test su `Dashboard` con vari `state.currentUserId` per regression di permessi;
- e2e con Playwright per swipe + drag-drop + import CSV.

### Già OK / Non azione

- Nessun XSS, nessun `eval`, nessuna API key esposta nel sorgente.
- Build Vite pulita, no warning bloccanti (solo size > 500 KB, mitigato da R-3).
- `.gitignore` e `package-lock.json` ora in repo.

---

## 3. Convenzioni applicate

- Aggiunto helper `clickableProps(handler, ariaLabel)` per a11y dei click-div.
- Endpoint AI ora prende da `import.meta.env.VITE_AI_ENDPOINT` (configurare in `.env.local` per dev).
- Tutti i call site che usavano `CURRENT_USER` globalmente hanno ora un fallback `currentUserId || CURRENT_USER` durante la migrazione graduale (vedi R-1 per rimozione finale).

## 4. Setup dev rapido

```bash
git checkout claude/inspiring-archimedes-ZuILi
npm install
npm run dev          # http://localhost:5173
npm run build        # verifica build production
```

## 5. Note operative per la prossima sessione

- La PR #1 è in **draft**. Marcare ready-for-review quando il backend AI (R-4) è pronto, altrimenti la feature "Pianifica la mia giornata" fallirà silenziosamente con messaggio di errore.
- Nessun workflow CI configurato sul repo: aggiungerne uno minimo (`build + lint`) come prima cosa, prima del merge.
- Il file `test/esempio_import_task.csv` può essere riutilizzato come fixture per i test su CSV (R-10).

---

**Autore:** Claude Code sessione `01YMXoQpT3QskQHbmwQqJohm`
