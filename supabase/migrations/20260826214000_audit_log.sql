-- A-2 dell'audit sicurezza del 26 agosto — una traccia DUREVOLE delle
-- operazioni privilegiate.
--
-- ─── LA SITUAZIONE ────────────────────────────────────────────────────────
--
-- Il pannello Admin espone una tab «Log attività» con filtri ed export CSV.
-- Chi la guarda ne deduce ragionevolmente che esista un registro. Non
-- esisteva: era una fetta di stato React (`activityLog` in state/reducer.js),
-- con un tetto di 100 voci, azzerata a ogni reload, mai scritta a database e
-- LOCALE ALLA SINGOLA SESSIONE — registrava ciò che aveva fatto quel browser,
-- non ciò che aveva fatto il team. Un admin che la apriva per sapere chi aveva
-- disattivato un collega trovava una lista vuota.
--
-- Non è un problema di controllo d'accesso, ma questo gestionale tratta PII di
-- persone esterne al team (`clients`: nome, email, telefono, indirizzo) e
-- movimenti di denaro. Le operazioni che non lasciavano alcuna traccia erano
-- le più distruttive del sistema: hard-delete di un utente, ban, cambio di
-- ruolo, reset totale del modulo Liste, import di backup, eliminazione di un
-- cliente.
--
-- ─── DOVE SI SCRIVE, E PERCHÉ NON DAL CLIENT ──────────────────────────────
--
-- Le voci le scrivono TRIGGER sul database e le Edge Function privilegiate,
-- non il codice React. La differenza è la ragione stessa per cui questa
-- tabella esiste: un registro che dipende dal fatto che il client si ricordi
-- di scriverci registra le operazioni fatte dalla UI, cioè esattamente quelle
-- che si potevano già ricostruire — e tace su una chiamata diretta a
-- /rest/v1/users, che è il caso in cui a qualcuno servirebbe davvero.
--
-- `lista_history` ha già questa forma (append-only, con trigger). Questa
-- migrazione estende la stessa disciplina alle operazioni amministrative.

-- ─── LA TABELLA ────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  -- `set null` e non `cascade`: eliminare l'utente non deve cancellare la
  -- prova di ciò che ha fatto. È il punto di un registro di controllo.
  actor_id    uuid references public.users(id) on delete set null,
  -- Denormalizzato apposta: il nome al MOMENTO del fatto. `actor_id` diventa
  -- null quando l'account sparisce, e un registro che a quel punto dice
  -- «qualcuno» non serve a niente.
  actor_name  text,
  action      text not null,
  target_type text,
  target_id   text,
  -- ⚠️ `details` NON deve contenere PII. Solo ciò che serve a ricostruire la
  -- decisione: ruolo prima/dopo, conteggi, flag. Chi ci mette un'email
  -- trasforma il registro di controllo in una seconda copia dei dati da
  -- proteggere — con una policy di lettura più larga di quella dell'originale.
  details     jsonb not null default '{}'::jsonb
);

create index if not exists audit_log_at_desc  on public.audit_log (at desc);
create index if not exists audit_log_actor_at on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;

-- Lettura: soli admin attivi e approvati, con lo stesso predicato del resto
-- del sistema invece di un confronto scritto a mano su `role` (è la deriva che
-- l'audit ha trovato su `clients`, dove le policy interrogano la colonna
-- direttamente e non passano da private.is_admin()).
drop policy if exists "audit_log_select" on public.audit_log;
create policy "audit_log_select" on public.audit_log
  for select to authenticated
  using ((select private.is_admin()));

-- APPEND-ONLY PER COSTRUZIONE. Non serve un trigger come su lista_history:
-- qui non esiste NESSUNA policy di insert/update/delete per `authenticated`,
-- e con la RLS attiva l'assenza di policy è già il divieto. Si scrive solo
-- attraverso la funzione qui sotto (SECURITY DEFINER) o con la service_role
-- dalle Edge Function, che la RLS non attraversano.
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

comment on table public.audit_log is
  'Registro append-only delle operazioni privilegiate (A-2 dell''audit '
  'sicurezza del 26 agosto). Lettura: soli admin. Scrittura: solo via '
  'public.registra_audit() o service_role. `details` non deve contenere PII.';

-- ─── LA PORTA DI SCRITTURA ────────────────────────────────────────────────
create or replace function public.registra_audit(
  p_action      text,
  p_target_type text default null,
  p_target_id   text default null,
  p_details     jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := (select auth.uid());
  v_nome text;
  v_id   uuid;
begin
  if v_me is null then
    raise exception 'Non autenticato.';
  end if;

  select name into v_nome from public.users where id = v_me;

  -- L'attore è `auth.uid()`, MAI un parametro. È l'unica riga che impedisce a
  -- un chiamante di firmare una voce col nome di qualcun altro — e la ragione
  -- per cui questa funzione esiste invece di un GRANT INSERT sulla tabella.
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, details)
  values (v_me, v_nome, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;

  return v_id;
end $$;

revoke execute on function public.registra_audit(text,text,text,jsonb) from anon, public;
grant   execute on function public.registra_audit(text,text,text,jsonb) to authenticated;

-- Helper interno per i trigger: come sopra ma tollerante al chiamante senza
-- sessione (un job, la service_role), dove `auth.uid()` è null e sollevare
-- farebbe fallire l'operazione che si sta cercando di registrare.
create or replace function private.audit(
  p_action text, p_target_type text, p_target_id text, p_details jsonb
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := (select auth.uid());
  v_nome text;
begin
  select name into v_nome from public.users where id = v_me;
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, details)
  values (v_me, v_nome, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb));
