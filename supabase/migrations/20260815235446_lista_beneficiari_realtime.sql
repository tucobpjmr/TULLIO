-- A-1 dell'audit del 16 agosto (stato/flusso dati, performance, UX).
--
-- `lista_beneficiari` non era pubblicata su `supabase_realtime`, e nessuna
-- delle due RPC che la scrivono (`aggiungi_beneficiario_lista`,
-- `rimuovi_beneficiario_lista`) tocca la riga padre in `liste_viaggio`.
-- Risultato: aggiungere o togliere un COINTESTATARIO non emetteva alcun
-- evento realtime, di nessun tipo.
--
-- Non è un dato di contorno: `LISTA_SELECT` (components/liste/listeApi.js)
-- incorpora `lista_beneficiari(client_id, clients(name))` in ogni riga
-- dell'elenco, e `intestazioneLista()` ne costruisce l'INTESTAZIONE della
-- lista — quella mostrata in testata, nel riepilogo cliente e nella copia
-- agente. Chi aggiungeva il cointestatario lo vedeva subito (il modulo Liste
-- ricarica a mano dopo ogni scrittura); ogni altro client connesso continuava
-- a mostrare l'intestazione vecchia finché non arrivava un evento su
-- `liste_viaggio`/`movimenti_lista` per altri motivi, o finché non si
-- ricaricava la pagina. Uno stato a schermo divergente dal database che non si
-- corregge da solo, su un documento che si stampa e si consegna.
--
-- La select è già consentita a chi può vedere le liste
-- (`lista_beneficiari_select` → `private.can_liste()`), quindi la
-- pubblicazione non allarga la superficie leggibile: Realtime applica le
-- stesse policy della tabella. Il predicato non dipende dalle colonne della
-- riga, quindi la REPLICA IDENTITY di default (la PK `lista_id, client_id`)
-- basta perché anche i DELETE superino il controllo — il consumatore non
-- legge il payload, gli serve solo sapere CHE qualcosa è cambiato.
--
-- Idempotente: `pg_publication_tables` è la stessa fonte che la verifica
-- dell'audit ha interrogato, e un secondo passaggio non deve fallire.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'lista_beneficiari'
  ) then
    alter publication supabase_realtime add table public.lista_beneficiari;
  end if;
end $$;
