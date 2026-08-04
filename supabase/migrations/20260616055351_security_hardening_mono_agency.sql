-- Fase 3 (mono-agenzia) — Security hardening accesso ~15 utenti.
alter function public.touch_notices_updated_at()                 set search_path = public, pg_temp;
alter function public.next_dossier_number()                      set search_path = public, pg_temp;
alter function public.generate_dossier_number()                  set search_path = public, pg_temp;
alter function public.tasks_set_created_by()                     set search_path = public, pg_temp;
alter function public.messages_mark_read(uuid, uuid, uuid)       set search_path = public, pg_temp;

revoke execute on function public.notify_message_mention()   from public, anon, authenticated;
revoke execute on function public.generate_dossier_number()  from public, anon, authenticated;
revoke execute on function public.tasks_set_created_by()     from public, anon, authenticated;
revoke execute on function public.next_dossier_number()      from authenticated;
