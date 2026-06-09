# HANDOFF — Sessione TULLIO post Step J (fix)

**Data:** 9 giugno 2026 (sera)
**Sessione precedente:** Cowork — Step J Notifiche complete + fix RLS `is_manager_or_admin`
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/CHANGELOG.md` (dettaglio step).

---

## 1. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch corrente di lavoro:** `claude/step-e-sync-robustness` (locale, già modificato; da committare su nuovo branch)
**Branch suggerito per Step J:** `claude/step-j-notifications`

### Modifiche locali NON ancora committate

| File | Tipo | Descrizione |
|------|------|-------------|
| `supabase/migrations/20260610_notifications_extra.sql` | NEW | Trigger comment+mention, pg_cron task_due/queue_stale, anti-eco self-assign |
| `supabase/migrations/20260610_step_j_fix.sql` | NEW | Grant EXECUTE is_manager_or_admin a authenticated/anon, ruoli lowercase in notify_queue_stale |
| `src/VoyageDesk.jsx` | MOD | NotificationsPanel con `onOpenTask`, hover su navigabili, titoli arricchiti per mention/queue_stale, callback `openTaskById` in VoyageDeskInner, Topbar prop |
| `docs/CHANGELOG.md` | MOD | Entry v1.2-dev Step J + sezione "Fix post-applicazione" |
| `docs/HANDOFF_SESSION_2026-06-09_v2.md` | NEW | Questo file |

### Build verificata

```
npm run build  → OK (1039.76 kB, +0.6 KB rispetto baseline)
```

### Commit da fare (Windows PowerShell)

```powershell
cd C:\Users\londo\TULLIO
git checkout -b claude/step-j-notifications
git add supabase/migrations/20260610_notifications_extra.sql `
        supabase/migrations/20260610_step_j_fix.sql `
        src/VoyageDesk.jsx `
        docs/CHANGELOG.md `
        docs/HANDOFF_SESSION_2026-06-09_v2.md
git commit -m "Step J - Notifiche complete + fix RLS is_manager_or_admin"
git push -u origin claude/step-j-notifications
```

PR da aprire:
```
https://github.com/tucobpjmr/TULLIO/compare/main...claude/step-j-notifications
```

---

## 2. Stato Supabase (verificato sul DB remoto)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migrazioni applicate ✅

| File | Stato | Note |
|------|-------|------|
| `20260609_notifications.sql` (Step F) | ✅ | Già applicata sessione precedente |
| `20260609_user_presence.sql` (Step H) | ✅ | Già applicata sessione precedente |
| `20260610_notifications_extra.sql` (Step J) | ✅ | Applicata via Dashboard SQL Editor |
| `20260610_step_j_fix.sql` (Step J fix) | ✅ | Applicata via MCP Supabase durante sessione |

### Schema chiave verificato

```
public.notifications:  Step F invariata; 0 righe al termine della sessione
public.tasks:          trigger trg_notify_task_assigned (anti-eco self-assign attivo)
public.comments:       trigger trg_notify_task_comment (NEW Step J)
public.users:          5 utenti seed: Marco (manager), Roberto (admin),
                       Luca (agent), Sofia (agent), Giulia (driver)
                       ⚠️ ruoli lowercase
pg_cron jobs:
  - notify_task_due_daily        0 8 * * *
  - notify_queue_stale_hourly    5 * * * *
```

### Funzioni RPC esistenti

```
public.is_manager_or_admin()   security definer; ora con EXECUTE a authenticated/anon
public.notify_task_assigned()  anti-eco self-assign attivo
public.notify_task_comment()   mention parser regex @nome (case-insensitive)
public.notify_task_due()       de-dup 22h per task_id
public.notify_queue_stale()    ruoli lowercase manager/admin
```

---

## 3. ROADMAP TEST — Step J (DA ESEGUIRE)

⚠️ Sessione precedente terminata PRIMA di chiudere i test. La tabella `public.notifications` era vuota perché l'errore RLS `is_manager_or_admin` bloccava ogni INSERT/UPDATE su `tasks`. Dopo il fix RLS i test devono essere ri-eseguiti da zero.

### Setup test

1. `npm run dev` da `C:\Users\londo\TULLIO`
2. Login a `localhost:5173` con utente Auth (creato nella sessione: Luca Moretti / Junior Agent)
3. Tieni aperto Supabase SQL editor: https://supabase.com/dashboard/project/vmxvnxsqfisucugcpqlc/sql

### Query di osservazione (riusarla dopo ogni test)

```sql
SELECT
  (SELECT name FROM public.users WHERE id = n.user_id) AS dest,
  n.type,
  n.payload->>'task_title' AS task,
  n.read,
  n.created_at
