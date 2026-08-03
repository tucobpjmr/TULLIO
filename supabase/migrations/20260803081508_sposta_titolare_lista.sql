-- Spostare una lista da un cliente a un altro già esistente in anagrafica.
--
-- Caso d'uso: un "intestatario-evento" nato dall'import dei documenti Word
-- (es. "50° RICCARDO SCAMARCIO") va ricondotto alla persona vera, già
-- presente come cliente CRM pulito. Finora l'unico modo era una UPDATE SQL a
-- mano su liste_viaggio.client_id (vedi docs/ANAGRAFICA_E_LISTE.md § 4).
--
-- Non va confuso con modifica_lista(p_client_name): quella rinomina la RIGA
-- cliente attuale (client_id invariato, il nome cambia per TUTTE le sue
-- liste). Questa invece cambia QUALE riga cliente è il titolare della
-- lista (il client_id cambia, i nomi restano entrambi intatti) — un'
-- operazione diversa, con un raggio d'azione diverso: una sola lista, non
-- tutte quelle del cliente.
--
-- Promozione di un cointestatario: se il cliente di destinazione è già
-- cointestatario di QUESTA lista, verrebbe a trovarsi titolare e
-- cointestatario della stessa lista — lo stesso caso che
-- aggiungi_beneficiario_lista impedisce in ingresso. Qui si risolve invece
-- di rifiutare: è un'operazione plausibile ("i due erano invertiti") e viene
-- dichiarata in UI prima del click, non è una sorpresa silenziosa.
--
-- SECURITY DEFINER come rimuovi_beneficiario_lista: deve poter cancellare da
-- lista_beneficiari, che non concede DELETE ad authenticated apposta (vedi
-- 20260802214946) — la rimozione passa solo da funzioni che scrivono anche
-- la voce di storico nella stessa transazione, e questa è una di quelle.

BEGIN;

CREATE OR REPLACE FUNCTION sposta_titolare_lista(
  p_id              uuid,
  p_nuovo_client_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lista     liste_viaggio;
  v_old_nome  text;
  v_new_nome  text;
  v_era_benef boolean;
BEGIN
  IF NOT private.can_liste() THEN
    RAISE EXCEPTION 'Operazione non consentita per il tuo ruolo.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lista FROM liste_viaggio
   WHERE id = p_id AND deleted_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata o archiviata.', p_id;
  END IF;

  IF p_nuovo_client_id IS NULL THEN
    RAISE EXCEPTION 'Indicare il cliente su cui spostare la lista.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_nuovo_client_id = v_lista.client_id THEN
    RAISE EXCEPTION 'La lista è già di questo cliente.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT name INTO v_new_nome FROM clients WHERE id = p_nuovo_client_id;
  IF v_new_nome IS NULL THEN
    RAISE EXCEPTION 'Cliente di destinazione non trovato.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT name INTO v_old_nome FROM clients WHERE id = v_lista.client_id;

  SELECT EXISTS (
    SELECT 1 FROM lista_beneficiari WHERE lista_id = p_id AND client_id = p_nuovo_client_id
  ) INTO v_era_benef;

  IF v_era_benef THEN
    DELETE FROM lista_beneficiari WHERE lista_id = p_id AND client_id = p_nuovo_client_id;
    INSERT INTO lista_history (lista_id, actor_id, action, old_value)
    VALUES (p_id, (SELECT auth.uid()), 'beneficiario_rimosso', v_new_nome);
  END IF;

  UPDATE liste_viaggio SET client_id = p_nuovo_client_id WHERE id = p_id;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (p_id, (SELECT auth.uid()), 'titolare_spostato', v_old_nome, v_new_nome);
END;
$$;

REVOKE ALL ON FUNCTION sposta_titolare_lista(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sposta_titolare_lista(uuid, uuid) TO authenticated;

COMMIT;
