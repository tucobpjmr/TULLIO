-- Fase 3 (mono-agenzia) — Security hardening accesso ~15 utenti.
-- Chiude i WARN del Security Advisor non ancora coperti da
-- 20260613092355_revoke_rpc_execute.sql (funzioni aggiunte dopo: notify
-- menzioni messaggi, autonumber pratiche, default created_by task).
--
-- NOTA: scelte deliberate (NON toccate qui):
--   • messages_mark_read(uuid,uuid,uuid): resta EXECUTE→authenticated,
--     è una RPC usata dal client (src/lib/api.js).
--   • is_admin() / is_manager_or_admin(): restano EXECUTE→authenticated,
--     sono helper invocati dalle policy RLS (revocarli romperebbe le RLS).
--   • Leaked Password Protection: va abilitata da Dashboard
--     (Auth → Policies), non via SQL.

-- ── 1) search_path immutabile (lint 0011) ─────────────────────────────────
-- Evita l'hijack del search_path: fissa lo schema a public, pg_temp.
alter function public.touch_notices_updated_at()                 set search_path = public, pg_temp;
alter function public.next_dossier_number()                      set search_path = public, pg_temp;
alter function public.generate_dossier_number()                  set search_path = public, pg_temp;
alter function public.tasks_set_created_by()                     set search_path = public, pg_temp;
alter function public.messages_mark_read(uuid, uuid, uuid)       set search_path = public, pg_temp;

-- ── 2) Revoca EXECUTE RPC su funzioni trigger-only (lint 0028/0029) ────────
-- I trigger eseguono come owner della tabella: revocare l'EXECUTE diretto
-- chiude la superficie RPC senza impattare i trigger.
revoke execute on function public.notify_message_mention()   from public, anon, authenticated;
revoke execute on function public.generate_dossier_number()  from public, anon, authenticated;
revoke execute on function public.tasks_set_created_by()     from public, anon, authenticated;
-- next_dossier_number era già revocata da public, anon (20260613092355):
-- completa togliendo anche authenticated.
revoke execute on function public.next_dossier_number()      from authenticated;
