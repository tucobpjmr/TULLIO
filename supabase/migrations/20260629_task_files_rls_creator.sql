-- Allegati task: allinea la visibilità dei file alla visibilità del task.
--
-- Problema: le policy di public.task_files (e degli oggetti storage del bucket
-- 'task-files') autorizzavano SELECT/INSERT solo a manager/admin o agli
-- assegnatari del task:
--   is_manager_or_admin() OR auth.uid() = ANY(t.assignees)
-- mentre tasks_select consente anche al CREATORE del task:
--   is_manager_or_admin() OR auth.uid() = ANY(assignees) OR created_by = auth.uid()
--
-- Conseguenza: un agente che crea un task in coda globale (assignees vuoti)
-- vede il task ma NON i suoi allegati — dopo un reload il file sembrava "non
-- persistere" (in realtà la riga è nel DB, ma la RLS la nascondeva al creatore).
-- Stesso buco sull'INSERT: il creatore non assegnatario non poteva ricaricare.
--
-- Fix: aggiungo `t.created_by = auth.uid()` a SELECT e INSERT, sia sulla tabella
-- metadati sia sugli oggetti storage, così la visibilità degli allegati
-- rispecchia esattamente quella del task. DELETE resta invariato (uploader o
-- admin).

-- ── Tabella metadati public.task_files ──
drop policy if exists task_files_select on public.task_files;
create policy task_files_select on public.task_files
for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (public.is_manager_or_admin()
         or (select auth.uid()) = any(t.assignees)
         or t.created_by = (select auth.uid()))
));

drop policy if exists task_files_insert on public.task_files;
create policy task_files_insert on public.task_files
for insert to authenticated
with check (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (public.is_manager_or_admin()
         or (select auth.uid()) = any(t.assignees)
         or t.created_by = (select auth.uid()))
));

-- ── Oggetti storage (bucket 'task-files', task_id = primo segmento del path) ──
drop policy if exists "task_files_storage_select" on storage.objects;
create policy "task_files_storage_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'task-files'
  and exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[1]
      and (public.is_manager_or_admin()
           or (select auth.uid()) = any(t.assignees)
           or t.created_by = (select auth.uid()))
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
      and (public.is_manager_or_admin()
           or (select auth.uid()) = any(t.assignees)
           or t.created_by = (select auth.uid()))
  )
);
