-- ============================================================
-- RLS + Policies (matrice permessi Admin/Manager/Agent/Driver)
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R.
-- Versione DB: 20260605160742.
-- Le policies qui definite vengono in seguito riscritte dal file
-- 20260605160836_hardening_advisors_fix.sql (auth_rls_initplan).

-- Helper: ruolo dell'utente corrente
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin');
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin','manager'));
$$;

-- Abilita RLS su tutte le tabelle
ALTER TABLE public.users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notices       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages      ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- USERS
-- ============================================================
CREATE POLICY users_select_all ON public.users
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY users_admin_all ON public.users
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- TASKS
-- ============================================================
CREATE POLICY tasks_select ON public.tasks
  FOR SELECT TO authenticated
  USING (
    public.is_manager_or_admin()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
  );

CREATE POLICY tasks_insert ON public.tasks
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY tasks_update ON public.tasks
  FOR UPDATE TO authenticated
  USING (
    public.is_manager_or_admin()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
  )
  WITH CHECK (
    public.is_manager_or_admin()
    OR auth.uid() = ANY(assignees)
    OR created_by = auth.uid()
  );

CREATE POLICY tasks_delete ON public.tasks
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE POLICY comments_select ON public.comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = comments.task_id
        AND (
          public.is_manager_or_admin()
          OR auth.uid() = ANY(t.assignees)
          OR t.created_by = auth.uid()
        )
    )
  );

CREATE POLICY comments_insert ON public.comments
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY comments_update_own ON public.comments
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin())
  WITH CHECK (user_id = auth.uid() OR public.is_admin());

CREATE POLICY comments_delete_own ON public.comments
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

-- ============================================================
-- NOTICES (bacheca pubblica al team)
-- ============================================================
CREATE POLICY notices_select_all ON public.notices
  FOR SELECT TO authenticated USING (TRUE);

CREATE POLICY notices_insert ON public.notices
  FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());

CREATE POLICY notices_update ON public.notices
  FOR UPDATE TO authenticated
  USING (author_id = auth.uid() OR public.is_manager_or_admin())
  WITH CHECK (author_id = auth.uid() OR public.is_manager_or_admin());

CREATE POLICY notices_delete ON public.notices
  FOR DELETE TO authenticated
  USING (author_id = auth.uid() OR public.is_manager_or_admin());

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE POLICY conversations_select ON public.conversations
  FOR SELECT TO authenticated
  USING (auth.uid() = ANY(participants) OR public.is_admin());

CREATE POLICY conversations_insert ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = ANY(participants));

CREATE POLICY conversations_update ON public.conversations
  FOR UPDATE TO authenticated
  USING (auth.uid() = ANY(participants) OR public.is_admin())
  WITH CHECK (auth.uid() = ANY(participants) OR public.is_admin());

CREATE POLICY conversations_delete ON public.conversations
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND (auth.uid() = ANY(c.participants) OR public.is_admin())
    )
  );

CREATE POLICY messages_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND auth.uid() = ANY(c.participants)
    )
  );

CREATE POLICY messages_update_own ON public.messages
  FOR UPDATE TO authenticated
  USING (sender_id = auth.uid() OR public.is_admin())
  WITH CHECK (sender_id = auth.uid() OR public.is_admin());

CREATE POLICY messages_delete_own ON public.messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR public.is_admin());
