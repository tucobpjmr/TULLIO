# HANDOFF — Sessione 2026-07-02 v43
### Analisi bug severità media/bassa — PR #101 (alta) + PR #102 (media/bassa)

---

## Stato repo al termine della sessione

| Voce | Valore |
|------|--------|
| Branch principale | `main` |
| Commit HEAD main | `46de306` — squash merge PR #102 |
| Test | **167/167 passati** (71 nuovi rispetto alla baseline pre-analisi) |
| Lint | 0 errori, 10 warning preesistenti (nessuno nuovo) |
| Build | OK |
| Branch di lavoro residuo | `claude/web-app-bug-analysis-ukkuug` (già mergiato, può essere eliminato) |

---

## Cosa è stato fatto in questa sessione

### Tornata A — Bug ad alta severità (PR #101, mergiata in `c4e83af`)

| Bug | File/Migration | Fix |
|-----|---------------|-----|
| `EMPTY_TRASH` non filtra permessi prima del hard-delete → cancella task altrui | `api.js`, `VoyageDesk.jsx` | Filtra per `canEditTask` prima di `TasksAPI.hardDelete` |
| `UNDO_LAST_ACTION` non persiste su Supabase | `api.js`, `VoyageDesk.jsx` | Aggiunto case nello switch di dispatch; sync DB |
| `RESTORE_BACKUP` non persiste su Supabase | `api.js`, `VoyageDesk.jsx` | Upsert tasks/categories/notices; team resta local-only (design) |
| `Messages.listAll` ordine ascendente → nuovi messaggi invisibili > 2000 totali | `api.js` | Ordine DESC + revert; prende sempre i più recenti |
| RLS `comments_insert` non verifica task padre | `20260702_comments_insert_and_attachments_active_gate.sql` | Policy riscritta: verifica visibilità task padre |
| RLS `task_files`/`task_history` esclusi dal gate utenti attivi | stessa migration | Aggiunto RESTRICTIVE `rls_active_only` |
| `dispatch()` senza difesa in profondità — RLS unica barriera | `VoyageDesk.jsx` | Wrapper rispecchia `canEditTask`/`canViewTask` prima di chiamare DB |
| Import CSV/Excel: date italiane `gg/mm/aaaa` → `Invalid Date` o giorno/mese invertiti | `BulkTaskCreator.jsx` | `normDate` riconosce formato italiano; banner righe non riconosciute |

### Tornata B — Bug a severità media (PR #102, round 1 — 8 agenti paralleli in worktree isolati)

| Bug | File/Migration | Fix |
|-----|---------------|-----|
| Read receipts non aggiornati a chat aperta | `ChatPanel.jsx` | `unreadCount` in dep array effect; guard anti-loop |
| `messages_mark_read`: `reader_id` spoofabile dal client | `20260702_messages_mark_read_auth_uid.sql`, `api.js` | RPC ora usa `auth.uid()` server-side; rimosso parametro client |
| Typing indicator finto + errato in gruppo | `ChatPanel.jsx`, nuovo `lib/typingUtils.js` | Broadcast Supabase Realtime per conv; mappa `{userId: expiresAt}` 4s TTL |
| `Trash.jsx` usa `canEditTask` per la lista (dovrebbe essere `canViewTask`) | `Trash.jsx` | Lista → `canViewTask`; azioni → `canEditTask` con toast |
| `TasksAPI.hardDelete` non pulisce allegati Storage | `api.js` | Rimuove file da bucket `task-files` prima del delete row |
| Import backup JSON: validazione quasi assente | `AdminView.jsx`, nuovo `lib/backupValidation.js` | `validateBackup()`: shape checking, normalizzazione, avvisi parziali |
| Export iCal senza line-folding RFC 5545 §3.1 | `CalendarPlanner.jsx` | `foldIcsLine()`: folding byte-accurate UTF-8, max 75 ottetti |
| `xlsx@0.18.5` con CVE note (prototype pollution + ReDoS) | `lib/xlsx.js` | Mitigazione applicativa: `withPrototypePollutionGuard()`, limite 15 MB |

