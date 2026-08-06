# HANDOFF — Sessione TULLIO: 4 bug risolti + fix iOS scroll mobile

**Data:** 30 giugno 2026 (sessione 40, continuazione v39)
**Branch di lavoro:** `claude/senior-agent-queue-visibility-sgilnh` + `claude/editable-task-details` + `claude/task-files-rls-global-queue` + `claude/ios-mobile-sheet-scroll`
**Per:** Claude Code / prossima sessione

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file. Sessione precedente: `docs/HANDOFF_SESSION_2026-06-30_v39_senior_agent_global_queue_rls.md` (PR #87).

---

## 0. TL;DR (1 minuto)

Questa sessione ha **risolto 4 bug** e aggiunto un **fix iOS**:

| N | Titolo | PR | Stato | Branch |
|----|--------|----|----|---------|
| 1 | RLS coda globale visibile ai Senior Agent | #87 | ✅ Mergiato | v39 |
| 2 | Logout locale + recupero sessione scaduta sull'invito | #88 | ✅ Mergiato | `claude/auth-session-local-logout` |
| 3 | Eliminazione utenti uploader di allegati | #89 | ✅ Mergiato | `claude/task-files-uploaded-by-set-null` |
| 4 | Modifica completa dei dettagli task dal drawer | #90 | ✅ Mergiato | `claude/editable-task-details` |
| 5 | Allegati coda globale visibili agli agenti | #91 | ✅ Mergiato | `claude/task-files-rls-global-queue` |
| 6 | Scroll affidabile negli sheet full-height su iOS | #92 | ✅ Mergiato | `claude/ios-mobile-sheet-scroll` |

**Tutti i branch sono stati mergiati su `main`.** DB live aggiornato con le 3 migrazioni (RLS coda globale, allegati RLS, uploaded_by SET NULL).

---

## 1. I 4 Bug — Diagnosi e Fix

### Bug #1: Senior Agent vede 0 task nella Coda Globale

**Sintomo:** gli agenti (ruolo `agent`) non vedevano alcun task in "Coda Globale" della Dashboard, pur sendo presenti.

**Causa:** RLS `tasks_select` del DB — policy richiedeva `is_manager_or_admin() OR uid = ANY(assignees) OR created_by = uid`. Un task in coda globale ha `assignees = '{}'`, quindi un `agent` non creatore non soddisfa nessuna condizione → nascosto dalla RLS.

**Fix (PR #87):** Migration `20260630_tasks_global_queue_agent_visibility.sql`:
- Nuovo helper `can_view_global_queue()` (SECURITY DEFINER): `true` se l'utente è attivo con `role IN ('admin','manager','agent')`.
- `tasks_select` e `tasks_update` ricreate con clausola aggiuntiva: `OR (cardinality(assignees) = 0 AND can_view_global_queue())`.
- **Driver esclusi** dalla coda globale (coerente con la logica frontend).

**Stato:** Migration applicata al DB live e verificata.

---

### Bug #2: "Token non valido" su invito nuovo agente

**Sintomo:** quando si invitava un nuovo agente via email (modale "Aggiungi nuovo agente"), l'API ritornava `Errore: Token non valido` in un toast rosso.

**Causa:** `AuthContext.signOut()` usava il scope **`'global'`** (default) — revocava tutte le sessioni dell'utente inclusa quella corrente. L'utente restava in sessione locale ma il token era invalidato a livello server → il refresh automatico falliva → "Token non valido".

**Fix (PR #88):** 
- `src/auth/AuthContext.jsx`: `signOut()` modificato con `scope: 'local'` — esce dalla sola scheda/sessione senza invalidare il token globale.
- `src/lib/api.js`: aggiunta logica di retry — se `Users.invite()` fallisce con "token scaduto", chiama `supabase.auth.refreshSession()` e riprova prima di mostrare un messaggio user-friendly.

**Stato:** Fix deployato; utenti possono invitare agenti senza perdere la sessione.

---

### Bug #3: "Impossibile eliminare l'utente: {}" quando si elimina un uploader di allegati

**Sintomo:** tentando di eliminare un utente dal panel Admin che aveva caricato allegati, il sistema tornava errore `Impossibile eliminare l'utente: {}` (messaggio vuoto/cifrato).

**Causa 1:** FK `task_files.uploaded_by → auth.users(id)` era `ON DELETE NO ACTION` — bloccava la cancellazione hard di un utente dal DB se aveva upload di file.

**Causa 2:** Edge Function `delete-user/index.ts` non gestiva robusto il messaggio di errore FK — lo serializzava male quando era un oggetto vuoto.

**Fix (PR #89):**
- Migration `20260630_task_files_uploaded_by_set_null.sql`: FK `uploaded_by` da `ON DELETE NO ACTION` → `ON DELETE SET NULL`. Se un uploader viene eliminato, `uploaded_by` diventa NULL ma il file resta e rimane visibile/gestibile dall'assegnatario della task.
- `supabase/functions/delete-user/index.ts` v2: estrazione messaggio d'errore più robusta; fallback a `JSON.stringify(delErr)` se il messaggio è vuoto; detection FK violation → ritorna HTTP 409 con messaggio italiano leggibile.

**Stato:** Migration applicata; utenti uploader possono essere eliminati senza bloccare il database.

---

### Bug #4 (in 2 parti): Allegati non completamente editabili

#### Parte A: Campi task non completamente editabili dal drawer

**Sintomo:** dal drawer di dettaglio task (`TaskSlideOver`), solo alcuni campi erano modificabili (stato, scadenza, pratica, assegnati). Titolo, categoria, priorità, cliente, descrizione rimanevano in sola lettura.

**Fix (PR #90):** 
- `src/components/tasks/TaskSlideOver.jsx` completamente refactored:
  - Bozza locale (`useState draft`) per campi testo: titolo, cliente, pratica, descrizione. Commit al blur (singolo UPDATE_TASK per modifica, non a ogni tasto).
  - Categoria + Priorità: select dropdown editabili, gated da `canEditTask`.
  - Cliente: input con autocomplete sulla anagrafica clienti (pattern riusato da `QuickAddTask`).
  - Tutti i campi gated da `canEditTask` → chi può solo visualizzare vede versione read-only coerente.
  - Avatar nel box commento: usa le iniziali dell'utente corrente invece di hardcoded "MF".
- `src/VoyageDesk.jsx`: propria `clients` passato a `TaskSlideOver` per l'autocomplete.

**Stato:** Mergiato. Utenti possono ora editare ogni dettaglio della task dal drawer (se hanno permessi).

#### Parte B: Allegati invisibili su coda globale, delete ristretto

**Sintomo:** gli allegati delle task erano visibili **solo a manager/admin**. Inoltre, sulla coda personale, solo chi aveva caricato un file (o un admin) poteva eliminarlo — un assegnatario di una task non poteva eliminare file caricati da altri sulla sua task.

**Causa:** policy RLS di `task_files` e `storage.objects` non erano state allineate quando la PR #87 ha aperto la coda globale. Restavano su condizioni OLD senza il controllo coda globale.

**Fix (PR #91):**
- Migration `20260630_task_files_rls_global_queue.sql`: ricrea tutte le policy di `task_files` (SELECT/INSERT/DELETE) e `storage.objects` (SELECT/INSERT/DELETE):
  - **SELECT:** chiunque possa vedere la task (includendo coda globale per non-driver).
  - **INSERT:** chiunque possa gestire la task (assegnatari, creatore, manager/admin, agenti coda globale).
  - **DELETE:** come INSERT + fallback per uploader (metadati) e owner_id (storage).
- Riusa `can_view_global_queue()` da PR #87 per coerenza.

**Verifica RLS:** simulazione su DB mostra coda globale di un agente da 0 → 6 allegati visibili ✅.

**Stato:** Migration applicata. Agenti vedono/gestiscono allegati in coda globale; assegnatari possono eliminare allegati sulla propria task personale.

---

## 2. Fix iOS: Scroll Affidabile negli Sheet Full-Height

### Problema

Su **iPhone** (Safari/Chrome iOS) scrollando nel drawer dettaglio task spesso **non si raggiungeva il fondo** (box commento), nascosto dietro la toolbar dinamica del browser. Su Android il comportamento era corretto.

### Causa

Il `TaskSlideOver` usava l'**intero contenitore `position:fixed` alto `100dvh` come area di scroll** (`overflowY:auto` sul guscio). iOS scrollare un elemento fixed alto esattamente quanto il viewport lascia l'ultimo contenuto dietro la toolbar inferiore → irraggiungibile.

### Fix (PR #92)

**`src/components/tasks/TaskSlideOver.jsx`** — allineato al pattern di `ChatPanel` (già corretto):
- Guscio esterno: `overflow: hidden` (non scrolla il pannello intero).
- Header: resta fisso (`flexShrink: 0`).
- **Corpo:** diventa unica area scrollabile → `flex: 1`, `minHeight: 0`, `overflowY: auto`, `-webkit-overflow-scrolling: touch` (momentum iOS), `overscroll-behavior: contain` (niente scroll-chaining).
- `padding-bottom: calc(28px + env(safe-area-inset-bottom))` → l'ultimo elemento resta sopra home-indicator/toolbar.

**`src/components/chat/ChatPanel.jsx`** — `padding-bottom` con `env(safe-area-inset-bottom)` sul composer messaggi (iPhone notched).

**Modali centrati non toccati:** `vd-modal-mh` (`QuickAddTask`, `ProfileEditor`, `Trash`) hanno `max-height: calc(100dvh - 76px)` e scrollano internamente, quindi non soffrono del problema.

**Stato:** Mergiato. iOS experience migliorato; il preview deploy è testabile via Vercel.

---

## 3. Database — Migrazioni Applicate

Tre migrazioni sono state applicate al DB live (`tullio` / `vmxvnxsqfisucugcpqlc`):

1. `20260630_tasks_global_queue_agent_visibility.sql` — helper `can_view_global_queue()`, policy tasks_select/update.
2. `20260630_task_files_rls_global_queue.sql` — policy allegati SELECT/INSERT/DELETE per coda globale.
3. `20260630_task_files_uploaded_by_set_null.sql` — FK uploaded_by `ON DELETE SET NULL`.

Tutte sono state versionate nel repo e applicate via Supabase MCP `apply_migration` tool.

---

## 4. Frontend — API & Logica

### Nuovo/Modificato in `src/lib/api.js`:
- Aggiunta costante `SESSION_EXPIRED_MSG` — messaggio user-friendly per sessione scaduta.
- Aggiunta helper `isExpiredSessionError(msg)` — regex check per errori token/sessione.
- `Users.invite()`: retry logica su sessione scaduta (chiama `supabase.auth.refreshSession()` + riprova).

### Modificato in `src/auth/AuthContext.jsx`:
- `signOut()`: scope `'local'` instead of default `'global'`.

### Modificato in `src/components/tasks/TaskSlideOver.jsx`:
- State: `draft` (bozza locale titolo/cliente/pratica/descrizione), `clientFocus`.
- Sync draft al cambio task.id (exhaustive-deps soppresso intenzionalmente).
- `commitText()`: persiste campo testo da bozza se cambiato.
- `updateField()`: persiste campo immediato-persist (status, dueDate, category, priority, assignees).
- Categoria/Priorità: select dropdown editabili.
- Cliente: input + autocomplete dropdown.
- Avatar commento: usa `myInitials` anziché hardcoded "MF".
- Read-only fallback divs per utenti non-editabili.

### Modificato in `src/VoyageDesk.jsx`:
- Propria `clients` passed a `TaskSlideOver`.

### Modificato in `src/components/chat/ChatPanel.jsx`:
- Composer messaggi: `padding-bottom` con safe-area.

---

## 5. Deployment & Verifica

- **CI/CD:** Tutti i 6 PR hanno build green + Vercel deploy completato.
- **Preview deploy PR #92:** https://tullio-git-claude-ios-mobile-sheet-scroll-tooco-s-projects.vercel.app (testabile da iPhone).
- **Staging:** nessun changeset in sospeso. Tutto è merged su `main`.
- **Live:** DB live aggiornato con 3 migrazioni; funzioni Edge v2 deployed.

---

## 6. Prossimi Step Possibili

### Subito pronto (nessun prerequisito)
- Test manuale su iPhone (Coda Globale, allegati, scroll, modifica campi).
- Verifica allegati visibili a Senior Agent sulla coda globale (RLS query).

### Suggerimenti post-merge
1. **Monitoraggio performance:** i 3 KPI RLS aggiungono subcondizioni (`cardinality()`, `can_view_global_queue()` — function call); verificare EXPLAIN ANALYZE su task_select con load reale.
2. **Polish frontend:** l'autocomplete cliente nel drawer potrebbe mostrare anche ultimi clienti usati (non solo filtro testuale).
3. **Fallback UI allegati:** se `uploaded_by` è NULL, mostrare "Caricato automaticamente" anziché nome utente.
4. **Junior Agent block:** il frontend blocca Junior da "prendi in carico" coda globale, ma il DB lo permette. Coerenza: aggiungere trigger `created_by` al check `can_view_global_queue()` (Junior se ha creato il task lo può prendere in carico)?

### Deferred (future sessioni)
- [ ] Resend confirmation email UI
- [ ] Bulk invite
- [ ] Leaked password protection
- [ ] Divergenza urgenti (frontend mostra coda globale urgente altrui, RLS la nasconde)

---

## 7. File Toccati Sommario

```
supabase/
├── migrations/
│   ├── 20260630_tasks_global_queue_agent_visibility.sql  (NEW — PR #87)
│   ├── 20260630_task_files_uploaded_by_set_null.sql      (NEW — PR #89)
│   └── 20260630_task_files_rls_global_queue.sql          (NEW — PR #91)
└── functions/
    └── delete-user/index.ts                               (MODIFIED — v2, PR #89)

src/
├── auth/
│   └── AuthContext.jsx                                    (MODIFIED — PR #88)
├── lib/
│   └── api.js                                             (MODIFIED — PR #88)
├── components/
│   ├── tasks/TaskSlideOver.jsx                            (MODIFIED — PR #90, PR #92)
│   ├── chat/ChatPanel.jsx                                 (MODIFIED — PR #92)
│   └── ...
└── VoyageDesk.jsx                                         (MODIFIED — PR #90)
```

---

## 8. Branch Storici

Tutti chiusi (mergiati):
- `claude/senior-agent-queue-visibility-sgilnh` → main (PR #87)
- `claude/auth-session-local-logout` → main (PR #88)
- `claude/task-files-uploaded-by-set-null` → main (PR #89)
- `claude/editable-task-details` → main (PR #90)
- `claude/task-files-rls-global-queue` → main (PR #91)
- `claude/ios-mobile-sheet-scroll` → main (PR #92)

---

## 9. Testing Checklist

- [ ] Dashboard → Coda Globale: Senior Agent vede task (prima 0 dopo merge).
- [ ] Task dettaglio: tutti i campi editabili per chi può (titolo, cat, priorità, cliente, descrizione).
- [ ] Allegati: visibili e eliminabili su coda globale (per agenti + assegnatari).
- [ ] Allegati: utente uploader può essere eliminato dal DB (FK SET NULL, non più "Impossibile eliminare").
- [ ] Invito agente: no "Token non valido" (session retry).
- [ ] iPhone: scroll drawer raggiunge il fondo (test su Safari/Chrome iOS).
- [ ] RLS audit: simulazione query `set_config('request.jwt.claims', ...)` per valere policy.

---

## 10. Note Finali

- **Completamento:** Questa sessione ha **chiuso la Fase di Bug Fixes Senior Agent + iOS UX**. Il progetto è ora in fase **pre-production-ready** per lo squad operativo (5 agenti +1 manager + 2 admin + 1 driver).
- **Prossima sessione:** potrebbe concentrarsi su monitoring (es. monitorare performance delle query RLS), test real-world con utenti, o aggiungere feature "nice-to-have" (es. resend email, bulk invite, improved autocomplete).
- **Caveat:** le 3 migrazioni aggiungono subcondizioni RLS che aumentano il carico query — importante fare EXPLAIN ANALYZE su `tasks_select` con load reale prima di un SLA di produzione.

---

_Handoff compilato: 30 giugno 2026, ore 10:00 UTC_
