-- Correzione di 20260707_advisor_definer_and_search_path_hardening.sql.
--
-- Le helper RLS SECURITY DEFINER (is_admin, is_manager_or_admin,
-- can_view_global_queue) NON possono essere revocate da 'authenticated': la
-- valutazione delle RLS policy richiede comunque EXECUTE al ruolo chiamante
-- ("permission denied for function ..." altrimenti). Le spostiamo quindi in
-- schema 'private' (non esposto da PostgREST) mantenendo il grant a
-- 'authenticated', esattamente come is_active_user. Idempotente: sposta solo se
-- la funzione è ancora in public (così è un no-op se già spostata).

do $$
declare fn text;
begin
  foreach fn in array array['is_admin','is_manager_or_admin','can_view_global_queue']
  loop
    if exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='public' and p.proname=fn) then
      execute format('alter function public.%I() set schema private', fn);
    end if;
  end loop;
end $$;

revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_manager_or_admin() from public, anon;
revoke all on function private.can_view_global_queue() from public, anon;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_manager_or_admin() to authenticated;
grant execute on function private.can_view_global_queue() to authenticated;

-- I due trigger SECURITY DEFINER che chiamano is_admin() vanno ripuntati su
-- private.is_admin() (girano come owner 'postgres', che mantiene l'accesso a
-- private). Solo cambio di riferimento, logica invariata.
create or replace function public.messages_guard_participant_update()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if old.sender_id = (select auth.uid()) or private.is_admin() then
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
$fn$;

create or replace function public.users_block_privileged_self_update()
returns trigger language plpgsql security definer set search_path to 'public'
as $fn$
begin
  if private.is_admin() then
    return new;
  end if;
  new.role     := old.role;
  new.active   := old.active;
  new.pending  := old.pending;
  new.capacity := old.capacity;
  new.id       := old.id;
  return new;
end;
$fn$;
