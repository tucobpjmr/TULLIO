-- Suggerimento strategico n.3 (audit del 16 agosto) — il modulo Liste sotto
-- lo stesso contratto realtime del core.
--
-- Follow-up dichiarato nel blocco (b) della migrazione 20260808120000 e
-- nell'elenco ECCEZIONI di src/test/realtimeOriginContract.test.js: tre
-- tabelle pubblicate su supabase_realtime (liste_viaggio, movimenti_lista,
-- lista_beneficiari) senza origin_client, perché tutte le scritture del
-- modulo passano da RPC e nessuna RPC trasporta l'origine.
--
-- ORDINE DI DEPLOY: questa migrazione PRIMA, il codice client dopo — come
-- 20260808120000. Le tredici RPC toccate qui sotto guadagnano un parametro
-- IN PIÙ (p_origin uuid DEFAULT NULL, sempre ultimo, sempre con default):
-- un client che continua a chiamarle senza quel parametro (cioè il codice
-- attuale, prima del prossimo deploy) funziona esattamente come prima,
-- origin_client resta NULL come è oggi. È il verso sicuro: solo quando il
-- client INIZIA a mandare p_origin la colonna comincia a valorizzarsi. Il
-- verso pericoloso (client che manda p_origin a un database che non lo
-- accetta ancora, PGRST202 su ogni scrittura del modulo) è quello per cui
-- questa migrazione deve precedere il codice, mai seguirlo.
--
-- `drop function` + `create function`, non `create or replace`: una
-- `create or replace` con un parametro in più non sostituisce la funzione,
-- ne crea un OVERLOAD (la SIGNATURE — nome + tipi dei parametri — è cambiata),
-- e PostgREST si troverebbe due candidate per la stessa chiamata. Ogni DROP
-- qui sotto nomina il tipo esatto dei parametri ATTUALI (letti da
-- pg_get_function_identity_arguments in produzione), non un `if exists`
-- ottimista: se il nome o la firma non corrispondessero più a quanto letto
-- oggi, è giusto che la migrazione fallisca invece di silenziarsi.
--
-- ── PERCHÉ SOLO TREDICI RPC SU SEDICI ───────────────────────────────────────
-- Il modulo ne ha sedici in tutto (src/components/liste/listeApi.js). Le tre
-- fuori da questa migrazione — rimuovi_beneficiario_lista,
-- elimina_lista_definitivamente, reset_completo — non fanno mai un INSERT o
-- un UPDATE su liste_viaggio/movimenti_lista/lista_beneficiari: solo DELETE
-- (le prime due) o TRUNCATE (la terza). Un p_origin lì sarebbe un parametro
-- che nessun corpo di funzione potrebbe mai usare: subscribeToTable
-- (src/lib/api.js) non si fida MAI dell'origine su un evento DELETE — la
-- stessa ragione per cui il blocco (a) della 20260808120000 non ha alzato
-- nessuna tabella a REPLICA IDENTITY FULL — quindi taggare una riga che sta
-- per sparire non produrrebbe alcun filtro utilizzabile. Aggiungerlo comunque
-- sarebbe un parametro morto, esattamente ciò che questo progetto evita.
--
-- ── PERCHÉ `clients` RESTA NULL ANCHE QUI ───────────────────────────────────
-- Tre di queste tredici RPC (crea_lista, aggiungi_beneficiario_lista,
-- importa_backup) possono inserire una riga NUOVA in `clients` (cliente
-- creato al volo). Quell'INSERT non prende `origin_client = p_origin`, e non
-- è una dimenticanza: è la STESSA regola già scritta nel blocco 4 della
-- 20260808120000 per l'UPDATE di modifica_lista. Il modulo Liste non tocca
-- mai lo state del reducer del core — CRM Clienti vive lì, alimentato solo
-- dalla propria sottoscrizione realtime su `clients`. Se questo client
-- taggasse la propria riga nuova con la propria origine, il PROPRIO
-- subscribeToTable scarterebbe l'eco come già vista — ma non l'ha mai vista,
-- perché nessun percorso ottimistico del modulo Liste scrive in
-- state.clients. Il risultato sarebbe un client che ha appena creato un
-- cliente e non lo vede comparire nella propria anagrafica finché non
-- ricarica la pagina: un difetto peggiore di quello che questa migrazione
-- vuole chiudere. `origin_client = NULL` (il default, non toccato) è quindi
-- corretto qui, non un'omissione.
--
-- ── GRANT ──────────────────────────────────────────────────────────────────
-- Ogni funzione toccata ha oggi lo stesso ACL (letto da pg_proc.proacl in
-- produzione): EXECUTE a authenticated e service_role, PUBLIC e anon già
-- revocati dalle migrazioni di hardening (20260716114544, 20260804100000).
-- `create function` di per sé concederebbe EXECUTE a PUBLIC per default — il
-- comportamento standard di Postgres per le funzioni, a differenza delle
-- tabelle — quindi ogni blocco chiude con `revoke all ... from public`. Non
-- basta da solo: questo progetto ha `pg_default_acl` impostato per il ruolo
-- proprietario dello schema in modo da concedere EXECUTE anche ad `anon` su
-- OGNI funzione nuova (verificato in produzione durante la stesura di questa
-- migrazione: `anon` è un ruolo con un proprio ACL esplicito, non il
-- chiamante implicito PUBLIC, quindi `revoke ... from public` non lo tocca).
-- Ogni blocco aggiunge perciò anche una `revoke execute ... from anon`
-- dedicata, PRIMA dei due GRANT — la stessa forma già usata da
-- 20260716114544_revoke_anon_execute_rpc_liste e
-- 20260804100000_revoke_anon_aggiungi_beneficiario per lo stesso motivo.

