# Audit architettura — 23 agosto 2026, secondo passaggio

Perimetro dichiarato: i cinque punti di sempre (architettura e struttura del
codice, sicurezza e gestione dati, stato e flusso dati, performance e
scalabilità, UX ed error handling). **Eseguito solo il punto 1** su richiesta
esplicita — «inizia concentrandoti sul punto 1 poi attendi istruzioni» — e
questo documento copre quello. I punti 2-5 restano da fare.

Fatto dopo la chiusura di A-2 e la richiusura di A-2 del primo passaggio dello
stesso 23 agosto, quindi su un repository in cui gli strumenti di verifica
(`lint`, `verifica:convenzioni`, `verifica:tipi`, `test`, `build`,
`verifica:bundle`) erano tutti verdi. **Un audit che parte da lì non cerca
difetti che uno strumento vede**: cerca le cose che nessuno strumento misura, e
tre dei sette rilievi qui sotto sono esattamente questo — un confine dichiarato
in un commento e non in una regola, un tetto che stava per essere sfondato senza
che nessuno lo sapesse, un criterio applicato a occhio da mesi.

⟦stato: 7/7 chiusi⟧

> **Sulla numerazione.** In questo documento il prefisso `A-` è una sequenza
> progressiva e **non** un livello di priorità: la priorità sta nella sua
> colonna. Gli altri audit del repository usano `C-/A-/M-/B-` come tiers, e la
> differenza è dichiarata qui invece di essere lasciata dedurre perché i
> riferimenti `A-3`/`A-4`/`A-5` sono già scritti dentro il codice
> (`eslint.config.js`, `styles/common.js`, `lib/realtime.js`,
> `scripts/verifica-convenzioni/`) e rinumerarli avrebbe reso false otto
> citazioni per allineare una convenzione tipografica.

---

## Executive summary

La struttura è in salute e non è un complimento generico: la separazione fra
componenti, hook, data layer e registry di scrittura **esiste davvero**, ed è
tenuta in piedi da regole ESLint scritte apposta (`no-restricted-imports`,
`no-restricted-properties`, `no-restricted-syntax`) invece che da disciplina.
Non ci sono rilievi critici, e non ce ne sono di Alta priorità che riguardino
la forma del codice.

Il difetto ricorrente è un altro, ed è lo stesso in tre punti diversi: **una
regola vera, scritta in un commento, che nessuno misura.** Il confine di
scrittura elencava quattro namespace su otto; il tetto del reducer era a sette
righe dalla rottura e nessuno lo sapeva; `styles/common.js` dichiara di
raccogliere «le forme che ricorrono in tre o più file» e quel criterio veniva
applicato confrontando i nomi, mentre sono i valori a dire se due forme sono la
stessa cosa. In tutti e tre i casi il codice era corretto **oggi**: quello che
mancava era ciò che impedisce al prossimo file di non esserlo.

Il rilievo più grave del passaggio, A-2, è invece un difetto vero e osservabile:
tre delle quattro tab del creatore di task in blocco riscrivevano a mano il
contratto di salvataggio senza un `try`, e un'eccezione a metà upload lasciava
la modale viva col bottone spento per sempre. Chiuso lo stesso giorno.

---

## Tabella delle priorità

| # | Priorità | Area | Rilievo | Dove |
|---|---|---|---|---|
| **A-1** ✔ | Alta | Confini / data layer | Il divieto di importare i namespace di dominio dai componenti ne copriva **4 su 8**, e la quarta superficie di scrittura non era dichiarata da nessuna parte | `eslint.config.js` · `lib/esitoScrittura.js` |
| **A-2** ✔ | Alta | Correttezza / UX | Le quattro tab del `BulkTaskCreator` citavano `useSalvataggio` in un commento senza importarlo: `busyRef` a mano, teardown ricopiato in quattro punti d'uscita, **nessun `try` in tre file su quattro** | `modals/bulk/*.jsx` |
| **A-3** ✔ | Media | Struttura | `state/reducer.js` a **543 righe effettive contro il tetto di 550** della propria deroga: sette righe dalla rottura della build | `state/reducer.js` · `eslint.config.js` |
| **A-4** ✔ | Media | Struttura / leggibilità | `lib/api.js` teneva insieme tredici namespace di dominio e il transport realtime, con le due metà del contratto `origin_client` ai due capi opposti del file | `lib/api.js` |
| **A-5** ✔ | Media | Stili | «Le forme che ricorrono in tre o più file stanno in `common.js`» era applicato confrontando i **nomi**: quattro forme identiche alla lettera in tre file ciascuna, e due riscritture di forme già promosse | `styles/common.js` · 9 file |
| **A-6** ✔ | Bassa | Struttura | Tassonomia mista delle cartelle: per tipo (`ui/`, `shell/`, `modals/`, `views/`) e per funzionalità (`tasks/`, `chat/`, `liste/`) insieme; la funzionalità «task» si stende su quattro cartelle | `src/components/` |
| **A-7** ✔ | Bassa | Igiene | `ConversationView` chiamava `useChatContext()` due volte nello stesso corpo; `README.md` dichiarava 1316 test contro i 1637 reali | `chat/ConversationView.jsx` · `README.md` |

