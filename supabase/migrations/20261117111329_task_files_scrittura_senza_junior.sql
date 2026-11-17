-- ─── M-2 dell'analisi del 16 novembre · allegati dei task: il Junior non li scrive in coda globale
--
-- È il «seguito aperto» di 20261106170100_tasks_update_coda_globale_senza_junior
-- (docs/SICUREZZA.md §4).
--
-- COSA SI ROMPEVA.
--   1. Il ramo coda globale di `task_files_insert`, `task_files_delete`,
--      `task_files_storage_insert` e `task_files_storage_delete` usava
--      `private.can_view_global_queue()`, che non guarda la seniority: un
--      Junior caricava e cancellava allegati dei task non assegnati, che il
--      client (`canEditTask`) e `tasks_update` gli negano.
--   2. `task_files_insert` non legava `uploaded_by` al chiamante: si poteva
--      caricare un allegato a nome di un collega. E `task_files_delete` lascia
--      cancellare a `uploaded_by = auth.uid()`, quindi si poteva anche
--      consegnargli il diritto di cancellarlo.
--
-- COSA FA ORA. Il ramo coda globale delle quattro policy di SCRITTURA passa da
-- `private.can_take_global_queue()` (admin, manager, agent Senior). In
-- `task_files_insert`, `uploaded_by` è NULL o il chiamante. L'app passa sempre
-- `currentUserId` (TaskAttachments.jsx, lib/tasks/allegatiInCreazione.js).
--
-- ⛔ NON cambia la LETTURA: `task_files_select` e `task_files_storage_select`
-- restano su `can_view_global_queue()`. Restano anche i rami «l'ho caricato
-- io» del DELETE (`uploaded_by`, `owner_id` dello storage).
--
-- Il caso che lo lega al database è in src/test/integration/rlsChatAllegatiCommenti.test.js
-- («Allegati in coda globale — il Junior li vede ma non li scrive»).
--
-- Idempotente: `drop policy if exists` prima del `create`.

-- ── public.task_files ───────────────────────────────────────────────────────
drop policy if exists task_files_insert on public.task_files;
create policy task_files_insert on public.task_files
for insert to authenticated
with check (
  (uploaded_by is null or uploaded_by = (select auth.uid()))
  and exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (
        (select private.is_manager_or_admin())
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select private.can_take_global_queue()))
      )
  )
);

drop policy if exists task_files_delete on public.task_files;
create policy task_files_delete on public.task_files
for delete to authenticated
using (
  uploaded_by = (select auth.uid())
  or exists (
    select 1 from public.tasks t
    where t.id = task_id
      and (
        (select private.is_manager_or_admin())
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select private.can_take_global_queue()))
      )
  )
);

-- ── storage.objects (bucket 'task-files', task_id = primo segmento del path) ─
drop policy if exists "task_files_storage_insert" on storage.objects;
create policy "task_files_storage_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'task-files'
  and exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[1]
      and (
        (select private.is_manager_or_admin())
        or (select auth.uid()) = any(t.assignees)
        or t.created_by = (select auth.uid())
        or (cardinality(t.assignees) = 0 and (select private.can_take_global_queue()))
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
          (select private.is_manager_or_admin())
          or (select auth.uid()) = any(t.assignees)
          or t.created_by = (select auth.uid())
          or (cardinality(t.assignees) = 0 and (select private.can_take_global_queue()))
        )
    )
  )
);
