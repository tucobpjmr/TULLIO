-- Web Push — diagnostica iPhone (sessione 2026-07-31)
--
-- CONTESTO: sugli iPhone le push non arrivavano e non c'era modo di capire
-- dove si rompesse la catena
--   notifica → trigger notify_push() → pg_net → Edge Function send-push →
--   Apple Push Service → dispositivo
-- perché l'unico innesco era una notifica generata da qualcun altro (un task
-- assegnato, un messaggio in chat) e ogni tentativo richiedeva due persone.
--
-- Questa migration aggiunge:
--   1. send_test_push()  — RPC che l'utente chiama su di sé dal toggle
--      "Invia notifica di prova" (Topbar.jsx → lib/push.js). L'INSERT diretto
--      su notifications non è concesso a nessuno (nessuna policy di INSERT:
--      le notifiche nascono solo da trigger), quindi serve una security
--      definer con un tipo dedicato e nessun parametro: non può essere usata
--      per scrivere notifiche ad altri utenti.
--   2. notify_push() — nuovo case 'push_test' per titolo/corpo della push di
--      prova. Per il resto è identica alla versione di
--      20260725_chat_message_notifications.
--
-- Nessuna modifica ai trigger: quelli di 20260725 restano validi.

-- ── 1. notify_push(): case push_test ─────────────────────────────────────────
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
  v_title  text;
  v_body   text;
  p        jsonb := coalesce(new.payload, '{}'::jsonb);
begin
  -- Nessun dispositivo sottoscritto → nessuna chiamata HTTP.
  if not exists (
    select 1 from public.push_subscriptions s where s.user_id = new.user_id
  ) then
    return new;
  end if;

  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'push_fn_url';
  select decrypted_secret into v_anon   from vault.decrypted_secrets where name = 'push_anon_key';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_trigger_secret';
  if v_url is null or v_anon is null or v_secret is null then
    return new; -- push non configurato: no-op
  end if;

  -- Titolo/corpo in italiano, specchio di notifTitle() in lib/notifUtils.js.
  case new.type
    when 'task_assigned' then v_title := 'Nuovo task assegnato';        v_body := coalesce(p->>'task_title', '');
    when 'task_due'      then v_title := 'Scadenza task';               v_body := coalesce(p->>'task_title', '');
    when 'comment'       then v_title := 'Nuovo commento';              v_body := coalesce(p->>'task_title', '');
    when 'mention'       then v_title := 'Sei stato menzionato';        v_body := coalesce(p->>'task_title', p->>'where', '');
    when 'queue_stale'   then v_title := 'Task in coda da troppo tempo'; v_body := coalesce(p->>'task_title', '');
    when 'user_pending'  then v_title := 'Nuova richiesta di accesso';  v_body := coalesce(p->>'user_name', '');
    -- Chat: come in un'app di messaggistica il titolo e' l'interlocutore
    -- (o il nome del gruppo, con il mittente in testa al corpo).
    when 'chat_message'  then
      if coalesce(p->>'conversation_name', '') <> '' then
        v_title := p->>'conversation_name';
        v_body  := coalesce(p->>'by_user_name', '') || ': ' || coalesce(p->>'preview', '');
      else
        v_title := coalesce(p->>'by_user_name', 'Nuovo messaggio');
        v_body  := coalesce(p->>'preview', '');
      end if;
    -- Prova richiesta dall'utente su se stesso (send_test_push).
    when 'push_test'     then v_title := 'VoyageDesk — notifica di prova';
                              v_body  := 'Se leggi questo messaggio le notifiche push funzionano su questo dispositivo.';
    else                      v_title := 'VoyageDesk';                  v_body := coalesce(p->>'task_title', '');
  end case;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
      'user_id',         new.user_id,
      'notification_id', new.id,
      'type',            new.type,
      'title',           v_title,
      'body',            v_body,
      'task_id',         p->>'task_id',
      'conversation_id', p->>'conversation_id'
    ),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-push-secret', v_secret
    ),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Il push è best-effort: mai far fallire l'INSERT/UPDATE della notifica.
  raise warning 'notify_push: %', sqlerrm;
  return new;
end $$;

revoke all on function public.notify_push() from public, anon, authenticated;

-- ── 2. RPC send_test_push() ──────────────────────────────────────────────────
-- Inserisce una notifica 'push_test' per l'utente chiamante e lascia che sia
-- la catena normale (trigger → Edge Function) a consegnarla. Nessun parametro:
-- il destinatario è sempre auth.uid(), quindi non è un canale per notificare
-- altri. La riga precedente dello stesso utente viene sostituita: la prova può
-- essere ripetuta senza riempire la campanella.
-- search_path = '' + nomi qualificati: convenzione di
-- 20260707_advisor_definer_and_search_path_hardening (advisor 0011).
-- is_active_user vive in schema private dalla stessa migration.
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

  delete from public.notifications where user_id = v_uid and type = 'push_test';

  insert into public.notifications (user_id, type, payload)
  values (v_uid, 'push_test', jsonb_build_object('sent_at', now()))
  returning id into v_id;

  return v_id;
end $$;

revoke all on function public.send_test_push() from public, anon;
grant execute on function public.send_test_push() to authenticated;
