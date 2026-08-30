-- A-1 dell'audit del 30 agosto: «tabella intera in memoria, filtro nel
-- browser» è il vero soffitto di scalabilità dell'anagrafica. `ClientiView`
-- scarica `clients` per intero (`useClientiCompleti`) e filtra con
-- `lib/searchUtils.js` in memoria — corretto oggi (818 righe), ma O(N) su
-- ricerca, filtro E ordinamento, e la soglia realistica è 5.000-10.000 righe
-- (docs/CHANGELOG.md, verifica-volumi/volumi.js aveva già la soglia scritta
-- il 23 agosto: «clients, max 3000 … Serve anche unaccent/pg_trgm per non
-- perdere la normalizzazione di searchUtils»).
--
-- Questa migrazione sposta solo la RICERCA sul database (la prima tappa che
-- l'audit indica come piccola e indipendente): il browsing senza query resta
-- il modello attuale, corretto fino alla soglia sopra.
--
-- ── PERCHÉ UNA COLONNA GENERATA E NON `ilike` SU `name`/`city`/… DIRETTO ────
-- `lib/searchUtils.js` normalizza accenti, apostrofi e punteggiatura prima di
-- confrontare («d amato» trova «D'AMATO», «FAM. SCURO» = «FAM SCURO»): un
-- `ilike` sulle colonne grezze perderebbe quella normalizzazione, la stessa
-- differenza già documentata e ACCETTATA per l'autocomplete
-- (`Clients.cerca()`, dove è un compromesso ragionevole per un suggerimento
-- rapido). Per l'anagrafica — lo strumento con cui si CERCA davvero una
-- scheda — perdere quella normalizzazione sarebbe una regressione, non un
-- compromesso: è per questo che qui arrivano `pg_trgm` E `unaccent` insieme,
-- come il rilievo del 23 agosto già anticipava.
--
-- `chiave_ricerca()` è la stessa trasformazione di `chiaveCliente`/
-- `normalizzaTesto` (minuscolo, accenti tolti, punteggiatura → spazio),
-- riscritta in SQL. `unaccent()` di base è STABLE (dipende dal dizionario
-- configurato), un indice funzionale richiede IMMUTABLE: il wrapper è il
-- pattern standard per usarlo in un'espressione indicizzata — il dizionario
-- 'unaccent' non cambia sotto un progetto in esecuzione, quindi la
-- dichiarazione è sicura in pratica.
--
-- Due colonne generate, non una: `testo_ricerca_attaccato` (senza spazi)
-- replica `idx.attaccato` in `searchUtils.indicizza` — il fallback per i
-- cognomi elisi («dellacqua» deve trovare «DELL'ACQUA», che normalizzato è
-- «dell acqua», CON lo spazio: senza questa seconda colonna un ilike
-- sostringa non l'avrebbe mai trovato). Verificato su dati di prova prima di
-- applicare qui: senza la colonna attaccata, «dellorto» non trovava
-- «Dell'Orto» pur trovandolo `searchUtils` lato client.
--
-- ── PERCHÉ UNA RPC E NON UN FILTRO POSTAGE-REST DIRETTO ─────────────────────
-- La ricerca è AND fra i termini digitati, OR fra le due colonne per
-- ciascuno (stessa semantica di `matchIndice`). Comporlo con `.or()` di
-- postgrest-js richiederebbe interpolare il termine digitato dentro la
-- mini-sintassi di quel filtro (virgole e parentesi hanno un significato
-- lì): un termine con quei caratteri altererebbe il filtro stesso. La RPC
-- costruisce il predicato con `format('%L', …)`, che quota il valore come
-- letterale SQL — l'input dell'utente non è mai codice, a differenza di una
-- stringa di filtro assemblata lato client.
--
-- `language plpgsql`, NON `security definer`: gira con i permessi di chi
-- chiama, quindi la RLS di `clients_select` (`auth.role() = 'authenticated'`)
-- si applica esattamente come su una `select` normale — nessun bypass.

create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

create or replace function public.chiave_ricerca(testo text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(regexp_replace(
    lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(testo, ''))),
    '[^a-z0-9]+', ' ', 'g'
  ))
$$;

alter table public.clients
  add column if not exists testo_ricerca text
  generated always as (
    public.chiave_ricerca(name) || ' ' || public.chiave_ricerca(email) || ' ' ||
    public.chiave_ricerca(city) || ' ' || public.chiave_ricerca(phone) || ' ' ||
    public.chiave_ricerca(notes)
  ) stored;

-- Non può riferire `testo_ricerca` (Postgres non ammette una colonna generata
-- che ne referenzi un'altra): ricalcola la stessa espressione e la comprime.
alter table public.clients
  add column if not exists testo_ricerca_attaccato text
  generated always as (
    replace(
      public.chiave_ricerca(name) || ' ' || public.chiave_ricerca(email) || ' ' ||
      public.chiave_ricerca(city) || ' ' || public.chiave_ricerca(phone) || ' ' ||
      public.chiave_ricerca(notes),
      ' ', ''
    )
  ) stored;

create index if not exists clients_ricerca_trgm
  on public.clients using gin (testo_ricerca extensions.gin_trgm_ops);
create index if not exists clients_ricerca_trgm_attaccato
  on public.clients using gin (testo_ricerca_attaccato extensions.gin_trgm_ops);

-- `count(*) over()` calcola il totale PRIMA del `limit` finale (le window
-- function si valutano prima di LIMIT): la UI può quindi mostrare «12 di 47»
-- senza una seconda query di conteggio.
--
-- Verificato su dati di prova (non su questo commit — dati sintetici, rimossi
-- dopo il test): «damato»/«dellorto» trovano le schede con l'apostrofo,
-- «mario rossi» trova «Rossi Mario» (ordine libero), un termine con `'`, `%`
-- o `,` non altera il predicato (via `format('%L', …)`), e con
-- `enable_seqscan off` il piano usa `Bitmap Index Scan` su entrambi gli
-- indici trigram — a poche righe Postgres sceglie comunque una scansione
-- sequenziale, com'è corretto: l'indice serve quando la tabella cresce, non
-- prima.
create or replace function public.cerca_clienti(termini text[], limite integer default 50)
returns table (
  id uuid, name text, email text, phone text, address text, city text, notes text,
  created_at timestamptz, totale bigint
)
language plpgsql
stable
set search_path = ''
as $$
declare
  cond text := '';
  t text;
  pattern text;
begin
  foreach t in array termini loop
    pattern := '%' || t || '%';
    cond := cond || format(' and (testo_ricerca ilike %L or testo_ricerca_attaccato ilike %L)', pattern, pattern);
  end loop;
  return query execute format(
    'select id, name, email, phone, address, city, notes, created_at, count(*) over() as totale
     from public.clients where true %s order by name, id limit %L',
    cond, limite
  );
end;
$$;

revoke all on function public.cerca_clienti(text[], integer) from public, anon;
grant execute on function public.cerca_clienti(text[], integer) to authenticated;
