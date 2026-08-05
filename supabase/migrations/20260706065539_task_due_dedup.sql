-- Anti-accumulo notifiche task_due — caveat #3 handoff v44.
--
-- Stesso pattern di 20260705_queue_stale_dedup: la versione precedente di
-- notify_task_due() (cron giornaliero alle 8:00) inseriva una riga nuova per
-- ogni giro con de-dup temporale 22h ma senza vincolo UNIQUE ne' cleanup: un
-- task rimasto in scadenza piu' giorni (due_date spostata avanti) generava
-- duplicati, e i promemoria restavano anche dopo che il task era stato
-- completato/cestinato o riassegnato.
--
-- NUOVO COMPORTAMENTO (invariante: max UNA notifica task_due per utente+task):
--   1. Cleanup: a ogni giro spariscono i promemoria dei task che non sono
--      piu' rilevanti per quell'utente (cestinati, completati, senza
--      due_date, scadenza oltre le prossime 24h, o utente non piu'
--      assegnatario). I task gia' scaduti (due_date passata) restano:
--      il promemoria e' ancora attuale.
--   2. Prima segnalazione: insert (ON CONFLICT DO NOTHING).
--   3. Notifica esistente non letta -> nessuna azione.
--   4. Notifica letta da >22h e task ancora in scadenza -> stessa riga
--      riportata non letta con created_at = now() (ritmo di fatto
--      giornaliero, il cron gira 1 volta/giorno).
--
-- Con i trigger push (20260706_web_push_notifications) sia l'insert che il
-- "risveglio" della riga generano un Web Push; il cleanup evita promemoria
-- push per task ormai chiusi.

-- ── 1. One-off: dedup delle notifiche gia' presenti ────────────────────────
delete from public.notifications n
where n.type = 'task_due'
  and exists (
    select 1 from public.notifications m
    where m.type = 'task_due'
      and m.user_id = n.user_id
      and m.payload->>'task_id' = n.payload->>'task_id'
      and (m.created_at > n.created_at
           or (m.created_at = n.created_at and m.id > n.id))
  );

-- ── 2. Indice UNIQUE parziale: max 1 task_due per utente+task ──────────────
create unique index if not exists notifications_task_due_user_task_uq
  on public.notifications (user_id, (payload->>'task_id'))
  where type = 'task_due';

-- ── 3. Funzione (sostituisce la versione 20260610_notifications_extra) ──────
create or replace function public.notify_task_due() returns void
language plpgsql security definer set search_path = public
as $$
declare
  t        record;
  uid      uuid;
  existing record;
begin
  -- Cleanup: via i promemoria dei task non piu' in scadenza per quell'utente.
  delete from public.notifications n
  where n.type = 'task_due'
    and not exists (
      select 1 from public.tasks tk
      where tk.id::text = n.payload->>'task_id'
        and tk.deleted_at is null
        and tk.status <> 'done'
        and tk.due_date is not null
        and tk.due_date <= now() + interval '24 hours'
        and n.user_id = any(tk.assignees)
    );

  for t in
    select id, title, due_date, assignees
    from public.tasks
    where deleted_at is null
      and status <> 'done'
      and due_date is not null
      and due_date >= now()
      and due_date <= now() + interval '24 hours'
      and assignees is not null
      and array_length(assignees, 1) > 0
  loop
    foreach uid in array t.assignees loop
      select id, read, created_at into existing
      from public.notifications
      where user_id = uid
        and type = 'task_due'
        and payload->>'task_id' = t.id::text
      order by created_at desc
      limit 1;

      if existing.id is null then
        insert into public.notifications (user_id, type, payload)
        values (uid, 'task_due', jsonb_build_object(
          'task_id', t.id,
          'task_title', t.title,
          'due_date', t.due_date
        ))
        on conflict do nothing;
      elsif existing.read and existing.created_at < now() - interval '22 hours' then
        -- Re-promemoria: risveglia la stessa riga (payload rigenerato:
        -- titolo o due_date potrebbero essere cambiati).
        update public.notifications
        set read       = false,
            created_at = now(),
            payload    = jsonb_build_object(
              'task_id', t.id,
              'task_title', t.title,
              'due_date', t.due_date
            )
        where id = existing.id;
      end if;
      -- Notifica non letta, o letta da meno di 22h -> nessuna azione.
    end loop;
  end loop;
end $$;

revoke all on function public.notify_task_due() from public, anon, authenticated;

-- Il cron 'notify_task_due_daily' (0 8 * * *) resta invariato: richiama la
-- funzione per nome, quindi usa automaticamente questa versione.
