-- Notifiche (e quindi push) per i messaggi di chat
--
-- PROBLEMA (segnalato dall'uso reale): ricevendo un messaggio in chat non
-- arriva nessuna notifica push sul telefono.
--
-- CAUSA: la push non nasce dai messaggi ma dalle notifiche. notify_push()
-- (20260706_web_push_notifications) e' un trigger su public.notifications:
-- inoltra alla Edge Function send-push ogni riga non letta. Sui messaggi di
-- chat l'unico trigger esistente e' notify_message_mention()
-- (20260614_mention_composite_names), che inserisce una notifica SOLO per gli
-- utenti esplicitamente menzionati con @nome. Un messaggio normale non scrive
-- nulla in notifications, quindi notify_push() non parte mai e nessun push
-- viene inviato. Il non letto della chat era visibile solo in-app (badge
-- calcolato lato client da messages.read_by).
--
-- FIX: nuovo trigger notify_message_chat() che, a ogni messaggio, crea una
-- notifica di tipo 'chat_message' per i partecipanti diversi dal mittente.
--
-- ANTI-ACCUMULO: una riga per utente+conversazione, non una per messaggio —
-- stesso schema gia' adottato per queue_stale (20260705_queue_stale_dedup,
-- nata proprio da una segnalazione di elenco intasato). I messaggi successivi
-- aggiornano la riga esistente riportandola in cima e non letta. Perche' anche
-- quell'aggiornamento produca un push, la condizione del trigger
-- trg_notify_push_update viene estesa al cambio di payload (prima copriva solo
-- la transizione letta -> non letta dei re-promemoria queue_stale).

-- ── 1. Indice UNIQUE parziale: max 1 chat_message per utente+conversazione ──
-- Regge l'ON CONFLICT DO NOTHING dell'insert in caso di messaggi concorrenti.
create unique index if not exists notifications_chat_message_user_conv_uq
  on public.notifications (user_id, (payload->>'conversation_id'))
  where type = 'chat_message';

-- ── 2. Trigger messaggi chat: notifica ai partecipanti ─────────────────────
create or replace function public.notify_message_chat() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_conv      record;
  v_sender    text;
  v_preview   text;
  v_payload   jsonb;
  v_uid       uuid;
  v_mentioned uuid[];
  v_updated   int;
begin
  -- I messaggi di servizio non sono roba da notificare a nessuno.
  if NEW.type = 'system' then
    return NEW;
  end if;

  select id, type, name, participants into v_conv
  from public.conversations where id = NEW.conversation_id;
  if v_conv.id is null or v_conv.participants is null then
    return NEW;
  end if;

  select name into v_sender from public.users where id = NEW.sender_id;

  -- Anteprima: testo troncato, oppure etichetta per gli allegati (il corpo
  -- della push non puo' restare vuoto per un vocale o un file).
  v_preview := case NEW.type
    when 'text'  then left(btrim(coalesce(NEW.text, '')), 140)
    when 'image' then '🖼️ Immagine'
    when 'file'  then '📎 ' || coalesce(NEW.file_name, 'File')
    when 'voice' then '🎙️ Messaggio vocale'
    else coalesce(NEW.text, '')
  end;

  -- Chi e' menzionato riceve gia' una notifica 'mention' da
  -- notify_message_mention(): senza questo filtro lo stesso messaggio
  -- produrrebbe due notifiche e due push.
  select coalesce(array_agg(user_id), array[]::uuid[]) into v_mentioned
  from public.find_mentioned_users(NEW.text);

  foreach v_uid in array v_conv.participants loop
    if v_uid = NEW.sender_id or v_uid = any (v_mentioned) then
      continue;
    end if;

    v_payload := jsonb_build_object(
      'conversation_id',   NEW.conversation_id,
      'conversation_name', case when v_conv.type = 'group' then v_conv.name else null end,
      'message_id',        NEW.id,
      'by_user_id',        NEW.sender_id,
      'by_user_name',      coalesce(v_sender, 'Qualcuno'),
      'preview',           v_preview
    );

    -- Conversazione gia' segnalata a questo utente: aggiorno la riga esistente
    -- (torna in cima, non letta, con l'ultimo messaggio) invece di aggiungerne
    -- una nuova. Il cambio di payload fa comunque scattare il push.
    update public.notifications
       set payload    = v_payload,
           read       = false,
           created_at = now()
     where user_id = v_uid
       and type    = 'chat_message'
       and payload->>'conversation_id' = NEW.conversation_id::text;
    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      insert into public.notifications (user_id, type, payload)
      values (v_uid, 'chat_message', v_payload)
      on conflict do nothing;
    end if;
  end loop;

  return NEW;
exception when others then
  -- Best-effort come notify_push: una notifica mancata non deve mai far
  -- fallire l'invio del messaggio.
  raise warning 'notify_message_chat: %', sqlerrm;
  return NEW;
end $$;

revoke all on function public.notify_message_chat() from public, anon, authenticated;

drop trigger if exists trg_notify_message_chat on public.messages;
create trigger trg_notify_message_chat
  after insert on public.messages
  for each row execute function public.notify_message_chat();

-- ── 3. notify_push(): titolo/corpo per chat_message + conversation_id ───────
-- Rispetto a 20260706: nuovo case 'chat_message' e conversation_id nel corpo
-- HTTP (serve alla Edge Function per raggruppare le notifiche per
-- conversazione e al service worker per aprire la chat giusta al tap).
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

  -- Titolo/corpo in italiano, specchio di notifTitle() in Topbar.jsx.
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

-- ── 4. Trigger UPDATE: anche il refresh di una riga gia' non letta ─────────
-- Prima: solo la transizione letta -> non letta (re-promemoria queue_stale).
-- Ora anche il cambio di payload, cioe' il messaggio successivo nella stessa
-- conversazione, che aggiorna in-place la riga chat_message gia' non letta.
-- Marcare come letta (new.read = true) resta escluso, quindi nessun push
-- spurio quando l'utente svuota le notifiche.
drop trigger if exists trg_notify_push_update on public.notifications;
create trigger trg_notify_push_update
  after update on public.notifications
  for each row when (
    new.read = false
    and (old.read is distinct from new.read or old.payload is distinct from new.payload)
  )
  execute function public.notify_push();
