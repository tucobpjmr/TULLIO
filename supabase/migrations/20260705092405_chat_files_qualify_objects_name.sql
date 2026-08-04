-- Fix: le policy chat_files_* (20260611) usavano storage.foldername(name)
-- non qualificato dentro l'EXISTS su conversations c → Postgres lo risolveva
-- su c.name (colonna della subquery) invece che su storage.objects.name, e il
-- gate per-conversazione non matchava mai. Ricreate con objects.name
-- qualificato (stesso pattern di task_files_*). La delete include anche il
-- ramo "partecipante della conversazione" per il cleanup allegati quando si
-- elimina una conversazione/gruppo.

drop policy if exists "chat_files_select" on storage.objects;
create policy "chat_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-files'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and ((select auth.uid()) = any (c.participants) or (select public.is_admin()))
    )
  );

drop policy if exists "chat_files_insert" on storage.objects;
create policy "chat_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-files'
    and exists (
      select 1 from public.conversations c
      where c.id::text = (storage.foldername(objects.name))[1]
        and (select auth.uid()) = any (c.participants)
    )
  );

drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      owner_id = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.conversations c
        where c.id::text = (storage.foldername(objects.name))[1]
          and (select auth.uid()) = any (c.participants)
      )
    )
  );
