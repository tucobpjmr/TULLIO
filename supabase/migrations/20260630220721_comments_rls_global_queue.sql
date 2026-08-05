-- Allinea la visibilita' dei COMMENTI alla visibilita' delle TASK (coda globale).
--
-- Contesto: con 20260630_tasks_global_queue_agent_visibility (PR #87) gli agenti
-- vedono e possono prendere in carico le task in coda globale (assignees vuoti),
-- e con 20260630_task_files_rls_global_queue gli allegati sono stati allineati.
-- La policy comments_select, pero', era rimasta ferma a:
--   is_manager_or_admin() OR auth.uid() = ANY(t.assignees) OR t.created_by = auth.uid()
-- mentre comments_insert permette a QUALSIASI utente attivo di commentare
-- qualunque task (solo user_id = auth.uid()), coerente con canViewTask/
-- canEditTask lato app (che ammettono il commento sulla coda globale).
--
-- Conseguenza osservata: un agente commenta una task in coda globale non
-- creata da lui -> l'INSERT riesce (comments_insert non verifica la task),
-- il commento appare otticamente in UI, ma il successivo reload realtime
-- (TasksAPI.list withComments, triggerato dall'INSERT stesso su `comments`)
-- rifa' la SELECT con il JOIN comments-tasks: comments_select esclude la riga
-- perche' l'agente non e' manager/admin/assegnatario/creatore -> il commento
-- "sparisce" subito dopo la creazione per chiunque lo guardi, incluso l'autore.
--
-- Fix: comments_select rispecchia ora esattamente tasks_select (stessa
-- espressione, incluso can_view_global_queue() per la coda globale).

drop policy if exists comments_select on public.comments;
create policy comments_select on public.comments
for select to authenticated
using (exists (
  select 1 from public.tasks t
  where t.id = comments.task_id
    and (
      (select public.is_manager_or_admin())
      or (select auth.uid()) = any(t.assignees)
      or t.created_by = (select auth.uid())
      or (cardinality(t.assignees) = 0 and (select public.can_view_global_queue()))
    )
));