alter table public.liste_viaggio add column if not exists origin_client uuid;
alter table public.movimenti_lista add column if not exists origin_client uuid;
alter table public.lista_beneficiari add column if not exists origin_client uuid;

-- ── 1. crea_lista ────────────────────────────────────────────────────────
drop function public.crea_lista(uuid, text, text);

create function public.crea_lista(
  p_client_id uuid default null::uuid,
  p_titolo text default null::text,
  p_new_client_name text default null::text,
  p_origin uuid default null::uuid
)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_client uuid := p_client_id;
  v_titolo text := NULLIF(trim(p_titolo), '');
  v_lista  uuid;
BEGIN
  IF v_client IS NULL THEN
    IF NULLIF(trim(p_new_client_name), '') IS NULL THEN
      RAISE EXCEPTION 'Indicare un cliente esistente o il nome di un nuovo cliente.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO clients (name)
    VALUES (upper(trim(p_new_client_name)))
    RETURNING id INTO v_client;
  END IF;

  INSERT INTO liste_viaggio (client_id, titolo, created_by, origin_client)
  VALUES (v_client, v_titolo, auth.uid(), p_origin)
  RETURNING id INTO v_lista;

  INSERT INTO lista_history (lista_id, actor_id, action, new_value)
  VALUES (v_lista, auth.uid(), 'lista_creata', v_titolo);

  RETURN v_lista;
END;
$function$;

revoke all on function public.crea_lista(uuid, text, text, uuid) from public;
revoke execute on function public.crea_lista(uuid, text, text, uuid) from anon;
grant execute on function public.crea_lista(uuid, text, text, uuid) to authenticated;
grant execute on function public.crea_lista(uuid, text, text, uuid) to service_role;

-- ── 2. modifica_lista ────────────────────────────────────────────────────
-- Due UPDATE su liste_viaggio in sequenza (titolo, poi updated_at), non uno:
-- entrambi devono taggare esplicitamente origin_client, perché il secondo
-- (incondizionato, gira anche quando cambia solo il nome cliente) è a volte
-- l'UNICO a toccare la riga in questa chiamata — se non taggasse anche lui,
-- la colonna manterrebbe il valore RESIDUO dell'ultima scrittura precedente,
-- non NULL: esattamente il difetto che il blocco 4 della 20260808120000 ha
-- già dovuto correggere una volta, sull'UPDATE di `clients` qui sotto (che
-- infatti resta invariato, origin_client = NULL, per la stessa ragione).
drop function public.modifica_lista(uuid, text, text);

