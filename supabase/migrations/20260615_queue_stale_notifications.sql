-- Notifica coda globale stantia (queue_stale)
--
-- STATO: la funzione + il cron job erano gia' attivi sul progetto (creati
--        ad-hoc in sessione 22) ma NON tracciati in repo ne' in
--        supabase_migrations.schema_migrations. Questo file riallinea
--        repo <-> DB (stesso pattern di 20260614_dossier_notifications.sql).
--        Lo script e' idempotente: ricrea la funzione identica, revoca i
--        privilegi e ri-schedula il cron senza duplicarlo.
--
-- Cosa fa: ogni ora (cron 'notify_queue_stale_hourly', minuto :05) cerca i
-- task ancora in coda GLOBALE (nessun assegnatario) con status 'todo',
-- non cestinati, creati da piu' di 4 ore. Per ciascuno notifica i
-- manager/admin attivi non-pending con una notifica 'queue_stale'. De-dup 4h:
-- non rinotifica lo stesso task allo stesso utente entro 4 ore (con cron
-- orario => al massimo un promemoria ogni 4h finche' il task resta in coda).
--
-- Pattern identico alle altre notifiche (Step F/J, dossier): le notifiche
-- nascono SOLO da funzioni server-side (RLS vieta l'insert dal client).
-- SECURITY DEFINER per inserire bypassando la policy "own notifications".
-- Frontend: NOTIF_ICONS['queue_stale']='⏳', notifTitle() usa payload.task_id
-- (navigazione al task) + payload.task_title.

-- ── 1. Funzione ─────────────────────────────────────────────────────────────
create or replace function public.notify_queue_stale() returns void
language plpgsql security definer set search_path = public
as $$
declare
  t   record;
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
      where active = true and pending = false
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
        values (uid, 'queue_stale', jsonb_build_object(
          'task_id', t.id,
          'task_title', t.title,
          'stale_since', t.created_at
        ));
      end if;
    end loop;
  end loop;
end $$;

revoke all on function public.notify_queue_stale() from public, anon, authenticated;

-- ── 2. Schedule pg_cron (orario, minuto :05) ────────────────────────────────
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'notify_queue_stale_hourly';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'notify_queue_stale_hourly',
    '5 * * * *',
    $cron$ select public.notify_queue_stale(); $cron$
  );
end $$;
