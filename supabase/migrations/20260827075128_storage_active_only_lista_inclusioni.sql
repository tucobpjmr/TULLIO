-- M-1 (audit sicurezza del 26 agosto) — il bucket `avatars` era escluso dal
-- gate RESTRICTIVE "utente attivo", e lo era per OMISSIONE.
--
-- LA SITUAZIONE. `storage_active_only` (20260822190100 e prima
-- 20260621153006) era scritta come lista di ESCLUSIONI:
--
--     bucket_id <> all (array['task-files','chat-files']) or private.is_active_user()
--
-- Per `bucket_id = 'avatars'` la prima disgiunzione è vera, quindi la policy
-- RESTRICTIVE risultava sempre soddisfatta: su quel bucket non vincolava
-- nulla. Il controllo "utente attivo" sopravviveva nella sola
-- `avatars_select_team`; `avatars_insert_own`, `avatars_update_own` e
-- `avatars_delete_own` guardano unicamente che la prima cartella sia
-- `auth.uid()`. Un utente `pending` — che AuthGate ferma su PendingScreen — o
-- un utente disattivato poteva quindi ancora scrivere e sovrascrivere il
-- proprio avatar chiamando l'API di Storage direttamente.
--
-- L'impatto è contenuto (5 MB, MIME ristretto a jpeg/png/webp, path proprio),
-- ed è la stessa asimmetria che 20260822190100 cita come il difetto vero:
-- «chi legge le policy non può dedurre la regola, e la prossima verrà scritta
-- copiando quella sbagliata».
--
-- COSA CAMBIA. La forma, che è il punto: da lista di ESCLUSIONI — dove
-- dimenticare un bucket lo lascia FUORI dal gate — a lista di INCLUSIONI, dove
-- dimenticarlo lo lascia DENTRO. L'errore per omissione diventa quello
-- restrittivo. I tre bucket dell'app (`storage.buckets`, verificato in
-- produzione: task-files, chat-files, avatars) sono tutti nominati; un quarto
-- bucket creato domani nasce sotto il gate finché qualcuno non lo esclude
-- esplicitamente, cioè scrivendolo e non dimenticandolo.
--
-- NESSUNA REGRESSIONE SUL PERCORSO DI ATTIVAZIONE. L'unico punto dell'app che
-- carica un avatar è `ProfileEditor` (src/lib/api/utenti.js), che vive dentro
-- la shell — cioè oltre AuthGate, che per `pending = true` mostra
-- PendingScreen e non monta nulla della shell. `PendingScreen` non usa
-- `Avatar`, quindi non legge nemmeno. La lettura del proprio avatar da parte
-- di un non attivo non serve a nessuno schermo e non viene concessa.
drop policy if exists "storage_active_only" on storage.objects;
create policy "storage_active_only" on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id not in ('task-files', 'chat-files', 'avatars')
    or private.is_active_user()
  )
  with check (
    bucket_id not in ('task-files', 'chat-files', 'avatars')
    or private.is_active_user()
  );
