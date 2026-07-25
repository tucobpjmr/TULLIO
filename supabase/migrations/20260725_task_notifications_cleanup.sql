-- Notifiche legate ai task: ritiro automatico + retention
--
-- PROBLEMA (seconda voce per volume dopo queue_stale, 19 righe di cui 18 non
-- lette): notify_task_assigned() e' un trigger che crea la notifica al momento
-- dell'assegnazione e non la ritira mai piu'. Fotografia del DB al 2026-07-25:
--
--   - 7 notifiche puntano a task con status 'done' ("irlanda", "verifica penali
--     msc", "x amastuola 25 luglio"...): la piu' vecchia e' del 1 luglio, mai
--     letta, per un task chiuso da settimane;
--   - 1 punta a un task cestinato il 04/07 ("check in ");
--   - restano 11 righe che si riferiscono a lavoro davvero aperto.
--
-- "Nuovo task assegnato" e' un promemoria di lavoro: quando il lavoro non c'e'
-- piu' (task completato, cestinato, passato a un altro) la riga e' rumore, e
-- occupa il pannello esattamente come facevano le queue_stale.
--
-- Tre pezzi:
--   1. RITIRO IMMEDIATO (trigger su tasks) — completi il task e il promemoria
--      sparisce nello stesso istante, senza aspettare un cron.
--   2. UNA RIGA PER UTENTE+TASK (indice UNIQUE + upsert) — riassegnare lo
--      stesso task alla stessa persona risveglia la riga esistente invece di
--      accodarne una nuova. Stesso schema di chat_message e task_due.
--   3. RETENTION (cron giornaliero) — rete di sicurezza per le righe che il
--      trigger non puo' intercettare (task cancellati definitivamente dal
--      cestino, import massivi) + limite di eta' a 30 giorni: una notifica di
--      un mese fa non e' piu' una notizia, e il task, se aperto, resta
--      comunque nella coda personale e nel calendario.
--
-- Cosa NON cambia: il fatto che ogni assegnazione generi una notifica. E'
-- informazione per-task legittima ("questo task specifico ora e' tuo"), e sui
-- dati reali il ritmo e' di circa una ogni giorno e mezzo — non c'e' il
-- problema di volume che ha richiesto il digest per la coda globale.

-- ── 1. One-off: via le righe senza piu' oggetto ─────────────────────────────
-- Promemoria di lavoro (task_assigned/task_due) di task chiusi, cestinati,
-- cancellati o non piu' assegnati al destinatario.
delete from public.notifications n
where n.type in ('task_assigned', 'task_due')
  and not exists (
    select 1 from public.tasks t
    where t.id::text = n.payload->>'task_id'
      and t.deleted_at is null
      and t.status <> 'done'
      and n.user_id = any (coalesce(t.assignees, array[]::uuid[]))
  );

-- Qualsiasi notifica che punta a un task non piu' esistente (cestino svuotato):
-- il tap aprirebbe il vuoto.
delete from public.notifications n
where n.payload ? 'task_id'
  and n.payload->>'task_id' is not null
  and not exists (
    select 1 from public.tasks t where t.id::text = n.payload->>'task_id'
  );

-- ── 2. Dedup storico + indice UNIQUE (utente, task) ─────────────────────────
delete from public.notifications n
where n.type = 'task_assigned'
  and exists (
    select 1 from public.notifications m
    where m.type = 'task_assigned'
      and m.user_id = n.user_id
      and m.payload->>'task_id' = n.payload->>'task_id'
      and (m.created_at > n.created_at
           or (m.created_at = n.created_at and m.id > n.id))
  );

create unique index if not exists notifications_task_assigned_user_task_uq
  on public.notifications (user_id, (payload->>'task_id'))
  where type = 'task_assigned';

-- ── 3. Trigger di assegnazione: upsert invece di insert ─────────────────────
-- Rispetto alla versione precedente (20260610_notifications_extra): se la riga
-- per quella coppia utente+task esiste gia' viene risvegliata (payload
-- rigenerato, non letta, in cima) invece di crearne una seconda. Resta lo skip
-- dell'auto-assegnazione: chi prende in carico un task da solo non ha bisogno
-- che glielo si annunci.
create or replace function public.notify_task_assigned() returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  added     uuid[];
  uid       uuid;
  actor     uuid := auth.uid();
  v_payload jsonb;
  v_updated int;
