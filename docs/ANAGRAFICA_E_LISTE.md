# Anagrafica clienti e Liste viaggio: che cosa condividono

I due moduli non sono indipendenti: **usano la stessa tabella `clients`**.
Questo documento dice esattamente dove passa il collegamento, che cosa succede
modificando una scheda cliente, e quali protezioni ci sono oggi in app.

---

## 1. Il punto di contatto: la riga cliente (titolare o cointestatario)

```
clients (id, name, email, phone, address, city, notes)
   ▲                    ▲                    ▲
   │ FK client_id       │ copia testuale      │ FK client_id
   │ (titolare)         │ del nome            │ (cointestatario)
   │                    │                     │
liste_viaggio ──────────┼──── tasks.client_id │
   │                    │  ← testo libero,    │
movimenti_lista         │    NON una FK       │
                         │                     │
                         └── lista_beneficiari ┘
```

Una lista ha **un** titolare (`liste_viaggio.client_id`, obbligatorio) e **zero
o più** cointestatari (`lista_beneficiari`, es. marito e moglie — vedi § 8).
Ciascuno ha una propria riga in `clients`, con la propria scheda.

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

Per questo il campo "Nome del titolare" in quella modale nasce **bloccato** e
serve la spunta *"Rinomina il titolare in anagrafica"* per sbloccarlo. Senza
spunta il nome non viene inviato (`clientName: null` → la RPC lo lascia
intatto) e si modifica solo il **titolo**, che appartiene alla singola lista.

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

1. **spostare** ogni sua lista sul cliente giusto — dal dettaglio della lista,
   bottone ⇄ "Sposta su un altro cliente" accanto al nome (§ 9);
2. solo dopo, se la scheda-evento è rimasta senza liste, eliminarla (bloccata
   finché ne ha ancora, § 5).

Farlo con un **rename** è la strada sbagliata: crea due schede per la stessa
persona o fonde due persone diverse. Lo spostamento invece non tocca il nome
di nessuno dei due clienti: cambia solo a quale scheda è intestata quella
lista.

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
- Ricondurre una lista al cliente giusto senza toccare nomi: **⇄ Sposta su un
  altro cliente** (§ 9), non un rename.

---

## 8. Cointestazione: liste con più di un beneficiario

Prima di questa funzione (migrazione `20260802214946`), l'unico modo per
gestire una lista di marito e moglie era un'unica scheda cliente con il nome
combinato — è la spiegazione dei nomi come `ANGELA RICCI E MARCHETTI UMBERTO
50° COMPLEANNO` o `ANTONELLO GIASI E VINCI ROSALBA 25°` che si vedono ancora in
anagrafica (38 al momento in cui è stata scritta questa nota). Funziona per
l'intestazione della lista, ma nessuno dei due ha una scheda propria, e se uno
dei due esiste anche come cliente separato altrove la lista non gli compare.

**Modello**: `liste_viaggio.client_id` resta il **titolare** — invariato,
obbligatorio, tutto quello che c'era prima continua a funzionare senza
modifiche. `lista_beneficiari` aggiunge i **cointestatari**: righe
`(lista_id, client_id)`, zero o più per lista, mai il titolare stesso. "Chi è
collegato a questa lista" = titolare **e** cointestatari, non uno o l'altro.

**Dove si vede**:
- nel dettaglio della lista, chip col nome di ciascun cointestatario accanto al
  titolare, con "+ cointestatario" per aggiungerne uno (cliente esistente o
  nuovo, creato lì) e "✕" per rimuoverlo;
- ovunque prima si leggeva solo il nome del titolare — elenco liste, scheda
  cliente, riepilogo per il cliente, copia agente Word — ora si legge
  "MARIO ROSSI e MARIA BIANCHI" (o con più nomi, "…, … e …");
- nella **scheda di un cointestatario**: la lista compare anche lì, con lo
  stesso saldo, non solo nella scheda del titolare;
- nella ricerca del modulo Liste: cercare il nome di un cointestatario trova la
  lista, non solo cercando il titolare;
- nel badge "N liste viaggio" e nel blocco eliminazione dell'anagrafica (§ 4):
  contano anche le liste dove il cliente è cointestatario, non solo titolare.

**Effetto collaterale sulle query, da sapere prima di scriverne di nuove**:
`lista_beneficiari` ha la chiave primaria `(lista_id, client_id)`, cioè due
sole colonne entrambe foreign key verso due tabelle diverse. È esattamente la
forma in cui PostgREST riconosce una **tabella-ponte**, e da quel momento
deduce da sé una relazione molti-a-molti `liste_viaggio ↔ clients` che nessuno
ha dichiarato. Sommata alla foreign key diretta `liste_viaggio.client_id →
clients.id`, le strade per arrivare da una lista a `clients` diventano due: un
`select=*, clients(name)` non dice quale, e PostgREST rifiuta **tutta** la
query con `PGRST201` — "Could not embed because more than one relationship was
found for 'liste_viaggio' and 'clients'". Non è un caso limite: è successo, ed
è comparso come "Non riesco a caricare le liste" sull'intera pagina.

