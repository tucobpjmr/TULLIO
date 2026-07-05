# HANDOFF — Sessione 2026-07-05 v44
### Fix accumulo notifiche queue_stale + roadmap push notifications

---

## Stato repo al termine della sessione

| Voce | Valore |
|------|--------|
| Branch principale | `main` |
| Commit HEAD main | `d6a3024` — squash merge PR #108 |
| Test | tutti passati (nessun test toccato in questa sessione) |
| Lint | 0 errori |
| Build | OK (Vercel preview deployata con successo) |
| Branch di lavoro residuo | `claude/duplicate-notifications-gpcelz` (gia mergiato, puo essere eliminato) |

---

## Cosa e stato fatto in questa sessione

### Fix notifiche duplicate queue_stale (PR #108, mergiata)

**Problema segnalato**: screenshot utente con 36 notifiche non lette, stessi task ripetuti (es. "Task in coda da > 4h: wizz" appariva piu volte).

**Diagnosi**:
1. **Accumulo tra giri cron** (bug principale): `notify_queue_stale()` inseriva una NUOVA riga per ogni task in coda ogni ~4h senza mai rimuovere le precedenti. Verificato sul DB: lo stesso task "wizz" aveva notifiche alle 11:05, 16:05 e 20:05 dello stesso giorno.
2. **Promemoria mai ritirati**: le notifiche restavano anche dopo che il task era stato assegnato/completato/cestinato.
3. **Task distinti con titoli quasi uguali** (non un bug): "wizz" vs "wizz " (spazio finale), "check in QUERO GIUSEPPE" vs "chek in QUERO GIUSEPPE" — probabili duplicati creati a mano.

**Soluzione** (`supabase/migrations/20260705_queue_stale_dedup.sql`):

| Componente | Dettaglio |
|------------|-----------|
| Indice UNIQUE parziale | `notifications_queue_stale_user_task_uq` su `(user_id, payload->>'task_id') WHERE type='queue_stale'` — vincolo DB, max 1 notifica per coppia utente+task |
| Cleanup automatico | Ogni giro cron elimina i promemoria dei task usciti dalla coda globale (assegnati/completati/cestinati) |
| No duplicati | Notifica non letta esistente -> nessuna azione |
| Re-promemoria | Notifica letta da >24h e task ancora in coda -> stessa riga riportata non letta con `created_at = now()` (max 1/giorno, prima era 4h) |
| INSERT sicuro | `ON CONFLICT DO NOTHING` per robustezza a esecuzioni concorrenti |
| Dedup storico | One-off nella migration: eliminate le righe duplicate gia presenti |

**Applicazione**: migration applicata sia al repo che al DB Supabase live (project `vmxvnxsqfisucugcpqlc`). Il cron `notify_queue_stale_hourly` (schedule `5 * * * *`) resta invariato e usa automaticamente la nuova versione della funzione.

**Verifica DB**: eseguita la funzione 3 volte consecutive — nessuna riga nuova creata (idempotente). Stato: 10 task stale x 3 destinatari (manager/admin) = 30 notifiche, stabile.

**Nessuna modifica frontend**: la subscription realtime su `notifications` rifa il fetch dell'intera lista su INSERT/UPDATE/DELETE, quindi update e delete server-side si propagano gia.

---

## Cron jobs attivi

| Job | Schedule | Funzione |
|-----|----------|----------|
| `notify_task_due_daily` | `0 8 * * *` (ogni giorno alle 8:00) | `notify_task_due()` — task in scadenza |
| `notify_queue_stale_hourly` | `5 * * * *` (ogni ora al minuto 5) | `notify_queue_stale()` — task in coda globale da >4h (v2 dedup) |

---

## Roadmap prossima sessione: Web Push Notifications

L'utente ha chiesto se e possibile ricevere notifiche sullo smartphone ad app chiusa. Risposta: si, tramite **Web Push (VAPID)** — gratuito, standard, compatibile con la PWA gia esistente.

### Stato attuale
- PWA installabile: `manifest.webmanifest` presente con icone iOS (192/512 PNG + SVG maskable)
- **Manca**: service worker, infrastruttura push, tabella sottoscrizioni

