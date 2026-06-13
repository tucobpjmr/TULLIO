-- Restringe la SELECT su clients/suppliers/dossiers/dossier_suppliers ai soli
-- ruoli admin/manager/agent (i driver non hanno accesso ai dati commerciali).
-- Versione DB: 20260613092440
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
for select to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin','manager','agent')));

drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
for select to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin','manager','agent')));

drop policy if exists dossiers_select on public.dossiers;
create policy dossiers_select on public.dossiers
for select to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin','manager','agent')));

drop policy if exists dossier_suppliers_select on public.dossier_suppliers;
create policy dossier_suppliers_select on public.dossier_suppliers
for select to authenticated
using (exists (select 1 from public.users u where u.id = (select auth.uid()) and u.role in ('admin','manager','agent')));
