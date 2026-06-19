-- Notifica admin su nuova registrazione (user_pending) — Block 3
--
-- Quando un nuovo utente applicativo viene creato con pending=true
-- (self-service signup via handle_new_auth_user, oppure invito admin via
-- Edge Function invite-user), notifica TUTTI gli admin attivi non-pending
-- cosi' possono approvarlo dal pannello Team senza dover ricaricare a vuoto.
--
-- Pattern identico alle altre notifiche (task_assigned, queue_stale, ...):
-- le notifiche nascono SOLO da funzioni server-side (RLS vieta l'insert dal
-- client). SECURITY DEFINER per inserire bypassando la policy
-- "own notifications". Idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS.
--
-- Frontend: NOTIF_ICONS['user_pending']='👤', notifTitle() usa
-- payload.user_name (+ payload.user_role).

-- ── 1. Funzione ─────────────────────────────────────────────────────────────
create or replace function public.notify_user_pending() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid;
begin
  -- Solo per utenti realmente in attesa di approvazione.
  if NEW.pending is not true then
    return NEW;
  end if;

  for uid in
    select id from public.users
    where active = true
      and pending = false
      and lower(role) = 'admin'
      and id <> NEW.id            -- non notificare l'utente a se stesso
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

-- ── 2. Trigger AFTER INSERT su public.users ─────────────────────────────────
drop trigger if exists trg_notify_user_pending on public.users;
create trigger trg_notify_user_pending
  after insert on public.users
  for each row execute function public.notify_user_pending();
