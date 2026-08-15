-- M-1 (docs/AUDIT_ARCHITETTURA_2026-08-15.md) — importa_backup fonde un
-- archivio esterno in quattro tabelle, clients inclusa (835 righe di PII di
-- persone esterne al team). Non è una scrittura di dominio: è
-- amministrazione, e l'unico ingresso in UI (AdminIOTab) è già riservato agli
-- admin (canAccessAdmin). Il gate nel corpo usava però private.can_liste(),
-- che lascia passare admin/manager/agent — tre ruoli su quattro, più largo
-- di ogni percorso reale che raggiunge la funzione. Un agent senza accesso al
-- pannello Admin poteva comunque chiamare
-- /rest/v1/rpc/importa_backup con un payload costruito a mano.
--
-- Il danno restava contenuto (ON CONFLICT DO NOTHING su tutti gli insert:
-- si aggiunge, non si sovrascrive; un agent può già inserire clienti tramite
-- la RLS ordinaria), ma è comunque lo scarto UI↔DB che lib/permissions.js
-- esiste per eliminare — qui nella direzione permissiva.
--
-- Unica modifica: private.can_liste() → private.is_admin(), stesso corpo
-- altrimenti.
create or replace function public.importa_backup(p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori.'
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
$function$;
