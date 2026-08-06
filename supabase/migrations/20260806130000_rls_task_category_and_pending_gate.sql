-- Sposta nel database due regole che vivevano solo in lib/permissions.js e nel
-- client React: chiunque abbia un JWT valido parla direttamente con PostgREST,
-- quindi un controllo che esiste solo lì è UX, non un confine di sicurezza.
--
-- 1) Matrice categoria per ruolo (Driver → solo transfer, Junior Agent → non
--    payment/admin): esisteva solo in canCreateTaskCategory(), mai in una
--    policy. Un Driver o un Junior Agent con la propria sessione poteva
--    creare o modificare task di qualsiasi categoria chiamando PostgREST
--    senza passare dalla UI.
--
-- 2) Il gate RESTRICTIVE "attivo" (private.is_active_user, usato su ogni
--    tabella sensibile) e gli helper di ruolo controllavano active=true ma
--    mai pending: TOGGLE_TEAM_MEMBER_ACTIVE scrive solo `active`, quindi un
--    utente con active=true e pending=true ancora vero (mai passato da
--    "Approva") vedeva la PendingScreen in UI — "un admin deve approvarti" —
--    mentre via API aveva accesso pieno. La UI e il database dicevano il
--    contrario l'uno dell'altro sulla stessa domanda.
--
-- NON tocca importa_backup() / elimina_lista_definitivamente(): erano state
-- segnalate come "operazioni da Admin" in una prima analisi, ma sono in realtà
-- funzionalità del menu Strumenti del modulo Liste viaggio, raggiungibili da
-- chiunque acceda al modulo (admin|manager|agent — il Driver ne è escluso a
-- monte). Il gate can_liste() già in vigore è quello giusto: lib/listeApi.js
-- lo dichiara esplicitamente ("elimina_lista_definitivamente/importaBackup
-- per admin/manager/agent, resetCompleto solo per admin"), ed è coerente con
-- reset_completo(), che infatti è l'unica delle tre già su is_admin().

-- ── 3) pending fa parte della definizione di "utente operativo" ──────────────
-- Stesso pattern per tutti e cinque gli helper: nessuno tratta più un utente
-- pending come attivo, a prescindere da cosa valga la colonna `active`.

create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND active = true AND coalesce(pending, false) = false
  );
$$;

create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND active = true AND coalesce(pending, false) = false
  );
$$;

create or replace function private.is_manager_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin','manager') AND active = true AND coalesce(pending, false) = false
  );
$$;

create or replace function private.can_liste()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.active AND coalesce(u.pending, false) = false
      AND u.role = ANY (ARRAY['admin','manager','agent'])
  );
$$;

create or replace function private.can_view_global_queue()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','manager','agent')
      and active = true
      and coalesce(pending, false) = false
  );
$$;

-- ── 1) Matrice categoria per ruolo, come lib/permissions.js#canCreateTaskCategory ──
-- p_category NULL → consentito: alcuni task non hanno categoria (colonna
-- nullable) e l'assenza di categoria non è "una categoria sensibile".
create or replace function private.can_use_task_category(p_category text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_category is null then true
    else exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.active and coalesce(u.pending, false) = false
        and case
          when u.role = 'driver' then p_category = 'transfer'
          when u.role = 'agent' and coalesce(u.seniority, 'senior') = 'junior'
            then p_category not in ('payment', 'admin')
          else true
        end
    )
  end;
$$;

revoke all on function private.can_use_task_category(text) from public, anon;
grant execute on function private.can_use_task_category(text) to authenticated;

drop policy if exists "tasks_insert" on public.tasks;
create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_use_task_category(category))
  );

-- Il vincolo di categoria va SOLO nel WITH CHECK, non nello USING: nello USING
-- impedirebbe a un Driver di riaprire/chiudere un task che ha già in carico
-- se un manager ne ha nel frattempo cambiato la categoria — bloccandolo fuori
-- dal proprio lavoro invece di limitarsi a impedirgli di assegnarsene di nuove
-- categorie non sue.
drop policy if exists "tasks_update" on public.tasks;
create policy "tasks_update" on public.tasks
  for update to authenticated
  using (
    (select private.is_manager_or_admin())
    or (select auth.uid()) = any (assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select private.can_view_global_queue()))
  )
  with check (
    (
      (select private.is_manager_or_admin())
      or (select auth.uid()) = any (assignees)
      or created_by = (select auth.uid())
      or (cardinality(assignees) = 0 and (select private.can_view_global_queue()))
    )
    and (select private.can_use_task_category(category))
  );

