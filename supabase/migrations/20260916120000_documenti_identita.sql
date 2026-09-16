-- Archivio dei documenti di identità dei passeggeri.
--
-- ─── PERCHÉ UNA TABELLA NUOVA E NON UNA COLONNA SU `clients` ────────────────
-- Un passeggero può avere più di un documento (passaporto E carta d'identità,
-- il passaporto vecchio e quello rinnovato), e ciascuno ha una scadenza
-- propria: è una relazione uno-a-molti, non un attributo della scheda. E
-- soprattutto NON tutti i passeggeri sono clienti: chi viaggia con il
-- titolare della pratica spesso non ha una riga in `clients`. Per questo
-- `client_id` esiste ma è FACOLTATIVO — collega il documento all'anagrafica
-- quando la scheda c'è, senza rendere l'anagrafica una precondizione per
-- archiviare un documento.
--
-- ─── IL FILE STA NEL BUCKET, NON QUI ────────────────────────────────────────
-- Questa tabella tiene i METADATI; l'immagine sta nel bucket privato
-- `documenti-identita`, e `file_path` è il collegamento fra i due. È lo stesso
-- disegno di `task_files` (20260621164517) e la ragione è quella già pagata
-- una volta su `users.photo_url`, che teneva le foto come data-URL base64: la
-- riga cresceva fino a megabyte e ogni lettura della tabella se la
-- ritrascinava dietro. Con ~1000 documenti previsti quella scelta costerebbe
-- gigabyte dentro Postgres invece di ~0,3 MB di metadati.
--
-- ─── DATI PERSONALI ─────────────────────────────────────────────────────────
-- Un documento di identità è il dato più sensibile che questo progetto abbia
-- mai archiviato. Tre conseguenze, tutte scritte qui sotto invece che
-- lasciate all'applicazione:
--   • il bucket è PRIVATO e con allowlist MIME ristretta (niente SVG/HTML,
--     stessa ragione di S-14 in 20260806160000);
--   • lettura e scrittura passano da `private.can_documenti()`, che esclude
--     il ruolo `driver` come già fa l'anagrafica clienti;
--   • ogni caricamento ed eliminazione lascia una riga in `public.audit_log`
--     (20260826214000), perché su questi dati «chi l'ha messo» e «chi l'ha
--     tolto» sono domande che prima o poi qualcuno pone davvero.

-- ─── 1. IL GATE DI RUOLO ────────────────────────────────────────────────────
-- Stesso insieme di `private.can_liste()` (admin|manager|agent, attivo, non
-- pending), ma funzione PROPRIA e non un riuso di quella.
--
-- Non è duplicazione per distrazione: sono due domande diverse — «può usare il
-- modulo Liste viaggio?» e «può vedere i documenti di identità?» — che oggi
-- hanno la stessa risposta e domani possono non averla più (restringere i
-- documenti ai soli admin/manager è una decisione plausibile; farlo su
-- `can_liste()` porterebbe con sé un modulo che non c'entra). È la stessa
-- ragione per cui `lib/permissions.js` tiene `canAccessListe` e
-- `canEditClient` separate pur avendo oggi lo stesso elenco di ruoli.
create or replace function private.can_documenti()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.active
      and coalesce(u.pending, false) = false
      and u.role = any (array['admin','manager','agent'])
  );
$$;

revoke all    on function private.can_documenti() from public, anon;
grant  execute on function private.can_documenti() to authenticated;

