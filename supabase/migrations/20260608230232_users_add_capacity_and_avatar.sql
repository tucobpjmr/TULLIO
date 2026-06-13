-- Aggiungi la colonna capacity (carico massimo task per agente).
-- Versione DB: 20260608230232
alter table public.users
  add column if not exists capacity integer not null default 10;

-- Popola gli avatar (iniziali del nome) per i seed esistenti privi di avatar.
update public.users
   set avatar = upper(substring(name from 1 for 2))
 where avatar is null;
