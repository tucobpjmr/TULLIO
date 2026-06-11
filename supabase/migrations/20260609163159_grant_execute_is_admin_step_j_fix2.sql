-- ============================================================
-- Step J fix #2 — grant EXECUTE su is_admin() ad authenticated/anon
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R
-- (caveat #19 — era il file `step_j_fix2.sql` perso). Versione DB:
-- 20260609163159.
--
-- Senza questo grant, ogni policy che usa is_admin() (tasks_delete,
-- users RLS, presence) fallisce con 42501 "permission denied for
-- function is_admin" e blocca a cascata INSERT su tasks, heartbeat
-- presence e chat.

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
