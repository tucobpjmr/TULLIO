-- 2026-09-04 — M-3 dell'audit del 4 settembre
-- Le cinque funzioni trigger di audit tornano riservate a chi le esegue
-- davvero: il proprietario della tabella, non PUBLIC.
--
-- ─── COSA ERA APERTO ────────────────────────────────────────────────────────
--
-- `pg_proc.proacl` per tutte e cinque, verificato in produzione prima di
-- scrivere questa migrazione:
--
--   audit_clients_delete   → {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
--   audit_clients_insert   → idem
--   audit_liste_truncate   → idem
--   audit_users_delete     → idem
--   audit_users_privilegi  → idem
--
-- `=X/postgres` è il GRANT a PUBLIC. Sono le uniche funzioni SECURITY
-- DEFINER del progetto rimaste senza una revoca esplicita — ogni altra ce
-- l'ha (docs/SICUREZZA.md §1).
--
-- ─── PERCHÉ SI REVOCA COMUNQUE, CON SFRUTTABILITÀ BASSA ─────────────────────
--
-- Tutte e cinque hanno RETURNS trigger: PostgREST non espone le funzioni che
-- ritornano trigger su /rest/v1/rpc/<nome>, e Postgres stesso rifiuta di
-- chiamarle fuori da un contesto di trigger. L'advisor le segnala guardando
-- i privilegi, non la chiamabilità reale — è il verso giusto in cui sbagliare
-- per un advisor, ma non il verso giusto in cui lasciare un GRANT.
--
-- Si revoca comunque, per due ragioni che non dipendono dallo sfruttamento:
--   * è l'unico punto in cui la disciplina "revoca esplicita su ogni
--     definer" ha una falla, ed è il tipo di falla che il prossimo
--     `create function` copia dal vicino, per assenza di un esempio contrario;
--   * tiene acceso un WARN permanente nell'advisor per ciascuna delle
--     cinque: cinque WARN che non spariranno mai sono il modo in cui un
--     sesto, vero, passerebbe inosservato in mezzo a loro.
--
-- Il trigger continua a funzionare dopo la revoca: l'esecutore di una
-- trigger function è il PROPRIETARIO della tabella (qui `postgres`, non un
-- SECURITY DEFINER nel senso comune del termine), non il ruolo che ha
-- eseguito la INSERT/UPDATE/DELETE/TRUNCATE che l'ha innescata — motivo per
-- cui questa revoca, a differenza di una su una RPC del modulo Liste, non
-- rompe nulla che l'app chiami direttamente. Verificato prima di scrivere
-- questa migrazione: `pg_proc.proowner` per tutte e cinque è `postgres`.
--
-- `service_role` non viene toccato: ha il grant per appartenenza (è
-- superuser-like sul progetto) e non c'è bisogno di dichiararlo esplicito
-- qui come per una RPC con un vero chiamante — queste cinque non ne hanno
-- uno, il loro unico "chiamante" è il motore dei trigger.
--
-- Idempotente: REVOKE su un privilegio già assente non è un errore.

revoke execute on function public.audit_clients_delete()  from public, anon, authenticated;
revoke execute on function public.audit_clients_insert()  from public, anon, authenticated;
revoke execute on function public.audit_liste_truncate()  from public, anon, authenticated;
revoke execute on function public.audit_users_delete()    from public, anon, authenticated;
revoke execute on function public.audit_users_privilegi() from public, anon, authenticated;

comment on function public.audit_clients_delete() is
  'Trigger di audit su clients (DELETE). RETURNS trigger: non raggiungibile '
  'da /rest/v1/rpc, eseguita come proprietario della tabella (postgres) e '
  'non dal ruolo che ha innescato la DELETE. EXECUTE revocato a '
  'public/anon/authenticated dalla 20260904160804 (M-3 dell''audit del 4 '
  'settembre): era, con le altre quattro funzioni di audit, l''unica '
  'SECURITY DEFINER del progetto senza una revoca esplicita.';

comment on function public.audit_clients_insert() is
  'Trigger di audit su clients (INSERT). Vedi il commento su '
  'audit_clients_delete() per il perché della revoca EXECUTE '
  '(20260904160804, M-3 dell''audit del 4 settembre).';

comment on function public.audit_liste_truncate() is
  'Trigger di audit su liste_viaggio (TRUNCATE). Vedi il commento su '
  'audit_clients_delete() per il perché della revoca EXECUTE '
  '(20260904160804, M-3 dell''audit del 4 settembre).';

comment on function public.audit_users_delete() is
  'Trigger di audit su users (DELETE). Vedi il commento su '
  'audit_clients_delete() per il perché della revoca EXECUTE '
  '(20260904160804, M-3 dell''audit del 4 settembre).';

comment on function public.audit_users_privilegi() is
  'Trigger di audit su users (UPDATE, cambi di ruolo/attivazione). Vedi il '
  'commento su audit_clients_delete() per il perché della revoca EXECUTE '
  '(20260904160804, M-3 dell''audit del 4 settembre).';
