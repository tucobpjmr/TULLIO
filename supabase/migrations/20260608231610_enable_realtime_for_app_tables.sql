-- Aggiunge le tabelle alla publication supabase_realtime per abilitare
-- gli eventi postgres_changes consumati dal client.
-- Versione DB: 20260608231610
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.notices;