La regola per chiunque scriva una query nuova: da `liste_viaggio` l'embed del
titolare va sempre nominato — `clients!liste_viaggio_client_id_fkey(name)` —
mentre l'embed annidato `lista_beneficiari → clients` resta nudo, perché parte
dal ponte stesso, dove di relazione ce n'è una sola. Vale anche nel verso
opposto, il giorno in cui una query partisse da `clients` per raggiungere le
liste. `src/test/listeEmbedTitolare.test.js` blocca la regressione sui quattro
metodi che leggono le liste; i test con Supabase mockato **non** se ne
accorgerebbero da soli, perché l'errore nasce nel server e non nel client.

**Che cosa NON fa**: non c'è un limite al numero di cointestatari (non è
"sempre esattamente 2"): zero o più, quindi copre anche un gruppo, non solo
una coppia. Promuovere un cointestatario a titolare *si può* fare dall'app —
è "Sposta su un altro cliente" (§ 9) scegliendo proprio quel cointestatario.

**Chi può farlo**: stesso perimetro del resto del modulo — admin, manager,
agent; il driver non vede il modulo. Rimuovere un cointestatario passa da una
funzione a privilegi elevati (come l'eliminazione definitiva di una lista):
niente rimozione diretta che bypassi lo storico, la voce in "Storico modifiche"
è garantita nella stessa transazione.

**Backup**: "Strumenti dati → Scarica/Carica backup" include le
cointestazioni. Un backup scaricato prima di questa funzione non le conteneva
(non esistevano ancora): ricaricarlo non le tocca, semplicemente non ne
aggiunge.

**Le 38 schede con nome combinato esistenti** non sono state toccate: separarle
richiede di riconoscere due nomi propri dentro una stringa libera scritta in
modo non uniforme, un'operazione che se automatizzata rischia di tagliare un
nome a metà. Restano una migrazione manuale possibile, non necessaria: con § 9
la strada pulita è "Sposta su un altro cliente" verso il primo dei due (già
esistente in anagrafica o creato al volo rinominando la scheda-evento), poi
"+ cointestatario" per il secondo — non più il rename-sul-posto che serviva
prima che esistesse lo spostamento.

---

## 9. Spostare una lista su un altro cliente (cambiare il titolare)

Dal dettaglio della lista, bottone **⇄** accanto al nome: sposta QUESTA lista
su un cliente diverso, già esistente in anagrafica. Non tocca il nome di
nessuno dei due — non è un rename, è un cambio di FK
(`liste_viaggio.client_id`). Utile in particolare per ricondurre un
intestatario-evento (§ 4) alla persona vera già in anagrafica come cliente
CRM, senza passare da SQL a mano.

**Differenza con "Modifica dati lista" (rinomina, § 3)**:

| | Rinomina (§ 3) | Sposta su un altro cliente (§ 9) |
| --- | --- | --- |
| Che cosa cambia | il nome della riga cliente | quale riga cliente è titolare |
| `client_id` | invariato | cambia |
| Effetto su altre liste dello stesso cliente | sì, tutte | no, solo questa |
| Il vecchio nome/cliente | non esiste più (rinominato) | resta intatto, solo senza questa lista |

**Solo clienti esistenti**: il selettore non offre "+ Nuovo cliente…" come le
altre modali del modulo — se la destinazione non esiste ancora, l'azione
giusta è rinominare il cliente attuale (§ 3), non crearne uno nuovo per poi
spostarcisi.

**Promozione di un cointestatario**: se scegli come nuovo titolare qualcuno
che è già cointestatario di questa stessa lista, l'app lo dichiara prima del
click ("verrà tolto dai cointestatari") e lo fa: tolto da cointestatario,
diventa titolare, entrambi i passaggi tracciati nello storico. È il modo per
correggere "titolare e cointestatario erano invertiti" senza doverlo fare a
mano in due passaggi.

**Chi può farlo**: stesso perimetro del resto del modulo — admin, manager,
agent; il driver non vede il modulo. Funzione a privilegi elevati sul
database (come rimuovere un cointestatario): niente scrittura diretta che
bypassi lo storico.

**Il cliente rimasto senza liste** dopo uno spostamento non viene eliminato in
automatico: resta in anagrafica, lo si trova col filtro "Solo anagrafica"
(§ 6) e si elimina da lì quando si è sicuri che non serva più.

## 10. Come cerca la ricerca (e perché sembrava rotta)

Tre punti dell'app cercano fra gli stessi nomi: l'anagrafica clienti,
l'elenco del modulo Liste viaggio e la ricerca globale della lente. Fino a
ora ognuno lo faceva a modo proprio, con una sottostringa secca
(`nome.toLowerCase().includes(query)`). Sui dati di questa anagrafica non
basta, per la ragione descritta al § 4: metà delle righe non sono nomi
regolari, e nessuna convenzione è garantita.

**Caso segnalato**: `COLUCCI GIANNICOLA` compare in anagrafica col badge
"1 lista viaggio", ma cercandolo nell'elenco liste non si trovava nulla e la
pagina rispondeva *«Nessuna lista qui. Crea la prima con "+ Nuova lista"»*.
La lista esisteva: era **ESAURITA**, e il filtro di default dell'elenco è
**Attive**. La ricerca funzionava, il filtro la escludeva, e nessun elemento
della pagina lo diceva — il messaggio di elenco vuoto suggeriva perfino di
crearne una nuova, cioè di duplicare una lista che c'era già.

**Che cosa fa ora l'elenco liste**: la ricerca gira su tutti e quattro gli
insiemi (Attive, Esaurite, Tutte, Cestino) anche se se ne mostra uno solo. I
risultati che il filtro nasconde vengono dichiarati, con un bottone che porta
dove sono: *"Altri risultati per «colucci» fuori da «Attive»: Esaurite (1)"*.
Vale anche quando l'elenco NON è vuoto — cercando `COLUCCI` fra le attive si
vedono le liste attive e non si sospetterebbe la quarta, esaurita. A elenco
vuoto il messaggio dice che cosa non ha trovato e dove, invece di proporre di
creare.

**Come confronta il testo** (`src/lib/searchUtils.js`, condiviso dalle tre
ricerche):

| Digitando | Si trova | Perché prima no |
| --- | --- | --- |
| `colucci gia` | `COLUCCI GIANNICOLA` | (funzionava) |
| `gia colucci` | `COLUCCI GIANNICOLA` | l'ordine cognome/nome non è una regola: convivono `COLUCCI GIANNICOLA` ed `ELENA GIANCIPPOLI` |
| `d amato`, `d’amato`, `damato` | `D'AMATO PATRIZIA` | apostrofo, apice tipografico da tastiera mobile, elisione |
| `dellacqua` | `DELL'ACQUA CARLO` | idem |
| `nicolo` | `NICOLÒ …` | accenti |
| `fam scuro` | `FAM. SCURO TEODORO` | punteggiatura |
| `colucci massafra` | il cliente COLUCCI di MASSAFRA | i termini possono stare su campi diversi |

La regola è: **tutti** i termini digitati devono comparire, in qualunque
ordine, su qualunque campo, ignorando accenti e punteggiatura. Il confronto
avviene anche sul testo con gli spazi rimossi (è ciò che fa funzionare
`dellacqua`), quindi un termine può accavallarsi su due parole
(`rossimaria` trova `ROSSI MARIA`): falso positivo accettato di proposito.

**Non è la chiave d'identità.** `chiaveCliente` in
`src/lib/chiaveCliente.js` continua a NON riordinare le parole: là serve a
decidere se due schede sono la stessa persona, e scambiare l'ordine fonderebbe
le liste di due persone diverse. Qui si allarga solo ciò che l'utente riesce a
trovare.

L'ordine delle parole è però l'**unico** asse su cui le due differiscono, e da
M-4 (audit del 25 agosto) lo si vede nel codice: `normalizzaTesto` è
`chiaveCliente` in minuscolo, non una seconda definizione di cosa si ignora.
Prima erano quattro funzioni scritte a mano (`chiaveNome` in `clientNotes.js`,
`normName` in `ClientImportModal`, `chiaveCliente` nello script di import,
`normalizzaTesto` qui) che si dichiaravano gemelle mentre la punteggiatura le
divideva in due famiglie: lo script considerava `FAM. SCURO TEODORO` e
`FAM SCURO TEODORO` lo stesso cliente e ne riusava l'id, l'app li teneva
distinti e la scheda dell'uno non mostrava i task dell'altro.

**Ricerca globale (lente)**: cercava le liste con criteri più stretti del
modulo — solo titolare, titolo e note interne, **senza i cointestatari**.
Quindi `BIANCHI` trovava la lista dentro il modulo Liste e non la trovava
nella ricerca globale, cioè proprio dove si cerca quando non si sa dove
guardare. Ora cerca anche fra i cointestatari, e la riga del risultato mostra
l'intestazione completa (`ROSSI MARIO e MARIA BIANCHI`) invece del solo
titolare: una lista trovata per cointestatario deve mostrare il nome che l'ha
fatta trovare.

**Il badge dell'anagrafica non dice lo stato.** "1 lista viaggio" significa
"esiste una lista collegata a questa scheda", titolare o cointestatario,
attiva, esaurita o nel cestino (il tooltip distingue solo il cestino). Non è
un badge di liste *attive*: per lo stato si apre la scheda o si guarda
l'elenco del modulo.
