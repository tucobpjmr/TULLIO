-- 2026-06-13 — HARDENING PRIVACY: contatti PII dei membri team in tabella dedicata
--
-- Problema:
--   public.users aveva policy `users_select_all USING (true)` ed è in
--   REPLICA IDENTITY FULL dentro la publication supabase_realtime. Di
--   conseguenza email e telefono di OGNI collega erano leggibili da qualunque
--   utente loggato sia via SELECT (`select('*')` in AuthContext/Users.list)
--   sia via payload realtime (old/new completi su ogni UPDATE di presence).
--
-- Soluzione:
--   Spostare i contatti PII (email/phone) in una tabella dedicata
--   public.user_contacts, leggibile SOLO dal diretto interessato
--   (user_id = auth.uid()) o da un admin. La tabella NON entra nella
--   publication realtime, quindi nessun contatto transita più sui canali
--   postgres_changes. Le colonne email/phone vengono poi rimosse da
--   public.users; i dati esistenti sono migrati prima del drop (reversibile).

-- ── 1. Tabella contatti ─────────────────────────────────────────────────────
create table if not exists public.user_contacts (
  user_id    uuid primary key references public.users(id) on delete cascade,
  email      text,
  phone      text,
  updated_at timestamptz not null default now()
);

alter table public.user_contacts enable row level security;

-- Preserva l'unicità dell'email che esisteva su public.users.email
-- (auth.users la garantisce già a monte; qui è difesa in profondità).
create unique index if not exists user_contacts_email_key
  on public.user_contacts (email) where email is not null;

-- ── 2. Migrazione dati esistenti ────────────────────────────────────────────
insert into public.user_contacts (user_id, email, phone)
select id, email, phone from public.users
on conflict (user_id) do nothing;

-- ── 3. RLS: solo il diretto interessato o un admin ──────────────────────────
-- I subselect attorno a auth.uid()/is_admin() abilitano il caching initplan
-- (pattern consigliato dagli advisor di performance).
create policy user_contacts_select on public.user_contacts
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

create policy user_contacts_insert on public.user_contacts
  for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

create policy user_contacts_update on public.user_contacts
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()))
  with check (user_id = (select auth.uid()) or (select public.is_admin()));

create policy user_contacts_delete on public.user_contacts
  for delete to authenticated
  using ((select public.is_admin()));

-- anon non deve mai toccare i contatti.
revoke all on public.user_contacts from anon;

-- ── 4. updated_at automatico (riusa il trigger generico già presente) ───────
drop trigger if exists trg_user_contacts_updated_at on public.user_contacts;
create trigger trg_user_contacts_updated_at
  before update on public.user_contacts
  for each row execute function public.touch_updated_at();

-- ── 5. handle_new_user: l'email va in user_contacts, non più in users ───────
-- SECURITY DEFINER ⇒ l'insert in user_contacts bypassa la RLS al signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users (id, name, role, pending)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'agent'),
    true
  )
  on conflict (id) do nothing;

  insert into public.user_contacts (user_id, email)
  values (new.id, new.email)
  on conflict (user_id) do update set email = excluded.email;

  return new;
end;
$$;

-- ── 6. Rimuovi le colonne PII da public.users (dati già migrati) ────────────
-- Il drop di email rimuove anche il suo UNIQUE index (nessuna altra
-- dipendenza: verificato via pg_depend).
alter table public.users drop column if exists email;
alter table public.users drop column if exists phone;

-- NB: public.user_contacts NON viene aggiunta a `supabase_realtime`:
--     i contatti non devono mai transitare sui canali postgres_changes.
