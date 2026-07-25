-- Notifiche coda globale (queue_stale) — rilevanza per scadenza + digest unico
--
-- PROBLEMA (screenshot utente, 32 non lette su 34 tutte "Task in coda da > 4h"):
-- la regola di segnalazione guardava solo l'ETA' DI CREAZIONE del task
-- (created_at < now() - 4h), non la sua scadenza. Nel flusso reale dell'agenzia
-- i task vengono creati in anticipo (i check-in volo si preparano appena
-- confermata la pratica) e restano legittimamente in coda globale finche' non
-- e' il momento di lavorarli. Risultato: ogni task futuro diventava un allarme
-- 4 ore dopo essere stato creato. Verificato sul DB al 2026-07-25: 35 task in
-- coda segnalati, con scadenze fino a 43 giorni avanti ("ck easyjet" 07/09,
-- "CKECK IN RYANAIR" 27/08, "cuba festa rocco" 21/08). Moltiplicato per 3
-- destinatari (manager/admin) = 68 notifiche, 65 non lette.
--
-- Due cause distinte di affollamento, due correzioni:
--
--   A. RILEVANZA — un task in coda non e' un problema perche' e' vecchio, ma
--      perche' sta per scadere senza che nessuno l'abbia preso. Nuova regola:
--        - task CON scadenza  -> si segnala solo entro le 48h dalla scadenza
--          (finestra operativa del check-in) o se gia' scaduto;
--        - task SENZA scadenza -> si segnala dopo 24h in coda (prima 4h): non
--          c'e' una data a cui ancorarsi, ma un giorno intero senza che
--          nessuno lo prenda in carico e' comunque un segnale.
--      Sui dati del 2026-07-25 i task segnalati passano da 35 a 15 (13 in
--      scadenza entro 48h + 2 senza scadenza fermi da giorni).
--
--      Il vero salto pero' e' il punto B: 15 task rilevanti sarebbero comunque
--      15 righe per destinatario. Con il digest sono 1.
--
--   B. DIGEST — una sola notifica queue_stale per utente, sempre, che riassume
--      tutta la coda urgente invece di una riga per task. Il payload porta
--      count + l'elenco dei task (primi 5, per l'anteprima nel pannello) +
--      task_ids (tutti, serve a capire se sono entrati task nuovi).
--      Con un solo task il payload include anche task_id/task_title, cosi' il
--      tap apre direttamente quel task; con piu' task apre la Dashboard sulla
--      tab "Coda Globale" (payload.view/queue, gestiti in Topbar.jsx).
--
-- RITMO DEI RISVEGLI (il push parte solo quando la riga passa a non letta,
-- trigger trg_notify_push_update di 20260706_web_push_notifications):
--   - notifica gia' NON letta  -> si aggiorna solo il payload, nessun push:
--     il promemoria e' gia' in cima all'elenco, non serve ripeterlo;
--   - notifica letta + task nuovi entrati nella finestra -> risveglio (1 push).
--     E' l'unico caso in cui l'utente viene interrotto: qualcosa di nuovo e'
--     diventato urgente da quando ha guardato;
--   - notifica letta da piu' di 24h e coda ancora piena -> risveglio giornaliero;
--   - coda urgente vuota -> la notifica sparisce da sola.
-- Il cron resta orario (notify_queue_stale_hourly, '5 * * * *'): il ritmo non
-- lo detta piu' il cron ma lo stato di lettura, quindi al massimo un push per
-- ogni lettura dell'utente.

-- ── 1. Reset delle notifiche queue_stale esistenti ──────────────────────────
-- Sono promemoria effimeri e il modello dati cambia (una riga per task -> una
-- riga per utente): si azzerano e si rigenerano in fondo a questa migration.
delete from public.notifications where type = 'queue_stale';

-- ── 2. Indici: da (utente, task) a (utente) ─────────────────────────────────
drop index if exists public.notifications_queue_stale_user_task_uq;

create unique index if not exists notifications_queue_stale_user_uq
  on public.notifications (user_id)
  where type = 'queue_stale';

