-- B-1 dell'audit del 5 settembre.
--
-- private.can_clienti_scrittura() e can_clienti_eliminazione() -- introdotte
-- ieri da B-1 del 4 settembre -- erano le uniche private.can_* a NON
-- contenere "active AND NOT pending": can_liste(), can_use_task_category(),
-- can_view_global_queue() ce l'hanno tutte, e cosi' is_admin()/is_active_user().
--
-- Non sfruttabile oggi (rls_active_only le AND-a su clients, RESTRICTIVE su
-- USING e WITH CHECK), verificato invece di dedotto -- vedi la sonda in coda.
-- Ma il nome promette una risposta completa che il corpo non dava: il primo
-- riuso fuori da clients (una RPC, una Edge Function, una tabella nuova)
-- l'avrebbe ottenuta incompleta credendo di avere il gate standard del
-- progetto. Ridondante con rls_active_only, di proposito: difesa in
-- profondita' e' ridondanza che si dichiara.
create or replace function private.can_clienti_scrittura()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid())
      and active and coalesce(pending, false) = false
      and role = any (array['admin','manager','agent'])
  );
$$;

comment on function private.can_clienti_scrittura() is
  'Lettura/scrittura anagrafica clienti: admin, manager, agent, active AND '
  'NOT pending (ridondante con la RESTRICTIVE rls_active_only, di proposito). '
  'Rispecchia canEditClient in src/lib/permissions.js. B-1 dell''audit del 4 '
  'settembre, completata da B-1 del 5 settembre.';

create or replace function private.can_clienti_eliminazione()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = (select auth.uid())
      and active and coalesce(pending, false) = false
      and role = any (array['admin','manager'])
  );
$$;

comment on function private.can_clienti_eliminazione() is
  'Eliminazione anagrafica clienti: solo admin e manager, active AND NOT '
  'pending (ridondante con la RESTRICTIVE rls_active_only, di proposito). '
  'Rispecchia canDeleteClient in src/lib/permissions.js. B-1 dell''audit del '
  '4 settembre, completata da B-1 del 5 settembre.';
