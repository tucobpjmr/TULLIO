-- ─── A-1 dell'analisi del 6 novembre · `created_by` e `created_at` dei task non si riscrivono
--
-- COSA SI ROMPEVA. `trg_tasks_set_created_by` fissa l'autore solo in INSERT, e
-- `authenticated` ha il grant UPDATE su tutte le colonne di `tasks`. Il WITH
-- CHECK di `tasks_update` accetta la riga nuova se `created_by = auth.uid()`:
-- chi poteva aggiornare un task (assegnatario, o un agent sulla coda globale)
-- poteva quindi scriversi come autore con una PATCH. Da lì il ramo
-- `created_by = auth.uid()` di `tasks_select`/`tasks_update` gli lasciava
-- lettura e modifica anche dopo una riassegnazione, e l'autore risultava falso.
-- L'app non scrive mai queste due colonne in UPDATE (`toDbTaskPatch` in
-- src/lib/mappers.js non le conosce), quindi il divieto non tocca nessun
-- percorso legittimo.
--
-- COSA FA ORA. Un trigger BEFORE UPDATE rifiuta con `insufficient_privilege`
-- ogni cambio di `created_by` o `created_at` chiesto dai ruoli dell'API.
--
-- ⚠️ PERCHÉ IL CONTROLLO GUARDA `current_user`. La FK `tasks_created_by_fkey`
-- è `ON DELETE SET NULL`: eliminare un utente (delete-user, o la DELETE di un
-- admin su public.users) fa una UPDATE di `created_by` a NULL sui suoi task, e
-- quella UPDATE accende questo trigger. Postgres la esegue come proprietario
-- della tabella, non come `authenticated`: lasciar passare tutto ciò che non è
-- un ruolo dell'API tiene in vita la cascata (e service_role e le migrazioni),
-- senza aprire niente a chi arriva da PostgREST. Provato su un Postgres locale
-- (PGlite) con lo schema minimo di produzione: la DELETE di un admin su
-- public.users fa passare la cascata, la PATCH diretta di un utente no.
--
-- Il caso che lo lega al database è in src/test/integration/rls.test.js
-- («created_by non si riscrive»).
--
-- Idempotente: `create or replace` e `drop trigger if exists`.

create or replace function private.tasks_campi_immutabili()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'created_by e created_at di un task non sono modificabili'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.tasks_campi_immutabili() from public, anon, authenticated;

drop trigger if exists trg_tasks_campi_immutabili on public.tasks;
create trigger trg_tasks_campi_immutabili
  before update on public.tasks
  for each row execute function private.tasks_campi_immutabili();
