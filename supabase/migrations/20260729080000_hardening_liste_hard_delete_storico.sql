-- Hardening: la cancellazione fisica passa solo dal canale vagliato, e lo
-- storico diventa append-only.
--
-- Stato prima di questo file (gap dichiarati in testa alla 20260728190000):
--   * liste_viaggio/movimenti_lista non avevano alcun trigger a impedire un
--     hard DELETE: il soft delete via `deleted_at` era garantito solo dalla
--     disciplina applicativa delle RPC, non da un vincolo del database;
--   * lista_history non aveva trigger di immutabilità: una voce del registro
--     poteva essere riscritta o cancellata senza lasciare segno, e un audit
--     log riscrivibile non è un audit log.
--
-- Il rischio pratico era basso — non esistono policy RLS DELETE su queste
-- tabelle, quindi via PostgREST un utente autenticato non arriva comunque a
-- cancellare — ma restava aperto per due strade: una futura funzione
-- SECURITY DEFINER scritta male, e l'accesso con service_role. Questo file
-- chiude entrambe con un vincolo che vale per CHIUNQUE, superuser incluso:
-- i trigger non si aggirano con i privilegi.
--
-- ── Come si cancella, da qui in avanti ──
-- Il permesso non è un interruttore acceso/spento ma un TESTIMONE che nomina
-- ciò che si sta per cancellare:
--     SET LOCAL app.liste_hard_delete = '<id della lista>';   -- una lista
--     SET LOCAL app.liste_hard_delete = '*';                  -- tutto (reset)
-- I trigger confrontano il testimone con la riga che sta per sparire: sulla
-- lista con il proprio id, sui movimenti e sullo storico con il `lista_id`.
--
-- La forma a testimone non è un vezzo, è la lezione di una verifica. Il primo
-- disegno usava un booleano, contando sul fatto che una clausola `SET` sulla
-- funzione ne annullasse l'effetto all'uscita. Provato sul database, si è
-- rivelato falso: `set_config(..., is_local => true)` sopravvive fino a fine
-- transazione anche in una funzione che porta `SET search_path`, e un DELETE
-- diretto eseguito subito dopo la RPC passava indisturbato. Con il testimone
-- quel residuo non autorizza più nulla: nomina una lista che a quel punto non
-- esiste già più. Le RPC lo spengono comunque in modo esplicito, anche
-- uscendo per eccezione — due difese invece di una.
--
-- Una migrazione futura che debba cancellare davvero usa la stessa riga. È
-- deliberato: rende l'operazione un atto esplicito invece che una svista.
--
-- ── Ruoli allineati all'interfaccia ──
-- elimina_lista_definitivamente passa da admin/manager/agent ad admin/manager,
-- per coincidere col gate dell'interfaccia: un agent cestina (reversibile) ma
-- non distrugge. reset_completo era ed è admin-only.
--
-- ── Gap che resta aperto, e va detto ──
-- Questo file rende lo storico non riscrivibile, non garantisce che venga
-- scritto. Su liste_viaggio e movimenti_lista esistono policy RLS UPDATE
-- (`liste_update`, `movimenti_update`) necessarie alle RPC di scrittura, che
-- sono SECURITY INVOKER: chi ha accesso al modulo può quindi modificare un
-- importo con una chiamata diretta a PostgREST, saltando la RPC e quindi la
-- riga di storico che quella avrebbe scritto. Un registro immutabile serve a
-- poco se lo si può semplicemente non alimentare.
--
-- Chiuderlo richiede di estendere il testimone anche a UPDATE/INSERT e di
-- rivedere le otto RPC che scrivono — cioè il percorso con cui l'agenzia
-- registra i movimenti ogni giorno. È lavoro a sé, con i suoi test, non una
-- postilla a questo file: va fatto sapendo che si tocca la strada principale.
--
-- Idempotente: CREATE OR REPLACE / DROP TRIGGER IF EXISTS ovunque.

