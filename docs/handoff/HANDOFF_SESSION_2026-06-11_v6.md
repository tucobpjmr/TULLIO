# HANDOFF — Sessione TULLIO post Step L + Step N
**Data:** 11 giugno 2026
**Sessione precedente:** Claude Code on the web — chiuse Pri 1-5 della handoff v5 (PR #15 merge + Step L + Step N)
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-10_v5.md` (sessione precedente) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **PR #15 mergeata** su `main` (squash `7a88bf9`): Step J + fix #11 + fix #14 + Step K.
- ✅ **Step L pushato + mergeato** (PR #16, squash `a39cf9d`): origin-tagging realtime → caveat #5 risolto. Verificato end-to-end (2 tab Marco, no flicker su Tab A, refetch ~1.6s su Tab B).
- ✅ **Step N pushato + mergeato** (PR #18, squash `66f5ba7`): code-splitting bundle (xlsx lazy + manualChunks vendor) → caveat #15 (parte bundle) risolto. Chunk app 1039KB → **262KB** (303KB → **63KB gz**). Verificato end-to-end: import CSV + export Excel UI funzionanti, xlsx caricato lazy solo on-demand.
- ⏳ Prossima sessione: **Step M** (storage file chat reale → caveat #7) raccomandato; in alternativa **Step O** (logout UI → caveat #16 nuovo).

---

## 1. Riepilogo lavori sessione 12 (cronologico)

| Pri | Cosa | Commit / PR | Stato |
|-----|------|-------------|-------|
| 1 | Merge PR #15 (Step J + fix #11/#14 + Step K) → main | `7a88bf9` (squash) | ✅ |
| 2 | Step L — origin-tagging realtime | `a39cf9d` PR #16 (squash) | ✅ verificato + mergeato |
| 3 | Step N — code-splitting bundle | `66f5ba7` PR #18 (squash) | ✅ verificato + mergeato |

**Caveat chiusi in questa sessione:** #5 (eco realtime), #9 (task link via UUID, già in #15), #15 (parte bundle).

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `66f5ba7 Step N: code-splitting bundle (caveat #15) (#18)`
**Branch di sessione usato qui:** `claude/amazing-meitner-vhhuf1` (allineato a main, può essere riusato o riassegnato).

### File chiave aggiunti / modificati in sessione 12

| File | Tipo | Riferimento |
|------|------|------|
| `supabase/migrations/20260611_origin_tagging.sql` | NEW | Step L — applicata su DB via MCP |
| `src/lib/clientId.js` | NEW | Step L — UUID per tab in sessionStorage |
| `src/lib/api.js` | MOD | Step L — `withOrigin()` su mutation + filtro `subscribeToTable` |
| `src/VoyageDesk.jsx` | MOD | Step N — rimosso `import * as XLSX`, aggiunto `loadXLSX()` helper, `handleFile` + `exportExcel` async |
| `vite.config.js` | MOD | Step N — `manualChunks: { react, supabase }` |
| `docs/CHANGELOG.md` | MOD | Entry v1.3 (Step L) + v1.4 (Step N) |

### Verifica build (container)

```
dist/index.html                     0.50 kB │ gzip:   0.30 kB
dist/assets/react-*.js            140.87 kB │ gzip:  45.26 kB
dist/assets/supabase-*.js         211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js            262.25 kB │ gzip:  62.79 kB
dist/assets/xlsx-*.js             429.03 kB │ gzip: 143.08 kB  (async, on-demand)
```

Load iniziale gzip: **~162 KB** (vs 303 KB pre-Step N). Warning Vite >500KB sparito.

---

## 3. Stato Supabase (aggiornato)

**Progetto:** `tullio` (`vmxvnxsqfisucugcpqlc`, region `eu-west-1`)

### Migrazioni applicate (cumulativo)

- `20260609_notifications.sql` ✅
- `20260609_user_presence.sql` ✅
- `20260610_notifications_extra.sql` ✅
- `20260610_step_j_fix.sql` ✅
- `20260610_step_j_fix2.sql` ✅ (solo via MCP, non in file repo)
- `20260610_step_j_fix3.sql` ✅
- `20260610_step_j_fix4.sql` ✅
- `20260610_step_j_fix5.sql` ✅
- `20260611_origin_tagging.sql` ✅ NEW (Step L)

### Schema delta sessione 12

- `public.tasks` / `public.notices` / `public.conversations` / `public.messages`: nuova colonna `origin_client uuid NULL` (Step L).
- Nessun nuovo trigger / function in sessione 12.

### Trigger / cron invariati da v5

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
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa | |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | |
| 4 | RLS realtime users (subscribe vede tutti) | 🟡 Aperto | media | |
| 5 | Eco realtime (flash re-render) | ✅ Step L | — | verificato |
| 6 | markRead chat 1 UPDATE/msg | 🟡 Aperto | media | |
| 7 | fileSize chat string vs bigint | ⚪ Aperto | **Step M** | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 9 | Task link chat match per titolo | ✅ Step K | — | |
| 10 | UNDO_LAST_ACTION solo in-memory | ⚪ Aperto | bassa | |
| 11 | NOTIFICATIONS mock fallback | ✅ fix #11 | — | |
| 12 | Mock+reali convivono | ✅ fix #11 | — | |
| 13 | tasks_insert created_by | ✅ Step J fix3 | — | |
| 14 | Demo switch confonde RLS | ✅ fix #14 | — | |
| 15 | VoyageDesk.jsx ~7100 righe | 🔶 Step N parziale | media | bundle ✅, refactor strutturale ⏳ |
| 16 | **Logout mancante UI** | 🔴 Aperto NEW | media | `signOut()` esiste in `AuthContext` ma non è collegato a UI |
| 17 | TEAM seed locale sovrascritto solo post-refresh | ⚪ Aperto NEW | bassa | cosmetico — al primo login si vedono nomi mock vecchi |
| 18 | Encoding mojibake preview import CSV | ⚪ Aperto NEW | bassa | "PrioritÃ " invece di "Priorità" — riguarda solo intestazioni preview |

**Aperti rilevanti per prossima sessione:** #7 (Step M), #16 (Step O), #15 residuo (Step P), #4, #6.

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 1 — Step M: Storage file chat reale (~2-3 h)

**Caveat #7.** I file allegati in chat sono ancora sample hardcoded (`fileName/fileSize` finti).

Pianificato:
- Bucket Supabase Storage `chat-files` (privato) + policy RLS che leghi i file alla `conversation_id` del messaggio.
- `MessagesAPI`: nuovo metodo `uploadFile(file, conversationId)` → `supabase.storage.from('chat-files').upload(path, file)` + signed URL.
- DB schema: aggiungere/usare `messages.file_url text`, `messages.file_size bigint`, `messages.file_mime text`. Verificare cosa è già presente (la handoff v5 dice "verificare se `file_size` già esistente").
- `VoyageDesk.jsx` (Chat): sostituire la generazione del sample hardcoded con upload reale; viewer file da signed URL.
- Mapping `mappers.js` per i nuovi campi.

### Pri 2 — Step O: Logout UI (~30-60 min)

**Caveat #16 NEW.** L'app non offre un modo per fare logout senza pulire localStorage manualmente.

Pianificato:
- `AuthContext` espone già `signOut`; serve solo cablarlo.
- Aggiungere voce "🚪 Esci" nel menu `UserSwitcher` (Topbar) sotto "Modifica profilo".
- On click → `signOut()` → `LoginScreen` ricompare (l'`AuthContext` provider re-renderizza l'albero a `user === null`).
- Toast di conferma opzionale.

### Pri 3 — Step P: Estrazione componenti dal monolite (~4-6 h)

**Caveat #15 residuo.** `VoyageDesk.jsx` resta ~7100 righe — bundle è ok dopo Step N ma il file è difficile da navigare e prevenire regressioni richiede una struttura modulare.

Pianificato (incrementale):
- Creare `src/components/` con sottocartelle per area (`calendar/`, `admin/`, `chat/`, `dashboard/`, `tasks/`, `modals/`).
- Estrarre per primi i componenti **isolati** (poche dipendenze esterne al modulo): `Toast`, `FAB`, `NotificationsPanel`, `UserSwitcher`, `ProfileEditor`, `LoginScreen` è già fuori.
- Poi componenti "vista" grandi: `CalendarPlanner`, `AdminView` (5 tab → potenziale sotto-split), `Trash`, `BulkTaskCreator`, `AIDayPlanner`.
- Tutti gli helper globali (`getMember`, `canViewTask`, ecc.) e i let mutabili (`TEAM`, `CATEGORIES`, `CURRENT_USER`) restano per ora in un modulo `src/state/globals.js` per non rompere niente.
- Una volta estratti i componenti pesanti, aggiungere **`React.lazy`** sui modali e sulle viste non-default → ulteriore riduzione del chunk principale.
- **Approccio raccomandato**: una PR per componente / piccolo gruppo, mai un mega-PR di refactor.

### Pri 4 — Quick wins caveat residui (opzionale, ~1-2 h totali)

- **#17** TEAM seed locale sovrascritto solo post-refresh: indagare ordine di idratazione in `VoyageDeskInner` → forzare re-render dopo `initialTeam` arrivato da Supabase.
- **#18** mojibake CSV: in `handleFile`, leggere il file come `ArrayBuffer` + `XLSX.read(..., { type: 'array', codepage: 65001 })` invece di `binary`. Da verificare con il sample CSV.
- **#6** markRead chat batch: ora ogni messaggio fa 1 UPDATE. Sostituire con un upsert RPC o batch update via `supabase.rpc()`.

### Pri 5 — Step Q: Hardening realtime (opzionale)

- **#4** RLS realtime `users`: la subscribe `subscribeToTable("users", ...)` riceve eventi per tutti, anche se RLS dovrebbe filtrare. Verificare: è un problema di Realtime + RLS (`alter publication`) o serve filtro client?
- Estendere `withOrigin` anche a `Comments.create` se si vuole eliminare il refetch ottimistico nei task con commenti freschi.

---

## 6. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Decidi pri (raccomandato: Step M)
3. Crea / riusa branch dedicato (es. claude/step-m-chat-storage)
4. Implementa, verifica build, apri PR draft, verifica in preview, mergea
```

**Se sessione locale (PowerShell):**
```powershell
cd C:\Users\londo\TULLIO
git checkout main
git pull
git checkout -b claude/step-m-chat-storage
# lavora
npm run dev   # in terminale dedicato
```

**Se sessione remota (Claude Code on the web):**
- Container fresco, repo già clonato sul branch assegnato.
- Git operations OK direttamente da Claude.
- `npm install` la prima volta (non c'è `node_modules` ereditato).
- Build verifica: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build`.

---

## 7. Configurazione locale

### `.env` (esiste, NON committato)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false        # fix #14, default off
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # fix #11, attivabile in dev se serve
```

### Dev server

```powershell
cd C:\Users\londo\TULLIO
npm run dev
```

Tenere SEMPRE due terminali aperti: uno per `npm run dev`, uno per git e tutto il resto.

---

## 8. Utenti DB (invariato)

| Nome | UUID | Email | Ruolo |
|------|------|-------|-------|
| Marco | `6530b4e6-7af7-4d0f-b870-c1b3b78bbacf` | marco@tullio.local | manager |
| Roberto | `0cea6ead-ec67-4551-9ff7-b6f673b8b43c` | roberto@tullio.local | admin |
| Luca | `05c6bc7e-5bd0-4921-b1fb-b58cda68fdc4` | luca@tullio.local | agent |
| Sofia | `4ecb55c0-0adb-4f71-9fdb-ea7f9c281fb4` | sofia@tullio.local | agent |
| Giulia | `a29be84d-49a6-43c5-8ef7-2bb8ee699fb1` | giulia@tullio.local | driver |

`costello00@libero.it` NON esiste in auth.users — login reale è `marco@tullio.local` o `roberto@tullio.local`.

**Procedura di test multi-utente (in assenza di logout UI, caveat #16):**
- Logga utente A in finestra normale.
- Apri finestra **incognito** e logga utente B.
- In alternativa: DevTools → Application → Local Storage → cancella chiavi `sb-*-auth-token` → ricarica.

---

## 9. Riferimenti tool MCP utili

- `mcp__supabase__list_tables` per ispezionare schema attuale
- `mcp__supabase__execute_sql` per query di osservazione (SELECT)
- `mcp__supabase__apply_migration` per fix DB persistenti (versionati in `supabase/migrations/`)
- `mcp__supabase__get_logs` per debug errori Postgres
- `mcp__supabase__get_advisors` per security/performance check
- `mcp__github__create_pull_request` (sempre come draft)
- `mcp__github__merge_pull_request` con `merge_method: "squash"`
- DevTools Network del browser per ispezionare payload realtime e lazy chunk

---

## 10. Note importanti per Claude nella prossima sessione

- **Determinare contesto operativo all'avvio**: sessione locale (PowerShell utente) o remota (container Claude Code)? In remota Claude fa git/MCP direttamente; in locale segue regola handoff v5 "Claude edita, utente fa git".
- **Hot reload Vite** ≠ riavvio: cambi a `.env` richiedono `Ctrl+C` + `npm run dev`.
- **`AskUserQuestion`** prima di scelte ambigue (es. quale step affrontare, approccio merge).
- File `VoyageDesk.jsx` resta grande (~7100 righe): cercare con `Grep` prima di leggere blocchi.
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<data>_<nome>.sql` versionato.
- **PR sempre draft** alla creazione; togliere draft solo dopo verifica build + (se sensato) preview.
- **Merge squash**: convenzione fissa per questo repo.
- **Caveat #16 (logout)** è un piccolo grattacapo per testare multi-utente — prioritario se non si vuole vivere di finestre incognito.

---

**Fine handoff v6.** Pri 1-5 della v5 chiuse (Step L + Step N inclusi). Buona prossima sessione.
