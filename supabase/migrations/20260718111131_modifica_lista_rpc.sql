CREATE OR REPLACE FUNCTION modifica_lista(
  p_id          uuid,
  p_titolo      text DEFAULT NULL,
  p_client_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
    UPDATE clients SET name = v_cliname WHERE id = v_lista.client_id;
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
$$;

REVOKE ALL   ON FUNCTION modifica_lista(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION modifica_lista(uuid, text, text) TO authenticated;
