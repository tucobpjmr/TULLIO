-- 2026-06-13 — HARDENING PRIVACY: restringe la SELECT su clienti/fornitori/pratiche
--
-- Problema: le policy SELECT di clients/suppliers/dossiers/dossier_suppliers erano
--   `auth.role() = 'authenticated'`, quindi QUALSIASI utente loggato — incluso il
--   ruolo `driver` (che opera solo sui transfer) — poteva leggere via API tutti i
--   dati di contatto dei clienti (email/telefono/indirizzo/note) e dei fornitori.
--
-- Soluzione: allineare la SELECT alle policy di scrittura già presenti, che
--   ammettono admin/manager/agent. I driver non vedono più questi dati.
--   Le tabelle non sono lette dall'app attuale (nessuna API client) → nessuna
--   regressione funzionale.

-- clients
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
for select to authenticated
using (
  exists (select 1 from public.users u
          where u.id = (select auth.uid())
            and u.role in ('admin','manager','agent'))
);

-- suppliers
drop policy if exists suppliers_select on public.suppliers;
create policy suppliers_select on public.suppliers
for select to authenticated
using (
  exists (select 1 from public.users u
          where u.id = (select auth.uid())
            and u.role in ('admin','manager','agent'))
);

-- dossiers
drop policy if exists dossiers_select on public.dossiers;
create policy dossiers_select on public.dossiers
for select to authenticated
using (
  exists (select 1 from public.users u
          where u.id = (select auth.uid())
            and u.role in ('admin','manager','agent'))
);

-- dossier_suppliers
drop policy if exists dossier_suppliers_select on public.dossier_suppliers;
create policy dossier_suppliers_select on public.dossier_suppliers
for select to authenticated
using (
  exists (select 1 from public.users u
          where u.id = (select auth.uid())
            and u.role in ('admin','manager','agent'))
);
