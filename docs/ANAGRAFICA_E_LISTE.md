# Anagrafica clienti e Liste viaggio: che cosa condividono

I due moduli non sono indipendenti: **usano la stessa tabella `clients`**.
Questo documento dice esattamente dove passa il collegamento, che cosa succede
modificando una scheda cliente, e quali protezioni ci sono oggi in app.

---

## 1. Il punto di contatto è uno solo: la riga cliente

```
clients (id, name, email, phone, address, city, notes)
   ▲                    ▲
   │ FK client_id       │ copia testuale del nome
   │                    │
liste_viaggio        tasks.client_id  ← testo libero, NON una foreign key
   │
movimenti_lista
```

- **Liste viaggio → cliente**: `liste_viaggio.client_id` è una foreign key su
  `clients.id`. Le liste non conservano il nome: lo leggono dalla scheda (la
  query è `select *, clients(name)`). Quindi il nome mostrato in elenco, nella
  testata del dettaglio, nel riepilogo per il cliente e nell'export Word è
  **sempre** quello dell'anagrafica, letto al momento.
- **Task → cliente**: `tasks.client_id` è una colonna `text` che contiene il
  nome scritto a mano o scelto dall'autocomplete. Non c'è vincolo: è una copia,
  e come tutte le copie può disallinearsi.

Non c'è nessun altro punto di contatto. Email, telefono, indirizzo, città e
note **vivono solo nell'anagrafica**: correggerli non ha alcun effetto sulle
liste viaggio.

---

## 2. Che cosa succede quando si modifica una scheda cliente

| Modifica | Effetto sulle liste viaggio | Effetto sui task |
| --- | --- | --- |
| email, telefono, indirizzo, città, note | **nessuno** | nessuno |
| **nome** | cambia l'intestazione di **tutte** le sue liste, cestino compreso, e di riepiloghi/documenti generati da lì in avanti | i task restano legati al **vecchio** nome finché non li si aggiorna |
| **eliminazione** | rifiutata dal database se esiste anche una sola lista (foreign key) | nessuno |

Due precisazioni che contano:

- I documenti **già** esportati o condivisi (Word, riepilogo copiato in
  WhatsApp) sono file: restano com'erano. Cambia ciò che si genera dopo.
- Le liste **nel cestino** sono archiviate, non cancellate: la loro foreign key
  regge, quindi tengono il cliente non eliminabile finché non vengono
  eliminate definitivamente.

---

## 3. La direzione opposta: il modulo Liste scrive nell'anagrafica

`modifica_lista(p_id, p_titolo, p_client_name)` — la RPC dietro "Modifica dati
lista" — quando riceve `p_client_name` esegue una `UPDATE clients SET name`.
Cioè: **correggere una lista può rinominare un cliente di tutta l'agenzia.**

Per questo il campo "Nome cliente" in quella modale nasce **bloccato** e serve
la spunta *"Rinomina il cliente in anagrafica"* per sbloccarlo. Senza spunta il
nome non viene inviato (`clientName: null` → la RPC lo lascia intatto) e si
modifica solo il **titolo**, che appartiene alla singola lista.

Regola pratica: **il titolo distingue le liste dello stesso cliente, il nome
identifica la persona.** Se due liste dello stesso intestatario vanno
distinte, si usa il titolo.

---

## 4. Perché in anagrafica ci sono schede che non sembrano clienti

`clients` contiene due popolazioni, entrambe legittime, arrivate da due import
diversi:

1. **Anagrafiche del CRM** — import Excel del gestionale precedente. Hanno
   contatti e, nelle note, i dati senza un campo dedicato (codice fiscale, CAP,
   provincia, regione, nazione) ripiegati una riga per colonna da
   `ClientImportModal`. È l'origine delle "descrizioni ereditate" che si
   vedevano in elenco.
2. **Intestatari dei buoni viaggio** — import dei documenti Word/Writer
   (`scripts/importa-liste/`). Il nome viene dal **nome del file**, che spesso
   descrive l'occasione invece della persona: `50° RICCARDO SCAMARCIO`,
   `ANGELA RICCI E MARCHETTI UMBERTO 50° COMPLEANNO`, `ALBANESE UMBERTO ANNO
   2025`.

Non è un errore da correggere in blocco: quel nome **è** l'intestazione del
buono viaggio, ed è così che lo cercano in agenzia. Rinominarlo per farlo
sembrare un'anagrafica cambierebbe l'intestazione della lista.

Se una di queste schede va davvero normalizzata (per esempio perché la persona
è già in anagrafica come cliente CRM), la strada è:

1. spostare le liste sul cliente giusto — oggi richiede un intervento SQL, non
   esiste un "cambia intestatario" in app;
2. solo dopo eliminare la scheda rimasta senza liste.

Farlo con un rename è la strada sbagliata: crea due schede per la stessa
persona o fonde due persone diverse.

---

## 5. Le protezioni presenti in app

Nell'**anagrafica clienti**:

- badge **"N liste viaggio"** sulle card e nel pannello del cliente — dice a
  colpo d'occhio quali schede sono anche l'intestazione di un buono viaggio
  (il conteggio include quelle nel cestino);
- filtri **Tutti / Con liste viaggio / Solo anagrafica**, per separare le due
  popolazioni quando servono separate;
- in modifica, un **avviso prima di salvare** quando il nome cambia: quante
  liste ne ereditano l'intestazione e quanti task lo citano;
- una spunta per **portarsi dietro i task** che citano il vecchio nome
  (`RENAME_CLIENT_IN_TASKS`), che tocca solo i task modificabili dall'utente —
  sugli altri la RLS rifiuterebbe comunque la scrittura;
- l'**eliminazione bloccata in partenza** per i clienti con liste, con il
  numero e la spiegazione, invece dell'errore di foreign key dopo la conferma;
- i **dati anagrafici ereditati** dall'import letti come scheda (etichetta +
  valore) nel pannello del cliente, e non più riversati troncati nella card. È
  solo un modo di mostrarli: le note sul database non vengono riscritte.

Nel modulo **Liste viaggio**:

- il nome cliente è modificabile **solo con spunta esplicita** (§3).

---

## 6. Residui noti dell'import (2026-07-27)

46 schede senza contatti e senza liste, tutte create il 27/07 dal primo giro
dell'import dei documenti: nomi con il prefisso non ripulito (`BUONO VIAGGIO
ABATANGELO MICAELA`, `VIAGGIO CITO PIA`), con la prima lettera mangiata
(`OTARISTEFANO COSIMO` per NOTARISTEFANO, `UCIFORA TAGLIENTE` per LUCIFORA,
`OZZE …` per NOZZE) o con l'anno in coda (`ALBANESE UMBERTO ANNO 2025`).

Le liste sono finite sulla variante corretta del nome, non su queste: sono
schede vuote, non hanno dati collegati e si eliminano senza conseguenze. Si
trovano con il filtro **Solo anagrafica**. Nessuna è stata rimossa in
automatico: è una cancellazione di dati e la decisione è dell'agenzia.

---

## 7. In sintesi

- Correggere **contatti, indirizzo, note**: sempre sicuro.
- Correggere il **nome**: si propaga alle liste (per costruzione) e va deciso
  guardando l'avviso; i task si portano dietro con la spunta.
- **Eliminare** un cliente con liste: non è possibile, e l'app lo dice prima.
- Distinguere due liste dello stesso cliente: **titolo**, non nome.
