# HANDOFF — Sessione 2026-07-25 v46
### Notifiche coda globale: rilevanza per scadenza + digest unico

---

## Segnalazione

Screenshot del pannello notifiche: **34 notifiche, 32 non lette**, tutte con lo
stesso testo `Task in coda da > 4h: <titolo>` e tutte con lo stesso timestamp
("56 min fa"). Parole dell'utente: *"l'utente riceve allert di notifica per task
in scadenza tra molti giorni… troviamo un modo per non affollare la parte
notifiche"*.

## Diagnosi (verificata sul DB `vmxvnxsqfisucugcpqlc`)

`notify_queue_stale()` decideva cosa segnalare guardando **l'età di creazione**
del task (`created_at < now() - 4h`), non la sua scadenza:

```sql
where status = 'todo'
  and (assignees is null or array_length(assignees,1) is null)
  and created_at < now() - interval '4 hours'
```

Nel flusso reale dell'agenzia i task si creano in anticipo — un check-in volo
nasce appena confermata la pratica e resta legittimamente in coda globale finché
non è il momento di lavorarlo. Ogni task futuro diventava quindi un allarme
4 ore dopo essere stato creato.

Fotografia al 2026-07-25: **35 task** in coda soddisfacevano quella condizione,
con scadenze fino a **43 giorni avanti** (`ck easyjet` → 07/09, `CKECK IN
RYANAIR` → 27/08, `cuba festa rocco` → 21/08). × 3 destinatari (manager/admin) =
**68 righe** in `notifications`, 65 non lette.

Il dedup della sessione v44 (`20260705_queue_stale_dedup`) aveva risolto un
problema diverso — lo **stesso** task rinotificato a ogni giro di cron — e
funzionava: nessun duplicato per coppia utente+task. L'affollamento residuo non
era duplicazione ma **volume**: un task = una riga.

## Soluzione — `supabase/migrations/20260725_queue_stale_relevance_digest.sql`

### A. Rilevanza: si segnala l'imminenza, non l'anzianità

| Caso | Regola nuova | Regola vecchia |
|------|--------------|----------------|
| Task **con** scadenza | in coda e scadenza entro **48h** (o già scaduto) | in coda da > 4h |
| Task **senza** scadenza | in coda da > **24h** | in coda da > 4h |

48h = finestra operativa del check-in volo. Le tre finestre sono costanti
dichiarate in testa alla funzione (`c_due_window`, `c_no_due_age`,
`c_remind_after`): per cambiare ritmo si tocca una riga sola.

Effetto sui dati del 25/07: task segnalati **35 → 15** (13 in scadenza entro 48h
+ 2 senza scadenza fermi da giorni).

### B. Digest: una sola notifica per utente, sempre

15 task rilevanti sarebbero comunque 15 righe a testa. La funzione ora scrive
**una riga `queue_stale` per utente** che riassume tutta la coda urgente:

```json
{ "count": 15,
  "tasks": [ {"id":…, "title":"CK RYANAIR", "due_date":…}, … ],   // primi 5, anteprima
  "task_ids": [ … ],                                              // tutti, per il diff
  "view": "dashboard", "queue": "global" }
```

- `count > 1` → titolo *"15 task in scadenza senza assegnatario"*, seconda riga
  con i primi tre titoli e `+N`; il tap apre la Dashboard sulla tab **Coda
  Globale**.
- `count = 1` → il payload include anche `task_id`/`task_title`: titolo
  specifico e tap che apre direttamente il task, come le altre notifiche.
- Coda urgente vuota → la riga sparisce da sola.

Invariante garantito dall'indice `notifications_queue_stale_user_uq` su
`(user_id) where type='queue_stale'` (sostituisce quello su utente+task).

### C. Ritmo dei risvegli (e quindi delle push)

| Stato della riga | Azione del cron | Push |
|---|---|---|
| Già **non letta** | aggiorna solo il payload | ❌ |
| Letta, **task nuovi** entrati in finestra | risveglio (`read=false`, `created_at=now()`) | ✅ |
| Letta da > 24h, coda ancora piena | risveglio giornaliero | ✅ |
| Letta da < 24h, nessuna novità | aggiorna solo il payload | ❌ |

Il ritmo non lo detta più il cron (che resta orario) ma lo **stato di lettura**:
al massimo una push per ogni lettura dell'utente.

### D. Trigger push: `trg_notify_push_update` ristretto

