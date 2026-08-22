-- A-1 dell'audit del 23 agosto 2026 — le urgenti altrui.
--
-- ⚠️ IL NOME DEL FILE PORTA IL TIMESTAMP CON CUI LA MIGRAZIONE È REGISTRATA
-- in supabase_migrations.schema_migrations (20260822215237), non quello con
-- cui era stata scritta (20260823090000). È la regola di
-- docs/MIGRAZIONI_SUPABASE.md e non è cosmetica: la CLI decide cosa applicare
-- confrontando i prefissi di versione dei file con quella tabella, quindi un
-- file il cui timestamp non compare lì risulta «da applicare» anche quando il
-- suo contenuto è già vivo sul database. Su questo progetto 56 file sono già
-- in quella condizione ed è il motivo per cui `supabase db push` è vietato:
-- rigiocherebbe in blocco 56 migrazioni sulla produzione. Questo file non è
-- il 57°.
--
-- IL DISALLINEAMENTO. `canViewTask` (src/lib/permissions.js:131) concede a un
-- non-admin la visione di QUALUNQUE task urgente, anche assegnata ad altri:
--
--     if (isMyTask(task, userId)) return true;
--     if (isInGlobalQueue(task)) return true;
--     if (isUrgent(task)) return true;      // ← questo ramo
--
-- `tasks_select` non aveva quel ramo. Letta dal database di produzione il
-- 23 agosto, prima di questa migrazione, era:
--
--     is_manager_or_admin() OR uid = ANY(assignees) OR created_by = uid
--     OR (cardinality(assignees) = 0 AND can_view_global_queue())
--
-- Il database è il livello PIÙ STRETTO, quindi non era un buco di sicurezza:
-- nessuno vedeva ciò che non doveva. Erano altre due cose.
--
--   1. Una funzione di prodotto INERTE per il ruolo a cui è destinata.
--      `components/dashboard/queues/UrgentQueue.jsx` dichiara di mostrare «sia
--      le proprie task urgenti sia quelle altrui (read-only, con scorciatoia
--      "contatta" verso l'assegnatario)», e `chat/ConversationView.jsx` cita
--      il prefill «da "contatta agente" su urgenti altrui». Per admin e
--      manager il ramo `isUrgent` è ininfluente (is_manager_or_admin() dà loro
--      tutto comunque) e il driver non lo raggiunge mai: resta ESATTAMENTE un
--      ruolo in cui quel ramo decide qualcosa, l'agent, ed è l'unico per cui
--      la riga non arrivava. La scorciatoia non è mai comparsa a nessuno.
--
--   2. `docs/SICUREZZA.md` §permessi affermava una capacità che il database
--      non concedeva, su tre colonne su cinque. È la stessa classe di difetto
--      di M-4 dell'audit del 15 agosto — «il commento è diventato la specifica
--      e ha già divergito dal database su una policy di sicurezza» —
--      sopravvissuta alla propria chiusura, stavolta nella tabella normativa.
--
-- LA DIREZIONE È UNA SCELTA DI PRODOTTO, ed è stata presa: si allarga il
-- database. La funzione era stata voluta tre volte (UI, documentazione, e il
-- prefill di un secondo modulo); il livello che non l'ha mai avuta è quello
-- che nessuno ha aggiornato, non quello che ha deciso di non averla.
--
-- ⚠️ SOLO SELECT. `tasks_update` NON acquista il ramo, e non è una svista: il
-- client dice già «urgente ≠ modificabile» — `canEditTask` non ha il ramo
-- `isUrgent`, e src/test/permissions.test.js lo asserisce per nome («urgente ≠
-- modificabile: si vede ma non si tocca»). Allargare anche l'UPDATE
-- trasformerebbe un allineamento in un ampliamento di privilegio.
--
-- ⚠️ LE RIGHE CESTINATE RESTANO FUORI, e su questo la policy è più stretta del
-- client: `canViewTask` non guarda `deletedAt` perché a monte le viste
-- filtrano con `getActiveTasks`, ma una policy non ha un chiamante di cui
-- fidarsi. Il Cestino è riservato agli admin (`tasks_delete` → is_admin), e
-- una task cestinata che ricomparisse ai colleghi perché la sua scadenza è
-- vicina sarebbe una visibilità che nessuno dei due livelli ha mai dichiarato.

-- ── 1. Il predicato di urgenza, nominato una volta ──────────────────────────
--
-- La finestra di 24 ore è la STESSA di `isUrgent` in src/lib/taskUtils.js
-- (`HOURS_24`, `diff >= 0 && diff <= HOURS_24`). Due numeri scritti in due
-- posti sono la premessa della prossima divergenza, e questo rilievo nasce
-- esattamente da lì: se cambia là, cambia qui — e viceversa.
--
-- Sta in `private` come tutti gli altri helper di autorizzazione
-- (is_manager_or_admin, can_view_global_queue, is_active_user): lo schema
-- `private` non è esposto da PostgREST, quindi la funzione non diventa una
-- rotta RPC. ⚠️ I file di migrazione più vecchi dichiarano questi helper in
-- `public`; in produzione vivono in `private` — verificato leggendo
-- pg_get_functiondef il 23 agosto. Vale la lettura del database, non quella
-- del repository.
--
-- STABLE e non IMMUTABLE: legge `now()`.
create or replace function private.is_urgent_task(p_due timestamptz, p_status text)
returns boolean
language sql
stable
-- ⚠️ `set search_path` aggiunto subito dopo dalla 20260822215520: senza,
-- l'advisor accende `function_search_path_mutable`, che non è in
-- AVVISI_ACCETTATI e avrebbe reso rosso verifica:advisor. Vedi quel file.
set search_path = ''
as $$
  select p_due is not null
     and p_status is distinct from 'done'
     and p_due >= now()
     and p_due <= now() + interval '24 hours';
$$;

revoke all on function private.is_urgent_task(timestamptz, text) from public, anon;
grant execute on function private.is_urgent_task(timestamptz, text) to authenticated;

-- ── 2. La policy, con il quinto ramo ────────────────────────────────────────
--
-- I primi quattro rami sono INVARIATI e trascritti da pg_policy in produzione,
-- non copiati dal file del 20260630075528 (che nomina gli helper in `public`).
--
-- Il quinto riusa `can_view_global_queue()` — admin, manager, agent, attivi e
-- non pending — invece di scrivere un nuovo elenco di ruoli: è lo stesso
-- insieme che il client intende con «non-admin e non-driver», ed è già la
-- funzione che decide chi vede task non proprie. Un secondo elenco di ruoli
-- accanto al primo sarebbe la prossima cosa da tenere allineata a mano.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select private.is_manager_or_admin())
    or (select auth.uid()) = any(assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select private.can_view_global_queue()))
    -- A-1: le urgenti altrui, agli stessi ruoli che già vedono la coda
    -- globale. `deleted_at is null` per il motivo scritto in cima.
    or (
      deleted_at is null
      and private.is_urgent_task(due_date, status)
      and (select private.can_view_global_queue())
    )
  );
