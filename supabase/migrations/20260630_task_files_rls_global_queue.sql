-- Allinea la visibilita'/gestione degli ALLEGATI alla visibilita' delle TASK.
--
-- Contesto: con 20260630_tasks_global_queue_agent_visibility (PR #87) gli agenti
-- (Senior Agent) vedono e possono prendere in carico le task in coda globale
-- (assignees vuoti). Le policy di public.task_files e degli oggetti storage del
-- bucket 'task-files', pero', erano rimaste ferme a:
--   is_manager_or_admin() OR auth.uid() = ANY(t.assignees) OR t.created_by = auth.uid()
-- Conseguenza: per una task in coda globale (assignees vuoti) un agente
-- non-creatore NON soddisfa nessuna condizione -> gli allegati risultano
-- visibili SOLO a manager/admin. Inoltre il DELETE era ristretto al solo
-- uploader (o admin): un assegnatario non poteva eliminare allegati caricati
-- da altri sulla propria task (coda personale).
--
-- Fix: le policy degli allegati rispecchiano ora esattamente l'accesso alla
-- task (stessa espressione di tasks_select/tasks_update post #87):
--   - SELECT (visualizza): chiunque possa vedere la task, inclusa la coda
--     globale per gli utenti non-driver -> requisito "allegati coda globale
--     visibili a tutti gli utenti autorizzati".
--   - INSERT (carica/modifica) e DELETE (elimina): chiunque possa gestire la
--     task: assegnatari (coda personale), creatore, manager/admin e agenti
--     sulla coda globale -> requisito "in coda personale l'utente puo'
--     visualizzare, eliminare e/o modificare gli allegati". Il DELETE mantiene
--     anche il fallback per l'uploader (puo' sempre rimuovere cio' che ha
--     caricato), e per lo storage l'owner dell'oggetto.
--
-- I driver restano esclusi dalla coda globale (coerente con can_view_global_queue),
-- ma continuano a gestire gli allegati delle task in cui sono assegnatari.

-- ── Tabella metadati public.task_files ───────────────────────────────────────
drop policy if exists task_files_select on public.task_files;
create policy task_files_select on public.task_files
for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (
      public.is_manager_or_admin()
      or (select auth.uid()) = any(t.assignees)
      or t.created_by = (select auth.uid())
      or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
    )
));

drop policy if exists task_files_insert on public.task_files;
create policy task_files_insert on public.task_files
for insert to authenticated
with check (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (
      public.is_manager_or_admin()
      or (select auth.uid()) = any(t.assignees)
      or t.created_by = (select auth.uid())
      or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
    )
));

drop policy if exists task_files_delete on public.task_files;
create policy task_files_delete on public.task_files
for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  or exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (
        public.is_manager_or_admin()
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
      )
  )
);

-- ── Oggetti storage (bucket 'task-files', task_id = primo segmento del path) ──
drop policy if exists "task_files_storage_select" on storage.objects;
create policy "task_files_storage_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'task-files'
  and exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[1]
      and (
        public.is_manager_or_admin()
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
      )
  )
);

drop policy if exists "task_files_storage_insert" on storage.objects;
create policy "task_files_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'task-files'
  and exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[1]
      and (
        public.is_manager_or_admin()
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
      )
  )
);

drop policy if exists "task_files_storage_delete" on storage.objects;
create policy "task_files_storage_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'task-files'
  and (
    owner_id = (select auth.uid())::text
    or exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1]
        and (
          public.is_manager_or_admin()
          or (select auth.uid()) = any(t.assignees)
          or t.created_by = (select auth.uid())
          or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
        )
    )
  )
);
