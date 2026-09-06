-- B-5 dell'audit del 5 settembre.
--
-- public.send_test_push() era l'unica porta privilegiata del progetto senza
-- rate limit: le quattro Edge Function passano tutte da rate_limit_incrementa
-- con una chiave per chiamante, questa no -- e ogni chiamata fa partire un
-- Web Push reale via notify_push -> pg_net -> send-push verso ogni
-- dispositivo registrato dell'utente. Cinque per ora: e' un pulsante "prova
-- la notifica", nessun uso reale ne chiede sei.
--
-- rate_limit_incrementa e' oggi service_role soltanto, ma chiamata da dentro
-- una SECURITY DEFINER di proprieta' di postgres il permesso non serve --
-- l'esecutore e' il proprietario -- verificato eseguendo, non dedotto.
create or replace function public.send_test_push() returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'non autenticato';
  end if;
  if not private.is_active_user() then
    raise exception 'utente non attivo';
  end if;

  if not public.rate_limit_incrementa('send-test-push:' || v_uid::text, 60, 5) then
    raise exception 'Troppe notifiche di prova: riprova fra un po''';
  end if;

  delete from public.notifications where user_id = v_uid and type = 'push_test';

  insert into public.notifications (user_id, type, payload)
  values (v_uid, 'push_test', jsonb_build_object('sent_at', now()))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