-- ─── 2. LA TABELLA ──────────────────────────────────────────────────────────
create table if not exists public.documenti_identita (
  id          uuid primary key default gen_random_uuid(),

  -- Il nome del passeggero come si cerca: «Cognome Nome», normalizzato da
  -- `components/documenti/nomeDaFile.js`. È testo e non una FK perché il
  -- passeggero può non essere in anagrafica (vedi il preambolo).
  passeggero  text not null check (length(trim(passeggero)) > 0),

  -- Collegamento FACOLTATIVO alla scheda cliente. `set null` e non `cascade`:
  -- eliminare una scheda dell'anagrafica non deve far sparire il documento
  -- archiviato, che è un atto separato e più grave.
  client_id   uuid references public.clients(id) on delete set null,

  tipo        text not null default 'passaporto'
              check (tipo in ('passaporto','carta_identita','patente','altro')),
  numero      text,

  -- La ragione per cui questo archivio vale più della somma dei suoi file:
  -- un passaporto scaduto scoperto al banco del check-in è una pratica persa.
  scadenza    date,

  -- Path dentro il bucket `documenti-identita`. `unique`: due righe che
  -- puntano allo stesso oggetto renderebbero l'eliminazione di una il
  -- danneggiamento silenzioso dell'altra.
  file_path   text not null unique,
  file_name   text not null,
  file_size   bigint,
  file_type   text,

  note        text,

  -- `set null` come su `audit_log.actor_id`: eliminare l'utente non cancella
  -- la traccia di chi ha caricato il documento.
  uploaded_by uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Ricerca per nome: l'elenco si filtra digitando un cognome. `lower()` perché
-- il confronto è case-insensitive come ovunque nell'app.
create index if not exists documenti_identita_passeggero_idx
  on public.documenti_identita (lower(passeggero));

-- Ordinamento e filtro «in scadenza»: l'indice parziale esclude le righe
-- senza scadenza, che sono proprio quelle che quella vista non deve mostrare.
create index if not exists documenti_identita_scadenza_idx
  on public.documenti_identita (scadenza) where scadenza is not null;

create index if not exists documenti_identita_client_id_idx
  on public.documenti_identita (client_id) where client_id is not null;

comment on table public.documenti_identita is
  'Archivio dei documenti di identità dei passeggeri: metadati. Il file vive '
  'nel bucket privato «documenti-identita», `file_path` è il collegamento. '
  'Accesso ristretto a private.can_documenti() (admin|manager|agent attivi e '
  'non pending): il ruolo driver è escluso, come dall''anagrafica clienti.';

-- ─── 3. `updated_at` ────────────────────────────────────────────────────────
-- Trigger e non `default now()`: il default vale solo all'insert, e una
-- correzione del numero di documento o della scadenza deve aggiornare la data.
create or replace function private.documenti_identita_touch()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;

revoke all on function private.documenti_identita_touch() from public, anon, authenticated;

drop trigger if exists documenti_identita_touch on public.documenti_identita;
create trigger documenti_identita_touch
  before update on public.documenti_identita
  for each row execute function private.documenti_identita_touch();

-- ─── 4. RLS SULLA TABELLA ───────────────────────────────────────────────────
alter table public.documenti_identita enable row level security;

drop policy if exists documenti_identita_select on public.documenti_identita;
create policy documenti_identita_select on public.documenti_identita
  for select to authenticated
  using ((select private.can_documenti()));

drop policy if exists documenti_identita_insert on public.documenti_identita;
create policy documenti_identita_insert on public.documenti_identita
  for insert to authenticated
  with check (
    (select private.can_documenti())
    -- `uploaded_by` non è decorativo: è metà della coppia che regge la
    -- policy di DELETE qui sotto. Senza questo vincolo un client potrebbe
    -- scriverci l'id di un altro, e con esso regalarsi o negarsi il diritto
    -- di cancellare la riga.
    and uploaded_by = (select auth.uid())
  );

drop policy if exists documenti_identita_update on public.documenti_identita;
create policy documenti_identita_update on public.documenti_identita
  for update to authenticated
  using ((select private.can_documenti()))
  with check ((select private.can_documenti()));

-- DELETE più stretto della scrittura: chi ha caricato il documento (un errore
-- proprio si corregge da soli) oppure manager/admin. Un agent non cancella il
-- documento caricato da un collega — è la stessa asimmetria che `clients` ha
-- fra scrittura (admin|manager|agent) ed eliminazione (admin|manager).
drop policy if exists documenti_identita_delete on public.documenti_identita;
create policy documenti_identita_delete on public.documenti_identita
  for delete to authenticated
  using (
    (select private.can_documenti())
    and (uploaded_by = (select auth.uid()) or (select private.is_manager_or_admin()))
  );

-- La tabella non è in realtime e non ha `origin_client`: l'archivio non è una
-- vista collaborativa in tempo reale come la bacheca o la chat, e chi carica
-- vede il proprio inserimento perché è lui a farlo.
revoke truncate on public.documenti_identita from authenticated;

-- ─── 5. IL BUCKET ───────────────────────────────────────────────────────────
-- 10 MB per file: una foto da smartphone non compressa arriva a 4-5 MB, e il
-- client comprime PRIMA di caricare (lib/comprimiImmagine.js, ~300 kB
-- tipici). Il tetto serve al caso che sfugge alla compressione — un PDF
-- scansionato ad alta risoluzione — non al caso comune.
--
-- MIME: le sole immagini che una fotocamera produce, più il PDF per le
-- scansioni. Niente SVG (è un documento che può contenere <script>, vedi
-- S-14 in 20260806160000), niente `application/octet-stream`: a differenza di
-- chat e allegati task, qui il formato atteso è noto in partenza e un file
-- che il sistema operativo non sa classificare non è un documento di
-- identità.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documenti-identita', 'documenti-identita', false, 10485760,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ─── 6. RLS SUGLI OGGETTI ───────────────────────────────────────────────────
-- A differenza di `task-files`, l'autorizzazione NON si deriva dal primo
-- segmento del path: lì il segmento è un `task_id` e la visibilità del file
-- rispecchia quella del task, qui il permesso è di modulo e vale per l'intero
-- bucket. Conseguenza pratica che vale la pena scrivere: l'upload avviene
-- PRIMA che esista la riga di metadati, quindi una policy che interrogasse
-- `documenti_identita` rifiuterebbe ogni primo caricamento.
drop policy if exists "documenti_identita_storage_select" on storage.objects;
create policy "documenti_identita_storage_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'documenti-identita' and (select private.can_documenti()));

drop policy if exists "documenti_identita_storage_insert" on storage.objects;
create policy "documenti_identita_storage_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documenti-identita' and (select private.can_documenti()));

drop policy if exists "documenti_identita_storage_delete" on storage.objects;
create policy "documenti_identita_storage_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documenti-identita'
    and (select private.can_documenti())
    and (owner_id = (select auth.uid())::text or (select private.is_manager_or_admin()))
  );

