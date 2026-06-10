# HANDOFF — Sessione TULLIO post Step K + fix #11 + fix #14

**Data:** 10 giugno 2026
**Sessione precedente:** Cowork — Pri 1-4 chiuse: push Step J, fix #11 (notifiche mock), fix #14 (demo switch), Step K (task_ref UUID)
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-09_v4.md` (sessione precedente con dettaglio Step J chiuso) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **Step J pushato** su `claude/step-j-notifications` (commit `f2fd29c` e precedenti)
- ✅ **fix #11**: notifiche mock fittizie gate dietro `VITE_SHOW_MOCK_NOTIFICATIONS` (commit `f2fd29c`)
- ✅ **fix #14**: demo switch "ACCEDI COME" gate dietro `VITE_DEMO_SWITCH` (commit `bd5d4fc`)
- ✅ **Step K (task_ref)**: link in chat ora usa UUID, rinomina task non rompe più pill — DA COMMITTARE
- ⏳ Prossima sessione: **commit + push Step K**, poi **PR + merge** su `main`, poi **Step L** (origin-tagging realtime)

---

## 1. Riepilogo generale lavori fatti (cronologico)

### Sessioni precedenti (Step A-J)
- Step A-D: setup Supabase, schema iniziale, RLS base, mappers.
- Step E: robustezza sync (toast su errori).
- Step F: notifiche base (tabella + trigger task_assigned).
- Step G: Calendario + Dashboard.
- Step H: presence + task link in chat (match per titolo, fragile).
- Step I: chat estesa (reply, react, voice, file).
- Step J: notifiche complete (mention, comment, task_due, queue_stale, pg_cron, anti-eco).
  - Fix1: GRANT EXECUTE `is_manager_or_admin`.
  - Fix2: GRANT EXECUTE `is_admin`.
  - Fix3: trigger BEFORE INSERT forza `tasks.created_by = auth.uid()`.
  - Fix4: regex mention parser semplificata.
  - Fix5: policy RLS SELECT/UPDATE/DELETE su `notifications`.
  - T1-T7 PASS.

### Sessione corrente (10/6/2026)

| Pri | Cosa | Commit | Stato |
|-----|------|--------|-------|
| 1 | Push Step J su branch `claude/step-j-notifications` | (push iniziale) | ✅ pushato |
| 2 | Fix #11 — Notifiche mock dietro env var | `f2fd29c` | ✅ pushato |
| 3 | Fix #14 — Demo switch dietro env var | `bd5d4fc` | ✅ pushato |
| 4 | Step K — Task link via `task_ref` UUID | — | ⏳ **DA COMMITTARE** |

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch corrente:** `claude/step-j-notifications` (ahead of main, contiene Pri 1-3)
**Ultimo commit pushato:** `bd5d4fc` (fix #14)

### Modifiche locali NON ancora committate (Step K)

| File | Tipo | Descrizione |
|------|------|-------------|
| `src/VoyageDesk.jsx` | MOD | Step K: prefillTaskRef + initialTaskRef + pendingTaskRef + lookup UUID-first in MessageTextContent |
| `docs/CHANGELOG.md` | MOD | Entry Step K |
| `docs/HANDOFF_SESSION_2026-06-10_v5.md` | NEW | Questo file |

### Comandi git (prossima sessione, PRIMA cosa)

```powershell
cd C:\Users\londo\TULLIO
git add src/VoyageDesk.jsx docs/CHANGELOG.md docs/HANDOFF_SESSION_2026-06-10_v5.md
git commit -m "Step K: task link in chat via task_ref UUID (resolve caveat #9)"
git push
```

### Poi: aprire PR e mergeare

PR: https://github.com/tucobpjmr/TULLIO/compare/main...claude/step-j-notifications

Contenuto PR: Step J completo + fix #11 + fix #14 + Step K. Pronta per merge dopo review.

---

## 3. Stato Supabase (invariato da v4)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migrazioni applicate
- `20260609_notifications.sql` ✅
- `20260609_user_presence.sql` ✅
- `20260610_notifications_extra.sql` ✅
- `20260610_step_j_fix.sql` ✅ (GRANT is_manager_or_admin)
- `20260610_step_j_fix2.sql` ✅ (GRANT is_admin)
- `20260610_step_j_fix3.sql` ✅ (trigger created_by)
- `20260610_step_j_fix4.sql` ✅ (regex mention)
- `20260610_step_j_fix5.sql` ✅ (RLS notifications)

### Trigger attivi su `public.tasks`
- `trg_tasks_set_created_by` BEFORE INSERT (forza created_by = auth.uid())
- `trg_notify_task_assigned` AFTER INSERT/UPDATE

### Trigger attivi su `public.comments`
- `trg_notify_task_comment` AFTER INSERT (mention + comment notif)

### pg_cron jobs attivi
- `notify_task_due_daily` (`0 8 * * *` UTC)
- `notify_queue_stale_hourly` (`5 * * * *`)

### Dati post-cleanup
- `public.tasks` 0
- `public.comments` 0
- `public.notifications` 0

---

## 4. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio |
|---|------|-------|------|
| 1 | Auto-assegnazione | ✅ RISOLTO (Step J) | — |
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa |
| 4 | RLS realtime users (subscribe vede tutti) | 🟡 Aperto | media |
| 5 | Eco realtime (flash re-render) | 🟡 Aperto | Step L |
| 6 | markRead chat 1 UPDATE/msg | 🟡 Aperto | media |
| 7 | fileSize chat string vs bigint | ⚪ Aperto | Step M |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa |
| 9 | Task link chat match per titolo | ✅ RISOLTO (Step K) | — |
| 10 | UNDO_LAST_ACTION solo in-memory | ⚪ Aperto | bassa |
| 11 | NOTIFICATIONS mock fallback | ✅ RISOLTO (fix #11) | — |
| 12 | Mock+reali convivono | ✅ RISOLTO (fix #11, gate completo) | — |
| 13 | tasks_insert created_by | ✅ RISOLTO (Step J fix3) | — |
| 14 | Demo switch confonde RLS | ✅ RISOLTO (fix #14) | — |
| 15 | VoyageDesk.jsx ~8100 righe | 🟡 Aperto | Step N |

**Aperti rilevanti:** #4 #5 #6 #15.

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 1 — Commit + push Step K (~5 min)
Comandi nella sezione 2. Risolve caveat #9.

### Pri 2 — Aprire PR e mergeare su main (~10 min)
- Aprire PR `claude/step-j-notifications` → `main`.
- Review (opzionale, se in solo): merge diretto via "Squash and merge" su GitHub.
- Dopo merge: `git checkout main && git pull` + delete branch.

### Pri 3 — Step L: Origin-tagging realtime (~1-2 h)
**Caveat #5.** Quando un client genera un evento, riceve update ottimistico + broadcast realtime → flash di re-render.

Modifiche pianificate (da handoff v2):
- Nuova util `src/lib/clientId.js`: UUID per tab in `sessionStorage`.
- Migrazione SQL `20260611_origin_tagging.sql`: colonna `origin_client uuid null` su `tasks`, `notices`, `conversations`, `messages`.
- `api.js`: helper `withOrigin(payload)` aggiunge `origin_client: getClientId()`.
- Subscribe handlers: skip se `payload.new.origin_client === getClientId()`.

### Pri 4 — Step M: Storage file chat (~2-3 h)
**Caveat #7.** File chat sono ora fittizi (samples hardcoded). Modifiche:
- Bucket Supabase Storage `chat-files` + RLS.
- Upload reale via `supabase.storage.from('chat-files').upload(...)`.
- `messages.file_url` invece di `fileName/fileSize` hardcoded.
- DB: colonna `file_size bigint` (già esistente?) verificare.

### Pri 5 — Step N: Code-splitting VoyageDesk.jsx (~2-3 h)
**Caveat #15.** Il file è ora ~8100 righe. Modifiche:
- `vite.config.js`: `manualChunks` per React/Recharts/Supabase.
- Dynamic `import()` su: `CalendarPlanner`, `AdminView`, `Trash`, `BulkTaskCreator`, `AIDayPlanner`.
- Target: chunk principale ~400 KB.

### Pri 6 (opzionale) — Hardening caveat #4 e #6
- #4: verificare che subscribe `users` rispetti RLS o filtrare lato client.
- #6: batch upsert markRead chat.

---

## 6. Quick start prossima sessione

```
1. Leggi questa handoff (sez 0-2 sufficiente)
2. Apri PowerShell, cd C:\Users\londo\TULLIO
3. Esegui commit + push Step K (sez 2)
4. Apri PR su GitHub e mergea
5. Scegli prossimo step: L (origin-tagging) raccomandato
```

---

## 7. Configurazione locale

### `.env` (esiste, NON committato)
```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false        # fix #14, default off
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # fix #11, attivabile in dev se serve
```

### Dev server (terminale dedicato)
```powershell
cd C:\Users\londo\TULLIO
npm run dev
```

**Promemoria operativo:** tenere SEMPRE due terminali aperti:
- uno per `npm run dev` (lasciato girare)
- uno per git e tutto il resto

---

## 8. Utenti DB (invariato)

| Nome | UUID | Email | Ruolo |
|------|------|-------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

`costello00@libero.it` NON esiste in auth.users; login reale è `marco@tullio.local`.

---

## 9. Riferimenti tool MCP utili

- `mcp__supabase__execute_sql` per query osservazione
- `mcp__supabase__apply_migration` per fix DB persistenti
- `mcp__supabase__get_logs` per debug errori Postgres
- DevTools Network browser per ispezionare payload HTTP

---

## 10. Note importanti per Claude nella prossima sessione

- **Non eseguire git al posto dell'utente.** Claude opera sul filesystem ma git e push li fa l'utente in PowerShell separato.
- **Hot reload Vite** ≠ riavvio: cambi a `.env` richiedono `Ctrl+C` + `npm run dev`.
- **`AskUserQuestion`** prima di scelte ambigue (es. quale step affrontare).
- **`mcp__cowork__present_files`** quando si producono deliverable visibili all'utente.
- File `VoyageDesk.jsx` è grande: cercare con `Grep` prima di leggere blocchi.

---

**Fine handoff v5. Pri 1-4 chiuse, manca push Step K. Buona prossima sessione.**
