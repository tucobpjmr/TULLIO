-- ─── M-3 (seguito) · la presenza dell'agenzia va APERTA anche in lettura broadcast
--
-- COSA SI ROMPEVA. La migrazione 20261104181351 concedeva su `presenza:agenzia`
-- la sola estensione `presence` (lettura e scrittura). Ma Realtime, quando un
-- client entra in un canale privato, controlla per prima cosa il permesso di
-- LETTURA broadcast sul topic, e senza quello rifiuta l'ingresso con
-- «Unauthorized: You do not have permissions to read from this Channel topic»
-- — anche se il canale serve solo alla presenza. Visto sullo staging il 4
-- novembre (src/test/integration/realtimeCanali.test.js, log realtime_logs):
-- un utente attivo restava fuori dalla presenza, cioè i pallini «online» non
-- si sarebbero più accesi per nessuno.
--
-- COSA FA ORA. La policy di lettura ammette `presence` E `broadcast` per gli
-- utenti attivi. Su questo topic nessuno pubblica broadcast (la policy di
-- SCRITTURA resta sulla sola `presence`), quindi la lettura broadcast concede
-- l'ingresso e nient'altro. Il canale «sta scrivendo» non cambia: la sua
-- policy di lettura era già su `broadcast`.
--
-- Idempotente: `drop policy if exists` prima del `create`.

drop policy if exists "presenza_agenzia_lettura" on realtime.messages;
create policy "presenza_agenzia_lettura" on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'presenza:agenzia'
    and realtime.messages.extension in ('presence', 'broadcast')
    and (select private.is_active_user())
  );
