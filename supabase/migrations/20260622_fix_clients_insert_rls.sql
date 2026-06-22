-- Fix clients_insert con WITH CHECK (true): permetteva a qualsiasi utente
-- autenticato di creare clienti CRM. Allineato alle policy select/update:
-- admin + manager + agent; i driver non gestiscono il CRM.
drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
for insert to authenticated
with check (
  exists (
    select 1 from public.users
    where users.id = (select auth.uid())
      and users.role = any(array['admin','manager','agent'])
  )
);

-- Revoca is_active_user() da anon (mancava nella migration 20260613092355).
-- is_admin / is_manager_or_admin / is_active_user restano callable da
-- authenticated: rimuovere quel grant romperebbe le RLS policy che li usano.
revoke execute on function public.is_active_user() from anon;
