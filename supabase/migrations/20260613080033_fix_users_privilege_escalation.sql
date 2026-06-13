-- Blocca l'escalation di privilegi via self-update: un utente non-admin
-- non può modificare il proprio ruolo, stato active/pending o capacity.
-- Versione DB: 20260613080033
create or replace function public.users_block_privileged_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.is_admin() then
    return new;
  end if;
  new.role     := old.role;
  new.active   := old.active;
  new.pending  := old.pending;
  new.capacity := old.capacity;
  new.id       := old.id;
  return new;
end;
$$;

drop trigger if exists trg_users_block_privileged_self_update on public.users;
create trigger trg_users_block_privileged_self_update
  before update on public.users
  for each row execute function public.users_block_privileged_self_update();

revoke update on public.users from anon;
