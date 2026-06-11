# HANDOFF — Sessione TULLIO post Step R
**Data:** 11 giugno 2026 (sessione 15)
**Sessione precedente:** Claude Code on the web — sessione 14 ha mergeato PR #24 (Step Q) + PR #25 (handoff v8). Sessione 15 ha chiuso Step R (drift repo↔DB) — caveat #19.
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-11_v8.md` (sessione 14, dettaglio Step Q) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **PR Step R** mergeata (drift repo↔DB chiuso). Recuperate **9 migrazioni** dal DB (incluso `step_j_fix2` perso). Aggiunti header esplicativi ai 2 file out-of-band; rimossa def stale di `notify_queue_stale`. Nessuna modifica codice app.
- ⏳ **Prossima sessione**: **Step P** (refactor monolite, caveat #15 residuo, ~4-6h) ora è la priorità più alta. Alternative: quick wins (#10/#18/#2/#3/#8).

---

## 1. Riepilogo lavori sessione 15 (cronologico)

| # | Cosa | Stato |
|---|------|-------|
| 1 | Audit drift via `mcp__Supabase__list_migrations` → 19 DB vs 12 repo | ✅ |
| 2 | Recupero contenuto 9 migrazioni mancanti da `supabase_migrations.schema_migrations.statements` | ✅ |
| 3 | Creazione 9 file SQL in `supabase/migrations/` con formato `yyyymmddhhmiss_<nome>.sql` (Supabase CLI standard) | ✅ |
| 4 | Pulizia def stale `notify_queue_stale` in `notifications_extra.sql` (superseded da `step_j_fix.sql`) | ✅ |
| 5 | Header `⚠️ OUT-OF-BAND` sui 2 file `notifications_extra.sql` + `step_j_fix.sql` | ✅ |
| 6 | CHANGELOG v1.7-dev | ✅ |
| 7 | Build verde + PR draft + merge squash | ✅ |

### Cosa contiene Step R

**R.1 — Recupero 9 migrazioni mancanti**

| File aggiunto | Versione DB | Contenuto |
|---|---|---|
| `20260605160705_schema_iniziale_voyagedesk.sql` | `20260605160705` | DDL tabelle base: users, tasks, comments, notices, conversations, messages + trigger `touch_updated_at` + handle_new_user |
| `20260605160742_enable_rls_and_policies.sql` | `20260605160742` | Funzioni `is_admin` / `is_manager_or_admin` / `current_user_role` + RLS policies prima versione |
| `20260605160836_hardening_advisors_fix.sql` | `20260605160836` | Riscrive le policies con `(SELECT auth.uid())` per fix advisor `auth_rls_initplan`. Revoke EXECUTE da is_admin/is_manager_or_admin |
| `20260608115454_fase1_clients_suppliers_dossiers.sql` | `20260608115454` | CRM base: clients, suppliers, dossiers, dossier_suppliers + funzione `next_dossier_number()` + collegamento tasks→dossier |
| `20260608122151_fix_task_priority_status_to_match_app.sql` | `20260608122151` | Allinea CHECK constraint priority/status ai valori UI (italiani → tecnici) |
| `20260608230232_users_add_capacity_and_avatar.sql` | `20260608230232` | `users.capacity` (default 10) + popola avatar fallback |
| `20260608231610_enable_realtime_for_app_tables.sql` | `20260608231610` | Publication: tasks, comments, notices |
| `20260608231915_enable_realtime_for_chat_tables.sql` | `20260608231915` | Publication: conversations, messages |
| `20260609163159_grant_execute_is_admin_step_j_fix2.sql` | `20260609163159` | **step_j_fix2 perso recuperato.** Grant EXECUTE su `is_admin()` (necessario dopo revoke di hardening_advisors_fix) |

Tutti recuperati via `select statements[1] from supabase_migrations.schema_migrations where version=...`.

**R.2 — Pulizia def stale `notify_queue_stale`**

In `20260610_notifications_extra.sql` la def originale (case-sensitive `Manager`/`Admin`/`Senior Agent`, ruoli inesistenti in DB) è stata rimossa. Era già superseded da `20260610_step_j_fix.sql:21-62` (lowercase `manager`/`admin`). Sostituita da commento che rimanda al file fix.

**R.3 — Header `⚠️ OUT-OF-BAND` sui 2 file fuori schema_migrations**

`notifications_extra.sql` e `step_j_fix.sql` non sono mai stati registrati nel sistema migrazioni Supabase (applicati pre-MCP). Aggiunto header documentativo che spiega lo status e cita Step R / caveat #19.

### Verifica

- **Statica (eseguita):** mapping 1:1 versioni DB ↔ file repo (vedi tabella CHANGELOG v1.7-dev). Tutte le 19 versioni coperte.
- **Build:** nessuna modifica codice app → build identico a v1.6-dev.
- **Smoke-test su branch Supabase:** **NON eseguito** (richiede `mcp__Supabase__create_branch` + costo + tempi 5-10min). Valutato non strettamente necessario: il contenuto recuperato è verbatim dal DB; un re-apply su DB vuoto produrrebbe lo stesso schema. Se si vuole ulteriore conferma, aprire branch e replay `apply_migration` per ogni file in ordine alfabetico.

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** (dopo merge Step R)
**Branch sessione 15:** `claude/practical-knuth-4p1819`

### Note operative (invariato da v8)

- `npm install` nel container Linux **riscrive `package-lock.json` con LF**; il file originale ha CRLF (generato su Windows). NON committare il diff line-ending: `git checkout -- package-lock.json` lo scarta.
- L'hook `~/.claude/stop-hook-git-check.sh` blocca la chiusura turno se ci sono modifiche non commitate.

---

## 3. Stato Supabase (delta sessione 15)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Nessuna modifica al DB in sessione 15

Step R è puramente di **versionamento file repo**. Lo schema Supabase è invariato da Step Q.

### Inventario migrazioni (post Step R)

**File repo (21 totali):**
- `20260605160705_schema_iniziale_voyagedesk.sql` (Step R recovery)
- `20260605160742_enable_rls_and_policies.sql` (Step R)
- `20260605160836_hardening_advisors_fix.sql` (Step R)
- `20260608115454_fase1_clients_suppliers_dossiers.sql` (Step R)
- `20260608122151_fix_task_priority_status_to_match_app.sql` (Step R)
- `20260608230232_users_add_capacity_and_avatar.sql` (Step R)
- `20260608231610_enable_realtime_for_app_tables.sql` (Step R)
- `20260608231915_enable_realtime_for_chat_tables.sql` (Step R)
- `20260609163159_grant_execute_is_admin_step_j_fix2.sql` (Step R, **ex step_j_fix2 perso**)
- `20260609_notifications.sql` (Step F)
- `20260609_user_presence.sql` (Step E)
- `20260610_notifications_extra.sql` (Step J, **out-of-band**, def stale rimossa)
- `20260610_step_j_fix.sql` (Step J fix #1, **out-of-band**)
- `20260610_step_j_fix3.sql` (Step J fix #3)
- `20260610_step_j_fix4.sql` (Step J fix #4)
- `20260610_step_j_fix5.sql` (Step J fix #5)
- `20260611_chat_files_storage.sql` (Step M)
- `20260611_origin_tagging.sql` (Step L)
- `20260611_replica_identity_full.sql` (PR #22, fix DELETE eco)
- `20260612_messages_mark_read_bulk.sql` (Step Q.4)
- `20260612_origin_tagging_comments_users.sql` (Step Q.1)

**Versioni DB (19 registrate in `supabase_migrations.schema_migrations`):** vedi tabella CHANGELOG v1.7-dev per il mapping completo.

---

## 4. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1 | Auto-assegnazione | ✅ Step J | — | |
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa | Quick win Pri 3 |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | + 1 UPDATE/tab anche con status invariato |
| 4 | RLS realtime users | ✅ Step Q.6 (non-issue) | — | Policy `qual='true'` by-design |
| 5 | Eco realtime (flash re-render) | ✅ Step L + fix DELETE (PR #22) | — | |
| 6 | markRead chat 1 UPDATE/msg | ✅ Step Q.4 | — | RPC bulk |
| 7 | fileSize chat string vs bigint | ✅ Step M | — | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 9 | Task link chat match per titolo | ✅ Step K | — | |
| 10 | Hook subscribe duplicati (3 useEffect simili) | 🟢 Aperto | bassa | finding #10 review — `useDebouncedTableSubscription`. Pri 3 |
| 11 | NOTIFICATIONS mock fallback | ✅ fix #11 | — | |
| 12 | Mock+reali convivono | ✅ fix #11 | — | |
| 13 | tasks_insert created_by | ✅ Step J fix3 | — | |
| 14 | Demo switch confonde RLS | ✅ fix #14 | — | |
| 15 | VoyageDesk.jsx ~7100 righe | 🔶 Step N parziale | **alta** | bundle ✅, refactor strutturale ⏳ Step P |
| 16 | Logout mancante UI | ✅ Step O | — | |
| 17 | TEAM seed locale al primo login | ✅ PR #22 | — | |
| 18 | Encoding mojibake preview import CSV | ⚪ Aperto | bassa | Quick win Pri 3 |
| 19 | Drift repo↔DB migrazioni | ✅ **Step R** | — | 9 migrazioni recuperate + 2 file out-of-band documentati |
| 20 | Index `messages(conversation_id)` | ✅ Step Q.5 | — | |
| 21 | Race init chat / realtime | ✅ Step Q.2 | — | generation counter |
| 22 | Errori reactions/markRead chat senza toast | ✅ Step Q.3 | — | |
| 23 | withOrigin parziale (comments, users) | ✅ Step Q.1 | — | |

**Aperti rilevanti per la prossima sessione:** #15 residuo (Step P), quick wins #10/#18/#2/#3/#8.

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 1 — Step P: Refactor monolite VoyageDesk.jsx (~4-6 h, caveat #15 residuo)

Ora che il drift DB è chiuso, Step P può procedere senza il rischio "DB locale non ricostruibile" che bloccava in v8. Approccio raccomandato (da handoff v7 §6, ridefinito post-finding #3):

1. **Prima** sostituire i `let` mutabili `TEAM`/`CATEGORIES`/`CURRENT_USER` con un puro flusso state→context, deprecando `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. È invasivo (tutti gli helper `getMember`, `isAdmin`, ecc. li usano) ma sblocca Step P senza trascinarsi dietro il pattern ibrido che ha già causato il caveat #17.
2. **Poi** estrarre componenti:
   - `src/state/` (reducer, context, helpers permessi)
   - `src/components/{calendar,admin,chat,dashboard,tasks,modals}/`
   - Una PR per componente / piccolo gruppo. **Mai un mega-PR.**