create function public.modifica_lista(
  p_id uuid,
  p_titolo text default null::text,
  p_client_name text default null::text,
  p_origin uuid default null::uuid
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
    -- origin_client = NULL: la rinomina arriva da qui, non dall'anagrafica,
    -- e non deve essere scambiata per l'eco della scrittura di un altro
    -- client sulla riga `clients` (vedi il blocco 4 della 20260808120000,
    -- che ha introdotto questa riga esattamente com'è).
    UPDATE clients SET name = v_cliname, origin_client = NULL WHERE id = v_lista.client_id;
    v_changed := true;
  END IF;

  IF v_titolo IS DISTINCT FROM v_lista.titolo THEN
    UPDATE liste_viaggio SET titolo = v_titolo, origin_client = p_origin WHERE id = p_id;
    v_changed := true;
  END IF;

  IF NOT v_changed THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio SET updated_at = now(), origin_client = p_origin WHERE id = p_id;

  v_new_snap := COALESCE(v_cliname, v_old_cli, '')
             || CASE WHEN v_titolo IS NOT NULL THEN ' — ' || v_titolo ELSE '' END;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, auth.uid(), 'lista_modificata', v_old_snap, v_new_snap);
END;
$function$;

revoke all on function public.modifica_lista(uuid, text, text, uuid) from public;
revoke execute on function public.modifica_lista(uuid, text, text, uuid) from anon;
grant execute on function public.modifica_lista(uuid, text, text, uuid) to authenticated;
grant execute on function public.modifica_lista(uuid, text, text, uuid) to service_role;

-- ── 3. sposta_titolare_lista (SECURITY DEFINER) ─────────────────────────
drop function public.sposta_titolare_lista(uuid, uuid);

create function public.sposta_titolare_lista(
  p_id uuid,
  p_nuovo_client_id uuid,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_lista     liste_viaggio;
  v_old_nome  text;
  v_new_nome  text;
  v_era_benef boolean;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lista FROM liste_viaggio
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_id;
  END IF;

  IF p_nuovo_client_id IS NULL THEN
    RAISE EXCEPTION 'Indicare il cliente su cui spostare la lista.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_nuovo_client_id = v_lista.client_id THEN
    RAISE EXCEPTION 'La lista è già di questo cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_new_nome FROM clients WHERE id = p_nuovo_client_id;
  IF v_new_nome IS NULL THEN
    RAISE EXCEPTION 'Cliente di destinazione non trovato.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT name INTO v_old_nome FROM clients WHERE id = v_lista.client_id;

  SELECT EXISTS (
    SELECT 1 FROM lista_beneficiari WHERE lista_id = p_id AND client_id = p_nuovo_client_id
  ) INTO v_era_benef;

  IF v_era_benef THEN
    -- DELETE, non taggato: nessuna origine è mai attendibile su una riga che
    -- sta per sparire (stessa ragione delle tre RPC escluse da questa
    -- migrazione).
    DELETE FROM lista_beneficiari WHERE lista_id = p_id AND client_id = p_nuovo_client_id;
    INSERT INTO lista_history (lista_id, actor_id, action, old_value)
    VALUES (p_id, (SELECT auth.uid()), 'beneficiario_rimosso', v_new_nome);
  END IF;

  UPDATE liste_viaggio SET client_id = p_nuovo_client_id, origin_client = p_origin WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, (SELECT auth.uid()), 'titolare_spostato', v_old_nome, v_new_nome);
END;
$function$;

revoke all on function public.sposta_titolare_lista(uuid, uuid, uuid) from public;
revoke execute on function public.sposta_titolare_lista(uuid, uuid, uuid) from anon;
grant execute on function public.sposta_titolare_lista(uuid, uuid, uuid) to authenticated;
grant execute on function public.sposta_titolare_lista(uuid, uuid, uuid) to service_role;

-- ── 4. aggiungi_beneficiario_lista ───────────────────────────────────────
drop function public.aggiungi_beneficiario_lista(uuid, uuid, text);

create function public.aggiungi_beneficiario_lista(
  p_lista_id uuid,
  p_client_id uuid default null::uuid,
  p_new_client_name text default null::text,
  p_origin uuid default null::uuid
)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_lista  liste_viaggio;
  v_client uuid := p_client_id;
  v_nome   text;
BEGIN
  SELECT * INTO v_lista FROM liste_viaggio
   WHERE id = p_lista_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_lista_id;
  END IF;

  IF v_client IS NULL THEN
    IF NULLIF(trim(p_new_client_name), '') IS NULL THEN
      RAISE EXCEPTION 'Indicare un cliente esistente o il nome di un nuovo cliente.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO clients (name)
    VALUES (upper(trim(p_new_client_name)))
    RETURNING id INTO v_client;
  END IF;

  IF v_client = v_lista.client_id THEN
    RAISE EXCEPTION 'Questo cliente è già il titolare della lista.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (SELECT 1 FROM lista_beneficiari WHERE lista_id = p_lista_id AND client_id = v_client) THEN
    RAISE EXCEPTION 'Questo cliente è già cointestatario di questa lista.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_nome FROM clients WHERE id = v_client;

  INSERT INTO lista_beneficiari (lista_id, client_id, created_by, origin_client)
  VALUES (p_lista_id, v_client, auth.uid(), p_origin);

  INSERT INTO lista_history (lista_id, actor_id, action, new_value)
  VALUES (p_lista_id, auth.uid(), 'beneficiario_aggiunto', v_nome);

  RETURN v_client;
END;
$function$;

revoke all on function public.aggiungi_beneficiario_lista(uuid, uuid, text, uuid) from public;
revoke execute on function public.aggiungi_beneficiario_lista(uuid, uuid, text, uuid) from anon;
grant execute on function public.aggiungi_beneficiario_lista(uuid, uuid, text, uuid) to authenticated;
grant execute on function public.aggiungi_beneficiario_lista(uuid, uuid, text, uuid) to service_role;

-- ── 5. cambia_stato_lista ────────────────────────────────────────────────
drop function public.cambia_stato_lista(uuid, text);

create function public.cambia_stato_lista(
  p_id uuid,
  p_stato text,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_old text;
BEGIN
  IF p_stato NOT IN ('attiva', 'esaurita') THEN
    RAISE EXCEPTION 'Valore non valido per stato: %. Valori ammessi: attiva, esaurita.', p_stato
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT stato INTO v_old FROM liste_viaggio
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_id;
  END IF;
  IF v_old = p_stato THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio
     SET stato         = p_stato,
         closed_at     = CASE WHEN p_stato = 'esaurita' THEN now() ELSE NULL END,
         origin_client = p_origin
   WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, auth.uid(),
          CASE WHEN p_stato = 'esaurita' THEN 'lista_chiusa' ELSE 'lista_riaperta' END,
          v_old, p_stato);
END;
$function$;

revoke all on function public.cambia_stato_lista(uuid, text, uuid) from public;
revoke execute on function public.cambia_stato_lista(uuid, text, uuid) from anon;
grant execute on function public.cambia_stato_lista(uuid, text, uuid) to authenticated;
grant execute on function public.cambia_stato_lista(uuid, text, uuid) to service_role;

-- ── 6. archivia_lista ─────────────────────────────────────────────────────
drop function public.archivia_lista(uuid);

create function public.archivia_lista(
  p_id uuid,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
BEGIN
  UPDATE liste_viaggio
     SET deleted_at = now(), origin_client = p_origin
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o già archiviata.', p_id;
  END IF;

  INSERT INTO lista_history (lista_id, actor_id, action)
  VALUES (p_id, auth.uid(), 'lista_archiviata');
END;
$function$;

revoke all on function public.archivia_lista(uuid, uuid) from public;
revoke execute on function public.archivia_lista(uuid, uuid) from anon;
grant execute on function public.archivia_lista(uuid, uuid) to authenticated;
grant execute on function public.archivia_lista(uuid, uuid) to service_role;

-- ── 7. ripristina_lista ───────────────────────────────────────────────────
drop function public.ripristina_lista(uuid);

create function public.ripristina_lista(
  p_id uuid,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_deleted timestamptz;
BEGIN
  SELECT deleted_at INTO v_deleted FROM liste_viaggio
   WHERE id = p_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata.', p_id;
  END IF;
  IF v_deleted IS NULL THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio SET deleted_at = NULL, origin_client = p_origin WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action)
  VALUES (p_id, auth.uid(), 'lista_ripristinata');
END;
$function$;

revoke all on function public.ripristina_lista(uuid, uuid) from public;
revoke execute on function public.ripristina_lista(uuid, uuid) from anon;
grant execute on function public.ripristina_lista(uuid, uuid) to authenticated;
grant execute on function public.ripristina_lista(uuid, uuid) to service_role;

-- ── 8. registra_movimento_lista ──────────────────────────────────────────
drop function public.registra_movimento_lista(uuid, date, text, numeric, text);

create function public.registra_movimento_lista(
  p_lista_id uuid,
  p_data date,
  p_descrizione text,
  p_importo numeric,
  p_metodo text default null::text,
  p_origin uuid default null::uuid
)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_desc text := upper(trim(p_descrizione));
  v_id   uuid;
BEGIN
  IF v_desc = '' OR p_data IS NULL OR p_importo IS NULL OR p_importo = 0 THEN
    RAISE EXCEPTION 'Data, descrizione e importo (diverso da zero) sono obbligatori.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('pos','bonifico','contanti','assegno','altro') THEN
    RAISE EXCEPTION 'Valore non valido per metodo: %.', p_metodo
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM liste_viaggio
   WHERE id = p_lista_id AND deleted_at IS NULL AND stato = 'attiva'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata, archiviata o non attiva.', p_lista_id;
  END IF;

  INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, created_by, origin_client)
  VALUES (p_lista_id, p_data, v_desc, p_importo, p_metodo, auth.uid(), p_origin)
  RETURNING id INTO v_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
  VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
          mov_snapshot(p_data, v_desc, p_importo));

  RETURN v_id;
