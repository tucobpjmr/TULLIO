-- MODULO BUONI / LISTE VIAGGIO
-- Tabelle isolate, nessuna modifica alle tabelle esistenti

-- 1. Liste (una per cliente, un cliente può averne più di una nel tempo)
create table public.liste_viaggio (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  titolo text,
  stato text not null default 'attiva' check (stato in ('attiva','esaurita')),
  note text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  deleted_at timestamptz
);

-- 2. Movimenti (importo positivo = versamento/buono, negativo = utilizzo)
create table public.movimenti_lista (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.liste_viaggio(id),
  data_movimento date not null default current_date,
  descrizione text not null,
  importo numeric(12,2) not null check (importo <> 0),
  metodo text check (metodo in ('pos','bonifico','contanti','assegno','altro')),
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_movimenti_lista_id on public.movimenti_lista(lista_id);
create index idx_liste_client_id on public.liste_viaggio(client_id);

-- 3. Storico modifiche (audit, stesso pattern di task_history)
create table public.lista_history (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.liste_viaggio(id),
  movimento_id uuid references public.movimenti_lista(id),
  actor_id uuid references public.users(id),
  action text not null,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create index idx_lista_history_lista_id on public.lista_history(lista_id);

-- 4. Vista saldi: calcolo automatico del saldo per lista
create view public.liste_saldi with (security_invoker = true) as
select
  l.id as lista_id,
  l.client_id,
  l.stato,
  coalesce(sum(m.importo) filter (where m.deleted_at is null), 0) as saldo,
  count(m.id) filter (where m.deleted_at is null) as num_movimenti,
  max(m.data_movimento) filter (where m.deleted_at is null) as ultimo_movimento
from public.liste_viaggio l
left join public.movimenti_lista m on m.lista_id = l.id
where l.deleted_at is null
group by l.id, l.client_id, l.stato;

-- 5. Trigger updated_at
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger trg_liste_updated before update on public.liste_viaggio
  for each row execute function public.set_updated_at();
create trigger trg_movimenti_updated before update on public.movimenti_lista
  for each row execute function public.set_updated_at();

-- 6. Sicurezza: RLS attiva, solo utenti autenticati e attivi, nessuna DELETE fisica
alter table public.liste_viaggio enable row level security;
alter table public.movimenti_lista enable row level security;
alter table public.lista_history enable row level security;

create policy "liste_select" on public.liste_viaggio for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.active));
create policy "liste_insert" on public.liste_viaggio for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.active));
create policy "liste_update" on public.liste_viaggio for update to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.active));

create policy "movimenti_select" on public.movimenti_lista for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.active));
create policy "movimenti_insert" on public.movimenti_lista for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.active));
create policy "movimenti_update" on public.movimenti_lista for update to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.active));

create policy "history_select" on public.lista_history for select to authenticated
  using (exists (select 1 from public.users u where u.id = auth.uid() and u.active));
create policy "history_insert" on public.lista_history for insert to authenticated
  with check (exists (select 1 from public.users u where u.id = auth.uid() and u.active));
-- Nessuna policy DELETE: cancellazione fisica impossibile via API
