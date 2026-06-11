-- ============================================================
-- Hardening: fix advisors (security + performance)
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R.
-- Versione DB: 20260605160836. Riscrive le policies definite in
-- enable_rls_and_policies.sql con (select auth.uid()) per evitare
-- ri-evaluazione per riga (auth_rls_initplan advisor).

-- 1) Funzioni helper: search_path fisso + revoke da PUBLIC/anon/authenticated
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.current_user_role()     FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin()              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_manager_or_admin()   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user()       FROM PUBLIC, anon, authenticated;

-- 2) Indici sulle FK senza covering index
CREATE INDEX IF NOT EXISTS idx_comments_user      ON public.comments(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to  ON public.messages(reply_to);
CREATE INDEX IF NOT EXISTS idx_notices_author     ON public.notices(author_id);

-- 3) Rimozione policy users_admin_all (causa multiple_permissive_policies):
--    riscriviamo con policy restrittive separate per INSERT/DELETE solo admin,
--    SELECT/UPDATE già coperte dalle policy esistenti.
DROP POLICY IF EXISTS users_admin_all ON public.users;

CREATE POLICY users_insert_admin ON public.users
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY users_delete_admin ON public.users
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update ON public.users
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- 4) Riscrittura policy con (select auth.uid()) e (select public.is_*())
--    per evitare ri-evaluation per riga (auth_rls_initplan)

-- TASKS
DROP POLICY IF EXISTS tasks_select ON public.tasks;
DROP POLICY IF EXISTS tasks_insert ON public.tasks;
DROP POLICY IF EXISTS tasks_update ON public.tasks;
DROP POLICY IF EXISTS tasks_delete ON public.tasks;

CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    (SELECT public.is_manager_or_admin())
    OR (SELECT auth.uid()) = ANY(assignees)
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.is_manager_or_admin())
    OR (SELECT auth.uid()) = ANY(assignees)
    OR created_by = (SELECT auth.uid())
  )
  WITH CHECK (
    (SELECT public.is_manager_or_admin())
    OR (SELECT auth.uid()) = ANY(assignees)
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- COMMENTS
DROP POLICY IF EXISTS comments_select ON public.comments;
DROP POLICY IF EXISTS comments_insert ON public.comments;
DROP POLICY IF EXISTS comments_update_own ON public.comments;
DROP POLICY IF EXISTS comments_delete_own ON public.comments;

CREATE POLICY comments_select ON public.comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = comments.task_id
        AND (
          (SELECT public.is_manager_or_admin())
          OR (SELECT auth.uid()) = ANY(t.assignees)
          OR t.created_by = (SELECT auth.uid())
        )
    )
  );

CREATE POLICY comments_insert ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY comments_update_own ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY comments_delete_own ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

-- NOTICES
DROP POLICY IF EXISTS notices_insert ON public.notices;
DROP POLICY IF EXISTS notices_update ON public.notices;
DROP POLICY IF EXISTS notices_delete ON public.notices;

CREATE POLICY notices_insert ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (author_id = (SELECT auth.uid()));

CREATE POLICY notices_update ON public.notices
  FOR UPDATE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR (SELECT public.is_manager_or_admin()))
  WITH CHECK (author_id = (SELECT auth.uid()) OR (SELECT public.is_manager_or_admin()));

CREATE POLICY notices_delete ON public.notices
  FOR DELETE TO authenticated
  USING (author_id = (SELECT auth.uid()) OR (SELECT public.is_manager_or_admin()));

-- CONVERSATIONS
DROP POLICY IF EXISTS conversations_select ON public.conversations;
DROP POLICY IF EXISTS conversations_insert ON public.conversations;
DROP POLICY IF EXISTS conversations_update ON public.conversations;
DROP POLICY IF EXISTS conversations_delete ON public.conversations;

CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = ANY(participants) OR (SELECT public.is_admin()));

CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = ANY(participants));

CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = ANY(participants) OR (SELECT public.is_admin()))
  WITH CHECK ((SELECT auth.uid()) = ANY(participants) OR (SELECT public.is_admin()));

CREATE POLICY conversations_delete ON public.conversations
  FOR DELETE TO authenticated
  USING ((SELECT public.is_admin()));

-- MESSAGES
DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
DROP POLICY IF EXISTS messages_update_own ON public.messages;
DROP POLICY IF EXISTS messages_delete_own ON public.messages;

CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND ((SELECT auth.uid()) = ANY(c.participants) OR (SELECT public.is_admin()))
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (SELECT auth.uid()) = ANY(c.participants)
    )
  );

CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR (SELECT public.is_admin()))
  WITH CHECK (sender_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));

CREATE POLICY messages_delete_own ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = (SELECT auth.uid()) OR (SELECT public.is_admin()));
