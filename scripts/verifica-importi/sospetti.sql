-- scripts/verifica-importi/sospetti.sql
--
-- I MOVIMENTI CHE POTREBBERO AVER PERSO IL SEPARATORE DELLE MIGLIAIA.
-- Rimedio sui dati per C-1 dell'audit di codebase del 31 agosto.
--
-- Si esegue a mano, una volta, dalla dashboard Supabase → SQL Editor. Non è in
-- CI e non deve entrarci: è la bonifica di un difetto chiuso, non un presidio
-- da tenere acceso. Verificata su PostgreSQL 16 con dati finti che riproducono
-- la corruzione (vedi «Come è stato chiuso C-1» in
-- docs/AUDIT_CODEBASE_2026-08-31.md).
--
-- ─── COSA QUESTA QUERY NON PUÒ FARE, E VA LETTO PRIMA DI USARLA ────────────
--
-- **Non può dimostrare che un movimento sia sbagliato.** Un importo corrotto
-- da C-1 è un numero perfettamente valido: `1.250,00` digitato è diventato
-- `1.25` salvato, e a database `1.25` è indistinguibile da un movimento
-- legittimo di un euro e venticinque centesimi.
--
-- Non c'è nemmeno una testimonianza indipendente di ciò che è stato digitato:
-- `lista_history` sembrerebbe il posto giusto, ma `mov_snapshot()`
-- (20260716114424) costruisce la voce di storico a partire dal `p_importo` GIÀ
-- interpretato — cioè registra lo stesso valore corrotto. Il testo originale
-- non esiste da nessuna parte.
--
-- Questa query produce quindi **candidati da far guardare a chi conosce le
-- pratiche**, ordinati per forza dell'indizio. Il verdetto è umano: si apre la
-- lista, si confronta il saldo con quello che il cliente ha effettivamente
-- versato, e si corregge DALL'APP — la modifica passa da
-- `modifica_movimento_lista`, quindi resta tracciata in `lista_history` come
-- una correzione e non come un ritocco silenzioso al database.
--
-- ⚠️ NON correggere con una UPDATE diretta: salterebbe RLS, storico e
-- `origin_client`, e il saldo cambierebbe sotto gli occhi di chi ha la lista
-- aperta senza che nessun evento realtime lo dica.
--
-- ─── I DUE INDIZI ─────────────────────────────────────────────────────────
--
-- Un importo che ha perso un gruppo di migliaia vale circa un millesimo di
-- quello inteso: `1.250,00 → 1,25`, `8.500,00 → 8,50`, `12.345,67 → 12,35`
-- (l'ultimo perché `numeric(12,2)` arrotonda `12.345`). I candidati stanno
-- perciò sotto le 1.000 unità — che è però anche dove stanno i movimenti
-- piccoli legittimi. La zona di atterraggio da sola non basta: servono i
-- testimoni.
--
--   descrizione  la descrizione contiene un numero scritto con il punto delle
--                migliaia ("SALDO PRATICA 1.250,00"). È l'indizio più forte:
--                l'operatore ha scritto la cifra due volte e una delle due non
--                è passata dal parser, quindi la riga porta con sé la prova.
--
--   scala        il movimento è di due ordini di grandezza sotto la MEDIANA
--                degli ALTRI movimenti della stessa lista. Un buono viaggio
--                con versamenti da 1.200 e 800 euro e un movimento da 1,25 è
--                anomalo di suo, indipendentemente da C-1.
--
-- Le righe con entrambi gli indizi vanno guardate per prime. Una lista di
-- piccole spese vere (caffè, bolli, fotocopie) non ha né l'uno né l'altro e
-- non compare: è il caso che tiene onesto il rapporto.

with indiziati as (
  select
    m.id,
    m.lista_id,
    m.data_movimento,
    m.descrizione,
    m.importo,
    alt.mediana_altri,
    -- Un numero con il punto delle migliaia scritto nella descrizione.
    (m.descrizione ~ '\d{1,3}\.\d{3}(,\d{1,2})?')          as indizio_descrizione,
    (alt.mediana_altri is not null
       and alt.mediana_altri > 0
       and abs(m.importo) * 100 < alt.mediana_altri)       as indizio_scala
  from public.movimenti_lista m
  -- LATERAL e non una window function: `percentile_disc` è un'aggregata
  -- ordered-set e Postgres rifiuta `OVER` su di essa («OVER is not supported
  -- for ordered-set aggregate»). Il LATERAL ha anche il vantaggio di escludere
  -- la riga stessa dal calcolo: su una lista di due movimenti la mediana
  -- sarebbe altrimenti trascinata proprio dal candidato che deve smascherare.
  -- Su una lista di UN solo movimento `mediana_altri` resta NULL e l'indizio
  -- «scala» non scatta — corretto: non c'è niente con cui confrontare.
  --
  -- `percentile_disc` e non `percentile_cont`: la seconda interpola fra due
  -- valori e per farlo lavora in `double precision`, cioè restituirebbe un
  -- float da una colonna che è `numeric(12,2)` — cioè proprio il tipo che su
  -- un importo non si usa (e `round(double precision, int)` non esiste
  -- nemmeno). `percentile_disc` ritorna UNO DEI VALORI OSSERVATI e ne conserva
  -- il tipo: qui serve un termine di paragone, non una statistica esatta.
  left join lateral (
    select percentile_disc(0.5) within group (order by abs(m2.importo)) as mediana_altri
    from public.movimenti_lista m2
    where m2.lista_id = m.lista_id
      and m2.deleted_at is null
      and m2.id <> m.id
  ) alt on true
  where m.deleted_at is null
    -- La zona di atterraggio di un importo che ha perso le migliaia.
    and abs(m.importo) < 1000
)
select
  c.name                              as cliente,
  l.titolo,
  l.stato,
  i.data_movimento,
  i.descrizione,
  i.importo                           as importo_salvato,
  i.importo * 1000                    as se_avesse_perso_le_migliaia,
  round(i.mediana_altri, 2)           as mediana_altri_movimenti,
  concat_ws(' + ',
    case when i.indizio_descrizione then 'descrizione' end,
    case when i.indizio_scala       then 'scala'       end)  as indizi,
  i.lista_id,
  i.id                                as movimento_id
from indiziati i
join public.liste_viaggio l on l.id = i.lista_id
join public.clients       c on c.id = l.client_id
where l.deleted_at is null
  and (i.indizio_descrizione or i.indizio_scala)
-- Prima le righe con due indizi, poi le più recenti: sono quelle di cui in
-- agenzia si ricorda ancora l'importo vero.
order by
  (i.indizio_descrizione::int + i.indizio_scala::int) desc,
  i.data_movimento desc;

-- ─── QUANTO È GRANDE IL PROBLEMA ──────────────────────────────────────────
-- Da eseguire a parte, per sapere su che scala si sta guardando prima di
-- aprire l'elenco qui sopra.
--
--   select
--     count(*)                                               as movimenti_totali,
--     count(*) filter (where abs(importo) < 1000)            as nella_zona_di_atterraggio,
--     count(*) filter (where descrizione ~ '\d{1,3}\.\d{3}') as con_migliaia_in_descrizione
--   from public.movimenti_lista
--   where deleted_at is null;
