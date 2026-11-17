-- ─── B-1 dell'analisi del 16 novembre · l'endpoint push è https
--
-- `send-push` fa una POST all'endpoint di `push_subscriptions`, che scrive il
-- client. Il vincolo rifiuta in scrittura tutto ciò che non è https; l'elenco
-- degli host ammessi (FCM, Mozilla, Apple, Windows) vive in
-- supabase/functions/send-push/endpointAmmesso.ts, che salta gli altri.
-- Al momento dell'applicazione tutte le righe erano https.
--
-- Idempotente: `drop constraint if exists` prima dell'`add`.

alter table public.push_subscriptions
  drop constraint if exists push_subscriptions_endpoint_https;
alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_https check (endpoint ~ '^https://');
