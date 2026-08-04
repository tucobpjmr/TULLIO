CREATE OR REPLACE FUNCTION ripristina_lista(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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

  UPDATE liste_viaggio SET deleted_at = NULL WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action)
  VALUES (p_id, auth.uid(), 'lista_ripristinata');
END;
$$;

CREATE OR REPLACE FUNCTION elimina_lista_definitivamente(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted timestamptz;
BEGIN
  SELECT deleted_at INTO v_deleted FROM liste_viaggio WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata.', p_id;
  END IF;
  IF v_deleted IS NULL THEN
    RAISE EXCEPTION 'La lista deve prima essere spostata nel cestino.'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM lista_history   WHERE lista_id = p_id;
  DELETE FROM movimenti_lista WHERE lista_id = p_id;
  DELETE FROM liste_viaggio   WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION importa_backup(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_cli int  := 0;
  v_lis int  := 0;
  v_mov int  := 0;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato.';
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
                               created_at, updated_at, closed_at, deleted_at)
    SELECT l.id, l.client_id, l.titolo,
           CASE WHEN l.stato IN ('attiva','esaurita') THEN l.stato ELSE 'attiva' END,
           l.note, v_me,
           COALESCE(l.created_at, now()), COALESCE(l.updated_at, now()),
           l.closed_at, l.deleted_at
    FROM jsonb_to_recordset(COALESCE(p_data->'liste', '[]'::jsonb)) AS l(
      id uuid, client_id uuid, titolo text, stato text, note text,
      created_at timestamptz, updated_at timestamptz, closed_at timestamptz, deleted_at timestamptz)
    WHERE l.id IS NOT NULL AND l.client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM clients cc WHERE cc.id = l.client_id)
    ON CONFLICT (id) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_lis FROM ins;

  WITH ins AS (
    INSERT INTO movimenti_lista (id, lista_id, data_movimento, descrizione, importo,
                                 metodo, created_by, created_at, updated_at, deleted_at)
    SELECT m.id, m.lista_id, m.data_movimento, m.descrizione, m.importo,
           CASE WHEN m.metodo IN ('pos','bonifico','contanti','assegno','altro')
                THEN m.metodo ELSE NULL END,
           v_me, COALESCE(m.created_at, now()), COALESCE(m.updated_at, now()), m.deleted_at
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
    'clients_added',   v_cli,
    'liste_added',     v_lis,
    'movimenti_added', v_mov
  );
END;
$$;

CREATE OR REPLACE FUNCTION reset_completo(p_conferma text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_h  int;
  v_m  int;
  v_l  int;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato.';
  END IF;
  IF p_conferma IS DISTINCT FROM 'RESET TOTALE' THEN
    RAISE EXCEPTION 'Conferma non valida. Digitare esattamente: RESET TOTALE'
      USING ERRCODE = 'check_violation';
  END IF;

  WITH d AS (DELETE FROM lista_history   RETURNING 1) SELECT count(*) INTO v_h FROM d;
  WITH d AS (DELETE FROM movimenti_lista RETURNING 1) SELECT count(*) INTO v_m FROM d;
  WITH d AS (DELETE FROM liste_viaggio   RETURNING 1) SELECT count(*) INTO v_l FROM d;

  RETURN jsonb_build_object(
    'history_deleted',   v_h,
    'movimenti_deleted', v_m,
    'liste_deleted',     v_l
  );
END;
$$;

REVOKE ALL   ON FUNCTION ripristina_lista(uuid)              FROM PUBLIC, anon;
REVOKE ALL   ON FUNCTION elimina_lista_definitivamente(uuid) FROM PUBLIC, anon;
REVOKE ALL   ON FUNCTION importa_backup(jsonb)               FROM PUBLIC, anon;
REVOKE ALL   ON FUNCTION reset_completo(text)                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION ripristina_lista(uuid)              TO authenticated;
GRANT EXECUTE ON FUNCTION elimina_lista_definitivamente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION importa_backup(jsonb)               TO authenticated;
GRANT EXECUTE ON FUNCTION reset_completo(text)                TO authenticated;
