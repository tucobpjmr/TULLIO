-- ─── A-2 dell'analisi del 6 novembre · il Junior Agent VEDE la coda globale, non la MODIFICA
--
-- COSA SI ROMPEVA. La matrice dei permessi (docs/SICUREZZA.md) e il client
-- (`canEditTask` in src/lib/permissions.js) dicono che il Junior modifica solo
-- i task assegnati a lui: la coda globale la vede, e al posto di «Prendi in
-- carico» ha «Chiedi a un Senior». Il database diceva un'altra cosa: il ramo
-- coda globale di `tasks_update` usava `private.can_view_global_queue()`, che
-- accetta ogni `role = 'agent'` senza guardare `seniority`. Un Junior, con il
-- proprio token, poteva prendersi in carico o modificare qualunque task non
-- assegnato. Era il database il livello PIÙ LARGO, cioè l'unico che conta.
--
-- COSA FA ORA. Una funzione nuova, `private.can_take_global_queue()`, risponde
-- a «può modificare la coda globale?»: admin, manager e agent SENIOR, attivi e
-- non in attesa. `tasks_update` la usa al posto di `can_view_global_queue()`,
-- in USING e in WITH CHECK. Tutto il resto della policy è invariato.
--
-- ⛔ NON cambia ciò che il Junior VEDE: `tasks_select`, `comments_*`,
-- `task_history_select` e `task_files_select` restano su
-- `can_view_global_queue()` — la coda globale si guarda e si commenta. Restano
-- fuori anche `task_files_insert/_delete` e le policy di storage sugli allegati:
-- seguito dichiarato, non dimenticato (vedi docs/CHANGELOG.md, 6 novembre (iii)).
--
-- `coalesce(seniority, 'senior')` è la stessa regola di
-- `private.can_use_task_category()`: senza valore, un agent è Senior.
--
-- Il caso che lo lega al database è in src/test/integration/rls.test.js
-- («Coda globale — il Junior la vede ma non la modifica»).
--
-- Idempotente: `create or replace`, `drop policy if exists` prima del `create`.

create or replace function private.can_take_global_queue()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.active = true
      and coalesce(u.pending, false) = false
      and (
        u.role in ('admin', 'manager')
        or (u.role = 'agent' and coalesce(u.seniority, 'senior') = 'senior')
      )
  );
$$;

revoke all on function private.can_take_global_queue() from public, anon;
grant execute on function private.can_take_global_queue() to authenticated;

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    (select private.is_manager_or_admin())
    or (select auth.uid()) = any (assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select private.can_take_global_queue()))
  )
  with check (
    (
      (select private.is_manager_or_admin())
      or (select auth.uid()) = any (assignees)
      or created_by = (select auth.uid())
      or (cardinality(assignees) = 0 and (select private.can_take_global_queue()))
    )
    and (select private.can_use_task_category(category))
  );
