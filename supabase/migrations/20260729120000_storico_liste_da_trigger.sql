-- Lo storico smette di dipendere da chi scrive.
--
-- ── Il problema ──
-- Le RPC del modulo scrivono `lista_history` insieme al dato, ma NON sono
-- l'unica strada per arrivare al dato: su liste_viaggio e movimenti_lista
-- esistono policy RLS UPDATE (necessarie, perché quelle RPC sono SECURITY
-- INVOKER), quindi chi ha accesso al modulo può modificare un importo con una
-- chiamata diretta a PostgREST e non lasciare alcuna traccia.
--
-- Misurato su questo database prima di scrivere questo file, facendo agire un
-- utente con ruolo `agent` (transazione annullata):
--   · UPDATE diretto dell'importo: da 500 a 9999, riuscito;
--   · righe di storico dopo quell'update: 0 → 0, nessuna traccia;
--   · spostamento del movimento su un'altra lista: riuscito;
--   · stessa modifica via modifica_movimento_lista(): 0 → 1, tracciata.
-- Rendere immutabile un registro (migrazione 20260729080000) serve a poco se
-- lo si può semplicemente non alimentare.
--
-- ── La forma scelta, e perché non un'altra ──
-- La strada ovvia sarebbe togliere le policy UPDATE e portare le RPC a
-- SECURITY DEFINER. Funziona, ma toglie permessi sul percorso con cui
-- l'agenzia registra i movimenti ogni giorno: se una delle nove funzioni
-- sbaglia un controllo, il lavoro si ferma.
--
-- Qui la traccia viene invece GARANTITA invece che IMPOSTA: dei trigger
-- scrivono la voce di storico per qualunque scrittura, da qualunque strada
-- arrivi. Nessuna policy viene revocata e — punto essenziale — NESSUNA RPC
-- viene modificata: il percorso quotidiano resta bit per bit quello di prima.
--
-- Il problema del doppione (la RPC scrive la sua voce, il trigger scriverebbe
-- la seconda) è risolto rimandando il trigger alla FINE della transazione, con
-- un CONSTRAINT TRIGGER ... DEFERRABLE INITIALLY DEFERRED. A quel punto la
-- voce della RPC, se c'è, è già in tabella: il trigger la vede e tace. Se non
-- c'è — perché la modifica è arrivata per via diretta — la scrive lui.
--
-- Le etichette e i formati sono esattamente quelli che le RPC producono oggi
-- (`mov_snapshot`, `fmt_eur`, "CLIENTE — titolo"), così la copia agente e il
-- pannello storico continuano a leggersi allo stesso modo.
--
-- ── Cosa cambia in pratica ──
-- Restano tracciate come prima le operazioni fatte dall'app. In più vengono
-- tracciate quelle fatte per via diretta, che prima sparivano. L'attore è
-- sempre auth.uid(), quindi anche la chiamata diretta porta un nome.
--
-- Un effetto atteso, non un difetto: `importa_backup()` non scrive storico,
-- quindi da qui in avanti un import massivo genera una voce per ogni lista e
-- per ogni movimento importato. È traccia legittima di ciò che è entrato, ma
-- su un import da centinaia di liste sono altrettante righe: va saputo prima
-- di lanciarlo.
--
-- Idempotente: CREATE OR REPLACE / DROP TRIGGER IF EXISTS ovunque.

BEGIN;

-- ============================================================
-- 1. "Qualcuno ha già tracciato questa riga in questa transazione?"
-- ============================================================
-- transaction_timestamp() è costante per tutta la transazione, e le voci
-- scritte dalle RPC hanno created_at = now(), che è lo stesso valore: le voci
-- di questa transazione sono quindi esattamente quelle con created_at >= esso.
-- Il confronto su movimento_id è NULL-safe: le voci di lista lo hanno NULL.
--
-- Il confronto include l'AZIONE, e non è un dettaglio: una prima versione
-- guardava solo (lista, movimento), e alla prova registrare un movimento e
-- poi modificarlo nella stessa transazione produceva UNA riga invece di due —
-- la modifica veniva scambiata per un doppione dell'inserimento. Con l'azione
-- nel confronto, "aggiunto" e "modificato" restano due fatti distinti.
--
-- Limite residuo, accettato: due modifiche dello stesso tipo sullo stesso
-- oggetto dentro un'unica transazione lasciano una sola riga. PostgREST apre
-- una transazione per richiesta, quindi nell'uso reale non accade.
CREATE OR REPLACE FUNCTION private.lista_history_gia_tracciato(
  p_lista_id     uuid,
  p_movimento_id uuid,
  p_action       text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM lista_history h
     WHERE h.lista_id = p_lista_id
       AND h.movimento_id IS NOT DISTINCT FROM p_movimento_id
       AND h.action = p_action
       AND h.created_at >= transaction_timestamp()
  );
$$;