`20260725_chat_message_notifications` aveva esteso la condizione del trigger a
"payload cambiato", per far arrivare la push del messaggio successivo nella
stessa conversazione. Su un digest quella regola avrebbe vanificato la colonna
"Push ❌" della tabella sopra: la riga non letta cambia payload a ogni giro
(un task preso in carico, una scadenza che entra in finestra) → una push
all'ora. La condizione ora vale **solo per `chat_message`**; per tutti gli altri
tipi la push resta legata alla transizione letta → non letta.

---

## Frontend

| File | Modifica |
|------|----------|
| `src/lib/notifUtils.js` | **NUOVO** — `NOTIF_ICONS`, `NOTIF_CATEGORIES`, `notifTitle`, `notifSubtitle`, `notifTime`, `notifTarget` estratti da `Topbar.jsx`. Funzioni pure → testabili senza mock di Supabase |
| `src/components/shell/Topbar.jsx` | usa gli helper; seconda riga con l'anteprima dei task del digest; `notifTarget()` decide il tap (task / chat / vista) |
| `src/state/reducer.js` | `SET_VIEW` accetta `action.queue` → `state.dashboardQueue = { tab, seq }`. Il `seq` incrementale fa scattare la selezione anche a tab già visitata |
| `src/components/dashboard/Dashboard.jsx` | `useEffect` su `dashboardQueue` per aprirsi sulla tab richiesta (ignorata per il Driver, che non ha la coda globale) |

Etichette aggiornate: *"Task in coda da > 4h"* → *"Task in scadenza senza
assegnatario"*. Il vecchio testo era anche la fonte del malinteso segnalato
("allert per task in scadenza tra molti giorni").

Compatibilità: `notifTitle` regge ancora il payload vecchio (`task_title` senza
`count`), utile se restassero righe pre-migration.

---

## Test

- `src/test/notifUtils.test.js` — **NUOVO**, 14 casi: titolo digest / singolo /
  payload legacy, sottotitolo con e senza resto, `notifTarget` per i tre tipi di
  destinazione.
- `src/test/reducer.test.js` — 3 casi su `SET_VIEW` + `queue`.
- Suite completa: **237 test, 27 file, tutti verdi**. Lint 0 errori. Build OK.

Validazione DB: migration eseguita in transazione con `rollback` sul progetto
live, `notify_queue_stale()` invocata 3 volte di fila → 2 righe (una per
destinatario attivo), payload identico: **idempotente**.

---

## File toccati

| File | Azione |
|------|--------|
| `supabase/migrations/20260725_queue_stale_relevance_digest.sql` | NUOVO |
| `src/lib/notifUtils.js` | NUOVO |
| `src/test/notifUtils.test.js` | NUOVO |
| `src/components/shell/Topbar.jsx` | helper estratti, sottotitolo, navigazione per vista |
| `src/components/dashboard/Dashboard.jsx` | apertura su tab coda richiesta |
| `src/state/reducer.js` | `SET_VIEW` con `queue` + `dashboardQueue` nello state |
| `src/test/reducer.test.js` | 3 casi nuovi |
| `docs/HANDOFF_SESSION_2026-07-25_v46_notifiche_coda_digest.md` | NUOVO — questo file |

---

## Da fare / caveat

1. **Migration non ancora applicata al DB live.** Va eseguita sul progetto
   `vmxvnxsqfisucugcpqlc` (in sessione è stata solo validata con rollback). La
   sezione 1 cancella le `queue_stale` esistenti — sono promemoria effimeri e la
   sezione 6 li rigenera subito nel nuovo formato.

2. **Finestra 48h da tarare sull'uso reale.** Se i check-in vanno lavorati con
   più anticipo si alza `c_due_window`; se la coda urgente resta troppo affollata
   si scende a 24h. Una riga in `notify_queue_stale()`.

3. **`notify_task_due()` lasciata invariata.** Ha già una finestra di 24h, punta
   ai soli assegnatari ed è deduplicata per utente+task (`20260706_task_due_dedup`):
   sul DB sono 2 righe totali, non contribuisce all'affollamento. Se un giorno
   servisse, lo stesso schema digest è replicabile.

4. **`task_assigned`: 18 non lette sul DB.** Non è un difetto di logica (una
   notifica per assegnazione reale è corretta) ma è la seconda voce per volume
   dopo `queue_stale`. Da riguardare solo se l'utente lo segnala.
