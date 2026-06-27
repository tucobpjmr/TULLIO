-- Block 5 — Allegati Task reali (prima esisteva solo un placeholder inerte in
-- TaskSlideOver). Tabella metadati public.task_files + bucket privato
-- 'task-files'. Le RLS rispecchiano la visibilità dei task: manager/admin
-- oppure assegnatario. Path convention: <task_id>/<uuid>-<nomefile> → le policy
-- su storage.objects derivano l'autorizzazione dal primo segmento (= task_id).
-- Fondazione comune per i Block 6 (OneDrive) e 7 (WhatsApp): entrambi
-- inseriranno righe con source diverso.

-- 1. Tabella metadati
create table if not exists public.task_files (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  file_name   text not null,
  file_size   bigint,
  file_type   text,
  file_url    text not null,                 -- path nel bucket task-files
  source      text not null default 'upload' -- 'upload' | 'onedrive' | 'whatsapp'
              check (source in ('upload','onedrive','whatsapp')),
  uploaded_by uuid references public.users(id),
  created_at  timestamptz not null default now()
);
create index if not exists task_files_task_id_idx on public.task_files(task_id);

alter table public.task_files enable row level security;

-- SELECT/INSERT: stessa logica di tasks_select (manager/admin o assegnatario)
drop policy if exists task_files_select on public.task_files;
create policy task_files_select on public.task_files
for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (public.is_manager_or_admin() or (select auth.uid()) = any(t.assignees))
));

drop policy if exists task_files_insert on public.task_files;
create policy task_files_insert on public.task_files
for insert to authenticated
with check (exists (
  select 1 from public.tasks t
  where t.id = task_id
    and (public.is_manager_or_admin() or (select auth.uid()) = any(t.assignees))
));

-- DELETE: chi ha caricato il file (uploaded_by) o un admin
drop policy if exists task_files_delete on public.task_files;
create policy task_files_delete on public.task_files
for delete to authenticated
using (uploaded_by = (select auth.uid()) or public.is_admin());

-- 2. Bucket privato (limite 25 MB per file)
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 26214400)
on conflict (id) do nothing;

-- 3. Policy su storage.objects (autorizzazione dal primo segmento = task_id)
drop policy if exists "task_files_storage_select" on storage.objects;
create policy "task_files_storage_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'task-files'
  and exists (
    select 1 from public.tasks t
    where t.id::text = (storage.foldername(name))[1]
      and (public.is_manager_or_admin() or (select auth.uid()) = any(t.assignees))
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
      and (public.is_manager_or_admin() or (select auth.uid()) = any(t.assignees))
  )
);

-- DELETE storage: solo chi ha caricato l'oggetto (owner) o admin
drop policy if exists "task_files_storage_delete" on storage.objects;
create policy "task_files_storage_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'task-files'
  and (owner_id = (select auth.uid())::text or public.is_admin())
);
