-- Espone quali migrazioni sono state applicate, per il controllo di scarto
-- repository↔produzione (S-05).
--
-- PERCHÉ SERVE. Le migrazioni di questo progetto si applicano a mano: lo
-- scarto tra supabase/migrations/ e il database non è un caso limite, è già
-- successo più volte (vedi scripts/verifica-rpc/index.js, e la stessa analisi
-- che ha portato a questa migrazione ha trovato — e corretto in produzione —
-- due migrazioni presenti nel repository ma mai applicate:
-- 20260804230000_set_updated_at_search_path e 20260806090000_liste_realtime).
-- verifica-rpc controlla solo il sintomo indiretto (una RPC chiamata dal
-- frontend che risulta assente): una migrazione che tocca solo RLS, grant o
-- colonne senza introdurre una nuova RPC passava inosservata. Questa funzione
-- lascia leggere da CI cosa risulta applicato, per confrontarlo con i file nel
-- repository.
--
-- PERCHÉ È SICURO ESPORLA AD ANON. `supabase_migrations.schema_migrations`
-- non è raggiungibile da PostgREST (schema non esposto), quindi serve una
-- funzione ponte. version/name sono gli stessi nomi dei file già pubblici nel
-- repository Git — non c'è niente qui che non sia già leggibile da chiunque
-- clona il repo. Non esponiamo la colonna `statements` (il testo SQL
-- applicato): non serve al confronto e non ha motivo di uscire dal progetto
-- Supabase. Stesso ragionamento già applicato alla chiave anon stessa in
-- verifica-rpc.yml e keep-supabase-warm.yml: protetta da RLS/dal fatto di non
-- essere un segreto, non da segretezza.
create or replace function public.get_migrazioni_applicate()
returns table(version text, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.version, m.name
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;

revoke all on function public.get_migrazioni_applicate() from public;
grant execute on function public.get_migrazioni_applicate() to anon, authenticated;
