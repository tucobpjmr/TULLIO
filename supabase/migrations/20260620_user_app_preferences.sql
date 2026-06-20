-- Fase 3 follow-up: preferenze applicative per-utente, sincronizzate server-side.
-- Prima ospita le "reazioni recenti" della chat (ultime emoji usate), finora
-- salvate solo in localStorage (per-browser). Con questa tabella i recenti
-- seguono l'utente su tutti i dispositivi.
--
-- Pattern: come public.user_contacts → tabella separata, RLS "solo se stesso",
-- FUORI da realtime e SENZA origin_client (è una preferenza personale, non un
-- dato condiviso: nessun bisogno di propagarne le modifiche agli altri client).

create table if not exists public.user_app_preferences (
  user_id          uuid primary key references public.users(id) on delete cascade,
  recent_reactions text[] not null default '{}',
  updated_at       timestamptz not null default now()
);

alter table public.user_app_preferences enable row level security;

-- SELECT/INSERT/UPDATE: solo la riga del proprio utente.
drop policy if exists "user_app_preferences_select_self" on public.user_app_preferences;
create policy "user_app_preferences_select_self" on public.user_app_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "user_app_preferences_insert_self" on public.user_app_preferences;
create policy "user_app_preferences_insert_self" on public.user_app_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "user_app_preferences_update_self" on public.user_app_preferences;
create policy "user_app_preferences_update_self" on public.user_app_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
