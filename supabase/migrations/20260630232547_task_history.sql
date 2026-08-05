-- 20260701_task_history.sql
-- Cronologia per-task: chi ha creato il task + tracciamento dei cambi di
-- stato, priorità, assegnatari, scadenza e cestinazione/ripristino.
-- Visibile in fondo a TaskSlideOver ("Cronologia").
--
-- Il completamento NON ha un evento dedicato: è già coperto dal cambio
-- status → 'done' (vedi trigger set_task_completed_at, 20260630).
-- Le modifiche a campi testo libero (titolo/descrizione/cliente/pratica)
-- NON vengono tracciate per evitare rumore.

-- ── 1. Tabella ───────────────────────────────────────────────────────────────
create table public.task_history (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,   -- 'created' | 'status' | 'priority' | 'assignees' | 'due_date' | 'trashed' | 'restored'
  old_value   text,
  new_value   text,
  created_at  timestamptz not null default now()
);
create index idx_task_history_task on public.task_history(task_id, created_at);

-- ── 2. Funzione trigger ────────────────────────────────────────────────────
-- SECURITY DEFINER per inserire bypassando l'assenza di policy INSERT lato
-- client (stesso pattern di notify_queue_stale, 20260615): solo il DB scrive
-- in task_history, mai il client direttamente.
create or replace function public.log_task_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.task_history (task_id, actor_id, action)
    values (NEW.id, NEW.created_by, 'created');
    return NEW;
  end if;

  -- TG_OP = 'UPDATE': un INSERT per ciascun campo monitorato cambiato.
  if NEW.status is distinct from OLD.status then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value)
    values (NEW.id, auth.uid(), 'status', OLD.status, NEW.status);
  end if;

  if NEW.priority is distinct from OLD.priority then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value)
    values (NEW.id, auth.uid(), 'priority', OLD.priority, NEW.priority);
  end if;

  if NEW.due_date is distinct from OLD.due_date then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value)
    values (
      NEW.id, auth.uid(), 'due_date',
      to_char(OLD.due_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(NEW.due_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    );
  end if;

  if NEW.assignees is distinct from OLD.assignees then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value)
    values (
      NEW.id, auth.uid(), 'assignees',
      array_to_string(OLD.assignees, ','),
      array_to_string(NEW.assignees, ',')
    );
  end if;

  if NEW.deleted_at is distinct from OLD.deleted_at then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value)
    values (
      NEW.id, auth.uid(),
      case when NEW.deleted_at is not null then 'trashed' else 'restored' end,
      OLD.deleted_at::text, NEW.deleted_at::text
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_log_task_history on public.tasks;
create trigger trg_log_task_history
  after insert or update on public.tasks
  for each row execute function public.log_task_history();

-- Chiude l'esposizione RPC pubblica della funzione trigger (richiede
-- NEW/OLD/TG_OP, mai pensata per essere chiamata via /rest/v1/rpc/...).
-- La revoca di EXECUTE non blocca l'invocazione automatica via trigger
-- (stesso pattern di notify_queue_stale, 20260615).
revoke all on function public.log_task_history() from public, anon, authenticated;

-- ── 3. RLS ───────────────────────────────────────────────────────────────────
-- Solo SELECT, a specchio di comments_select/tasks_select (20260630): chi vede
-- il task vede anche la sua cronologia. Nessuna policy insert/update/delete
-- per il client: scrive solo il trigger (SECURITY DEFINER, bypassa RLS come
-- owner della funzione).
alter table public.task_history enable row level security;

create policy task_history_select on public.task_history
for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = task_history.task_id
    and (
      (select public.is_manager_or_admin())
      or (select auth.uid()) = any(t.assignees)
      or t.created_by = (select auth.uid())
      or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
    )
));

-- ── 4. Realtime ──────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.task_history;
