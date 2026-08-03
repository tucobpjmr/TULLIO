-- Cointestazione delle liste viaggio: più beneficiari sulla stessa lista
-- (es. marito e moglie), ciascuno con una propria scheda in anagrafica.
--
-- Prima di questa migrazione l'unico modo per gestire una lista con due
-- persone era creare un'unica scheda cliente con il nome combinato
-- ("ANGELA RICCI E MARCHETTI UMBERTO 50° COMPLEANNO"): funziona per
-- l'intestazione della lista, ma nessuno dei due ha una propria anagrafica
-- pulita, e se uno dei due esiste anche come cliente separato altrove la
-- lista non gli compare nella sua scheda.
--
-- Modello: liste_viaggio.client_id resta il TITOLARE (invariato, obbligatorio,
-- tutte le query/RPC esistenti continuano a funzionare senza modifiche).
-- lista_beneficiari aggiunge i COINTESTATARI: zero o più righe per lista, mai
-- il titolare stesso. "Chi è collegato a questa lista" = titolare UNION
-- cointestatari, esposto dalla vista lista_partecipanti (usata per capire, dato
-- un cliente, a quali liste è collegato — come titolare o come cointestatario).
--
-- Scrittura: aggiungere un cointestatario passa da una RPC a diritti
-- dell'invocante (stesso stile di crea_lista: la RLS sulla tabella basta come
-- controllo di ruolo). Rimuoverlo è invece SECURITY DEFINER, come
-- elimina_lista_definitivamente: niente GRANT DELETE diretto ad authenticated,
-- altrimenti una DELETE fatta a mano bypasserebbe la voce di storico che la
-- RPC scrive nella stessa transazione.
--
-- Idempotente: CREATE OR REPLACE / IF NOT EXISTS ovunque.

BEGIN;

-- ============================================================
-- 1. Tabella
-- ============================================================

CREATE TABLE IF NOT EXISTS lista_beneficiari (
  lista_id   uuid NOT NULL REFERENCES liste_viaggio(id),
  client_id  uuid NOT NULL REFERENCES clients(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lista_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_lista_beneficiari_client     ON lista_beneficiari (client_id);
CREATE INDEX IF NOT EXISTS idx_lista_beneficiari_created_by ON lista_beneficiari (created_by);

ALTER TABLE lista_beneficiari ENABLE ROW LEVEL SECURITY;

-- Niente GRANT DELETE: la rimozione passa solo da rimuovi_beneficiario_lista
-- (§ 4), che scrive anche la voce di storico nella stessa transazione. Un
-- GRANT DELETE qui la aggirerebbe in silenzio, esattamente il gap che la
-- migrazione 20260729190053 ha chiuso per liste_viaggio/movimenti_lista.
GRANT SELECT, INSERT ON lista_beneficiari TO authenticated;

DROP POLICY IF EXISTS lista_beneficiari_select ON lista_beneficiari;
CREATE POLICY lista_beneficiari_select ON lista_beneficiari
  FOR SELECT TO authenticated
  USING ((SELECT private.can_liste()));

DROP POLICY IF EXISTS lista_beneficiari_insert ON lista_beneficiari;
CREATE POLICY lista_beneficiari_insert ON lista_beneficiari
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_liste()));

-- ============================================================
-- 2. Vista lista_partecipanti: titolare UNION cointestatari
-- ============================================================
-- security_invoker rispetta la RLS di chi interroga, come liste_saldi.

CREATE OR REPLACE VIEW lista_partecipanti
  WITH (security_invoker = true) AS
SELECT l.id AS lista_id, l.client_id, l.deleted_at, 'titolare'::text AS ruolo
FROM liste_viaggio l
UNION ALL
SELECT b.lista_id, b.client_id, l.deleted_at, 'cointestatario'::text AS ruolo
FROM lista_beneficiari b
JOIN liste_viaggio l ON l.id = b.lista_id;

GRANT SELECT ON lista_partecipanti TO authenticated;

