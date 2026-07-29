-- Reti di sicurezza per il modulo "Liste Viaggio"
--
-- La migrazione 20260728190000 elencava in testa tre lacune note del modulo,
-- ereditate dall'app di origine e volutamente non corrette in quel file
-- (che doveva limitarsi a fotografare lo stato live). Questa migrazione le
-- chiude. Nessuna di esse era sfruttabile da un utente via PostgREST — non
-- esistono policy RLS DELETE/UPDATE su queste tabelle — ma tutte e tre erano
-- raggiungibili dalle funzioni SECURITY DEFINER, che la RLS la bypassano per
-- costruzione. Il soft delete e l'append-only dello storico erano quindi
-- garantiti solo dalla disciplina del codice applicativo, non dal database.
--
--   1. Nessun vincolo impediva l'hard DELETE su liste_viaggio/movimenti_lista.
--      Ora un trigger lo blocca, tranne che per le due operazioni in cui è
--      legittimo (elimina_lista_definitivamente e reset_completo), che si
--      dichiarano con un flag di transazione.
--   2. lista_history non era append-only: una riga di storico poteva essere
--      riscritta o cancellata, cioè la traccia di chi ha fatto cosa poteva
--      essere alterata. È il registro su cui si basa la ricostruzione dei
--      movimenti di cassa, quindi vale la pena renderlo immutabile davvero.
--   3. liste_viaggio.updated_at non si muoveva quando cambiava un movimento
--      figlio: l'ordinamento "Ultima modifica" della home del modulo (che è
--      quello di default) mostrava quindi un ordine che non corrisponde a
--      quando la lista è stata toccata l'ultima volta.
--
-- In più: indici sulle FK segnalate dall'advisor unindexed_foreign_keys.
--
-- Idempotente: CREATE OR REPLACE / DROP ... IF EXISTS ovunque.

BEGIN;

-- ============================================================
-- 1. Blocco dell'hard delete (con deroga esplicita)
-- ============================================================

-- Le operazioni che devono davvero cancellare righe alzano questo flag per la
-- durata della transazione. Un flag di sessione (non un ruolo o un
-- current_user) perché le funzioni legittime girano come owner, esattamente
-- come ci girerebbe un eventuale chiamante non previsto: il ruolo non
-- distinguerebbe i due casi.
CREATE OR REPLACE FUNCTION private.liste_guard_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.liste_hard_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION
      'Hard delete non consentito su %. Usare il soft delete (deleted_at) o le RPC dedicate.',
      TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

-- TRUNCATE non fa scattare i trigger di riga: serve un trigger di statement
-- dedicato, altrimenti reset_completo aggirerebbe il blocco senza accorgersene.
CREATE OR REPLACE FUNCTION private.liste_guard_truncate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.liste_hard_delete', true), '') <> 'on' THEN
    RAISE EXCEPTION 'TRUNCATE non consentito su %.', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_liste_no_hard_delete ON liste_viaggio;
CREATE TRIGGER trg_liste_no_hard_delete
  BEFORE DELETE ON liste_viaggio
  FOR EACH ROW EXECUTE FUNCTION private.liste_guard_delete();

DROP TRIGGER IF EXISTS trg_movimenti_no_hard_delete ON movimenti_lista;
CREATE TRIGGER trg_movimenti_no_hard_delete
  BEFORE DELETE ON movimenti_lista
  FOR EACH ROW EXECUTE FUNCTION private.liste_guard_delete();

DROP TRIGGER IF EXISTS trg_liste_no_truncate ON liste_viaggio;
CREATE TRIGGER trg_liste_no_truncate
  BEFORE TRUNCATE ON liste_viaggio
  FOR EACH STATEMENT EXECUTE FUNCTION private.liste_guard_truncate();

DROP TRIGGER IF EXISTS trg_movimenti_no_truncate ON movimenti_lista;
CREATE TRIGGER trg_movimenti_no_truncate
  BEFORE TRUNCATE ON movimenti_lista
  FOR EACH STATEMENT EXECUTE FUNCTION private.liste_guard_truncate();

-- ============================================================
-- 2. lista_history append-only
-- ============================================================

CREATE OR REPLACE FUNCTION private.history_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- La cancellazione a cascata di una lista eliminata definitivamente è
  -- l'unico caso in cui lo storico può sparire, e passa dallo stesso flag.
  IF TG_OP = 'DELETE'
     AND COALESCE(current_setting('app.liste_hard_delete', true), '') = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'lista_history è append-only: le voci di storico non si modificano né si cancellano.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS trg_history_append_only ON lista_history;
CREATE TRIGGER trg_history_append_only
  BEFORE UPDATE OR DELETE ON lista_history
  FOR EACH ROW EXECUTE FUNCTION private.history_append_only();

DROP TRIGGER IF EXISTS trg_history_no_truncate ON lista_history;
CREATE TRIGGER trg_history_no_truncate
  BEFORE TRUNCATE ON lista_history
  FOR EACH STATEMENT EXECUTE FUNCTION private.liste_guard_truncate();

-- ============================================================
-- 3. Le due funzioni che cancellano davvero dichiarano la deroga
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

  -- Deroga valida per questa sola transazione.
  PERFORM set_config('app.liste_hard_delete', 'on', true);

  DELETE FROM lista_history   WHERE lista_id = p_id;
  DELETE FROM movimenti_lista WHERE lista_id = p_id;
  DELETE FROM liste_viaggio   WHERE id = p_id;
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

  PERFORM set_config('app.liste_hard_delete', 'on', true);

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
-- 4. updated_at della lista propagato dai movimenti
-- ============================================================

CREATE OR REPLACE FUNCTION private.tocca_lista_da_movimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lista uuid := COALESCE(NEW.lista_id, OLD.lista_id);
BEGIN
  -- Il BEFORE UPDATE su liste_viaggio (set_updated_at) mette now() da sé:
  -- qui basta toccare la riga. Nessuna ricorsione, la lista non scrive
  -- sui movimenti.
  UPDATE liste_viaggio SET updated_at = now() WHERE id = v_lista;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_movimenti_tocca_lista ON movimenti_lista;
CREATE TRIGGER trg_movimenti_tocca_lista
  AFTER INSERT OR UPDATE OR DELETE ON movimenti_lista
  FOR EACH ROW EXECUTE FUNCTION private.tocca_lista_da_movimento();

-- ============================================================
-- 5. Indici sulle FK segnalate dall'advisor
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lista_history_actor_id     ON lista_history (actor_id);
CREATE INDEX IF NOT EXISTS idx_lista_history_movimento_id ON lista_history (movimento_id);
CREATE INDEX IF NOT EXISTS idx_liste_created_by           ON liste_viaggio (created_by);
CREATE INDEX IF NOT EXISTS idx_movimenti_created_by       ON movimenti_lista (created_by);

COMMIT;