BEGIN;

-- ============================================================
-- 1. Il testimone
-- ============================================================

CREATE OR REPLACE FUNCTION private.liste_hard_delete_token()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  -- missing_ok = true: fuori da una transazione che l'ha dichiarato il
  -- parametro non esiste, e current_setting() senza il flag solleverebbe.
  SELECT coalesce(current_setting('app.liste_hard_delete', true), '');
$$;

REVOKE ALL ON FUNCTION private.liste_hard_delete_token() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.liste_hard_delete_token() TO authenticated;

-- ============================================================
-- 2. Guardie sul DELETE
-- ============================================================
-- Due funzioni distinte perché la riga da riconoscere è diversa: la lista
-- porta il proprio id, i movimenti e lo storico portano `lista_id`. Tenerle
-- separate evita di dover leggere un campo che sulla tabella padre non esiste.

CREATE OR REPLACE FUNCTION private.liste_blocca_delete_lista()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tok text := private.liste_hard_delete_token();
BEGIN
  IF v_tok = '*' OR v_tok = OLD.id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Cancellazione fisica non consentita su liste_viaggio. Usare il soft delete (deleted_at) o elimina_lista_definitivamente().'
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Una transazione autorizzata dichiara: SET LOCAL app.liste_hard_delete = ''<id lista>''';
END;
$$;

CREATE OR REPLACE FUNCTION private.liste_blocca_delete_figlia()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tok text := private.liste_hard_delete_token();
BEGIN
  IF v_tok = '*' OR v_tok = OLD.lista_id::text THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'Cancellazione fisica non consentita su %. Usare il soft delete (deleted_at) o la RPC dedicata.',
    TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Una transazione autorizzata dichiara: SET LOCAL app.liste_hard_delete = ''<id lista>''';
END;
$$;

-- TRUNCATE è statement-level: non ha OLD, e svuota tutto. Esige il testimone
-- globale. I trigger DELETE non lo intercetterebbero mai.
CREATE OR REPLACE FUNCTION private.liste_blocca_truncate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF private.liste_hard_delete_token() = '*' THEN
    RETURN NULL; -- il valore di ritorno è ignorato nei trigger statement-level
  END IF;
  RAISE EXCEPTION
    'TRUNCATE non consentito su %: svuoterebbe la tabella aggirando il soft delete.',
    TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege',
          HINT = 'Solo reset_completo() apre questo canale (testimone ''*'')';
END;
$$;

REVOKE ALL ON FUNCTION private.liste_blocca_delete_lista()  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.liste_blocca_delete_figlia() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.liste_blocca_truncate()      FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.liste_blocca_delete_lista()  TO authenticated;
GRANT EXECUTE ON FUNCTION private.liste_blocca_delete_figlia() TO authenticated;
GRANT EXECUTE ON FUNCTION private.liste_blocca_truncate()      TO authenticated;

-- ============================================================
-- 3. Lo storico non si riscrive
-- ============================================================
-- UPDATE è vietato SEMPRE, senza scappatoia: una voce di registro che si può
-- correggere a posteriori non prova più nulla. Il DELETE resta invece
-- possibile dal canale autorizzato, perché cancellare una lista per sempre
-- implica portarsi via le sue voci (vincolo di chiave esterna).

CREATE OR REPLACE FUNCTION private.lista_history_immutabile()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'lista_history è un registro append-only: le voci non si modificano.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

REVOKE ALL ON FUNCTION private.lista_history_immutabile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.lista_history_immutabile() TO authenticated;

-- ============================================================
-- 4. I trigger
-- ============================================================

DROP TRIGGER IF EXISTS trg_liste_no_hard_delete ON liste_viaggio;
CREATE TRIGGER trg_liste_no_hard_delete
  BEFORE DELETE ON liste_viaggio
  FOR EACH ROW EXECUTE FUNCTION private.liste_blocca_delete_lista();

