-- ─── M-3 dell'analisi del 16 novembre · un commento non cambia task né autore
--
-- COSA SI ROMPEVA. `comments_update_own` guarda solo `user_id` (USING e WITH
-- CHECK). L'autore di un commento poteva cambiarne `task_id` e spostarlo in un
-- task che non vede: `comments_insert` gli avrebbe rifiutato quella scrittura,
-- l'UPDATE no. Un admin poteva anche riscrivere `user_id` e attribuire il
-- commento a un altro. L'app non fa mai UPDATE su `comments` (lib/api/task.js
-- legge e inserisce soltanto).
--
-- COSA FA ORA. Un trigger BEFORE UPDATE rifiuta con `insufficient_privilege`
-- ogni cambio di `task_id`, `user_id` o `created_at` chiesto dai ruoli
-- dell'API. Stesso modello di `private.tasks_campi_immutabili`: ciò che non è
-- `authenticated`/`anon` (service_role, migrazioni) passa.
--
-- Il caso che lo lega al database è in src/test/integration/rlsChatAllegatiCommenti.test.js
-- («Commenti — task e autore non si riscrivono»).
--
-- Idempotente: `create or replace` e `drop trigger if exists`.

create or replace function private.comments_campi_immutabili()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if new.task_id is distinct from old.task_id
     or new.user_id is distinct from old.user_id
     or new.created_at is distinct from old.created_at then
    raise exception 'task_id, user_id e created_at di un commento non sono modificabili'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke all on function private.comments_campi_immutabili() from public, anon, authenticated;

drop trigger if exists trg_comments_campi_immutabili on public.comments;
create trigger trg_comments_campi_immutabili
  before update on public.comments
  for each row execute function private.comments_campi_immutabili();
