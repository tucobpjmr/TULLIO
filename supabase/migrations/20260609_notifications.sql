-- Step F — Notifiche reali
-- Tabella: notifications (per-utente, payload jsonb)
-- RLS:    utente vede/aggiorna SOLO le proprie notifiche
-- RT:     pubblicate su supabase_realtime
-- Trigger: task_assigned — genera notifica per ogni nuovo assignee di una task

-- ── Tabella ────────────────────────────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,            -- 'task_assigned'|'task_due'|'comment'|'mention'|'queue_stale'
  payload     jsonb not null default '{}'::jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, read, created_at desc);

create index if not exists notifications_created_at_idx
  on public.notifications (created_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.notifications enable row level security;

drop policy if exists "own notifications select" on public.notifications;
create policy "own notifications select"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "own notifications update" on public.notifications;
create policy "own notifications update"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Insert: nessuna policy esplicita → solo service_role (trigger DB) può inserire.
-- Volutamente non diamo permesso di insert a auth.uid(): le notifiche
-- nascono solo da trigger server-side, mai dal client.

drop policy if exists "own notifications delete" on public.notifications;
create policy "own notifications delete"
  on public.notifications for delete
  using (user_id = auth.uid());

-- ── Realtime ───────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;

-- ── Trigger: task_assigned ─────────────────────────────────────────────────
-- Insert notifica per ogni nuovo assignee:
--   INSERT task con assignees non vuoto → notifica a tutti
--   UPDATE task: notifica solo agli assignee aggiunti rispetto a OLD
create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  added uuid[];
  uid   uuid;
begin
  if TG_OP = 'INSERT' then
    added := coalesce(NEW.assignees, ARRAY[]::uuid[]);
  elsif TG_OP = 'UPDATE' then
    -- Differenza set: NEW.assignees - OLD.assignees
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

drop trigger if exists trg_notify_task_assigned on public.tasks;
create trigger trg_notify_task_assigned
  after insert or update of assignees on public.tasks
  for each row execute function public.notify_task_assigned();
