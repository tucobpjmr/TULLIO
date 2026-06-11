# HANDOFF — Sessione TULLIO post Step M + Step O
**Data:** 11 giugno 2026
**Sessione precedente:** Claude Code on the web — chiuse Pri 1-2 della handoff v6 (Step M + Step O via PR #20 mergeata)
**Per:** Claude Cowork / Claude Code (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-11_v6.md` (sessione precedente) → `docs/CHANGELOG.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **PR #20 mergeata** su `main` (squash `3cd6634`): Step M (storage file chat reale → caveat #7) + Step O (logout UI → caveat #16). Build verificata, deploy Vercel green.
- 🔴 **Da verificare in preview** dall'utente: upload/download allegato chat end-to-end con 2 utenti reali + logout (✓ deploy pronto su `tullio-git-claude-dreamy-bell-9at3t9-tooco-s-projects.vercel.app` ma il branch è stato mergeato → controllare deploy di `main`).
- ⏳ **Prossima sessione**: la roadmap si arricchisce di nuove feature richieste (Step R/S/T/U) — vedi sez. 5. Step P (refactor monolite) resta priorità trasversale ma rimandabile.

---

## 1. Riepilogo lavori sessione 13 (cronologico)

| Pri | Cosa | Commit / PR | Stato |
|-----|------|-------------|-------|
| 1 | Step M — Storage file chat reale | `3cd6634` PR #20 (squash) | ✅ |
| 2 | Step O — Logout UI | (incluso in PR #20) | ✅ |

**Caveat chiusi in questa sessione:** #7 (file chat reali), #16 (logout UI).

---

## 2. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `3cd6634 Step M + Step O: storage file chat reale + logout UI (#20)`
**Branch di sessione usato qui:** `claude/dreamy-bell-9at3t9` (mergeato; può essere riusato o eliminato).

### File chiave aggiunti / modificati in sessione 13

| File | Tipo | Riferimento |
|------|------|------|
| `supabase/migrations/20260611_chat_files_storage.sql` | NEW | Step M — bucket `chat-files` + policy + `messages.file_url` (applicata su DB via MCP) |
| `src/lib/api.js` | MOD | Step M — `Messages.uploadFile()` + `Messages.getFileUrl()` (signed URL 1h) |
| `src/lib/mappers.js` | MOD | Step M — mapping `file_url ↔ fileUrl`, `fileSize` ora in byte |
| `src/VoyageDesk.jsx` | MOD | Step M — picker nativo, upload reale con indicatore/toast, `formatFileSize`, click → signed URL → tab; Step O — voce "Esci" + `setPresence('offline')` + `signOut()` |
| `docs/CHANGELOG.md` | MOD | Entry v1.5-dev (Step M + Step O) |

### Verifica build (container)

```
dist/index.html                     0.50 kB │ gzip:   0.30 kB
dist/assets/react-*.js            140.87 kB │ gzip:  45.26 kB
dist/assets/supabase-*.js         211.12 kB │ gzip:  54.46 kB
dist/assets/index-*.js            264.77 kB │ gzip:  63.75 kB
dist/assets/xlsx-*.js             429.03 kB │ gzip: 143.08 kB  (async, on-demand)
```

Load iniziale gzip: ~163 KB (+1 KB rispetto a Step N: trascurabile).

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
- `20260611_origin_tagging.sql` ✅ (Step L)
- `20260611_chat_files_storage.sql` ✅ NEW (Step M)

### Schema delta sessione 13

- `public.messages`: nuova colonna `file_url text NULL` (Step M).
- Storage: nuovo bucket privato `chat-files` (limite 25 MB/file) con 3 policy RLS su `storage.objects`:
  - `chat_files_select`: lettura solo per partecipanti (admin override).
  - `chat_files_insert`: upload solo per partecipanti.
  - `chat_files_delete`: solo owner del file o admin.
- Path convention: `<conversation_id>/<uuid>-<nome_file_sanificato>`.

### Trigger / cron invariati da v5

- `trg_tasks_set_created_by` BEFORE INSERT su tasks
- `trg_notify_task_assigned` AFTER INSERT/UPDATE su tasks
- `trg_notify_task_comment` AFTER INSERT su comments
- `notify_task_due_daily` (`0 8 * * *` UTC)
- `notify_queue_stale_hourly` (`5 * * * *`)

### Security advisors (post-Step M)

Nessun warning nuovo introdotto dalla migration. Restano i warning preesistenti su `search_path` mutabile e funzioni `SECURITY DEFINER` esposte a `anon`/`authenticated` (`is_admin`, `is_manager_or_admin`, `next_dossier_number`, `notify_*`). Non blocking, ma da indirizzare in Step Q (hardening, vedi v6).

---

## 4. 🐛 Caveat residui aggiornati

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1 | Auto-assegnazione | ✅ Step J | — | |
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa | |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | |
| 4 | RLS realtime users (subscribe vede tutti) | 🟡 Aperto | media | Step Q |
| 5 | Eco realtime (flash re-render) | ✅ Step L | — | |
| 6 | markRead chat 1 UPDATE/msg | 🟡 Aperto | media | quick win |
| 7 | fileSize chat string vs bigint | ✅ Step M | — | upload reale + `formatFileSize` |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 9 | Task link chat match per titolo | ✅ Step K | — | |
| 10 | UNDO_LAST_ACTION solo in-memory | ⚪ Aperto | bassa | |
| 11 | NOTIFICATIONS mock fallback | ✅ fix #11 | — | |
| 12 | Mock+reali convivono | ✅ fix #11 | — | |
| 13 | tasks_insert created_by | ✅ Step J fix3 | — | |
| 14 | Demo switch confonde RLS | ✅ fix #14 | — | |
| 15 | VoyageDesk.jsx ~7100 righe | 🔶 parziale | media | bundle ✅ (Step N), refactor strutturale ⏳ Step P |
| 16 | Logout mancante UI | ✅ Step O | — | |
| 17 | TEAM seed locale sovrascritto solo post-refresh | ⚪ Aperto | bassa | quick win |
| 18 | Encoding mojibake preview import CSV | ⚪ Aperto | bassa | quick win |
| 19 | **Allegati chat: vecchi sample non scaricabili** | ⚪ Aperto NEW | bassa | i messaggi mock pre-Step M senza `file_url` mostrano dimensione "245 KB" stringa e nessun ⬇ — cosmetico |
| 20 | **Voice messages ancora finti** | ⚪ Aperto NEW | media | il bucket `chat-files` accetta anche audio; manca registrazione + upload reale (parallelo a Step M ma su voice) |

**Aperti rilevanti per prossima sessione:** #20 (audio reale), #4/#6 (hardening), #15 (Step P), #17/#18 (quick wins).

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

> L'utente in chiusura sessione 13 ha richiesto nuove feature focalizzate su **chat**, **dashboard** e **integrazione file da fonti esterne** (OneDrive, WhatsApp). Le ho mappate negli Step R/S/T/U sotto.
> Step P (refactor monolite) resta utile ma non più obbligatorio prima delle nuove feature: il bundle è ok, il refactor è una pulizia di manutenibilità da fare incrementalmente in parallelo.

### Pri 1 — Step R: Estensioni Chat (~3-4 h)

Pacchetto di miglioramenti chat che capitalizzano sull'infrastruttura Step M (bucket + signed URL).

**R1 — Voice message reali (~1 h)** — caveat #20
- `MediaRecorder` browser → `Blob` audio (webm/opus) → `Messages.uploadFile()` sullo stesso bucket `chat-files` (path `<conv_id>/voice-<uuid>.webm`).
- `messages.duration` e `messages.waveform` esistono già: misurare durata reale durante registrazione e calcolare waveform RMS via `AudioContext`.
- `VoicePlayer`: scaricare l'audio via signed URL e riprodurlo con `<audio>` invece di simulare.
- Mime audio: aggiornare la policy bucket se serve filtrare per mime (oggi accetta tutto entro 25 MB).

**R2 — Anteprima immagini inline (~1 h)**
- Per messaggi `type=file` con `fileType=img`, fetchare signed URL all'apertura conversazione e mostrare thumbnail nel bubble (lazy via `IntersectionObserver`).
- Cache signed URL in `useRef` per non rigenerarla ad ogni re-render (TTL 1h).

**R3 — Ricerca conversazioni full-text (~1 h)**
- Già esiste filtro per nome conv: estendere a contenuto messaggi.
- Soluzione semplice: client-side su `messages` già caricati (`MessagesAPI.listAll`). Soluzione robusta: indice GIN su `messages.text` e RPC `search_messages(query text)` con RLS filtering. Andare con la prima per ora.

**R4 — Markdown leggero nei testi (~30 min)**
- `**bold**`, `*italic*`, `` `code` ``, link autorilevati. Regex-based, senza dipendenze.
- Aggiungere in `MessageTextContent`.

### Pri 2 — Step S: Dashboard rinnovata (~3-4 h)

Rivedere la dashboard per renderla più orientata al day-to-day dell'agente.

**S1 — KPI cards configurabili (~1 h)**
- Sostituire le card fisse con un set scelto in admin (es. "Task aperti", "In attesa cliente", "Scaduti", "Carico settimana", "Conversioni mese"). Persistito su `users.dashboard_prefs jsonb`.

**S2 — Widget "Prossime scadenze 7 giorni" (~30 min)**
- Lista compatta con click → TaskSlideOver. Sostituisce/affianca "Scadenze Prossime" attuale che oggi è solo mese corrente.

**S3 — Mini-Calendar settimana corrente (~1 h)**
- 7 colonne (lun-dom) con conteggio task per giorno e indicatore overdue. Click su giorno → CalendarPlanner sulla settimana.

**S4 — Quick-add inline (~30 min)**
- Input testuale "Aggiungi task…" + tasto Invio in cima alla dashboard, con parsing naturale (oggi/domani, @assignee, !priorità). Apre QuickAddTask pre-compilato.

**S5 — Activity feed (~1 h)**
- Widget colonna laterale con ultime 10 azioni (task creati/completati, commenti, file inviati). Sorgente: `notifications` filtrate per tipo + `activityLog`.

### Pri 3 — Step T: Import file da OneDrive (~3-5 h)

**Obiettivo:** permettere all'agente di allegare in chat (e in futuro nei task) file scelti dal proprio OneDrive personale o aziendale.

**T1 — Setup Microsoft Graph (~1 h)**
- App registration su Azure AD (l'utente deve farlo): `client_id`, redirect URI = preview Vercel + `localhost:5173`, scope `Files.Read.All` + `User.Read`, MSAL flow PKCE (no client secret).
- `.env.local` + Vercel env vars: `VITE_MS_CLIENT_ID`, `VITE_MS_AUTHORITY` (`https://login.microsoftonline.com/<tenant_or_common>`).
- Dipendenza: `@azure/msal-browser` (~50 KB gz) — mettere in `manualChunks` come `react`/`supabase`.

**T2 — Picker file (~1-2 h)**
- Componente `OneDrivePicker` modale dentro `ChatPanel`: lista cartelle/file con paginazione (`/me/drive/root/children`), breadcrumb, search.
- Selezione singola o multipla; sui multipli fa una serie di download + upload sequenziali con progress.

**T3 — Download → re-upload su Supabase (~1 h)**
- `fetch(downloadUrl)` con bearer token Graph → `Blob` → `Messages.uploadFile()`.
- I file restano sul nostro storage (non link diretti a OneDrive) per coerenza con il modello "i file della chat vivono nel bucket della conv" e permessi RLS uniformi.
- Per file >25 MB: errore esplicito (limite bucket); valutare bump in migration successiva.

**T4 — Integrazione menu allegati chat (~30 min)**
- Aggiungere voce "☁️ Da OneDrive" nel popover allegati (`ConversationView`). Su click → `OneDrivePicker`. UX consistente con upload locale: indicatore ⏳ + toast.

### Pri 4 — Step U: Ricezione file da WhatsApp (~5-7 h)

**Obiettivo:** clienti inviano allegati su WhatsApp Business → arrivano nella chat interna come messaggi normali nel canale "Cliente X".

**Approccio (richiede backend):**
- WhatsApp Business Cloud API (Meta) o provider intermedio (Twilio, 360dialog). Numero business da configurare lato utente.
- Webhook `POST /api/whatsapp/incoming` → Edge Function Supabase (`supabase/functions/whatsapp-webhook`):
  1. valida firma X-Hub-Signature-256.
  2. risolve `conversation_id` cercando un thread agganciato al numero del mittente (nuova tabella `wa_links { phone, conversation_id, customer_id }`).
  3. se il messaggio porta `media_id`, scarica dalla Graph API media endpoint con token, ricarica su bucket `chat-files` (path `<conv_id>/wa-<uuid>-<filename>`).
  4. `INSERT INTO public.messages (...)` con `sender_id` = utente bot "WhatsApp", `file_url`, `file_name`, `file_size`.
- Realtime già propaga il nuovo messaggio nella ChatPanel aperta.
- Da decidere: come gestire `sender_id` se la conv è 1:1 cliente-agente (servirebbe un finto utente "WhatsApp" o un campo dedicato `external_sender text`).

**U1 — Schema + Edge Function (~3 h)**
- Migration: tabella `wa_links`, colonna `messages.external_sender text NULL`, ruolo Postgres dedicato per il webhook (no anon).
- Edge Function deployata via MCP (`mcp__Supabase__deploy_edge_function`).

**U2 — UI gestione mapping numero ↔ conversazione (~2 h)**
- AdminView nuova tab "WhatsApp": lista contatti collegati, possibilità di collegare numero a una conversazione/cliente esistente.

**U3 — Outbound (opzionale, fase 2)**
- Inviare messaggi/file dall'app verso WhatsApp via stessa API (richiede template approvati e finestra 24h regole Meta). Step a parte.

**⚠️ Costi/conformità da chiarire prima di iniziare U:**
- Account WhatsApp Business verificato (richiede partita IVA / numero dedicato).
- Pricing Meta a conversazione (UE ~€0.05-0.08).
- GDPR: trattare i numeri telefono come dati personali; consenso esplicito del cliente.

### Pri 5 — Step P: Estrazione componenti dal monolite (~4-6 h, incrementale)

Da v6, sempre valido. Iniziare con i componenti più isolati (Toast, FAB, NotificationsPanel, UserSwitcher, ProfileEditor). Una PR per componente. Importante prima di Step S che tocca molto la dashboard.

### Pri 6 — Step Q: Hardening realtime + RLS (opzionale)

- **#4** RLS realtime `users`.
- **#6** markRead chat in batch (`supabase.rpc('mark_messages_read', { ids: [...] })`).
- Security advisors: `set search_path = pg_catalog, public` su tutte le funzioni; revoke EXECUTE su `is_admin()` per `anon`.

### Pri 7 — Quick wins caveat residui (~1-2 h totali)

- **#17** TEAM seed locale.
- **#18** mojibake CSV: `XLSX.read(..., { type: 'array', codepage: 65001 })`.
- **#19** vecchi sample chat: filtrare o nascondere il ⬇ se `!msg.fileUrl`.

---

## 6. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Decidi pri (raccomandato: Step R → Step S, o partire da Step T se OneDrive è più urgente)
3. Crea branch dedicato (es. claude/step-r-chat-extensions)
4. Implementa, verifica build, apri PR draft, verifica in preview, mergea
```

**Se sessione locale (PowerShell):**
```powershell
cd C:\Users\londo\TULLIO
git checkout main
git pull
git checkout -b claude/step-r-chat-extensions
npm run dev
```

**Se sessione remota (Claude Code on the web):**
- Container fresco, `npm install` la prima volta.
- Build verifica: `VITE_SUPABASE_URL=https://example.supabase.co VITE_SUPABASE_ANON_KEY=dummy npm run build`.
- PR sempre draft alla creazione, merge squash, branch designato in handoff/istruzioni Cowork.

---

## 7. Configurazione locale

### `.env` (esiste, NON committato)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key da Supabase dashboard>
VITE_DEMO_SWITCH=false        # fix #14, default off
# VITE_SHOW_MOCK_NOTIFICATIONS=true  # fix #11, attivabile in dev se serve
# Step T (futuro):
# VITE_MS_CLIENT_ID=<azure app client id>
# VITE_MS_AUTHORITY=https://login.microsoftonline.com/common
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

**Test multi-utente**: ora che Step O è chiuso, basta usare "🚪 Esci" dal menu utente per cambiare account senza incognito.

---

## 9. Riferimenti tool MCP utili

- `mcp__supabase__list_tables` per ispezionare schema attuale
- `mcp__supabase__execute_sql` per query di osservazione (SELECT)
- `mcp__supabase__apply_migration` per fix DB persistenti (versionati in `supabase/migrations/`)
- `mcp__supabase__deploy_edge_function` per Step U (webhook WhatsApp)
- `mcp__supabase__get_logs` per debug errori Postgres
- `mcp__supabase__get_advisors` per security/performance check (rifare dopo migrations)
- `mcp__github__create_pull_request` (sempre come draft)
- `mcp__github__merge_pull_request` con `merge_method: "squash"`
- `mcp__github__subscribe_pr_activity` per babysitting CI + commenti su PR aperte
- DevTools Network del browser per ispezionare payload realtime, signed URL, lazy chunk

---

## 10. Note importanti per Claude nella prossima sessione

- **Determinare contesto operativo all'avvio**: sessione locale (PowerShell utente) o remota (container Claude Code). In remota Claude fa git/MCP direttamente.
- **Hot reload Vite** ≠ riavvio: cambi a `.env` richiedono `Ctrl+C` + `npm run dev`.
- **`AskUserQuestion`** prima di scelte ambigue (es. quale step affrontare, scope WhatsApp Business).
- File `VoyageDesk.jsx` resta grande (~7100+ righe): cercare con `Grep` prima di leggere blocchi.
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<data>_<nome>.sql` versionato.
- **PR sempre draft** alla creazione; togliere draft solo dopo verifica build + (se sensato) preview Vercel.
- **Merge squash**: convenzione fissa per questo repo.
- **Step T (OneDrive)** richiede setup Azure AD lato utente prima di partire — chiedere `VITE_MS_CLIENT_ID` in chat.
- **Step U (WhatsApp)** è un commitment grosso (backend + costi + GDPR): aprire una mini-discovery prima di iniziare.

---

**Fine handoff v7.** Pri 1-2 della v6 chiuse (Step M + Step O). Nuova roadmap orientata a chat/dashboard/integrazioni esterne. Buona prossima sessione.
