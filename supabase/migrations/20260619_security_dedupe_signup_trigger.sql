-- Hardening sicurezza (blocco 1, parte C)
-- Versione DB: 20260619
--
-- 1. Deduplica i trigger di signup su auth.users. La versione completa
--    (handle_new_auth_user: genera avatar/colore/capacity + user_contacts)
--    era applicata direttamente in produzione ma non tracciata nel repo,
--    mentre la vecchia handle_new_user (repo 20260605160705) restava attiva
--    in parallelo. Codifichiamo la versione buona e rimuoviamo la ridondante.
-- 2. Revoca EXECUTE sulla funzione trigger dai ruoli client (advisor
--    anon/authenticated_security_definer_function_executable). Il trigger
--    continua a scattare: l'EXECUTE serve solo a chiamarla via RPC.
--
-- NOTA: is_admin()/is_manager_or_admin() mantengono EXECUTE per authenticated
-- di proposito: sono usate dentro le policy RLS (revocarle romperebbe ogni
-- query) e rivelano solo il ruolo del chiamante stesso → nessuna esposizione
-- dati. L'advisor che le segnala è un falso positivo per funzioni-helper RLS.

-- 1a. Codifica la funzione completa nel repo (idempotente, stesso corpo prod)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  meta  jsonb := NEW.raw_user_meta_data;
  uname text; urole text; ucap int; ucol text; uavat text; parts text[];
BEGIN
  uname := COALESCE(meta->>'name', split_part(NEW.email, '@', 1));
  urole := CASE WHEN meta->>'role' IN ('admin','manager','agent','driver')
                THEN meta->>'role' ELSE 'agent' END;
  ucap  := COALESCE((meta->>'capacity')::int, 8);
  ucol  := COALESCE(meta->>'color', '#3B82F6');
  SELECT array_agg(word) INTO parts FROM unnest(string_to_array(uname, ' ')) AS word;
  uavat := UPPER(LEFT(COALESCE(parts[1], ''), 1) ||
                 LEFT(COALESCE(parts[2], RIGHT(COALESCE(parts[1], '  '), 1)), 1));
  INSERT INTO public.users (id, name, role, avatar, color, capacity, pending, active)
  VALUES (NEW.id, uname, urole, uavat, ucol, ucap, true, false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_contacts (user_id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- 1b. Assicura il trigger della versione completa
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 1c. Rimuove la versione ridondante (vecchia, repo 20260605160705)
DROP TRIGGER IF EXISTS trg_on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- 2. Revoca EXECUTE dai ruoli client sulla funzione trigger
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;
