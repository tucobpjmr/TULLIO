-- B-2 dell'audit del 2 settembre (prosegue M-3 del 31 agosto). Le Edge
-- Function privilegiate (invite-user, delete-user, set-user-active) e quella
-- self-service (delete-account) verificano CHI chiama e non QUANTO: un token
-- admin compromesso può svuotare la quota SMTP invitando a raffica, o
-- bannare l'intero team in un ciclo. Nessuna gira su un runtime che
-- sopravvive fra due invocazioni (Deno Deploy ricicla l'isolate), quindi il
-- conteggio vive nel database e non in memoria.
--
-- `send-push` resta fuori: non è "esposta al browser" come le altre quattro
-- — la chiama solo il trigger DB via pg_net, con l'header x-push-secret a
-- fare da unica autorizzazione — e non ha un ID di CHIAMANTE a cui legare un
-- secchio (il `user_id` nel payload è il DESTINATARIO della notifica, non chi
-- ha invocato la funzione). Limitare quello sarebbe una feature diversa
-- (un tetto di notifiche per destinatario), non la stessa correzione.

create table if not exists public.rate_limit (
  chiave    text        not null,
  finestra  timestamptz not null,
  conteggio int         not null default 0,
  primary key (chiave, finestra)
);

comment on table public.rate_limit is
  'Contatore per il rate limiting delle Edge Function privilegiate (B-2 '
  'dell''audit del 2 settembre). Chiave tipica: "<funzione>:<id chiamante>". '
  'Nessuna policy di riga: solo le Edge Function con service_role ci scrivono '
  '(tramite rate_limit_incrementa), e con RLS attiva l''assenza di policy è '
  'già il divieto per anon/authenticated — stesso ragionamento di '
  'error_reports.';

alter table public.rate_limit enable row level security;

create index if not exists rate_limit_finestra on public.rate_limit (finestra);

-- Insert+update atomico in un solo giro di rete: `on conflict do update`
-- invece di leggere-poi-scrivere, che sotto due richieste quasi simultanee
-- dello stesso chiamante conterebbe la stessa finestra due volte in modo
-- diverso a seconda di chi vince la corsa.
create or replace function public.rate_limit_incrementa(
  p_chiave          text,
  p_finestra_minuti int,
  p_soglia          int
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_finestra_s int := greatest(p_finestra_minuti, 1) * 60;
  v_finestra   timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / v_finestra_s) * v_finestra_s);
  v_conteggio  int;
begin
  insert into public.rate_limit (chiave, finestra, conteggio)
  values (p_chiave, v_finestra, 1)
  on conflict (chiave, finestra) do update set conteggio = rate_limit.conteggio + 1
  returning conteggio into v_conteggio;

  -- Potatura opportunistica: una chiamata su cento paga la cancellazione
  -- delle finestre più vecchie di un giorno. Stessa forma di
  -- segnala_errore_client (C-1) — niente pg_cron (non disponibile sul piano
  -- Free), niente da ricordarsi.
  if random() < 0.01 then
    delete from public.rate_limit where finestra < now() - interval '1 day';
  end if;

  return v_conteggio <= p_soglia;
end $$;

revoke execute on function public.rate_limit_incrementa(text, int, int) from public;
grant   execute on function public.rate_limit_incrementa(text, int, int) to service_role;
