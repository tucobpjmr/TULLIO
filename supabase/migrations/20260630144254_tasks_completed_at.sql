-- 20260630_tasks_completed_at.sql
-- Aggiunge tasks.completed_at: timestamp di completamento, gestito interamente
-- dal DB via trigger (il client non lo scrive mai). Serve all'Archivio per
-- ordinare/mostrare quando una task è stata completata.
--
-- Regole (trigger BEFORE INSERT OR UPDATE):
--  - status diventa 'done' (o riga inserita già 'done')      → completed_at = now()
--  - status resta 'done' (es. modifica titolo)               → completed_at invariato
--  - status diverso da 'done'                                → completed_at = NULL
--
-- Backfill: le task già completate ricevono updated_at come proxy della data
-- di completamento (created_at se updated_at mancasse).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Funzione trigger: il DB è l'unica fonte di verità per completed_at.
CREATE OR REPLACE FUNCTION public.set_task_completed_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'done' THEN
    -- Imposta il timestamp solo entrando in 'done' (transizione o insert già done);
    -- se la task era già 'done' preserva il valore esistente.
    IF NEW.completed_at IS NULL
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'done') THEN
      NEW.completed_at := NOW();
    END IF;
  ELSE
    -- Qualsiasi stato non-completato azzera il timestamp (es. riapertura).
    NEW.completed_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_task_completed_at ON public.tasks;
CREATE TRIGGER trg_set_task_completed_at
  BEFORE INSERT OR UPDATE OF status ON public.tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.set_task_completed_at();

-- Backfill delle task già completate.
UPDATE public.tasks
  SET completed_at = COALESCE(updated_at, created_at, NOW())
  WHERE status = 'done' AND completed_at IS NULL;

-- Indice per l'ordinamento dell'Archivio (task attive, ordinate per completamento).
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at
  ON public.tasks(completed_at)
  WHERE deleted_at IS NULL;