3. **Lazy-load** (`React.lazy` + `Suspense`) su modali e viste non-default → ulteriore riduzione del chunk principale.

### Pri 2 — Quick wins (~1-2 h totali)

- **#10** (finding #10 review): estrarre hook `useDebouncedTableSubscription(table, reload, delay=200)` per consolidare i 3 useEffect simili (tasks+notices, notifications, chat). Dopo Step Q.2 questi sono ancora più simili (tutti hanno `loadGen` + `cancelled` + debounce).
- **#18** mojibake CSV: in `handleFile` usare `XLSX.read(buf, { type: 'array', codepage: 65001 })` invece di `binary`. Da verificare con sample CSV.
- **#3** Presence heartbeat: skip dell'UPDATE se status invariato (compare con local cache); valutare allungare a 5min con override su `visibilitychange`.
- **#2** Mention edge case: parser più stringente (boundary `\b` invece di startsWith).
- **#8** Calendar settimana fissa: parametrizzare la settimana di partenza.

### Pri 3 — Estensioni opzionali

- `withOrigin` su `Notifications.markRead` / `Notifications.markAllRead` (al momento non taggate; basso impatto perché le notifiche le genera il DB).
- Estrarre il client `Notifications` come `RealtimeAware` (stesso loadGen pattern).
- **Mass-rename file migrazioni esistenti** al formato `yyyymmddhhmiss_<nome>.sql` matching DB (drift di naming residuo, vedi nota in CHANGELOG v1.7-dev). Solo cosmesi; non urgente.