REVOKE ALL ON FUNCTION private.lista_history_gia_tracciato(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.lista_history_gia_tracciato(uuid, uuid, text) TO authenticated;

-- Snapshot di testata usato da `lista_modificata`: stesso formato che produce
-- modifica_lista() ("CLIENTE — titolo", oppure il solo cliente senza titolo).
CREATE OR REPLACE FUNCTION private.lista_snapshot(p_client_id uuid, p_titolo text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE((SELECT name FROM clients WHERE id = p_client_id), '')
      || CASE WHEN p_titolo IS NOT NULL THEN ' — ' || p_titolo ELSE '' END;
$$;

REVOKE ALL ON FUNCTION private.lista_snapshot(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.lista_snapshot(uuid, text) TO authenticated;

-- ============================================================
-- 2. Liste: creazione, stato, cestino, testata
-- ============================================================
CREATE OR REPLACE FUNCTION private.traccia_lista()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old    text;
  v_new    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'lista_creata';
    v_new    := NEW.titolo;

  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'lista_archiviata';

  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_action := 'lista_ripristinata';

  ELSIF OLD.stato IS DISTINCT FROM NEW.stato THEN
    v_action := CASE WHEN NEW.stato = 'esaurita' THEN 'lista_chiusa' ELSE 'lista_riaperta' END;
    v_old    := OLD.stato;
    v_new    := NEW.stato;

  ELSIF OLD.titolo IS DISTINCT FROM NEW.titolo
     OR OLD.client_id IS DISTINCT FROM NEW.client_id THEN
    v_action := 'lista_modificata';
    v_old    := private.lista_snapshot(OLD.client_id, OLD.titolo);
    v_new    := private.lista_snapshot(NEW.client_id, NEW.titolo);

  ELSE
    -- Solo updated_at (o un campo che non racconta nulla): niente rumore.
    RETURN NULL;
  END IF;

  IF private.lista_history_gia_tracciato(NEW.id, NULL, v_action) THEN
    RETURN NULL; -- l'ha già scritta chi ha fatto la modifica
  END IF;

  INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
  VALUES (NEW.id, auth.uid(), v_action, v_old, v_new);

  RETURN NULL;
END;
$$;

-- ============================================================
-- 3. Movimenti: registrazione, modifica, annullamento
-- ============================================================
CREATE OR REPLACE FUNCTION private.traccia_movimento()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old    text;
  v_new    text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'movimento_aggiunto';
    v_new    := mov_snapshot(NEW.data_movimento, NEW.descrizione, NEW.importo);

  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'movimento_eliminato';
    v_old    := mov_snapshot(OLD.data_movimento, OLD.descrizione, OLD.importo);

  ELSIF OLD.data_movimento IS DISTINCT FROM NEW.data_movimento
     OR OLD.descrizione    IS DISTINCT FROM NEW.descrizione
     OR OLD.importo        IS DISTINCT FROM NEW.importo
     OR OLD.metodo         IS DISTINCT FROM NEW.metodo
     OR OLD.lista_id       IS DISTINCT FROM NEW.lista_id THEN
    v_action := 'movimento_modificato';
    v_old    := mov_snapshot(OLD.data_movimento, OLD.descrizione, OLD.importo);
    v_new    := mov_snapshot(NEW.data_movimento, NEW.descrizione, NEW.importo);

  ELSE
    RETURN NULL;
  END IF;

  IF private.lista_history_gia_tracciato(NEW.lista_id, NEW.id, v_action) THEN
    RETURN NULL;
  END IF;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value, new_value)
  VALUES (NEW.lista_id, NEW.id, auth.uid(), v_action, v_old, v_new);

  RETURN NULL;
END;
$$;

-- ============================================================
-- 4. Rinomina del cliente
-- ============================================================
-- Il nome cliente vive in `clients`, non in `liste_viaggio`: un trigger sulla
-- lista non può accorgersi della rinomina, che però cambia l'intestazione di
-- tutte le sue liste — ed è già oggi tracciata da modifica_lista(). Senza
-- questo trigger, farla per via diretta sfuggirebbe.
--
-- Puramente additivo: scrive solo in lista_history e non blocca nulla, quindi
-- non altera il comportamento del resto dell'applicazione, che pure usa
-- questa tabella.
CREATE OR REPLACE FUNCTION private.traccia_cliente_rinominato()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  IF OLD.name IS NOT DISTINCT FROM NEW.name THEN
    RETURN NULL;
  END IF;

  FOR r IN SELECT id, titolo FROM liste_viaggio
            WHERE client_id = NEW.id AND deleted_at IS NULL
  LOOP
    IF NOT private.lista_history_gia_tracciato(r.id, NULL, 'lista_modificata') THEN
      INSERT INTO lista_history (lista_id, actor_id, action, old_value, new_value)
      VALUES (r.id, auth.uid(), 'lista_modificata',
              COALESCE(OLD.name, '') || CASE WHEN r.titolo IS NOT NULL THEN ' — ' || r.titolo ELSE '' END,
              COALESCE(NEW.name, '') || CASE WHEN r.titolo IS NOT NULL THEN ' — ' || r.titolo ELSE '' END);
    END IF;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.traccia_lista()              FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.traccia_movimento()          FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.traccia_cliente_rinominato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.traccia_lista()              TO authenticated;
GRANT EXECUTE ON FUNCTION private.traccia_movimento()          TO authenticated;
GRANT EXECUTE ON FUNCTION private.traccia_cliente_rinominato() TO authenticated;

-- ============================================================
-- 5. I trigger, rimandati a fine transazione
-- ============================================================
-- DEFERRABLE INITIALLY DEFERRED è ciò che rende possibile il riconoscimento
-- del doppione: al COMMIT la voce scritta dalla RPC è già in tabella. Un
-- trigger AFTER ordinario scatterebbe PRIMA di quell'INSERT e scriverebbe
-- sempre, raddoppiando ogni riga di storico.

DROP TRIGGER IF EXISTS trg_traccia_lista ON liste_viaggio;
CREATE CONSTRAINT TRIGGER trg_traccia_lista
  AFTER INSERT OR UPDATE ON liste_viaggio
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.traccia_lista();

DROP TRIGGER IF EXISTS trg_traccia_movimento ON movimenti_lista;
CREATE CONSTRAINT TRIGGER trg_traccia_movimento
  AFTER INSERT OR UPDATE ON movimenti_lista
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.traccia_movimento();

DROP TRIGGER IF EXISTS trg_traccia_cliente_rinominato ON clients;
CREATE CONSTRAINT TRIGGER trg_traccia_cliente_rinominato
  AFTER UPDATE ON clients
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION private.traccia_cliente_rinominato();

COMMIT;
