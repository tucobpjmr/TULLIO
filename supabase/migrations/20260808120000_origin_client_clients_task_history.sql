-- S-1 — il contratto realtime di `origin_client` non era garantito dallo schema.
--
-- ⛔ NON ANCORA APPLICATA. Su questo progetto le migrazioni si applicano A MANO
-- (docs/CLAUDE.md, docs/MIGRAZIONI_SUPABASE.md): committare questo file non
-- significa averlo applicato.
--
-- ORDINE DI DEPLOY: questa migrazione PRIMA, il codice dopo. Nessuna riga qui
-- dentro cambia la firma di una RPC — l'unico accoppiamento è il punto 1:
-- `ClientsAPI.create/update` cominciano a mandare `origin_client`, e su uno
-- schema che ancora non ha la colonna PostgREST risponde PGRST204, cioè ogni
-- salvataggio in anagrafica fallisce. Nel verso giusto (migrazione prima,
-- codice dopo) non esiste finestra scoperta: una colonna in più che nessuno
-- scrive resta NULL e non disturba nessuno.
--
-- ── IL DIFETTO ─────────────────────────────────────────────────────────────
-- `subscribeToTable` (src/lib/api.js) scarta l'eco realtime della propria
-- scrittura leggendo `payload.new.origin_client`. Il commento sopra la funzione
-- descrive il meccanismo come attivo su tutte le tabelle live. Non lo era:
--
--   pubblicate su supabase_realtime (12): categories, clients, comments,
--     conversations, liste_viaggio, messages, movimenti_lista, notices,
--     notifications, task_history, tasks, users
--   con la colonna origin_client (8): categories, comments, conversations,
--     messages, notices, notifications, tasks, users
--   mancanti (4): clients, task_history, liste_viaggio, movimenti_lista
--
-- Un difetto di questa forma non produce un errore: produce traffico. Il
-- subscriber legge `undefined`, non filtra, e ricarica. Si vede solo nei
-- numeri, ed è per questo che è sopravvissuto a lungo.
--
-- ── 1. clients ─────────────────────────────────────────────────────────────
-- 818 righe. `Clients.create/update/remove` erano le uniche mutazioni del data
-- layer a non passare da `withOrigin`, quindi ogni salvataggio in anagrafica
-- faceva riscaricare l'elenco intero AL CLIENT CHE LO AVEVA FATTO — che quel
-- dato lo aveva già, in ottimistico.
--
-- La 20260807215625 (che ha pubblicato `clients` su realtime) aveva rimandato
-- di proposito questa scelta: «Aggiungere la colonna significherebbe toccare
-- anche ClientsAPI.create/update per taggarla: decisione separata, che questa
-- migrazione non deve trascinarsi dietro». Questa è quella decisione.
--
-- Tipo `uuid` e non `text`: è il tipo delle otto colonne omonime già esistenti
-- (getClientId() genera un UUID v4). Una nona colonna con lo stesso nome e un
-- tipo diverso renderebbe impossibile qualunque controllo uniforme sullo
-- schema — cioè esattamente il controllo che questo lavoro introduce.
alter table public.clients add column if not exists origin_client uuid;

-- ── 2. task_history ────────────────────────────────────────────────────────
-- Il caso peggiore, perché `tasks` è taggata CORRETTAMENTE e il difetto passa
-- comunque. Ogni UPDATE su un task fa scattare `log_task_history()`, che
-- inserisce una riga in una tabella figlia anch'essa pubblicata su realtime, e
-- quella riga non porta nessuna origine. Il client che ha appena spostato un
-- task in kanban riceve quindi un evento non filtrabile: `useAppHydration`
-- prende il ramo `soloThread` e rilegge `TaskThreadsAPI.history()` — 577 righe
-- — ricostruendo tutti i 248 task. Il tagging su `tasks` esisteva per evitare
-- proprio quel refetch, e l'eco rientrava dalla porta di servizio.
alter table public.task_history add column if not exists origin_client uuid;

