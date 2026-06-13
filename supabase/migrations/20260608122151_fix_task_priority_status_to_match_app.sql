-- Aggiorna i constraint priority e status per allinearli ai valori usati nell'app
-- Versione DB: 20260608122151
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_priority_check
  CHECK (priority IN ('critical', 'high', 'medium', 'low'));

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE public.tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'inprogress', 'awaiting_client', 'awaiting_supplier', 'done'));

ALTER TABLE public.tasks ALTER COLUMN status SET DEFAULT 'todo';
