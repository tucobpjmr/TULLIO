-- Due gap RLS emersi da un'analisi di sicurezza indipendente, sullo stesso
-- pattern già visto e corretto più volte (visibilità del figlio disallineata
-- da quella del padre / gate "solo utenti attivi" non propagato a una tabella
-- creata dopo il gate stesso).

-- ── 1. comments_insert: nessun controllo sulla task padre ────────────────────
--
-- comments_insert (20260605160836_hardening_advisors_fix.sql) verifica solo
-- `user_id = auth.uid()`, mai la task referenziata. comments_select (fixata in
-- 20260630_comments_rls_global_queue.sql) e task_files_insert (fixata in
-- 20260630_task_files_rls_global_queue.sql) richiedono invece che l'utente
-- possa vedere/gestire la task (manager/admin, assegnatario, creatore, o coda
-- globale). Conseguenza: qualunque utente attivo può inserire un commento su
-- QUALSIASI task_id, anche una task che non potrà mai leggere via SELECT (es.
-- intercettato da `messages.task_ref` in una chat a cui non partecipa). Il
-- commento risulterebbe comunque visibile a chi la task la vede davvero
-- (assegnatari/manager), quindi non è un data-leak diretto, ma è un bypass
-- del modello di autorizzazione lato DB.
--
-- Fix: stessa espressione di comments_select/task_files_insert.
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.tasks t
    where t.id = comments.task_id
      and (
        public.is_manager_or_admin()
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
      )
  )
);

-- ── 2. task_files / task_history esclusi dal gate "solo utenti attivi" ───────
--
-- 20260621_rls_hardening_active_users.sql introduce una policy RESTRICTIVE
-- "rls_active_only" (AND-ata a tutte le altre) su tasks/comments/notices/
-- notifications/conversations/messages/user_contacts, per bloccare ogni
-- operazione di utenti active=false/pending con un'unica regola centrale.
-- public.task_files è creata lo stesso giorno (20260621_task_files.sql) ma
-- non l'ha mai ricevuta; public.task_history (20260701_task_history.sql) è
-- arrivata dopo e nemmeno lei. Le clausole `auth.uid() = ANY(t.assignees)` /
-- `t.created_by = auth.uid()` delle rispettive policy non controllano
-- `active`: un utente disattivato da un admin che resti assegnatario/creatore
-- di un task può continuare a leggere/caricare/eliminare i suoi allegati, e
-- a leggerne lo storico.
alter table public.task_files enable row level security;
drop policy if exists "rls_active_only" on public.task_files;
create policy "rls_active_only" on public.task_files
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

alter table public.task_history enable row level security;
drop policy if exists "rls_active_only" on public.task_history;
create policy "rls_active_only" on public.task_history
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());
