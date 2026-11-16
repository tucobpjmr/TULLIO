-- A-1 dell'analisi del 15 novembre: il modulo Liste si scrive SOLO dalle RPC.
--
-- Le undici RPC qui sotto erano SECURITY INVOKER, quindi le tabelle dovevano
-- restare scrivibili da admin/manager/agent (policy `*_insert`/`*_update` su
-- can_liste()). Con il proprio token, via REST, si poteva cambiare un importo
-- senza riga in `lista_history`, o scrivere in `lista_history` una voce
-- inventata.
--
-- Ora sono SECURITY DEFINER con il gate di ruolo in testa — lo schema già in
-- uso da `sposta_titolare_lista` e `rimuovi_beneficiario_lista` — e la
-- scrittura diretta sulle tabelle è revocata. La lettura non cambia.
--
-- ⛔ Il resto di ogni corpo è IDENTICO alla versione in produzione al 16
-- novembre (verificato per confronto testuale sullo staging): l'unica riga
-- aggiunta è il blocco `IF NOT private.can_liste()`.
-- ⛔ can_liste() vale anche per le scritture su `clients` che crea_lista,
-- modifica_lista e aggiungi_beneficiario_lista fanno: è lo stesso insieme di
-- private.can_clienti_scrittura() (admin/manager/agent, attivo, non pending).

