-- ============================================================
-- Realtime: aggiungi tasks / comments / notices alla publication
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R.
-- Versione DB: 20260608231610.

alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notices;
