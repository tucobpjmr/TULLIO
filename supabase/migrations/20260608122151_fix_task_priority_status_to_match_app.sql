-- ============================================================
-- Fix task priority/status — allinea i CHECK constraint ai valori UI
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R.
-- Versione DB: 20260608122151.

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'inprogress', 'awaiting_client', 'awaiting_supplier', 'done'));

ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'todo';