DROP TRIGGER IF EXISTS trg_movimenti_no_hard_delete ON movimenti_lista;
CREATE TRIGGER trg_movimenti_no_hard_delete
  BEFORE DELETE ON movimenti_lista
  FOR EACH ROW EXECUTE FUNCTION private.liste_blocca_delete_figlia();

DROP TRIGGER IF EXISTS trg_history_no_hard_delete ON lista_history;
CREATE TRIGGER trg_history_no_hard_delete
  BEFORE DELETE ON lista_history
  FOR EACH ROW EXECUTE FUNCTION private.liste_blocca_delete_figlia();

DROP TRIGGER IF EXISTS trg_liste_no_truncate ON liste_viaggio;
CREATE TRIGGER trg_liste_no_truncate
  BEFORE TRUNCATE ON liste_viaggio
  FOR EACH STATEMENT EXECUTE FUNCTION private.liste_blocca_truncate();

DROP TRIGGER IF EXISTS trg_movimenti_no_truncate ON movimenti_lista;
CREATE TRIGGER trg_movimenti_no_truncate
  BEFORE TRUNCATE ON movimenti_lista
  FOR EACH STATEMENT EXECUTE FUNCTION private.liste_blocca_truncate();

DROP TRIGGER IF EXISTS trg_history_no_truncate ON lista_history;
CREATE TRIGGER trg_history_no_truncate
  BEFORE TRUNCATE ON lista_history
  FOR EACH STATEMENT EXECUTE FUNCTION private.liste_blocca_truncate();

DROP TRIGGER IF EXISTS trg_history_no_update ON lista_history;
CREATE TRIGGER trg_history_no_update
  BEFORE UPDATE ON lista_history
  FOR EACH ROW EXECUTE FUNCTION private.lista_history_immutabile();

-- ============================================================
-- 5. Le due RPC che devono poter cancellare aprono il canale
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
  -- admin/manager: allineato al gate dell'interfaccia. Un agent può cestinare
  -- una lista (operazione reversibile) ma non distruggerla.
  IF NOT EXISTS (
    SELECT 1 FROM users u
    WHERE u.id = auth.uid() AND u.active AND u.role IN ('admin','manager')
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

  -- Il testimone si accende dopo i controlli e nomina questa sola lista.
  BEGIN
    PERFORM set_config('app.liste_hard_delete', p_id::text, true);

    DELETE FROM lista_history   WHERE lista_id = p_id;
    DELETE FROM movimenti_lista WHERE lista_id = p_id;
    DELETE FROM liste_viaggio   WHERE id = p_id;

    PERFORM set_config('app.liste_hard_delete', '', true);
  EXCEPTION WHEN OTHERS THEN
    -- Anche uscendo per errore il canale si richiude.
    PERFORM set_config('app.liste_hard_delete', '', true);
    RAISE;
  END;
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
    PERFORM set_config('app.liste_hard_delete', '*', true);

    BEGIN
      TRUNCATE lista_history, movimenti_lista, liste_viaggio;
    EXCEPTION
      -- Il fallback esisteva per safeupdate, che rifiuta i DELETE senza
      -- predicato (migrazione 008 della repo liste-buoni-viaggio). Il
      -- predicato su id <> uuid nullo è reale e il planner non lo semplifica.
      WHEN insufficient_privilege OR feature_not_supported THEN
        DELETE FROM lista_history   WHERE id <> v_nil;
        DELETE FROM movimenti_lista WHERE id <> v_nil;
        DELETE FROM liste_viaggio   WHERE id <> v_nil;
    END;

    PERFORM set_config('app.liste_hard_delete', '', true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.liste_hard_delete', '', true);
    RAISE;
  END;

  RETURN jsonb_build_object(
    'history_deleted',   v_h,
    'movimenti_deleted', v_m,
    'liste_deleted',     v_l
  );
END;
$$;

COMMIT;
