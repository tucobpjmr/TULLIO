-- Step H — Stato online/away/offline degli utenti
-- Colonna status + last_seen_at + realtime su users (per indicatore chat)

alter table public.users
  add column if not exists status text check (status in ('online','away','offline')),
  add column if not exists last_seen_at timestamptz;

-- L'utente può aggiornare SOLO i propri campi di presence.
-- (RLS sui users c'è già con le altre policy; qui aggiungiamo un update self.)
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname='public' and tablename='users'
      and policyname='users update self presence'
  ) then
    create policy "users update self presence"
      on public.users for update
      using (id = auth.uid())
      with check (id = auth.uid());
  end if;
end $$;

-- Realtime publication per users (per propagare cambi status)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'users'
  ) then
    execute 'alter publication supabase_realtime add table public.users';
  end if;
end $$;
