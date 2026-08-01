# Import massivo delle liste viaggio storiche

Procedura per portare in VoyageDesk le ~600 liste viaggio conservate come
documenti Word/Writer (una lista per file), senza reinserire a mano i
movimenti e senza perdere righe per strada.

Lo strumento è `scripts/importa-liste/`: legge i documenti e produce il file
JSON che il modulo Liste viaggio sa già caricare da **Strumenti dati → Carica
backup**. Non tocca il database: la scrittura resta un gesto esplicito dentro
l'app, con il conteggio mostrato prima di confermare.

---

## 1. In breve

```bash
# 1. dall'app: Liste viaggio → Strumenti dati → Scarica backup
#    (serve per riconoscere i clienti già in anagrafica)

# 2. converti i documenti
node scripts/importa-liste/index.js ~/Documenti/liste \
  --clienti ~/Download/backup_liste_viaggio_2026-07-31.json \
  --out ~/Scrivania/import-liste

# 3. leggi ~/Scrivania/import-liste/report.csv

# 4. dall'app: Liste viaggio → Strumenti dati → Carica backup
#    e scegli liste-da-importare.json
```

Tempo tipico: pochi secondi per la conversione, un caricamento per blocco.
L'intervento manuale si riduce alla revisione delle sole liste segnalate nel
report.

---

## 2. Che cosa legge lo strumento

**Formati**: `.odt`, `.ott`, `.docx`, `.dotx`, `.rtf`, `.txt`.

I `.doc` di Word 97-2003 non sono leggibili e vengono elencati come "NON
LETTO" nel report. Vanno convertiti prima, in blocco, con LibreOffice:

```bash
soffice --headless --convert-to docx --outdir ~/Documenti/liste ~/Documenti/liste/*.doc
```

**Intestatario della lista**: viene dal *nome del file*, perché nei documenti
non compare. `LISTA_ANGELO_BELMONTE.odt` → cliente `ANGELO BELMONTE`;
`BUONO_CASTELLANO_MARIA.docx` → `CASTELLANO MARIA`. Vengono tolti i prefissi
`LISTA`/`LISTE`/`BUONO`/`BUONI` (anche "lista viaggio di …") e i suffissi di
versione (`copia`, `rev`, `(2)`, un progressivo o un anno finale).

**Movimenti**: una riga per movimento, nella forma

```
18/10/24 CARRIERO MICHELE € 200,00 POS
22/10/2024 BONIFICO IN BNL DA CARRIERO MARIA GRAZIA € 200,00
26/05/26 PRENOTAZIONI EXPEDIA VARSAVIA E CRACOVIA - € 400,00
LISTA ESAURITA
```

- **Data**: `gg/mm/aa` o `gg/mm/aaaa`, anche con `.` o `-` come separatore.
  L'anno a due cifre è sempre `20xx`. Se una riga non ha data, eredita quella
  del movimento precedente e la cosa viene segnalata nel report.
- **Importo**: `€ 200,00`, `200,00 €`, `EURO 200,00`, `€ 1.250,00`.
  **Il segno meno indica l'uscita** (prenotazione, biglietto): `- € 400,00` o
  `€ -400,00`. Senza segno il movimento è un'entrata (versamento del cliente).
  Il saldo della lista in app è la somma dei movimenti, esattamente come nel
  documento.
- **Metodo di pagamento**: riconosce POS/bancomat/carta, bonifico, contanti,
  assegno. La parola viene tolta dalla descrizione solo se è l'ultima
  (`CARRIERO MICHELE POS` → descrizione `CARRIERO MICHELE`, metodo `pos`),
  mentre `BONIFICO IN BNL DA …` resta intero.
- **`LISTA ESAURITA`** (o `ESAURITA`, `LISTA CHIUSA`) su una riga a sé chiude
  la lista: viene importata con stato *esaurita*.
- **`SALDO`, `TOTALE`, `RESIDUO`, `DA VERSARE`…** a inizio riga sono totali
  già scritti a mano: vengono **ignorati**, altrimenti il saldo verrebbe
  contato due volte. Se la riga ignorata aveva un importo, il report lo dice.

Le liste sono lette anche quando sono scritte dentro una tabella: le celle di
una riga vengono ricomposte in un'unica riga di testo.

### Righe con più movimenti scritti insieme

