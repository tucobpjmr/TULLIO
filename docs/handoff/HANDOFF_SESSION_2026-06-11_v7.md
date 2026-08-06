# HANDOFF — Sessione TULLIO post code-review (Step R)
**Data:** 11 giugno 2026 (sessione 13)
**Sessione precedente:** Claude Code on the web — sessione 12 ha chiuso Step L + Step N (handoff v6) e ha mergeato Step M + Step O (PR #20 su `main`).
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-11_v6.md` (sessione precedente) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **Code-review approfondita** (7 angoli × 6 candidati → verifica 1-vote, ~40 candidati grezzi → 10 finding sopravvissuti). Report inline in chat sessione 13.
- ✅ **PR #22 aperta (draft)** branch `claude/modest-cannon-g9c1de`: chiude **6 finding** della review (3 critici + 3 minori). Build CI verde, preview Vercel **Ready**. **Pronta da mergeare** (squash).
- ✅ **Caveat #17 risolto** (TEAM seed mock al primo login — race AuthGate + alias mutabile su `state.team`).
- ✅ **Bug DELETE realtime origin** scoperto e fissato (regressione invisibile di Step L: `payload.old` non era controllato). Migration `REPLICA IDENTITY FULL` applicata via MCP.
- ⏳ **Prossima sessione**: mergeare PR #22, poi **Step Q** (hardening realtime — withOrigin su Comments/Users, race init/realtime chat, toast su setReactions/markRead), oppure **Step P** (refactor monolite).

---

## 1. Riepilogo lavori sessione 13 (cronologico)

| # | Cosa | Commit / PR | Stato |
|---|------|-------------|-------|
| 1 | Code-review completa del branch (Steps D→O) | `/code-review` con effort high | ✅ |
| 2 | Fix finding critici #1/#3/#4 della review | `5fbb705` PR #22 (draft) | ✅ verificato build + preview |
| 3 | Fix finding minori (signed URL cache, upload guards, stale closure) | `3526aa0` PR #22 (draft) | ✅ verificato build + preview |
| 4 | Migration `20260611_replica_identity_full.sql` | applicata via MCP + versionata | ✅ verificata (`relreplident='f'`) |

### Cosa contiene la PR #22

| File | Cosa |
|------|------|
| `src/lib/api.js` | (a) `subscribeToTable`: filtro origin legge anche `payload.old?.origin_client` (fix DELETE). (b) `Conversations.update`: imposta `updated_at` di default. (c) `Messages.getFileUrl`: cache in-memory `Map<path,{url,expiresAt}>` con TTL 55min. |
| `src/VoyageDesk.jsx` | (a) `makeInitialState`: `team`/`categories` sono ora **copie** dei globali, non alias. (b) `sendFile`: validazione client 25 MB + guardia `mountedRef` per unmount mid-upload. (c) Costante `MAX_FILE_SIZE`. (d) `dispatch` + `currentUserIdRef` spostati prima di `openTaskById` per consentire `dispatch` nelle deps del callback senza TDZ. |
| `src/main.jsx` | `AuthGate` attende `profile` (non solo `session`) prima di montare `VoyageDesk` → il reducer non si inizializza più con team vuoto al primo login. Risolve caveat #17. |
| `supabase/migrations/20260611_replica_identity_full.sql` | NEW. `REPLICA IDENTITY FULL` su tasks/notices/conversations/messages — serve per filtrare l'eco DELETE realtime via `payload.old.origin_client`. **Applicata su DB.** |

### Verifica build (container, ultimo commit 3526aa0)

```
dist/index.html                     0.50 kB │ gzip:   0.30 kB
dist/assets/react-*.js            140.87 kB │ gzip:  45.26 kB
dist/assets/supabase-*.js         211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js            265.26 kB │ gzip:  63.94 kB  (+~1 kB gz vs Step O)
dist/assets/xlsx-*.js             429.03 kB │ gzip: 143.08 kB  (async, on-demand)
```

Preview Vercel: `tullio-git-claude-modest-cannon-g9c1de-tooco-s-projects.vercel.app` — **Ready**.

---

## 2. Finding della code-review

### ✅ Chiusi nella PR #22 (6/10)

| # | Severità | Cosa | Fix |
|---|----------|------|-----|
| 1 | 🔴 alta | Filtro origin realtime non funziona per DELETE (regressione Step L) | `payload?.new?.origin_client ?? payload?.old?.origin_client` + `REPLICA IDENTITY FULL` |
| 3 | 🔴 alta | Caveat #17: TEAM mock al primo login (alias mutabile su `state.team` + race `AuthGate`) | Copie in `makeInitialState` + attesa `profile` in `AuthGate` |
| 4 | 🟡 media | `Conversations.update` non aggiorna `updated_at` → lista conversazioni stantia | `updated_at` impostato di default nel patch |
| min | 🟢 bassa | Signed URL chat rigenerata ad ogni click | Cache in-memory TTL 55min |
| min | 🟢 bassa | `sendFile` senza limite client né guardia unmount | `MAX_FILE_SIZE=25MB` + `mountedRef` |
| min | 🟢 bassa | `openTaskById` stale closure (`dispatch` mancante nelle deps) | Riordinata la dichiarazione, `dispatch` ora nelle deps |

### ⏳ Aperti (4/10) → Step Q

| # | Severità | Cosa | Note per il fix |
|---|----------|------|-----------------|
| 2 | 🟡 media | Race condition init chat / realtime: `reload()` async non awaitato prima del subscribe, un evento realtime durante il primo load può sovrascrivere dati più nuovi | Aggiungere generation counter / `latestLoad` ref nell'effetto chat (VoyageDesk.jsx ~7863) |
| 5 | 🟡 media | `withOrigin` mancante su `Comments.create`, `Users.updateProfile`, `Users.setPresence` → eco realtime su comments/users | Aggiungere colonna `origin_client` a `public.comments` e `public.users` (migration) + applicare `withOrigin` in `api.js` |
| 6 | 🟡 media | Errori di `setReactions`/`markRead` chat solo `console.log`, niente toast né rollback ottimistico | Toast centralizzato come per `tasks` (linea ~8065) |
| 10 | 🟢 bassa | Tre blocchi useEffect quasi identici (subscribe+debounce) duplicano la logica | Estrarre hook `useDebouncedTableSubscription` |

### 🟡 Drift repo↔DB (finding #7 della review)

Stato non bloccante ma da chiudere prima di un'eventuale ricostruzione del DB da zero:

- `supabase/migrations/20260610_step_j_fix2.sql` **manca** dal repo (applicata solo via MCP).
- Il **DDL delle tabelle base** (`tasks`, `users`, `conversations`, `messages`, `notices`, `comments`) **non è versionato** in nessuna migrazione: solo `ALTER`/policy/trigger. Impossibile ricostruire da zero solo dal repo.
- `20260610_notifications_extra.sql:214` definisce `notify_queue_stale()` con ruoli **mixed-case** (`'Manager','Admin','Senior Agent'`), poi `20260610_step_j_fix.sql:40` lo ridefinisce con **lowercase** senza `'Senior Agent'`. Il fix vince per ordine alfabetico → la prima definizione è dead code che confonde audit/rollback.

### 🟡 Index DB mancante (finding #8)

`messages(conversation_id)`: Postgres non indicizza automaticamente le FK. `MessagesAPI.listForConversation` filtra su quella colonna. Da aggiungere `CREATE INDEX idx_messages_conversation ON public.messages(conversation_id)` con una migrazione dedicata.

### 🟡 Caveat #6 ribadito (finding #9)

`markRead` chat: 1 UPDATE per messaggio non letto all'apertura conversazione. Sostituire con RPC batch (es. `messages.markRead(conversation_id, user_id)` lato DB che fa un singolo `update ... where id in (...)`).

---

## 3. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `3cd6634 Step M + Step O: storage file chat reale (caveat #7) + logout UI (caveat #16) (#20)`
**Branch sessione 13:** `claude/modest-cannon-g9c1de` (PR #22 draft, 2 commit, pronta).

### PR #22 — checklist merge

- [x] Build container verde
- [x] Preview Vercel Ready (commit `3526aa0`)
- [x] Migration `replica_identity_full` applicata e verificata via MCP
- [x] Nessuna review comment aperta
- [ ] **Togliere draft + merge squash** ← azione richiesta inizio sessione 14

---

## 4. Stato Supabase (delta sessione 13)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migration aggiunta in sessione 13

- `20260611_replica_identity_full.sql` ✅ applicata via MCP
  - `alter table public.{tasks,notices,conversations,messages} replica identity full;`
  - **Effetto**: gli eventi DELETE realtime ora portano l'intera riga in `payload.old`, includendo `origin_client` → il filtro echo funziona anche su DELETE.
  - **Side effect**: payload realtime un po' più grandi (irrilevante alle dimensioni attuali).

### Migrazioni totali in repo (cumulativo)

- `20260609_notifications.sql` ✅
- `20260609_user_presence.sql` ✅
- `20260610_notifications_extra.sql` ✅ *(contiene una def stale di `notify_queue_stale`, vedi §2)*
- `20260610_step_j_fix.sql` ✅
- `20260610_step_j_fix2.sql` ❌ **mancante** (applicata solo via MCP — drift)
- `20260610_step_j_fix3.sql` ✅
- `20260610_step_j_fix4.sql` ✅
- `20260610_step_j_fix5.sql` ✅
- `20260611_origin_tagging.sql` ✅
- `20260611_chat_files_storage.sql` ✅
- `20260611_replica_identity_full.sql` ✅ NEW

---

## 5. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1 | Auto-assegnazione | ✅ Step J | — | |
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa | |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | + 1 UPDATE/tab anche con status invariato |
| 4 | RLS realtime users (subscribe vede tutti) | 🟡 Aperto | media | Step Q |
| 5 | Eco realtime (flash re-render) | ✅ Step L + fix DELETE (PR #22) | — | finalizzato in sessione 13 |
| 6 | markRead chat 1 UPDATE/msg | 🟡 Aperto | media | finding #9 — Step Q |
| 7 | fileSize chat string vs bigint | ✅ Step M | — | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 9 | Task link chat match per titolo | ✅ Step K | — | |
| 10 | UNDO_LAST_ACTION solo in-memory | ⚪ Aperto | bassa | |
| 11 | NOTIFICATIONS mock fallback | ✅ fix #11 | — | |
| 12 | Mock+reali convivono | ✅ fix #11 | — | |
| 13 | tasks_insert created_by | ✅ Step J fix3 | — | |
| 14 | Demo switch confonde RLS | ✅ fix #14 (dev-only) | — | review ha confermato il gate corretto |
| 15 | VoyageDesk.jsx ~7100 righe | 🔶 Step N parziale | media | bundle ✅, refactor strutturale ⏳ Step P |
| 16 | Logout mancante UI | ✅ Step O | — | |
| 17 | TEAM seed locale al primo login | ✅ PR #22 | — | doppia causa: race AuthGate + alias mutabile |
| 18 | Encoding mojibake preview import CSV | ⚪ Aperto | bassa | |
| 19 | **Drift repo↔DB migrazioni** | 🟡 Aperto NEW | media | fix2 manca, DDL base non versionato, def stale `notify_queue_stale` |
| 20 | **Index mancante `messages(conversation_id)`** | 🟡 Aperto NEW | media | Step Q |
| 21 | **Race init chat / realtime** | 🟡 Aperto NEW | media | finding #2 — Step Q |
| 22 | **Errori reactions/markRead chat senza toast** | 🟡 Aperto NEW | media | finding #6 — Step Q |
| 23 | **withOrigin parziale (comments, users)** | 🟡 Aperto NEW | media | finding #5 — Step Q |

**Aperti rilevanti per la prossima sessione:** #4, #6, #19, #20, #21, #22, #23 (tutti → Step Q), #15 residuo (Step P).

---

## 6. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 0 — Mergeare PR #22 (~5 min)

- Togliere draft, merge squash su `main`. CI già verde, preview già verificata.
- Aggiornare `docs/CHANGELOG.md` con voce v1.5 (Step M + Step O + fix code-review sessione 13).

### Pri 1 — Step Q: Hardening realtime + chat (~2-3 h)

Chiude i 4 finding aperti della review + caveat #4/#6 + #19–#23. Una PR per blocco.

**Q.1 — withOrigin completo (caveat #23, finding #5).** Nuova migrazione `20260612_origin_tagging_comments_users.sql`:
```sql
alter table public.comments add column if not exists origin_client uuid;
alter table public.users    add column if not exists origin_client uuid;
alter table public.comments replica identity full;
alter table public.users    replica identity full;
```
In `src/lib/api.js`: aggiungere `withOrigin` su `Comments.create`, `Users.updateProfile`, `Users.setPresence`, `Users.setActive`. Test: un commento auto-originato non deve più triggherare refetch sul tab che l'ha scritto.

**Q.2 — Race init chat / realtime (caveat #21, finding #2).** Nell'effetto chat (`VoyageDesk.jsx` ~7863): introdurre `latestLoadRef = useRef(0)` incrementato a ogni `reload()`, snapshot del valore prima della `Promise.all`, e check post-`await` per scartare risposte stale. Stesso pattern per `tasks`/`notices`/`notifications`.

**Q.3 — Toast su errori reactions/markRead chat (caveat #22, finding #6).** `VoyageDesk.jsx` ~8065: dispatch toast errore + (opzionale) rollback ottimistico sullo `setMessages`. Riusare il pattern centralizzato dei tasks.

**Q.4 — markRead batch (caveat #6, finding #9).** RPC Postgres `messages_mark_read(conv_id uuid, user_id uuid)` che fa un singolo `update messages set read_by = array_append(read_by, $2) where conversation_id = $1 and not ($2 = any(read_by))`. Lato client: chiamare una sola volta all'apertura conversazione invece di N volte.

**Q.5 — Index `messages(conversation_id)` (caveat #20).** Migrazione `20260612_indexes.sql`:
```sql
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at);
```
(L'indice composito copre anche `listForConversation` che ordina per `created_at`.)

**Q.6 — RLS realtime users (caveat #4).** Verificare in DevTools se la subscribe `users` riceve eventi per utenti non visibili: se sì, aggiungere `alter publication supabase_realtime ...` o filtrare lato client.

### Pri 2 — Step R: Drift repo↔DB (~1-2 h, caveat #19)

- Esportare il DDL effettivo delle tabelle base (`tasks`, `users`, `conversations`, `messages`, `notices`, `comments`) da Supabase (Dashboard → Database → Schema visualizer / `pg_dump --schema-only`).
- Versionare come `supabase/migrations/00000000_initial_schema.sql` (data fittizia precedente a tutte le altre, perché logicamente è il punto di partenza).
- Ricostruire il contenuto di `step_j_fix2.sql` (vedi handoff v5 §2): probabilmente fixava una RLS o un trigger su `comments`. Se non ricostruibile dall'history MCP (`mcp__supabase__list_migrations`), creare un file vuoto con commento "applicata via MCP, contenuto perso".
- Eliminare la definizione stale di `notify_queue_stale` da `20260610_notifications_extra.sql` (o aggiungere un commento "supersed by step_j_fix").

### Pri 3 — Step P: Estrazione componenti dal monolite (~4-6 h, caveat #15 residuo)

**Importante:** Step P era già pianificato in handoff v6. Ma adesso che il caveat #17 (`state.team` alias) è risolto e i `_sync*` globali sono visibilmente fragili (la review li ha tracciati come root cause), conviene:

1. **Prima** sostituire i `let` mutabili `TEAM`/`CATEGORIES`/`CURRENT_USER` con un puro flusso state → context, deprecando `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. È invasivo (tutti gli helper `getMember`, `isAdmin`, ecc. usano i globali), ma sblocca Step P senza trascinarsi dietro il pattern ibrido.
2. **Poi** estrarre i componenti come da piano v6:
   - `src/state/` (reducer, context, helpers permessi)
   - `src/components/{calendar,admin,chat,dashboard,tasks,modals}/`
   - Una PR per componente / piccolo gruppo, mai un mega-PR.
3. **Lazy-load** sui modali e viste non-default (`React.lazy` + `Suspense`) per ulteriore riduzione del chunk principale.

### Pri 4 — Quick wins residui (~1-2 h)

- **#18** mojibake CSV: in `handleFile`, `XLSX.read(buf, { type: 'array', codepage: 65001 })`. Da verificare con sample CSV.
- **#3** Presence heartbeat: skip dell'UPDATE se status invariato (compare con local cache); valutare allungare a 5min con override su `visibilitychange`.
- **#2** Mention edge case: parser più stringente (boundary `\b` invece di startsWith).

### Pri 5 — Step S: Estensione `withOrigin` ai notifications (opzionale)

Le notifiche sono generate da trigger DB → non hanno `origin_client` (nessun client le origina). Niente da fare per ora. Se in futuro arriva un flusso di notifiche client-originate, applicare lo stesso pattern.

---

## 7. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Mergea PR #22 (squash) → main, aggiorna CHANGELOG
3. Crea branch dedicato (es. claude/step-q-hardening-realtime)
4. Implementa Q.1 → Q.6 (una sotto-PR per ciascuno, o un'unica PR Step Q con commit chiari)
5. Verifica build + preview, mergea
```

**Comandi base (sessione remota, container fresco):**
```
npm install
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build
```

**Dev locale (PowerShell):**
```powershell
cd C:\Users\londo\TULLIO
git checkout main
git pull
git checkout -b claude/step-q-hardening-realtime
npm run dev   # in terminale dedicato
```

---

## 8. Configurazione locale (invariato da v6)

### `.env` (esiste, NON committato)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false        # fix #14, default off
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # fix #11, attivabile in dev se serve
```

---

## 9. Utenti DB (invariato da v6)

| Nome | UUID | Email | Ruolo |
|------|------|-------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

Logout UI ora disponibile (Step O) → niente più finestre incognito per cambiare utente.

---

## 10. Note importanti per Claude nella prossima sessione

- **Mergeare PR #22 prima di tutto** — qualunque altro lavoro su `main` divergerebbe dai fix della review.
- **Migrazioni**: Step Q ne aggiunge 2 (`origin_tagging_comments_users.sql`, `indexes.sql`). Applicare via `mcp__supabase__apply_migration` E committare il file in `supabase/migrations/`. Non lasciare drift come per `step_j_fix2.sql`.
- **`REPLICA IDENTITY FULL`** è già su tasks/notices/conversations/messages. Step Q deve aggiungerlo anche a `comments` e `users` (incluso nel SQL Q.1 sopra).
- **Caveat #17 e i `_sync*` globali**: il bug visibile è chiuso, ma la fragilità architetturale resta. Step P lo affronta alla radice — prima di muoverlo, leggere con attenzione tutti i call site di `_syncTeam`/`_syncCategories`/`_syncCurrentUser`.
- **`AskUserQuestion`** prima di scelte ambigue (es. Step Q vs Step P, approccio batch RPC vs SQL inline).
- **PR sempre draft alla creazione**; togliere draft solo dopo verifica build + preview Vercel Ready.
- **Merge squash**: convenzione fissa per questo repo.

---

**Fine handoff v7.** Sessione 13 ha chiuso 6 finding di review + caveat #17. Pri 0 (merge PR #22) → Pri 1 (Step Q). Buona prossima sessione.
