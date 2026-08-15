-- C-1 dell'audit del 14 agosto (terzo passaggio) — bonifica degli allegati di
-- chat rimasti senza conversazione.
--
-- IL CONTESTO. `chatCommands.removeConversation` eseguiva due passi sul server
-- in quest'ordine: (1) cancella tutti gli allegati dal bucket 'chat-files',
-- (2) cancella la riga `conversations`. L'ordine era motivato — dopo il DELETE
-- della riga la policy `chat_files_delete` (20260705092239) non autorizza più
-- la pulizia, perché il suo terzo ramo chiede che ESISTA una conversazione di
-- cui il chiamante è partecipante — ma metteva l'operazione IRREVERSIBILE per
-- prima e condizionata a nulla: se il passo (2) falliva (rete caduta fra i due
-- await, sessione revocata, RLS che rifiuta), la conversazione restava viva per
-- tutti i partecipanti con ogni allegato distrutto.
--
-- Il codice ora inverte l'ordine: prima la riga (con `count`, così un rifiuto
-- della RLS non passa più per una riuscita), poi gli allegati. Il rovescio è
-- che al momento della pulizia la conversazione non esiste più, quindi senza
-- questa migrazione il chiamante può rimuovere solo i file di cui è
-- `owner_id` — quelli caricati dagli ALTRI partecipanti resterebbero nel
-- bucket come orfani.
--
-- COSA FA QUESTA MIGRAZIONE. Aggiunge alla policy di DELETE un quarto ramo:
-- un oggetto di 'chat-files' il cui primo segmento di path NON corrisponde ad
-- alcuna conversazione esistente può essere rimosso da qualunque utente
-- autenticato (e attivo: la policy RESTRICTIVE `rls_active_only` di
-- 20260621153006 vale comunque su storage.objects tramite le proprie
-- policy — qui il gate è `to authenticated`).
--
-- PERCHÉ È SICURO. Il ramo si applica ai soli oggetti IRRAGGIUNGIBILI: senza
-- una conversazione, `chat_files_select` non li rende leggibili a nessuno e
-- nessun messaggio li referenzia più (i messaggi sono spariti in CASCADE con
-- la conversazione). L'unica operazione sensata su di essi è la cancellazione,
-- ed è anche l'unica desiderabile — sono allegati di chat, cioè dati personali
-- che l'utente ha chiesto di eliminare. Lasciarli è il problema, non la
-- garanzia. Il ramo non allarga di un millimetro l'accesso ai file VIVI: per
-- quelli continuano a valere `owner_id`, `is_admin()` e l'appartenenza alla
-- conversazione.
--
-- L'INSERT resta invariato (serve una conversazione esistente di cui si è
-- partecipanti), quindi non è possibile creare un path "orfano" a piacere per
-- poi cancellarci sopra: non ci sarebbe comunque nulla di altrui da toccare.

drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      owner_id = (select auth.uid())::text
      or (select public.is_admin())
      or exists (
        select 1 from public.conversations c
        where c.id::text = (storage.foldername(objects.name))[1]
          and (select auth.uid()) = any (c.participants)
      )
      -- Bonifica degli orfani: nessuna conversazione con quell'id esiste più.
      or not exists (
        select 1 from public.conversations c
        where c.id::text = (storage.foldername(objects.name))[1]
      )
    )
  );
