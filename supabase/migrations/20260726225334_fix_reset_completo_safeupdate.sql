CREATE OR REPLACE FUNCTION reset_completo(p_conferma text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_me  uuid := auth.uid();
  v_h   int;
  v_m   int;
  v_l   int;
  -- Sentinella per il fallback: l'uuid nullo non e' generabile da
  -- gen_random_uuid() e non compare in nessuna riga reale.
  v_nil uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Non autenticato.';
  END IF;
  IF p_conferma IS DISTINCT FROM 'RESET TOTALE' THEN
    RAISE EXCEPTION 'Conferma non valida. Digitare esattamente: RESET TOTALE'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Conteggi prima dello svuotamento: TRUNCATE non supporta RETURNING.
  SELECT count(*) INTO v_h FROM lista_history;
  SELECT count(*) INTO v_m FROM movimenti_lista;
  SELECT count(*) INTO v_l FROM liste_viaggio;

  BEGIN
    -- Un solo comando per le tre tabelle: le FK reciproche non richiedono CASCADE.
    TRUNCATE lista_history, movimenti_lista, liste_viaggio;
  EXCEPTION
    WHEN insufficient_privilege OR feature_not_supported THEN
      -- Ordine imposto dalle FK (nessun ON DELETE CASCADE): figli prima dei padri.
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
$fn$;

REVOKE ALL   ON FUNCTION reset_completo(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reset_completo(text) TO authenticated;

DROP FUNCTION IF EXISTS public._su_smoke();
