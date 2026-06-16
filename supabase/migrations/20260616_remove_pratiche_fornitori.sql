-- Remove pratiche (dossiers) and fornitori (suppliers) modules.
-- Replace dossier_id FK on tasks with pratica_ref text field.

-- 1. Unschedule pg_cron job for dossier departure notifications
do $$
declare jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'notify_dossier_departure_daily';
  if jid is not null then perform cron.unschedule(jid); end if;
end $$;

-- 2. Drop dossier triggers
drop trigger if exists trg_notify_dossier_status on public.dossiers;
drop trigger if exists dossiers_auto_number on public.dossiers;

-- 3. Drop dossier functions
drop function if exists public.notify_dossier_status() cascade;
drop function if exists public.notify_dossier_departure() cascade;
drop function if exists public.generate_dossier_number() cascade;

-- 4. Before dropping dossiers, migrate existing dossier numbers to pratica_ref on tasks
-- Add pratica_ref column to tasks first
alter table public.tasks add column if not exists pratica_ref text;

-- Copy dossier number from linked dossier to pratica_ref
update public.tasks t
set pratica_ref = d.number
from public.dossiers d
where t.dossier_id = d.id
  and d.number is not null
  and t.dossier_id is not null;

-- 5. Drop dossier_id FK column from tasks
alter table public.tasks drop column if exists dossier_id;

-- 6. Drop tables in dependency order
drop table if exists public.dossier_suppliers cascade;
drop table if exists public.dossiers cascade;
drop table if exists public.suppliers cascade;

-- 7. Drop sequence
drop sequence if exists dossier_number_seq;
