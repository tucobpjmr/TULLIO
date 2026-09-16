# Archivio documenti di identità

I passaporti e le carte d'identità dei passeggeri: dove stanno, quanto spazio
occupano, chi li vede e come si porta dentro un archivio già esistente.

---

## 1. Perché una sezione a sé, e non una tab dell'anagrafica

Perché **un passeggero non è per forza un cliente.** Chi viaggia insieme al
titolare della pratica spesso non ha una riga in `clients`, e legare l'archivio
all'anagrafica avrebbe reso obbligatorio creare una scheda cliente per poter
archiviare un documento.

Il collegamento c'è comunque ed è facoltativo: `documenti_identita.client_id` è
una foreign key su `clients`, `on delete set null`. Eliminare una scheda
dell'anagrafica non fa sparire il documento archiviato — sono due atti diversi,
e il secondo è più grave.

---

## 2. Dove sta il file, e perché non nel database

| | dove | perché |
|---|---|---|
| Il file | bucket privato `documenti-identita` | 1000 file × ~300 kB |
| I metadati | `public.documenti_identita` | ~1000 righe, meno di 1 MB |

È lo stesso disegno di `task_files`, e la ragione è un errore già pagato una
volta: `users.photo_url` teneva le foto come data-URL base64 dentro la riga, e
`listAll()` se le ritrascinava dietro per tutto il team a ogni evento realtime.

**Con ~1000 documenti attesi, il file dentro Postgres significherebbe gigabyte
in un database che sul piano Free ne ha 500 MB.**

---

## 3. Il conto dello spazio

Il progetto sta sul piano **Supabase Free**: 1 GB di Storage in tutto,
condiviso con `task-files`, `chat-files` e `avatars`.

| | per file | × 1000 |
|---|---|---|
| Foto da smartphone, com'è | 2–5 MB | **2–5 GB** — non ci sta |
| Compressa 1600px / JPEG 0.8 | ~300 kB | **~300 MB** — ci sta |

La compressione avviene **nel browser, prima dell'upload**, in
`src/lib/comprimiImmagine.js`. I due numeri che la governano:

- `LATO_MASSIMO = 1600` — la banda MRZ di un passaporto è alta ~1/8 della
  pagina, quindi a 1600px occupa ~200px: i caratteri OCR-B restano
  distinguibili a occhio e in stampa. Sotto i 1200 si impastano.
- `QUALITA_JPEG = 0.8` — sotto questa soglia il JPEG mostra artefatti sui bordi
  netti del testo, che in un documento sono l'informazione.

**Non tutto si comprime**, e non è una mancanza: i PDF passano intatti (una
scansione rasterizzata perderebbe il testo selezionabile) e così gli HEIC, che
solo Safari decodifica. Per loro il limite è il tetto del bucket, 10 MB a file.

`npm run verifica:volumi` tiene la soglia a 3.000 documenti — ~900 MB, cioè il
tetto del piano Free. È l'unica soglia di quell'elenco che misura il **bucket**
invece di una query: superarla non rallenta niente, fa fallire il prossimo
upload.

---

## 4. Chi vede che cosa

| Azione | Admin | Manager | Agent | Driver |
|---|---|---|---|---|
| Vedere e aprire i documenti | ✅ | ✅ | ✅ | ❌ |
| Caricare e correggere | ✅ | ✅ | ✅ | ❌ |
| Eliminare un documento **proprio** | ✅ | ✅ | ✅ | ❌ |
| Eliminare un documento **altrui** | ✅ | ✅ | ❌ | ❌ |

Il gate è `private.can_documenti()` sul database e `canAccessDocumenti` in
`src/lib/permissions.js` — due livelli che devono dare la stessa risposta, e
solo il primo è quello che un utente non può aggirare.

Il driver è escluso come già dall'anagrafica clienti, e per la stessa ragione:
non ha accesso ai dati delle persone.

**Il bucket è privato.** Un documento si apre attraverso una URL firmata che
nasce all'apertura della scheda e scade dopo un'ora: non esiste un momento in
cui l'archivio è raggiungibile da chi non ha una sessione.

**Non c'è un cestino, di proposito.** L'eliminazione è definitiva: un cestino
sarebbe una seconda copia dello stesso dato sensibile, che continua a esistere
dopo che qualcuno ha chiesto di eliminarlo.

---

## 5. L'import massivo

Pensato per il caso d'uso che ha fatto nascere il modulo: una cartella con
~1000 file già nominati `COGNOME_NOME.jpg`.

1. **Documenti → Importa → Scegli la cartella.** Su mobile la scelta di una
   cartella non esiste: accanto c'è l'input per i singoli file.
2. **L'anteprima non è saltabile.** Ogni riga mostra il nome dedotto dal file e
   resta modificabile. `nomeDaFile` riconosce `_`, `-`, `.` e lo spazio come
   separatori, e toglie i suffissi dei duplicati (`(1)`, `_2`, `- copia`,
   `fronte`/`retro`) — così le due facciate dello stesso documento finiscono
   sullo stesso passeggero.
