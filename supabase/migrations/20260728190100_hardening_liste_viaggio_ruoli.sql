-- Hardening: modulo "Liste Viaggio" allineato ai ruoli VoyageDesk
--
-- Il modulo liste_viaggio/movimenti_lista/lista_history è stato importato da
-- un'app separata (liste-buoni-viaggio) che conosceva un solo criterio di
-- accesso: "utente autenticato attivo". VoyageDesk ha invece una matrice
-- ruoli (admin/manager/agent/driver) che il modulo deve rispettare prima di
-- essere esposto nella UI unificata.
--
-- Decisioni applicate (confermate dall'utente):
--   1. Il modulo Liste è precluso ai soli utenti con ruolo 'driver'; admin,
--      manager e agent hanno pari accesso in lettura/scrittura.
--   2. reset_completo (hard delete di TUTTE le liste/movimenti/storico) resta
--      disponibile ma solo per gli admin.
--   3. elimina_lista_definitivamente e importa_backup sono SECURITY DEFINER
--      e bypassano la RLS di proposito: senza un controllo di ruolo esplicito
--      al loro interno, in precedenza chiunque fosse autenticato e attivo
--      (incluso un driver) poteva svuotare il cestino o fondere un backup
--      esterno nel database. Vengono qui ristrette allo stesso perimetro del
--      punto 1 (admin/manager/agent), per coerenza con l'accesso al modulo.
--
-- Idempotente: CREATE OR REPLACE / DROP POLICY IF EXISTS ovunque.

BEGIN;

-- ============================================================
-- 1. RLS: escludi il ruolo driver da liste_viaggio/movimenti_lista/lista_history
-- ============================================================

DROP POLICY IF EXISTS liste_select ON liste_viaggio;
CREATE POLICY liste_select ON liste_viaggio
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS liste_insert ON liste_viaggio;
CREATE POLICY liste_insert ON liste_viaggio
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS liste_update ON liste_viaggio;
CREATE POLICY liste_update ON liste_viaggio
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS movimenti_select ON movimenti_lista;
CREATE POLICY movimenti_select ON movimenti_lista
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS movimenti_insert ON movimenti_lista;
CREATE POLICY movimenti_insert ON movimenti_lista
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS movimenti_update ON movimenti_lista;
CREATE POLICY movimenti_update ON movimenti_lista
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS history_select ON lista_history;
CREATE POLICY history_select ON lista_history
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

DROP POLICY IF EXISTS history_insert ON lista_history;
CREATE POLICY history_insert ON lista_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ));

-- ============================================================
-- 2. reset_completo: solo admin
-- ============================================================

CREATE OR REPLACE FUNCTION reset_completo(p_conferma text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := auth.uid();
  v_h   int;
  v_m   int;
  v_l   int;
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato.';
  END IF;
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_conferma IS DISTINCT FROM 'RESET TOTALE' THEN
    RAISE EXCEPTION 'Conferma non valida. Digitare esattamente: RESET TOTALE'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_h FROM lista_history;
  SELECT count(*) INTO v_m FROM movimenti_lista;
  SELECT count(*) INTO v_l FROM liste_viaggio;

  BEGIN
    TRUNCATE lista_history, movimenti_lista, liste_viaggio;
  EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported THEN
      DELETE FROM lista_history   WHERE id <> v_nil;
      DELETE FROM movimenti_lista WHERE id <> v_nil;
      DELETE FROM liste_viaggio   WHERE id <> v_nil;
  END;

  RETURN jsonb_build_object(
    'history_deleted',   v_h,
    'movimenti_deleted', v_m,
    'liste_deleted',     v_l
  );
END;
$$;

-- ============================================================
-- 3. elimina_lista_definitivamente / importa_backup: admin/manager/agent
--    (stesso perimetro di accesso al modulo, driver escluso)
-- ============================================================

CREATE OR REPLACE FUNCTION elimina_lista_definitivamente(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted timestamptz;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager','agent')
  ) THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

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
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = v_me AND u.active AND u.role IN ('admin','manager','agent')
  ) THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
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

COMMIT;
