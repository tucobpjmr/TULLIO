-- Fase 2 — Notifiche pratiche (dossiers)
-- 1. Trigger su UPDATE OF status → notifica 'dossier_status' a created_by + manager/admin (escluso l'attore)
-- 2. pg_cron giornaliero notify_dossier_departure → pratiche con partenza nei prossimi 3 giorni
--
-- STATO: applicato via apply_migration MCP il 14/6/2026; questo file è per
--        version control.
--
-- Pattern identico alle notifiche task (Step F/J): le notifiche nascono SOLO da
-- trigger/funzioni server-side (RLS vieta l'insert dal client). SECURITY DEFINER
-- per poter inserire bypassando la policy "own notifications".
-- Destinatari: manager + admin attivi non-pending, più il created_by della pratica.

-- ── 1. Trigger cambio status pratica ────────────────────────────────────────
create or replace function public.notify_dossier_status() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  uid   uuid;
begin
  if NEW.status is not distinct from OLD.status then
    return NEW;
  end if;

  for uid in
    select u.id from public.users u
    where u.active = true and u.pending = false and u.role in ('manager','admin')
    union
    select NEW.created_by where NEW.created_by is not null
  loop
    -- niente auto-notifica a chi ha effettuato il cambio
    if actor is not null and uid = actor then
      continue;
    end if;
    insert into public.notifications (user_id, type, payload)
    values (uid, 'dossier_status', jsonb_build_object(
      'dossier_id', NEW.id,
      'dossier_number', NEW.number,
      'dossier_title', NEW.title,
      'old_status', OLD.status,
      'new_status', NEW.status
    ));
  end loop;

  return NEW;
end $$;

revoke all on function public.notify_dossier_status() from public, anon, authenticated;

drop trigger if exists trg_notify_dossier_status on public.dossiers;
create trigger trg_notify_dossier_status
  after update of status on public.dossiers
  for each row execute function public.notify_dossier_status();

-- ── 2. pg_cron: partenza imminente (giornaliero alle 07:00 UTC) ─────────────
-- Notifica 'dossier_departure' per pratiche confermate / in corso con partenza
-- nei prossimi 3 giorni. De-dup: salta se già notificato nelle ultime 20h.
create or replace function public.notify_dossier_departure() returns void
language plpgsql security definer set search_path = public
as $$
declare
  d   record;
  uid uuid;
begin
  for d in
    select id, number, title, departure_date, created_by
    from public.dossiers
    where status in ('confermata','in_corso')
      and departure_date is not null
      and departure_date >= current_date
      and departure_date <= current_date + interval '3 days'
  loop
    for uid in
      select u.id from public.users u
      where u.active = true and u.pending = false and u.role in ('manager','admin')
      union
      select d.created_by where d.created_by is not null
    loop
      if not exists (
        select 1 from public.notifications
        where user_id = uid
          and type = 'dossier_departure'
          and payload->>'dossier_id' = d.id::text
          and created_at > now() - interval '20 hours'
      ) then
        insert into public.notifications (user_id, type, payload)
        values (uid, 'dossier_departure', jsonb_build_object(
          'dossier_id', d.id,
          'dossier_number', d.number,
          'dossier_title', d.title,
          'departure_date', d.departure_date
        ));
      end if;
    end loop;
  end loop;
end $$;

revoke all on function public.notify_dossier_departure() from public, anon, authenticated;

-- ── 3. Schedule pg_cron ─────────────────────────────────────────────────────
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'notify_dossier_departure_daily';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'notify_dossier_departure_daily',
    '0 7 * * *',
    $cron$ select public.notify_dossier_departure(); $cron$
  );
end $$;
