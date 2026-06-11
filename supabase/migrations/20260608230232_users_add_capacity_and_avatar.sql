-- ============================================================
-- users: aggiungi capacity + popola avatar fallback
-- ============================================================
-- Recuperata da supabase_migrations.schema_migrations durante Step R.
-- Versione DB: 20260608230232.

alter table public.users
  add column if not exists capacity integer not null default 10;

update public.users
   set avatar = upper(substring(name from 1 for 2))
 where avatar is null;
