CREATE OR REPLACE FUNCTION registra_movimenti_lista(
  p_lista_id  uuid,
  p_data      date,
  p_movimenti jsonb,
  p_metodo    text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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

    INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, created_by)
    VALUES (p_lista_id, p_data, v_desc, v_importo, p_metodo, auth.uid())
    RETURNING id INTO v_id;

    INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
    VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
            mov_snapshot(p_data, v_desc, v_importo));

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$$;

REVOKE ALL  ON FUNCTION registra_movimenti_lista(uuid, date, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION registra_movimenti_lista(uuid, date, jsonb, text) TO authenticated;
