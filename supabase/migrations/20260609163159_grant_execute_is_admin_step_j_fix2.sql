-- Step J fix #2: grant EXECUTE su is_admin a authenticated e anon.
-- Senza questo, ogni policy che usa is_admin() (es. tasks_delete, users RLS, presence)
-- fallisce con 42501 "permission denied for function is_admin" e blocca a cascata
-- INSERT su tasks, heartbeat presence e chat.
-- Versione DB: 20260609163159
-- NOTA: questo file era il "step_j_fix2.sql" perso documentato in HANDOFF v5§2.
--       Recuperato da supabase_migrations.schema_migrations in sessione 15 (Step R).
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
