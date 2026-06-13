-- 2026-06-13 — FIX: spunte di lettura e reactions non si persistevano
--
-- Problema: l'unica policy UPDATE su public.messages era messages_update_own
--   (sender_id = auth.uid() OR is_admin()). Marcare come letto un messaggio
--   ricevuto, o reagire ad esso, richiede di aggiornare read_by/reactions su un
--   messaggio inviato da ALTRI → la RLS bloccava l'UPDATE (0 righe), quindi
--   markRead / markReadBulk / setReactions erano silenziosamente inefficaci per
--   i messaggi ricevuti.
--
-- Soluzione:
--   1) Policy messages_update_participant: un partecipante della conversazione
--      può eseguire UPDATE sui messaggi di quella conversazione.
--   2) Trigger di guardia: per chi NON è il mittente (né admin) ripristina ai
--      valori OLD tutte le colonne tranne read_by, reactions e origin_client,
--      così un partecipante può solo segnare la lettura / reagire, MA non può
--      alterare il testo o gli allegati dei messaggi altrui.
--
--   La RLS non può limitare le colonne in una policy, perciò il vincolo di
--   colonna è imposto dal trigger (stesso pattern usato per public.users).

-- ── 1. Policy: i partecipanti possono aggiornare i messaggi della conv ─────
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

-- ── 2. Trigger di guardia colonne ──────────────────────────────────────────
create or replace function public.messages_guard_participant_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Il mittente e gli admin possono modificare qualsiasi campo.
  if old.sender_id = (select auth.uid()) or public.is_admin() then
    return new;
  end if;

  -- Altri partecipanti: consentite solo read_by, reactions e origin_client
  -- (quest'ultima serve al filtro echo realtime). Tutto il resto torna a OLD.
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
