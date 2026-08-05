-- Step J fix #4: regex mention parser semplificata.
-- La regex precedente con apostrofi tipografici e flag 'gi' non matchava @Marco.
-- Applicata via MCP il 9/6/2026; questo file e' solo per version control.

CREATE OR REPLACE FUNCTION public.notify_task_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_task        record;
  v_assignee    uuid;
  v_mention_re  text := '@([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ''\.\-]*)';
  v_mention     text;
  v_mention_id  uuid;
  v_notified    uuid[] := ARRAY[]::uuid[];
begin
  select id, title, assignees into v_task
  from public.tasks
  where id = NEW.task_id;

  if v_task.id is null then
    return NEW;
  end if;

  for v_mention in
    select (regexp_matches(coalesce(NEW.text, ''), v_mention_re, 'g'))[1]
  loop
    select id into v_mention_id
    from public.users
    where active = true
      and lower(name) like lower(v_mention) || '%'
    order by length(name) asc
    limit 1;

    if v_mention_id is not null
       and v_mention_id <> NEW.user_id
       and v_mention_id <> all (v_notified)
    then
      insert into public.notifications (user_id, type, payload)
      values (
        v_mention_id,
        'mention',
        jsonb_build_object(
          'task_id', v_task.id,
          'task_title', v_task.title,
          'where', 'commento',
          'by_user_id', NEW.user_id,
          'comment_id', NEW.id
        )
      );
      v_notified := array_append(v_notified, v_mention_id);
    end if;
  end loop;

  if v_task.assignees is not null then
    foreach v_assignee in array v_task.assignees loop
      if v_assignee <> NEW.user_id
         and v_assignee <> all (v_notified)
      then
        insert into public.notifications (user_id, type, payload)
        values (
          v_assignee,
          'comment',
          jsonb_build_object(
            'task_id', v_task.id,
            'task_title', v_task.title,
            'by_user_id', NEW.user_id,
            'comment_id', NEW.id
          )
        );
        v_notified := array_append(v_notified, v_assignee);
      end if;
    end loop;
  end if;

  return NEW;
end $function$;
