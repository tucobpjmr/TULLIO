-- Sync: modulo "Liste Viaggio" (buoni viaggio)
--
-- Le tabelle liste_viaggio/movimenti_lista/lista_history, la vista liste_saldi
-- e le funzioni RPC elencate qui sotto sono GIA' presenti su questo progetto
-- (create ed evolute tra il 2026-07-13 e il 2026-07-27 tramite SQL applicato
-- a mano, non tramite `supabase db push`). Quella storia di migrazioni vive
-- solo nella repo gemella `liste-buoni-viaggio` (cartella migrations/,
-- versioni 001-009), che NON coincide 1:1 con quanto realmente applicato qui:
-- in particolare i file 001-003 (schema "buoni" precedente) non sono mai
-- stati applicati a questo progetto, e il file 004 include in testa un
-- avviso esplicito di NON applicarlo qui perché ricreerebbe clients/users
-- con uno schema minimale e un trigger di signup in conflitto con quelli
-- reali di VoyageDesk.
--
-- Questo file è la prima rappresentazione fedele, in QUESTA repo, dello
-- stato realmente applicato (introspezione diretta dello schema/funzioni/
-- policy live al 2026-07-28). Interamente idempotente: se rieseguito non
-- cambia nulla. Va tenuto sincronizzato da qui in avanti con le migrazioni
-- Supabase CLI standard.
--
-- Non tocca clients/users (schema e RLS di VoyageDesk, invariati).
--
-- Nota (gap noti, volutamente NON corretti in questo file — vedi migrazione
-- successiva 20260728190100 per l'hardening dei ruoli):
--   * liste_viaggio/movimenti_lista non hanno un trigger che blocchi
--     l'hard DELETE (a differenza di quanto indicato nei commenti del file
--     004 della repo liste-buoni-viaggio): oggi il soft delete è garantito
--     solo per disciplina applicativa (le RPC usano deleted_at), non da un
--     vincolo DB. Il rischio pratico è basso: non esistono policy RLS DELETE
--     su queste tabelle, quindi un utente autenticato normale non può comunque
--     fare hard delete via PostgREST; solo funzioni SECURITY DEFINER o
--     service_role potrebbero.
--   * lista_history non ha trigger di immutabilità (append-only): stesso
--     discorso, mitigato dall'assenza di policy RLS UPDATE/DELETE su questa
--     tabella.
--   * non esiste un trigger che aggiorni liste_viaggio.updated_at quando
--     cambia un movimento figlio: differenza solo di UX (ordinamento "più
--     recenti"), nessun impatto sui dati.

BEGIN;

-- ============================================================
-- 1. Tabelle
-- ============================================================

CREATE TABLE IF NOT EXISTS liste_viaggio (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  uuid NOT NULL REFERENCES clients(id),
  titolo     text,
  stato      text NOT NULL DEFAULT 'attiva'
             CHECK (stato IN ('attiva', 'esaurita')),
  note       text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz,
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_liste_client_id ON liste_viaggio (client_id);

CREATE TABLE IF NOT EXISTS movimenti_lista (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id       uuid NOT NULL REFERENCES liste_viaggio(id),
  data_movimento date NOT NULL DEFAULT CURRENT_DATE,
  descrizione    text NOT NULL,
  importo        numeric(12,2) NOT NULL,
  metodo         text CHECK (metodo IS NULL OR metodo IN
                   ('pos', 'bonifico', 'contanti', 'assegno', 'altro')),
  created_by     uuid REFERENCES users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_movimenti_lista_id ON movimenti_lista (lista_id);

CREATE TABLE IF NOT EXISTS lista_history (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lista_id     uuid NOT NULL REFERENCES liste_viaggio(id),
  movimento_id uuid REFERENCES movimenti_lista(id),
  actor_id     uuid REFERENCES users(id),
  action       text NOT NULL,
  old_value    text,
  new_value    text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lista_history_lista_id ON lista_history (lista_id);

-- ============================================================
-- 2. Vista liste_saldi (security_invoker: rispetta la RLS di chi interroga)
-- ============================================================

CREATE OR REPLACE VIEW liste_saldi
  WITH (security_invoker = true) AS
SELECT
  l.id AS lista_id,
  l.client_id,
  l.stato,
  COALESCE(SUM(m.importo) FILTER (WHERE m.deleted_at IS NULL), 0) AS saldo,
  COUNT(m.id) FILTER (WHERE m.deleted_at IS NULL) AS num_movimenti,
  MAX(m.data_movimento) FILTER (WHERE m.deleted_at IS NULL) AS ultimo_movimento
FROM liste_viaggio l
LEFT JOIN movimenti_lista m ON m.lista_id = l.id
WHERE l.deleted_at IS NULL
GROUP BY l.id, l.client_id, l.stato;

GRANT SELECT ON liste_saldi TO authenticated;

-- ============================================================
-- 3. Trigger updated_at
-- ============================================================

DROP TRIGGER IF EXISTS trg_liste_updated ON liste_viaggio;
CREATE TRIGGER trg_liste_updated
  BEFORE UPDATE ON liste_viaggio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_movimenti_updated ON movimenti_lista;
CREATE TRIGGER trg_movimenti_updated
  BEFORE UPDATE ON movimenti_lista
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- 4. Row Level Security (stato pre-hardening: qualunque utente attivo,
--    a prescindere dal ruolo — corretto dalla migrazione successiva)
-- ============================================================

ALTER TABLE liste_viaggio   ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_lista ENABLE ROW LEVEL SECURITY;
ALTER TABLE lista_history   ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON liste_viaggio   TO authenticated;
GRANT SELECT, INSERT, UPDATE ON movimenti_lista TO authenticated;
GRANT SELECT, INSERT         ON lista_history   TO authenticated;

DROP POLICY IF EXISTS liste_select ON liste_viaggio;
CREATE POLICY liste_select ON liste_viaggio
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS liste_insert ON liste_viaggio;
CREATE POLICY liste_insert ON liste_viaggio
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS liste_update ON liste_viaggio;
CREATE POLICY liste_update ON liste_viaggio
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS movimenti_select ON movimenti_lista;
CREATE POLICY movimenti_select ON movimenti_lista
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS movimenti_insert ON movimenti_lista;
CREATE POLICY movimenti_insert ON movimenti_lista
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS movimenti_update ON movimenti_lista;
CREATE POLICY movimenti_update ON movimenti_lista
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS history_select ON lista_history;
CREATE POLICY history_select ON lista_history
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

DROP POLICY IF EXISTS history_insert ON lista_history;
CREATE POLICY history_insert ON lista_history
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.active));

-- ============================================================
-- 5. Funzioni helper
-- ============================================================

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

-- ============================================================
-- 6. RPC atomiche
-- ============================================================

CREATE OR REPLACE FUNCTION crea_lista(
  p_client_id       uuid DEFAULT NULL,
  p_titolo          text DEFAULT NULL,
  p_new_client_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION modifica_lista(
  p_id          uuid,
  p_titolo      text DEFAULT NULL,
  p_client_name text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION registra_movimento_lista(
  p_lista_id    uuid,
  p_data        date,
  p_descrizione text,
  p_importo     numeric,
  p_metodo      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION registra_movimenti_lista(
  p_lista_id   uuid,
  p_data       date,
  p_movimenti  jsonb,
  p_metodo     text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION modifica_movimento_lista(
  p_id          uuid,
  p_data        date,
  p_descrizione text,
  p_importo     numeric,
  p_metodo      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
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

CREATE OR REPLACE FUNCTION ripristina_lista(p_id uuid)
RETURNS void
LANGUAGE plpgsql
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

-- Le tre funzioni seguenti sono SECURITY DEFINER: bypassano la RLS di
-- proposito (hard delete, merge di un backup, reset totale). L'unico
-- controllo di accesso, oggi, e' "auth.uid() non nullo" — corretto dalla
-- migrazione di hardening successiva.

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
  v_me  uuid := auth.uid();
  v_h   int;
  v_m   int;
  v_l   int;
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato.';
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
-- 7. Permessi RPC: solo authenticated, revocato a PUBLIC/anon
-- ============================================================

REVOKE ALL ON FUNCTION crea_lista(uuid, text, text)                                  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION modifica_lista(uuid, text, text)                              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION registra_movimento_lista(uuid, date, text, numeric, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION registra_movimenti_lista(uuid, date, jsonb, text)             FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION modifica_movimento_lista(uuid, date, text, numeric, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION annulla_movimento_lista(uuid)                                 FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION cambia_stato_lista(uuid, text)                                FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION archivia_lista(uuid)                                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION ripristina_lista(uuid)                                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION elimina_lista_definitivamente(uuid)                          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION importa_backup(jsonb)                                        FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION reset_completo(text)                                          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION crea_lista(uuid, text, text)                               TO authenticated;
GRANT EXECUTE ON FUNCTION modifica_lista(uuid, text, text)                           TO authenticated;
GRANT EXECUTE ON FUNCTION registra_movimento_lista(uuid, date, text, numeric, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION registra_movimenti_lista(uuid, date, jsonb, text)          TO authenticated;
GRANT EXECUTE ON FUNCTION modifica_movimento_lista(uuid, date, text, numeric, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION annulla_movimento_lista(uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION cambia_stato_lista(uuid, text)                             TO authenticated;
GRANT EXECUTE ON FUNCTION archivia_lista(uuid)                                       TO authenticated;
GRANT EXECUTE ON FUNCTION ripristina_lista(uuid)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION elimina_lista_definitivamente(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION importa_backup(jsonb)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION reset_completo(text)                                       TO authenticated;

COMMIT;
