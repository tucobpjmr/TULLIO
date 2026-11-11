-- Banca di appoggio per i movimenti POS e BONIFICO (BNL / BANCO NAPOLI).
--
-- Facoltativa: NULL resta valido (i movimenti già registrati non ce l'hanno).
-- Ammessa SOLO con metodo 'pos' o 'bonifico': per contanti/assegno/altro una
-- banca non ha significato, e il vincolo lo garantisce anche a chi scrive
-- senza passare dalle RPC.
--
-- Le tre RPC di scrittura prendono `p_banca` prima di `p_origin`, che resta
-- l'ultimo parametro (contratto origin_client del modulo Liste): drop + create,
-- mai un overload. `importa_backup` cambia corpo ma non firma: create or replace.

-- ── 1. Colonna ───────────────────────────────────────────────────────────
alter table public.movimenti_lista
  add column if not exists banca text;

alter table public.movimenti_lista
  drop constraint if exists movimenti_lista_banca_check;

alter table public.movimenti_lista
  add constraint movimenti_lista_banca_check check (
    banca is null
    or (banca in ('bnl','banco_napoli') and metodo in ('pos','bonifico'))
  );

comment on column public.movimenti_lista.banca is
  'Banca di appoggio (bnl | banco_napoli), solo per metodo pos o bonifico. Facoltativa.';

-- ── 2. registra_movimento_lista ──────────────────────────────────────────
drop function public.registra_movimento_lista(uuid, date, text, numeric, text, uuid);

create function public.registra_movimento_lista(
  p_lista_id uuid,
  p_data date,
  p_descrizione text,
  p_importo numeric,
  p_metodo text default null::text,
  p_banca text default null::text,
  p_origin uuid default null::uuid
)
 returns uuid
 language plpgsql
 set search_path to 'public'
as $function$
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
  IF p_banca IS NOT NULL AND (p_banca NOT IN ('bnl','banco_napoli')
                              OR p_metodo IS NULL OR p_metodo NOT IN ('pos','bonifico')) THEN
    RAISE EXCEPTION 'La banca si indica solo per POS o bonifico (BNL o Banco Napoli).'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1 FROM liste_viaggio
   WHERE id = p_lista_id AND deleted_at IS NULL AND stato = 'attiva'
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lista % non trovata, archiviata o non attiva.', p_lista_id;
  END IF;

  INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, banca, created_by, origin_client)
  VALUES (p_lista_id, p_data, v_desc, p_importo, p_metodo, p_banca, auth.uid(), p_origin)
  RETURNING id INTO v_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
  VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
          mov_snapshot(p_data, v_desc, p_importo));

  RETURN v_id;
END;
$function$;

revoke all on function public.registra_movimento_lista(uuid, date, text, numeric, text, text, uuid) from public;
revoke execute on function public.registra_movimento_lista(uuid, date, text, numeric, text, text, uuid) from anon;
grant execute on function public.registra_movimento_lista(uuid, date, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.registra_movimento_lista(uuid, date, text, numeric, text, text, uuid) to service_role;

-- ── 3. registra_movimenti_lista ──────────────────────────────────────────
drop function public.registra_movimenti_lista(uuid, date, jsonb, text, uuid);

create function public.registra_movimenti_lista(
  p_lista_id uuid,
  p_data date,
  p_movimenti jsonb,
  p_metodo text default null::text,
  p_banca text default null::text,
  p_origin uuid default null::uuid
)
 returns integer
 language plpgsql
 set search_path to 'public'
as $function$
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
  IF p_banca IS NOT NULL AND (p_banca NOT IN ('bnl','banco_napoli')
                              OR p_metodo IS NULL OR p_metodo NOT IN ('pos','bonifico')) THEN
    RAISE EXCEPTION 'La banca si indica solo per POS o bonifico (BNL o Banco Napoli).'
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

    INSERT INTO movimenti_lista (lista_id, data_movimento, descrizione, importo, metodo, banca, created_by, origin_client)
    VALUES (p_lista_id, p_data, v_desc, v_importo, p_metodo, p_banca, auth.uid(), p_origin)
    RETURNING id INTO v_id;

    INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, new_value)
    VALUES (p_lista_id, v_id, auth.uid(), 'movimento_aggiunto',
            mov_snapshot(p_data, v_desc, v_importo));

    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$function$;

