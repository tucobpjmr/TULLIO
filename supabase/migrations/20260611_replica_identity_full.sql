-- Fix review finding #1 (Step L): gli eventi DELETE realtime portano solo
-- payload.old, che con la replica identity di default contiene la sola
-- primary key. Con REPLICA IDENTITY FULL il vecchio row include anche
-- origin_client, permettendo a subscribeToTable di filtrare l'eco delle
-- DELETE auto-originate come già avviene per INSERT/UPDATE.
alter table public.tasks         replica identity full;
alter table public.notices       replica identity full;
alter table public.conversations replica identity full;
alter table public.messages      replica identity full;
