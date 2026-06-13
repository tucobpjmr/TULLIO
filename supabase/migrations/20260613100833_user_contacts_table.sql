-- 2026-06-13 — HARDENING PRIVACY: contatti PII dei membri team in tabella dedicata
-- Sposta email/phone da public.users a public.user_contacts (RLS own+admin),
-- aggiorna handle_new_user e rimuove le colonne PII da public.users.
-- Versione DB: 20260613100833
--
-- ⚠️  BREAKING CHANGE per l'app:
--     public.users non ha più le colonne email e phone.
--     api.js → Users.updateProfile non deve più passare email/phone.
--     Aggiungere Users.getContacts / Users.updateContact su public.user_contacts.
--     ProfileEditor in VoyageDesk.jsx va aggiornato di conseguenza.
--     Da fare in una sessione successiva a Step R.

-- ── 1. Tabella contatti ─────────────────────────────────────────────────────
create table if not exists public.user_contacts (
  user_id    uuid primary key references public.users(id) on delete cascade,
  email      text,
  phone      text,
  updated_at timestamptz not null default now()
);

alter table public.user_contacts enable row level security;

create unique index if not exists user_contacts_email_key
  on public.user_contacts (email) where email is not null;

-- ── 2. Migrazione dati esistenti ────────────────────────────────────────────
insert into public.user_contacts (user_id, email, phone)
select id, email, phone from public.users
on conflict (user_id) do nothing;

-- ── 3. RLS: solo il diretto interessato o un admin ──────────────────────────
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

revoke all on public.user_contacts from anon;

-- ── 4. updated_at automatico (riusa il trigger generico già presente) ───────
drop trigger if exists trg_user_contacts_updated_at on public.user_contacts;
create trigger trg_user_contacts_updated_at
  before update on public.user_contacts
  for each row execute function public.touch_updated_at();

-- ── 5. handle_new_user: l'email va in user_contacts, non più in users ───────
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
alter table public.users drop column if exists email;
alter table public.users drop column if exists phone;