-- ── 3. Funzione (sostituisce la versione 20260705_queue_stale_dedup) ────────
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

  v_payload := jsonb_build_object(
    'count',    v_count,
    'tasks',    v_preview,   -- anteprima: primi 5 (id/titolo/scadenza)
    'task_ids', to_jsonb(v_ids),
    'view',     'dashboard', -- destinazione del tap quando i task sono piu' d'uno
    'queue',    'global'
  );
  if v_count = 1 then
    -- Task singolo: navigazione diretta come le altre notifiche di task.
    v_payload := v_payload || jsonb_build_object(
      'task_id',    v_ids[1],
      'task_title', v_preview->0->>'title'
    );
  end if;

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

-- ── 4. Titolo/corpo del push per il nuovo payload ───────────────────────────
-- Ricreata per intero (specchio di notifTitle() in src/lib/notifUtils.js):
-- cambia solo il ramo 'queue_stale', il resto e' identico a
-- 20260725_chat_message_notifications.
--
-- Il titolo "Task in coda da troppo tempo" spariva dal senso: ora la coda
-- viene segnalata per imminenza, non per anzianita'.
create or replace function public.notify_push() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_url    text;
  v_anon   text;
  v_secret text;
  v_title  text;
  v_body   text;
  v_count  int;
  p        jsonb := coalesce(new.payload, '{}'::jsonb);
begin
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

  case new.type
    when 'task_assigned' then v_title := 'Nuovo task assegnato';       v_body := coalesce(p->>'task_title', '');
    when 'task_due'      then v_title := 'Scadenza task';              v_body := coalesce(p->>'task_title', '');
    when 'comment'       then v_title := 'Nuovo commento';             v_body := coalesce(p->>'task_title', '');
    when 'mention'       then v_title := 'Sei stato menzionato';       v_body := coalesce(p->>'task_title', p->>'where', '');
    when 'queue_stale'   then
      v_count  := coalesce((p->>'count')::int, 1);
      v_title  := 'Coda globale';
      v_body   := case
                    when v_count > 1 then v_count || ' task in scadenza senza assegnatario'
                    else coalesce(p->>'task_title', 'Task in scadenza senza assegnatario')
                  end;
    when 'user_pending'  then v_title := 'Nuova richiesta di accesso'; v_body := coalesce(p->>'user_name', '');
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
    else                      v_title := 'VoyageDesk';                 v_body := coalesce(p->>'task_title', '');
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
  raise warning 'notify_push: %', sqlerrm;
  return new;
end $$;

revoke all on function public.notify_push() from public, anon, authenticated;

-- ── 5. Trigger UPDATE: il push sul cambio payload resta solo per la chat ────
-- 20260725_chat_message_notifications aveva esteso la condizione a "payload
-- cambiato" per far arrivare il push del messaggio successivo nella stessa
-- conversazione. Sul digest queue_stale quella regola vanificherebbe la
-- distinzione fra aggiornamento silenzioso e risveglio: la riga non letta
-- cambia payload a ogni giro del cron (una task presa in carico, una scadenza
-- che entra nella finestra) e produrrebbe un push all'ora. La condizione viene
-- quindi ristretta al tipo che ne ha davvero bisogno; per tutti gli altri il
-- push resta legato alla transizione letta -> non letta, che e' l'unico segnale
-- esplicito di "c'e' qualcosa di nuovo da guardare".
drop trigger if exists trg_notify_push_update on public.notifications;
create trigger trg_notify_push_update
  after update on public.notifications
  for each row when (
    new.read = false
    and (
      old.read is distinct from new.read
      or (new.type = 'chat_message' and old.payload is distinct from new.payload)
    )
  )
  execute function public.notify_push();

-- ── 6. Rigenerazione immediata ──────────────────────────────────────────────
-- Senza questa chiamata il pannello resterebbe vuoto fino al prossimo giro del
-- cron (minuto :05). Genera al massimo una notifica per manager/admin.
select public.notify_queue_stale();