### Tornata C — Bug a severità bassa (PR #102, round 2)

| Bug | File/Migration | Fix |
|-----|---------------|-----|
| Ricorrenza mensile/annuale con overflow date (31 gen → 3 mar permanente) | `CalendarPlanner.jsx` | `nthRecurrence()` deriva sempre dall'originale; giorno clampato a ultimo del mese |
| Filtro "Da" in ricerca avanzata usa UTC invece di ora locale | `Topbar.jsx`, `lib/taskUtils.js` | `startOfLocalDay()`/`endOfLocalDay()` (new Date(y, m-1, d)) |
| Click su notifica orfana (task cestinato) → nessun feedback | `VoyageDesk.jsx` | Toast esplicito in `openTaskById` se task non trovato |
| Notifiche senza `origin_client` → eco realtime, flicker "torna non letta" | `lib/api.js`, `20260702_notifications_origin_client.sql` | `markRead`/`markAllRead` usa `withOrigin()`; colonna + `REPLICA IDENTITY FULL` |
| Ruolo team membro come input libero → refuso rompe i permessi | `AdminView.jsx`, `lib/taskConstants.js` | `<select>` vincolato a `TEAM_ROLES`; estratto a `taskConstants.js` |
| Email non validata nei form profilo/invito | `ProfileEditor.jsx`, `AddTeamMemberModal.jsx`, `BulkInviteModal.jsx`, nuovo `lib/validators.js` | `isValidEmail()` / `EMAIL_RX` condiviso; controllo su save |

### Nuovi file aggiunti

```
src/lib/typingUtils.js        — applyTypingEvent / pruneTypingMap / buildTypingLabel
src/lib/validators.js         — EMAIL_RX / isValidEmail
src/lib/backupValidation.js   — validateBackup
supabase/migrations/20260702_comments_insert_and_attachments_active_gate.sql
supabase/migrations/20260702_messages_mark_read_auth_uid.sql
supabase/migrations/20260702_notifications_origin_client.sql
src/test/recurrence.test.js           (11 test)
src/test/calendarIcs.test.js          (RFC5545 folding)
src/test/chatReadReceipts.test.jsx     (2 test)
src/test/typingUtils.test.js           (16 test)
src/test/Trash.test.jsx                (4 test)
src/test/backupValidation.test.js      (14 test)
src/test/api.test.js                   (6 test)
src/test/validators.test.js
src/test/taskConstants.test.js         (TEAM_ROLES block)
src/test/taskUtils.test.js             (startOfLocalDay/endOfLocalDay)
```

---

## Operazioni rimaste aperte (roadmap sessione successiva)

### 🔴 Alta priorità — Bloccanti per la produzione

#### 1. Applicare le migration SQL al DB Supabase live

Le tre migration create in questa sessione sono nel repo ma **NON ancora applicate** al progetto Supabase. Senza di esse:
- `messages_mark_read` accetta ancora `reader_id` spoofabile dal client
- La tabella `notifications` non ha la colonna `origin_client` (le chiamate `markRead`/`markAllRead` falliranno con errore "column does not exist")
- Le RLS corrette su `comments`, `task_files`, `task_history` non sono attive

