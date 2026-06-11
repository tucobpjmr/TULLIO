-- ============================================================
-- Realtime: aggiungi conversations / messages alla publication
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R.
-- Versione DB: 20260608231915.

alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
