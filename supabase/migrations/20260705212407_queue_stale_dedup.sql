-- Ottimizzazione notifiche coda stantia (queue_stale) — anti-accumulo
--
-- PROBLEMA (segnalato da screenshot utente, 36 non lette): la versione
-- precedente di notify_queue_stale() (20260615) inseriva una NUOVA riga per
-- ogni task in coda ogni ~4h, per ogni manager/admin, senza mai rimuovere
-- le precedenti. Con N task fermi in coda l'utente accumulava N nuove
-- notifiche ogni 4 ore (stesso task ripetuto piu' volte nell'elenco) e le
-- notifiche restavano anche dopo che il task era stato assegnato/completato.
--
-- NUOVO COMPORTAMENTO (invariante: al massimo UNA notifica queue_stale per
-- coppia utente+task, sempre):
--   1. Cleanup: a ogni giro il cron elimina le notifiche queue_stale dei
--      task che NON sono piu' in coda globale (assegnati, completati,
--      cestinati): promemoria obsoleti spariscono da soli.
--   2. Prima segnalazione: task in coda da > 4h senza notifica esistente
--      -> insert (come prima).
--   3. Notifica esistente NON letta -> nessuna azione (il promemoria e' gia'
--      visibile: non serve duplicarlo).
--   4. Notifica esistente letta da piu' di 24h e task ancora in coda ->
--      la STESSA riga viene riportata non letta con created_at = now()
--      (si "risveglia" in cima all'elenco invece di creare un duplicato).
--      Intervallo re-promemoria: 24h (prima era 4h, troppo rumoroso).
--
-- L'invariante e' garantito da un indice UNIQUE parziale su
-- (user_id, payload->>'task_id') where type='queue_stale'; l'insert usa
-- ON CONFLICT DO NOTHING per essere robusto a esecuzioni concorrenti.
-- Il frontend non richiede modifiche: la subscription realtime su
-- notifications rifa' il fetch dell'intera lista su INSERT/UPDATE/DELETE.
--
-- Nota screenshot: i "doppioni" apparenti nello stesso giro erano in realta'
-- task distinti con titoli quasi identici ("wizz" vs "wizz " con spazio
-- finale, "check in QUERO GIUSEPPE" vs "chek in QUERO GIUSEPPE"); i
-- doppioni veri erano le ripetizioni dello stesso task tra giri successivi
-- (11:05, 16:05, 20:05), eliminate da questa migration.

-- ── 1. One-off: dedup delle notifiche gia' presenti ────────────────────────
-- Tiene solo la piu' recente per (user_id, task_id), elimina le altre.
delete from public.notifications n
where n.type = 'queue_stale'
  and exists (
    select 1 from public.notifications m
    where m.type = 'queue_stale'
      and m.user_id = n.user_id
      and m.payload->>'task_id' = n.payload->>'task_id'
      and (m.created_at > n.created_at
           or (m.created_at = n.created_at and m.id > n.id))
  );

-- ── 2. Indice UNIQUE parziale: max 1 queue_stale per utente+task ───────────
create unique index if not exists notifications_queue_stale_user_task_uq
  on public.notifications (user_id, (payload->>'task_id'))
  where type = 'queue_stale';

-- ── 3. Funzione (sostituisce la versione 20260615) ──────────────────────────
create or replace function public.notify_queue_stale() returns void
language plpgsql security definer set search_path = public
as $$
declare
  t        record;
  uid      uuid;
  existing record;
begin
  -- Cleanup: via i promemoria (letti e non) dei task usciti dalla coda globale
  delete from public.notifications n
  where n.type = 'queue_stale'
    and not exists (
      select 1 from public.tasks tk
      where tk.id::text = n.payload->>'task_id'
        and tk.deleted_at is null
        and tk.status = 'todo'
        and (tk.assignees is null or array_length(tk.assignees, 1) is null)
    );

  for t in
    select id, title, created_at
    from public.tasks
    where deleted_at is null
      and status = 'todo'
      and (assignees is null or array_length(assignees, 1) is null)
      and created_at < now() - interval '4 hours'
  loop
    for uid in
      select id from public.users
      where active = true and pending = false
        and lower(role) in ('manager', 'admin')
    loop
      select id, read, created_at into existing
      from public.notifications
      where user_id = uid
        and type = 'queue_stale'
        and payload->>'task_id' = t.id::text
      order by created_at desc
      limit 1;

      if existing.id is null then
        -- Prima segnalazione per questo task/utente
        insert into public.notifications (user_id, type, payload)
        values (uid, 'queue_stale', jsonb_build_object(
          'task_id', t.id,
          'task_title', t.title,
          'stale_since', t.created_at
        ))
        on conflict do nothing;
      elsif existing.read and existing.created_at < now() - interval '24 hours' then
        -- Re-promemoria (max 1/giorno): risveglia la stessa riga, niente duplicati.
        -- Payload rigenerato: il titolo del task potrebbe essere cambiato.
        update public.notifications
        set read       = false,
            created_at = now(),
            payload    = jsonb_build_object(
              'task_id', t.id,
              'task_title', t.title,
              'stale_since', t.created_at
            )
        where id = existing.id;
      end if;
      -- Notifica non letta, o letta da meno di 24h -> nessuna azione.
    end loop;
  end loop;
end $$;

revoke all on function public.notify_queue_stale() from public, anon, authenticated;

-- Il cron 'notify_queue_stale_hourly' (5 * * * *) resta invariato:
-- richiama la funzione per nome, quindi usa automaticamente questa versione.
