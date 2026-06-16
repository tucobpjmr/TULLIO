# HANDOFF — Sessione successiva

> ⚠️ **Questo file è LEGACY (sessioni E–I).** L'handoff attivo è il più recente
> `docs/HANDOFF_SESSION_<data>_v<n>.md`.
>
> **Ultimo handoff attivo:** [`docs/HANDOFF_SESSION_2026-06-16_v22.md`](./HANDOFF_SESSION_2026-06-16_v22.md) (sessione 24, PR #64 draft: inviti team reali via Supabase Auth — Fase 3 kickoff).
>
> Sequenza: v11 (post Step P, chain #32→#36 + #38 mergeate) → v9 (Step R+S) → v8 (Step Q) → v7 (Step M+O) → v6 (Step N) → v5 (Step L) → v4 (Step J) → v2 (Step F).
> `CHANGELOG.md` = dettaglio cronologico; `ROADMAP.md` = stato priorità.
> *(v10 mai mergeato: i suoi contenuti sono confluiti in v11.)*

---

## Stato attuale (branch `claude/step-e-sync-robustness`, commits E→I sopra `claude/cool-darwin-8wdgwv`)

### Cosa è stato fatto nella sessione corrente (Step E → I)

| Step | Commit | Descrizione | Stato |
| ---- | ------ | ----------- | ----- |
| E — Robustezza sync | `7052934` | Toast su errori persist; errori login Supabase localizzati in italiano; loading state ChatPanel | ✅ |
| F — Notifiche reali | `c6607ec` | Tabella DB + RLS + realtime + trigger `task_assigned`; `NotificationsAPI`; `NotificationsPanel` ridisegnato (titolo da payload, time relativo, markRead); badge sidebar Admin (agenti pending) e Dashboard (coda globale) | ✅ |
| G — Calendario avanzato | `c05bbd9` | Vista Giorno (slot ore 00–23 + linea ora corrente); Vista Settimana piena (7 colonne × 24h); Export iCal (`.ics` RFC5545) | ✅ |
| H — Estensioni chat | `a0b9b5e` | Task link cliccabile nei messaggi (parsa `🔗 Riferimento task:` → pill che apre `TaskSlideOver`); ricerca conversazioni estesa (nomi partecipanti + ultimi messaggi); presence online/away/offline con heartbeat 45s + visibilitychange + realtime su `users` | ✅ |
| I — Quick wins Dashboard | `a3a0c4d` | `takeOwnership`: auto-move "In Corso" se la task era in `todo` + toast custom `Hai preso in carico: [titolo]` | ✅ |

### Migrazioni Supabase da applicare prima di testare in produzione

Nuovi file in `supabase/migrations/`:

1. `20260609_notifications.sql` — tabella `public.notifications` + RLS per-utente + realtime + trigger `notify_task_assigned` su `INSERT/UPDATE OF assignees`.
2. `20260609_user_presence.sql` — colonne `status` e `last_seen_at` su `public.users` + policy `users update self presence` + `users` in `supabase_realtime`.

Esecuzione: Dashboard Supabase → SQL Editor, applica nell'ordine indicato.

### Architettura risultante (aggiornata)

```
src/
├── auth/
│   ├── AuthContext.jsx       ← invariato
│   └── LoginScreen.jsx       ← + localizeAuthError (Step E)
├── lib/
│   ├── supabase.js
│   ├── api.js                ← + NotificationsAPI, Users.setPresence
│   └── mappers.js            ← + fromDbNotification
├── VoyageDesk.jsx            ← ~+800 righe (E+F+G+H+I)
└── main.jsx
supabase/
└── migrations/
    ├── 20260609_notifications.sql       ← Step F
    └── 20260609_user_presence.sql       ← Step H
```

---

## Caveat tecnici residui

| # | Area | Problema | Priorità |
| --- | --- | --- | --- |
| 1 | Notifiche — auto-assegnazione | Quando un utente si auto-assegna una task, il trigger `task_assigned` gli notifica comunque. Da escludere via `current_setting('request.jwt.claims', true)::jsonb->>'sub'` nel trigger. | 🟡 |
| 2 | Notifiche — task_due / comment / queue_stale | Solo `task_assigned` è generato dal DB. Servono trigger su `comments` (mention → notifica), cron per `task_due` (24h prima della scadenza) e `queue_stale` (task in coda da > N ore). | 🟡 |
| 3 | Presence — heartbeat costoso | `setPresence` ogni 45s × N utenti loggati genera 1 UPDATE per tab aperta. Per ora ok, ma su scala migrabile a Supabase Presence channel. | ⚪ |
| 4 | Presence — RLS realtime | Subscribe a `users` riceve TUTTI i row, ma le RLS sui `users` filtrano già la SELECT. Verificare che `postgres_changes` rispetti la RLS in lettura. | 🟡 |
| 5 | Realtime / Eco | Chi causa l'evento vede lo state ottimistico + reload subito dopo (flash). Migliorabile con origin-tagging. | 🟡 |
| 6 | Chat — `markRead` | Una UPDATE per messaggio non letto. Idempotente ma N query. Ottimizzabile con upsert batch. | 🟡 |
| 7 | Chat — file size | `fileSize` lato app è stringa human ("245 KB"). DB bigint resta `null`. Storage file reale non integrato. | ⚪ |
| 8 | Calendario — Distribuzione Agenti | La tabella in fondo a `CalendarPlanner` usa ancora la settimana corrente fissa in vista Giorno. Non bloccante. | ⚪ |
| 9 | Task link nella chat | Il match per ritrovare la task usa `t.title === link.taskTitle`: se il titolo cambia dopo l'invio del messaggio il link si rompe (pulsante disabled). Migliorabile salvando `task_ref` (campo già su `messages.task_ref`) e usandolo nel parser. | 🟡 |
| 10 | UNDO_LAST_ACTION | L'undo swipe opera solo in-memory (no rollback DB). Accettabile per ora. | ⚪ |

---

## Roadmap prossimi step

### 🟡 Step J — Notifiche complete (trigger mancanti)

1. Trigger DB su `comments`: insert in `notifications` per ogni `assignee` della task quando viene aggiunto un commento (escluso l'autore del commento).
2. Edge Function / pg_cron giornaliero `notify_task_due` per task in scadenza nelle prossime 24h.
3. Edge Function / pg_cron orario `notify_queue_stale` per task in coda da > 4 ore.
4. Mention parser: se il testo del commento contiene `@nome`, generare notifica `mention` invece di `comment`.

### 🟡 Step K — Refactor task link via task_ref

- Quando `setMessages` invia un messaggio con pattern `🔗 Riferimento task:`, popolare `task_ref` con l'id della task.
- `MessageTextContent`: lookup per id (più affidabile del match per titolo).

### 🟡 Step L — Origin-tagging realtime

- Generare un `clientId` per tab (UUID in `sessionStorage`).
- Aggiungere colonna `origin_client` ai tavoli che ricevono realtime.
- Nel subscribe: skip dei row con `origin_client === my clientId` per evitare l'eco locale.

### ⚪ Step M — Storage file reali nella chat

- Bucket `chat-attachments` con policy per-conversazione.
- Upload → `messages.file_url` + `messages.file_size` numerico.

### ⚪ Step N — Code-splitting

- Bundle ~1MB monolitico. Dynamic import per le viste (Calendar, Team, Trash, Admin).

---

## Come iniziare la nuova sessione

1. Leggi `docs/CLAUDE.md` (convenzioni, pattern, palette, breakpoint).
2. Leggi questo file per lo stato corrente.
3. `docs/CHANGELOG.md` ha il dettaglio di ogni step E–I.
4. Parti da **Step J** se vuoi chiudere il loop notifiche, o **Step K** se vuoi un quick win di stabilità sul task link chat.

### Comandi utili

```
npm install
npm run dev
npm run build
```

### Env vars necessarie (`.env` locale)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key dal progetto Supabase>
```

Su Vercel sono già configurate nel progetto `tullio`.

---

## Branch e PR

| Branch | Base | PR |
| --- | --- | --- |
| `claude/cool-darwin-8wdgwv` | `main` | #13 (draft) — fase D persistenza |
| `claude/step-e-sync-robustness` | `claude/cool-darwin-8wdgwv` | da aprire — step E→I |

Per la nuova sessione: nuovo branch da `claude/step-e-sync-robustness` (che diventa la nuova base), oppure continua su questa se la PR non è ancora stata mergeata.
