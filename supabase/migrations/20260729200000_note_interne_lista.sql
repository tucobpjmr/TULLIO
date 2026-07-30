-- Note interne della lista: sezione dedicata nel dettaglio, esclusa di
-- proposito dal riepilogo cliente.
--
-- La colonna liste_viaggio.note esiste già dalla migrazione fondativa
-- (20260728190000) — la usano da tempo la ricerca globale (Topbar.jsx) e il
-- cestino (Archive.jsx) — ma finora nessuna RPC la scriveva: non c'era un
-- punto della UI dove inserirla. Questa migrazione aggiunge la RPC
-- modifica_note_lista, stessa forma di modifica_lista (aggiorna solo se il
-- valore cambia, storicizza la modifica in lista_history).
--
-- Il riepilogo cliente (RiepilogoClienteModal/riepilogoTesto in
-- listeApi.js) legge solo `movimenti`, mai `lista.note`: l'esclusione è già
-- garantita lato client, qui non tocchiamo quel percorso.
--
-- Nessuna policy RLS nuova: liste_update (private.can_liste(), migrazione
-- 20260728190100) copre già l'UPDATE su liste_viaggio, e history_insert
-- copre l'INSERT su lista_history. La RPC non è SECURITY DEFINER: gira con i
-- privilegi del chiamante, come modifica_lista.
--
-- Idempotente: CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION modifica_note_lista(
  p_id   uuid,
  p_note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_note  text := NULLIF(trim(p_note), '');
  v_lista liste_viaggio;
BEGIN
  SELECT * INTO v_lista FROM liste_viaggio
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_id;
  END IF;

  IF v_note IS NOT DISTINCT FROM v_lista.note THEN
    RETURN;
  END IF;

  UPDATE liste_viaggio SET note = v_note, updated_at = now() WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, (SELECT auth.uid()), 'lista_note_modificata', v_lista.note, v_note);
END;
$$;

REVOKE ALL ON FUNCTION modifica_note_lista(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION modifica_note_lista(uuid, text) TO authenticated;

COMMIT;
