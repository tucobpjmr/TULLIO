# HANDOFF — Sessione 2026-07-06 v45
### Web Push Notifications (VAPID) + dedup task_due (caveat #3 v44)

---

## Stato repo al termine della sessione

| Voce | Valore |
|------|--------|
| Branch di lavoro | `claude/handoff-v44-push-notifications-pxok3d` |
| Test | 180 passati (18 file, nessun test toccato) |
| Lint | 0 errori (10 warning pre-esistenti, nessuno nei file toccati) |
| Build | OK |
| DB live | migration applicate, Edge Function deployata, segreti in Vault |

---

## Cosa è stato fatto in questa sessione

### 1. Web Push Notifications — tutti e 4 i pezzi della roadmap v44

Le notifiche dell'app (task_assigned, task_due, comment, mention, queue_stale,
user_pending) arrivano ora anche come **notifiche di sistema sullo smartphone
ad app chiusa**, per gli utenti che attivano il toggle.

**Flusso**: INSERT/UPDATE su `notifications` (read=false) → trigger
`notify_push()` → `net.http_post` (pg_net, asincrono) → Edge Function
`send-push` → Web Push a tutti i dispositivi sottoscritti dell'utente.

#### Pezzo 1 — Service worker (`public/sw.js`)
- Solo push, **nessun handler fetch** → zero impatti su caching/rete della PWA
- `push` → `showNotification` (icona `apple-touch-icon-192.png`, `tag` per
  sostituire la notifica precedente dello stesso task invece di accumulare)
- `notificationclick` → app aperta: focus + `postMessage push-open-task`;
  app chiusa: `openWindow('/?task=<id>')`
