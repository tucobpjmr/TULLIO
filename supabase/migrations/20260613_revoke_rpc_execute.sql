-- 2026-06-13 — HARDENING: revoca EXECUTE sulle funzioni esposte via PostgREST RPC
--
-- L'advisor Supabase (0028/0029) segnalava funzioni SECURITY DEFINER richiamabili
-- da anon/authenticated via /rest/v1/rpc/<fn>. In particolare notify_task_due() e
-- notify_queue_stale() (no-arg) potevano essere invocate da chiunque per generare
-- spam di notifiche; le trigger-function e next_dossier_number erano comunque
-- esposte senza motivo.
--
-- Note importanti:
--  * Le TRIGGER function (notify_task_assigned/comment) continuano a funzionare
--    via trigger anche senza EXECUTE: chi esegue lo statement che fa scattare il
--    trigger NON deve avere privilegi sulla funzione.
--  * I job pg_cron (notify_task_due/queue_stale) girano come owner (postgres),
--    quindi la revoca non li tocca.
--  * is_admin()/is_manager_or_admin() sono usate DENTRO le policy RLS: il ruolo
--    che interroga le tabelle DEVE poterle eseguire (vedi 20260610_step_j_fix),
--    perciò si MANTIENE EXECUTE ad authenticated e si revoca solo ad anon.
--  * messages_mark_read e next_dossier_number restano eseguibili da authenticated
--    (la prima è usata dal client per le spunte di lettura; la seconda servirà
--    alla creazione pratiche), ma non più da anon/PUBLIC.

-- ── Trigger function + job cron: solo server-side ──────────────────────────
revoke execute on function public.notify_task_assigned()  from public, anon, authenticated;
revoke execute on function public.notify_task_comment()   from public, anon, authenticated;
revoke execute on function public.notify_task_due()        from public, anon, authenticated;
revoke execute on function public.notify_queue_stale()     from public, anon, authenticated;

-- ── Funzioni utili al client/feature: via anon e PUBLIC, mai senza login ───
revoke execute on function public.next_dossier_number()                 from public, anon;
revoke execute on function public.messages_mark_read(uuid, uuid, uuid)  from public, anon;

-- ── Helper RLS: tolto solo ad anon (authenticated serve alla valutazione RLS) ─
revoke execute on function public.is_admin()            from anon;
revoke execute on function public.is_manager_or_admin() from anon;

-- ── Trigger function introdotte in questa tornata di fix: solo trigger-only ──
-- (girano via trigger anche senza EXECUTE; non devono essere esposte come RPC)
-- Definite in 20260613_fix_users_privilege_escalation.sql e
-- 20260613_messages_read_receipts.sql, che per ordine timestamp girano prima.
revoke execute on function public.users_block_privileged_self_update()  from public, anon, authenticated;
revoke execute on function public.messages_guard_participant_update()   from public, anon, authenticated;
