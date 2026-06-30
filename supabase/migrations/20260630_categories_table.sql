-- Persistenza DB per le categorie task (Admin → Categorie).
--
-- Problema: ADD_CATEGORY/UPDATE_CATEGORY/REMOVE_CATEGORY (src/state/reducer.js)
-- aggiornavano solo lo stato React in memoria (setCategories su appGlobals,
-- nessuna chiamata Supabase): non esisteva alcuna tabella `categories`. Una
-- categoria creata da un admin spariva al primo reload/cambio dispositivo,
-- perché non era mai stata salvata da nessuna parte.
--
-- Prova che il gap è reale: tasks.category contiene già i valori 'hotel' e
-- 'supplier' (1 task ciascuno) che NON esistono in INITIAL_CATEGORIES
-- (src/state/mockData.js) — sono categorie create in passato via questa
-- funzionalità rotta: il task è sopravvissuto (persiste su DB), la
-- definizione della categoria (label/icona/colore) no.
--
-- Fix: tabella `categories` con RLS — lettura a tutti gli utenti attivi
-- (servono per renderizzare CategoryChip ovunque), scrittura solo admin
-- (coerente con canAccessAdmin/ADMIN_ONLY). Seed con le 9 categorie mock
-- esistenti + le 2 categorie orfane già in uso dalle task live, con
-- label/icona/colore di default ragionevoli.

create table public.categories (
  key text primary key,
  label text not null,
  icon text not null default '',
  color text not null default '#6B7280',
  bg text not null default '#F9FAFB',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_client uuid
);

alter table public.categories enable row level security;

-- Stessa porta di sicurezza di tutte le altre tabelle applicative: solo
-- utenti attivi (vedi is_active_user(), 20260621_rls_hardening_active_users).
create policy rls_active_only on public.categories
  as restrictive for all to authenticated
  using (public.is_active_user())
  with check (public.is_active_user());

-- Lettura: tutti gli utenti attivi (servono per render task/chip ovunque).
create policy categories_select on public.categories
  for select to authenticated
  using (true);

-- Scrittura: solo admin (coerente con ADMIN_ONLY lato app).
create policy categories_insert on public.categories
  for insert to authenticated
  with check ((select public.is_admin()));

create policy categories_update on public.categories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy categories_delete on public.categories
  for delete to authenticated
  using ((select public.is_admin()));

alter publication supabase_realtime add table public.categories;

-- ── Seed: le 9 categorie mock + le 2 categorie orfane già in uso dalle task ──
insert into public.categories (key, label, icon, color, bg) values
  ('booking',     'Booking',               '✈️', '#3B82F6', '#EFF6FF'),
  ('itinerary',   'Preventivo',            '📝', '#F97316', '#FFF7ED'),
  ('visa',        'Visa & Doc.',           '🛂', '#EF4444', '#FEF2F2'),
  ('client',      'Scadenza OPT',          '⏳', '#06B6D4', '#ECFEFF'),
  ('payment',     'Pagamenti & Fornitori', '💰', '#F59E0B', '#FFFBEB'),
  ('marketing',   'Marketing',             '📣', '#EC4899', '#FDF2F8'),
  ('admin',       'Check-in',              '✅', '#6B7280', '#F9FAFB'),
  ('appointment', 'Appuntamento',          '📅', '#6366F1', '#EEF2FF'),
  ('transfer',    'Transfer',              '🚐', '#7B4F9E', '#F3F0F9'),
  ('hotel',       'Hotel',                 '🏨', '#14B8A6', '#F0FDFA'),
  ('supplier',    'Fornitore',             '📦', '#8B5CF6', '#F5F3FF')
on conflict (key) do nothing;
