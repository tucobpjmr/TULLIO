-- Sotto-livello degli agent: users.seniority ('senior' | 'junior').
--
-- PERCHÉ SERVE UNA COLONNA. La matrice permessi (lib/permissions.js) distingue
-- Junior Agent da Senior Agent, ma users.role accetta quattro valori soli
-- (admin|manager|agent|driver) e tutti gli helper di autorizzazione lato DB li
-- confrontano per uguaglianza esatta. Il sotto-ruolo veniva quindi codificato
-- nella label della UI ("Junior Agent") e appiattito su 'agent' al momento
-- dell'invito da AddTeamMemberModal/BulkInviteModal: per ogni utente reale
-- isJuniorAgent() era di fatto sempre falsa, e la restrizione documentata non
-- veniva applicata da nessuna parte. Qui il sotto-livello ottiene un posto
-- proprio, senza sovraccaricare la colonna su cui poggiano le RLS.
--
-- Default 'senior': è il comportamento che gli agent esistenti hanno oggi
-- (nessuno di loro è mai stato trattato come junior), quindi la migrazione non
-- toglie permessi a nessuno.

alter table public.users
  add column if not exists seniority text not null default 'senior';

alter table public.users
  drop constraint if exists users_seniority_check;

alter table public.users
  add constraint users_seniority_check
  check (seniority in ('senior', 'junior'));

comment on column public.users.seniority is
  'Sotto-livello per role=''agent'': junior ha permessi ridotti (solo task assegnati, niente categorie payment/admin). Ignorato per gli altri ruoli.';

-- seniority è un attributo di privilegio: va protetto dal self-update esattamente
-- come role/active/pending/capacity, altrimenti un junior si promuove da solo
-- con un PATCH su /rest/v1/users?id=eq.<proprio uuid>.
create or replace function public.users_block_privileged_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if private.is_admin() then
    return new;
  end if;
  new.role      := old.role;
  new.active    := old.active;
  new.pending   := old.pending;
  new.capacity  := old.capacity;
  new.seniority := old.seniority;
  new.id        := old.id;
  return new;
end;
$$;