**Procedura** (Supabase Dashboard → SQL Editor → eseguire nell'ordine):
```
-- 1. già in PR #101 ma non ancora applicata:
supabase/migrations/20260702_comments_insert_and_attachments_active_gate.sql

-- 2. richiede DROP della vecchia funzione messages_mark_read(uuid,uuid,uuid):
supabase/migrations/20260702_messages_mark_read_auth_uid.sql

-- 3. aggiunge colonna notifications.origin_client + REPLICA IDENTITY FULL:
supabase/migrations/20260702_notifications_origin_client.sql
```

In alternativa da CLI: `supabase db push` se la CLI è configurata con le credenziali del progetto.

> ⚠️ La migration #3 aggiunge `REPLICA IDENTITY FULL` a `notifications`: operazione sicura su tabella piccola, non richiede downtime.

#### 2. Verifica manuale in staging con Supabase reale

I test automatici coprono la logica pura; le seguenti casistiche richiedono un browser connesso al DB live:

- [ ] Chat aperta: arriva un messaggio → le spunte di lettura si aggiornano senza ricaricare
- [ ] Typing indicator in gruppo con 3+ utenti connessi contemporaneamente
- [ ] Cestino come utente con solo `canViewTask` (non `canEditTask`): vede i task ma "Ripristina"/"Elimina" è bloccato con toast
- [ ] Purge di un task con allegati → i file spariscono dal bucket `task-files` in Supabase Storage
- [ ] Import backup JSON malformato (es. `tasks` mancante) → alert bloccante
- [ ] Import `.xlsx` con payload prototype-pollution → file rifiutato con errore
- [ ] Export iCal con descrizioni lunghe/accentate → apertura in Outlook senza errori di parsing
- [ ] Task ricorrente mensile con `dueDate` il 31: verificare che gennaio → febbraio → marzo non slitti
- [ ] Filtro ricerca "Da" su task creato esattamente a mezzanotte: incluso correttamente
- [ ] Click su notifica di task cestinato → toast "Task non più disponibile"
- [ ] "Segna tutte lette" con 20+ notifiche: nessun flicker "tornano non lette"

---

### 🟡 Media priorità — Da completare quando possibile

#### 3. Generare `apple-touch-icon.png` per iOS PWA

Il file `public/icon.svg` esiste (navy/gold, 512×512 viewBox). Mancano i PNG richiesti da iOS.

**Steps**:
```bash
# Con sharp installato localmente (non disponibile in questo ambiente CI):
npx sharp-cli -i public/icon.svg -o public/apple-touch-icon-192.png resize 192 192
npx sharp-cli -i public/icon.svg -o public/apple-touch-icon-512.png resize 512 512
```
Poi aggiornare `index.html:13`:
```html
<!-- da: -->
<link rel="apple-touch-icon" href="/icon.svg" />
<!-- a: -->
<link rel="apple-touch-icon" sizes="192x192" href="/apple-touch-icon-192.png" />
<link rel="apple-touch-icon" sizes="512x512" href="/apple-touch-icon-512.png" />
```
E aggiungere in `public/manifest.webmanifest`:
```json
{ "src": "/apple-touch-icon-192.png", "sizes": "192x192", "type": "image/png" },
{ "src": "/apple-touch-icon-512.png", "sizes": "512x512", "type": "image/png" }
```

#### 4. Migrare `xlsx` al CDN SheetJS (elimina i CVE)

Quando l'ambiente CI ha accesso a `cdn.sheetjs.com` (egress policy non bloccante):
```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```
Dopo la migrazione:
- Rimuovere `withPrototypePollutionGuard` da `src/lib/xlsx.js` (CVE-2023-30533 fixato in 0.19.3+)
- Il limite `MAX_IMPORT_BYTES` può restare (difesa in profondità indipendente dalla versione)
- Il test su `withPrototypePollutionGuard` in `src/test/api.test.js` va rimosso o aggiornato

---

### 🟢 Bassa priorità — Noti, non urgenti

#### 5. `UPDATE_TEAM_MEMBER` non persiste su DB
Comportamento **di design**: i membri del team sono local-only perché legati ad `auth.users`; l'update del ruolo richiederebbe la mappa con l'enum DB. Dichiarato nel commento `VoyageDesk.jsx:818-822`. Il sotto-problema reale (ruolo testo libero → refuso rompe permessi) è stato risolto nel punto B.5 sopra.

#### 6. Match cliente↔task per sottostringa in `ClientiView.jsx`
`tasks.client` è testo libero senza FK (la FK dossier è stata rimossa in sessione 24). La visualizzazione dei task collegati usa una semplice `includes()` sulla stringa. Limite strutturale voluto; non un bug isolato.

---

## Come riprendere il lavoro

```bash
git checkout main
git pull origin main
# HEAD atteso: 46de306
npm test           # deve restare 167/167
npm run build      # deve restare ok
```

Il primo passo concreto è applicare le 3 migration SQL (punto #1 sopra) tramite il Dashboard Supabase o `supabase db push`.