---

## A-1 · Il confine di scrittura copriva metà dei namespace ✔

**Il rilievo, corretto in corsa.** Era partito come «manca del tutto una regola
che impedisca ai componenti di importare i namespace del registry». Provandola
su un file-sonda sono arrivati **due** errori invece di uno: la regola esisteva
già (`VIETATE_ENTITA_DELLO_STATE`) e copriva `Tasks`, `Notices`, `Clients`,
`Categories`. Il rilievo era sbagliato nella premessa e giusto nella sostanza:
i namespace con un proprietario fuori dai componenti sono **otto**, non quattro.

**Cosa mancava.** `Comments` e `MessageTemplates`, che hanno la loro entry in
`persistence.js` esattamente come gli altri quattro, più `Notifications` e
`Push`, che il reducer non scrive ma che appartengono a
`hooks/useNotifications.js` e `lib/push.js`. Nessuno dei quattro era importato
da un componente: **la regola non ha chiesto un refactor**, impedisce che il
primo call site sbagliato faccia scuola.

**La seconda metà.** Le superfici che scrivono sono **quattro, non tre**: oltre
ai tre registry dichiarati (core, chat, Liste) c'è il gruppo dei sedici
componenti che chiamano `lib/api.js` direttamente per ciò che il reducer non può
ospitare — Storage, Edge Function, preferenze personali, letture di pannello. È
legittimo e non usa `esitoScrittura()`, perché nessuno dei suoi metodi chiede
`CONTA_RIGHE` e quindi non c'è alcun conteggio da leggere. Il problema era che
non stava scritto da nessuna parte, e un elenco non scritto è un elenco che
cresce. Ora la nota è in `lib/esitoScrittura.js`, accanto al «tre registry» che
si legge per primo.

**Cosa NON è stato fatto, e perché.** Il rilievo proponeva anche un hook
`useRisorsaRemota` per i sedici call site diretti. Leggendoli uno per uno la
proposta non ha retto: `useAvatarSrc` annulla le risposte stantie per chiave
(più forte di un `useIsMounted`), `TaskHistoryPanel` è accoppiato a una
sottoscrizione realtime con `isCurrent`, l'effetto di `AdminTeamTab` è la
costruzione di una mappa in quattro righe con un guard `alive` e nessuno stato
di caricamento, e `chatReactions.js` non è affatto un fetch di componente. Uno
solo — `TaskAttachments` — ci sarebbe entrato: un'astrazione con un consumatore
è la stessa sovra-astrazione che questo audit contesta altrove.

## A-2 · Il contratto di salvataggio riscritto a mano, senza `try` ✔

Le quattro tab del `BulkTaskCreator` **nominavano `useSalvataggio` in un
commento** e ne riscrivevano a mano le tre garanzie: `busyRef` come freno al
doppio invio, `busy` di stato per il bottone, messaggio d'errore in linea. Il
teardown `busyRef.current = false; setBusy(false)` era ricopiato in ogni punto
d'uscita e **non stava in un `finally`**. Tre file su quattro non avevano un
`try`. Da lì seguivano due difetti, entrambi visibili solo sul percorso
d'errore e opposti l'uno all'altro:

1. **Congelamento permanente.** Un `throw` di `onCreate` o di
   `TaskFiles.upload` — la rete che cade a metà upload — non raggiunge nessuno
   dei teardown: il ref restava `true` per sempre e la guardia in testa
   rifiutava ogni tentativo successivo. Modale viva, bottone spento, nessun
   messaggio; l'unica uscita era ricaricare, perdendo i dati inseriti (in
   `ImportTab` il CSV **e tutta la mappatura delle colonne**).
2. **Secondo batch di task duplicate.** In `ManualTab`, dopo un upload fallito
   su task **già create**, il codice rimetteva `busyRef` a `false`: «Crea»
   tornava premibile e un secondo tentativo creava una serie identica.

