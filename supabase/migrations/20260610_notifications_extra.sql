-- Step J — Notifiche complete
-- Estende il sistema notifiche introdotto in Step F con:
--   1. Trigger su `comments` → notifica `comment` agli assignee + `mention` ai @nominati
--   2. Anti-eco su task_assigned: l'auto-assegnazione non genera notifica (caveat #1)
--   3. pg_cron giornaliero `notify_task_due`: task con due_date nelle prossime 24h
--   4. pg_cron orario `notify_queue_stale`: task in coda globale da > 4h
--
-- Dipendenze: tabella `public.notifications` (Step F), `public.tasks`, `public.comments`, `public.users`.
--
-- ⚠️  STATO: applicato via execute_sql MCP (non tracciato in supabase_migrations).
--     La funzione notify_queue_stale definita qui (riga ~195) usa ruoli con casing
--     errato ('Manager', 'Admin', 'Senior Agent') — STALE, superseded da
--     20260610_step_j_fix.sql che la riscrive con lowercase ('manager','admin').

-- ── Estensioni necessarie ──────────────────────────────────────────────────
create extension if not exists pg_cron;

-- ── 1. Fix anti-eco su task_assigned ───────────────────────────────────────
-- Sostituisce la funzione precedente per escludere l'utente che effettua
-- l'auto-assegnazione (TG context: auth.uid()).
create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  added uuid[];
  uid   uuid;
  actor uuid := auth.uid();
begin
  if TG_OP = 'INSERT' then
    added := coalesce(NEW.assignees, ARRAY[]::uuid[]);
  elsif TG_OP = 'UPDATE' then
    select array(
      select x::uuid
      from unnest(coalesce(NEW.assignees, ARRAY[]::uuid[])) as x
      where x::uuid <> all (coalesce(OLD.assignees, ARRAY[]::uuid[]))
    ) into added;
  else
    return NEW;
  end if;

  if added is null or array_length(added, 1) is null then
    return NEW;
  end if;

  foreach uid in array added loop
    -- skip self-assignment (auto-presa in carico)
    if actor is not null and uid = actor then
      continue;
    end if;
    insert into public.notifications (user_id, type, payload)
    values (
      uid,
      'task_assigned',
      jsonb_build_object(
        'task_id', NEW.id,
        'task_title', NEW.title,
        'due_date', NEW.due_date
      )
    );
  end loop;

  return NEW;
end $$;

-- ── 2. Trigger comment → notifiche assignee + mention ──────────────────────
-- Per ogni nuovo commento:
--   - notifica `comment` ad ogni assignee (escluso l'autore del commento)
--   - parser regex @nome → notifica `mention` per ogni utente menzionato
--     (match case-insensitive sul campo users.name; se più match si prende il primo)
create or replace function public.notify_task_comment() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task        record;
  v_assignee    uuid;
  v_mention_re  text := '@([\w'''.\-]+(?:\s+[\w'''.\-]+)?)';
  v_mention     text;
  v_mention_id  uuid;
  v_notified    uuid[] := ARRAY[]::uuid[];
begin
  select id, title, assignees into v_task
  from public.tasks
  where id = NEW.task_id;

  if v_task.id is null then
    return NEW;
  end if;

  -- 2a. mention parser: estrai tutte le @nome dal testo (case-insensitive)
  for v_mention in
    select (regexp_matches(coalesce(NEW.text, ''), v_mention_re, 'gi'))[1]
  loop
    select id into v_mention_id
    from public.users
    where active = true
      and lower(name) like lower(v_mention) || '%'
    order by length(name) asc
    limit 1;

    if v_mention_id is not null
       and v_mention_id <> NEW.user_id
       and v_mention_id <> all (v_notified)
    then
      insert into public.notifications (user_id, type, payload)
      values (
        v_mention_id,
        'mention',
        jsonb_build_object(
          'task_id', v_task.id,
          'task_title', v_task.title,
          'where', 'commento',
          'by_user_id', NEW.user_id,
          'comment_id', NEW.id
        )
      );
      v_notified := array_append(v_notified, v_mention_id);
    end if;
  end loop;

  -- 2b. notifica `comment` ad ogni assignee (escluso autore + già menzionati)
  if v_task.assignees is not null then
    foreach v_assignee in array v_task.assignees loop
      if v_assignee <> NEW.user_id
         and v_assignee <> all (v_notified)
      then
        insert into public.notifications (user_id, type, payload)
        values (
          v_assignee,
          'comment',
          jsonb_build_object(
            'task_id', v_task.id,
            'task_title', v_task.title,
            'by_user_id', NEW.user_id,
            'comment_id', NEW.id
          )
        );
        v_notified := array_append(v_notified, v_assignee);
      end if;
    end loop;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_notify_task_comment on public.comments;
create trigger trg_notify_task_comment
  after insert on public.comments
  for each row execute function public.notify_task_comment();

-- ── 3. pg_cron: notify_task_due (giornaliero alle 08:00 UTC) ───────────────
-- Genera una notifica `task_due` per ogni assignee di task la cui due_date
-- cade nelle prossime 24h (e non è ancora completata o cestinata).
-- De-duplica: salta se esiste già una notifica `task_due` per stesso utente
-- e stesso task_id nelle ultime 22 ore.
create or replace function public.notify_task_due() returns void
language plpgsql security definer set search_path = public
as $$
declare
  t record;
  uid uuid;
begin
  for t in
    select id, title, due_date, assignees
    from public.tasks
    where deleted_at is null
      and status <> 'done'
      and due_date is not null
      and due_date >= now()
      and due_date <= now() + interval '24 hours'
      and assignees is not null
      and array_length(assignees, 1) > 0
  loop
    foreach uid in array t.assignees loop
      if not exists (
        select 1 from public.notifications
        where user_id = uid
          and type = 'task_due'
          and payload->>'task_id' = t.id::text
          and created_at > now() - interval '22 hours'
      ) then
        insert into public.notifications (user_id, type, payload)
        values (
          uid,
          'task_due',
          jsonb_build_object(
            'task_id', t.id,
            'task_title', t.title,
            'due_date', t.due_date
          )
        );
      end if;
    end loop;
  end loop;
end $$;

-- ── 4. pg_cron: notify_queue_stale (orario) ────────────────────────────────
-- ⚠️  STALE: i ruoli usati qui ('Manager', 'Admin', 'Senior Agent') hanno casing
--     errato rispetto al DB ('manager', 'admin'). Questa definizione è sovrascritta
--     da 20260610_step_j_fix.sql che riscrive notify_queue_stale con lowercase.
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
        and role in ('Manager', 'Admin', 'Senior Agent')
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

-- ── 5. Schedule pg_cron jobs ───────────────────────────────────────────────
-- Idempotenza: unschedule se già esistente prima di rischedulare.
do $$
declare
  jid bigint;
begin
  -- task_due: ogni giorno alle 08:00 UTC
  select jobid into jid from cron.job where jobname = 'notify_task_due_daily';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'notify_task_due_daily',
    '0 8 * * *',
    $cron$ select public.notify_task_due(); $cron$
  );

  -- queue_stale: ogni ora al minuto 5
  select jobid into jid from cron.job where jobname = 'notify_queue_stale_hourly';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'notify_queue_stale_hourly',
    '5 * * * *',
    $cron$ select public.notify_queue_stale(); $cron$
  );
end $$;
