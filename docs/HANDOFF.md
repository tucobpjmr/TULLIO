# HANDOFF — Sessione successiva

> Documento di passaggio consegne per la nuova sessione Claude Code.
> Leggi questo file PRIMA di aprire qualsiasi altro file del progetto.

---

## Stato attuale (commit `0fabf81`, PR #13 `claude/cool-darwin-8wdgwv`)

### Cosa è stato fatto (Fase D — Persistenza dati, 4 sub-step)

| Sub-step | Branch | Commit | Stato |
|---|---|---|---|
| TEAM reale + makeInitialState | claude/cool-darwin-8wdgwv | dc61dd3 | ✅ |
| Tasks load + CRUD (api.js + mapper) | claude/cool-darwin-8wdgwv | 9889f7f | ✅ |
| Notices · ADD_COMMENT autore reale · Realtime tasks/notices | claude/cool-darwin-8wdgwv | 62efab7 | ✅ |
| Conversations + Messages (chat) | claude/cool-darwin-8wdgwv | 0fabf81 | ✅ |

### Architettura risultante

```
src/
├── auth/
│   ├── AuthContext.jsx     ← AuthProvider (session, profile, team) via Supabase
│   └── LoginScreen.jsx     ← Login email/password
├── lib/
│   ├── supabase.js         ← createClient (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
│   ├── api.js              ← CRUD: Users, Tasks, Comments, Notices,
│   │                          Conversations, Messages, subscribeToTable
│   └── mappers.js          ← fromDb/toDb per: Task, Comment, Notice,
│                              Conversation, Message
├── VoyageDesk.jsx          ← App completa (~7400 righe), single-file
└── main.jsx                ← AuthProvider + AuthGate → VoyageDesk | LoginScreen
```

### Modalità DB vs mock

`VoyageDeskInner` riceve `initialTeam` e `initialCurrentUserId` da `AuthGate`.

- **Con login** (`initialTeam.length > 0`): `useSupabase = true` → tasks/notices/chat idratati dal DB al mount, dispatch wrapper persiste ogni mutazione fire-and-forget, realtime via `subscribeToTable` + reload completo debounced 200ms.
- **Senza login** (preview Vercel anonimo): `useSupabase = false` → mock in-memory come prima di questa PR. Utile per smoke test UI.

### Supabase — progetto

- **Ref**: `vmxvnxsqfisucugcpqlc` (nome: "tullio", region: eu-west-1)
- **Tabelle**: `users`, `tasks`, `comments`, `notices`, `conversations`, `messages`, `clients`, `suppliers`, `dossiers`, `dossier_suppliers`
- **RLS**: abilitata su tutte. Le policy filtrano per utente loggato.
- **Realtime publication**: `tasks`, `comments`, `notices`, `conversations`, `messages` in `supabase_realtime`.
- **Migrazioni applicate**:
  1. `schema_iniziale_voyagedesk`
  2. `enable_rls_and_policies`
  3. `hardening_advisors_fix`
  4. `fase1_clients_suppliers_dossiers`
  5. `fix_task_priority_status_to_match_app`
  6. `users_add_capacity_and_avatar`
  7. `enable_realtime_for_app_tables`
  8. `enable_realtime_for_chat_tables`
- **Utenti seed** (5 righe in `public.users`): Roberto (admin), Marco (manager), Sofia (agent), Luca (agent), Giulia (driver) — email `<nome>@tullio.local`, password da configurare in Supabase Auth.

---

## Caveat tecnici noti (da risolvere nella prossima sessione)

| # | Area | Problema | Priorità |
|---|---|---|---|
| 1 | Errori sync | Tutti gli errori DB sono solo in console. L'utente non vede nulla se una persist fallisce (es. RLS violation). Da convertire in toast rosso. | 🔴 |
| 2 | Realtime / Eco | Chi causa l'evento vede lo state ottimistico + un reload subito dopo. Lieve "flash". Migliorabile con origin-tagging per skippare il proprio eco. | 🟡 |
| 3 | ADD_COMMENT + SET_CURRENT_USER | Il `user` embedded nel commento (mostrato in UI) usa `getMember(CURRENT_USER).name`, ma `CURRENT_USER` è il `let` globale sincronizzato col reducer. Se si switcha utente mentre un commento è in volo, il nome potrebbe desincronizzarsi. Non critico, cosmetic. | 🟡 |
| 4 | Chat — `markRead` | Viene chiamato a ogni apertura di conversazione per tutti i messaggi non letti. Molte update query, ma idempotenti. Ottimizzabile con un solo upsert per conv. | 🟡 |
| 5 | Chat — file size | `fileSize` lato app è stringa human-readable ("245 KB"). Su DB (bigint) è scritto `null`. Lo storage file reale non è ancora integrato. | ⚪ |
| 6 | Reload completo | Su ogni evento realtime si ricarica l'intera lista (non solo la riga modificata). Semplice e robusto ma genera N query in caso di burst. Ok per ora. | ⚪ |
| 7 | UNDO_LAST_ACTION | L'undo swipe opera solo in-memory (non rollback DB). Accettabile per ora. | ⚪ |