-- ── 3. log_task_history(): propaga l'origine dalla riga padre ──────────────
-- `NEW` è la riga `tasks`, che `origin_client` ce l'ha già da 20260610192442.
-- Basta portarlo nelle SEI insert (created, status, priority, due_date,
-- assignees, trashed/restored): senza questa parte il punto 2 è inerte, la
-- colonna resterebbe sempre NULL e non cambierebbe nulla.
--
-- Nessun'altra modifica al corpo: firma, SECURITY DEFINER, search_path e la
-- logica dei rami sono identici alla 20260630232547. La `create or replace`
-- mantiene l'OID e quindi la revoca di EXECUTE della 20260630232610.
--
-- Perché `NEW.origin_client` è affidabile qui: nessuna funzione lato server
-- scrive su `public.tasks` (verificato su pg_proc), quindi ogni riga che
-- arriva a questo trigger viene da una mutation del data layer, che passa
-- sempre da `withOrigin`. Se un domani una RPC o un cron toccasse `tasks`
-- senza impostare la colonna, `NEW.origin_client` resterebbe il valore
-- dell'ULTIMA scrittura precedente (le colonne non toccate da un UPDATE
-- conservano il proprio valore) e la voce di cronologia verrebbe attribuita al
-- client sbagliato — che è l'unico modo in cui questo meccanismo può fare
-- danno invece di limitarsi a non aiutare. Chi aggiunge una scrittura
-- server-side su `tasks` deve quindi impostare `origin_client = null`.
create or replace function public.log_task_history()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    insert into public.task_history (task_id, actor_id, action, origin_client)
    values (NEW.id, NEW.created_by, 'created', NEW.origin_client);
    return NEW;
  end if;

  -- TG_OP = 'UPDATE': un INSERT per ciascun campo monitorato cambiato.
  if NEW.status is distinct from OLD.status then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value, origin_client)
    values (NEW.id, auth.uid(), 'status', OLD.status, NEW.status, NEW.origin_client);
  end if;

  if NEW.priority is distinct from OLD.priority then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value, origin_client)
    values (NEW.id, auth.uid(), 'priority', OLD.priority, NEW.priority, NEW.origin_client);
  end if;

  if NEW.due_date is distinct from OLD.due_date then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value, origin_client)
    values (
      NEW.id, auth.uid(), 'due_date',
      to_char(OLD.due_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      to_char(NEW.due_date at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      NEW.origin_client
    );
  end if;

  if NEW.assignees is distinct from OLD.assignees then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value, origin_client)
    values (
      NEW.id, auth.uid(), 'assignees',
      array_to_string(OLD.assignees, ','),
      array_to_string(NEW.assignees, ','),
      NEW.origin_client
    );
  end if;

  if NEW.deleted_at is distinct from OLD.deleted_at then
    insert into public.task_history (task_id, actor_id, action, old_value, new_value, origin_client)
    values (
      NEW.id, auth.uid(),
      case when NEW.deleted_at is not null then 'trashed' else 'restored' end,
      OLD.deleted_at::text, NEW.deleted_at::text,
      NEW.origin_client
    );
  end if;

  return NEW;
end;
$$;

-- ── 4. modifica_lista(): azzera l'origine quando rinomina un cliente ───────
-- Questa è la contropartita del punto 1, e senza di essa il punto 1 sarebbe
-- una REGRESSIONE, non una correzione.
--
-- Una colonna `origin_client` non si svuota da sola: un UPDATE che non la
-- nomina lascia in riga il valore dell'ultima scrittura che la nominava. Da
-- quando `clients` ce l'ha, questa sequenza diventa possibile:
--
--   1. l'agente A modifica la scheda di MARIO ROSSI in anagrafica
--      → clients.origin_client = <tab di A>
--   2. l'agente B rinomina lo stesso cliente dal dettaglio di una lista
--      (`modifica_lista` con p_client_name) → UPDATE clients set name = ...
--      → la colonna NON viene toccata e conserva <tab di A>
--   3. l'evento realtime arriva ad A con l'origine di A: `subscribeToTable`
--      lo scarta come eco della propria scrittura, e A continua a vedere il
--      nome vecchio finché non ricarica la pagina.
--
-- Cioè: il doppione in anagrafica che la 20260807215625 esisteva per chiudere.
-- `origin_client = null` significa «questa scrittura non è di nessun client
-- in particolare»: nessuno la filtra, tutti ricaricano. È il comportamento di
-- prima della colonna, ripristinato dove il tagging non arriva.
--
-- La firma resta IDENTICA (p_id uuid, p_titolo text, p_client_name text): è
-- una `create or replace` vera, non un overload. Nessuna modifica lato client,
-- nessun vincolo d'ordine col deploy. Il resto del corpo è copiato dalla
-- definizione in produzione (letta con pg_get_functiondef) senza altre
-- modifiche.
--
-- È l'unica RPC del modulo Liste che scrive su una riga `clients` ESISTENTE:
-- `crea_lista`, `aggiungi_beneficiario_lista` e `importa_backup` fanno solo
-- INSERT di righe nuove, che nascono con origin_client NULL.
create or replace function public.modifica_lista(
  p_id uuid,
  p_titolo text default null,
  p_client_name text default null
)
returns void
language plpgsql
set search_path to 'public'
as $function$
DECLARE
  v_titolo   text := NULLIF(trim(p_titolo), '');
  v_cliname  text := NULLIF(upper(trim(p_client_name)), '');
  v_lista    liste_viaggio;
  v_old_cli  text;
  v_changed  boolean := false;
  v_old_snap text;
  v_new_snap text;
BEGIN
  SELECT * INTO v_lista FROM liste_viaggio
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_id;
  END IF;

  SELECT name INTO v_old_cli FROM clients WHERE id = v_lista.client_id;

  IF p_client_name IS NOT NULL AND v_cliname IS NULL THEN
    RAISE EXCEPTION 'Il nome del cliente non puo'' essere vuoto.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_old_snap := COALESCE(v_old_cli, '')
             || CASE WHEN v_lista.titolo IS NOT NULL THEN ' — ' || v_lista.titolo ELSE '' END;

  IF v_cliname IS NOT NULL AND v_cliname IS DISTINCT FROM v_old_cli THEN
    -- origin_client = NULL: vedi il commento in testa a questo blocco. La
    -- rinomina arriva da qui, non dall'anagrafica, e non deve essere scambiata
    -- per l'eco della scrittura di un altro client.
    UPDATE clients SET name = v_cliname, origin_client = NULL WHERE id = v_lista.client_id;
    v_changed := true;
  END IF;

  IF v_titolo IS DISTINCT FROM v_lista.titolo THEN
    UPDATE liste_viaggio SET titolo = v_titolo WHERE id = p_id;
    v_changed := true;
  END IF;

  IF NOT v_changed THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio SET updated_at = now() WHERE id = p_id;

  v_new_snap := COALESCE(v_cliname, v_old_cli, '')
             || CASE WHEN v_titolo IS NOT NULL THEN ' — ' || v_titolo ELSE '' END;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, auth.uid(), 'lista_modificata', v_old_snap, v_new_snap);