Se nel documento due movimenti stanno sulla **stessa riga** invece che uno per
riga (es. `TIZIO € 200,00 POS CAIO € 150,00 CONTANTI`), lo strumento **non
tenta di separarli**: sono sempre segnalati come riga non riconosciuta,
motivo `N importi sulla stessa riga`, e finiscono — come ogni riga non
riconosciuta — nel report e nelle note interne della lista, pronti per essere
inseriti a mano.

La scelta è deliberata: capire dove finisce la descrizione del primo movimento
e comincia quella del secondo dipende da come è scritto il documento (un
separatore esplicito? uno spazio? un punto e virgola?), e indovinare qui vuol
dire rischiare di scambiare descrizione e importo tra due clienti diversi.
Meglio un intervento manuale in più che un saldo sbagliato in silenzio.

Se nei tuoi documenti questo caso è frequente e segue **sempre lo stesso
schema** (per esempio i movimenti separati da `;`), segnalalo: si può
insegnare al parser quello schema specifico e farglieli separare in automatico
in sicurezza. Nel dubbio, la soluzione più rapida resta comunque mettere ogni
movimento sulla propria riga prima di lanciare l'import.

---

## 3. Che cosa succede alle righe che non torna

Nessuna riga viene buttata via in silenzio. Una riga che non corrisponde a
nessun formato riconosciuto (`vedi mail del 14/03 per il resto`, un appunto,
una data scritta a parole) finisce in **due** posti:

1. `righe-non-importate.txt`, con file e numero di riga;
2. le **note interne** della lista corrispondente, sotto l'intestazione
   `RIGHE NON IMPORTATE AUTOMATICAMENTE`.

Le note interne sono visibili al team dentro la lista e **non** compaiono nel
riepilogo condiviso con il cliente. Quindi, anche senza riaprire i documenti
originali, chi lavora la pratica vede che cosa manca e può aggiungerlo a mano.

---

## 4. Il report

`report.csv` (si apre in Excel, una riga per file) contiene:

| colonna | significato |
| --- | --- |
| `file` | percorso del documento di origine |
| `cliente` | intestatario dedotto dal nome del file |
| `stato` | `attiva` / `esaurita` / `NON LETTO` |
| `movimenti` | quanti movimenti sono stati riconosciuti |
| `saldo` | somma dei movimenti importati |
| `righe_non_importate` | quante righe sono finite nelle note |
| `avvisi` | i controlli di coerenza scattati |

Gli avvisi sono la lista corta di documenti da guardare a occhio:

- **lista marcata ESAURITA ma il saldo calcolato è ≠ 0** — quasi sempre un
  segno meno mancante nel documento originale: una lista chiusa deve tornare a
  zero. È il controllo più utile del lotto.
- **saldo negativo** — stessa causa, dalla parte opposta.
- **tutti i movimenti sono positivi** (su liste con più di un movimento) — se
  il documento conteneva delle uscite, non sono state riconosciute.
- **importo senza simbolo €** — l'importo è stato letto da un numero a fine
  riga, da confermare.
- **data assente, ereditata dal movimento precedente**.
- **riga ignorata come totale/riepilogo** — verifica che fosse davvero un
  totale e non un movimento.
- **nessun movimento riconosciuto nel file**.

La colonna `righe_non_importate` conta anche le righe con **più movimenti
scritti sulla stessa riga** (vedi sezione precedente): non essendo separabili
in automatico senza rischiare di scambiare descrizione e importo, vanno
sempre inserite a mano.

---

## 5. Perché si può ripetere l'import

Gli identificativi non sono casuali: sono UUID v5 calcolati dal percorso del
file (liste e movimenti) e dal nome normalizzato (clienti). La RPC
`importa_backup` inserisce con `ON CONFLICT (id) DO NOTHING`.

Conseguenza pratica: **correggi due documenti sbagliati, rigenera il JSON,
ricaricalo** — l'app aggiungerà solo ciò che manca, senza duplicare quello che
c'è già. `importa_backup` non cancella e non sovrascrive mai nulla: fa solo
merge.

