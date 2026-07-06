-- Web Push Notifications (VAPID) — infrastruttura DB (roadmap handoff v44)
--
-- Pezzi implementati qui:
--   2. Tabella push_subscriptions (una riga per dispositivo/browser sottoscritto)
--   4. Trigger su notifications che inoltra ogni notifica non letta alla
--      Edge Function send-push via net.http_post (pg_net, asincrono)
--   + RPC di supporto:
--     - get_vapid_public_key()  → frontend (authenticated): chiave pubblica
--       VAPID per PushManager.subscribe(). Niente env var Vercel: la chiave
--       arriva a runtime dal DB.
--     - get_push_secrets()      → solo service_role: la Edge Function la usa
--       per leggere chiavi VAPID (JWK) e secret condiviso dal Vault.
--
-- SEGRETI (Vault, NON committati in questa migration — creati direttamente
-- sul progetto con vault.create_secret):
--   vapid_public_key    chiave pubblica VAPID (base64url, formato applicationServerKey)
--   vapid_jwk           coppia di chiavi VAPID in formato JWK (per la Edge Function)
--   vapid_subject       contatto VAPID (mailto:...)
--   push_fn_url         URL della Edge Function send-push
--   push_anon_key       anon key del progetto (Authorization del trigger: la
--                       funzione ha verify_jwt attivo; l'autorizzazione vera è
--                       il secret condiviso)
--   push_trigger_secret secret condiviso trigger → Edge Function (header
--                       x-push-secret): senza, la funzione risponde 401
--
-- Se un segreto manca il trigger è un no-op: la notifica in-app resta comunque.

-- ── 1. Estensione pg_net (HTTP asincrono dal DB) ─────────────────────────────
-- L'handoff v44 la dava per attiva ma sul progetto non era installata.
-- Schema extensions (non public): advisor 0014. Le funzioni restano comunque
-- nello schema net (net.http_post).
create extension if not exists pg_net with schema extensions;

-- ── 2. Tabella push_subscriptions ────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

-- Ognuno gestisce solo le proprie sottoscrizioni; il gate is_active_user()
-- esclude pending/disattivati (stesso pattern di 20260621_rls_hardening).
-- La Edge Function legge/cancella con service role (bypassa la RLS).
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_active_user());

create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.is_active_user());

create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── 3. RPC: chiave pubblica VAPID per il frontend ────────────────────────────
create or replace function public.get_vapid_public_key() returns text
language sql stable security definer set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'vapid_public_key';
$$;

revoke all on function public.get_vapid_public_key() from public, anon;
grant execute on function public.get_vapid_public_key() to authenticated;

-- ── 4. RPC: segreti push per la Edge Function (solo service_role) ────────────
create or replace function public.get_push_secrets() returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_object_agg(name, decrypted_secret)
  from vault.decrypted_secrets
  where name in ('vapid_jwk', 'vapid_subject', 'push_trigger_secret');
$$;

revoke all on function public.get_push_secrets() from public, anon, authenticated;
grant execute on function public.get_push_secrets() to service_role;

-- ── 5. Trigger: notifica non letta → HTTP POST alla Edge Function ────────────
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
      'task_id',         p->>'task_id'
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

-- Mai esposta via API (advisor 0028/0029): PostgREST non pubblica le funzioni
-- che ritornano trigger, ma il revoke chiude comunque la porta.
revoke all on function public.notify_push() from public, anon, authenticated;

-- INSERT non letta: tutte le notifiche nuove (task_assigned, mention, ecc.).
drop trigger if exists trg_notify_push_insert on public.notifications;
create trigger trg_notify_push_insert
  after insert on public.notifications
  for each row when (new.read = false)
  execute function public.notify_push();

-- UPDATE letta → non letta: i re-promemoria queue_stale che "risvegliano" la
-- stessa riga (20260705_queue_stale_dedup). La condizione sulla transizione
-- evita push doppi su update che non cambiano lo stato di lettura.
drop trigger if exists trg_notify_push_update on public.notifications;
create trigger trg_notify_push_update
  after update on public.notifications
  for each row when (old.read = true and new.read = false)
  execute function public.notify_push();
