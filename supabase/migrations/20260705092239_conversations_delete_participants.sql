-- Eliminazione conversazioni/gruppi da parte degli utenti.
-- Prima solo gli admin potevano cancellare una conversazione
-- (conversations_delete: is_admin). Ora ogni partecipante può eliminare le
-- proprie conversazioni dirette e i gruppi di cui fa parte; i messaggi
-- seguono via FK ON DELETE CASCADE (schema iniziale).

drop policy if exists conversations_delete on public.conversations;
create policy conversations_delete on public.conversations
  for delete to authenticated
  using ((select auth.uid()) = any(participants) or (select public.is_admin()));

-- Storage 'chat-files': il cleanup degli allegati della conversazione deve
-- poter essere fatto da CHI ELIMINA la conversazione, non solo dall'owner
-- del singolo file — altrimenti i file caricati dagli altri partecipanti
-- resterebbero orfani nel bucket. Il primo segmento del path è la
-- conversation_id (convenzione Step M), quindi il gate resta scoped alla
-- conversazione di cui si è partecipanti.
--
-- FIX LATENTE (scoperto qui): le policy chat_files_* originali (20260611)
-- usavano `storage.foldername(name)` NON qualificato dentro l'EXISTS su
-- `conversations c` — Postgres risolveva `name` sulla colonna della subquery
-- (c.name, il nome visuale della conversazione) e non su storage.objects.name.
-- Il confronto `c.id::text = foldername(c.name)[1]` non è mai vero, quindi il
-- gate per-conversazione non ha mai matchato. Qui vengono ricreate TUTTE e tre
-- le policy con `objects.name` qualificato (stesso pattern di task_files_*).

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