---

## Roadmap prossimi step (priorità)

### 🔴 Step E — Robustezza sync (blocca il test reale in produzione)

Risolve il caveat #1 (errori silenti). Modifiche contenute:

1. **Wrapper dispatch**: sostituire `console.error` con `rawDispatch({ type: "SHOW_TOAST", ... })` quando la persist fallisce.
2. **AuthContext**: gestire l'errore di login con messaggio localizzato (il DB può restituire errori diversi da "Invalid login credentials").
3. **Loading state chat**: mostrare un mini-spinner nella ChatPanel mentre `messages` è `{}` in modalità Supabase (evita il flash "nessun messaggio").

### 🔴 Step F — Notifiche reali

Sblocca badge sidebar, alert pending, menzioni bacheca. Da `ROADMAP.md` Fase 2:

**Schema DB** (migration da applicare):
```sql
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  type text not null,          -- 'task_assigned'|'task_due'|'comment'|'mention'|'queue_stale'
  payload jsonb not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
-- policy: utente vede solo le proprie notifiche
create policy "own notifications" on public.notifications
  using (user_id = auth.uid());
alter publication supabase_realtime add table public.notifications;
```

**Lato app**:
- `api.js`: `Notifications.listUnread()`, `markRead(id)`, `markAllRead()`.
- `VoyageDesk.jsx`: nuovo `useState([]) notifications`, effect mount + realtime subscribe.
- `NotificationsPanel` (già esiste): sostituire array mock con dati reali. Aggiungere badge contatore su icona campanella.
- Badge sidebar/bottom-nav **Admin** con contatore agenti pending (query `users` dove `pending=true`).
- Badge sidebar/bottom-nav **Dashboard** con contatore coda globale (tasks dove `assignees = []`).

**Trigger generazione notifiche** (da implementare via Supabase Edge Function o DB trigger):
- `task_assigned`: quando `assignees` cambia e include l'utente.
- `task_due`: cron ogni mattina per scadenze nelle prossime 24h.
- `comment`: quando viene inserito un commento su una task in cui l'utente è assignee.
- `queue_stale`: task in coda da > N ore (cron).

### 🟡 Step G — Calendario avanzato

Da `ROADMAP.md` Fase 2. Non dipende da Supabase, è UI pura:

- Vista **giornaliera**: colonna ore 00–23, task come blocchi sovrapposti.
- Vista **settimanale piena**: 7 colonne, eventi multi-slot.
- **Export iCal** (mock): genera stringa `.ics` e `URL.createObjectURL` per download.
- Il componente `CalendarPlanner` esiste già con toggle Mese/Settimana e distribuzione agenti.

### 🟡 Step H — Estensioni chat

Da `ROADMAP.md` Fase 2 + migliorie post-v0.8:

1. **Task link cliccabile** nella chat: i messaggi con pattern `🔗 Riferimento task:` oggi sono testo puro. Parsarli nel componente `Message` e renderizzare un bottone che fa `dispatch({ type: "SET_SELECTED_TASK", ... })`.
2. **Ricerca nelle conversazioni**: input di ricerca nella `ConversationList`, filtro su `name` + `participants` + ultimi messaggi.
3. **Stato online/occupato**: campo `status` su `users` DB (`online|away|offline`) aggiornato al mount/unmount dell'app; indicatore colorato nell'avatar della chat.

### ⚪ Step I — Quick wins Dashboard (da `ROADMAP.md` migliorie post-v0.8)

- Badge su voce **Admin** in sidebar/bottom-nav con contatore agenti pending.
- Badge su voce **Dashboard** con contatore coda globale.
- Toast personalizzato "Hai preso in carico: [titolo]" quando si prende un task dalla coda globale.
- Auto-move in "In Corso" al "Prendi in carico".

---

## Come iniziare la nuova sessione

1. Leggi `docs/CLAUDE.md` (convenzioni, pattern, palette, breakpoint).
2. Leggi `docs/ROADMAP.md` per contesto completo.
3. Questo file per stato corrente.
4. Parti da **Step E** (robustezza sync) se vuoi qualcosa di breve ma ad alto impatto, oppure **Step F** (notifiche) se vuoi la prossima feature visibile.

### Comandi utili

```bash
npm install          # installa dipendenze
npm run dev          # avvia dev server su localhost:5173
npm run build        # build produzione (verifica sintassi)
```

### Env vars necessarie (`.env` locale)

```
VITE_SUPABASE_URL=https://vmxvnxsqfisucugcpqlc.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key dal progetto Supabase>
```

Su Vercel sono già configurate nel progetto `tullio`.

---

## Branch e PR attive

| Branch | PR | Stato |
|---|---|---|
| `claude/cool-darwin-8wdgwv` | #13 (draft) | ✅ CI verde, preview Vercel live |

Per la prossima feature: puoi lavorare su un nuovo branch da `claude/cool-darwin-8wdgwv` (che diventa la nuova base), oppure continuare sulla stessa PR se il reviewr vuole tutto insieme prima del merge.