begin
  if TG_OP = 'INSERT' then
    added := coalesce(NEW.assignees, ARRAY[]::uuid[]);
  elsif TG_OP = 'UPDATE' then
    -- Differenza set: NEW.assignees - OLD.assignees
    select array(
      select x::uuid
      from unnest(coalesce(NEW.assignees, ARRAY[]::uuid[])) as x
      where x::uuid <> all (coalesce(OLD.assignees, ARRAY[]::uuid[]))
    ) into added;
  else
    return NEW;
  end if;

  if added is null or array_length(added, 1) is null then
    return NEW;
  end if;

  -- Un task gia' chiuso o cestinato non genera promemoria di lavoro (capita
  -- riassegnando un task nel cestino per rimetterlo in ordine).
  if NEW.status = 'done' or NEW.deleted_at is not null then
    return NEW;
  end if;

  v_payload := jsonb_build_object(
    'task_id',    NEW.id,
    'task_title', NEW.title,
    'due_date',   NEW.due_date
  );

  foreach uid in array added loop
    -- skip self-assignment (auto-presa in carico)
    if actor is not null and uid = actor then
      continue;
    end if;

    update public.notifications
       set payload    = v_payload,
           read       = false,
           created_at = now()
     where user_id = uid
       and type    = 'task_assigned'
       and payload->>'task_id' = NEW.id::text;
    get diagnostics v_updated = row_count;

    if v_updated = 0 then
      insert into public.notifications (user_id, type, payload)
      values (uid, 'task_assigned', v_payload)
      on conflict do nothing;
    end if;
  end loop;

  return NEW;
end $$;

revoke all on function public.notify_task_assigned() from public, anon, authenticated;

-- ── 4. Ritiro immediato quando il task esce di scena ────────────────────────
-- Regole:
--   - task completato        -> via i promemoria di lavoro (task_assigned,
--     task_due). Commenti e menzioni restano: sono eventi di conversazione,
--     non "hai qualcosa da fare".
--   - task cestinato         -> via TUTTE le notifiche che lo citano: il tap
--     porterebbe a un task nel cestino.
--   - cambio assegnatari     -> via i promemoria di chi non e' piu' della
--     partita (chi entra riceve la sua da notify_task_assigned).
create or replace function public.prune_task_notifications() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if NEW.deleted_at is not null and OLD.deleted_at is null then
    delete from public.notifications
    where payload->>'task_id' = NEW.id::text;
    return NEW;
  end if;

  if NEW.status = 'done' and coalesce(OLD.status, '') <> 'done' then
    delete from public.notifications
    where type in ('task_assigned', 'task_due')
      and payload->>'task_id' = NEW.id::text;
    return NEW;
  end if;

  if OLD.assignees is distinct from NEW.assignees then
    delete from public.notifications n
    where n.type in ('task_assigned', 'task_due')
      and n.payload->>'task_id' = NEW.id::text
      and not (n.user_id = any (coalesce(NEW.assignees, array[]::uuid[])));
  end if;

  return NEW;
exception when others then
  -- Best-effort come notify_push: la pulizia di una notifica non deve mai far
  -- fallire l'aggiornamento del task.
  raise warning 'prune_task_notifications: %', sqlerrm;
  return NEW;
end $$;

revoke all on function public.prune_task_notifications() from public, anon, authenticated;

-- Nome scelto per ordinare dopo trg_notify_task_assigned (Postgres esegue i
-- trigger in ordine alfabetico): sulla stessa UPDATE prima nasce la notifica
-- per i nuovi assegnatari, poi si ritirano quelle di chi e' uscito. E' una
-- precauzione, non un vincolo: la cancellazione colpisce solo chi NON e' fra i
-- nuovi assegnatari, quindi non puo' toccare la riga appena creata.
drop trigger if exists trg_prune_task_notifications on public.tasks;
create trigger trg_prune_task_notifications
  after update of status, deleted_at, assignees on public.tasks
  for each row execute function public.prune_task_notifications();

-- ── 5. Retention giornaliera ────────────────────────────────────────────────
-- Rete di sicurezza per cio' che il trigger non vede (cestino svuotato =>
-- DELETE fisico del task, import/aggiornamenti massivi) + limite di eta'.
create or replace function public.prune_notifications() returns void
language plpgsql security definer set search_path = public
as $$
declare
  c_max_age constant interval := interval '30 days';
begin
  -- Notifiche che puntano a un task sparito.
  delete from public.notifications n
  where n.payload ? 'task_id'
    and n.payload->>'task_id' is not null
    and not exists (
      select 1 from public.tasks t where t.id::text = n.payload->>'task_id'
    );

  -- Promemoria di lavoro senza piu' oggetto.
  delete from public.notifications n
  where n.type in ('task_assigned', 'task_due')
    and not exists (
      select 1 from public.tasks t
      where t.id::text = n.payload->>'task_id'
        and t.deleted_at is null
        and t.status <> 'done'
        and n.user_id = any (coalesce(t.assignees, array[]::uuid[]))
    );

  -- Limite di eta'. queue_stale e' esclusa: si rigenera da sola a ogni giro e
  -- il suo created_at e' la data dell'ultimo risveglio, non dell'origine.
  delete from public.notifications
  where type <> 'queue_stale'
    and created_at < now() - c_max_age;
end $$;

revoke all on function public.prune_notifications() from public, anon, authenticated;

do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'prune_notifications_daily';
  if jid is not null then perform cron.unschedule(jid); end if;
  perform cron.schedule(
    'prune_notifications_daily',
    '20 3 * * *',
    $cron$ select public.prune_notifications(); $cron$
  );
end $$;