Attenzione all'altra faccia della medaglia: se correggi una riga **già
importata**, il movimento a database non cambia (l'id esiste già). Le
correzioni su righe già caricate vanno fatte dall'app, o cancellando prima la
lista interessata (cestino → elimina definitivamente) e ricaricando.

Rinominare un file dopo l'import equivale a creare una lista nuova: i nomi dei
file vanno congelati prima di partire.

---

## 6. Clienti: evitare i doppioni in anagrafica

`clients` è l'anagrafica condivisa con il resto di VoyageDesk, non una tabella
del solo modulo Liste. Senza precauzioni, importare "ROSSI MARIO" creerebbe un
secondo cliente accanto a quello già presente.

Per questo si passa `--clienti <backup.json>`: dal backup scaricato dall'app
si prendono i clienti esistenti e, quando il nome coincide, si riusa il loro
id. Il confronto ignora maiuscole, punteggiatura, spazi doppi e accenti
(`Rossi, Mario` = `ROSSI MARIO`), ma **non** riordina le parole: `ROSSI MARIO`
e `MARIO ROSSI` restano due clienti distinti, perché fonderli d'ufficio
rischierebbe di unire le liste di due persone diverse.

Più file dello stesso intestatario diventano più liste sotto lo **stesso**
cliente; in quel caso ognuna prende come titolo il nome del file di origine,
così restano distinguibili nell'elenco.

---

## 7. Opzioni

```
node scripts/importa-liste/index.js <cartella> [opzioni]

  --out <cartella>       dove scrivere i risultati (default: ./import-liste)
  --clienti <file.json>  backup scaricato dall'app: riusa i clienti esistenti
  --dividi <n>           massimo n liste per file JSON (default: 250)
  --titolo-da-file       usa sempre il nome del file come titolo della lista
  --solo-report          analizza e scrive i report senza generare il JSON
```

`--solo-report` è il primo giro consigliato: si guarda il report, si sistemano
i documenti che danno avvisi, poi si genera il JSON.

`--dividi` esiste perché un unico payload da 600 liste viaggia in una sola
chiamata RPC: a 250 liste per blocco i file restano maneggevoli e, se un
caricamento va in timeout, si riprende dal blocco successivo senza rifare
tutto (i blocchi già caricati verrebbero comunque saltati per id).

---

## 8. Procedura consigliata, passo per passo

1. **Raccogli** tutti i documenti in una cartella (le sottocartelle vanno
   bene, vengono percorse ricorsivamente).
2. **Congela i nomi dei file**: sono l'intestatario e la chiave di
   riconoscimento fra un import e il successivo.
3. **Converti gli eventuali `.doc`** con LibreOffice (comando al punto 2).
4. **Scarica il backup** dall'app: Liste viaggio → Strumenti dati → Scarica
   backup. Conservalo: è anche la fotografia dello stato *prima* dell'import.
5. **Primo giro in sola analisi**:
   ```bash
   node scripts/importa-liste/index.js ~/Documenti/liste --solo-report --out ~/Scrivania/import-liste
   ```
6. **Apri `report.csv`**, ordina per la colonna `avvisi` e sistema nei
   documenti originali i casi segnalati (soprattutto i segni meno mancanti
   sulle liste esaurite).
7. **Genera il JSON**:
   ```bash
   node scripts/importa-liste/index.js ~/Documenti/liste \
     --clienti ~/Download/backup_liste_viaggio_2026-07-31.json \
     --out ~/Scrivania/import-liste
   ```
8. **Prova con poche liste prima di tutte**: copia 5-10 documenti in una
   cartella a parte, importa quelli, controlla in app che saldi, date e segni
   corrispondano ai documenti. Solo dopo carica il lotto completo.
9. **Carica** ogni `liste-da-importare*.json` da Strumenti dati → Carica
   backup, confermando il conteggio proposto.
10. **Verifica**: il totale delle liste in app deve corrispondere alla riga
    "Liste analizzate" stampata dallo strumento, meno gli eventuali file
    elencati come NON LETTO.

---

## 9. Cosa serve dal lato permessi

Il caricamento passa dalla RPC `importa_backup`, riservata ai ruoli
**admin / manager / agent** (migrazione
`20260728190100_hardening_liste_viaggio_ruoli.sql`). Va eseguito da un utente
con uno di quei ruoli; i driver non vedono affatto il modulo.

---

## 10. Codice e test

- `scripts/importa-liste/estrattore.js` — apre i documenti (lettore ZIP
  minimale per `.odt`/`.docx`, nessuna dipendenza esterna) e ne ricava il
  testo riga per riga.
- `scripts/importa-liste/parser.js` — funzioni pure: data, importo, metodo,
  intestatario, costruzione del payload.
- `scripts/importa-liste/index.js` — CLI, report, suddivisione in blocchi.
- `src/test/importaListe.test.js` — test (`npm test`) sui casi che cambiano
  segno o importo di un movimento: sono quelli che, sbagliati, diventerebbero
  un saldo cliente errato in produzione.
