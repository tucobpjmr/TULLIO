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
