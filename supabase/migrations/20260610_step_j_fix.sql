-- Step J — Fix post-applicazione
-- 1. Grant EXECUTE su is_manager_or_admin ai ruoli authenticated/anon
--    (era usata in RLS policies ma non eseguibile da utenti loggati →
--     "permission denied for function is_manager_or_admin" su INSERT/UPDATE tasks)
-- 2. Allinea notify_queue_stale ai ruoli realmente presenti in users
--    (lowercase: 'manager','admin'; rimosso 'Senior Agent' inesistente)
--
-- ⚠️ MIGRAZIONE OUT-OF-BAND (Step R, caveat #19): applicata al DB ma NON registrata
-- in supabase_migrations.schema_migrations. Conservata per ricostruibilità del repo.
-- Supersedes la def di `notify_queue_stale` in `20260610_notifications_extra.sql`
-- (ruoli capitalizzati). Nessun fix #1 separato esiste ancora come file (in DB era
-- coperto da `grant_execute_is_admin_step_j_fix2`, recuperato in Step R).

-- ── 1. Grant execute ───────────────────────────────────────────────────────
do $$
begin
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname = 'is_manager_or_admin' and n.nspname = 'public'
  ) then
    execute 'grant execute on function public.is_manager_or_admin() to authenticated, anon';
  end if;
end $$;

-- ── 2. notify_queue_stale: ruoli lowercase ────────────────────────────────
create or replace function public.notify_queue_stale() returns void
language plpgsql security definer set search_path = public
as $$
declare
  t record;
  uid uuid;
begin
  for t in
    select id, title, created_at
    from public.tasks
    where deleted_at is null
      and status = 'todo'
      and (assignees is null or array_length(assignees, 1) is null)
      and created_at < now() - interval '4 hours'
  loop
    for uid in
      select id from public.users
      where active = true
        and pending = false
        and lower(role) in ('manager', 'admin')
    loop
      if not exists (
        select 1 from public.notifications
        where user_id = uid
          and type = 'queue_stale'
          and payload->>'task_id' = t.id::text
          and created_at > now() - interval '4 hours'
      ) then
        insert into public.notifications (user_id, type, payload)
        values (
          uid,
          'queue_stale',
          jsonb_build_object(
            'task_id', t.id,
            'task_title', t.title,
            'stale_since', t.created_at
          )
        );
      end if;
    end loop;
  end loop;
end $$;
