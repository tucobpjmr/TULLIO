-- Revoca i permessi EXECUTE da PUBLIC/anon/authenticated sulle funzioni
-- trigger e cron (non devono essere chiamabili direttamente dai client).
-- Versione DB: 20260613092355
revoke execute on function public.notify_task_assigned()  from public, anon, authenticated;
revoke execute on function public.notify_task_comment()   from public, anon, authenticated;
revoke execute on function public.notify_task_due()        from public, anon, authenticated;
revoke execute on function public.notify_queue_stale()     from public, anon, authenticated;
revoke execute on function public.next_dossier_number()                 from public, anon;
revoke execute on function public.messages_mark_read(uuid, uuid, uuid)  from public, anon;
revoke execute on function public.is_admin()            from anon;
revoke execute on function public.is_manager_or_admin() from anon;