### Piano di implementazione (4 pezzi)

#### 1. Service Worker (`public/sw.js`)
- Ascolta evento `push`, mostra `Notification` di sistema
- Al tap (`notificationclick`) apre/focalizza la PWA sul task corrispondente
- Registrare in `src/main.jsx` con `navigator.serviceWorker.register('/sw.js')`

#### 2. Tabella + opt-in frontend
- Nuova tabella `push_subscriptions`:
  ```sql
  id UUID PK, user_id UUID FK users(id), endpoint TEXT, p256dh TEXT, auth TEXT,
  user_agent TEXT, created_at TIMESTAMPTZ, UNIQUE(user_id, endpoint)
  ```
- RLS: utente vede/elimina solo le proprie; insert filtrato per auth.uid()
- UI: toggle "Attiva notifiche push" nel pannello notifiche (Topbar)
- Chiama `PushManager.subscribe()` con chiave pubblica VAPID, salva sottoscrizione su DB

#### 3. Edge Function mittente (`supabase/functions/send-push/index.ts`)
- Riceve `{ user_id, title, body, data }`, legge le sottoscrizioni dell'utente da DB
- Invia con `web-push` (libreria JS standard, ~5KB) usando VAPID private key (da secret env)
- Gestisce errori 410 (endpoint scaduto) → cancella sottoscrizione

#### 4. Trigger DB su insert/update notifications
- Trigger `AFTER INSERT OR UPDATE` sulla tabella `notifications`
- Condizione: `NEW.read = false` (include sia insert nuove che re-promemoria queue_stale che diventano non lette)
- Chiama la Edge Function `send-push` via `net.http_post()` (extension `pg_net` gia attiva su Supabase)
- Tutte le notifiche (task_assigned, mention, queue_stale, user_pending, ecc.) arrivano automaticamente sullo smartphone

### Limiti noti
- **Android Chrome**: funziona perfettamente, anche a browser chiuso
- **iPhone**: richiede iOS 16.4+ e app installata sulla schermata Home ("Aggiungi a schermata Home" da Safari); dal browser normale Apple non permette push
- Se l'utente nega il permesso a livello di sistema, serve UI che spieghi come riattivarlo

### Stima
Circa una sessione di lavoro: 1 migration, 1 Edge Function, 1 service worker, toggle frontend.

### Chiave VAPID
Da generare prima dell'implementazione:
```bash
npx web-push generate-vapid-keys
```
- Chiave pubblica → variabile d'ambiente frontend (es. `VITE_VAPID_PUBLIC_KEY`)
- Chiave privata → secret Supabase Edge Function (`VAPID_PRIVATE_KEY`)

---

## File toccati in questa sessione

| File | Azione |
|------|--------|
| `supabase/migrations/20260705_queue_stale_dedup.sql` | NUOVO — migration dedup + funzione v2 |
| `docs/HANDOFF_SESSION_2026-07-05_v44_queue_stale_dedup.md` | NUOVO — questo file |

---

## Caveat aperti

1. **Task duplicati con titoli quasi uguali** — nello screenshot i "doppioni" `wizz` / `wizz ` e `check in QUERO GIUSEPPE` / `chek in QUERO GIUSEPPE` sono task distinti con ID diversi. Probabilmente creati due volte a mano. Suggerire all'utente di cestinare quelli errati.

2. **Intervallo re-promemoria 24h** — prima era 4h (troppo rumoroso). Se l'utente preferisce un ritmo diverso, basta cambiare l'`interval '24 hours'` nella funzione `notify_queue_stale()`.

3. **Notifiche task_due** — la funzione `notify_task_due()` (cron giornaliero 8:00) usa lo stesso pattern della vecchia queue_stale ma con de-dup 22h su un cron che gira 1 volta/giorno, quindi meno esposta all'accumulo. Tuttavia non ha cleanup dei task completati/cestinati e manca l'indice UNIQUE: se un task resta in scadenza piu giorni (es. due_date spostata avanti), potrebbe generare duplicati. Valutare di applicare lo stesso pattern (UNIQUE + cleanup + upsert) per coerenza.
