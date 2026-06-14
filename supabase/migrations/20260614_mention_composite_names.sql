-- Caveat #2 — @menzioni robuste (anche nomi composti) su commenti task + chat.
--
-- STATO: applicato via apply_migration MCP il 14/6/2026; questo file e' per
--        version control. Sostituisce la regex fragile in 20260610_step_j_fix4.sql
--        (catturava una sola parola dopo @, poi prefix-match) con un matching
--        greedy contro i nomi utenti reali.
--
-- Strategia find_mentioned_users: invece di "cattura @parola e fai prefix-match",
-- confronta il testo contro i NOMI UTENTI dal piu' lungo al piu' corto. Cosi':
--   - "@Maria Grazia" matcha l'utente "Maria Grazia" (non si ferma a "Maria");
--   - "@Marco" non viene catturato dentro "@Marco Rossi" (lo span gia' matchato
--     viene azzerato prima di provare i nomi piu' corti);
--   - "me@marco.com" NON menziona Marco (boundary iniziale: la @ deve essere a
--     inizio testo o preceduta da un carattere non alfanumerico).
--
-- Dipendenze: public.users, public.tasks, public.comments, public.messages,
--             public.conversations, public.notifications.

-- ── Matcher condiviso ───────────────────────────────────────────────────────
create or replace function public.find_mentioned_users(p_text text)
returns table(user_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_text text := coalesce(p_text, '');
  v_user record;
  v_pat  text;
begin
  if v_text = '' or position('@' in v_text) = 0 then
    return;
  end if;
  for v_user in
    select id, name from public.users
    where active = true and name is not null and btrim(name) <> ''
    order by length(name) desc, name asc
  loop
    -- (boundary iniziale) @ + nome (metacaratteri regex escapati) + boundary finale.
    v_pat := '(^|[^[:alnum:]])@' ||
             regexp_replace(v_user.name, '([][(){}.^$*+?\\|-])', '\\\1', 'g') ||
             '($|[^[:alpha:]])';
    if v_text ~* v_pat then
      user_id := v_user.id;
      return next;
      -- azzera lo span matchato cosi' un prefisso piu' corto non ri-matcha
      v_text := regexp_replace(v_text, v_pat, '  ', 'gi');
    end if;
  end loop;
  return;
end $$;

revoke all on function public.find_mentioned_users(text) from public, anon, authenticated;

-- ── Trigger commenti task: mention robusta + notifica comment agli assignee ──
create or replace function public.notify_task_comment() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_task     record;
  v_assignee uuid;
  v_uid      uuid;
  v_notified uuid[] := ARRAY[]::uuid[];
begin
  select id, title, assignees into v_task
  from public.tasks where id = NEW.task_id;
  if v_task.id is null then
    return NEW;
  end if;

  for v_uid in select user_id from public.find_mentioned_users(NEW.text) loop
    if v_uid <> NEW.user_id and v_uid <> all (v_notified) then
      insert into public.notifications (user_id, type, payload)
      values (v_uid, 'mention', jsonb_build_object(
        'task_id', v_task.id, 'task_title', v_task.title,
        'where', 'commento', 'by_user_id', NEW.user_id, 'comment_id', NEW.id
      ));
      v_notified := array_append(v_notified, v_uid);
    end if;
  end loop;

  if v_task.assignees is not null then
    foreach v_assignee in array v_task.assignees loop
      if v_assignee <> NEW.user_id and v_assignee <> all (v_notified) then
        insert into public.notifications (user_id, type, payload)
        values (v_assignee, 'comment', jsonb_build_object(
          'task_id', v_task.id, 'task_title', v_task.title,
          'by_user_id', NEW.user_id, 'comment_id', NEW.id
        ));
        v_notified := array_append(v_notified, v_assignee);
      end if;
    end loop;
  end if;

  return NEW;
end $$;

-- ── Trigger messaggi chat: notifica mention ai partecipanti menzionati ──────
create or replace function public.notify_message_mention() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid;
  v_parts uuid[];
begin
  if NEW.type is distinct from 'text' or NEW.text is null or btrim(NEW.text) = '' then
    return NEW;
  end if;
  select participants into v_parts
  from public.conversations where id = NEW.conversation_id;

  for v_uid in select user_id from public.find_mentioned_users(NEW.text) loop
    if v_uid <> NEW.sender_id
       and (v_parts is null or v_uid = any (v_parts)) then
      insert into public.notifications (user_id, type, payload)
      values (v_uid, 'mention', jsonb_build_object(
        'where', 'chat',
        'conversation_id', NEW.conversation_id,
        'by_user_id', NEW.sender_id,
        'message_id', NEW.id
      ));
    end if;
  end loop;

  return NEW;
end $$;

drop trigger if exists trg_notify_message_mention on public.messages;
create trigger trg_notify_message_mention
  after insert on public.messages
  for each row execute function public.notify_message_mention();
