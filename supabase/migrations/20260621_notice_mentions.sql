-- @menzioni in bacheca avvisi (NoticeBoard).
--
-- Riusa il matcher condiviso public.find_mentioned_users (definito in
-- 20260614_mention_composite_names.sql) per notificare i membri menzionati in
-- un nuovo avviso. Coerente con i trigger gemelli su commenti task e messaggi
-- chat: notifica di tipo 'mention' con payload.where = 'bacheca'.
--
-- Solo INSERT (non UPDATE): gli avvisi sono modificabili da chiunque e un
-- trigger su UPDATE ri-notificherebbe a ogni pin/edit. Le menzioni contano al
-- momento della pubblicazione, come per commenti e messaggi.
--
-- Dipendenze: public.notices, public.users, public.notifications,
--             public.find_mentioned_users(text).

create or replace function public.notify_notice_mention() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid;
begin
  if NEW.text is null or btrim(NEW.text) = '' then
    return NEW;
  end if;

  for v_uid in select user_id from public.find_mentioned_users(NEW.text) loop
    -- non notificare l'autore che menziona se stesso
    if NEW.author_id is null or v_uid <> NEW.author_id then
      insert into public.notifications (user_id, type, payload)
      values (v_uid, 'mention', jsonb_build_object(
        'where', 'bacheca',
        'notice_id', NEW.id,
        'by_user_id', NEW.author_id
      ));
    end if;
  end loop;

  return NEW;
end $$;

drop trigger if exists trg_notify_notice_mention on public.notices;
create trigger trg_notify_notice_mention
  after insert on public.notices
  for each row execute function public.notify_notice_mention();
