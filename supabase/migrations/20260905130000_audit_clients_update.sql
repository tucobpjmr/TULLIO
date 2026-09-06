-- M-2 dell'audit del 5 settembre.
--
-- Su `clients` c'erano due trigger — INSERT (solo import multi-riga) e
-- DELETE. Non c'era UPDATE: nome, email, telefono, indirizzo e note di 885
-- persone esterne al team si modificavano senza traccia. `tasks` ha
-- log_task_history su ogni UPDATE, `liste_viaggio` ha lista_history nella
-- stessa transazione della modifica — `clients`, che porta i dati personali,
-- era l'unica delle tre senza.
--
-- ⚠️ IL REGISTRO NON PORTA PII, ed è la regola che tiene il rimedio dal
-- diventare il problema. `audit_log.details` registra QUALI CAMPI sono
-- cambiati, mai i valori: un registro che copiasse la vecchia email accanto
-- alla nuova duplicherebbe il dato personale in una tabella con una
-- retention e una policy diverse — cioè peggiorerebbe esattamente la cosa
-- che vuole proteggere. Chi ha bisogno del valore precedente ha `updated_at`
-- e un backup; chi indaga ha bisogno di sapere chi, quando e cosa.
create or replace function public.audit_clients_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare v_campi text[] := '{}';
begin
  -- array_append, non `||` con un literal nudo: `text[] || 'x'` risolve
  -- l'overload anyarray/anyarray e prova a leggere 'x' come literal di
  -- array — fallisce con "malformed array literal", trovato eseguendo
  -- questa stessa funzione su staging prima di applicarla in produzione.
  -- Stessa forma già in uso altrove nel progetto (step_j_fix4.sql e simili).
  if new.name    is distinct from old.name    then v_campi := array_append(v_campi, 'name');    end if;
  if new.email   is distinct from old.email   then v_campi := array_append(v_campi, 'email');   end if;
  if new.phone   is distinct from old.phone   then v_campi := array_append(v_campi, 'phone');   end if;
  if new.address is distinct from old.address then v_campi := array_append(v_campi, 'address'); end if;
  if new.city    is distinct from old.city    then v_campi := array_append(v_campi, 'city');    end if;
  if new.notes   is distinct from old.notes   then v_campi := array_append(v_campi, 'notes');   end if;
  if array_length(v_campi, 1) is not null then
    perform private.audit('cliente.modificato', 'client', new.id::text,
                          jsonb_build_object('campi', to_jsonb(v_campi)));
  end if;
  return null;
end $$;

-- La revoca è parte della migrazione, non un passo successivo: M-3 del 4
-- settembre è nato dalle cinque funzioni trigger create senza.
revoke execute on function public.audit_clients_update() from public, anon, authenticated;

drop trigger if exists trg_audit_clients_update on public.clients;
create trigger trg_audit_clients_update
  after update on public.clients
  for each row execute function public.audit_clients_update();

-- ─── La sonda: rende lo zero di audit_log interpretabile ───────────────────
--
-- `audit_log` a zero righe era compatibile con «nessuno ha fatto niente di
-- registrabile» e con «i trigger hanno smesso di scrivere», e nessuno script
-- distingueva i due casi. Questa funzione scrive DAVVERO — un cliente di
-- prova, un UPDATE — e verifica che il trigger qui sopra abbia registrato la
-- modifica, poi annulla INSERT e UPDATE con un rollback interno prima di
-- ritornare: nessuna riga sopravvive alla chiamata, qualunque sia l'esito.
--
-- Il rollback è un blocco begin/exception: in PL/pgSQL è un SAVEPOINT
-- implicito, quindi le variabili locali (v_trovati) sopravvivono
-- all'eccezione mentre le scritture sul database vengono annullate — è lo
-- stesso principio del dry-run transazionale di docs/MIGRAZIONI_SUPABASE.md,
-- incapsulato in una funzione sola così può girare da CI senza una
-- connessione Postgres diretta, con le sole credenziali già in
-- .github/workflows/rls.yml.
--
-- SECURITY DEFINER perché deve scrivere `clients` e leggere `audit_log` a
-- prescindere dal ruolo di chi chiama: il meccanismo che verifica non è
-- quello dei permessi su `clients` (già coperto da B-1/RLS), è che il
-- TRIGGER scriva. Aperta a `authenticated` — non ad `anon` — perché non ha
-- nulla da proteggere (nome/note fissi, nessun dato restituito oltre un
-- conteggio) ma richiede comunque un login valido.
create or replace function public.sonda_audit_clients_update()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_trovati int;
begin
  begin
    insert into public.clients (name) values ('__sonda_audit__') returning id into v_id;
    update public.clients set notes = '__sonda__' where id = v_id;
    select count(*) into v_trovati from public.audit_log
      where action = 'cliente.modificato' and target_id = v_id::text;
    raise exception '__sonda_rollback__';
  exception when others then
    if sqlerrm <> '__sonda_rollback__' then raise; end if;
  end;
  return v_trovati;
end $$;

revoke execute on function public.sonda_audit_clients_update() from public, anon;
grant execute on function public.sonda_audit_clients_update() to authenticated;

comment on function public.sonda_audit_clients_update() is
  'Sonda per M-2 dell''audit del 5 settembre: inserisce e aggiorna un '
  'cliente di prova, conta le righe che trg_audit_clients_update ha scritto '
  'in audit_log, poi annulla tutto con un rollback interno. Ritorna 1 se il '
  'trigger funziona, 0 se ha smesso di scrivere. Nessuna riga sopravvive '
  'alla chiamata. Usata da scripts/verifica-audit-vivo/index.js.';