FROM public.notifications n
ORDER BY n.created_at DESC
LIMIT 20;
```

### T1 — Salvataggio task non più bloccato

- [ ] Dashboard → FAB **+** → crea task "Test J1", priorità high, assegna a Sofia
- [ ] **Atteso:** toast verde "Task creata", nessun toast rosso `permission denied`
- [ ] Query → 1 riga `task_assigned` per Sofia

### T2 — Anti-eco self-assign

- [ ] FAB → crea task "Test J2", assegna a TE STESSO (Luca)
- [ ] **Atteso:** nessuna riga `task_assigned` per Luca (query restituisce solo le righe T1)

### T3 — Mention parser

- [ ] Apri "Test J1" → slide-over → commenti
- [ ] Scrivi: `Ciao @Sofia puoi verificare?` → invia
- [ ] **Atteso:** query mostra 1 riga `mention` per Sofia (payload con `task_id`, `task_title`, `comment_id`)
- [ ] Test edge: commenta `@Marco @Sofia ok` → 2 righe (una mention per Marco, una per Sofia)

### T4 — Notifica `comment` agli assignee

- [ ] Apri una task con assignees ≠ Luca, es. "Test J1" (Sofia)
- [ ] Commenta senza @, es. `Aggiornamento: ok`
- [ ] **Atteso:** riga `comment` per Sofia (NON per Luca, è lui l'autore)

### T5 — Navigazione da notifica (UX Step J)

- [ ] Logout, login come `sofia@tullio.local` (creare l'utente Auth se non esiste)
- [ ] Clicca 🔔 → vedrai le tue notifiche reali (in cima, sopra i mock dimostrativi)
- [ ] Clicca su una notifica con `task_id` → TaskSlideOver si apre + pannello si chiude
- [ ] Verifica che la notifica venga marcata `read = true` nel DB

### T6 — pg_cron task_due (opzionale, manuale)

- [ ] In SQL editor: `SELECT public.notify_task_due();`
- [ ] Se ci sono task con due_date entro 24h e assignees non vuoti → righe `task_due` nel DB
- [ ] Re-eseguire 2 volte → la seconda non duplica (dedup 22h)

### T7 — pg_cron queue_stale (manuale)

- [ ] Creare task con `created_at` artificialmente vecchio:
  ```sql
  UPDATE public.tasks
  SET created_at = now() - interval '5 hours'
  WHERE title = 'Test J1';
  ```
- [ ] Rimuovere assignees: setting `assignees = '{}'`
- [ ] `SELECT public.notify_queue_stale();`
- [ ] **Atteso:** righe `queue_stale` per Marco (manager) e Roberto (admin)

### Reset notifiche test

```sql
DELETE FROM public.notifications;
```

---

## 4. ROADMAP STEP K → N

### 🟡 Step K — Refactor task link via `task_ref` (quick win, ~30 min)

**Caveat #9 risolto.** Oggi i task link in chat fanno match per titolo: se il titolo cambia → link rotto.

**Modifiche:**
- `setMessages` (VoyageDesk.jsx): quando un messaggio è generato dal flow "🔗 Riferimento task", popolare `messages.task_ref` con `task.id` (colonna già esistente).
- `MessageTextContent`: lookup per `task_ref` UUID invece che `tasks.find(t => t.title === link.taskTitle)`.
- Compat: se messaggio vecchio senza `task_ref` → fallback lookup per titolo (deprecato).
- Nessuna migrazione SQL (colonna esiste).

**File toccati:** solo `src/VoyageDesk.jsx`.

---

### 🟡 Step L — Origin-tagging realtime (~1-2h)

**Caveat #5 risolto.** Oggi quando un client genera un evento (es. crea task), riceve sia l'update ottimistico locale, sia il broadcast realtime → flash di re-render.

**Modifiche:**
- Nuova util `getClientId()` in `src/lib/clientId.js`: UUID per tab salvato in `sessionStorage`.
- Migrazione SQL `20260611_origin_tagging.sql`: colonna `origin_client uuid null` su tasks, notices, conversations, messages.
- `api.js`: helper `withOrigin(payload)` che aggiunge `origin_client: getClientId()`.
- Subscribe handlers: skip `payload.new.origin_client === getClientId()`.

**Trade-off:** una migrazione 4 tabelle in più; serializzazione su BulkInsert non cambia.

---

### ⚪ Step M — Storage file chat (~2-3h)

- Bucket `chat-attachments` su Supabase Storage con policy per-conversazione (RLS basata su `conversations.participants`).
- `MessageInput`: input `<input type="file">` → upload `supabase.storage.from('chat-attachments').upload(...)` → patch `messages.file_url`, `messages.file_size` bigint reale (no più stringa "245 KB" lato app).
- `fromDbMessage`/`toDbMessage`: usare `file_size` numerico.
- Caveat #7 risolto.

---

### ⚪ Step N — Code-splitting (~2-3h)

- `vite.config.js`: `build.rollupOptions.output.manualChunks` per separare React/Recharts/Supabase.
- Dynamic `import()` su componenti pesanti raramente usati: `CalendarPlanner`, `AdminView`, `Trash`, `BulkTaskCreator`, `AIDayPlanner`.
- Target: chunk principale ~400 KB.

---

## 5. Caveat residui dopo Step J + fix

| # | Area | Problema | Prio |
|---|------|----------|------|
| 1 | ~~Auto-assegnazione~~ | ~~Trigger task_assigned notifica anche chi si auto-assegna~~ | ✅ RISOLTO |
| 2 | Mention edge case | Nomi composti molto simili → primo match vince (ordinamento per lunghezza nome asc) | ⚪ |
| 3 | Presence heartbeat | UPDATE ogni 45s per tab. Migrabile a Supabase Presence channel. | ⚪ |
| 4 | RLS realtime users | Subscribe a `users` riceve tutti i row. Verificare che `postgres_changes` rispetti RLS in lettura. | 🟡 |
| 5 | Eco realtime | Chi causa evento vede state ottimistico + reload (flash). Step L. | 🟡 |
| 6 | markRead chat | 1 UPDATE per messaggio. Ottimizzabile con upsert batch. | 🟡 |
| 7 | fileSize chat | Lato app è string ("245 KB"), DB bigint resta null. Step M. | ⚪ |
| 8 | Calendar — Distribuzione Agenti | Settimana corrente fissa in vista Giorno. | ⚪ |
| 9 | Task link chat | Match per titolo. Step K. | 🟡 |
| 10 | UNDO_LAST_ACTION | Solo in-memory, no rollback DB. | ⚪ |
| 11 | NOTIFICATIONS mock fallback | Quando lista reale vuota, app mostra notifiche fittizie hardcoded (Marco/Sofia mock). Confonde UX in test. Considerare flag per disattivare in modalità Supabase. | 🟡 |
| 12 | Notifiche reali + mock convivono | Le mock appaiono SEMPRE nello stesso pannello delle reali quando isReal=false. Da decidere comportamento. | 🟡 |

---

## 6. Quick actions per la prossima sessione

| Scenario | Cosa fare | Tempo stimato |
|---|---|---|
| Chiudere test Step J e mergeare | Eseguire T1-T7 → commit + push branch → aprire PR | 30 min |
| Step K (task_ref refactor) | Branch `claude/step-k-task-ref` solo client-side | ~30 min |
| Risolvere caveat #11 (mock fallback) | Mostrare lista vuota invece dei mock quando `isReal=true` | ~10 min |
| Step L (origin-tagging) | Branch + migrazione + util + filtro subscribe | ~1-2 h |
| Step M (storage chat) | Bucket + RLS + upload + patch messages | ~2-3 h |
| Step N (code splitting) | Dynamic import + manualChunks | ~2-3 h |

---

## 7. Configurazione locale

### File `.env` (già creato in sessione)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
```

