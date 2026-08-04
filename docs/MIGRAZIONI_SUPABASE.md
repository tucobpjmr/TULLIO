# Migrazioni Supabase — procedura

> ⛔ **Non lanciare `supabase db push` su questo progetto.** Oggi rigiocherebbe
> 56 migrazioni già applicate. Il perché e la procedura corretta sono qui sotto.

## Il problema: la storia nel repo non coincide con quella sul database

Il progetto Supabase `tullio` (`vmxvnxsqfisucugcpqlc`) tiene l'elenco delle
migrazioni applicate in `supabase_migrations.schema_migrations`. La CLI decide
cosa applicare confrontando quella tabella con i **prefissi di versione** dei
file in `supabase/migrations/`: per `20260630_categories_table.sql` la versione
è `20260630`, tutto ciò che precede il primo `_`.

Buona parte delle migrazioni di questo progetto è stata applicata a mano (SQL
Editor della dashboard, o `apply_migration` via MCP) e registrata con un
timestamp completo a 14 cifre — `20260630221241 categories_table` — mentre il
file corrispondente nel repo si chiama `20260630_categories_table.sql`, cioè
versione `20260630`. Sono la stessa migrazione, ma per la CLI sono due cose
diverse: la versione del file non compare in `schema_migrations`, quindi
risulta "da applicare".

**Oggi 56 file su 73 sono in questa condizione.** Il loro contenuto è già vivo
sul database; solo il numero di versione non combacia. Un `db push` proverebbe
a rigiocarli tutti, in blocco, sulla produzione. Molti sono idempotenti e non
farebbero danni, ma non tutti: fra questi ci sono `DROP POLICY`,
`CREATE OR REPLACE FUNCTION` che riporterebbero indietro funzioni poi evolute,
e migrazioni di dati.

Il caso concreto che ha portato a scrivere questa nota: le due migrazioni di
hardening del modulo Liste Viaggio (`20260728190000`, `20260728190100`) sono
state committate e mergiate in `main`, ma **non erano mai arrivate al
database**. Per giorni il modulo è rimasto in produzione senza controlli di
ruolo: qualsiasi utente autenticato poteva chiamare `reset_completo` e
svuotare tutte le liste. Il codice corretto in repo non è una garanzia — conta
solo ciò che è applicato.

## Procedura corretta

### 1. Scrivere il file con un timestamp completo a 14 cifre

```
supabase/migrations/20260729120000_descrizione_breve.sql
                    └── YYYYMMDDHHMMSS
```

Mai il formato corto `YYYYMMDD_`: è l'origine del disallineamento, e due
migrazioni nello stesso giorno collidono sulla stessa versione.

### 2. Applicare la migrazione

Dalla dashboard (SQL Editor) o via MCP `apply_migration`. **Non** `db push`.

Prima di applicare qualcosa che tocca RLS o funzioni `SECURITY DEFINER`,
verificare l'effetto con un dry-run transazionale che impersona un utente per
ruolo — vedi la sezione seguente.

### 3. Registrare la versione

