# HANDOFF — Sessione 2026-07-25 v46
### Notifiche: coda globale a digest + ritiro automatico dei promemoria di task

Due interventi, due migration:

| # | Migration | Tipo notifica | Problema |
|---|-----------|---------------|----------|
| 1 | `20260725_queue_stale_relevance_digest.sql` | `queue_stale` | 68 righe: si segnalava l'anzianità del task invece della scadenza, una riga per task |
| 2 | `20260725_task_notifications_cleanup.sql` | `task_assigned`, `task_due` | 19 righe di cui 8 per task già chiusi o cestinati: la notifica nasceva e non veniva mai ritirata |

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

## Parte 2 — `task_assigned` / `task_due`: ritiro automatico

### Diagnosi

`notify_task_assigned()` è un trigger su `tasks`: crea la notifica al momento
dell'assegnazione e **non la ritira mai**. Sul DB al 25/07, delle 19 righe:

- **7** puntavano a task con `status = 'done'` — la più vecchia del 1° luglio,
  mai letta, per un task chiuso da settimane (`irlanda`, `verifica penali msc`,
  `x amastuola 25 luglio`…);
- **1** a un task cestinato il 04/07 (`check in `);
- **11** si riferivano a lavoro davvero aperto.

"Nuovo task assegnato" è un promemoria di lavoro: quando il lavoro non c'è più
la riga è rumore, e occupa il pannello esattamente come facevano le
`queue_stale`.

### Soluzione — `20260725_task_notifications_cleanup.sql`

**1. Ritiro immediato** (nuovo trigger `trg_prune_task_notifications` su `tasks`,
`after update of status, deleted_at, assignees`):

| Evento sul task | Cosa viene ritirato |
|---|---|
| Passa a **done** | `task_assigned` + `task_due`. Commenti e menzioni restano: sono eventi di conversazione, non "hai qualcosa da fare" |
| Va nel **cestino** | **tutte** le notifiche che lo citano — il tap porterebbe a un task cestinato |
| Cambiano gli **assegnatari** | i promemoria di chi non è più della partita (chi entra riceve la sua da `notify_task_assigned`) |

Il nome del trigger ordina **dopo** `trg_notify_task_assigned` (Postgres esegue
in ordine alfabetico): sulla stessa UPDATE prima nasce la notifica per i nuovi
assegnatari, poi si ritirano quelle di chi è uscito.

**2. Una riga per utente+task** — indice `notifications_task_assigned_user_task_uq`
+ upsert nel trigger (stesso schema di `chat_message` e `task_due`): riassegnare
lo stesso task alla stessa persona risveglia la riga esistente invece di
accodarne una nuova. Aggiunto anche il guard "task già done/cestinato → nessun
promemoria", che copre la riassegnazione di un task nel cestino.

**3. Retention giornaliera** — nuova funzione `prune_notifications()` + cron
`prune_notifications_daily` (`20 3 * * *`): rete di sicurezza per ciò che il
trigger non vede (cestino svuotato = DELETE fisico del task, import massivi) +
limite di età a **30 giorni**. `queue_stale` è esclusa dal limite: si rigenera
da sola e il suo `created_at` è la data dell'ultimo risveglio, non dell'origine.

**Cosa NON cambia**: ogni assegnazione continua a generare una notifica. È
informazione per-task legittima ("questo task specifico ora è tuo") e sui dati
reali il ritmo è di circa una ogni giorno e mezzo — non c'è il problema di
volume che ha richiesto il digest per la coda globale.

### Verifica (transazione con rollback sul DB live)

| Scenario | Atteso | Esito |
|---|---|---|
| Cleanup one-off | righe orfane via | `task_assigned` 19 → **11**, `task_due` 2 → **1** |
| S1 — completo un task | la sua `task_assigned` sparisce | 1 → **0** ✅ |
| S2 — cestino un task | spariscono tutte le sue notifiche | 1 → **0** ✅ |
| S3 — riassegno a un altro | resta solo il nuovo assegnatario | solo `Cosimo` ✅ |
| S4 — assegna / togli / riassegna | nessun duplicato | **1** riga ✅ |

---

## File toccati

| File | Azione |
|------|--------|
| `supabase/migrations/20260725_queue_stale_relevance_digest.sql` | NUOVO |
| `supabase/migrations/20260725_task_notifications_cleanup.sql` | NUOVO |
| `src/lib/notifUtils.js` | NUOVO |
| `src/test/notifUtils.test.js` | NUOVO |
| `src/components/shell/Topbar.jsx` | helper estratti, sottotitolo, navigazione per vista |
| `src/components/dashboard/Dashboard.jsx` | apertura su tab coda richiesta |
| `src/state/reducer.js` | `SET_VIEW` con `queue` + `dashboardQueue` nello state |
| `src/test/reducer.test.js` | 3 casi nuovi |
| `docs/HANDOFF_SESSION_2026-07-25_v46_notifiche_coda_digest.md` | NUOVO — questo file |

---

## Da fare / caveat

1. **Migration applicata al DB live** (progetto `vmxvnxsqfisucugcpqlc`, su
   conferma dell'utente in sessione). Stato di `notifications` dopo
   l'applicazione:

   | Tipo | Prima | Dopo |
   |------|-------|------|
   | `queue_stale` | 68 (65 non lette) | **2** (una per destinatario, 15 task nel digest) |
   | `task_assigned` | 19 | 19 (non toccate) |
   | `task_due` | 2 | 2 (non toccate) |
   | `chat_message` | 1 | 1 (non toccata) |

   Il cron `notify_queue_stale_hourly` (`5 * * * *`) resta invariato: chiama la
   funzione per nome, quindi usa già la versione nuova.

2. **Finestra 48h confermata dall'utente.** Se i check-in vanno lavorati con
   più anticipo si alza `c_due_window`; se la coda urgente resta troppo affollata
   si scende a 24h. Una riga in `notify_queue_stale()`.

3. **`notify_task_due()`: logica di generazione invariata.** Ha già una finestra
   di 24h, punta ai soli assegnatari ed è deduplicata per utente+task
   (`20260706_task_due_dedup`). La migration 2 le aggiunge solo il ritiro
   immediato (prima il cleanup arrivava al massimo una volta al giorno, al giro
   del cron delle 8:00). Se un giorno servisse, lo schema digest è replicabile.

4. **Retention a 30 giorni**: `prune_notifications()` cancella le notifiche più
   vecchie di 30 giorni **anche se non lette**. Il lavoro non si perde — i task
   restano nella coda personale, nel calendario e nelle notifiche `task_due` —
   ma è una scelta da rivedere se qualcuno usa il pannello come to-do list. Una
   riga: `c_max_age` in `prune_notifications()`.

5. **Trigger AFTER su `tasks`: ora sono tre** — `trg_log_task_history`,
   `trg_notify_task_assigned`, `trg_prune_task_notifications` (più i tre BEFORE:
   `set_task_completed_at`, `tasks_set_created_by`, `touch_updated_at`). Il nome
   scelto ordina `prune` dopo `notify` (Postgres esegue in ordine alfabetico),
   ma il risultato non dipende dall'ordine: `prune` cancella solo le righe di
   chi **non** è fra i nuovi assegnatari, quindi non può toccare quella appena
   creata. È una precauzione, non un vincolo.
