-- B-1 dell'audit del 4 settembre.
--
-- Le quattro policy di clients ripetevano in linea
--   EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid()
--           AND users.role = ANY(ARRAY['admin','manager','agent']))
-- (['admin','manager'] sola per la DELETE) invece di chiamare un helper,
-- mentre ogni altra tabella del progetto usa private.is_admin() /
-- is_active_user() / can_liste(). Funzionalmente equivalenti (la
-- RESTRICTIVE rls_active_only aggiunge attivo+approvato), ma e' la stessa
-- domanda scritta in cinque posti -- esattamente cio' che il preambolo di
-- canAccessListe in permissions.js esiste per evitare.
create or replace function private.can_clienti_scrittura()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and role = any (array['admin','manager','agent'])
  );
$$;

comment on function private.can_clienti_scrittura() is
  'Lettura/scrittura anagrafica clienti: admin, manager, agent (RESTRICTIVE '
  'rls_active_only aggiunge attivo+approvato). Rispecchia canAccessListe in '
  'src/lib/permissions.js. B-1 dell''audit del 4 settembre.';

create or replace function private.can_clienti_eliminazione()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid()) and role = any (array['admin','manager'])
  );
$$;

comment on function private.can_clienti_eliminazione() is
  'Eliminazione anagrafica clienti: solo admin e manager, non agent. '
  'B-1 dell''audit del 4 settembre.';

drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated
  using ((select private.can_clienti_scrittura()));

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated
  with check ((select private.can_clienti_scrittura()));

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated
  using ((select private.can_clienti_scrittura()));

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete to authenticated
  using ((select private.can_clienti_eliminazione()));
