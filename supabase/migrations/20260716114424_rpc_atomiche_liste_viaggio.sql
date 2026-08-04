-- Migration 005: RPC atomiche per lo schema "Liste Viaggio"
-- Ogni operazione (dato + voce di lista_history) in un'unica transazione
-- plpgsql. SECURITY INVOKER: le policy RLS esistenti restano applicate.

CREATE OR REPLACE FUNCTION fmt_eur(v numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT replace(to_char(v, 'FM999999990.00'), '.', ',') || ' €'
$$;

CREATE OR REPLACE FUNCTION mov_snapshot(p_data date, p_descrizione text, p_importo numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public AS $$
  SELECT to_char(p_data, 'DD/MM/YYYY') || ' ' || p_descrizione || ' ' || fmt_eur(p_importo)
$$;

CREATE OR REPLACE FUNCTION crea_lista(
  p_client_id       uuid DEFAULT NULL,
  p_titolo          text DEFAULT NULL,
  p_new_client_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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

  INSERT INTO liste_viaggio (client_id, titolo, created_by)
  VALUES (v_client, v_titolo, auth.uid())
  RETURNING id INTO v_lista;

  INSERT INTO lista_history (lista_id, actor_id, action, new_value)
  VALUES (v_lista, auth.uid(), 'lista_creata', v_titolo);

  RETURN v_lista;
END;
$$;

CREATE OR REPLACE FUNCTION registra_movimento_lista(
  p_lista_id    uuid,
  p_data        date,
  p_descrizione text,
  p_importo     numeric,
  p_metodo      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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

  INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, created_by)
  VALUES (p_lista_id, p_data, v_desc, p_importo, p_metodo, auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
  VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
          mov_snapshot(p_data, v_desc, p_importo));

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION modifica_movimento_lista(
  p_id          uuid,
  p_data        date,
  p_descrizione text,
  p_importo     numeric,
  p_metodo      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
         metodo         = p_metodo
   WHERE id = p_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value, new_value)
  VALUES (v_old.lista_id, p_id, auth.uid(), 'movimento_modificato',
          mov_snapshot(v_old.data_movimento, v_old.descrizione, v_old.importo),
          mov_snapshot(p_data, v_desc, p_importo));
END;
$$;

CREATE OR REPLACE FUNCTION annulla_movimento_lista(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_old movimenti_lista;
BEGIN
  UPDATE movimenti_lista
     SET deleted_at = now()
   WHERE id = p_id AND deleted_at IS NULL
  RETURNING * INTO v_old;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Movimento % non trovato o già annullato.', p_id;
  END IF;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value)
  VALUES (v_old.lista_id, p_id, auth.uid(), 'movimento_eliminato',
          mov_snapshot(v_old.data_movimento, v_old.descrizione, v_old.importo));
END;
$$;

CREATE OR REPLACE FUNCTION cambia_stato_lista(p_id uuid, p_stato text)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
     SET stato     = p_stato,
         closed_at = CASE WHEN p_stato = 'esaurita' THEN now() ELSE NULL END
   WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, auth.uid(),
          CASE WHEN p_stato = 'esaurita' THEN 'lista_chiusa' ELSE 'lista_riaperta' END,
          v_old, p_stato);
END;
$$;

CREATE OR REPLACE FUNCTION archivia_lista(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE liste_viaggio
     SET deleted_at = now()
   WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o già archiviata.', p_id;
  END IF;

  INSERT INTO lista_history (lista_id, actor_id, action)
  VALUES (p_id, auth.uid(), 'lista_archiviata');
END;
$$;

REVOKE ALL ON FUNCTION crea_lista(uuid, text, text)                                  FROM PUBLIC;
REVOKE ALL ON FUNCTION registra_movimento_lista(uuid, date, text, numeric, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION modifica_movimento_lista(uuid, date, text, numeric, text)     FROM PUBLIC;
REVOKE ALL ON FUNCTION annulla_movimento_lista(uuid)                                 FROM PUBLIC;
REVOKE ALL ON FUNCTION cambia_stato_lista(uuid, text)                                FROM PUBLIC;
REVOKE ALL ON FUNCTION archivia_lista(uuid)                                          FROM PUBLIC;

GRANT EXECUTE ON FUNCTION crea_lista(uuid, text, text)                               TO authenticated;
GRANT EXECUTE ON FUNCTION registra_movimento_lista(uuid, date, text, numeric, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION modifica_movimento_lista(uuid, date, text, numeric, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION annulla_movimento_lista(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION cambia_stato_lista(uuid, text)                             TO authenticated;
GRANT EXECUTE ON FUNCTION archivia_lista(uuid)                                       TO authenticated;
