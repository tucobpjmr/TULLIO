-- B-1 (audit del 22 agosto) — Least privilege per `authenticated`, gemella
-- della 20260806170000 (che ha fatto lo stesso lavoro per `anon`).
--
-- LA SITUAZIONE. `authenticated` conserva i GRANT di default di Supabase
-- (GRANT ALL ON ALL TABLES), che includono TRUNCATE, TRIGGER e REFERENCES
-- oltre a SELECT/INSERT/UPDATE/DELETE. Non è sfruttabile via PostgREST, che
-- emette solo le quattro DML, e il ruolo non è assumibile da fuori: la
-- gravità è bassa. Ma TRUNCATE ignora la RLS *per definizione* — è l'unico
-- privilegio concesso qui che l'intera strategia di sicurezza del progetto
-- (RLS + rls_active_only) non copre.
--
-- COSA RESTA. SELECT/INSERT/UPDATE/DELETE: sono ciò che PostgREST usa, e
-- sono già filtrati dalle policy. TRIGGER e REFERENCES sono DDL e non
-- servono a un client via PostgREST.
--
-- COSA NON TOCCA. reset_completo() usa TRUNCATE ma è SECURITY DEFINER — gira
-- con i privilegi del proprietario, non di `authenticated` — e ha già un
-- ramo EXCEPTION WHEN insufficient_privilege che ripiega su DELETE.
revoke truncate, trigger, references
  on all tables in schema public
  from authenticated;

-- Anche per le tabelle future, così non si riapre alla prossima migrazione.
alter default privileges in schema public
  revoke truncate, trigger, references on tables from authenticated;