END;
$function$;

revoke all on function public.registra_movimento_lista(uuid, date, text, numeric, text, uuid) from public;
revoke execute on function public.registra_movimento_lista(uuid, date, text, numeric, text, uuid) from anon;
grant execute on function public.registra_movimento_lista(uuid, date, text, numeric, text, uuid) to authenticated;
grant execute on function public.registra_movimento_lista(uuid, date, text, numeric, text, uuid) to service_role;

-- ── 9. registra_movimenti_lista ──────────────────────────────────────────
drop function public.registra_movimenti_lista(uuid, date, jsonb, text);

create function public.registra_movimenti_lista(
  p_lista_id uuid,
  p_data date,
  p_movimenti jsonb,
  p_metodo text default null::text,
  p_origin uuid default null::uuid
)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_riga    jsonb;
  v_desc    text;
  v_importo numeric;
  v_id      uuid;
  v_n       integer := 0;
BEGIN
  IF p_data IS NULL THEN
    RAISE EXCEPTION 'La data è obbligatoria.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_movimenti IS NULL
     OR jsonb_typeof(p_movimenti) <> 'array'
     OR jsonb_array_length(p_movimenti) = 0 THEN
    RAISE EXCEPTION 'Nessun movimento da registrare.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('pos','bonifico','contanti','assegno','altro') THEN
    RAISE EXCEPTION 'Valore non valido per metodo: %.', p_metodo
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM liste_viaggio
   WHERE id = p_lista_id AND deleted_at IS NULL AND stato = 'attiva'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata, archiviata o non attiva.', p_lista_id;
  END IF;

  FOR v_riga IN SELECT * FROM jsonb_array_elements(p_movimenti)
  LOOP
    v_desc := upper(trim(coalesce(v_riga ->> 'descrizione', '')));

    BEGIN
      v_importo := (v_riga ->> 'importo')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Riga %: importo non numerico.', v_n + 1
        USING ERRCODE = 'check_violation';
    END;

    IF v_desc = '' OR v_importo IS NULL OR v_importo = 0 THEN
      RAISE EXCEPTION 'Riga %: descrizione e importo (diverso da zero) sono obbligatori.', v_n + 1
        USING ERRCODE = 'check_violation';
    END IF;

    INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, created_by, origin_client)
    VALUES (p_lista_id, p_data, v_desc, v_importo, p_metodo, auth.uid(), p_origin)
    RETURNING id INTO v_id;

    INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
    VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
            mov_snapshot(p_data, v_desc, v_importo));

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