---

## 6. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Decidi pri (raccomandato: Step P, oppure quick wins per sessione corta)
3. Crea branch dedicato (es. claude/step-p-refactor-monolite)
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
git checkout -b claude/step-p-refactor-monolite
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

---

## 9. Note importanti per Claude nella prossima sessione

- **Migrazioni future**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<version>_<nome>.sql` versionato. Usa il formato Supabase CLI standard `yyyymmddhhmiss_<nome>.sql` per allineare timestamp file ↔ DB ed evitare nuovo drift.
- **Per i 12 file repo esistenti** con timestamp short-form (`20260609_notifications.sql` etc.) NON serve rinominare — funzionano correttamente, l'ordine alfabetico relativo è preservato. Eventuale mass-rename è cosmetico (Pri 3).
- **`AskUserQuestion`** prima di scelte ambigue (es. Step P approccio refactor).
- **PR sempre draft alla creazione**; togliere draft solo dopo verifica build + Vercel preview Ready.
- **Merge squash**: convenzione fissa per questo repo.
- **Q.4 markRead bulk**: il `markConversationRead` bypassa il wrapper `setMessages` per evitare il fan-out di N UPDATE. Se in futuro qualche altro flusso vuole aggiungere readBy a un singolo messaggio (es. "read on hover" di un singolo msg), il path per-msg nel wrapper c'è ancora — usalo, non duplicare la logica.

---

**Fine handoff v9.** Sessione 15 chiude Step R (caveat #19). Pri 1 → Step P (refactor monolite, caveat #15). Buona prossima sessione.
