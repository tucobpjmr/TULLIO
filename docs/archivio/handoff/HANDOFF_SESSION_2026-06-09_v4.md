# HANDOFF — Sessione TULLIO post Step J CHIUSO

**Data:** 9 giugno 2026 (sera tardi, post T1-T7 PASS)
**Sessione precedente:** Cowork - Chiusura Step J: applicati fix3/fix4/fix5, eseguiti T1-T7
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) -> questo file -> `docs/HANDOFF_SESSION_2026-06-09_v3.md` (sessione precedente con dettaglio bug created_by) -> `docs/CHANGELOG.md`.

---

## 0. TL;DR (per chi ha 30 secondi)

- **Step J CHIUSO ✅.** Test T1-T7 tutti PASS (T5 PASS parziale per caveat UI noto).
- Applicati 3 fix DB via MCP, persistenti:
  - `20260610_step_j_fix3.sql` -> trigger BEFORE INSERT che forza `tasks.created_by = auth.uid()`
  - `20260610_step_j_fix4.sql` -> regex mention parser semplificata
  - `20260610_step_j_fix5.sql` -> policy RLS SELECT/UPDATE/DELETE su `notifications`
- **DA FARE PROSSIMA SESSIONE:** commit + push + PR (vedi sez 1), poi Step K o fix UI notifiche mock (caveat #11).

---

## 1. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch corrente locale:** `claude/step-e-sync-robustness` (con modifiche non committate, cumulative)
**Branch suggerito per ripresa:** `claude/step-j-notifications`

### Modifiche locali NON committate (cumulative dalle sessioni v2+v3+v4)

| File | Tipo | Descrizione |
|------|------|-------------|
| `supabase/migrations/20260610_notifications_extra.sql` | NEW | Trigger comment+mention, pg_cron, anti-eco |
| `supabase/migrations/20260610_step_j_fix.sql` | NEW | Grant EXECUTE `is_manager_or_admin` |
| `supabase/migrations/20260610_step_j_fix2.sql` | NEW | Grant EXECUTE `is_admin` |
| `supabase/migrations/20260610_step_j_fix3.sql` | **NEW (v4)** | Trigger forza `tasks.created_by = auth.uid()` |
| `supabase/migrations/20260610_step_j_fix4.sql` | **NEW (v4)** | Regex mention parser semplificata |
| `supabase/migrations/20260610_step_j_fix5.sql` | **NEW (v4)** | Policy RLS SELECT/UPDATE/DELETE su notifications |
| `src/VoyageDesk.jsx` | MOD | NotificationsPanel + integrazioni Step J |
| `docs/CHANGELOG.md` | MOD | Entry v1.2-dev Step J |
| `docs/HANDOFF_SESSION_2026-06-09_v2.md` | NEW | Handoff sessione v2 |
| `docs/HANDOFF_SESSION_2026-06-09_v3.md` | NEW | Handoff sessione v3 |
| `docs/HANDOFF_SESSION_2026-06-09_v4.md` | **NEW (v4)** | Handoff attuale |

I 3 file `fix3/fix4/fix5.sql` sono già applicati via MCP sul DB remoto; i file sono solo per version control.

### Commit + push

```powershell
cd C:\Users\londo\TULLIO
git checkout -b claude/step-j-notifications

git add supabase/migrations/20260610_notifications_extra.sql `
        supabase/migrations/20260610_step_j_fix.sql `
        supabase/migrations/20260610_step_j_fix2.sql `
        supabase/migrations/20260610_step_j_fix3.sql `
        supabase/migrations/20260610_step_j_fix4.sql `
        supabase/migrations/20260610_step_j_fix5.sql `
        src/VoyageDesk.jsx `
        docs/CHANGELOG.md `
        docs/HANDOFF_SESSION_2026-06-09_v2.md `
        docs/HANDOFF_SESSION_2026-06-09_v3.md `
        docs/HANDOFF_SESSION_2026-06-09_v4.md

git commit -m "Step J - Notifiche + fix RLS is_manager_or_admin, is_admin, trigger created_by, regex mention, RLS notifications"

git push -u origin claude/step-j-notifications
```

PR: https://github.com/tucobpjmr/TULLIO/compare/main...claude/step-j-notifications

---

## 2. Stato Supabase (verificato 9/6/2026 sera, post Step J)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migrazioni applicate

| File | Stato |
|------|-------|
| `20260609_notifications.sql` (Step F) | ✅ |
| `20260609_user_presence.sql` (Step H) | ✅ |
| `20260610_notifications_extra.sql` (Step J) | ✅ |
| `20260610_step_j_fix.sql` | ✅ |
| `20260610_step_j_fix2.sql` | ✅ |
| `20260610_step_j_fix3.sql` (created_by trigger) | ✅ **(v4)** |
| `20260610_step_j_fix4.sql` (mention regex) | ✅ **(v4)** |
| `20260610_step_j_fix5.sql` (notifications RLS) | ✅ **(v4)** |

### Trigger attivi su `public.tasks`
```
trg_tasks_set_created_by   BEFORE INSERT   (forza created_by = auth.uid())
trg_notify_task_assigned   AFTER INSERT/UPDATE
```

### Trigger attivi su `public.comments`
```
trg_notify_task_comment    AFTER INSERT   (mention + comment notif)
```

### RLS policies aggiornate

```
public.tasks         tasks_insert/update/select/delete (gia esistenti)
public.notifications notifications_select_own  USING user_id = auth.uid()
                     notifications_update_own  USING/CHECK user_id = auth.uid()
                     notifications_delete_own  USING user_id = auth.uid()
```

### pg_cron jobs attivi
```
notify_task_due_daily      0 8 * * *
notify_queue_stale_hourly  5 * * * *
```

Eseguibili manualmente: `SELECT public.notify_task_due();` / `SELECT public.notify_queue_stale();`

### Stato dati post-cleanup
```
public.tasks         0
public.comments      0
public.notifications 0
```

---

## 3. Esito test Step J

| Test | Esito | Note |
|------|-------|------|
| T1 - Salvataggio task NON bloccato | ✅ | Sbloccato da fix3 (trigger created_by) |
| T2 - Anti-eco self-assign | ✅ | |
| T3 - Mention parser | ✅ | Sbloccato da fix4 (regex semplificata) |
| T4 - Comment ad assignee | ✅ | |
| T5 - Navigazione da notifica | ⚠️ PASS parziale | RLS+trigger OK (fix5). UI bloccata da caveat #13 (demo switch non fa logout reale Supabase Auth) |
| T6 - pg_cron task_due | ✅ | Dedup 22h verificato |
| T7 - pg_cron queue_stale | ✅ | Notifica a manager (Marco) + admin (Roberto) |

---

## 4. 🐛 BUG / CAVEAT ancora aperti

### #13 (era CRITICO, ora ✅ RISOLTO) - tasks_insert created_by
Risolto via trigger DB fix3.

### #11 🟡 - Notifiche mock fittizie in UI
NotificationsPanel mostra array hardcoded ("Newsletter Giugno", "Hotel Overwater Bungalow", "Maldive") quando `public.notifications` è vuota o filtrata. **Sopravvive anche dopo fix5** perche il merge mock+reali e' lato client, non lato fetch.

**Fix proposto (~10 min):** in `VoyageDesk.jsx` cercare `NOTIFICATIONS_MOCK` e gate-arlo con:
```js
const SHOW_MOCK = import.meta.env.DEV && import.meta.env.VITE_SHOW_MOCK_NOTIFICATIONS === 'true';
const notifications = SHOW_MOCK ? [...realNotifs, ...mockNotifs] : realNotifs;
```
Default off in produzione.

### #14 🟡 (NUOVO) - Demo switch non fa logout Supabase Auth
Il menu in alto a destra "Accedi come Roberto/Marco/..." cambia solo `currentUser` UI locale. `auth.uid()` server-side resta l'utente reale loggato.

Conseguenza: RLS legge sempre come l'utente reale, demo switch confonde i test (notifiche non visibili, presence incoerente, ecc.).

**Fix proposti (a scelta):**
- A) Demo switch fa anche `supabase.auth.signInWithPassword()` (richiede password salvata - sconsigliato in prod)
- B) Gate-are demo switch dietro flag dev `VITE_DEMO_SWITCH=true`, default off
- C) Aggiungere bottone "Logout vero" ben visibile in menu

