-- C-1 (e A-3) dell'audit di architettura e sicurezza del 2 settembre.
--
-- ─── LA SITUAZIONE ─────────────────────────────────────────────────────────
--
-- `public.segnala_errore_client()` (20260901120000) è `SECURITY DEFINER`,
-- quindi non attraversa la RLS che rende `public.error_reports` append-only —
-- «nessuna policy di insert, e con la RLS attiva l'assenza di policy è già il
-- divieto» vale per chi passa dalla tabella, non per chi passa da qui. Ed è
-- concessa ad `anon`, cioè al ruolo della chiave pubblicabile, che vive nel
-- bundle di produzione ed è per costruzione nota a chiunque apra l'app.
--
-- Il corpo non poneva alcun limite: i campi sono `text` (illimitati) e non
-- c'era alcun tetto di frequenza. Un ciclo di `POST /rest/v1/rpc/
-- segnala_errore_client` con la chiave anon e uno `p_stack` da qualche
-- centinaio di kB riempiva il database — e su questo progetto il piano è il
-- Free per scelta dichiarata (`B-2`/`ST-14` del 7 agosto, accettati il 12):
-- 500 MB. Quando finiscono non smette di funzionare `error_reports`, smettono
-- TUTTE le scritture dell'applicazione. La seconda conseguenza è più
-- silenziosa e altrettanto definitiva: la tabella esiste perché il codice
-- `VD-…` dettato al telefono possa essere CERCATO, e righe inventate la
-- rendono incercabile.
--
-- ─── PERCHÉ IL RAGIONAMENTO DI PRIMA NON BASTAVA ───────────────────────────
--
-- La 20260901120000 argomenta il rischio sul CONTENUTO («non deve contenere
-- PII oltre a quella già presente in users») e sulla LETTURA («lettura: soli
-- admin»). Sono entrambi corretti e restano validi. La variabile mancante è
-- il VOLUME — che è esattamente quella che il progetto aveva già considerato
-- quattro giorni prima, il 28 agosto (20260828100000), togliendo ad `anon` una
-- funzione di sola LETTURA perché offriva «ricognizione gratuita». Qui la
-- funzione scrive, e aveva tenuto il grant.
--
-- ─── IL GRANT AD `anon` RESTA ──────────────────────────────────────────────
--
-- Deliberatamente, e questa migrazione non contraddice la precedente: un crash
-- può avvenire prima del login — è la finestra che l'ErrorBoundary di
-- `main.jsx` copre da solo — e «un errore che non riesce a segnalare SE STESSO
-- perché richiederebbe un login sarebbe un controsenso». Si delimita ciò che
-- quel grant permette, non lo si toglie.
--
-- ─── LE TRE DIFESE, E PERCHÉ SERVONO TUTTE E TRE ───────────────────────────
--
-- 1. TETTI DI LUNGHEZZA → bound sulla singola riga (~5,5 kB nel caso peggiore).
-- 2. LIMITE DI FREQUENZA → bound sul RITMO di scrittura.
-- 3. TETTO SUL NUMERO DI RIGHE → bound sulla TABELLA.
--
-- ⚠️ Il terzo non è ridondante rispetto ai primi due, ed è il solo che chiuda
-- davvero lo scenario da 500 MB. Con i soli tetti di lunghezza e un limite di
-- 10 righe al minuto, un flusso sostenuto scrive comunque ~14.400 righe al
-- giorno da ~5,5 kB — ottanta megabyte al giorno, il piano Free saturo in meno
-- di una settimana, e la potatura a 90 giorni non taglia nulla di ciò che è
-- stato scritto oggi. Il tetto sul numero di righe rende quello scenario
-- impossibile a prescindere dal ritmo: 5.000 righe × ~5,5 kB ≈ 28 MB, e il
-- valore non dipende da quanto a lungo qualcuno insiste.
--
-- Il primo e il secondo restano necessari: senza i tetti di lunghezza 5.000
-- righe non sono 28 MB ma qualunque cosa; senza il limite di frequenza il
-- tetto sulle righe verrebbe raggiunto in pochi secondi e la tabella
-- conserverebbe solo il rumore dell'ultimo minuto, cioè il registro
-- resterebbe inutilizzabile anche restando piccolo.

-- ─── INDICE PER IL RAMO AUTENTICATO DEL LIMITE ─────────────────────────────
-- Il conteggio filtra per (user_id, at): `error_reports_at_desc` copre il ramo
-- anonimo (che filtra su `at` con `user_id is null`, e in un btree i NULL sono
-- indicizzati) ma non questo.
create index if not exists error_reports_user_at
  on public.error_reports (user_id, at desc);

create or replace function public.segnala_errore_client(
  p_code       text,
  p_origin     text,
  p_message    text,
  p_stack      text default null,
  p_url        text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
-- Invariato rispetto alla 20260901120000, di proposito: i riferimenti nel
-- corpo sono già tutti qualificati con lo schema, quindi passare a `''` non
-- cambierebbe nulla se non il diff da rileggere.
set search_path to 'public'
as $$
declare
  -- Frequenza. I due secchi NON sono simmetrici, e l'asimmetria è il punto:
  -- un utente autenticato è identificabile e risponde del proprio traffico,
  -- quindi il limite è PER UTENTE; un anonimo non lo è, quindi il secchio è
  -- UNO SOLO per tutti — è quello che delimita ciò che chiunque abbia la
  -- chiave pubblica può fare, ed è per questo che è il più stretto dei due.
  --
  -- 60/minuto per utente: un ciclo di errori in una scheda lasciata aperta
  -- deve poter LASCIARE TRACCIA della propria ripetizione. È la ragione per
  -- cui `registraSegnalazione` non passa dal dedup dei toast
  -- (src/lib/errorReporting.js) — «un error_reports con meno righe di quante
  -- ne servano a capire "succede in continuazione" sarebbe un difetto
  -- peggiore di qualche riga ripetuta in più» — e questa migrazione non deve
  -- rimangiarsela: un errore al secondo la racconta ampiamente.
  --
  -- 10/minuto per tutti gli anonimi insieme: un crash prima del login è raro
  -- (la finestra è quella fra il caricamento del bundle e il mount dell'app),
  -- quindi il traffico legittimo qui è di qualche riga al giorno, non al
  -- minuto.
  c_max_autenticato constant int := 60;
  c_max_anonimo     constant int := 10;
  -- Ritenzione. Novanta giorni è l'orizzonte oltre il quale un codice dettato
  -- al telefono non viene più cercato; 5.000 righe è il tetto che rende il
  -- caso peggiore calcolabile (vedi il preambolo). Il primo dei due che morde
  -- vince, ed è quasi sempre il tempo.
  c_giorni_ritenzione constant int := 90;
  c_max_righe         constant int := 5000;

  v_me      uuid := (select auth.uid());
  v_nome    text;
  v_recenti int;
  v_soglia  timestamptz;
begin
  if p_code is null or p_message is null then
    return;
  end if;

  -- Oltre il limite si esce in SILENZIO: `return` e non `raise`. Siamo già
  -- dentro il percorso che gestisce un errore non gestito (vedi il preambolo
  -- di src/lib/errorReporting.js), e un rifiuto rumoroso genererebbe il
  -- secondo errore che quel file esiste per non produrre — richiudendo il
  -- cerchio su se stesso. Il chiamante è fire-and-forget per costruzione e
  -- non guarda l'esito.
  if v_me is null then
    select count(*) into v_recenti
      from public.error_reports
     where user_id is null and at > now() - interval '1 minute';
    if v_recenti >= c_max_anonimo then return; end if;
  else
    select count(*) into v_recenti
      from public.error_reports
     where user_id = v_me and at > now() - interval '1 minute';
    if v_recenti >= c_max_autenticato then return; end if;
  end if;

  if v_me is not null then
    select name into v_nome from public.users where id = v_me;
  end if;

  -- `left()` e non un rifiuto: una segnalazione TRONCATA resta utile — il
  -- codice, l'origine, il messaggio e le prime righe dello stack sono ciò con
  -- cui la si cerca e la si riconosce — mentre una segnalazione RIFIUTATA non
  -- lo è. `left()` su NULL torna NULL, quindi i tre campi opzionali non hanno
  -- bisogno di un ramo proprio.
  insert into public.error_reports (code, user_id, user_name, origin, message, stack, url, user_agent)
  values (
    left(p_code, 64),
    v_me,
    v_nome,
    left(coalesce(p_origin, 'sconosciuto'), 64),
    left(p_message, 500),
    left(p_stack, 4000),
    left(p_url, 500),
    left(p_user_agent, 300)
  )
  -- Lo stesso errore React, in DEV, passa sia dall'ErrorBoundary sia
  -- dall'handler globale (vedi la nota sul doppio avviso in
  -- errorReporting.js): la seconda scrittura con lo stesso `code` è un
  -- no-op, non un duplicato da distinguere a valle.
  on conflict (code) do nothing;

  -- ─── POTATURA OPPORTUNISTICA ─────────────────────────────────────────────
  -- Una chiamata su cento paga la pulizia. È la stessa forma che
  -- `giaSegnalato` usa in src/lib/errorReporting.js per potare la sua Map, e
  -- la ragione per farla QUI è la stessa che vale là: non richiede che
  -- qualcuno se ne ricordi. In più, su questo progetto non c'è alternativa —
  -- `pg_cron` non è disponibile sul piano Free, e una potatura affidata a un
  -- workflow esterno sarebbe un secondo posto da tenere allineato.
  --
  -- Sta DOPO l'insert e quindi dentro il ramo che ha superato il limite di
  -- frequenza: sotto attacco le chiamate respinte escono prima, ma quelle
  -- ammesse (fino a dieci al minuto) continuano a farla scattare — un giro di
  -- potatura ogni una decina di minuti, che sul tetto di 5.000 righe è
  -- abbondante.
  if random() < 0.01 then
    delete from public.error_reports
     where at < now() - make_interval(days => c_giorni_ritenzione);

    -- Tetto sul NUMERO di righe. La sottoquery dà l'istante della
    -- (c_max_righe + 1)-esima riga più recente e sfrutta `error_reports_at_desc`;
    -- con meno righe di così torna NULL, e `at < null` non seleziona nulla —
    -- che è il comportamento voluto, senza bisogno di un ramo esplicito.
    -- Il confronto è STRETTO, quindi righe che condividono esattamente quel
    -- timestamp restano: un piccolo eccesso, dalla parte giusta.
    select at into v_soglia
      from public.error_reports
     order by at desc
     offset c_max_righe limit 1;
    if v_soglia is not null then
      delete from public.error_reports where at < v_soglia;
    end if;
  end if;
end $$;

revoke execute on function public.segnala_errore_client(text,text,text,text,text,text) from public;
grant   execute on function public.segnala_errore_client(text,text,text,text,text,text) to anon, authenticated;

comment on function public.segnala_errore_client(text,text,text,text,text,text) is
  'Porta di scrittura di public.error_reports (20260901120000). Concessa ad '
  '`anon` di proposito — un crash può avvenire prima del login — e per questo '
  'delimitata da tre difese che servono tutte e tre (C-1 dell''audit del 2 '
  'settembre): tetti di lunghezza sui campi, limite di frequenza (60/min per '
  'utente autenticato, 10/min per TUTTI gli anonimi insieme) e potatura '
  'opportunistica a 90 giorni con tetto di 5.000 righe. È il tetto sulle '
  'RIGHE a rendere calcolabile il caso peggiore (~28 MB): gli altri due da '
  'soli non chiudono lo scenario di esaurimento del piano Free.';