revoke all on function public.registra_movimenti_lista(uuid, date, jsonb, text, text, uuid) from public;
revoke execute on function public.registra_movimenti_lista(uuid, date, jsonb, text, text, uuid) from anon;
grant execute on function public.registra_movimenti_lista(uuid, date, jsonb, text, text, uuid) to authenticated;
grant execute on function public.registra_movimenti_lista(uuid, date, jsonb, text, text, uuid) to service_role;

-- ── 4. modifica_movimento_lista ──────────────────────────────────────────
drop function public.modifica_movimento_lista(uuid, date, text, numeric, text, uuid);

create function public.modifica_movimento_lista(
  p_id uuid,
  p_data date,
  p_descrizione text,
  p_importo numeric,
  p_metodo text default null::text,
  p_banca text default null::text,
  p_origin uuid default null::uuid
)
 returns void
 language plpgsql
 set search_path to 'public'
as $function$
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
  IF p_banca IS NOT NULL AND (p_banca NOT IN ('bnl','banco_napoli')
                              OR p_metodo IS NULL OR p_metodo NOT IN ('pos','bonifico')) THEN
    RAISE EXCEPTION 'La banca si indica solo per POS o bonifico (BNL o Banco Napoli).'
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
         metodo         = p_metodo,
         banca          = p_banca,
         origin_client  = p_origin
   WHERE id = p_id;

  INSERT INTO lista_history (lista_id, movimento_id, actor_id, action, old_value, new_value)
  VALUES (v_old.lista_id, p_id, auth.uid(), 'movimento_modificato',
          mov_snapshot(v_old.data_movimento, v_old.descrizione, v_old.importo),
          mov_snapshot(p_data, v_desc, p_importo));
END;
$function$;

revoke all on function public.modifica_movimento_lista(uuid, date, text, numeric, text, text, uuid) from public;
revoke execute on function public.modifica_movimento_lista(uuid, date, text, numeric, text, text, uuid) from anon;
grant execute on function public.modifica_movimento_lista(uuid, date, text, numeric, text, text, uuid) to authenticated;
grant execute on function public.modifica_movimento_lista(uuid, date, text, numeric, text, text, uuid) to service_role;

-- ── 5. importa_backup (SECURITY DEFINER) ────────────────────────────────
-- Stesso corpo della versione viva (20260816110000), più la colonna banca:
-- senza, un ripristino da backup la perderebbe in silenzio. Firma invariata,
-- quindi grant e revoke esistenti restano validi.
create or replace function public.importa_backup(
  p_data jsonb,
  p_origin uuid default null::uuid
)
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
                               created_at, updated_at, closed_at, deleted_at, origin_client)
    SELECT l.id, l.client_id, l.titolo,
           CASE WHEN l.stato IN ('attiva','esaurita') THEN l.stato ELSE 'attiva' END,
           l.note, v_me,
           COALESCE(l.created_at, now()), COALESCE(l.updated_at, now()),
           l.closed_at, l.deleted_at, p_origin
    FROM jsonb_to_recordset(COALESCE(p_data->'liste', '[]'::jsonb)) AS l(
      id uuid, client_id uuid, titolo text, stato text, note text,
      created_at timestamptz, updated_at timestamptz, closed_at timestamptz, deleted_at timestamptz)
    WHERE l.id IS NOT NULL AND l.client_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM clients cc WHERE cc.id = l.client_id)
    ON CONFLICT (id) DO NOTHING
    RETURNING 1)
  SELECT count(*) INTO v_lis FROM ins;

  WITH ins AS (
    INSERT INTO lista_beneficiari (lista_id, client_id, created_by, created_at, origin_client)
    SELECT b.lista_id, b.client_id, v_me, COALESCE(b.created_at, now()), p_origin
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
                                 metodo, banca, created_by, created_at, updated_at, deleted_at, origin_client)
    SELECT m.id, m.lista_id, m.data_movimento, m.descrizione, m.importo,
           CASE WHEN m.metodo IN ('pos','bonifico','contanti','assegno','altro')
                THEN m.metodo ELSE NULL END,
           CASE WHEN m.banca IN ('bnl','banco_napoli') AND m.metodo IN ('pos','bonifico')
                THEN m.banca ELSE NULL END,
           v_me, COALESCE(m.created_at, now()), COALESCE(m.updated_at, now()), m.deleted_at, p_origin
    FROM jsonb_to_recordset(COALESCE(p_data->'movimenti', '[]'::jsonb)) AS m(
      id uuid, lista_id uuid, data_movimento date, descrizione text, importo numeric,
      metodo text, banca text, created_at timestamptz, updated_at timestamptz, deleted_at timestamptz)
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