- Registrato in `src/main.jsx` su `window.load`
- Deep-link gestito in `VoyageDesk.jsx`: l'id resta in `pendingPushTask` finché
  il task non è idratato in `state.tasks` (niente toast d'errore prematuro),
  poi `SET_SELECTED_TASK` apre il TaskSlideOver; il param `?task=` viene
  rimosso dall'URL con `history.replaceState`

#### Pezzo 2 — Tabella + opt-in frontend
- Migration `20260706_web_push_notifications.sql`: tabella `push_subscriptions`
  (`user_id` FK cascade, `endpoint`, `p256dh`, `auth`, `user_agent`,
  `UNIQUE(user_id, endpoint)`), RLS own-only con gate `is_active_user()`
- `src/lib/push.js`: `getPushSupport()` (rileva iOS Safari fuori PWA),
  `getPushState()`, `enablePush(userId)`, `disablePush()`
- `src/lib/api.js`: API `Push` (getVapidPublicKey via RPC, save upsert,
  removeByEndpoint)
- Toggle "Notifiche push" come footer del `NotificationsPanel` (Topbar.jsx),
  componente module-local `PushToggle`; stati: on/off/busy/denied/
  needs-install (hint "Aggiungi a schermata Home" per iPhone)/unsupported

#### Pezzo 3 — Edge Function `send-push` (deployata, v1 ACTIVE)
- `supabase/functions/send-push/index.ts` — Deno, libreria
  `jsr:@negrel/webpush@0.5.0` (pura WebCrypto: `npm:web-push` dipende da
  node:crypto, meno affidabile sul runtime edge)
- verify_jwt attivo (il trigger manda l'anon key come Bearer); autorizzazione
  vera = header `x-push-secret` confrontato col secret condiviso in Vault
  (senza → 401, verificato)
- Endpoint 404/410 (sottoscrizione scaduta/revocata) → riga cancellata
  (verificato e2e con endpoint FCM fasullo: `removed: 1`)
- **Niente secret da dashboard**: i segreti arrivano dalla RPC
  `get_push_secrets()` (solo service_role) che legge il Vault

#### Pezzo 4 — Trigger DB
- `trg_notify_push_insert`: AFTER INSERT WHEN (new.read = false)
- `trg_notify_push_update`: AFTER UPDATE WHEN (old.read AND NOT new.read) —
  cattura i "risvegli" dei re-promemoria senza rifare push su update qualsiasi
- `notify_push()`: skip se l'utente non ha sottoscrizioni, no-op se i segreti
  Vault mancano, titoli/corpi in italiano specchio di `notifTitle()`
  (Topbar.jsx), `EXCEPTION WHEN OTHERS` → il push non blocca mai l'insert
  della notifica

#### Chiavi e segreti (Vault del progetto, NON nel repo)
| Nome | Contenuto |
|------|-----------|
| `vapid_public_key` | chiave pubblica VAPID (base64url) — esposta agli utenti autenticati via RPC `get_vapid_public_key()` |
| `vapid_jwk` | coppia VAPID in JWK per la Edge Function |
| `vapid_subject` | `mailto:` contatto VAPID |
| `push_fn_url` | URL Edge Function send-push |
| `push_anon_key` | anon key (Bearer del trigger) |
| `push_trigger_secret` | secret condiviso trigger → funzione |

**Nessuna env var Vercel richiesta**: la chiave pubblica arriva a runtime via
RPC, quindi niente `VITE_VAPID_PUBLIC_KEY` (deviazione in meglio rispetto alla
roadmap v44). Chiavi generate con `npx web-push generate-vapid-keys`; per
ruotarle: rigenerare, aggiornare i 2 secret Vault (`vapid_public_key`,
`vapid_jwk`) e le sottoscrizioni esistenti vanno rifatte (toggle off/on).

### 2. Dedup notifiche task_due (caveat #3 v44 — chiuso)

Migration `20260706_task_due_dedup.sql`, gemella di
`20260705_queue_stale_dedup`:
- one-off dedup righe esistenti + indice UNIQUE parziale
  `(user_id, payload->>'task_id') WHERE type='task_due'`
- cleanup a ogni giro: via i promemoria di task cestinati/completati/senza
  due_date/oltre 24h/utente non più assegnatario (i task **già scaduti**
  restano: promemoria ancora attuale)
- non letta → nessuna azione; letta da >22h e ancora in scadenza → stessa
  riga risvegliata (read=false, created_at=now(), payload rigenerato)
- verificata idempotente (3 esecuzioni consecutive, nessun errore)
- rilevante per le push: senza cleanup un task chiuso avrebbe continuato a
  generare promemoria push giornalieri

### 3. Fix advisor sicurezza
- `pg_net` spostata da schema `public` a `extensions` (advisor 0014) —
  **nota**: l'handoff v44 dava pg_net "già attiva", in realtà non era installata
- `revoke execute` su `notify_push()` da public/anon/authenticated (advisor
  0028/0029)

---

## Verifiche eseguite

| Test | Esito |
|------|-------|
| Edge Function senza `x-push-secret` | 401 unauthorized ✅ |
| Edge Function con secret, utente senza sottoscrizioni | 200 `{sent:0}` ✅ |
| E2e: insert notifica → trigger → pg_net → funzione → FCM 404 → cleanup riga | 200 `{removed:1}`, tabella ripulita ✅ (2 volte, anche dopo lo spostamento di pg_net) |
| `notify_task_due()` x3 consecutive | idempotente, 0 errori ✅ |
| Lint / test / build frontend | 0 errori / 180 passati / OK ✅ |
| Dati di test | nessun residuo su `push_subscriptions` e `notifications` ✅ |
| CRLF `VoyageDesk.jsx` | preservati (diff 37/0) ✅ |

Non testabile da qui: ricezione push su dispositivo reale (serve un browser
che si sottoscriva). **Primo test consigliato**: deploy → aprire l'app su
Android Chrome → campanella → attivare "Notifiche push" → farsi assegnare un
task da un altro utente → notifica di sistema anche a browser chiuso.

---

## Cron jobs attivi (invariati)

| Job | Schedule | Funzione |
|-----|----------|----------|
| `notify_task_due_daily` | `0 8 * * *` | `notify_task_due()` — ora v2 dedup + cleanup |
| `notify_queue_stale_hourly` | `5 * * * *` | `notify_queue_stale()` (v2 dedup) |

---

## File toccati

| File | Azione |
|------|--------|
| `supabase/migrations/20260706_web_push_notifications.sql` | NUOVO — pg_net, push_subscriptions+RLS, RPC vault, trigger notify_push |
| `supabase/migrations/20260706_task_due_dedup.sql` | NUOVO — caveat #3 v44 |
| `supabase/functions/send-push/index.ts` | NUOVO — Edge Function mittente (deployata) |
| `public/sw.js` | NUOVO — service worker push-only |
| `src/lib/push.js` | NUOVO — helper client push |
| `src/lib/api.js` | API `Push` |
| `src/main.jsx` | registrazione service worker |
| `src/components/shell/Topbar.jsx` | `PushToggle` nel NotificationsPanel |
| `src/VoyageDesk.jsx` | deep-link `?task=` + listener postMessage dal SW |
| `docs/HANDOFF_SESSION_2026-07-06_v45_web_push.md` | NUOVO — questo file |

---

## Limiti noti (da v44, confermati)
- **Android Chrome**: funziona anche a browser chiuso
- **iPhone**: serve iOS 16.4+ e app installata sulla Home (da Safari:
  Condividi → "Aggiungi alla schermata Home"); il toggle mostra l'hint quando
  rileva iOS fuori PWA
- Permesso negato a livello sistema → il toggle mostra come riattivarlo

## Caveat aperti

1. **Task duplicati a mano** (caveat #1 v44, ancora aperto): `wizz`/`wizz ` e
   `check in QUERO GIUSEPPE`/`chek in...` sono task distinti creati due volte;
   suggerire all'utente di cestinare quelli errati.
2. **Intervallo re-promemoria** (caveat #2 v44): 24h per queue_stale, 22h per
   task_due — modificabili nei rispettivi `interval` delle funzioni.
3. **Stesso dispositivo, più utenti**: se due utenti attivano le push sullo
   stesso browser/dispositivo, l'endpoint è condiviso → entrambe le righe
   restano e il dispositivo riceve le notifiche di entrambi. Caso raro
   (dispositivi personali); eventualmente pulire le righe di altri utenti
   per lo stesso endpoint lato Edge Function.
4. **Rotazione anon key**: se si rigenera l'anon key del progetto va
   aggiornato il secret Vault `push_anon_key` (il trigger lo usa come Bearer).
