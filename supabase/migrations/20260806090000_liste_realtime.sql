-- Pubblica le tabelle del modulo Liste viaggio su supabase_realtime.
--
-- PERCHÉ. Il modulo era l'unico sottosistema senza realtime: due utenti sulla
-- stessa lista non si vedevano a vicenda, e ogni scrittura richiedeva un
-- refetch manuale di tre query lato client (list + listTrash + saldi) perché
-- non arrivava nessun evento a dire che qualcosa era cambiato. Tutte le altre
-- tabelle di dominio (tasks, comments, notices, categories, users,
-- conversations, messages, notifications, task_history) sono pubblicate da
-- tempo: questa migrazione allinea le ultime due.
--
-- Idempotente: `alter publication ... add table` fallisce se la tabella è già
-- pubblicata, quindi si verifica prima in pg_publication_tables.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'liste_viaggio'
  ) then
    execute 'alter publication supabase_realtime add table public.liste_viaggio';
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'movimenti_lista'
  ) then
    execute 'alter publication supabase_realtime add table public.movimenti_lista';
  end if;
end $$;
