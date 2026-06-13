# HANDOFF — Sessione TULLIO: Security Hardening
**Data:** 13 giugno 2026 (sessione 15)
**Sessione precedente:** v8 (sessione 14) ha chiuso Step Q (PR #24) + handoff v8 (PR #25).
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-11_v8.md` (stato pre-security, roadmap Step R/P) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- 🔐 **Sessione interamente dedicata alla security review** del progetto. Tutti i fix sono sul branch `claude/vibrant-goodall-uz5tc7` → **PR #28 (draft, aperta)**.
- ✅ **7 finding chiusi**: 1 critico (privesc), 1 alto (xlsx vuln), 5 medi (RPC esposte, read receipts RLS, PII clienti/fornitori, CSV injection, **PII colleghi**).
- ✅ **5 migration applicate** al progetto Supabase `tullio` via MCP + versionate in `supabase/migrations/`.
- ✅ `npm run build` verde. Advisor di sicurezza: **nessun rilievo critico/medio residuo**.
- ⏳ **Azione richiesta all'utente** (non automatizzabile): abilitare **Leaked Password Protection** dal dashboard Supabase (Authentication → Attack Protection) o via Management API.
- ⏳ **Prossima sessione**: mergeare PR #28 (dopo Vercel Ready), poi riprendere la roadmap funzionale di v8 → **Step R** (drift repo↔DB) raccomandato, poi **Step P** (refactor monolite).

---

## 1. Riepilogo lavori sessione 15 (cronologico)

| # | Finding | Sev | Commit | Migration |
|---|---------|-----|--------|-----------|
| 1 | Privilege escalation su `public.users` | 🔴 CRIT | `2e597dc` | `20260613_fix_users_privilege_escalation.sql` |
| 2 | `xlsx@0.18.5` (Prototype Pollution + ReDoS) → `exceljs` | 🟠 ALTA | `d461b54` | — (cambio dipendenza) |
| 3 | RPC `SECURITY DEFINER` esposte via `/rpc` | 🟡 MED | `7cdf775` | `20260613_revoke_rpc_execute.sql` |
| 4 | Read receipts / reactions bloccate dalla RLS | 🟡 MED | `7cdf775` | `20260613_messages_read_receipts.sql` |
| 5 | PII clienti/fornitori leggibile da tutti | 🟡 MED | `7cdf775` | `20260613_restrict_pii_select.sql` |
| 6 | CSV formula injection (export) | 🟡 MED | `7cdf775` | — (fix `escapeCSV`) |
| 7 | **PII colleghi (email/telefono) leggibile da tutto lo staff** | 🟡 MED | `79f6092` | `20260613_user_contacts_table.sql` |

### Dettaglio finding #1 — Privilege escalation (CRITICO)
`users_update` permetteva UPDATE della propria riga senza restrizione di colonna + grant `UPDATE` su `role` → qualunque utente (anche `driver`) poteva auto-promuoversi admin via REST.
**Fix:** trigger `BEFORE UPDATE` `users_block_privileged_self_update()` che per i non-admin ripristina `role`/`active`/`pending`/`capacity`/`id` ai valori `OLD`. Revoca `UPDATE` da `anon`.

### Dettaglio finding #2 — xlsx → exceljs (ALTA)
SheetJS su npm fermo a 0.18.5 con CVE-2023-30533 + CVE-2024-22363 senza fix sul registry. Migrato a **`exceljs`** (loader dinamico `loadExcelJS`, import `.xlsx`, parser CSV dedicato `parseCSVMatrix`, export `.xlsx`). **Trade-off:** perso l'import del legacy `.xls` (restano `.xlsx`/`.csv`).

### Dettaglio finding #3 — RPC esposte (MEDIA)
`REVOKE EXECUTE` da `anon`/`authenticated`/`PUBLIC` sulle trigger-function e job `notify_*` (erano richiamabili via `/rpc` → spam notifiche). `is_admin`/`is_manager_or_admin` restano `authenticated` (servono alla RLS) ma tolti ad `anon`; `next_dossier_number`/`messages_mark_read` solo `authenticated`.

### Dettaglio finding #4 — Read receipts (MEDIA)
L'unica policy UPDATE su `messages` era sul mittente → segnare come letto/reagire a messaggi **ricevuti** dava 0 righe. **Fix:** policy per i partecipanti + trigger-guardia che limita ai non-mittenti le sole colonne `read_by`/`reactions`/`origin_client` (testo/allegati altrui immutabili).

### Dettaglio finding #5 — PII clienti/fornitori (MEDIA)
SELECT su `clients`/`suppliers`/`dossiers`/`dossier_suppliers` era aperta a ogni utente loggato (incluso `driver`). **Fix:** ristretta ad `admin`/`manager`/`agent`. Tabelle non lette dall'app attuale → nessuna regressione.

### Dettaglio finding #6 — CSV injection (MEDIA)
`escapeCSV` non neutralizzava le formule. **Fix:** apostrofo anteposto alle celle che iniziano con `=` `+` `-` `@` tab/CR.

### Dettaglio finding #7 — PII colleghi (MEDIA) ← **ultimo lavoro di questa sessione**
`public.users.email`/`phone` erano leggibili da ogni utente loggato sia via SELECT (`select('*')` in `AuthContext`/`Users.list`) sia via **realtime** (`users` è `REPLICA IDENTITY FULL` in `supabase_realtime` → payload old/new completi a ogni heartbeat presence). Esposti i recapiti di tutti i colleghi a chiunque.

**Fix scelto dall'utente (strategia "tabella dedicata", via `AskUserQuestion`):**
- **DB** (`20260613_user_contacts_table.sql`):
  - nuova tabella `public.user_contacts` (`user_id` PK → `users` ON DELETE CASCADE, `email`, `phone`, `updated_at`) + unique index parziale su `email`.
  - **RLS:** `select`/`insert`/`update` solo se `user_id = auth.uid()` **oppure** `is_admin()`; `delete` solo admin. `revoke all from anon`.
  - **NON** inserita nella publication `supabase_realtime` → i contatti non transitano mai su `postgres_changes`.
  - trigger `touch_updated_at` riusato per `updated_at`.
  - dati migrati da `public.users` (5 righe, 5 con email) **prima** del `drop column email, phone`.
  - **`handle_new_user()` aggiornato**: al signup `name`/`role`/`pending` vanno in `users`, l'`email` in `user_contacts` (era la dipendenza critica: senza questo i nuovi signup si rompevano).
- **Client:**
  - `src/auth/AuthContext.jsx` → `loadProfile` idrata `email`/`phone` da `user_contacts` in `profile`/`team` (RLS: solo il proprio, o tutti se admin). I colleghi non vedono più i recapiti altrui.
  - `src/lib/api.js` → nuova API `Contacts` (`listVisible`, `upsert`).
  - `src/VoyageDesk.jsx` → `ProfileEditor` persiste i propri recapiti via `Contacts.upsert` nel wrapper `dispatch` (case `UPDATE_OWN_PROFILE`). Import `Contacts as ContactsAPI`.

### Verifica build (commit `79f6092`, container)
```
dist/assets/react-*.js          141.00 kB │ gzip:  45.31 kB
dist/assets/supabase-*.js       211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js          268.98 kB │ gzip:  65.46 kB
dist/assets/exceljs.min-*.js    938.56 kB │ gzip: 271.04 kB  (lazy, fuori dal chunk iniziale)
```
⚠️ La PR #28 NON è ancora stata verificata su Vercel preview né mergeata. Vedi §5.

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `98cbc34 docs: handoff v8 — post Step Q (#25)`
**Branch sessione 15:** `claude/vibrant-goodall-uz5tc7` (base `main`) → **PR #28 (draft, aperta)**.
Commit della PR: `2e597dc` → `d461b54` → `7cdf775` → `79f6092`.

### Note operative (invariate da v8)
- `npm install` su container Linux riscrive `package-lock.json` con LF (originale CRLF da Windows). Diff cosmetico → `git checkout -- package-lock.json` prima di chiudere il turno. **NB:** in questa sessione `package-lock.json` è stato modificato legittimamente (aggiunta `exceljs`, rimossa `xlsx`) — quel diff va committato; scartare solo l'eventuale diff puramente line-ending.
- `dist/` è gitignored.

---

## 3. Stato Supabase (delta sessione 15)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migration aggiunte (tutte ✅ applicate via MCP + versionate)
- `20260613_fix_users_privilege_escalation.sql` — trigger anti-privesc + revoke update da anon
- `20260613_revoke_rpc_execute.sql` — revoke execute RPC esposte
- `20260613_messages_read_receipts.sql` — policy partecipanti + trigger-guardia colonne
- `20260613_restrict_pii_select.sql` — SELECT clients/suppliers/dossiers ad admin/manager/agent
- `20260613_user_contacts_table.sql` — tabella PII contatti + RLS + migrazione + drop colonne + `handle_new_user`

### Schema `public.users` (dopo sessione 15)
Colonne: `id, name, role, avatar, color, photo_url, active, pending, created_at, updated_at, capacity, status, last_seen_at, origin_client`.
**Rimosse:** `email`, `phone` → ora in `public.user_contacts`.

### `public.user_contacts` (NUOVA)
`user_id` (PK, FK→users, CASCADE), `email`, `phone`, `updated_at`. RLS own+admin. **Fuori** da `supabase_realtime`.

### Advisor di sicurezza residui (tutti pre-esistenti, bassa priorità)
- `function_search_path_mutable`: `next_dossier_number`, `tasks_set_created_by`, `messages_mark_read` → aggiungere `set search_path = public` (quick win).
- `authenticated_security_definer_function_executable`: `is_admin`, `is_manager_or_admin` → **by design** (RLS). `next_dossier_number` → SECURITY DEFINER + executable: valutare `SECURITY INVOKER` o revoke.
- `auth_leaked_password_protection`: **DISABILITATA** → richiede azione utente nel dashboard (vedi §6).

---

## 4. 🐛 Caveat / finding aperti

### Nuovi da questa sessione
| # | Area | Stato | Prio |
|---|------|-------|------|
| S1 | Leaked Password Protection disabilitata | ⏳ azione utente (dashboard) | 🟡 |
| S2 | `function_search_path_mutable` (3 funzioni) | ⚪ aperto | bassa |
| S3 | `next_dossier_number` SECURITY DEFINER executable + race `COUNT(*)+1` | ⚪ aperto | bassa |
| S4 | Persistenza profilo `name`/`avatar`/`color` resta in-memory | ⚪ aperto (pre-esistente) | bassa |
| S5 | Import legacy `.xls` rimosso (trade-off exceljs) | ⚪ accettato | — |

### Ereditati da v8 (ancora rilevanti)
- **#15** VoyageDesk.jsx ~8400 righe → **Step P** (refactor monolite), media.
- **#19** Drift repo↔DB migrazioni (DDL base non versionato, `step_j_fix2.sql` perso, def stale `notify_queue_stale`) → **Step R**, media.
- Quick wins: **#10** hook `useDebouncedTableSubscription`, **#18** mojibake CSV, **#3** presence heartbeat, **#2** mention boundary, **#8** calendar settimana fissa.

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 0 — Chiudere PR #28
1. Verificare il preview Vercel del branch `claude/vibrant-goodall-uz5tc7` → atteso **Ready**.
2. **Smoke-test login** (regressione PII colleghi): login come un utente non-admin → il proprio profilo mostra email/telefono, i colleghi NO; login come admin (`Roberto`) → la gestione team resta intatta; un nuovo signup popola `users` + `user_contacts`.
3. Togliere draft → merge **squash** → eliminare il branch.
4. (Opzionale) Aggiornare `docs/CHANGELOG.md` con la security review (v1.6).

### Pri 1 — Step R: Drift repo↔DB (~1-2 h, caveat #19)
Vedi v8 §5. Pulisce il debito di versionamento DB prima del refactor. Da fare PRIMA di Step P.

### Pri 2 — Step P: Refactor monolite VoyageDesk.jsx (~4-6 h, caveat #15)
Vedi v8 §5: prima eliminare i `let` globali `TEAM`/`CATEGORIES`/`CURRENT_USER` (`_sync*`), poi estrarre componenti in `src/components/*`, una PR per gruppo.

### Pri 3 — Quick wins sicurezza (~30 min)
- `set search_path = public` sulle 3 funzioni con search_path mutabile (S2).
- Valutare `next_dossier_number` → sequence + `SECURITY INVOKER` (S3).

---

## 6. ⚠️ Azione richiesta all'utente (non automatizzabile da Claude)

**Abilitare la Leaked Password Protection** (verifica password contro HaveIBeenPwned):
- **Dashboard:** progetto `tullio` → Authentication → **Attack Protection** → attiva "Leaked password protection".
- **oppure Management API:**
  ```bash
  curl -X PATCH https://api.supabase.com/v1/projects/vmxvnxsqfisucugcpqlc/config/auth \
    -H "Authorization: Bearer <PERSONAL_ACCESS_TOKEN>" \
    -H "Content-Type: application/json" \
    -d '{"password_hibp_enabled": true}'
  ```
Dopo l'abilitazione, l'advisor `auth_leaked_password_protection` sparisce.

---

## 7. Quick start prossima sessione

```
1. Leggi §0-3 di questo file + CLAUDE.md
2. Verifica/mergea PR #28 (Pri 0)
3. Crea branch dedicato da main aggiornato (es. claude/step-r-drift-schema)
4. Esegui, build, PR draft, Vercel Ready, merge squash
```

**Build (container fresco):**
```
npm install   # NB: aggiunge exceljs, rimuove xlsx — diff package-lock legittimo
VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build
```

**Dev locale (PowerShell):**
```powershell
cd C:\Users\londo\TULLIO
git checkout main && git pull
git checkout -b claude/<nuovo-step>
npm run dev
```

### `.env` locale (esiste, NON committato)
```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false
```

---

## 8. Utenti DB (email ora in `user_contacts`)

| Nome | UUID | Email (in user_contacts) | Ruolo |
|------|------|--------------------------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | **admin** |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

Per testare l'admin team editor e la visibilità completa dei contatti, accedere come **Roberto** (admin).

---

## 9. Note importanti per Claude nella prossima sessione

- **Le migration sono già applicate al DB remoto** (via MCP). Ogni `apply_migration` MCP deve avere un file gemello in `supabase/migrations/<data>_<nome>.sql` (in questa sessione fatto per tutte e 5). Non lasciare drift.
- **PII colleghi**: `email`/`phone` NON sono più su `public.users`. Se nuovo codice deve leggerli, usare `Contacts.listVisible()`/`AuthContext` (mai riaggiungere `select('*')` aspettandosi i contatti). Per scriverli: `Contacts.upsert`.
- **Realtime su `users`**: la tabella è ancora `REPLICA IDENTITY FULL` + in publication (serve all'origin-tagging della presence), ma ora il payload non contiene più PII. NON aggiungere `user_contacts` alla publication.
- **`handle_new_user`**: ora scrive su due tabelle (`users` + `user_contacts`). È `SECURITY DEFINER` → bypassa la RLS al signup. Se si modifica, mantenere entrambi gli insert.
- **PR sempre draft alla creazione**; togliere draft solo dopo build + Vercel Ready. **Merge squash** (convenzione fissa).
- **`AskUserQuestion`** prima di scelte di prodotto ambigue (in questa sessione usato per la strategia PII colleghi: l'utente ha scelto "tabella dedicata" vs "non distruttiva").
- **`send_later` non disponibile** in questo ambiente → per babysit PR affidarsi agli eventi webhook (push/review/CI), niente self-check programmati.

---

**Fine handoff v9.** Sessione 15 chiude la security review (PR #28, 7 finding). Pri 0 → mergeare #28 + abilitare Leaked Password Protection. Poi roadmap funzionale v8 (Step R → P). Buona prossima sessione.
