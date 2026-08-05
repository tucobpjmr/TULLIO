-- Coda globale visibile/azionabile dagli agenti (Senior Agent)
--
-- Problema: le policy tasks_select e tasks_update consentivano l'accesso solo a:
--   is_manager_or_admin() OR auth.uid() = ANY(assignees) OR created_by = auth.uid()
-- Un task in "coda globale" ha assignees = '{}' (nessun assegnatario). Un utente
-- con ruolo 'agent' (i Senior Agent dell'app) NON e' manager/admin, non e' negli
-- assignees e -- se non e' il creatore -- non soddisfa nessuna condizione: la
-- riga viene nascosta dalla RLS. Risultato: la "Coda Globale" risulta SEMPRE
-- vuota per i Senior Agent, anche se il frontend (canViewTask -> isInGlobalQueue)
-- la mostrerebbe, e il bottone "Prendi in carico" (tasks_update) fallisce.
--
-- Fix: gli utenti attivi non-driver (admin, manager, agent) possono leggere e
-- prendere in carico i task in coda globale (assignees vuoti). I driver restano
-- esclusi: vedono solo le proprie task, coerente con canViewTask. La distinzione
-- Senior/Junior agent e' solo lato frontend (UX): a DB il ruolo e' 'agent' per
-- entrambi, quindi la regola si applica a tutti gli 'agent'; il bottone "Prendi
-- in carico" resta disabilitato per i Junior nel frontend (canEditTask).

-- ── Helper: l'utente attivo corrente puo' vedere la coda globale (non-driver) ──
create or replace function public.can_view_global_queue()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','manager','agent')
      and active = true
  );
$$;

revoke all on function public.can_view_global_queue() from public, anon;
grant execute on function public.can_view_global_queue() to authenticated;

-- ── SELECT: aggiunge la coda globale (assignees vuoti) per gli agenti ──────────
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select public.is_manager_or_admin())
    or (select auth.uid()) = any(assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select public.can_view_global_queue()))
  );

-- ── UPDATE: consente di prendere in carico un task in coda globale ────────────
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    (select public.is_manager_or_admin())
    or (select auth.uid()) = any(assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select public.can_view_global_queue()))
  )
  with check (
    (select public.is_manager_or_admin())
    or (select auth.uid()) = any(assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select public.can_view_global_queue()))
  );