I due casi sono esattamente il motivo per cui il contratto va tenuto in un
posto solo: `useSalvataggio` ha un `try` attorno a `esegui` per il primo, e il
terzo esito `{ avviso }` — che **non si azzera** — per il secondo.

Due decisioni emerse convertendo, tenute separate perché sono decisioni: il
guard di quantità («zero task da creare») sta nel **chiamante** e non dentro
`esegui`, perché per l'hook un ritorno senza errore è un successo e chiuderebbe
la modale senza aver scritto nulla; e la validazione **pre-volo** (allegati
oltre il limite del bucket) vive in uno stato suo, separato da `errore`, che
l'hook azzera all'inizio di ogni tentativo. Da qui anche `azzera()`, che spegne
l'errore ma **non** `avviso`: quel blocco esiste perché la scrittura è riuscita
a metà, e la cosa da fare non è riprovare — è chiudere.

Fissato da `src/test/bulkEsitoScrittura.test.jsx`, che guarda il **bottone** e
non uno stato interno: la differenza fra i due difetti è precisamente se quel
bottone torni premibile o no.

## A-3 · Il reducer a sette righe dal proprio tetto ✔

`eslint.config.js` conteneva l'unica deroga a `max-lines` della
configurazione: `src/state/reducer.js` con un tetto di 550 invece di 500,
motivata — bene — dal fatto che il reducer è UNO switch e che spezzarlo per
dimensione distribuirebbe su più file le transizioni di una sola macchina a
stati.

Quel commento diceva anche quando sarebbe scaduta:

> «Il tetto è 550 e non "nessun limite" […]. Se il reducer arriva lì, la
> domanda giusta non è alzare ancora il numero — è se una fetta di dominio
> meriti un reducer suo.»

Il file era a **543**. Sette righe, cioè un `case` medio: la prossima azione
avrebbe rotto la build, e la pressione in quel momento sarebbe stata di alzare
il numero.

**La risposta è stata quella scritta lì.** Sono uscite due fette:
`state/noticesReducer.js` (bacheca avvisi, 7 case) e
`state/messageTemplatesReducer.js` (template messaggi, 4 case). Il criterio con
cui sono state scelte è l'unico che conta: **toccano un solo campo dello state
ciascuna, e nessun case rimasto lo legge.** Il taglio segue un confine che
esisteva già; non spezza la macchina a stati su più file, che era la ragione
vera della deroga. Il reducer sta ora a **464 righe effettive** e obbedisce al
tetto di tutti gli altri — la deroga **non è stata abbassata, è stata
eliminata**: una deroga inutilizzata è una deroga che il prossimo file grande
eredita.

**Il rischio introdotto, e come è chiuso.** `baseReducer` interroga le fette
PRIMA del proprio switch, quindi il contratto è che una fetta risponda `null` —
non `state` — a ciò che non possiede. Una fetta che rispondesse `state` si
mangerebbe **ogni** azione dell'app, in silenzio: nessun errore, la UI smette
semplicemente di rispondere. Ed è un `return state` di troppo in un `default`,
cioè la cosa più naturale del mondo da scrivere in un reducer.
`src/test/reducerFette.test.js` fissa quel contratto, più il caso «nessun tipo
di azione è gestito da due file» (un case omonimo in due file sarebbe
ombreggiato dalla delega e non girerebbe mai) e il fatto che il pre-check
`ADMIN_ONLY_ACTIONS` continui a valere per le fette.

`src/test/persistenceGuards.test.js`, che legge i `case` dal **sorgente** del
reducer per verificare che il registry di persistenza non abbia entry morte,
ora legge i tre file: leggerne uno solo avrebbe dichiarato morte undici entry
vive — lo stesso difetto che quel blocco esiste per intercettare, rivolto contro
il test.

## A-4 · Due livelli nello stesso file, e un contratto spezzato in due ✔

`lib/api.js` (430 righe effettive) teneva insieme **tredici namespace di
dominio**, che dicono QUALI righe leggere e scrivere, e il **transport
realtime**, che dice COME arrivano gli aggiornamenti: nomi di canale, ciclo di
vita delle sottoscrizioni, presence, broadcast. Sono due assi che cambiano per
ragioni indipendenti — si aggiunge un'entità senza toccare i canali, e il naming
dei canali è cambiato senza toccare un'entità.

**La ragione decisiva però non è la dimensione.** Il contratto di
`origin_client` era spezzato fra i due capi dello stesso file: chi mette il tag
(`withOrigin`, riga 21) e chi lo legge per scartare l'eco della propria
scrittura (`subscribeToTable`, riga 1040) sono le due metà di una regola sola, e
per capire l'una bisognava aver già letto l'altra — mille righe più in là. In
`src/lib/realtime.js` sono contigue, ed è il motivo per cui `withOrigin` è
uscito insieme alle `subscribeTo*` invece di restare fra le trenta query che lo
usano: appartiene al protocollo, non alle scritture.