-- ============================================================
-- 3. aggiungi_beneficiario_lista (diritti dell'invocante, come crea_lista)
-- ============================================================

CREATE OR REPLACE FUNCTION aggiungi_beneficiario_lista(
  p_lista_id        uuid,
  p_client_id       uuid DEFAULT NULL,
  p_new_client_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public
AS $$
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

  INSERT INTO lista_beneficiari (lista_id, client_id, created_by)
  VALUES (p_lista_id, v_client, auth.uid());

  INSERT INTO lista_history (lista_id, actor_id, action, new_value)
  VALUES (p_lista_id, auth.uid(), 'beneficiario_aggiunto', v_nome);

  RETURN v_client;
END;
$$;

-- ============================================================
-- 4. rimuovi_beneficiario_lista (SECURITY DEFINER, come elimina_lista_definitivamente)
-- ============================================================

CREATE OR REPLACE FUNCTION rimuovi_beneficiario_lista(
  p_lista_id  uuid,
  p_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nome text;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.name INTO v_nome
  FROM lista_beneficiari b JOIN clients c ON c.id = b.client_id
  WHERE b.lista_id = p_lista_id AND b.client_id = p_client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Questo cliente non è cointestatario di questa lista.'
      USING ERRCODE = 'check_violation';
  END IF;

  DELETE FROM lista_beneficiari WHERE lista_id = p_lista_id AND client_id = p_client_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value)
  VALUES (p_lista_id, (SELECT auth.uid()), 'beneficiario_rimosso', v_nome);
END;
$$;

REVOKE ALL ON FUNCTION rimuovi_beneficiario_lista(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION aggiungi_beneficiario_lista(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION rimuovi_beneficiario_lista(uuid, uuid)        TO authenticated;

-- ============================================================
-- 5. elimina_lista_definitivamente / reset_completo: includere i
--    cointestatari nella cancellazione. Senza questo, la FK di
--    lista_beneficiari su liste_viaggio blocca entrambe le funzioni non
--    appena una lista ne ha almeno uno (TRUNCATE) o alla DELETE finale
--    su liste_viaggio (elimina_lista_definitivamente).
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
  IF NOT private.can_liste() THEN
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

  PERFORM set_config('app.liste_hard_delete', 'on', true);

  DELETE FROM lista_beneficiari WHERE lista_id = p_id;
  DELETE FROM lista_history     WHERE lista_id = p_id;
  DELETE FROM movimenti_lista   WHERE lista_id = p_id;
  DELETE FROM liste_viaggio     WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION reset_completo(p_conferma text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me  uuid := (SELECT auth.uid());
  v_b   int;
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

  SELECT count(*) INTO v_b FROM lista_beneficiari;
  SELECT count(*) INTO v_h FROM lista_history;
  SELECT count(*) INTO v_m FROM movimenti_lista;
  SELECT count(*) INTO v_l FROM liste_viaggio;

  PERFORM set_config('app.liste_hard_delete', 'on', true);

  BEGIN
    TRUNCATE lista_beneficiari, lista_history, movimenti_lista, liste_viaggio;
  EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported THEN
      DELETE FROM lista_beneficiari WHERE lista_id <> v_nil;
      DELETE FROM lista_history     WHERE id <> v_nil;
      DELETE FROM movimenti_lista   WHERE id <> v_nil;
      DELETE FROM liste_viaggio     WHERE id <> v_nil;
  END;

  RETURN jsonb_build_object(
    'beneficiari_deleted', v_b,
    'history_deleted',     v_h,
    'movimenti_deleted',   v_m,
    'liste_deleted',       v_l
  );
END;
$$;

-- ============================================================
-- 6. importa_backup: merge anche di lista_beneficiari (backup/ripristino
--    "Strumenti dati" — senza questo, un ripristino dopo un reset totale
--    riporterebbe indietro liste e movimenti ma perderebbe silenziosamente
--    le cointestazioni).
-- ============================================================

CREATE OR REPLACE FUNCTION importa_backup(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF NOT private.can_liste() THEN
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

  -- client_id <> il titolare della lista: stessa regola della RPC interattiva
  -- (aggiungi_beneficiario_lista), applicata anche qui perché un backup
  -- costruito a mano potrebbe altrimenti duplicare il titolare come proprio
  -- cointestatario.
  WITH ins AS (
    INSERT INTO lista_beneficiari (lista_id, client_id, created_by, created_at)
    SELECT b.lista_id, b.client_id, v_me, COALESCE(b.created_at, now())
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
    'clients_added',     v_cli,
    'liste_added',       v_lis,
    'beneficiari_added', v_ben,
    'movimenti_added',   v_mov
  );
END;
$$;

COMMIT;