revoke all on function public.registra_movimenti_lista(uuid, date, jsonb, text, uuid) from public;
revoke execute on function public.registra_movimenti_lista(uuid, date, jsonb, text, uuid) from anon;
grant execute on function public.registra_movimenti_lista(uuid, date, jsonb, text, uuid) to authenticated;
grant execute on function public.registra_movimenti_lista(uuid, date, jsonb, text, uuid) to service_role;

-- ── 10. modifica_movimento_lista ─────────────────────────────────────────
drop function public.modifica_movimento_lista(uuid, date, text, numeric, text);

create function public.modifica_movimento_lista(
  p_id uuid,
  p_data date,
  p_descrizione text,
  p_importo numeric,
  p_metodo text default null::text,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_desc text := upper(trim(p_descrizione));
  v_old  movimenti_lista;
BEGIN
  IF v_desc = '' OR p_data IS NULL OR p_importo IS NULL OR p_importo = 0 THEN
    RAISE EXCEPTION 'Data, descrizione e importo (diverso da zero) sono obbligatori.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('pos','bonifico','contanti','assegno','altro') THEN
    RAISE EXCEPTION 'Valore non valido per metodo: %.', p_metodo
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_old FROM movimenti_lista
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento % non trovato o annullato.', p_id;
  END IF;

  UPDATE movimenti_lista
     SET data_movimento = p_data,
         descrizione    = v_desc,
         importo        = p_importo,
         metodo         = p_metodo,
         origin_client  = p_origin
   WHERE id = p_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value, new_value)
  VALUES (v_old.lista_id, p_id, auth.uid(), 'movimento_modificato',
          mov_snapshot(v_old.data_movimento, v_old.descrizione, v_old.importo),
          mov_snapshot(p_data, v_desc, p_importo));
