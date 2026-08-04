-- set_updated_at: fissa search_path
--
-- PROBLEMA. `public.set_updated_at()` è l'unica funzione rimasta senza
-- `SET search_path` — l'advisor di sicurezza Supabase la segnala come
-- `function_search_path_mutable` (l'unico warning di quella famiglia sul
-- progetto: tutte le altre sono state sistemate nel giro di hardening
-- 20260707_fix_function_search_path).
--
-- PERCHÉ CONTA. La funzione è definita in 20260713174309_modulo_buoni_liste_viaggio
-- SENZA `security definer`, quindi gira con i privilegi di chi scatena il
-- trigger: non è una scalata di privilegi immediata. Il rischio è di
-- risoluzione dei nomi — con un search_path ereditato dalla sessione, un
-- oggetto omonimo in uno schema che precede `public` verrebbe risolto per
-- primo. `now()` qui è di `pg_catalog`, che sta sempre in testa e non è
-- dirottabile, quindi lo sfruttamento concreto è remoto; ma la funzione è
-- attaccata come trigger BEFORE UPDATE a tre tabelle del modulo Liste
-- (liste_viaggio, movimenti_lista, lista_history via i rispettivi trigger) e
-- lasciare l'unico avanzo aperto costringe chi legge l'advisor a rifare ogni
-- volta questa analisi. Meglio chiuderlo.
--
-- Corpo IDENTICO all'originale: cambia solo la clausola search_path. Le
-- funzioni sono sostituite in place con `create or replace`, quindi i trigger
-- già collegati continuano a puntare a questa senza essere ricreati.
--
-- `search_path = ''` (vuoto, come nelle altre funzioni già sistemate) obbliga a
-- qualificare ogni riferimento: qui non ce ne sono da qualificare, perché
-- `now()` sta in pg_catalog che resta comunque sempre visibile.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;
