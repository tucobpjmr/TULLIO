-- Notifica queue_stale: il tap apre sempre il task piu' urgente, non piu' la
-- Dashboard quando i task in coda sono piu' d'uno.
--
-- Comportamento precedente (20260725_queue_stale_relevance_digest): con un
-- solo task in coda il payload portava task_id/task_title e il tap apriva
-- direttamente quel task; con piu' task il payload portava solo view/queue e
-- il tap apriva la Dashboard sulla tab "Coda Globale", da cui l'utente doveva
-- scegliere manualmente un task e aprirlo (un passaggio in piu').
--
-- Richiesta: il tap deve sempre portare dritti al dettaglio di un task, anche
-- quando il digest ne riassume piu' d'uno. v_ids/v_preview sono gia'
-- ordinati per rilevanza (scadenza piu' vicina prima, vedi query in fondo
-- alla funzione), quindi si punta sempre al primo — il piu' urgente — invece
-- di limitare task_id/task_title al solo caso v_count = 1.
--
-- notifTarget() in src/lib/notifUtils.js da' gia' priorita' a payload.task_id
-- su payload.view, quindi lato client non serve alcuna modifica: basta che il
-- payload lo porti sempre. view/queue restano nel payload (innocui, non piu'
-- letti per la navigazione) cosi' da non rompere consumer futuri del digest.
create or replace function public.notify_queue_stale() returns void
language plpgsql security definer set search_path = public
as $$
declare
  -- Finestre di rilevanza: unico punto da toccare per cambiare il ritmo.
  c_due_window   constant interval := interval '48 hours'; -- task con scadenza
  c_no_due_age   constant interval := interval '24 hours'; -- task senza scadenza
  c_remind_after constant interval := interval '24 hours'; -- risveglio giornaliero

  v_count   int;
  v_ids     text[];
  v_preview jsonb;
  v_payload jsonb;
  uid       uuid;
  existing  record;
  has_new   boolean;
begin
  -- Destinatari non piu' idonei (disattivati, in attesa, cambio ruolo).
  delete from public.notifications n
  where n.type = 'queue_stale'
    and not exists (
      select 1 from public.users u
      where u.id = n.user_id
        and u.active = true and u.pending = false
        and lower(u.role) in ('manager', 'admin')
    );

  -- Coda urgente: uguale per tutti i destinatari (manager/admin vedono tutto),
  -- quindi si calcola una volta sola. Ordine: scadenza piu' vicina prima.
  select count(*)::int,
         coalesce(array_agg(q.id::text order by q.ord), '{}'::text[]),
         coalesce(
           jsonb_agg(
             jsonb_build_object('id', q.id, 'title', q.title, 'due_date', q.due_date)
             order by q.ord
           ) filter (where q.ord <= 5),
           '[]'::jsonb
         )
    into v_count, v_ids, v_preview
  from (
    select t.id, t.title, t.due_date,
           row_number() over (order by t.due_date nulls last, t.created_at) as ord
    from public.tasks t
    where t.deleted_at is null
      and t.status = 'todo'
      and (t.assignees is null or array_length(t.assignees, 1) is null)
      and (
        (t.due_date is not null and t.due_date <= now() + c_due_window)
        or (t.due_date is null and t.created_at < now() - c_no_due_age)
      )
  ) q;

  -- Niente di urgente in coda: via i promemoria residui.
  if v_count = 0 then
    delete from public.notifications where type = 'queue_stale';
    return;
  end if;

  -- Il tap apre sempre il task piu' urgente (v_ids[1]/v_preview[0]), a
  -- prescindere da quanti task siano in coda: navigazione diretta come le
  -- altre notifiche di task, mai piu' una tappa intermedia sulla Dashboard.
  v_payload := jsonb_build_object(
    'count',      v_count,
    'tasks',      v_preview,   -- anteprima: primi 5 (id/titolo/scadenza)
    'task_ids',   to_jsonb(v_ids),
    'view',       'dashboard', -- non piu' letto per la navigazione (compat)
    'queue',      'global',
    'task_id',    v_ids[1],
    'task_title', v_preview->0->>'title'
  );

  for uid in
    select id from public.users
    where active = true and pending = false
      and lower(role) in ('manager', 'admin')
  loop
    select id, read, created_at, payload into existing
    from public.notifications
    where user_id = uid and type = 'queue_stale'
    limit 1;

    if existing.id is null then
      insert into public.notifications (user_id, type, payload)
      values (uid, 'queue_stale', v_payload)
      on conflict do nothing;
      continue;
    end if;

    -- Task entrati nella finestra dopo l'ultimo aggiornamento visto dall'utente.
    has_new := exists (
      select 1 from unnest(v_ids) as nid
      where not (coalesce(existing.payload->'task_ids', '[]'::jsonb) ? nid)
    );

    if existing.read and (has_new or existing.created_at < now() - c_remind_after) then
      -- Risveglio: torna in cima all'elenco e fa scattare il push.
      update public.notifications
      set read = false, created_at = now(), payload = v_payload
      where id = existing.id;
    else
      -- Gia' visibile (o letta da poco senza novita'): solo contenuto aggiornato,
      -- nessun push. La clausola is distinct from evita UPDATE a vuoto ogni ora.
      update public.notifications
      set payload = v_payload
      where id = existing.id and payload is distinct from v_payload;
    end if;
  end loop;
end $$;

revoke all on function public.notify_queue_stale() from public, anon, authenticated;

-- Rigenera subito i digest esistenti col nuovo payload (task_id sempre presente).
select public.notify_queue_stale();
