-- Estende la RLS messages: i partecipanti alla conversazione possono aggiornare
-- i messaggi (per read_by e reactions) senza essere il sender.
-- Un trigger BEFORE UPDATE impedisce modifiche ai campi non-lettura.
-- Versione DB: 20260613092421
drop policy if exists messages_update_participant on public.messages;
create policy messages_update_participant on public.messages
for update to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (select auth.uid()) = any (c.participants)
  )
)
with check (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (select auth.uid()) = any (c.participants)
  )
);

create or replace function public.messages_guard_participant_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.sender_id = (select auth.uid()) or public.is_admin() then
    return new;
  end if;
  new.id              := old.id;
  new.conversation_id := old.conversation_id;
  new.sender_id       := old.sender_id;
  new.type            := old.type;
  new.text            := old.text;
  new.file_name       := old.file_name;
  new.file_size       := old.file_size;
  new.file_type       := old.file_type;
  new.file_url        := old.file_url;
  new.duration        := old.duration;
  new.waveform        := old.waveform;
  new.reply_to        := old.reply_to;
  new.task_ref        := old.task_ref;
  new.created_at      := old.created_at;
  return new;
end;
$$;

drop trigger if exists trg_messages_guard_participant_update on public.messages;
create trigger trg_messages_guard_participant_update
  before update on public.messages
  for each row execute function public.messages_guard_participant_update();