END;
$function$;

revoke all on function public.modifica_movimento_lista(uuid, date, text, numeric, text, uuid) from public;
revoke execute on function public.modifica_movimento_lista(uuid, date, text, numeric, text, uuid) from anon;
grant execute on function public.modifica_movimento_lista(uuid, date, text, numeric, text, uuid) to authenticated;
grant execute on function public.modifica_movimento_lista(uuid, date, text, numeric, text, uuid) to service_role;

-- ── 11. modifica_note_lista ───────────────────────────────────────────────
drop function public.modifica_note_lista(uuid, text);

create function public.modifica_note_lista(
  p_id uuid,
  p_note text default null::text,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_note  text := NULLIF(trim(p_note), '');
  v_lista liste_viaggio;
BEGIN
  SELECT * INTO v_lista FROM liste_viaggio
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_id;
  END IF;

  IF v_note IS NOT DISTINCT FROM v_lista.note THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio SET note = v_note, updated_at = now(), origin_client = p_origin WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, (SELECT auth.uid()), 'lista_note_modificata', v_lista.note, v_note);
END;
$function$;

revoke all on function public.modifica_note_lista(uuid, text, uuid) from public;
revoke execute on function public.modifica_note_lista(uuid, text, uuid) from anon;
grant execute on function public.modifica_note_lista(uuid, text, uuid) to authenticated;
grant execute on function public.modifica_note_lista(uuid, text, uuid) to service_role;

-- ── 12. annulla_movimento_lista ──────────────────────────────────────────
drop function public.annulla_movimento_lista(uuid);

create function public.annulla_movimento_lista(
  p_id uuid,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
DECLARE
  v_old movimenti_lista;
BEGIN
  UPDATE movimenti_lista
     SET deleted_at = now(), origin_client = p_origin
   WHERE id = p_id AND deleted_at IS NULL
  RETURNING * INTO v_old;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento % non trovato o già annullato.', p_id;
  END IF;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value)
  VALUES (v_old.lista_id, p_id, auth.uid(), 'movimento_eliminato',
          mov_snapshot(v_old.data_movimento, v_old.descrizione, v_old.importo));
END;
$function$;

revoke all on function public.annulla_movimento_lista(uuid, uuid) from public;
revoke execute on function public.annulla_movimento_lista(uuid, uuid) from anon;
grant execute on function public.annulla_movimento_lista(uuid, uuid) to authenticated;
grant execute on function public.annulla_movimento_lista(uuid, uuid) to service_role;

-- ── 13. importa_backup (SECURITY DEFINER) ────────────────────────────────
-- L'INSERT su `clients` resta senza origin_client, stessa ragione del blocco
-- "PERCHÉ clients RESTA NULL ANCHE QUI" in testa a questo file: i clienti
-- ripristinati devono comparire nell'anagrafica di CHIUNQUE, ammnistratore
-- che lancia il ripristino compreso, perché nessun percorso ottimistico del
-- modulo Liste tocca mai state.clients nel core.
drop function public.importa_backup(jsonb);

