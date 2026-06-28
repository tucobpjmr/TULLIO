-- Hardening difesa-in-profondità: gate is_active_user() esplicito su storage e
-- sull'RPC messages_mark_read.
--
-- Stato attuale: gli utenti inattivi/pending sono GIÀ bloccati indirettamente —
-- le policy storage (task-files/chat-files) e l'RPC (security invoker) leggono
-- tasks/conversations/messages, tabelle protette da una policy RESTRICTIVE
-- rls_active_only (migrazione 20260621). Questa migrazione rende la difesa
-- ESPLICITA e robusta a refactor futuri (es. se un domani la subquery cambia).

-- ── 1. Storage: blocca gli inattivi sui due bucket privati ───────────────────
-- RESTRICTIVE → AND-ata con le policy permissive esistenti. Il guard
-- `bucket_id not in (...)` lascia intatti eventuali altri bucket (es. avatar).
drop policy if exists "storage_active_only" on storage.objects;
create policy "storage_active_only" on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id not in ('task-files', 'chat-files')
    or public.is_active_user()
  )
  with check (
    bucket_id not in ('task-files', 'chat-files')
    or public.is_active_user()
  );

-- ── 2. RPC messages_mark_read: blocca gli utenti inattivi ────────────────────
-- Aggiunge un guard esplicito rispetto alla versione 20260612: solo utenti
-- attivi possono marcare letto. (NB: non vincoliamo reader_id ad auth.uid()
-- perché in dev lo switcher utente può impersonare un membro del team con
-- currentUserId diverso dalla sessione auth — la RLS su messages già limita
-- l'UPDATE alle sole righe visibili al chiamante.)
create or replace function public.messages_mark_read(
  conv_id uuid,
  reader_id uuid,
  origin uuid default null
)
returns integer
language plpgsql
security invoker
as $$
declare
  affected integer;
begin
  if not public.is_active_user() then
    raise exception 'User is not active';
  end if;

  update public.messages
  set read_by = read_by || reader_id,
      origin_client = origin
  where conversation_id = conv_id
    and sender_id <> reader_id
    and not (reader_id = any(read_by));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.messages_mark_read(uuid, uuid, uuid) to authenticated;