Se hai applicato via SQL Editor, la riga non viene scritta da sola:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260729120000', 'descrizione_breve')
on conflict (version) do nothing;
```

### 4. Verificare

```sql
-- la migrazione risulta applicata?
select version, name from supabase_migrations.schema_migrations
order by version desc limit 5;
```

E far girare gli advisor (MCP `get_advisors`, sia `security` sia
`performance`): le modifiche a RLS e funzioni ne accendono facilmente di nuovi.

Se la migrazione aggiunge o modifica una RPC chiamata dal frontend, chiudere
con:

```bash
npm run verifica:rpc
```

## Controllo automatico dello scarto

`scripts/verifica-rpc/` verifica che ogni RPC chiamata dal frontend esista
davvero sul database. Gira via `.github/workflows/verifica-rpc.yml`:

- **a ogni push su `main`** che tocchi `src/`, `supabase/migrations/` o lo
  script stesso — è il momento in cui lo scarto nasce, ed è `main` che Vercel
  manda in produzione. Sulle pull request no: lì il codice precede
  legittimamente la migrazione;
- **ogni giorno alle 6:30 UTC**, perché uno scarto può nascere anche senza
  toccare il repository (una migrazione applicata a metà, una funzione
  rimossa a mano);
- **a richiesta**, con "Run workflow" o `npm run verifica:rpc`. Serve dopo
  aver applicato la migrazione che ha fatto scattare l'allarme: applicarla non
  tocca il repository, quindi nulla farebbe ripartire il controllo da solo.

Nasce dal terzo episodio della stessa famiglia: la migrazione `20260729200000`
(note interne delle liste) era in `main` da giorni ma non era mai arrivata al
database. Il codice era corretto, lint e test passavano, e salvare una nota
rispondeva `Could not find the function public.modifica_note_lista(p_id,
p_note) in the schema cache`. Nessun controllo poteva accorgersene: lo scarto
non era dentro il repository, ma fra repository e database.

Come funziona, in breve:

- legge dai sorgenti i nomi e gli argomenti delle chiamate `supabase.rpc(...)`;
- interroga ciascuna funzione in **GET** con la sola chiave anon. PostgREST
  accetta le funzioni `VOLATILE` solo in POST e rifiuta la GET con 405 *prima*
  di eseguirle: la sonda non esegue mai nulla, nemmeno su produzione;
- distingue `PGRST202` (funzione assente) da `405`/`42501` (funzione presente,
  non interrogabile così).

Il controllo è sui **nomi degli argomenti**, non solo sul nome della funzione:
PostgREST risolve una RPC per nome *e* nomi dei parametri, e per l'app un
argomento rinominato sul database è indistinguibile da una funzione mai
applicata — stesso `PGRST202`, stesso errore a schermo. Perciò la sonda ripiega
su una GET senza parametri **solo** quando l'estrattore dichiara la firma
incompleta (spread, chiavi calcolate). Farlo sempre, com'era all'inizio,
annullava il controllo su ogni funzione con un `DEFAULT` su tutti i parametri:
`crea_lista` è una di queste, e sarebbe risultata presente comunque.

Quando una funzione non è classificabile (5xx, rate limit, risposta inattesa)
l'esito la nomina come non verificata invece di contarla fra quelle a posto.
Non fa fallire il controllo — non è uno scarto — ma non è nemmeno un via
libera, e la differenza va detta.

Prima di dare un verdetto la sonda si mette alla prova su casi di cui conosce
già la risposta — l'API risponde? una funzione inventata risulta assente? —
e se non li supera si dichiara **inconcludente** e non fallisce, invece di
segnalare venti funzioni sparite perché è cambiato PostgREST. Un controllo che
grida al lupo viene ignorato, e allora tanto vale non averlo.

Quando invece fallisce sul serio, l'output nomina le RPC mancanti e il file da
cui sono chiamate: la causa è quasi sempre una migrazione in
`supabase/migrations/` mai applicata.

> Il controllo copre le funzioni, non le tabelle, le colonne o le policy: una
> migrazione che tocca solo quelle passa inosservata. Resta il passo 4 a mano.

## Dry-run: verificare una policy senza rischiare i dati

Le policy RLS si testano impersonando un utente reale dentro una transazione.
Schema di base:

```sql
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<uuid-utente>', 'role', 'authenticated')::text,
  true
);
select count(*) from tabella_sotto_esame;   -- quante righe vede davvero
reset role;
```

Per le funzioni distruttive **non passare la stringa di conferma reale**:
il controllo di ruolo gira prima di quello sulla conferma, quindi una conferma
volutamente sbagliata distingue già i due esiti senza toccare un solo dato.

- errore `insufficient_privilege` → il gate di ruolo ha bloccato (atteso);
- errore `check_violation` sulla conferma → il gate di ruolo **non** ha
  bloccato: la falla è aperta.

## Lo scarto opposto: il repository indietro rispetto al database

Finora questo documento parla di migrazioni committate ma non applicate. Esiste
anche il verso contrario, ed è meno visibile: migrazioni **applicate** al
database di cui nel repository non c'è nessun file. Nessun controllo le trova —
`verifica:rpc` interroga il database, e sul database quelle funzioni ci sono. Il
danno si vede solo quando qualcuno cerca di capire *perché* una funzione è fatta
in un certo modo e non trova niente da leggere.

Il SQL applicato non è perduto: `supabase_migrations.schema_migrations` conserva
il testo esatto di ogni migrazione registrata nella colonna `statements`.

```sql
select statements[1] from supabase_migrations.schema_migrations
 where version = '20260716114424';
```

Ricostruire il file da `pg_proc` non è la stessa cosa e va evitato: darebbe lo
stato **attuale** della funzione, cioè come l'hanno lasciata le migrazioni
successive, non quello che la migrazione faceva. `statements` dà il testo
originale, verificabile con `md5(statements[1])` contro il file recuperato.

Il file va salvato col nome `<version>_<name>.sql` preso da `schema_migrations`:
con il timestamp completo a 14 cifre, la migrazione risulta già registrata e un
eventuale `db push` la salta invece di rigiocarla.

Recuperate così le sette migrazioni del modulo Liste viaggio
(`20260713174309`, `20260716114424`, `20260716114544`, `20260718111131`,
`20260718112551`, `20260726225334`, `20260727215507`). Restano da esaminare una
per una una decina di righe più vecchie il cui `name` non corrisponde a nessun
file: quasi tutte sono con ogni probabilità gli stessi file disallineati della
sezione seguente, salvati sotto un altro titolo, ma il confronto per contenuto
non lo conferma da solo.

## Recuperare l'allineamento (quando ci sarà tempo)

I 56 file disallineati si sistemano una volta sola, senza toccare il database:
per ciascuno, rinominare il file col timestamp completo con cui la migrazione
risulta registrata in `schema_migrations`. Da quel momento `db push` torna a
essere un'operazione sicura. Finché non è fatto, resta valido l'avviso in
testa a questo documento.

## Backup prima di un intervento su dati vivi

Un backup nel database stesso è immediato e non passa dalla rete:

```sql
create schema if not exists backup_<modulo>_<yyyymmdd>;
revoke all on schema backup_<modulo>_<yyyymmdd> from public, anon, authenticated;
create table backup_<modulo>_<yyyymmdd>.<tabella> as select * from public.<tabella>;
```

Verificare i conteggi contro le tabelle originali prima di procedere, e
rimuovere lo schema quando l'intervento è consolidato.
