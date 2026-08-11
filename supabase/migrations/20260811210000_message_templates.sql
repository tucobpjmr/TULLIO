-- Persistenza DB per i template di messaggio chat (Admin → Sistema).
--
-- Problema (A-1 dell'audit di architettura e sicurezza dell'11 agosto):
-- ADD_MESSAGE_TEMPLATE/UPDATE_MESSAGE_TEMPLATE/DELETE_MESSAGE_TEMPLATE
-- (src/state/reducer.js) toccavano solo lo state React: nessuna tabella
-- `message_templates` esisteva. Il reducer rispondeva con un toast di
-- successo ("Template aggiunto") mentre sul database non cambiava nulla — un
-- admin che ne creava uno per il team lo vedeva sparire al primo reload, e i
-- quattro template hard-coded (`makeInitialState`) tornavano identici a ogni
-- avvio, il che rendeva il difetto più difficile da notare: la funzionalità
-- *sembrava* funzionare.
--
-- Fix: stesso trattamento di `categories` (20260630_categories_table) — dati
-- di dominio usati da tutto il team (il composer chat li legge), scritti solo
-- dall'admin. Lettura a tutti gli utenti attivi, scrittura riservata
-- all'admin. Seed con i quattro template che oggi vivono solo in memoria, così
-- rimuoverli da `makeInitialState` non fa sparire nulla che l'utente vedeva
-- prima.

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_client uuid
);

alter table public.message_templates enable row level security;

-- Stessa porta di sicurezza di tutte le altre tabelle applicative: solo
-- utenti attivi (vedi is_active_user(), 20260621_rls_hardening_active_users).
create policy rls_active_only on public.message_templates
  as restrictive for all to authenticated
  using (public.is_active_user())
  with check (public.is_active_user());

-- Lettura: tutti gli utenti attivi (il composer chat li usa per l'intero team).
create policy message_templates_select on public.message_templates
  for select to authenticated
  using (true);

-- Scrittura: solo admin ATTIVI. `is_admin()` include già `active`/`pending`
-- (20260806130000): è l'helper da usare invece di riscrivere il predicato,
-- la stessa lezione di C-1 nello stesso audit.
create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check ((select public.is_admin()));

create policy message_templates_update on public.message_templates
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy message_templates_delete on public.message_templates
  for delete to authenticated
  using ((select public.is_admin()));

alter publication supabase_realtime add table public.message_templates;

-- ── Seed: i quattro template che oggi vivono solo in makeInitialState ──
insert into public.message_templates (label, text) values
  ('Conferma ricezione documenti', 'Buongiorno, abbiamo ricevuto i documenti. Le confermeremo a breve i dettagli della pratica.'),
  ('Richiesta passaporti', 'Buongiorno, per procedere con la prenotazione le servono i dati anagrafici completi e copia dei passaporti di tutti i partecipanti. Grazie!'),
  ('Sollecito acconto', 'Le ricordiamo che la scadenza per il versamento dell''acconto è imminente. Resto a disposizione per qualsiasi chiarimento.'),
  ('Voucher pronto', 'I documenti di viaggio (voucher hotel, biglietti, assicurazione) sono pronti. Li trova in allegato o può ritirarli in agenzia.');