-- ── 1. crea_lista ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.crea_lista(p_client_id uuid DEFAULT NULL::uuid, p_titolo text DEFAULT NULL::text, p_new_client_name text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_client uuid := p_client_id;
  v_titolo text := NULLIF(trim(p_titolo), '');
  v_lista  uuid;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
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

  INSERT INTO liste_viaggio (client_id, titolo, created_by, origin_client)
  VALUES (v_client, v_titolo, auth.uid(), p_origin)
  RETURNING id INTO v_lista;

  INSERT INTO lista_history (lista_id, actor_id, action, new_value)
  VALUES (v_lista, auth.uid(), 'lista_creata', v_titolo);

  RETURN v_lista;
END;
$function$;

-- ── 2. modifica_lista ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.modifica_lista(p_id uuid, p_titolo text DEFAULT NULL::text, p_client_name text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_titolo   text := NULLIF(trim(p_titolo), '');
  v_cliname  text := NULLIF(upper(trim(p_client_name)), '');
  v_lista    liste_viaggio;
  v_old_cli  text;
  v_changed  boolean := false;
  v_old_snap text;
  v_new_snap text;
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

  SELECT name INTO v_old_cli FROM clients WHERE id = v_lista.client_id;

  IF p_client_name IS NOT NULL AND v_cliname IS NULL THEN
    RAISE EXCEPTION 'Il nome del cliente non puo'' essere vuoto.'
      USING ERRCODE = 'check_violation';
  END IF;

  v_old_snap := COALESCE(v_old_cli, '')
             || CASE WHEN v_lista.titolo IS NOT NULL THEN ' — ' || v_lista.titolo ELSE '' END;

  IF v_cliname IS NOT NULL AND v_cliname IS DISTINCT FROM v_old_cli THEN
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

-- ── 3. aggiungi_beneficiario_lista ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.aggiungi_beneficiario_lista(p_lista_id uuid, p_client_id uuid DEFAULT NULL::uuid, p_new_client_name text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_lista  liste_viaggio;
  v_client uuid := p_client_id;
  v_nome   text;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ── 4. cambia_stato_lista ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cambia_stato_lista(p_id uuid, p_stato text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old text;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ── 5. archivia_lista ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archivia_lista(p_id uuid, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ── 6. ripristina_lista ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.ripristina_lista(p_id uuid, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deleted timestamptz;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ── 7. modifica_note_lista ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.modifica_note_lista(p_id uuid, p_note text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_note  text := NULLIF(trim(p_note), '');
  v_lista liste_viaggio;
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

  IF v_note IS NOT DISTINCT FROM v_lista.note THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio SET note = v_note, updated_at = now(), origin_client = p_origin WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, (SELECT auth.uid()), 'lista_note_modificata', v_lista.note, v_note);
END;
$function$;

-- ── 8. registra_movimento_lista ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registra_movimento_lista(p_lista_id uuid, p_data date, p_descrizione text, p_importo numeric, p_metodo text DEFAULT NULL::text, p_banca text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_desc text := upper(trim(p_descrizione));
  v_id   uuid;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_desc = '' OR p_data IS NULL OR p_importo IS NULL OR p_importo = 0 THEN
    RAISE EXCEPTION 'Data, descrizione e importo (diverso da zero) sono obbligatori.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('pos','bonifico','contanti','assegno','altro') THEN
    RAISE EXCEPTION 'Valore non valido per metodo: %.', p_metodo
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_banca IS NOT NULL AND (p_banca NOT IN ('bnl','banco_napoli')
                              OR p_metodo IS NULL OR p_metodo NOT IN ('pos','bonifico')) THEN
    RAISE EXCEPTION 'La banca si indica solo per POS o bonifico (BNL o Banco Napoli).'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM liste_viaggio
   WHERE id = p_lista_id AND deleted_at IS NULL AND stato = 'attiva'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata, archiviata o non attiva.', p_lista_id;
  END IF;

  INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, banca, created_by, origin_client)
  VALUES (p_lista_id, p_data, v_desc, p_importo, p_metodo, p_banca, auth.uid(), p_origin)
  RETURNING id INTO v_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
  VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
          mov_snapshot(p_data, v_desc, p_importo));

  RETURN v_id;
END;
$function$;

-- ── 9. registra_movimenti_lista ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registra_movimenti_lista(p_lista_id uuid, p_data date, p_movimenti jsonb, p_metodo text DEFAULT NULL::text, p_banca text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_riga    jsonb;
  v_desc    text;
  v_importo numeric;
  v_id      uuid;
  v_n       integer := 0;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  IF p_banca IS NOT NULL AND (p_banca NOT IN ('bnl','banco_napoli')
                              OR p_metodo IS NULL OR p_metodo NOT IN ('pos','bonifico')) THEN
    RAISE EXCEPTION 'La banca si indica solo per POS o bonifico (BNL o Banco Napoli).'
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

    INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, banca, created_by, origin_client)
    VALUES (p_lista_id, p_data, v_desc, v_importo, p_metodo, p_banca, auth.uid(), p_origin)
    RETURNING id INTO v_id;

    INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
    VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
            mov_snapshot(p_data, v_desc, v_importo));

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

-- ── 10. modifica_movimento_lista ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.modifica_movimento_lista(p_id uuid, p_data date, p_descrizione text, p_importo numeric, p_metodo text DEFAULT NULL::text, p_banca text DEFAULT NULL::text, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_desc text := upper(trim(p_descrizione));
  v_old  movimenti_lista;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_desc = '' OR p_data IS NULL OR p_importo IS NULL OR p_importo = 0 THEN
    RAISE EXCEPTION 'Data, descrizione e importo (diverso da zero) sono obbligatori.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_metodo IS NOT NULL AND p_metodo NOT IN ('pos','bonifico','contanti','assegno','altro') THEN
    RAISE EXCEPTION 'Valore non valido per metodo: %.', p_metodo
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_banca IS NOT NULL AND (p_banca NOT IN ('bnl','banco_napoli')
                              OR p_metodo IS NULL OR p_metodo NOT IN ('pos','bonifico')) THEN
    RAISE EXCEPTION 'La banca si indica solo per POS o bonifico (BNL o Banco Napoli).'
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
         banca          = p_banca,
         origin_client  = p_origin
   WHERE id = p_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value, new_value)
  VALUES (v_old.lista_id, p_id, auth.uid(), 'movimento_modificato',
          mov_snapshot(v_old.data_movimento, v_old.descrizione, v_old.importo),
          mov_snapshot(p_data, v_desc, p_importo));
END;
$function$;

-- ── 11. annulla_movimento_lista ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.annulla_movimento_lista(p_id uuid, p_origin uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_old movimenti_lista;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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

-- ── 12. EXECUTE: solo authenticated e service_role ────────────────────────
-- ⛔ Ora sono SECURITY DEFINER: un EXECUTE a PUBLIC o anon le renderebbe
-- chiamabili senza login. Il gate can_liste() le fermerebbe comunque, ma
-- la revoca esplicita è la regola di ogni definer del progetto.
DO $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.crea_lista(uuid, text, text, uuid)',
    'public.modifica_lista(uuid, text, text, uuid)',
    'public.aggiungi_beneficiario_lista(uuid, uuid, text, uuid)',
    'public.cambia_stato_lista(uuid, text, uuid)',
    'public.archivia_lista(uuid, uuid)',
    'public.ripristina_lista(uuid, uuid)',
    'public.modifica_note_lista(uuid, text, uuid)',
    'public.registra_movimento_lista(uuid, date, text, numeric, text, text, uuid)',
    'public.registra_movimenti_lista(uuid, date, jsonb, text, text, uuid)',
    'public.modifica_movimento_lista(uuid, date, text, numeric, text, text, uuid)',
    'public.annulla_movimento_lista(uuid, uuid)'
  ] LOOP
    EXECUTE format('revoke all on function %s from public, anon', f);
    EXECUTE format('grant execute on function %s to authenticated, service_role', f);
  END LOOP;
END $$;

-- ── 13. Niente scrittura diretta sulle tabelle del modulo ─────────────────
drop policy if exists liste_insert             on public.liste_viaggio;
drop policy if exists liste_update             on public.liste_viaggio;
drop policy if exists movimenti_insert         on public.movimenti_lista;
drop policy if exists movimenti_update         on public.movimenti_lista;
drop policy if exists history_insert           on public.lista_history;
drop policy if exists lista_beneficiari_insert on public.lista_beneficiari;

-- Le policy da sole bastano a respingere; la revoca del privilegio è la
-- seconda serratura, e rende l'errore un 42501 esplicito invece di un
-- risultato vuoto. Le due viste sono security_invoker e di sola lettura per
-- l'app: anche lì resta solo SELECT.
revoke insert, update, delete, truncate on
  public.liste_viaggio, public.movimenti_lista, public.lista_history,
  public.lista_beneficiari, public.liste_saldi, public.lista_partecipanti
  from authenticated, anon, public;
