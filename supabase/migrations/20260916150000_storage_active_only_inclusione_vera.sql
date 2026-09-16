-- `storage_active_only`: l'inclusione che M-1 aveva dichiarato e non scritto.
--
-- ─── LA FRASE E IL CODICE DICEVANO DUE COSE OPPOSTE ─────────────────────────
-- M-1 dell'audit sicurezza del 26 agosto (migrazione 20260827075128) ha
-- corretto un buco reale — il bucket `avatars` era fuori dal gate «utente
-- attivo», e un utente pending o disattivato poteva sovrascrivere la propria
-- foto chiamando l'API di Storage direttamente. Quella correzione è giusta ed
-- è viva.
--
-- Ma il commento di quella migrazione dichiara anche di aver cambiato la
-- FORMA della policy:
--
--   «da lista di ESCLUSIONI — dove dimenticare un bucket lo lascia FUORI dal
--    gate — a lista di INCLUSIONI, dove dimenticarlo lo lascia DENTRO […] un
--    quarto bucket creato domani nasce sotto il gate finché qualcuno non lo
--    esclude esplicitamente»
--
-- L'SQL non lo fa. Il corpo era, e fino a questa migrazione è rimasto:
--
--   using ( bucket_id not in ('task-files','chat-files','avatars', …)
--           or private.is_active_user() )
--
-- che è logicamente IDENTICO al `bucket_id <> all(array[…]) or …` di prima:
-- per un bucket non elencato la prima disgiunzione è vera, la policy
-- RESTRICTIVE risulta soddisfatta e non vincola nulla. L'errore per omissione
-- è rimasto quello PERMISSIVO — esattamente il difetto che M-1 descrive come
-- la ragione vera della correzione: «chi legge le policy non può dedurre la
-- regola, e la prossima verrà scritta copiando quella sbagliata».
--
-- Ciò che è cambiato il 26 agosto è stato l'ELENCO (una voce in più), non la
-- forma. E il 16 settembre è successo di nuovo: aggiungendo il bucket
-- `documenti-identita` (20260916120000) si è dovuto NOMINARLO, con un commento
-- che spiegava perché — la prova che la promessa del 26 agosto non stava in
-- piedi, perché se stesse in piedi non ci sarebbe stato niente da nominare.
--
-- ─── IMPATTO ────────────────────────────────────────────────────────────────
-- NESSUNO sul comportamento di oggi: i quattro bucket esistenti
-- (task-files, chat-files, avatars, documenti-identita) sono tutti nominati,
-- quindi tutti già dentro il gate. È un rischio LATENTE, e la sua forma è
-- nota perché si è già realizzata una volta: il prossimo bucket nasce
-- scoperto, e chi legge il commento crede il contrario.
--
-- ─── LA FORMA CORRETTA ──────────────────────────────────────────────────────
-- Nessun elenco. Il gate vale per `storage.objects` INTERA, e un bucket
-- creato domani ci nasce dentro senza che nessuno debba ricordarsene — che è
-- ciò che M-1 voleva dire.
--
-- Se un domani servirà un bucket ESENTE — un bucket davvero pubblico, i cui
-- oggetti debbano essere leggibili anche da chi non è ancora approvato — si
-- scrive la disgiunzione allora:
--
--   using ( bucket_id in ('nome-del-bucket-pubblico')
--           or (select private.is_active_user()) )
--
-- cioè un elenco di ECCEZIONI, che si allunga solo per una decisione
-- esplicita. Oggi quell'elenco è vuoto, e un elenco vuoto non si scrive:
-- `in ()` non è SQL valido, e un `= any(array[]::text[])` sarebbe una riga di
-- rumore che dichiara il nulla.
--
-- ─── PERCHÉ `(select …)` ────────────────────────────────────────────────────
-- Non è cosmesi, ed è più importante di prima. Con l'elenco, la funzione
-- veniva valutata solo per i bucket nominati; senza elenco viene valutata per
-- OGNI riga di `storage.objects` toccata da una query. Il wrapping in una
-- sotto-select la rende un InitPlan — valutata UNA volta per query invece che
-- una per riga — ed è la stessa ottimizzazione già applicata al resto delle
-- policy del progetto da `20260622213133_perf_rls_initplan_dedup`. La versione
-- precedente di questa policy chiamava `private.is_active_user()` nuda: la
-- correzione della forma porta con sé anche questa.
--
-- ─── PERCHÉ NON SI ROMPE NIENTE (verificato, non dedotto) ───────────────────
-- La domanda è: esiste un percorso legittimo dell'app che tocchi Storage con
-- un utente non attivo o `pending`? Tre rami, tutti chiusi:
--
--   1. IL CLIENT. Ogni chiamata a Storage di `src/` sta nel data layer
--      (`lib/api/allegati.js`, `chat.js`, `utenti.js`, `documenti.js`,
--      `storage.js`) e vive DENTRO la shell. `auth/AuthGate.jsx` monta la
--      shell solo dopo `if (profile.pending) return <PendingScreen />`, e
--      `PendingScreen` non importa nulla che tocchi Storage (i suoi soli
--      import sono useAuth, screenWrap e gli stili comuni). Un pending non
--      raggiunge quel codice, e se lo chiamasse a mano verrebbe rifiutato —
--      che è il punto.
--
--   2. LE EDGE FUNCTION. Le due che toccano Storage — `delete-user` e
--      `delete-account`, entrambe per rimuovere `<user_id>/avatar.jpg` —
--      usano il client costruito con `SUPABASE_SERVICE_ROLE_KEY`, che
--      BYPASSA la RLS. Il caso che conta è `delete-account`: chi cancella il
--      proprio account può benissimo essere già disattivato, e senza questo
--      ramo la pulizia dell'avatar fallirebbe proprio quando serve. Passa dal
--      service role, quindi questa policy non la vede.
--
--   3. `anon`. Resta fuori: la policy è `to authenticated`, e su
--      `storage.objects` non esiste più alcuna policy permissiva per `anon` o
--      `public` da quando `avatars_public_select` è stata droppata
--      (20260706173939). Per `anon` la RLS nega già per ASSENZA di permesso,
--      che è più stretto di qualunque restrictive.
--
-- E il contrappeso, quello che dice che il gate non è troppo largo:
-- `avatars_select_team` (20260806180000) chiede GIÀ `private.is_active_user()`
-- per leggere un avatar. Cioè la lettura degli avatar era già ristretta agli
-- utenti attivi da un mese prima di M-1, e nessuno se ne è lamentato: la
-- prova sul campo che nessuna schermata dell'app ha bisogno di leggere
-- Storage da non attivo.

drop policy if exists "storage_active_only" on storage.objects;
create policy "storage_active_only" on storage.objects
  as restrictive for all to authenticated
  using ((select private.is_active_user()))
  with check ((select private.is_active_user()));

comment on policy "storage_active_only" on storage.objects is
  'Gate RESTRICTIVE «utente attivo» su TUTTO storage.objects: nessun elenco di '
  'bucket, così un bucket nuovo nasce protetto invece che scoperto. Un bucket '
  'esente va aggiunto come disgiunzione esplicita — vedi il preambolo di '
  'supabase/migrations/20260916150000_storage_active_only_inclusione_vera.sql. '
  'Un elenco di bucket qui dentro è una regressione: lo fa fallire '
  '`npm run verifica:convenzioni`.';
