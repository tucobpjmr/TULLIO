-- A-4 dell'audit UX/errori del 1 settembre — la segnalazione ha un posto dove
-- essere cercata.
--
-- ─── LA SITUAZIONE ─────────────────────────────────────────────────────────
-- Un errore di programmazione mostra all'utente «Operazione non riuscita. Se
-- si ripete, segnala il codice VD-…»: il codice nasce apposta per essere
-- dettato al telefono (criticità #9, src/lib/errorReporting.js). Ma quel
-- codice — e il dettaglio che gli sta accanto — finiva SOLO in
-- `console.error`, nel browser di chi ha avuto l'errore. Chi RICEVE la
-- segnalazione (un admin, chi sviluppa) non aveva nessun posto in cui
-- cercarla: la console è quella del browser di un altro.
--
-- ─── TABELLA, NON MONITORAGGIO ─────────────────────────────────────────────
-- lib/errorReporting.js dichiara ancora, di proposito, di non inviare nulla a
-- un servizio di monitoraggio ESTERNO — non ce n'è uno, e un endpoint
-- inventato sarebbe peggio del silenzio. Questa tabella non lo è: è la STESSA
-- disciplina di public.audit_log (20260826214000) — append-only, scrittura
-- solo via funzione SECURITY DEFINER, lettura ai soli admin — applicata a un
-- dato diverso: non un'azione privilegiata, un errore imprevisto sul client.
-- Resta interamente dentro il progetto.
create table if not exists public.error_reports (
  id          uuid primary key default gen_random_uuid(),
  -- Lo stesso codice che l'utente detta al telefono: è la chiave con cui chi
  -- riceve la segnalazione la cerca qui dentro.
  code        text not null unique,
  at          timestamptz not null default now(),
  -- `set null` e non `cascade`, come actor_id su audit_log: eliminare
  -- l'utente non deve cancellare la prova dell'errore che ha avuto.
  user_id     uuid references public.users(id) on delete set null,
  user_name   text,
  -- "promise" | "runtime" | il nome del boundary che ha catturato l'errore.
  origin      text not null,
  message     text not null,
  stack       text,
  url         text,
  user_agent  text
);

create index if not exists error_reports_at_desc on public.error_reports (at desc);

alter table public.error_reports enable row level security;

drop policy if exists "error_reports_select" on public.error_reports;
create policy "error_reports_select" on public.error_reports
  for select to authenticated
  using ((select private.is_admin()));

-- APPEND-ONLY PER COSTRUZIONE, come audit_log: nessuna policy di insert per
-- `authenticated` né per `anon`, quindi con la RLS attiva l'ASSENZA di quella
-- policy è già il divieto. Si scrive solo attraverso la funzione qui sotto.
revoke all on public.error_reports from anon, authenticated;
grant select on public.error_reports to authenticated;

comment on table public.error_reports is
  'Segnalazioni di errore lato client (A-4 dell''audit UX/errori del 1 '
  'settembre): stesso codice mostrato all''utente («segnala il codice '
  'VD-…»). Lettura: soli admin. Scrittura: solo via '
  'public.segnala_errore_client(). Non deve contenere PII oltre a quella già '
  'presente in users (nome/id di chi era loggato quando è successo).';

-- ─── LA PORTA DI SCRITTURA ──────────────────────────────────────────────────
-- SECURITY DEFINER e TOLLERANTE alla sessione assente (`auth.uid()` può
-- essere null): un crash può avvenire anche prima che l'utente sia
-- autenticato — è la finestra che l'ErrorBoundary di primo livello in
-- main.jsx copre da solo — e un errore che non riesce a segnalare SE STESSO
-- perché richiederebbe un login sarebbe un controsenso.
create or replace function public.segnala_errore_client(
  p_code       text,
  p_origin     text,
  p_message    text,
  p_stack      text default null,
  p_url        text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me   uuid := (select auth.uid());
  v_nome text;
begin
  if p_code is null or p_message is null then
    return;
  end if;
  if v_me is not null then
    select name into v_nome from public.users where id = v_me;
  end if;
  insert into public.error_reports (code, user_id, user_name, origin, message, stack, url, user_agent)
  values (p_code, v_me, v_nome, coalesce(p_origin, 'sconosciuto'), p_message, p_stack, p_url, p_user_agent)
  -- Lo stesso errore React, in DEV, passa sia dall'ErrorBoundary sia
  -- dall'handler globale (vedi la nota sul doppio avviso in
  -- errorReporting.js): la seconda scrittura con lo stesso `code` è un
  -- no-op, non un duplicato da distinguere a valle.
  on conflict (code) do nothing;
end $$;

revoke execute on function public.segnala_errore_client(text,text,text,text,text,text) from public;
grant   execute on function public.segnala_errore_client(text,text,text,text,text,text) to anon, authenticated;