end $$;

-- ─── CHI CAMBIA I PRIVILEGI DI UN MEMBRO ──────────────────────────────────
-- Il caso che l'audit chiama «cambio ruolo». Sta in un trigger e non nel
-- registry di persistenza del client per la ragione detta in cima: qui cattura
-- ogni percorso, compresa una PATCH diretta a /rest/v1/users.
--
-- Si registrano solo le colonne che decidono cosa un utente può fare. Nome,
-- avatar e colore cambiano spesso e non spostano alcun privilegio: metterli
-- qui riempirebbe il registro di rumore, che è il modo in cui un registro
-- smette di essere letto.
create or replace function public.audit_users_privilegi()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_diff jsonb := '{}'::jsonb;
begin
  if new.role      is distinct from old.role      then v_diff := v_diff || jsonb_build_object('role',      jsonb_build_array(old.role, new.role)); end if;
  if new.active    is distinct from old.active    then v_diff := v_diff || jsonb_build_object('active',    jsonb_build_array(old.active, new.active)); end if;
  if new.pending   is distinct from old.pending   then v_diff := v_diff || jsonb_build_object('pending',   jsonb_build_array(old.pending, new.pending)); end if;
  if new.seniority is distinct from old.seniority then v_diff := v_diff || jsonb_build_object('seniority', jsonb_build_array(old.seniority, new.seniority)); end if;
  if new.capacity  is distinct from old.capacity  then v_diff := v_diff || jsonb_build_object('capacity',  jsonb_build_array(old.capacity, new.capacity)); end if;

  if v_diff <> '{}'::jsonb then
    perform private.audit('user.privilegi', 'user', new.id::text, v_diff);
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_users_privilegi on public.users;
create trigger trg_audit_users_privilegi
  after update on public.users
  for each row execute function public.audit_users_privilegi();

create or replace function public.audit_users_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Il nome del cancellato è l'unico dato personale in tutta la tabella, ed è
  -- qui deliberatamente: senza, la voce direbbe «è stato eliminato un utente»
  -- e l'id di una riga che non esiste più, cioè niente. È la stessa eccezione
  -- che `actor_name` fa per l'attore, e per lo stesso motivo.
  perform private.audit('user.eliminato', 'user', old.id::text,
                        jsonb_build_object('name', old.name, 'role', old.role));
  return null;
end $$;

drop trigger if exists trg_audit_users_delete on public.users;
create trigger trg_audit_users_delete
  after delete on public.users
  for each row execute function public.audit_users_delete();

-- ─── ANAGRAFICA: ELIMINAZIONI E SCRITTURE MASSIVE ─────────────────────────
-- Trigger di STATEMENT con transition table, non di riga: un import di 800
-- clienti deve produrre UNA voce «importati 800», non 800 voci. È anche il
-- motivo per cui questi due coprono `importa_backup` senza che la sua
-- definizione venga toccata — la RPC inserisce in `clients`, e il registro
-- guarda l'effetto invece del chiamante.
create or replace function public.audit_clients_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n int;
begin
  select count(*) into v_n from nuove;
  -- Una riga sola è la creazione di un cliente dalla scheda: già visibile
  -- nell'anagrafica, e non è un'operazione privilegiata. Da due in su è un
  -- import (ClientImportModal o importa_backup), che lo è.
  if v_n > 1 then
    perform private.audit('clienti.import', 'clients', null, jsonb_build_object('righe', v_n));
  end if;
  return null;
end $$;

drop trigger if exists trg_audit_clients_insert on public.clients;
create trigger trg_audit_clients_insert
  after insert on public.clients
  referencing new table as nuove
  for each statement execute function public.audit_clients_insert();

create or replace function public.audit_clients_delete()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_n int;
begin
  select count(*) into v_n from rimosse;
  -- Nessun nome, nessuna email: `details` non porta PII (vedi il commento
  -- sulla colonna). Per un'eliminazione l'informazione che serve a chi
  -- amministra è che è avvenuta, quando, e per mano di chi.
  perform private.audit('clienti.eliminati', 'clients', null, jsonb_build_object('righe', v_n));
  return null;
end $$;

drop trigger if exists trg_audit_clients_delete on public.clients;
create trigger trg_audit_clients_delete
  after delete on public.clients
  referencing old table as rimosse
  for each statement execute function public.audit_clients_delete();

-- ─── RESET TOTALE DEL MODULO LISTE ────────────────────────────────────────
-- `reset_completo()` fa TRUNCATE su quattro tabelle. Un trigger di TRUNCATE lo
-- registra senza che la RPC venga riscritta: aggiungere una riga dentro un
-- corpo SECURITY DEFINER di 1,5 kB, per giunta trascrivendolo a mano in una
-- migrazione, è un rischio sproporzionato rispetto a osservarne l'effetto da
-- fuori. Vale anche per il ramo di ripiego della RPC (DELETE al posto di
-- TRUNCATE quando manca il privilegio), che passa comunque dal `liste_guard_delete`.
create or replace function public.audit_liste_truncate()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  perform private.audit('liste.reset_totale', 'liste_viaggio', null,
                        jsonb_build_object('tabella', tg_table_name));
  return null;
end $$;

drop trigger if exists trg_audit_liste_truncate on public.liste_viaggio;
create trigger trg_audit_liste_truncate
  after truncate on public.liste_viaggio
  for each statement execute function public.audit_liste_truncate();