Verifica:
```powershell
cd C:\Users\londo\TULLIO
type .env
```

### Dev server

```powershell
npm install        # se prima volta
npm run dev        # → http://localhost:5173
```

### Login utenti

| Email | Ruolo | Note |
|-------|-------|------|
| `costello00@libero.it` (Luca Moretti) | Junior Agent (agent) | Creato manualmente in sessione |
| `sofia@tullio.local` | agent | DA CREARE in Supabase Auth per Test T5 |
| `marco@tullio.local` | manager | DA CREARE per test queue_stale |
| `roberto@tullio.local` | admin | DA CREARE per test queue_stale |

Per creare nuovo utente Auth:
1. https://supabase.com/dashboard/project/vmxvnxsqfisucugcpqlc/auth/users
2. Add user → Create new user → email + password + spunta "Auto Confirm User"

⚠️ Nota: il login richiede anche riga corrispondente in `public.users` con stesso `id`. Verificare/creare se necessario.

---

## 8. Note importanti

- **Migrazione `step_j_fix.sql` già applicata via MCP** durante la sessione: il file su disco è solo storico/version control.
- **VoyageDesk.jsx** è ora ~8060 righe. Step N (code-splitting) sempre più urgente.
- **Le notifiche mock fittizie** (Marco/Sofia/"Newsletter Giugno") sono UI fallback in `NOTIFICATIONS` array statico. Da disattivare in modalità Supabase per non confondere i test (caveat #11/#12).
- **pg_cron**: i job sono attivi ma in dev locale non li vedrai partire fino alle 08:00 UTC (task_due) o minuto 5 di ogni ora (queue_stale). Per test immediati usare le funzioni manualmente: `SELECT public.notify_task_due();` / `SELECT public.notify_queue_stale();`

---

**Fine handoff.** Buona prossima sessione.
