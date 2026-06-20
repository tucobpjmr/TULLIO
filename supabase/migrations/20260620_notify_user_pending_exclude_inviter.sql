-- Sessione 29 cleanup: notify_user_pending esclude l'admin che ha lanciato
-- l'invito tramite Edge Function. Oggi il trigger notifica TUTTI gli admin
-- attivi (filtra solo NEW.id), inclusa la persona che ha invitato → rumore
-- gratuito nel pannello notifiche dell'admin.
--
-- Idea: la EF (e in subordine il signup self-service) può marcare il row con
-- `invited_by = caller.uid`. Il trigger esclude quel UID dalla lista
-- destinatari. Per il signup self-service `invited_by` resta NULL → si
-- notificano tutti gli admin (comportamento corrente).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE.

-- ── 1. Colonna invited_by su public.users ───────────────────────────────────
-- ON DELETE SET NULL così la rimozione dell'admin non viola la FK degli
-- utenti che ha invitato (cronologia conservata, link perso).
alter table public.users
  add column if not exists invited_by uuid
  references public.users(id) on delete set null;

-- ── 2. handle_new_auth_user: passa invited_by dai meta nell'INSERT ──────────
-- meta->>'invited_by' arriva da auth.admin.inviteUserByEmail(data:{invited_by})
-- nella EF. Su signup self-service il meta non lo contiene → invited_by NULL.
create or replace function public.handle_new_auth_user() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  meta     jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  uname    text;
  urole    text;
  ucap     int;
  ucol     text;
  uavat    text;
  uinviter uuid;
  parts    text[];
begin
  uname := coalesce(meta->>'name', split_part(NEW.email, '@', 1));
  urole := case when meta->>'role' in ('admin','manager','agent','driver')
                then meta->>'role' else 'agent' end;
  ucap  := coalesce((meta->>'capacity')::int, 8);
  ucol  := coalesce(meta->>'color', '#3B82F6');
  -- NULLIF perché meta->>'invited_by' può essere '' o stringa non-UUID.
  -- Cast esplicito uuid: se la stringa è invalida solleva → la EF deve
  -- mandare sempre un UUID valido (lo è: prende user.id verificato dal JWT).
  uinviter := nullif(meta->>'invited_by', '')::uuid;
  select array_agg(word) into parts from unnest(string_to_array(uname, ' ')) as word;
  uavat := upper(left(coalesce(parts[1], ''), 1) ||
                 left(coalesce(parts[2], right(coalesce(parts[1], '  '), 1)), 1));
  insert into public.users (id, name, role, avatar, color, capacity, pending, active, invited_by)
  values (NEW.id, uname, urole, uavat, ucol, ucap, true, false, uinviter)
  on conflict (id) do nothing;
  insert into public.user_contacts (user_id, email)
  values (NEW.id, NEW.email)
  on conflict (user_id) do nothing;
  return NEW;
end; $$;

-- Trigger su auth.users invariato (già installato da
-- 20260619_security_dedupe_signup_trigger): non lo ridichiariamo qui.

-- ── 3. notify_user_pending: esclude l'invitante ─────────────────────────────
create or replace function public.notify_user_pending() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid;
begin
  if NEW.pending is not true then
    return NEW;
  end if;

  for uid in
    select id from public.users
    where active = true
      and pending = false
      and lower(role) = 'admin'
      and id <> NEW.id
      and id is distinct from NEW.invited_by   -- esclude l'admin che ha invitato
  loop
    insert into public.notifications (user_id, type, payload)
    values (uid, 'user_pending', jsonb_build_object(
      'user_id',   NEW.id,
      'user_name', NEW.name,
      'user_role', NEW.role
    ));
  end loop;

  return NEW;
end $$;

revoke all on function public.notify_user_pending() from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
