# HANDOFF — Sessione TULLIO post Step R
**Data:** 13 giugno 2026 (sessione 15)
**Sessione precedente:** Claude Code on the web — sessione 14 ha mergeato PR #22/#23/#24 (Step Q). Sessione 15 ha aperto PR #30 (Step R, draft).
**Per:** Claude Code / Claude Cowork (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-11_v8.md` (sessione 14).

---

## 0. TL;DR (30 secondi)

- ✅ **PR #30 aperta (draft)** su branch `claude/roadmap-project-review-wkusz2`: **Step R** — versionamento 14 migrazioni mancanti.
  - CI verde (Vercel Preview: success). Da mergeato quando approvata.
- ⚠️ **Breaking change scoperta in sessione 15**: `20260613100833_user_contacts_table` (applicata via MCP tra sessione 14 e 15) ha rimosso `email`/`phone` da `public.users` → `public.user_contacts`. Il codice app NON è ancora aggiornato (caveat #24, nuovo).
- **Prossima sessione raccomandazione**: merge PR #30, poi **Step S** (fix app per `user_contacts`) o **Step P** (refactor monolite).

---

## 1. Riepilogo lavori sessione 15 (Step R)

### Cosa è stato fatto

1. **Analisi drift completa**: confronto tra `supabase_migrations.schema_migrations` (25 righe nel DB) e i file in `supabase/migrations/` del repo. Trovato:
   - 8 migrazioni schema-base mai versioniate (20260605-20260608)
   - 1 migrazione "persa" (`step_j_fix2`) — recuperata dal DB come `20260609163159`
   - 5 migrazioni nuove applicate post-handoff v8 (20260613) — inclusa breaking change `user_contacts_table`
   - 2 file nel repo non tracciati nel DB (`notifications_extra`, `step_j_fix`)

2. **PR #30 creata (draft)** con 16 file:
   - 14 nuovi file SQL versionati (schema completo)
   - 2 file esistenti aggiornati con commenti esplicativi (stato non-tracciato + stale `notify_queue_stale`)

### File aggiunti in PR #30

| File | DB version | Contenuto |
|---|---|---|
| `20260605160705_schema_iniziale_voyagedesk.sql` | 20260605160705 | Schema base: users/tasks/comments/notices/conversations/messages |
| `20260605160742_enable_rls_and_policies.sql` | 20260605160742 | RLS + helper functions + policy iniziali |
| `20260605160836_hardening_advisors_fix.sql` | 20260605160836 | Security hardening, search_path, policy riscrittura |
| `20260608115454_fase1_clients_suppliers_dossiers.sql` | 20260608115454 | clients/suppliers/dossiers/dossier_suppliers |
| `20260608122151_fix_task_priority_status_to_match_app.sql` | 20260608122151 | Constraint priority/status corretti |
| `20260608230232_users_add_capacity_and_avatar.sql` | 20260608230232 | Colonna capacity |
| `20260608231610_enable_realtime_for_app_tables.sql` | 20260608231610 | Realtime tasks/comments/notices |
| `20260608231915_enable_realtime_for_chat_tables.sql` | 20260608231915 | Realtime conversations/messages |
| `20260609163159_grant_execute_is_admin_step_j_fix2.sql` | 20260609163159 | **step_j_fix2 ritrovata**: GRANT EXECUTE is_admin() |
| `20260613080033_fix_users_privilege_escalation.sql` | 20260613080033 | Trigger blocco auto-escalation ruolo |
| `20260613092355_revoke_rpc_execute.sql` | 20260613092355 | Revoca EXECUTE funzioni trigger/cron |
| `20260613092421_messages_read_receipts.sql` | 20260613092421 | Policy + trigger guard aggiornamento messaggi |
| `20260613092440_restrict_pii_select.sql` | 20260613092440 | SELECT su PII commerciali solo admin/manager/agent |
| `20260613100833_user_contacts_table.sql` | 20260613100833 | **BREAKING**: email/phone → user_contacts |

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `cbd4cb5 Step Q: Hardening realtime + chat (#24)` (invariato)
**PR aperta:** #30 (draft, `claude/roadmap-project-review-wkusz2`) — CI verde, pronta per review + merge.

### Note operative (invariato da v8)

- `npm install` su container Linux riscrive `package-lock.json` con LF. Scartare sempre il diff prima di committare: `git checkout -- package-lock.json`.
- Hook `~/.claude/stop-hook-git-check.sh` blocca chiusura se ci sono modifiche non committate.

---

## 3. Stato Supabase (delta sessione 15)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migrazioni DB (cumulativo, tutte ora in repo dopo merge PR #30)

Ordine applicazione:
```
20260605160705  schema_iniziale_voyagedesk
20260605160742  enable_rls_and_policies
20260605160836  hardening_advisors_fix
20260608115454  fase1_clients_suppliers_dossiers
20260608122151  fix_task_priority_status_to_match_app
20260608230232  users_add_capacity_and_avatar
20260608231610  enable_realtime_for_app_tables
20260608231915  enable_realtime_for_chat_tables
20260609091418  notifications (= 20260609_notifications.sql nel repo)
20260609091432  user_presence (= 20260609_user_presence.sql)
20260609163159  grant_execute_is_admin_step_j_fix2  ← NUOVO in repo
20260609174842  step_j_fix3_tasks_set_created_by (= 20260610_step_j_fix3.sql)
20260609184437  step_j_fix4_mention_regex (= 20260610_step_j_fix4.sql)
20260609190630  step_j_fix5_notifications_rls (= 20260610_step_j_fix5.sql)
20260610192442  origin_tagging (= 20260611_origin_tagging.sql)
20260611094536  chat_files_storage (= 20260611_chat_files_storage.sql)
20260611173409  replica_identity_full (= 20260611_replica_identity_full.sql)
20260611221308  origin_tagging_comments_users (= 20260612_origin_tagging_comments_users.sql)
20260611221627  messages_mark_read_bulk (= 20260612_messages_mark_read_bulk.sql)
20260613080033  fix_users_privilege_escalation  ← NUOVO in repo
20260613092355  revoke_rpc_execute  ← NUOVO in repo
20260613092421  messages_read_receipts  ← NUOVO in repo
20260613092440  restrict_pii_select  ← NUOVO in repo
20260613100833  user_contacts_table  ← NUOVO in repo
```

**File nel repo ma NON tracciati in supabase_migrations** (applicati via execute_sql):
- `supabase/migrations/20260610_notifications_extra.sql`
- `supabase/migrations/20260610_step_j_fix.sql`

Entrambi aggiornati con commento `⚠️ STATO: applicato via execute_sql MCP (non tracciato)`.

### Schema `public.users` dopo `user_contacts_table`

Le colonne `email` e `phone` NON esistono più in `public.users`.
Sono in `public.user_contacts` (RLS: solo utente stesso o admin).

---

## 4. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1–8 | (chiusi) | ✅ | — | |
| 9 | (chiuso) | ✅ | — | |
| 10 | Hook subscribe duplicati (3 useEffect) | ⚪ Aperto | bassa | `useDebouncedTableSubscription`. Pri 4 |
| 11–14 | (chiusi) | ✅ | — | |
| 15 | VoyageDesk.jsx ~7100 righe | 🔶 Step N parziale | media | Step P |
| 16–20 | (chiusi o non issue) | ✅ | — | |
| 18 | Mojibake CSV preview import | ⚪ Aperto | bassa | Quick win |
| 19 | Drift repo↔DB migrazioni | ✅ **Step R (PR #30)** | — | Da mergeato |
| 2 | Mention edge case | ⚪ Aperto | bassa | |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| **24** | **app non aggiornata per user_contacts** | 🔴 **Aperto** | **alta** | api.js + ProfileEditor da aggiornare |  

### Caveat #24 — app non aggiornata per `user_contacts` (NUOVO, alta priorità)

`20260613100833_user_contacts_table` ha rimosso `email`/`phone` da `public.users`. Il codice app:

- `api.js` → `Users.list()`: `select('*')` su `users` — non ritorna più email/phone (silenzioso)
- `api.js` → `Users.updateProfile(id, patch)`: se patch include `email`/`phone`, Supabase ritorna errore `column does not exist`
- `VoyageDesk.jsx` → `ProfileEditor`: probabilmente dispatchna `UPDATE_OWN_PROFILE` con email/phone

**Fix da fare (Step S):**
1. `api.js`: aggiungere `Users.getContacts(userId)` e `Users.updateContact(userId, { email?, phone? })`
2. `api.js`: rimuovere email/phone da `Users.updateProfile` patch
3. `VoyageDesk.jsx`: aggiornare `ProfileEditor` per usare i nuovi metodi
4. Includere `user_contacts` nella `Users.list()` se serve mostrare email/phone in Admin

---

## 5. 🚧 ROADMAP — Prossima sessione

### Pri 0 — Merge PR #30 (Step R)

CI verde, nessun review comment. Fare squash merge in `main`.

### Pri 1 — Step S: Fix app per `user_contacts` (~1h, caveat #24)

Breaking change già in produzione nel DB. Da fare prima di Step P per evitare bug visibili agli utenti.

```
# File da modificare:
src/lib/api.js          → aggiungi Users.getContacts / Users.updateContact
src/VoyageDesk.jsx      → aggiorna ProfileEditor (dispatch UPDATE_OWN_PROFILE)
```

Se il ProfileEditor non usa email/phone criticamente (es. solo display), può essere un cambio minimo:
1. Rimuovi email/phone da `toDbPatch` passato a `Users.updateProfile`
2. Usa `Users.updateContact` per salvare email/phone separatamente
3. Al caricamento del profilo, fai un secondo fetch su `user_contacts` per l'utente loggato

### Pri 2 — Step P: Refactor monolite VoyageDesk.jsx (~4-6h, caveat #15)

Vedi handoff v8 §5 per piano dettagliato. Fare dopo Step S per non sovrapporre modifiche a VoyageDesk.jsx.

### Pri 3 — Quick wins (~1-2h)

- **#10**: `useDebouncedTableSubscription` hook
- **#18**: mojibake CSV
- **#3**: presence heartbeat ottimizzato
- **#2**: mention parser
- **#8**: calendar settimana

---

## 6. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Merge PR #30 (squash) su GitHub
3. Crea branch claude/step-s-user-contacts
4. Fix api.js + VoyageDesk.jsx per user_contacts
5. Verifica build, apri PR draft, attendi Vercel Ready, mergea (squash)
```

**Comandi base (sessione remota, container fresco):**
```bash
git checkout main && git pull
git checkout -b claude/step-s-user-contacts
npm install
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build
```

---

## 7. Configurazione locale (invariato da v7)

### `.env` (esiste, NON committato)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # attivabile in dev se serve
```

---

## 8. Utenti DB (invariato da v6)

| Nome | UUID | Email (ora in user_contacts) | Ruolo |
|------|------|-------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

---

## 9. Note importanti per Claude nella prossima sessione

- **Merge squash**: convenzione fissa per questo repo.
- **PR sempre draft alla creazione**; togliere draft solo dopo verifica build + Vercel preview Ready.
- **`package-lock.json`**: il file in repo ha CRLF; `npm install` su container Linux lo riscrive con LF. Sempre `git checkout -- package-lock.json` prima di chiudere il turno.
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<version>_<nome>.sql`. Il nome del file deve usare il timestamp completo (16 cifre) come prefisso per corrispondere alla versione DB.
- **`send_later` non disponibile** in questo ambiente. PR-watch tramite subscribe_pr_activity.
- **Caveat #17 / `_sync*` globali**: fragilità architetturale ancora aperta. Step P la risolve alla radice.
- **Caveat #24**: Breaking change `user_contacts` — altissima priorità, fa Step S prima di Step P.

---

**Fine handoff v9.** Sessione 15 chiude Step R (PR #30 in draft). Pri 0 → merge PR #30. Pri 1 → Step S (fix user_contacts). Buona prossima sessione.