END;
$function$;

-- ── COSA QUESTA MIGRAZIONE NON FA, E PERCHÉ ────────────────────────────────
--
-- (a) NON alza la REPLICA IDENTITY a FULL su nessuna tabella.
--
-- Il rilievo di partenza osservava — correttamente — che con l'identità di
-- default il payload di un DELETE porta la sola chiave primaria, quindi
-- `payload.old.origin_client` non è leggibile su categories, clients,
-- liste_viaggio, movimenti_lista, task_history. La conclusione naturale
-- sarebbe «allora alziamola a FULL». È sbagliata, e vale la pena scriverlo qui
-- perché è controintuitivo.
--
-- `.delete()` di supabase-js non accetta un payload: una DELETE non può
-- trasportare l'origine di CHI cancella. Con REPLICA IDENTITY FULL il campo
-- diventa leggibile, ma il valore che si legge è quello dell'ULTIMA SCRITTURA
-- PRECEDENTE — un'origine STANTIA, che appartiene a un altro momento e quasi
-- sempre a un altro utente. Il filtro allora sbaglia nel verso peggiore:
--
--   A modifica un cliente (origin = A) → B lo elimina → l'evento DELETE arriva
--   ad A con origin = A → A lo scarta come eco propria → nella lista di A quel
--   cliente resta, e resta finché A non ricarica la pagina.
--
-- Senza FULL non c'è nessun valore da leggere, nessun filtro scatta, e ogni
-- DELETE provoca un refetch: una richiesta in più, sempre corretta. Il
-- compromesso è fra «una fetch in più per ogni cancellazione» e «una riga
-- fantasma per un utente a caso»: non è un compromesso.
--
-- La stessa 20260807215625 era già arrivata qui per un'altra strada: «Non
-- serve alzarla a FULL. Il consumatore ricarica l'elenco intero a ogni evento
-- e non legge payload.old».
--
-- Nota per chi legge dopo: le sette tabelle già a FULL (tasks, notices,
-- conversations, messages, comments, users, notifications) hanno OGGI quel
-- difetto, per le loro DELETE. È un rilievo separato e la sua sede è
-- `subscribeToTable`, che dovrebbe ignorare l'origine sugli eventi DELETE
-- invece di fidarsene — una riga di codice client, non una migrazione. Questo
-- file non la tocca per non mescolare due modifiche con superfici di rischio
-- diverse, ma non aggiunge nemmeno altre cinque tabelle allo stesso problema.
--
-- (b) NON aggiunge origin_client a liste_viaggio e movimenti_lista.
--
-- Tutte le scritture di quel modulo sono RPC (src/lib/listeApi.js), sedici in
-- tutto, e nessuna trasporta l'origine. Aggiungere la colonna senza toccare le
-- RPC la lascerebbe eternamente NULL: zero effetto. Toccare le RPC significa
-- aggiungere loro un parametro `p_origin`, e lì c'è una trappola doppia:
--
--   - `create or replace function` con un parametro in più NON sostituisce la
--     funzione: ne crea un OVERLOAD, e PostgREST si trova due candidate per la
--     stessa chiamata;
--   - le migrazioni qui si applicano a mano. Un client che manda `p_origin` a
--     una RPC che sul database non l'ha ancora fa fallire OGNI scrittura del
--     modulo Liste in produzione, con PGRST202.
--
-- Il modulo, per giunta, è quello che dal difetto perde meno: `useListeData`
-- ricarica comunque tre query a ogni scrittura, per scelta esplicita
-- (docs/CLAUDE.md: nessun update ottimistico nel modulo Liste, mai mostrare
-- uno stato che il database non ha confermato). Il refetch che il tagging
-- eviterebbe altrove, qui è il comportamento voluto.
--
-- Resta quindi come follow-up dichiarato, da fare in un solo pezzo — sedici
-- `drop function` + `create function` con `p_origin`, più il fallback lato
-- client sul codice PGRST202/42883 sul modello di `isMissingColumn` in
-- src/state/persistence.js — e non a metà.