**L'ingresso resta `lib/api.js`**, che ri-esporta le tre `subscribeTo*`. Non è
un residuo ed è la parte discutibile del rilievo, quindi vale scriverla: il
data layer ha una porta sola, e sono i test a rendere la cosa concreta —
**ventiquattro file** sostituiscono `lib/api.js` con un doppio, e con due moduli
da sostituire ognuno di essi potrebbe essere giusto su una metà e sbagliato
sull'altra senza che nulla lo segnali. Il livello mescolato nel SORGENTE è
sparito; la superficie d'importazione è rimasta una. `api.js` è sceso a **386
righe effettive**.

## A-5 · Un criterio applicato a occhio ✔ (ridimensionato)

`src/styles/common.js` si dichiara in cima «gli oggetti di stile costanti che
ricorrono in **tre o più file**», e dice anche come ci si arriva: promuovendo
una forma già in uso, non scrivendone una nuova qui. È una buona regola, e il
progetto l'ha seguita — ma **confrontando i nomi**, che è l'unica cosa che si
può fare a occhio.

**Il rilievo come era stato formulato, e perché è stato ridimensionato.**
Partiva da tre numeri veri: ~823 costanti di stile, 196 nomi meccanicamente
numerati, `rowCenterBetween` definito in 27 file con 18 valori distinti. La
conclusione proposta era di promuovere in `tokens.js` una fabbrica
`testataSezione({…})`. Misurando invece di dedurre, quella conclusione non ha
retto:

- i 18 valori sono **forme genuinamente diverse** (marginBottom 6/8/12/16/20/24,
  con o senza wrap, con o senza bordo): la parte condivisa sono tre proprietà
  CSS, e una fabbrica per tre proprietà è una fabbrica che si legge peggio
  dell'oggetto;
- l'omonimia **non è un rischio di correttezza**: da `common.js` si importa il
  namespace (`stiliComuni.rowCenterBetween`), regola aggiunta come A-2 del 22
  agosto proprio per questo;
- e soprattutto: applicando il criterio del file ai **valori** invece che ai
  nomi, i candidati alla promozione erano **quattro**, non decine. La regola era
  stata seguita meglio di quanto il rilievo assumesse.

**Cosa è stato fatto.** Promosse le quattro forme che superavano la soglia
dichiarata: `testataModale` (era `rowCenterBetween` in `ClienteModal`,
`QuickAddTask`, `KeyboardHelpOverlay`), `rowCenterWrapGap6` (era
`rowCenterGap6` in tre file), `cardElevata` (era `boxR14` in tre file),
`areaScorrevole` (era `flex1`/`flex12` in tre file della chat). Corretti anche
i due file che riscrivevano alla lettera una forma che `common.js` **aveva
già** — il caso peggiore, perché chi cambia quella condivisa crede di averle
cambiate tutte.

**La parte che dura.** `npm run verifica:convenzioni` ha ora due controlli che
NEGANO, nella stessa famiglia di «lazy() senza boundary»: «forme di stile
identiche in 3+ file» e «forme già in common.js riscritte altrove», entrambi
attesi a **0**. Passano dall'AST e non da un'espressione regolare, perché qui
non si cerca una forma nel testo — si confrontano valori, e
`{display:"flex", gap:6}` e `{ gap: 6, display: 'flex' }` sono la stessa
costante. Il conteggio totale (**914** costanti-oggetto a livello di modulo
fuori da `src/styles/`) è riportato qui e **non** scritto in un documento
verificato: un conteggio scade a ogni componente nuovo, una proprietà no.

## A-6 · Tassonomia mista delle cartelle ✔

`src/components/` mescola due criteri: per tipo (`ui/`, `shell/`, `modals/`,
`views/`) e per funzionalità (`tasks/`, `chat/`, `liste/`, `clients/`,
`calendar/`, `dashboard/`, `notifications/`, `search/`, `admin/`). La
conseguenza concreta è che la creazione di task in blocco viveva in **tre
posti** — `modals/BulkTaskCreator.jsx`, `modals/bulk/` e il resto della
funzionalità in `tasks/` — mentre è una cosa sola.

**La causa è una parola.** «Modale» descrive come una cosa si PRESENTA, non
cosa fa: `modals/` non è una funzionalità, e ogni componente che ci finisce ci
finisce per la sua forma. È lo stesso errore di catalogare i libri per colore
della copertina — funziona finché non si cerca qualcosa.

