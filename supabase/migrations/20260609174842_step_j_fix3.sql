-- Step J fix #3: trigger BEFORE INSERT che forza tasks.created_by = auth.uid()
-- Risolve RLS violation 42501 quando il client UI omette created_by nel payload.
-- Applicato via MCP il 9/6/2026; questo file e' solo per version control.

CREATE OR REPLACE FUNCTION public.tasks_set_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF NEW.created_by IS NULL OR NEW.created_by <> auth.uid() THEN
    NEW.created_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_set_created_by ON public.tasks;
CREATE TRIGGER trg_tasks_set_created_by
BEFORE INSERT ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.tasks_set_created_by();

GRANT EXECUTE ON FUNCTION public.tasks_set_created_by() TO authenticated, anon;
