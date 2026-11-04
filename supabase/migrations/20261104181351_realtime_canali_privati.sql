-- ─── M-3 dell'audit del 4 novembre · presenza e «sta scrivendo» su canali PRIVATI
--
-- COSA SI ROMPEVA. I due canali Realtime che non sono `postgres_changes` —
-- la presenza dell'agenzia (`presenza:agenzia`, lib/realtime.js
-- subscribeToPresence) e il «sta scrivendo» di una conversazione
-- (`typing:<id conversazione>`, subscribeToTyping) — erano canali PUBBLICI.
-- Su un canale pubblico Realtime non valuta alcuna policy: bastava la chiave
-- anon, che sta nel bundle dell'app, per entrare in `presenza:agenzia` e
-- leggere quali utenti (uuid) sono collegati e quando, oppure per pubblicare
-- una presenza o un «sta scrivendo» a nome di chiunque.
--
-- COSA FA ORA. Il client apre quei due canali con `private: true`, e Realtime
-- concede l'ingresso solo se una policy su `realtime.messages` lo permette
-- (https://supabase.com/docs/guides/realtime/authorization):
--   - presenza: solo utenti autenticati E attivi (`private.is_active_user()`,
--     lo stesso gate di `rls_active_only` sulle tabelle);
--   - «sta scrivendo»: solo i PARTECIPANTI della conversazione, che è la
--     stessa regola di `conversations_select` meno il ramo admin — un admin
--     legge una conversazione altrui, ma non c'è ragione che ne veda chi
--     scrive in tempo reale.
--
-- ⚠️ «Allow public access» nelle impostazioni Realtime RESTA ACCESO, ed è
-- voluto. Spegnerlo obbligherebbe a rendere privati anche i canali
-- `postgres_changes` (tasks, comments, notices, clients, users, chat,
-- notifiche, liste), che oggi sono pubblici e protetti dalla RLS delle loro
-- tabelle. Non serve per chiudere questo rilievo: un canale privato e uno
-- pubblico con lo stesso nome sono canali DISTINTI e Realtime non passa
-- messaggi dall'uno all'altro, quindi chi entra in un `presenza:agenzia`
-- pubblico non vede niente.
--
-- `realtime.topic()` è il nome del canale SENZA il prefisso `realtime:` che
-- supabase-js aggiunge in trasmissione. `substr(…, 8)` toglie `typing:` (7
-- caratteri). Il confronto è su `id::text` e non su un cast a uuid: un topic
-- malformato deve dare «nessuna riga», non un errore di conversione.
--
-- Idempotente: `drop policy if exists` prima di ogni `create`.

drop policy if exists "presenza_agenzia_lettura" on realtime.messages;
create policy "presenza_agenzia_lettura" on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'presenza:agenzia'
    and realtime.messages.extension = 'presence'
    and (select private.is_active_user())
  );

drop policy if exists "presenza_agenzia_scrittura" on realtime.messages;
create policy "presenza_agenzia_scrittura" on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'presenza:agenzia'
    and realtime.messages.extension = 'presence'
    and (select private.is_active_user())
  );

drop policy if exists "typing_partecipanti_lettura" on realtime.messages;
create policy "typing_partecipanti_lettura" on realtime.messages
  for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'typing:%'
    and (select private.is_active_user())
    and exists (
      select 1 from public.conversations c
      where c.id::text = substr((select realtime.topic()), 8)
        and (select auth.uid()) = any (c.participants)
    )
  );

drop policy if exists "typing_partecipanti_scrittura" on realtime.messages;
create policy "typing_partecipanti_scrittura" on realtime.messages
  for insert to authenticated
  with check (
    realtime.messages.extension = 'broadcast'
    and (select realtime.topic()) like 'typing:%'
    and (select private.is_active_user())
    and exists (
      select 1 from public.conversations c
      where c.id::text = substr((select realtime.topic()), 8)
        and (select auth.uid()) = any (c.participants)
    )
  );
