-- RLS hardening: pending/inactive users blocked from all data access.
--
-- Problems fixed:
--   1. is_admin() / is_manager_or_admin() did not check active=true → an
--      invited-but-not-yet-activated user with a role already set could pass
--      role checks.
--   2. clients_insert was bound to {public} with no WITH CHECK → unauthenticated
--      callers could insert rows.
--   3. users_insert_admin had no WITH CHECK → any authenticated user could
--      insert users rows (invite-user Edge Function uses service role, bypasses
--      RLS, so this is safe to restrict).
--   4. Duplicate notification policies on {public} role (old names) shadowed
--      the newer authenticated-only ones.
--   5. INSERT policies on tasks/comments/notices/conversations/messages/
--      user_contacts had no WITH CHECK at all.
--   6. Added RESTRICTIVE "active users only" policies on every key table so a
--      single gate stops inactive users across all operations.

-- ── 1. Update role-check helpers to require active = true ────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND active = true
  );
$$;

create or replace function public.is_manager_or_admin()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin','manager') AND active = true
  );
$$;

-- ── 2. New helper: current session belongs to an active user ─────────────────
create or replace function public.is_active_user()
returns boolean language sql stable security definer set search_path = public as $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND active = true);
$$;

revoke all on function public.is_active_user() from public, anon;
grant execute on function public.is_active_user() to authenticated;

-- ── 3. Restrictive gate on each key table ────────────────────────────────────
-- RESTRICTIVE policies are AND-ed with all PERMISSIVE ones, so this single
-- rule blocks any inactive-user session across SELECT/INSERT/UPDATE/DELETE.

drop policy if exists "rls_active_only" on public.tasks;
create policy "rls_active_only" on public.tasks
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.clients;
create policy "rls_active_only" on public.clients
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.comments;
create policy "rls_active_only" on public.comments
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.notices;
create policy "rls_active_only" on public.notices
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.notifications;
create policy "rls_active_only" on public.notifications
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.conversations;
create policy "rls_active_only" on public.conversations
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.messages;
create policy "rls_active_only" on public.messages
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

drop policy if exists "rls_active_only" on public.user_contacts;
create policy "rls_active_only" on public.user_contacts
  as restrictive for all to authenticated
  using (public.is_active_user()) with check (public.is_active_user());

-- ── 4. Fix clients_insert (was on {public} with no WITH CHECK) ───────────────
drop policy if exists "clients_insert" on public.clients;
create policy "clients_insert" on public.clients
  for insert to authenticated
  with check (true); -- restrictive gate above already enforces active user

-- ── 5. Fix users_insert_admin: add WITH CHECK so only admins can insert ───────
drop policy if exists "users_insert_admin" on public.users;
create policy "users_insert_admin" on public.users
  for insert to authenticated
  with check (public.is_admin());

-- ── 6. Remove duplicate old-style notification policies on {public} role ──────
drop policy if exists "own notifications delete" on public.notifications;
drop policy if exists "own notifications select" on public.notifications;
drop policy if exists "own notifications update" on public.notifications;