3. **Ciò che non riconosce lo dichiara.** `IMG_4821.jpg`, `DSC00931.JPG`,
   `Screenshot …`, `WhatsApp Image …` non producono un nome inventato: la riga
   resta evidenziata e **il pulsante di caricamento è bloccato** finché non la
   si completa. Un campo vuoto si nota; un nome sbagliato si conferma per
   distrazione, e correggerlo dopo significa mille righe nell'archivio.
4. **Il tipo si sceglie una volta per l'intero blocco** (passaporto, carta
   d'identità, patente, altro). Numero e scadenza si compilano dopo, dalla
   scheda del singolo documento.
5. **Si carica a blocchi di quattro**, con barra di avanzamento e possibilità di
   interrompere. L'interruzione si ferma **al confine di un blocco**: fermare
   quattro upload già partiti lascerebbe file caricati senza la loro riga.
6. **Un file rifiutato non ferma gli altri.** Il riepilogo finale dice quanti
   sono entrati, quanti no e perché, e quanto spazio ha risparmiato la
   compressione.

---

## 6. La scadenza è la ragione per cui l'archivio vale

Un passaporto scaduto scoperto al banco del check-in è una pratica persa.
Compilando il campo *Scadenza*, l'archivio risponde da solo:

| Stato | Quando | Dove si vede |
|---|---|---|
| **Scaduto** | la data è passata | pastiglia rossa, filtro «Scaduti» |
| **In scadenza** | entro 180 giorni | pastiglia ambra, filtro «Da rinnovare» |
| **Valido** | oltre | pastiglia verde |
| **Senza data** | il campo è vuoto | filtro «Senza data» |

**180 giorni non è una scelta di comodo**: molti paesi extra-Schengen (Stati
Uniti, Egitto, Thailandia, Emirati) esigono un passaporto valido almeno sei
mesi oltre la data di ingresso. Un documento che scade fra cinque mesi è
formalmente valido e praticamente inutilizzabile per metà delle destinazioni
vendute.

`Senza data` **non** è un sinonimo di `Valido`, ed è la distinzione che conta
subito dopo un import: è lo stato della maggioranza delle righe finché nessuno
le completa, e confonderlo con «tutto a posto» direbbe all'agenzia il contrario
di quello che sa.

---

## 7. Applicare la migrazione

Le migrazioni sono **due**, e vanno applicate in quest'ordine:

1. `supabase/migrations/20260916120000_documenti_identita.sql`
2. `supabase/migrations/20260916150000_storage_active_only_inclusione_vera.sql`

Committarle **non** significa averle applicate: su questo progetto le due cose
sono separate. Segui `MIGRAZIONI_SUPABASE.md`, in sintesi:

1. ⛔ **Non** `supabase db push`: rigiocherebbe 56 migrazioni già applicate.
2. Incolla i due file nell'SQL Editor della dashboard, in ordine (o applicali
   via MCP).
3. Registra le versioni:

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260916120000', 'documenti_identita'),
       ('20260916150000', 'storage_active_only_inclusione_vera')
on conflict (version) do nothing;
```

4. Verifica che il bucket esista e sia privato:

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'documenti-identita';
```

5. Verifica che il gate dello Storage non abbia più un elenco di bucket — la
   `qual` che torna dev'essere `(SELECT private.is_active_user())`, senza
   `bucket_id`:

```sql
select qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and policyname = 'storage_active_only';
```

Finché la migrazione non è applicata la sezione Documenti si apre e mostra un
errore di caricamento: il codice c'è, la tabella no.

### Due migrazioni, non una

Oltre a `20260916120000_documenti_identita.sql` va applicata anche
**`20260916150000_storage_active_only_inclusione_vera.sql`**, nello stesso
ordine. La seconda non riguarda i documenti: corregge la forma del gate
«utente attivo» su tutto lo Storage.

`storage_active_only` era scritta come **elenco di bucket nominati**, forma in
cui un bucket ASSENTE dall'elenco resta fuori dal gate. Il commento di
`20260827075128` dichiarava l'opposto — «un quarto bucket creato domani nasce
sotto il gate finché qualcuno non lo esclude esplicitamente» — e l'SQL non lo
faceva: la prova è questo stesso modulo, che ha dovuto nominare
`documenti-identita` a mano.

La seconda migrazione toglie l'elenco: `using ((select
private.is_active_user()))`, valido per `storage.objects` intera. Nessun
cambiamento di comportamento oggi — i quattro bucket erano tutti nominati — ma
il prossimo bucket nasce protetto invece che scoperto. Il dettaglio sta in
`SICUREZZA.md` § 2, e una regressione la ferma ora
`npm run verifica:convenzioni`.
