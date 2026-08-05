# HANDOFF — Sessione TULLIO post Step Q
**Data:** 11 giugno 2026 (sessione 14)
**Sessione precedente:** Claude Code on the web — sessione 13 ha aperto e mergeato PR #22 (fix code-review) e prodotto handoff v7. Sessione 14 ha mergeato #22 + #23 (CHANGELOG v1.5) + #24 (Step Q).
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-11_v7.md` (sessione 13, dettaglio code-review) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **PR #22 mergeata** (`787a132`): chiude 6 finding code-review (3 critici + 3 minori), caveat #17 e fix DELETE realtime.
- ✅ **PR #23 mergeata** (`1ec2cba`): CHANGELOG v1.5 aggiornato con dettaglio fix code-review.
- ✅ **PR #24 mergeata** (`cbd4cb5`): **Step Q completo** — chiude i 4 finding aperti della review + caveat #4/#6/#20/#21/#22/#23.
- ⏳ **Prossima sessione**: **Step R** (drift repo↔DB, caveat #19, ~1-2h) raccomandato per pulire prima di affrontare Step P. In alternativa: **Step P** (refactor monolite, caveat #15 residuo, ~4-6h) o quick wins (#10/#18/#2/#3).

---

## 1. Riepilogo lavori sessione 14 (cronologico)

| # | Cosa | Commit / PR | Stato |
|---|------|-------------|-------|
| 1 | Merge PR #22 (fix code-review sessione 13) | `787a132` (squash) | ✅ |
| 2 | PR #23 (CHANGELOG v1.5) + merge | `1ec2cba` (squash) | ✅ |
| 3 | Step Q — 6 sotto-task (Q.1 → Q.6) | `cbd4cb5` PR #24 (squash) | ✅ build verde + Vercel Ready + mergeato |

### Cosa contiene Step Q (PR #24)

**Q.1 — withOrigin completo (caveat #23, finding #5)**
- Migration `20260612_origin_tagging_comments_users.sql`: `origin_client uuid` + `REPLICA IDENTITY FULL` su `public.comments` e `public.users` (applicata via MCP, verificata).
- `src/lib/api.js`: `withOrigin` applicato a `Comments.create`, `Users.updateProfile`, `Users.setActive`, `Users.setPresence`. Step L copriva tasks/notices/conversations/messages; queste due tabelle erano scoperte.

**Q.2 — Race init/realtime → generation counter (caveat #21, finding #2)**
- `src/VoyageDesk.jsx`: i tre `useEffect` di idratazione live (tasks+notices, notifications, chat) usavano solo `cancelled` (unmount). Se reload A in volo + evento realtime parte reload B, l'ordine di completamento non era garantito → load più vecchio sovrascriveva uno più nuovo.
- Pattern applicato: counter locale `loadGen` (separato per tasks/notices, condiviso per chat conv+msgs). Snapshot prima della fetch, check post-await/then → scarta se non è l'ultimo.

**Q.3 — Toast errori reactions/markRead chat (caveat #22, finding #6)**
- Errori di `MessagesAPI.setReactions` / `MessagesAPI.markRead` nel wrapper `setMessagesRaw` venivano solo loggati. Ora dispatch toast `error` con messaggio specifico.

**Q.4 — RPC bulk markRead chat (caveat #6, finding #9)**
- Migration `20260612_messages_mark_read_bulk.sql`: function `public.messages_mark_read(conv_id uuid, reader_id uuid, origin uuid)` → `integer`. Singolo UPDATE che appende `reader_id` ad `read_by` per tutti i msg non letti dove `sender ≠ reader`. Imposta anche `origin_client = origin` per il filtro echo. `security invoker` + `grant authenticated`.
- `src/lib/api.js`: `Messages.markReadBulk(convId, userId)` con `origin = getClientId()`.
- `src/VoyageDesk.jsx`: nuovo callback `markConversationRead(convId)` in `VoyageDeskInner`. Bypassa il wrapper `setMessages` (che farebbe N UPDATE) → update locale via `setMessagesRaw` + 1 RPC. Passato a `ChatPanel` → `ConversationView`; l'effetto "mark as read on open" lo chiama. Fallback al vecchio path se callback non passato (mock).
- **Risultato**: aprire una conv con N messaggi non letti passa **da N round-trip + N eventi realtime a 1 + 1**.

**Q.5 — Index `messages(conversation_id)` (caveat #20)** → già coperto da `idx_messages_conversation(conversation_id, created_at DESC)` (PG traversa bidirezionalmente).

**Q.6 — RLS realtime users (caveat #4)** → non-issue. La policy `users_select_all` ha `qual='true'` per `authenticated` → tutti gli utenti loggati vedono tutti gli utenti, by-design (roster team completo). Nessun leak.

### Verifica build (commit ultimo Step Q, container)

```
dist/index.html                     0.50 kB │ gzip:   0.30 kB
dist/assets/react-*.js            140.87 kB │ gzip:  45.26 kB
dist/assets/supabase-*.js         211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js            266.31 kB │ gzip:  64.25 kB   (+~0.3 kB gz vs PR #22)
dist/assets/xlsx-*.js             429.03 kB │ gzip: 143.08 kB
```

Preview Vercel su `claude/step-q-hardening-realtime`: **Ready** (verificato prima del merge).

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `cbd4cb5 Step Q: Hardening realtime + chat (#24)`
**Branch sessione 14 chiusi:** `claude/modest-cannon-g9c1de` (#22), `claude/handoff-session-2026-06-11-i70jab` (#23), `claude/step-q-hardening-realtime` (#24).

### Note operative (container Linux vs PowerShell)

- `npm install` nel container Linux **riscrive `package-lock.json` con LF**; il file originale ha CRLF (generato su Windows). NON committare il diff line-ending: `git checkout -- package-lock.json` lo scarta. Il diff è ~1884 ins / 1884 del, content identico.
- L'hook `~/.claude/stop-hook-git-check.sh` blocca la chiusura turno se ci sono modifiche non commitate → scarta sempre i diff cosmetici prima di terminare.

---

## 3. Stato Supabase (delta sessione 14)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migration aggiunte in sessione 14

- `20260612_origin_tagging_comments_users.sql` ✅ applicata via MCP
  - `alter table public.comments add column if not exists origin_client uuid;`
  - `alter table public.users    add column if not exists origin_client uuid;`
  - `alter table public.comments replica identity full;`
  - `alter table public.users    replica identity full;`
- `20260612_messages_mark_read_bulk.sql` ✅ applicata via MCP
  - `create or replace function public.messages_mark_read(conv_id uuid, reader_id uuid, origin uuid default null) returns integer ...`
  - `grant execute on function public.messages_mark_read(uuid, uuid, uuid) to authenticated;`

### Migrazioni totali nel repo (cumulativo)

- `20260609_notifications.sql` ✅
- `20260609_user_presence.sql` ✅
- `20260610_notifications_extra.sql` ✅ *(contiene def stale di `notify_queue_stale`, vedi caveat #19)*
- `20260610_step_j_fix.sql` ✅
- `20260610_step_j_fix2.sql` ❌ **mancante dal repo** (applicata solo via MCP — drift, caveat #19)
- `20260610_step_j_fix3.sql` ✅
- `20260610_step_j_fix4.sql` ✅
- `20260610_step_j_fix5.sql` ✅
- `20260611_origin_tagging.sql` ✅
- `20260611_chat_files_storage.sql` ✅
- `20260611_replica_identity_full.sql` ✅
- `20260612_origin_tagging_comments_users.sql` ✅ NEW
- `20260612_messages_mark_read_bulk.sql` ✅ NEW

### Replica identity status (delta dopo Q.1)

| Tabella | Replica identity | origin_client |
|---------|------------------|---------------|
| tasks | FULL | ✅ |
| notices | FULL | ✅ |
| conversations | FULL | ✅ |
| messages | FULL | ✅ |
| comments | **FULL** (Q.1) | **✅** (Q.1) |
| users | **FULL** (Q.1) | **✅** (Q.1) |

### Trigger / cron invariati da v7

- `trg_tasks_set_created_by` BEFORE INSERT su tasks
- `trg_notify_task_assigned` AFTER INSERT/UPDATE su tasks
- `trg_notify_task_comment` AFTER INSERT su comments
- `notify_task_due_daily` (`0 8 * * *` UTC)
- `notify_queue_stale_hourly` (`5 * * * *`)

---

## 4. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1 | Auto-assegnazione | ✅ Step J | — | |
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa | Quick win Pri 4 |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | + 1 UPDATE/tab anche con status invariato |
| 4 | RLS realtime users | ✅ Step Q.6 (non-issue) | — | Policy `qual='true'` by-design |
| 5 | Eco realtime (flash re-render) | ✅ Step L + fix DELETE (PR #22) | — | |
| 6 | markRead chat 1 UPDATE/msg | ✅ Step Q.4 | — | RPC bulk |
| 7 | fileSize chat string vs bigint | ✅ Step M | — | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 9 | Task link chat match per titolo | ✅ Step K | — | |
| 10 | Hook subscribe duplicati (3 useEffect simili) | 🟢 Aperto | bassa | finding #10 review — `useDebouncedTableSubscription`. Pri 4 |
| 11 | NOTIFICATIONS mock fallback | ✅ fix #11 | — | |
| 12 | Mock+reali convivono | ✅ fix #11 | — | |
| 13 | tasks_insert created_by | ✅ Step J fix3 | — | |
| 14 | Demo switch confonde RLS | ✅ fix #14 | — | |
| 15 | VoyageDesk.jsx ~7100 righe | 🔶 Step N parziale | media | bundle ✅, refactor strutturale ⏳ Step P |
| 16 | Logout mancante UI | ✅ Step O | — | |
| 17 | TEAM seed locale al primo login | ✅ PR #22 | — | |
| 18 | Encoding mojibake preview import CSV | ⚪ Aperto | bassa | Quick win Pri 4 |
| 19 | Drift repo↔DB migrazioni | 🟡 Aperto | **Step R** | fix2 manca, DDL base non versionato, def stale `notify_queue_stale` |
| 20 | Index `messages(conversation_id)` | ✅ Step Q.5 (già esistente) | — | |
| 21 | Race init chat / realtime | ✅ Step Q.2 | — | generation counter |
| 22 | Errori reactions/markRead chat senza toast | ✅ Step Q.3 | — | |
| 23 | withOrigin parziale (comments, users) | ✅ Step Q.1 | — | |

**Aperti rilevanti per la prossima sessione:** #15 residuo (Step P), #19 (Step R), #10/#18/#2/#3/#8 (quick wins).

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 1 — Step R: Drift repo↔DB (~1-2 h, caveat #19) — **raccomandato**

Pulisce il debito di versionamento DB **prima** di affrontare Step P (refactor monolite): se Step P richiede un reset del DB locale, oggi il repo non è ricostruibile. Inoltre la def stale di `notify_queue_stale` confonde audit.

Pianificato:
1. **DDL tabelle base mancante.** Esportare lo schema effettivo di `tasks`, `users`, `conversations`, `messages`, `notices`, `comments` da Supabase. Opzioni:
   - Dashboard Supabase → Database → Schema → SQL Editor → `pg_dump --schema-only --schema=public -t public.<table>` se disponibile.
   - In alternativa, ricostruire i `CREATE TABLE` interrogando `information_schema.columns` + `pg_indexes` + `pg_policies` via MCP `execute_sql`.
   - Versionare come `supabase/migrations/00000000_initial_schema.sql` (data fittizia precedente a tutte le altre).
2. **`step_j_fix2.sql` perso.** Dalla handoff v5 §2 risulta applicata solo via MCP. Tentativi:
   - Cercare in `mcp__supabase__list_migrations` se Supabase ha mantenuto la copia.
   - Se irrecuperabile, creare un file vuoto con commento `-- applicata via MCP, contenuto perso; ricostruito implicitamente dai fix successivi` per documentare il gap.
3. **Def stale `notify_queue_stale` (`20260610_notifications_extra.sql:214`).** È sovrascritta da `step_j_fix.sql:40`. Aggiungere commento "supersed by step_j_fix" o rimuoverla del tutto preservando il resto della migrazione.
4. Verificare che applicando le migrazioni in ordine su un DB vuoto si ottenga lo stesso schema del progetto remoto (smoke-test su branch Supabase con `create_branch` + `apply_migration`).

### Pri 2 — Step P: Refactor monolite VoyageDesk.jsx (~4-6 h, caveat #15 residuo)

Approccio raccomandato (da handoff v7 §6, ridefinito post-finding #3):
1. **Prima** sostituire i `let` mutabili `TEAM`/`CATEGORIES`/`CURRENT_USER` con un puro flusso state→context, deprecando `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. È invasivo (tutti gli helper `getMember`, `isAdmin`, ecc. li usano) ma sblocca Step P senza trascinarsi dietro il pattern ibrido che ha già causato il caveat #17.
2. **Poi** estrarre componenti:
   - `src/state/` (reducer, context, helpers permessi)
   - `src/components/{calendar,admin,chat,dashboard,tasks,modals}/`
   - Una PR per componente / piccolo gruppo. **Mai un mega-PR.**
3. **Lazy-load** (`React.lazy` + `Suspense`) su modali e viste non-default → ulteriore riduzione del chunk principale.

### Pri 3 — Quick wins (~1-2 h totali)

- **#10** (finding #10 review): estrarre hook `useDebouncedTableSubscription(table, reload, delay=200)` per consolidare i 3 useEffect simili (tasks+notices, notifications, chat). Dopo Step Q.2 questi sono ancora più simili (tutti hanno `loadGen` + `cancelled` + debounce).
- **#18** mojibake CSV: in `handleFile` usare `XLSX.read(buf, { type: 'array', codepage: 65001 })` invece di `binary`. Da verificare con sample CSV.
- **#3** Presence heartbeat: skip dell'UPDATE se status invariato (compare con local cache); valutare allungare a 5min con override su `visibilitychange`.
- **#2** Mention edge case: parser più stringente (boundary `\b` invece di startsWith).
- **#8** Calendar settimana fissa: parametrizzare la settimana di partenza.

### Pri 4 — Estensioni opzionali

- `withOrigin` su `Notifications.markRead` / `Notifications.markAllRead` (al momento non taggate; basso impatto perché le notifiche le genera il DB).
- Estrarre il client `Notifications` come `RealtimeAware` (stesso loadGen pattern).

---

## 6. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Decidi pri (raccomandato: Step R prima di Step P)
3. Crea branch dedicato (es. claude/step-r-drift-schema)
4. Esegui, verifica build, apri PR draft, attendi Vercel Ready, mergea (squash)
```

**Comandi base (sessione remota, container fresco):**
```
npm install   # rigenera node_modules (NB: riscrive package-lock.json con LF — scarta il diff prima di committare)
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build
```

**Dev locale (PowerShell):**
```powershell
cd C:\Users\londo\TULLIO
git checkout main
git pull
git checkout -b claude/step-r-drift-schema
npm run dev   # in terminale dedicato
```

---

## 7. Configurazione locale (invariato da v6)

### `.env` (esiste, NON committato)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false        # fix #14, default off
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # fix #11, attivabile in dev se serve
```

---

## 8. Utenti DB (invariato da v6)

| Nome | UUID | Email | Ruolo |
|------|------|-------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

Logout UI disponibile (Step O) → multi-utente senza incognito.

---

## 9. Note importanti per Claude nella prossima sessione

- **`send_later` non disponibile** in questo ambiente (`claude-code-remote` non connesso). I PR-watch via subscribe restano "in attesa di webhook" senza self-check programmati. Per babysit lunghi → lasciare il PR aperto e fidarsi degli eventi (push/review/CI) come trigger.
- **`package-lock.json`**: il file in repo ha CRLF; `npm install` su container Linux lo riscrive con LF. Il diff è cosmetico (1884 ins / 1884 del, contenuto identico). Sempre `git checkout -- package-lock.json` prima di chiudere il turno o l'hook git-check fallirà.
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<data>_<nome>.sql` versionato. Non lasciare drift come per `step_j_fix2.sql`.
- **`AskUserQuestion`** prima di scelte ambigue (es. Step R vs Step P, approccio refactor monolite).
- **PR sempre draft alla creazione**; togliere draft solo dopo verifica build + Vercel preview Ready.
- **Merge squash**: convenzione fissa per questo repo.
- **Caveat #17 e i `_sync*` globali**: visibile è chiuso, ma la fragilità architetturale resta. Step P (passo 1) lo affronta alla radice.
- **Q.4 markRead bulk**: il nuovo `markConversationRead` bypassa il wrapper `setMessages` per evitare il fan-out di N UPDATE. Se in futuro qualche altro flusso vuole aggiungere readBy a un singolo messaggio (es. "read on hover" di un singolo msg), il path per-msg nel wrapper c'è ancora — usalo, non duplicare la logica.

---

**Fine handoff v8.** Sessione 14 chiude Step Q. Pri 1 → Step R. Buona prossima sessione.
