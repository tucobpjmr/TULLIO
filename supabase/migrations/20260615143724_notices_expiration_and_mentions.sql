-- Sessione 23: bacheca avvisi con scadenza + notifiche @menzioni
--
-- 1. notices.expires_at (TIMESTAMPTZ NULL) — scadenza opzionale dell'avviso.
--    L'UI filtra gli avvisi con expires_at < now() (auto-hide), nessun cron
--    necessario (sono nascosti, non cancellati: lo storico resta).
-- 2. notices.updated_at (TIMESTAMPTZ NOT NULL DEFAULT now()) + trigger BEFORE
--    UPDATE per gestire il refresh automatico. L'UI ne usa updatedAt per
--    "modificato N min fa" (oggi cade in fallback su createdAt).
-- 3. notify_notice_mention trigger AFTER INSERT/UPDATE OF text: reusa
--    find_mentioned_users (20260614_mention_composite_names.sql) per
--    notificare gli utenti menzionati.

-- ── 1. expires_at ───────────────────────────────────────────────────────────
alter table public.notices
  add column if not exists expires_at timestamptz null;

-- ── 2. updated_at ───────────────────────────────────────────────────────────
alter table public.notices
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.touch_notices_updated_at() returns trigger
language plpgsql
as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

drop trigger if exists trg_notices_touch_updated_at on public.notices;
create trigger trg_notices_touch_updated_at
  before update on public.notices
  for each row execute function public.touch_notices_updated_at();

-- ── 3. notify_notice_mention ────────────────────────────────────────────────
-- Notifica 'notice_mention' agli utenti menzionati in un avviso. Sull'UPDATE
-- solo se il testo cambia (no rumore per pin/colore). Dedup: skip se gia'
-- esiste una notifica notice_mention per (notice_id, user_id) nelle ultime 6h
-- (evita ri-notifica al toggle pinned o piccoli refactor del testo).
create or replace function public.notify_notice_mention() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  actor uuid := auth.uid();
  v_uid uuid;
begin
  if TG_OP = 'UPDATE' and NEW.text is not distinct from OLD.text then
    return NEW;
  end if;
  if NEW.text is null or btrim(NEW.text) = '' then
    return NEW;
  end if;

  for v_uid in select user_id from public.find_mentioned_users(NEW.text) loop
    if actor is not null and v_uid = actor then
      continue;
    end if;
    if exists (
      select 1 from public.notifications
      where user_id = v_uid
        and type = 'notice_mention'
        and payload->>'notice_id' = NEW.id::text
        and created_at > now() - interval '6 hours'
    ) then
      continue;
    end if;
    insert into public.notifications (user_id, type, payload)
    values (v_uid, 'notice_mention', jsonb_build_object(
      'notice_id', NEW.id,
      'by_user_id', coalesce(NEW.author_id, actor),
      'where', 'bacheca',
      'preview', left(NEW.text, 120)
    ));
  end loop;

  return NEW;
end $$;

revoke all on function public.notify_notice_mention() from public, anon, authenticated;

drop trigger if exists trg_notify_notice_mention on public.notices;
create trigger trg_notify_notice_mention
  after insert or update of text on public.notices
  for each row execute function public.notify_notice_mention();
