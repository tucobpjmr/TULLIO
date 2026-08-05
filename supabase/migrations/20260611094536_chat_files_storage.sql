-- Step M: storage reale per gli allegati chat (caveat #7).
-- Bucket privato 'chat-files' + colonna messages.file_url (path nel bucket).
-- Path convention: <conversation_id>/<uuid>-<nomefile>
-- Le policy su storage.objects derivano l'autorizzazione dal primo segmento
-- del path (= conversation_id) confrontandolo con i partecipanti.

-- 1. Colonna path storage sul messaggio (file_name/file_size/file_type esistono già)
alter table public.messages add column if not exists file_url text;

-- 2. Bucket privato, limite 25 MB per file
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-files', 'chat-files', false, 26214400)
on conflict (id) do nothing;

-- 3. Lettura: solo partecipanti della conversazione (o admin)
drop policy if exists "chat_files_select" on storage.objects;
create policy "chat_files_select" on storage.objects
for select to authenticated
using (
  bucket_id = 'chat-files'
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and ((select auth.uid()) = any (c.participants) or (select public.is_admin()))
  )
);

-- 4. Upload: solo partecipanti della conversazione
drop policy if exists "chat_files_insert" on storage.objects;
create policy "chat_files_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'chat-files'
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (select auth.uid()) = any (c.participants)
  )
);

-- 5. Delete: solo chi ha caricato il file (owner) o admin
drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'chat-files'
  and (owner_id = (select auth.uid())::text or (select public.is_admin()))
);