create function public.importa_backup(
  p_data jsonb,
  p_origin uuid default null::uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_me  uuid := (SELECT auth.uid());
  v_cli int  := 0;
  v_lis int  := 0;
  v_ben int  := 0;
  v_mov int  := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato.';
  END IF;
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RAISE EXCEPTION 'Backup non valido: atteso un oggetto JSON.'
      USING ERRCODE = 'check_violation';
  END IF;

  WITH ins AS (
    INSERT INTO clients (id, name, email, phone, address, city, notes, created_at, updated_at)
    SELECT c.id, c.name, c.email, c.phone, c.address, c.city, c.notes,
           COALESCE(c.created_at, now()), COALESCE(c.updated_at, now())
    FROM jsonb_to_recordset(COALESCE(p_data->'clients', '[]'::jsonb)) AS c(
      id uuid, name text, email text, phone text, address text, city text, notes text,
      created_at timestamptz, updated_at timestamptz)
    WHERE c.id IS NOT NULL AND NULLIF(trim(c.name), '') IS NOT NULL
    ON CONFLICT (id) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_cli FROM ins;

  WITH ins AS (
    INSERT INTO liste_viaggio (id, client_id, titolo, stato, note, created_by,
                               created_at, updated_at, closed_at, deleted_at, origin_client)
    SELECT l.id, l.client_id, l.titolo,
           CASE WHEN l.stato IN ('attiva','esaurita') THEN l.stato ELSE 'attiva' END,
           l.note, v_me,
           COALESCE(l.created_at, now()), COALESCE(l.updated_at, now()),
           l.closed_at, l.deleted_at, p_origin
    FROM jsonb_to_recordset(COALESCE(p_data->'liste', '[]'::jsonb)) AS l(
      id uuid, client_id uuid, titolo text, stato text, note text,
      created_at timestamptz, updated_at timestamptz, closed_at timestamptz, deleted_at timestamptz)
    WHERE l.id IS NOT NULL AND l.client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM clients cc WHERE cc.id = l.client_id)
    ON CONFLICT (id) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_lis FROM ins;

  WITH ins AS (
    INSERT INTO lista_beneficiari (lista_id, client_id, created_by, created_at, origin_client)
    SELECT b.lista_id, b.client_id, v_me, COALESCE(b.created_at, now()), p_origin
    FROM jsonb_to_recordset(COALESCE(p_data->'beneficiari', '[]'::jsonb)) AS b(
      lista_id uuid, client_id uuid, created_at timestamptz)
    WHERE b.lista_id IS NOT NULL AND b.client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM clients cc WHERE cc.id = b.client_id)
      AND EXISTS (
        SELECT 1 FROM liste_viaggio ll
        WHERE ll.id = b.lista_id AND ll.client_id <> b.client_id)
    ON CONFLICT (lista_id, client_id) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_ben FROM ins;

  WITH ins AS (
    INSERT INTO movimenti_lista (id, lista_id, data_movimento, descrizione, importo,
                                 metodo, created_by, created_at, updated_at, deleted_at, origin_client)
    SELECT m.id, m.lista_id, m.data_movimento, m.descrizione, m.importo,
           CASE WHEN m.metodo IN ('pos','bonifico','contanti','assegno','altro')
                THEN m.metodo ELSE NULL END,
           v_me, COALESCE(m.created_at, now()), COALESCE(m.updated_at, now()), m.deleted_at, p_origin
    FROM jsonb_to_recordset(COALESCE(p_data->'movimenti', '[]'::jsonb)) AS m(
      id uuid, lista_id uuid, data_movimento date, descrizione text, importo numeric,
      metodo text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
    WHERE m.id IS NOT NULL AND m.lista_id IS NOT NULL AND m.data_movimento IS NOT NULL
      AND NULLIF(trim(m.descrizione), '') IS NOT NULL AND m.importo IS NOT NULL
      AND EXISTS (SELECT 1 FROM liste_viaggio ll WHERE ll.id = m.lista_id)
    ON CONFLICT (id) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_mov FROM ins;

  RETURN jsonb_build_object(
    'clients_added',     v_cli,
    'liste_added',       v_lis,
    'beneficiari_added', v_ben,
    'movimenti_added',   v_mov
  );
END;
$function$;

revoke all on function public.importa_backup(jsonb, uuid) from public;
revoke execute on function public.importa_backup(jsonb, uuid) from anon;
grant execute on function public.importa_backup(jsonb, uuid) to authenticated;
grant execute on function public.importa_backup(jsonb, uuid) to service_role;