### #15 🟡 (NUOVO) - VoyageDesk.jsx sempre piu' grande
~8060 righe. Step N (code-splitting) urgenza alta.

### Caveat ereditati invariati (1-12 da handoff v3)
Vedi sezione 10 di `HANDOFF_SESSION_2026-06-09_v3.md`.

---

## 5. 🚧 ROADMAP - Prossima sessione (in ordine)

### Pri 1 - Commit + push + PR (~10 min)
Eseguire comandi git da sezione 1.

### Pri 2 - Fix caveat #11 (notifiche mock) (~10-15 min)
Cercare `NOTIFICATIONS_MOCK` in `src/VoyageDesk.jsx`, gate dietro env var.

### Pri 3 - Fix caveat #14 (demo switch) (~20 min)
Opzione B raccomandata: gate switch dietro `VITE_DEMO_SWITCH` flag.

### Pri 4 - Step K - Refactor task link via task_ref (~30 min)
Vedi handoff v2.

### Pri 5 - Step L - Origin-tagging realtime (~1-2h)
Vedi handoff v2.

### Pri 6 - Step M - Storage file chat (~2-3h)
Vedi handoff v2.

### Pri 7 - Step N - Code-splitting VoyageDesk.jsx (~2-3h)
Sempre piu' urgente.

---

## 6. Quick start prossima sessione

```
1. Leggi questa handoff (sez 0-4 sufficiente)
2. cd C:\Users\londo\TULLIO
3. Eseguire i comandi git da sezione 1
4. Aprire PR su GitHub
5. Decidere prossimo step: fix #11 (mock) o Step K
```

---

## 7. Utenti DB (id ↔ email ↔ ruolo) (invariato)

| Nome | UUID | Email | Ruolo |
|------|------|-------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

`costello00@libero.it` NON esiste in auth.users; login reale e' `marco@tullio.local`.

---

## 8. Configurazione locale (invariata)

### `.env` (gia esistente)
```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
```

### Dev server
```powershell
cd C:\Users\londo\TULLIO
npm run dev
```

---

## 9. Riferimenti tool MCP utili

- `mcp__supabase__execute_sql` per query osservazione
- `mcp__supabase__apply_migration` per fix DB persistenti
- `mcp__supabase__get_logs` per debug errori Postgres
- DevTools Network browser per ispezionare payload HTTP

---

**Fine handoff v4. Step J chiuso. Buona prossima sessione.**