**Cosa è stato fatto.** La regola è scritta in `docs/CLAUDE.md`, dove la legge
chi aggiunge il file successivo: se un componente appartiene a una
funzionalità, va nella cartella di quella funzionalità; `ui/` resta per ciò che
è davvero trasversale (nessuna conoscenza del dominio) e `shell/` per il guscio.
Primo caso di applicazione: `modals/BulkTaskCreator.jsx` + `modals/bulk/` →
**`tasks/bulk/`**, otto file, con i riferimenti aggiornati in `VoyageDeskInner`,
in sette file di test e nei due commenti che citavano `bulkStyles.js` per
percorso.

**Il momento del taglio non è casuale.** Quei file erano stati riscritti da A-2
poche ore prima: spostarli mentre erano ancora la cosa più fresca della
sessione costa una rilettura che è già stata fatta. È anche il criterio che la
regola prescrive per il resto — **si sposta un pezzo alla volta, quando lo si
sta già toccando per un'altra ragione**.

**Perché NON un rinominamento di massa.** Un `git mv` su tutti e otto i modali
rimasti produrrebbe un diff che nessuno rilegge, e soprattutto falsificherebbe
i riferimenti dei documenti di audit e degli handoff precedenti, che descrivono
dov'erano i file **quando sono stati scritti** — un documento storico che punta
a un percorso inventato è peggio di uno che punta a un percorso vecchio. I
documenti storici non sono stati toccati; quelli vivi (`CLAUDE.md`, l'albero in
`README.md`, questo documento) sì.

**L'arretrato è dichiarato con la destinazione già decisa**, in `CLAUDE.md`,
perché il prossimo non debba deciderla da capo: `QuickAddTask.jsx` → `tasks/`,
`NoticeEditorModal.jsx` → `dashboard/`, `AddTeamMemberModal.jsx` e
`BulkInviteModal.jsx` → `admin/`, `AddCategoryModal.jsx` → `admin/`,
`ProfileEditor.jsx` e i suoi due file → `shell/`, `CropModal.jsx` → `ui/`.
Quando `modals/` è vuota, sparisce.

## A-7 · Igiene ✔

`chat/ConversationView.jsx` chiamava `useChatContext()` **due volte** nello
stesso corpo di componente (righe 47 e 54), a sette righe di distanza: una sola
destrutturazione. E `README.md` dichiarava **1316 test** contro i 1637 reali.

⚠️ Il numero dei test in `README.md` è esattamente la classe di numero per cui
esiste `verifica:convenzioni` (ST-13), e **non è misurato**: farlo richiederebbe
eseguire l'intera suite dentro lo script, che è il suo costo più alto. Corretto
a mano oggi, tornerà falso.

---

## Top 3 suggerimenti strategici

1. **Quando si scrive una regola in un commento, si scrive anche chi la
   misura.** Tre dei sette rilievi di questo passaggio hanno la stessa forma:
   un criterio giusto, chiaro, motivato — e nessuno che lo verifichi. Il
   progetto ha già l'infrastruttura per farlo (`verifica:convenzioni`, con i
   controlli che negano invece di contare) e la usa bene; quello che manca è
   l'abitudine di aggiungere il controllo **nello stesso commit** del commento.
   Un commento che descrive un invariante è una promessa; il controllo è la
   promessa mantenuta.

2. **Preferire i controlli che NEGANO a quelli che CONTANO.** «914 costanti di
   stile» era vero il 23 agosto e sarà falso al prossimo componente; «nessuna
   forma è definita in tre file» resta vero finché qualcuno non lo rompe, e
   quando si rompe indica il file. I numeri dichiarati in `docs/` hanno un
   costo di manutenzione reale — ogni PR che li muove deve aggiornarli — e
   vanno spesi dove il numero **è** l'informazione (i call site di un
   contratto), non dove è solo la fotografia di una dimensione.

3. **Il prossimo passo è il punto 2 dell'analisi, non altro punto 1.** La
   struttura è in buono stato e questo passaggio ha raschiato il fondo di ciò
   che si può dire senza ripetersi: due dei sette rilievi sono di igiene, uno è
   stato ridimensionato misurando. Sicurezza, flusso dati, performance e UX non
   sono stati guardati in questo passaggio, e il primo passaggio dello stesso
   giorno ha trovato lì il suo rilievo più grave — una divergenza fra la
   matrice dei permessi del client e quella del database che nessuno strumento
   di questo repository confronta.