-- Nessuna policy di UPDATE sugli oggetti: un documento non si sovrascrive, si
-- carica di nuovo e si elimina il vecchio. L'assenza della policy È il
-- divieto, e rende impossibile il caso in cui il file cambia sotto una riga
-- di metadati che continua a dichiarare nome, dimensione e tipo di prima.

-- ─── 7. IL GATE «UTENTE ATTIVO» COMPRENDE IL NUOVO BUCKET ───────────────────
-- `storage_active_only` (20260827075128) è RESTRICTIVE e scritta come elenco
-- di bucket: per un bucket non nominato la prima disgiunzione è vera e la
-- policy non vincola nulla. Il nuovo bucket va quindi NOMINATO, altrimenti
-- resta fuori dal gate esattamente come `avatars` lo era prima di M-1.
--
-- Qui è ridondante — `can_documenti()` controlla già `active` e `pending` —
-- ed è voluto: è l'ultima riga di difesa se una policy futura su questo
-- bucket venisse scritta senza quel gate.
drop policy if exists "storage_active_only" on storage.objects;
create policy "storage_active_only" on storage.objects
  as restrictive for all to authenticated
  using (
    bucket_id not in ('task-files', 'chat-files', 'avatars', 'documenti-identita')
    or private.is_active_user()
  )
  with check (
    bucket_id not in ('task-files', 'chat-files', 'avatars', 'documenti-identita')
    or private.is_active_user()
  );
