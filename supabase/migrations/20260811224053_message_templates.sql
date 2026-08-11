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
--
-- NOTA sullo schema di is_admin()/is_active_user(): dalla migrazione
-- 20260706181011 vivono in `private`, non più in `public` — spostate per
-- l'advisor `function_search_path_mutable`. `20260630_categories_table`
-- referenzia ancora `public.is_admin()`/`public.is_active_user()` perché è
-- stata applicata PRIMA di quello spostamento: una policy già creata
-- referenzia la funzione per OID, non per nome qualificato, quindi non si è
-- rotta. Una migrazione scritta OGGI deve invece usare `private.*`, come qui
-- sotto — `public.is_admin()` non esiste più e la prima stesura di questa
-- migrazione (con `public.*`, copiata dal testo di quella più vecchia) è
-- infatti fallita in apply_migration con "function public.is_admin() does
-- not exist" prima di essere corretta. Vale anche per `docs/AUDIT_ARCHITETTURA_2026-08-11.md`
-- §4 C-1 e `docs/SICUREZZA.md` §4, che citano ancora `public.is_admin()`: la
-- correzione lì è solo testuale (il codice di C-1 non chiama questa funzione
-- SQL, replica il predicato in TypeScript) ed è un rilievo a sé, non parte di
-- A-1.

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
-- utenti attivi (vedi private.is_active_user(), 20260621_rls_hardening_active_users).
create policy rls_active_only on public.message_templates
  as restrictive for all to authenticated
  using (private.is_active_user())
  with check (private.is_active_user());

-- Lettura: tutti gli utenti attivi (il composer chat li usa per l'intero team).
create policy message_templates_select on public.message_templates
  for select to authenticated
  using (true);

-- Scrittura: solo admin ATTIVI. `is_admin()` include già `active`/`pending`
-- (20260806130000): è l'helper da usare invece di riscrivere il predicato,
-- la stessa lezione di C-1 nello stesso audit.
create policy message_templates_insert on public.message_templates
  for insert to authenticated
  with check ((select private.is_admin()));

create policy message_templates_update on public.message_templates
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

create policy message_templates_delete on public.message_templates
  for delete to authenticated
  using ((select private.is_admin()));

alter publication supabase_realtime add table public.message_templates;

-- ── Seed: i quattro template che oggi vivono solo in makeInitialState ──
insert into public.message_templates (label, text) values
  ('Conferma ricezione documenti', 'Buongiorno, abbiamo ricevuto i documenti. Le confermeremo a breve i dettagli della pratica.'),
  ('Richiesta passaporti', 'Buongiorno, per procedere con la prenotazione le servono i dati anagrafici completi e copia dei passaporti di tutti i partecipanti. Grazie!'),
  ('Sollecito acconto', 'Le ricordiamo che la scadenza per il versamento dell''acconto è imminente. Resto a disposizione per qualsiasi chiarimento.'),
  ('Voucher pronto', 'I documenti di viaggio (voucher hotel, biglietti, assicurazione) sono pronti. Li trova in allegato o può ritirarli in agenzia.');
