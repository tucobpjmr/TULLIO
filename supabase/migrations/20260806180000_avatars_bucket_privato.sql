-- S-10 — Il bucket `avatars` non è più pubblico.
--
-- IL PROBLEMA. Il bucket aveva `public = true`. Le policy avatars_select_own
-- limitavano il ruolo `authenticated` alla propria cartella, ma su un bucket
-- pubblico la rotta /storage/v1/object/public/avatars/<uid>/avatar.jpg NON
-- passa dalla RLS: chiunque, senza autenticazione, scarica la foto conoscendo
-- l'UUID. E gli UUID sono noti a ogni utente autenticato
-- (users_select_all USING (true)), quindi restano validi anche dopo la
-- disattivazione dell'account. Il path era per giunta deterministico
-- (api.js: `${userId}/avatar.jpg`), quindi non c'era nemmeno la protezione
-- accidentale di un nome imprevedibile.
--
-- PERCHÉ ORA COSTA POCO FARLO. Un controllo prima di intervenire ha mostrato
-- che il bucket è VUOTO (0 oggetti) e che le uniche due foto profilo esistenti
-- sono data URI base64 salvati direttamente in users.photo_url — cioè il
-- percorso di upload esiste nel codice (ProfileEditor → Users.uploadAvatar) ma
-- non ha mai prodotto un file qui. Non c'è quindi nessun dato da migrare e
-- nessuna foto che possa rompersi: le due esistenti continuano a essere
-- renderizzate dal loro data URI, che non passa dallo storage.
--
-- Da fare ORA e non "quando servirà": il primo utente che cambia foto dopo
-- questo commit crea un file, e con il bucket pubblico quel file nascerebbe
-- con una URL permanente e indovinabile. Dopo, la stessa migrazione
-- richiederebbe di riscrivere i valori photo_url già distribuiti.
update storage.buckets set public = false where id = 'avatars';

-- La lettura resta a tutto il team, non solo alla propria cartella: gli avatar
-- compaiono in ogni card, messaggio e assegnatario, quindi "solo il mio" non è
-- mai stato ciò che serve — era semplicemente irrilevante finché il bucket era
-- pubblico e la policy scavalcata. Ora che la RLS conta davvero, la regola
-- giusta è "utenti autenticati e attivi", con il gate che vale ovunque.
drop policy if exists "avatars_select_own" on storage.objects;

create policy "avatars_select_team" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (select private.is_active_user()));

-- INSERT/UPDATE/DELETE restano sulla propria cartella: nessuno cambia la foto
-- di un collega. (avatars_insert_own / avatars_update_own / avatars_delete_own
-- non sono toccate.)
