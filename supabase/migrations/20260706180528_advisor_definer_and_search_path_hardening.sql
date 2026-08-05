-- Hardening dei warn residui degli advisor Supabase:
--   * 0029_authenticated_security_definer_function_executable
--   * 0011_function_search_path_mutable
--
-- Contesto verificato:
--  - La valutazione di una RLS policy RICHIEDE EXECUTE sulla funzione al ruolo
--    chiamante: revocare EXECUTE dalle helper usate nelle policy ROMPE la RLS
--    ("permission denied for function ..."). Quindi NON si revoca: si sposta la
--    funzione in uno schema 'private' non esposto da PostgREST (l'advisor guarda
--    solo gli schema esposti) mantenendo il grant a 'authenticated'. Le policy
--    continuano a funzionare perché vi fanno riferimento per OID, non per nome.
--  - is_active_user è anche chiamata DIRETTAMENTE da due RPC SECURITY INVOKER
--    (messages_mark_read, messages_toggle_reaction) che girano come
--    'authenticated': dopo lo spostamento vanno ripuntati su private.is_active_user().
--  - is_admin/is_manager_or_admin/can_view_global_queue: stesso trattamento
--    (spostamento in private) nella migrazione successiva
--    20260707_advisor_definer_move_helpers_to_private.sql.
--  - get_vapid_public_key è intenzionalmente richiamabile dal client (ritorna la
--    chiave PUBLICA per la Web Push): resta accessibile ad 'authenticated',
--    togliamo solo 'anon'/public (l'advisor continuerà a segnalarla: è voluto).

-- 1) Schema privato + spostamento di is_active_user.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.is_active_user() set schema private;
revoke all on function private.is_active_user() from public, anon;
grant execute on function private.is_active_user() to authenticated;

-- 2) Ripunta i due RPC su private.is_active_user() (solo cambio di riferimento,
--    logica invariata). messages_mark_read guadagna anche il search_path fisso.
create or replace function public.messages_mark_read(conv_id uuid, origin uuid default null)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  affected integer;
  reader uuid := (select auth.uid());
begin
  if not private.is_active_user() then
    raise exception 'User is not active';
  end if;

  update public.messages
  set read_by = read_by || reader,
      origin_client = origin
  where conversation_id = conv_id
    and sender_id <> reader
    and not (reader = any(read_by));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.messages_toggle_reaction(msg_id uuid, emoji text, origin uuid default null)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  uid text := (select auth.uid())::text;
  current_reactions jsonb;
  arr jsonb;
  next_reactions jsonb;
begin
  if not private.is_active_user() then
    raise exception 'User is not active';
  end if;

  select reactions into current_reactions
  from public.messages
  where id = msg_id
  for update;

  if not found then
    return null;
  end if;

  current_reactions := coalesce(current_reactions, '{}'::jsonb);
  arr := coalesce(current_reactions -> emoji, '[]'::jsonb);

  if arr @> to_jsonb(uid) then
    arr := arr - uid;
    if jsonb_array_length(arr) = 0 then
      next_reactions := current_reactions - emoji;
    else
      next_reactions := jsonb_set(current_reactions, array[emoji], arr);
    end if;
  else
    next_reactions := jsonb_set(current_reactions, array[emoji], arr || to_jsonb(uid), true);
  end if;

  update public.messages
  set reactions = next_reactions,
      origin_client = origin
  where id = msg_id;

  return next_reactions;
end;
$$;

-- 3) Le altre tre helper (is_admin, is_manager_or_admin, can_view_global_queue)
--    NON possono essere revocate da 'authenticated': la valutazione delle RLS
--    policy richiede comunque EXECUTE al ruolo chiamante. Vengono spostate in
--    schema 'private' (mantenendo il grant) dalla migrazione successiva
--    20260707_advisor_definer_move_helpers_to_private.sql — stesso approccio di
--    is_active_user qui sopra.

-- 4) get_vapid_public_key: solo utenti autenticati (mai anon).
revoke all on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_public_key() to authenticated;

-- 5) search_path immutabile sul trigger set_task_completed_at
--    (usa solo NEW/OLD/NOW()/TG_OP → sicuro con search_path vuoto).
alter function public.set_task_completed_at() set search_path = '';
