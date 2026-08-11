# Audit di architettura e struttura del codice — 10 agosto 2026

> Perimetro: **organizzazione dei moduli, separazione delle responsabilità,
> duplicazione, anti-pattern React, componenti troppo estesi**.
>
> Rapporto con gli audit precedenti. `AUDIT_ARCHITETTURA_2026-08.md` (7-8
> agosto) ha coperto sicurezza, flusso dati e correttezza; `AUDIT_PERFORMANCE_
> 2026-08.md` (9 agosto) il costo del bundle e del render. Questo documento
> guarda la *forma* del codice, e dove i rilievi si sovrappongono a quelli lo
> dico e riporto lo stato **rimisurato oggi** invece di ripeterlo: cinque dei
> dieci rilievi P2 risultano chiusi e il documento non lo dice ancora (ST-13).

**Marcatura delle fonti**, come negli audit precedenti:

- ✅ **verificato sul database live** — progetto `vmxvnxsqfisucugcpqlc`
- 📄 **verificato nel repo** — letto nel sorgente
- 🔬 **misurato** — `vitest run`, `eslint .`, `npm run build` eseguiti oggi

---

## 1. Executive Summary

**Stato di salute: buono.** La misura, non l'impressione:

| Indicatore | Valore | Fonte |
|---|---|---|
| Test | **969 verdi + 7 skipped**, 84 file (erano 831 su 69 l'8 agosto) | 🔬 |
| ESLint | **0 errori**, 20 warning (tutti `no-multi-comp`) | 🔬 |
| Build di produzione | ok — chunk `index` **291 kB / 81.7 kB gzip** (era 423/112) | 🔬 |
| Primo caricamento | **643 kB / 181.6 kB gzip** (era 776/212) | 🔬 |
| Advisor sicurezza Supabase | **0 errori**, 10 warning, tutti già motivati | ✅ |
| `max-lines` (500 righe effettive) | 0 violazioni, ed è un **errore** non un warning | 🔬 |

Il refactoring del monolite non è solo dichiarato: è diventato *misurabile*. Le
regole `no-restricted-imports` in `eslint.config.js` trasformano tre invarianti
architetturali in errori di lint — le mutazioni passano dal registry, i chunk
lazy non si possono aggirare con un import statico, `mockData.js` non può
rientrare nel bundle di produzione. È la pratica più matura di questo repo, e
il resto di questo audit va letto come una domanda sola: **dove l'invariante è
scritta e non ancora applicata?**

La risposta ha una forma precisa, e sono tre luoghi.

**1. Il guscio.** `TasksContext.jsx` spiega in trenta righe perché le viste
devono essere `memo` e non ricevere `state`; cinque viste su sei lo rispettano e
la sesta è stata sistemata l'8 agosto. Ma `Topbar`, `Sidebar` e `BottomNav`
ricevono ancora `state` intero e non sono `memo` (ST-2), e — questo è il rilievo
nuovo e il più concreto di tutto il documento — la Dashboard **è** `memo` ma
quel `memo` non funziona: una prop callback non memoizzata (`openChatTo`,
`VoyageDesk.jsx:211`) ne cambia l'identità a ogni render. 🔬 Misurato: **un
render completo della Dashboard per ogni carattere digitato nella ricerca**, e
zero dopo aver avvolto quella funzione in `useCallback`. La protezione più
costosa dell'app è oggi disattivata da una riga (ST-1).

**2. I due sottosistemi "eccezione".** La chat e il modulo Liste sono, per
ragioni documentate, fuori dal reducer e fuori dal registry di persistenza.
L'eccezione è legittima; ciò che è rimasto indietro è che dentro quelle
eccezioni le regole comuni non arrivano. La chat è l'ultimo posto che ricarica
**tutto** a ogni evento (`Messages.listAll(2000)`, ST-4) — esattamente il
pattern chiuso per liste e task dall'audit di due giorni fa, applicato ora alla
tabella che crescerà più in fretta di tutte. Il modulo Liste ha ancora due modi
di chiedere una conferma nello stesso modulo (ST-5) e tiene il proprio data
layer privato nella cartella condivisa `lib/` (ST-6).

**3. La lettura senza paginazione.** `Clients.list()` non ha `.range()` e
✅ `clients` è a **818 righe**: se il cap PostgREST del progetto è il default
storico di 1000, l'anagrafica smetterà di mostrare le ultime righe **in
silenzio** a ~180 clienti da qui (ST-3). È il rilievo con la conseguenza
peggiore in rapporto al costo della correzione, e l'infrastruttura per chiuderlo
esiste già dentro `listeApi.js`.

**Un'osservazione trasversale.** Il rischio di questo progetto non è più il
debito tecnico: è la **deriva fra ciò che i documenti affermano e ciò che il
codice fa**, e si è già ripresentata. `docs/INDEX.md` dichiara aperti tutti i
dieci rilievi dell'audit di performance mentre cinque sono chiusi; `CLAUDE.md`
tiene il conto dei `no-multi-comp` a «19 in 12 file» mentre oggi sono 🔬 **20 in
10 file**. Sono inezie in sé, ma sono la stessa crepa che l'audit del 7 agosto
ha classificato ALTA (A-3) quando riguardava la sicurezza. La correzione
strutturale non è riscrivere i numeri a mano un'altra volta: è farli verificare
da uno script (suggerimento strategico n. 3).

**Nessun rilievo critico.** Non ho trovato difetti che compromettano i dati,
scavalchino un permesso o rompano una funzionalità.

---

## 2. Tabella delle priorità

| # | Priorità | Area | Problema | File |
|---|---|---|---|---|
| — | **CRITICI** | — | **Nessuno.** | — |
| ST-1 | ~~Alta~~ ✔ **risolto** | Render / invariante | Il `memo` della Dashboard è annullato da `openChatTo`, callback non memoizzata: 🔬 1 render completo per carattere digitato | `VoyageDesk.jsx:211,274` |
| ST-2 | ~~Alta~~ ✔ **risolto** (entrambi i passi — parte 2 l'11 agosto, PR #171) | Architettura | Il guscio riceve `state` intero e non è `memo`; la causa a monte era lo **stato effimero di UI dentro il reducer globale** (6 fette) | `VoyageDesk.jsx:322,353,376` · `state/reducer.js:662-665,752-757` |
| ST-3 | ~~Alta~~ ✔ **risolto** | Scalabilità | `Clients.list()` senza `.range()` con ✅ 818 righe: troncamento silenzioso al cap PostgREST | `lib/api.js:605-606` |
| ST-4 | ~~Media~~ ✔ **risolto** (parte 1 di 2) | Scalabilità | La chat ricaricava **tutti** i messaggi a ogni evento, e su `conversations` anche l'elenco intero senza motivo | `hooks/useChatData.js:71-99` · `lib/api.js:351` |
| ST-5 | ~~Media~~ ✔ **risolto** | Duplicazione / a11y | Due modi di chiedere conferma **dentro lo stesso modulo**; 12 modali del modulo Liste senza `role="dialog"`, `aria-modal`, blocco scroll | `liste/modals/LvOverlay.jsx` · `liste/ListaDetail.jsx` · `liste/ListeViaggio.jsx` |
| ST-6 | ~~Media~~ ✔ **risolto** (il data layer è in components/liste/ + quarta regola di lint) | Organizzazione | `lib/listeApi.js` (530 righe) è il data layer **privato** del modulo Liste ma vive nel layer condiviso: 12 import interni, 0 esterni | `lib/listeApi.js` |
| ST-7 | ~~Media~~ ✔ **risolto** (overlayReducer in ListeViaggio, bozza unica in ProfileEditor) | Complessità | Due componenti con una macchina a stati di modali scritta a mano: 14 e 18 `useState` | `liste/ListeViaggio.jsx:167-181` · `modals/ProfileEditor.jsx` |
| ST-8 | ~~Media~~ ✔ **risolto** (src/lib/dates.js, sette formati nominati) | Duplicazione | Formattazione date: 🔬 16 call site in 9 file, 6 forme diverse, nessun modulo comune | `lib/taskUtils.js:14` · `lib/listeApi.js:416` · +7 file |
| ST-9 | ~~Media~~ ✔ **risolto** (finestra da 24 card in ClientiView) | Scalabilità | `ClientiView` disegna tutte le ✅ 818 card senza paginazione, mentre il modulo Liste ha già il pattern (`HOME_PAGE_SIZE`) | `clients/ClientiView.jsx` |
| ST-10 | ~~Bassa~~ ✔ **risolto** (un percorso solo: i fallback solo-test sono spariti) | Architettura | `ChatPanel`: 18 prop fra cui i setter grezzi dello stato chat; due write path di fallback **solo-test** compilati in produzione | `chat/ChatPanel.jsx:43` · `chat/ConversationView.jsx:81,261` |
| ST-11 | ~~Bassa~~ ✔ **risolto** (i tre componenti leggono useClients()) | Duplicazione | `clients` arriva come prop `state.clients \|\| []` a tre componenti benché esista `ClientsProvider` — e il `\|\| []` crea un array nuovo a ogni render | `VoyageDesk.jsx:388,420,434` |
| ST-12 | ~~Bassa~~ ✔ **risolto** (ChatPanel è un chunk lazy: index da 291 a 239 kB) | Bundle | La chat (~54 kB) è ancora eager benché il pannello chiuso ritorni `null` (P2-10, aperto) | `VoyageDesk.jsx:50` |
| ST-13 | ~~Bassa~~ ✔ **risolto** (scripts/verifica-convenzioni/) | Documentazione | Deriva già ricomparsa: `INDEX.md` dà per aperti 10 rilievi P2 su 10 (5 sono chiusi); `CLAUDE.md` conta 19 `no-multi-comp` in 12 file (🔬 20 in 10) | `docs/INDEX.md` · `docs/CLAUDE.md:41` |
| ST-14 | Bassa | Config | `leaked_password_protection` ancora disabilitata (✅ riconfermato oggi sull'advisor) | dashboard Supabase |
| ST-15 | ~~Bassa~~ ✔ **risolto** (confronto prima di SET_TEAM/SET_CATEGORIES) | Render | `AppDataContext` ricrea ~20 closure a ogni sostituzione di `team` (P2-9, aperto) | `state/AppDataContext.jsx:50` |

## 2-bis. Stato di avanzamento — cinque rilievi chiusi

Applicati su richiesta subito dopo l'analisi, nello stesso branch, in due
passaggi (ST-1/2/3 il 10 agosto, ST-4/5 subito dopo). Questa sezione esiste
perché il rilievo ST-13 di questo stesso documento riguarda audit che non
portano lo stato dei propri rilievi: sarebbe singolare diventarne il prossimo
esempio.

| | Esito |
|---|---|
| **ST-1** | `openChatTo` avvolta in `useCallback`. 🔬 La misura è ora un test: `src/test/memoViste.test.jsx` monta l'app con la vista attiva e la nav sostituite da stub `memo` che contano i propri render, digita nella ricerca e asserisce che i contatori non si muovano — con un controllo positivo (`input.value === "abc"`) che impedisce al test di passare perché non è successo niente. **Verificato che fallisca senza la correzione**: rimettendo la funzione nuda il test riporta 4 render invece di 1 su tre caratteri e 11 invece di 1 su dieci. Non è più un'invariante letta: è misurata. |
| **ST-2** | Fatta la **parte meccanica** (che è ciò che chiudeva P2-6): `Topbar` riceve `activeView`/`searchQuery`/`showNotif`, `Sidebar` riceve `activeView`/`collapsed`, `BottomNav` riceve `activeView`; tutti e tre sono `memo`. `team`, `currentUserId` e `tasks` arrivano dai context dove già vivevano — `UserSwitcher` non riceve più `state` affatto e `getNavBadges` prende `team` invece dello stato intero. I due callback della nav (`openBulk`, `openChatPanel`) sono passati da arrow inline a `useCallback`, **nello stesso commit del `memo`**: senza, si aggiungeva un confronto che non poteva mai riuscire (è la lezione di ST-1). Effetto misurato dallo stesso test: digitando nella ricerca, Sidebar e BottomNav ora non si ri-renderizzano affatto, mentre la Topbar continua a farlo — deve, contiene il campo. |
| **ST-2** (parte 2) | Era rimasta aperta di proposito: portare `searchQuery`/`showNotif`/`sidebarCollapsed` fuori dal reducer globale è una decisione di architettura, non una correzione, e `selectedTask` passa dai permessi (`canViewTask` in `SET_SELECTED_TASK`), un controllo da conservare dov'è. **Decisione presa e chiusa l'11 agosto** (PR #171, branch separato) — vedi §2-quater per cosa è stato deciso. |
| **ST-3** | `fetchAllRows` promossa da funzione privata di `listeApi.js` a `src/lib/pagination.js`, con `PAGE_SIZE`/`WITH_COUNT`: `Clients.list()` la usa, `listeApi.js` la importa da lì invece di tenerne una copia — la regola esiste in **un** posto e si applica in due. Aggiunto `.order('id')` come seconda chiave: `name` non è unico (omonimi legittimi fra titolari e cointestatari) e senza una chiave stabile due pagine consecutive possono ripetere o saltare una riga. 6 test nuovi in `src/test/paginazione.test.js`, di cui uno asserisce il caso che conta — 1500 righe servite in pagine da 1000 tornano **tutte e 1500**, non le prime 1000. |
| **ST-4** (parte 1 di 2) | `useChatData.js` usa ora il parametro `tabelle` di `useDebouncedTableSubscription`, esattamente come `useListeData.js` (A-1): un evento su `messages` non ricarica più `Conversations.listMine()`, perché un messaggio nuovo non tocca l'elenco delle conversazioni (`updated_at` si muove solo su create/rename/pin, non su ogni invio). `tabelle === null` (idratazione iniziale o ripresa dopo un buco di connessione) continua a caricare tutto. 5 test nuovi in `src/test/realtimeGranularita.test.jsx`, che segue lo stesso stile di quelli già lì per A-1/A-2/B-1 — inclusa la prova che il reload parziale non azzera le conversazioni già in stato. |
| **ST-4** (parte 2) | **Resta aperta, come previsto dal rilievo stesso.** Caricare i messaggi per conversazione aperta con `Messages.listForConversation()` invece del corpus intero è un cambio di modello dati lato client che tocca i read receipt e il badge dei non letti: a ✅ 13 messaggi non si ripaga. La soglia scritta nel rilievo (`messages > ~1500`) resta il segnale per riaprirlo. |
| **ST-5** | `ConfirmModal.jsx` è sparito: i suoi tre call site (`ListaDetail.jsx` — chiudere/cestinare una lista, rimuovere un cointestatario, eliminare un movimento; `ListeViaggio.jsx` — eliminazione definitiva dal cestino) passano ora da `useConfirm()`, lo stesso meccanismo già usato da `ArchivedListe.jsx` nello stesso modulo. `LvOverlay.jsx` (gli undici modali con portale) ha preso `role="dialog"`, `aria-modal="true"`, `aria-labelledby` opzionale e blocco dello scroll di fondo — sei righe, stile del modulo invariato. Un test esistente (`listeDataTools.test.jsx`) assumeva il vecchio markup (`.lv-modal` come contenitore della conferma) ed è stato aggiornato a cercare `[role="dialog"]`, che è precisamente la differenza che questo rilievo introduce. |
| Test | 🔬 **982 verdi + 7 skipped** su 87 file (erano 977 su 87): +5 `realtimeGranularita` (ST-4). 0 errori ESLint (20 warning, l'arretrato dichiarato). Build ok: `index` 291.26 kB / 81.82 kB gzip. |

**Cosa NON era stato toccato in quel passaggio**: ST-6…ST-15, chiusi il giorno
dopo — vedi §2-ter, che li registra uno per uno. Restava aperto ST-14 (non
correggibile da codice) e le due decisioni dichiarate, la parte 2 di ST-2 e la
parte 2 di ST-4 — la prima è stata chiusa l'11 agosto stesso, in un passaggio
successivo (§2-quater); la parte 2 di ST-4 resta aperta sotto soglia.

---

## 2-ter. Stato di avanzamento — nove rilievi chiusi l'11 agosto

Applicati su richiesta nello stesso branch, il giorno dopo. Restano aperti
**ST-14** (non correggibile da codice) e, al momento di questa sezione, le due
decisioni dichiarate: il secondo passo di ST-2 e il secondo passo di ST-4,
entrambe rimandate per i motivi scritti in §2-bis, non per mancanza di tempo.
La prima delle due è stata chiusa più tardi lo stesso giorno — vedi §2-quater.

| | Esito |
|---|---|
| **ST-6** | `lib/listeApi.js` → `components/liste/listeApi.js`, accanto ai suoi dodici importatori. La quarta regola `no-restricted-imports` vieta l'import da fuori il modulo, con l'eccezione per il modulo stesso — e in flat config le opzioni non si fondono fra blocchi, quindi la pattern è ripetuta nei quattro blocchi che ridichiarano la regola. 🔬 **Verificata contro il difetto**: un import da `components/views/` fallisce il lint. |
| **ST-7** | `liste/listeReducers.js`: i quattro `useState` di overlay di ListeViaggio (più l'avanzamento dell'import) sono una transizione sola — lo stato "due finestre aperte" non è più *rappresentabile*, invece di essere tenuto impossibile a mano in ogni handler. `search`/`filter`/`sort`/`limit` restano `useState`, che è la parte del rilievo che non andava fatta. In `ProfileEditor` i 17 `useState` diventano 10: una bozza per i campi del profilo (come `TaskSlideOver`), una per il sotto-form password, e una fase per ciascuna delle due operazioni asincrone al posto di due coppie booleano+messaggio. Cinque valori restano separati **con il motivo scritto nel file**. |
| **ST-8** | `lib/dates.js` nomina **sette** formati, non sei: il settimo (`giornoMese`, senza zero iniziale) esiste solo per gli estremi di una settimana di calendario, e la ragione è scritta accanto. I formatter `Intl` si costruiscono al primo import invece che a ogni chiamata. Il caveat che teneva separate `formatDate` e `fmtDate` non è sparito, è stato **promosso**: `aData` costruisce un `Date` locale dai tre numeri di una colonna `date`, quindi la protezione dallo slittamento di un giorno vale ora per tutti i formati e non per il solo numerico. Il test che conta è il confronto **carattere per carattere** fra la nuova strada e la chiamata che sostituisce, forma per forma: quasi nessun test funzionale asserisce su una data, quindi questo refactor poteva cambiare ciò che l'utente legge restando verde. |
| **ST-9** | Finestra di 24 card in `ClientiView`, con "Mostra altri N di M" e riazzeramento a ogni restringimento (ricerca, filtro, **ordinamento** — cambiare l'ordine ridefinisce quali sono i primi 24). Il totale resta visibile: "24 di 818" e "24" sono due affermazioni diverse su dati operativi. 9 test che **contano le card montate**, perché una finestra si riapre in silenzio. |
| **ST-10** | I due fallback "eg. test" di `ConversationView` sono spariti: un percorso solo, quello dei comandi. `useChatData` non esporta più i setter grezzi. ⚠️ **Togliendoli è emerso il difetto che coprivano**: `ChatPanel` non passava affatto `commands` a `ConversationView`, quindi `sendText` avrebbe sollevato un `TypeError` al primo invio da una conversazione aperta. Nessun test era rosso perché i due percorsi esercitati dai test erano esattamente i due fallback. È la dimostrazione del rilievo, meglio di quanto il rilievo stesso sapesse. |
| **ST-11** | `TaskSlideOver`, `QuickAddTask` e `BulkTaskCreator` leggono `useClients()`; le tre prop `clients={state.clients \|\| []}` sono sparite da `VoyageDesk.jsx` insieme all'array nuovo a ogni render. |
| **ST-12** | 🔬 Misurato: chunk `ChatPanel` **53.20 kB / 14.69 kB gzip** fuori dall'iniziale, `index` da **291.26 → 239.68 kB** (81.82 → 68.63 kB gzip). Il ri-export di `getUnreadCount` da `ChatPanel` è stato rimosso *prima* del `lazy()`: con quello in piedi il modulo sarebbe rimasto agganciato al chunk eager e il lazy non avrebbe spostato niente — il difetto di P2-1. La regola di lint che protegge `ClienteListePanel`/`ArchivedListe` copre ora anche `ChatPanel`, e i quattro test della chat importano il pannello dinamicamente. |
| **ST-13** | `scripts/verifica-convenzioni/`, in CI accanto al lint. Confronta sette numeri dichiarati in `docs/` con la misura reale: `no-multi-comp` (casi e file, letti dall'**API** di ESLint e non dal testo dell'output), le violazioni `max-lines`, e per ciascun audit i rilievi chiusi/totali della sua tabella contro il marcatore `⟦stato: N/M chiusi⟧` in `INDEX.md`. ⛔ Ogni lettura da documento **solleva** se il pattern non c'è: uno script che passa perché non ha trovato niente da verificare è peggio del problema che risolve. 🔬 Verificato contro il difetto: alterando il numero in `CLAUDE.md` lo script esce 1 con lo scarto. Prima misura: il numero scritto era ancora sbagliato — 20 casi in **13** file, non in 10. |
| **ST-15** | `lib/confrontoIdratazione.js`: `SET_TEAM` e `SET_CATEGORIES` non partono più quando il payload riletto è equivalente a quello consegnato prima, quindi un evento realtime innocuo su `users` non invalida più i venti metodi di `AppDataContext`. Il confronto è puro e testato sui casi limite, non sul caso normale: niente `JSON.stringify` (sensibile all'ordine delle chiavi: non fallirebbe mai, e la correzione sarebbe finta), l'ordine delle righe **conta**, e `null` non è mai equivalente a una lista — saltare un dispatch è corretto solo se il payload è davvero completo. |
| **ST-14** | **Resta aperto, e non è correggibile da codice**: è un interruttore in Supabase → Authentication → Password → *Enable leaked password protection*. ✅ Riconfermato `WARN` sull'advisor live l'11 agosto. Ciò che è stato fatto è togliergli il silenzio: `verifica-advisor` non accetta più i WARN per **categoria** ma per **nome**, con l'elenco dei nove SECURITY DEFINER motivati scritto accanto alla ragione. Da ora questo rilievo fa fallire il controllo invece di confondersi con quelli accettati — e, cosa che conta di più, lo fa anche un avviso *nuovo* su una tabella aggiunta domani. |
| Test | 🔬 **1057 verdi + 7 skipped** su 93 file (erano 982 su 87). 0 errori ESLint (20 warning in 13 file, l'arretrato dichiarato e ora verificato da uno script). Build ok. |

---

## 2-quater. Le due decisioni dichiarate — prese, 11 agosto

Questa sezione esiste per la stessa ragione di ST-13: un documento che elenca
una decisione come "da prendere" senza tornarci sopra è la deriva successiva,
non un caso a parte.

**ST-2 (parte 2) — chiusa.** Decisa e applicata lo stesso giorno, in un
passaggio separato da questo audit (PR #171, branch `claude/reducer-state-
architecture-wcr9cb`, mergiata su `main`). La decisione presa, fra le opzioni
lasciate aperte in §3 (`ST-2`):

- `showNotif` e `sidebarCollapsed` diventano `useState` locale rispettivamente
  di `Topbar` e `Sidebar`: 📄 verificato che non avessero consumatori fuori dal
  componente che li possiede — il reducer globale faceva solo da tramite.
- `searchQuery` **non** diventa locale a `Topbar`: resta `useState` nel guscio
  (`VoyageDeskInner`), perché è candidato a diventare un filtro cross-view, e in
  quel caso deve restare leggibile da fuori la Topbar. Esce comunque dal
  reducer di dominio, che era il punto del rilievo.
- `filters`/`SET_FILTER` risultavano codice morto (nessun dispatch, nessuna
  lettura) e sono stati rimossi, non migrati.
- `selectedTask` **resta nel reducer**, deliberatamente fuori da questo
  cambiamento: sei case lo tengono allineato ai task nello stesso passaggio
  (`UPDATE_TASK`, `ADD_COMMENT`, `DELETE_TASK`, `RENAME_CLIENT_IN_TASKS`,
  `UNDO_LAST_ACTION`, `SET_CURRENT_USER`) oltre al controllo permessi
  (`canViewTask`) in `SET_SELECTED_TASK` — portarlo fuori avrebbe reintrodotto
  un effetto di ri-sincronizzazione fra due fonti di verità, il difetto
  opposto a quello che il rilievo voleva chiudere.

📄 Verificato oggi sul reducer: `SET_SEARCH`, `TOGGLE_NOTIF`, `TOGGLE_SIDEBAR` e
`SET_FILTER` non sono più case di `state/reducer.js`. 🔬 Suite completa
rimisurata: 1057 verdi + 7 skipped su 93 file, invariata rispetto a §2-ter —
la modifica ha spostato dove vive lo stato, non ha aggiunto né tolto
comportamento coperto da test.

**ST-4 (parte 2) — riconfermata aperta, sotto soglia.** Non una decisione
diversa da quella scritta nell'Action Plan: la soglia (`messages > ~1500`) non
è stata raggiunta, quindi non c'è ancora nulla da decidere sul merito. ✅
Rimisurato in diretta sul progetto Supabase (`select count(*) from messages`):
**13 messaggi**, lo stesso numero del 10 e dell'11 agosto — il volume non è
cambiato, quindi il ragionamento in §3 (ST-4) non è cambiato. Alzare il
`limit` di `Messages.listAll` resterebbe la mossa sbagliata per lo stesso
motivo scritto lì: sposterebbe il troncamento in avanti aumentando il costo di
ogni evento. Il segnale per riaprire il rilievo resta lo stesso: quando
`messages` supera ~1500, non prima.

---

**Stato dei rilievi degli audit precedenti, rimisurato oggi** — perché un audit
che elenca rilievi altrui senza ricontrollarli è la fonte della prossima deriva:

| Rilievo | Stato oggi | Come l'ho verificato |
|---|---|---|
| P2-1 (chunk Liste aggirato) | ✔ chiuso | 🔬 `ArchivedListe` e `ClienteListePanel` sono chunk separati nel build; regola `no-restricted-imports` a guardia |
| P2-2 (`mockData.js` in produzione) | ✔ chiuso | 📄 unico ingresso `state/demoState.js` dietro `import.meta.env.DEV` + regola di lint |
| P2-3 (6 viste secondarie eager) | ✔ chiuso | 🔬 `Trash`, `Archive`, `CalendarPlanner`, `ProfileEditor`, `ClientImportModal`, `AdvancedSearchPanel` sono chunk propri; `index` da 423 a 291 kB |
| P2-4 (zero `useMemo`) | ✔ chiuso | 🔬 11 `useMemo` in `Dashboard`, 6 in `CalendarPlanner` |
| P2-7 (`ViewportContext`) | ✔ chiuso | 📄 `width` aggiornato solo al cambio di fascia (`SOGLIE_FASCIA`) |
| P2-5, P2-6 | ✔ **chiusi il 10 agosto** | come ST-3 e ST-2 (parte 1) — vedi §2-bis |
| P2-8, P2-9, P2-10 | **aperti** | qui ST-9, ST-15, ST-12 |
| A-1…B-4 (audit architettura) | chiusi tranne B-2 | ✅ B-2 = ST-14, ancora `WARN` sull'advisor oggi |

---

## 3. Action Plan dettagliato

### ST-1 · Il `memo` della Dashboard è annullato da una prop callback — Alta

> ✔ **Risolto** — vedi §2-bis. La correzione applicata è quella descritta qui
> sotto, sonda di regressione compresa (`src/test/memoViste.test.jsx`), e la
> sonda è stata verificata contro il difetto: senza `useCallback` fallisce.

**File.** `src/VoyageDesk.jsx:211` (definizione), `:274` (uso)

**Misura.** 🔬 Test temporaneo: `VoyageDesk` montato, `Dashboard` sostituita da
uno stub `memo` che conta i propri render, tre caratteri digitati
nell'input di ricerca.

```
[MISURA] render iniziali=1  dopo 3 caratteri=4      ← oggi
[MISURA] render iniziali=1  dopo 3 caratteri=1      ← con useCallback
```

**Perché è una criticità.** `Dashboard` è avvolta in `memo`, e le sue prop sono
state scelte una per una per avere identità stabile — è il lavoro descritto nel
commento a `VoyageDesk.jsx:264-271` e in `state/TasksContext.jsx`. Tutte tranne
una:

```js
// VoyageDesk.jsx:211 — ricreata a OGNI render di VoyageDeskInner
const openChatTo = (intent) => {
  if (intent && intent.toUser) setChatIntent(intent);
  setShowChat(true);
};
```

`memo` confronta le prop per identità: una funzione nuova a ogni render è una
prop diversa a ogni render, quindi il confronto fallisce sempre e il render
avviene sempre. La conseguenza non è teorica: `SET_SEARCH` cambia
`state.searchQuery` a ogni tasto, `VoyageDeskInner` si ri-renderizza,
`openChatTo` è nuova, e la vista più costosa dell'app si ridisegna interamente —
gli undici `useMemo` aggiunti da P2-4 salvano i *calcoli*, non la
riconciliazione né i render dei figli (quattro code, bacheca, scadenze, carico
team).

È il difetto peggiore da lasciare aperto in questo repo per una ragione che va
oltre il costo: **fa sembrare fatto un lavoro che non lo è.** Chi legge il file
vede `memo` su sei viste e ne conclude che l'invariante è applicata. Il prossimo
audit di performance misurerebbe di nuovo il costo di render della Dashboard e
troverebbe il numero di prima, senza una spiegazione visibile.

**Soluzione.** Una riga, a rischio zero — la funzione non chiude su nulla che
cambi (solo due `setState`, stabili per contratto React):

```js
  // useCallback e non una funzione nuda: questa prop arriva a <Dashboard>, che
  // è `memo`. Una funzione ricreata a ogni render è una prop diversa a ogni
  // render, quindi il memo non ha MAI potuto saltare un render — misurato: un
  // render completo della Dashboard per ogni carattere digitato nella ricerca.
  // Le due setState non entrano nelle dipendenze: React ne garantisce
  // l'identità stabile.
  const openChatTo = useCallback((intent) => {
    if (intent && intent.toUser) setChatIntent(intent);
    setShowChat(true);
  }, []);
```

**E la rete di sicurezza, che è la parte che conta.** Una prop instabile è
invisibile in review — è ciò che è appena successo. Va reso misurabile, con lo
stesso movimento di `adminView.test.jsx` (che monta ogni tab e asserisce che non
riceva `state`):

```jsx
// src/test/memoViste.test.jsx
// L'invariante di VoyageDesk.jsx:264 ("le prop rimaste hanno identità stabile,
// quindi il memo sulle viste può davvero saltare il render") non era verificata
// da nessun test: `openChatTo` l'ha violata per intero senza che nulla
// fallisse. Qui la vista è uno stub `memo` che conta i propri render, e
// l'asserzione è sul CONTATORE — cioè sulla cosa che il memo promette.
it("digitare nella ricerca non ri-renderizza la vista attiva", () => {
  render(<VoyageDesk />);
  const renderIniziali = conteggio.dashboard;
  fireEvent.change(cercaInput(), { target: { value: "abc" } });
  expect(conteggio.dashboard).toBe(renderIniziali);
});
```

> Nota di metodo: la modifica e la misura sono state fatte in locale in questa
> sessione e poi **revertite** — questo documento è un'analisi e non tocca il
> codice. I due numeri sopra sono però misurati, non stimati.

---

### ST-2 · Il guscio riceve `state` intero, e lo stato effimero di UI vive nel reducer globale — Alta

> ✔ **Risolto interamente.** Il primo passo (le fette + `memo` + i callback
> della nav da `useCallback`) è in §2-bis. Il secondo passo — portare lo stato
> effimero di UI fuori dal reducer — era stato lasciato aperto di proposito
> come decisione di architettura, non come correzione: la decisione è stata
> presa e applicata l'11 agosto, in un passaggio separato (PR #171). Vedi
> §2-quater.

**File.** `src/VoyageDesk.jsx:322` (`Topbar`), `:353` (`Sidebar`), `:376`
(`BottomNav`) · `src/state/reducer.js:662-665`, `:752-757`

**Perché è una criticità.** È il rilievo P2-6, ancora aperto, ma vale la pena
riformularlo perché il modo in cui è scritto lì (“passare fette invece di
`state`”) cura il sintomo e non la causa.

Il guscio legge, in tutto, **sette campi**: `activeView`, `searchQuery`,
`showNotif`, `tasks`, `currentUserId`, `team`, `sidebarCollapsed`. Riceve
`state`, che cambia identità a ogni azione qualunque — un toast, un carattere
nella ricerca, l'arrivo di un evento realtime. Nessuno dei tre componenti è
`memo`, quindi si ri-renderizzano tutti e tre a ogni azione. Due dei sette campi
li potrebbero già leggere dal contesto: `team` e `currentUserId` sono in
`AppDataContext` (ed è la stessa asimmetria di ST-11 per i clienti).

La causa a monte, però, è che **sei fette di stato puramente effimero di UI
vivono nel reducer globale**:

```js
// state/reducer.js:752-757
    selectedTask: null,
    toasts: [],
    searchQuery: "",
    showNotif: false,
    sidebarCollapsed: false,
    filters: { assignee: "", category: "", priority: "", status: "", client: "" },
```

Nessuna di queste è un dato di dominio: nessuna è persistita, nessuna passa dal
registry di `state/persistence.js`, nessuna sopravvive a un reload. Il reducer
esiste per «il registro azioni/undo/log che garantisce ai task» (parole di
`useChatData.js`, che spiega perché la chat *non* ci passa). Il testo digitato in
un campo di ricerca non ha bisogno di nulla di tutto questo — e in cambio del
fatto di stare lì, ogni suo carattere invalida l'identità dell'oggetto da cui
dipendono **tutti** i consumatori di `state`.

**Soluzione, in due passi indipendenti.** Il primo è meccanico e chiude P2-6:

```jsx
// VoyageDesk.jsx — il guscio dichiara le fette che consuma, come le viste dal
// 7 agosto. `team` e `currentUserId` non compaiono: Sidebar/BottomNav li
// leggono già da useAppData().
<Topbar
  activeView={state.activeView}
  searchQuery={state.searchQuery}
  showNotif={state.showNotif}
  tasks={state.tasks}
  dispatch={dispatch}
  /* … i callback delle notifiche, già memoizzati … */
/>
<Sidebar activeView={state.activeView} collapsed={state.sidebarCollapsed}
         dispatch={dispatch} onOpenBulk={apriBulk} onOpenChat={apriChat}
         unreadChat={chat.unreadChat} />
```

con `export const Topbar = memo(function Topbar({ … }))` sui tre, e — decisivo —
`apriBulk`/`apriChat` estratti in `useCallback` invece di essere arrow inline
(altrimenti si ricade in ST-1: il `memo` non aggancerebbe nulla).

Il secondo passo è la correzione strutturale, e va deciso prima di essere fatto:
portare `searchQuery`/`showNotif`/`sidebarCollapsed` in uno stato locale del
guscio (o in un `useReducer` dedicato all'interfaccia, come già fa la chat con
`chatPanelReducer`), lasciando nel reducer globale solo ciò che è dominio.
`filters` e `selectedTask` sono i due casi da valutare a parte: `selectedTask`
passa dai permessi (`SET_SELECTED_TASK` chiama `canViewTask`) e quel controllo
va conservato dov'è.

Il guadagno del solo primo passo è già misurabile con la stessa sonda di ST-1,
estesa al guscio.

---

### ST-3 · `Clients.list()` senza paginazione, con 818 righe — Alta

> ✔ **Risolto** — vedi §2-bis. Con una differenza rispetto allo schizzo qui
> sotto: l'helper non sta in `lib/api.js` ma in `src/lib/pagination.js`, per non
> accoppiare il modulo Liste al data layer del core (`listeApi.js` importa da
> lì, non da `api.js`), e l'ordinamento porta `.order('id')` come seconda
> chiave perché `name` non è unico.

**File.** `src/lib/api.js:605-606` · consumatore: `src/hooks/useAppHydration.js`

**Misura.** ✅ `clients` = **818 righe** oggi (era 818 il 9 agosto: stabile, ma
l'anagrafica è alimentata da un import di massa — `ClientImportModal` — quindi
non cresce di una riga alla volta).

**Perché è una criticità.** È P2-5, ancora aperto, e resta il rilievo con il
sintomo più difficile da attribuire di tutto il repo:

```js
export const Clients = {
  list: () =>
    supabase.from('clients').select('*').order('name'),
```

PostgREST applica un cap di righe per progetto (`db-max-rows`, default storico
1000). Superato quel numero, la risposta viene **troncata senza errore**: nessun
`error`, nessun warning, solo alcune righe che non ci sono. Con `order('name')`
le mancanti sarebbero quelle in fondo all'alfabeto, e il sintomo — "i clienti da
S a Z non si trovano più" — non assomiglia a un problema di paginazione.
Ricadono in silenzio anche l'autocomplete cliente sui task, il conteggio liste
per cliente e la ricerca globale.

L'audit precedente ha ✅ verificato che nessun `pg_db_role_setting` imposti quel
parametro, ma il valore effettivo vive nella configurazione di piattaforma
(dashboard → Settings → API → Max rows) e **non è leggibile da SQL**: va
guardato a mano una volta. La correzione qui sotto rende però la domanda
irrilevante, che è meglio che rispondervi.

**Soluzione.** Il meccanismo esiste già ed è collaudato: `fetchAllRows` in
`lib/listeApi.js:86` pagina con `.range()` e si ferma sul `count` esatto del
`Content-Range` — quindi non dipende dal valore del cap. Va promosso da
funzione privata di un modulo a helper del data layer:

```js
// lib/api.js — accanto a withOrigin, perché è la stessa classe di cosa: un
// invariante del data layer che nessun call site deve ricordarsi di applicare.
const PAGE_SIZE = 1000;

/**
 * Scarica TUTTE le righe di una query, paginando con .range().
 * Estratto da listeApi.js, dove esisteva già per liste_viaggio (616 righe) e
 * movimenti_lista (5.320): il cap `db-max-rows` di PostgREST tronca la
 * risposta SENZA errore, quindi una select senza .range() su una tabella che
 * cresce non fallisce — smette solo di dire tutto.
 * Si ferma sul `count` del Content-Range, così non dipende dal valore del cap.
 */
export const fetchAllRows = async (buildQuery) => {
  const rows = [];
  for (;;) {
    const { data, count, error } = await buildQuery()
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    if (page.length === 0) return { data: rows, error: null };
    if (typeof count === 'number' && rows.length >= count) return { data: rows, error: null };
  }
};

export const Clients = {
  // 818 righe a oggi ✅. `{ count: 'exact' }` serve a fetchAllRows per sapere
  // quando fermarsi: senza, l'unico criterio sarebbe la pagina vuota (un
  // round-trip in più) e il troncamento a 1000 resterebbe indistinguibile da
  // una tabella che ha davvero 1000 righe.
  list: () =>
    fetchAllRows(() => supabase.from('clients')
      .select('*', { count: 'exact' }).order('name')),
```

`Clients.list()` continua a ritornare `{ data, error }`: 📄 nessun chiamante
cambia. Da fare nello stesso passaggio la sostituzione in `listeApi.js` con
l'import dal punto unico, altrimenti l'helper diventa il terzo doppione invece
del primo punto comune.

**Verifica che vale la pena aggiungere**, perché è la stessa asimmetria che
rende il difetto invisibile:

```js
// src/test/api.test.js — una select senza .range() su una tabella di dominio
// è il difetto che non fallisce da solo.
it("Clients.list pagina: non può essere troncata dal cap PostgREST", async () => {
  const range = vi.fn().mockResolvedValue({ data: [], count: 0, error: null });
  // …asserisce che .range() sia stato chiamato almeno una volta
});
```

---

### ST-4 · La chat è l'ultimo sottosistema che ricarica tutto — Media

> ✔ **Risolto il primo passo** — vedi §2-bis. Il secondo (`listForConversation`
> per conversazione aperta) resta aperto per la soglia scritta più sotto
> (`messages > ~1500`), non per mancanza di tempo.

**File.** `src/hooks/useChatData.js:62-66` · `src/lib/api.js:351`

**Misura.** ✅ `messages` = 13, `conversations` = 4. Oggi il volume è
irrilevante: è il motivo per cui questo rilievo è Media e non Alta.

**Perché è una criticità comunque.** La forma è identica a quella di A-1 e B-1,
chiusi il 7-8 agosto per liste e task:

```js
useDebouncedTableSubscription(["conversations", "messages"], async (isCurrent) => {
  const [convsRes, msgsRes] = await Promise.all([
    ConversationsAPI.listMine(),
    MessagesAPI.listAll(),          // ← tutti i messaggi di tutte le conversazioni
  ]);
```

Ogni messaggio inviato da chiunque fa scaricare, **su ogni client connesso**,
l'elenco completo delle conversazioni e fino a 2000 messaggi. Due differenze
rispetto ai casi già chiusi, ed entrambe peggiorano la traiettoria: la chat è il
sottosistema con la **frequenza di scrittura più alta** dell'app (un messaggio
per riga di conversazione, non una modifica per pratica), e il callback qui non
usa il parametro `tabelle` che `useDebouncedTableSubscription` gli passa già —
lo strumento della correzione di A-1 è disponibile e non collegato.

C'è poi un secondo effetto, più insidioso del costo: `listAll(limit = 2000)`
prende i **2000 più recenti su tutte le conversazioni**. Superata quella soglia
complessiva, la cronologia più vecchia sparisce dalla UI senza alcun messaggio —
e `Messages.listForConversation()`, che esiste in `api.js:336` ed è la query
giusta per aprire una conversazione, 📄 **non è chiamata da nessuna parte**. Il
percorso corretto è già scritto e non è collegato.

**Soluzione, in due passi di dimensione molto diversa.** Il primo, immediato,
usa `tabelle` come fa `useListeData`:

```js
useDebouncedTableSubscription(["conversations", "messages"], async (isCurrent, tabelle) => {
  // Un messaggio nuovo non cambia l'elenco delle conversazioni: cambia il
  // contenuto di UNA. Ricaricare anche listMine() a ogni messaggio era, sul
  // percorso più frequente dell'app, una query completa buttata via.
  // `tabelle === null` = idratazione iniziale, dove serve tutto.
  const soloMessaggi = tabelle !== null && tabelle.size > 0
    && !tabelle.has("conversations");
  const [convsRes, msgsRes] = await Promise.all([
    soloMessaggi ? Promise.resolve({ data: null, error: null }) : ConversationsAPI.listMine(),
    MessagesAPI.listAll(),
  ]);
  if (!isCurrent()) return;
  // …se convsRes.data è null si conservano le conversazioni già in stato…
```

Il secondo passo — caricare i messaggi **per conversazione aperta** con
`listForConversation`, invece del corpus intero — è un cambio di modello dati
lato client (`messages` da mappa completa a mappa parziale con idratazione
pigra) e non va fatto oggi: a 13 messaggi non si ripaga, e toccherebbe il
percorso dei read receipt e del badge dei non letti. Va **scritto come rilievo
con una soglia**, che è la cosa che è mancata la volta scorsa: `messages > ~1500`
è il momento in cui diventa il lavoro più urgente del progetto, e a quel punto
il conteggio va guardato di nuovo. Nel frattempo, alzare il `limit` sarebbe la
mossa sbagliata: sposta il troncamento in avanti aumentando il costo di ogni
evento.

---

### ST-5 · Due modi di chiedere conferma dentro lo stesso modulo, e 12 modali senza semantica di dialogo — Media

> ✔ **Risolto** — vedi §2-bis. `ConfirmModal.jsx` è stato rimosso, non solo
> sostituito nei call site; `LvOverlay.jsx` porta la correzione descritta qui
> sotto quasi alla lettera.

**File.** `src/components/liste/modals/ConfirmModal.jsx` ·
`src/components/liste/modals/LvOverlay.jsx` ·
`liste/ListaDetail.jsx:397` · `liste/ListeViaggio.jsx:639`

**Perché è una criticità.** La criticità #8 (commit `e2ca0a6`) ha fatto un
lavoro esemplare: 17 `window.confirm` sostituiti da `useConfirm()`, una sola
finestra costruita su `ui/Modal.jsx`, focus iniziale su *Annulla* per le azioni
distruttive. Il commento in testa a `ConfirmContext.jsx` cita esplicitamente il
`ConfirmModal` del modulo Liste come il modale che l'app «aveva già».

Oggi convivono entrambi, e la spaccatura non è fra il core e il modulo: è
**dentro** il modulo. 📄 `ArchivedListe.jsx` usa `useConfirm()`;
`ListaDetail.jsx` e `ListeViaggio.jsx` usano `ConfirmModal`, ciascuno con il
proprio `useState` `confirm` e il proprio ramo di render. Tre file dello stesso
modulo, due meccanismi.

La differenza non è stilistica. `ConfirmModal` non passa da `LvOverlay`: 📄
costruisce l'overlay a mano, **senza portale**, senza chiusura con `Escape`,
senza `role="dialog"`, senza `aria-modal`, senza blocco dello scroll di fondo e
senza il focus iniziale su *Annulla* — la protezione che impedisce a un Invio
premuto per abitudine di svuotare il cestino. Sono precisamente le cinque
garanzie che `ui/Modal.jsx` esiste per dare una volta sola, ed è il modale con
cui il modulo chiede di eliminare definitivamente una lista.

Lo stesso vale, in misura minore, per gli **11 modali** che passano da
`LvOverlay`: hanno portale, `Escape` e focus al primo campo, ma 📄 nessuno ha
`role="dialog"`/`aria-modal` né blocco dello scroll. Per uno screen reader
quegli undici modali non sono modali: sono `div` in mezzo alla pagina.

**Soluzione.** Non fondere i due sistemi di stile — l'identità visiva del modulo
è una scelta dichiarata (`listeStyles.jsx`) e va rispettata. Ciò che va unificato
è la **semantica**, che con lo stile non ha niente a che fare. Due mosse:

1. `ConfirmModal` sparisce, e i suoi tre call site passano a `useConfirm()`,
   che è già disponibile nel modulo (lo usa `ArchivedListe`):

```js
// liste/ListaDetail.jsx — al posto di setConfirm({ … }) + il ramo di render
const conferma = useConfirm();
…
const eliminaMovimento = async (id) => {
  if (!(await conferma({
    title: "Eliminare il movimento?",
    body: "L'operazione non è reversibile.",
    cta: "Elimina", danger: true,
  }))) return;
  await esegui("eliminaMovimento", id);
};
```

   Spariscono con esso lo `useState` `confirm` in due componenti e i due rami di
   render — il che vale anche per ST-7.

2. `LvOverlay` prende la semantica di `ui/Modal.jsx` senza prenderne lo stile.
   È un innesto di sei righe, non un rifacimento:

```jsx
export function LvOverlay({ children, onClose, wide = false, labelledBy }) {
  const boxRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    // Blocco dello scroll di fondo: la stessa ragione di ui/Modal.jsx — su
    // mobile lo scroll "attraversa" il modale e la pagina sotto si muove
    // mentre si compila il form. Qui mancava, e i modali di questo modulo sono
    // quelli con i form più lunghi dell'app.
    const precedente = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    boxRef.current?.querySelector("input, select")?.focus();
    return () => {
      document.body.style.overflow = precedente;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return createPortal(
    <div className="lv-root">
      <div className="lv-overlay" onClick={onClose}>
        {/* role/aria-modal: senza, per uno screen reader questi undici modali
            sono div in mezzo alla pagina, non finestre che catturano il
            contesto. Lo stile resta quello del modulo: qui cambia solo ciò
            che l'accessibility tree legge. */}
        <div ref={boxRef} role="dialog" aria-modal="true" aria-labelledby={labelledBy}
             className={`lv-modal${wide ? " wide" : ""}`}
             onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
```

---

### ST-6 · Il data layer privato del modulo Liste vive nella cartella condivisa — Media

**File.** `src/lib/listeApi.js` (530 righe) · `src/components/liste/listeModuleApi.js`

**Perché è una criticità.** `listeModuleApi.js` ha fatto la cosa giusta:
ha chiuso la superficie del modulo verso il core, e oggi 📄 i tre file del core
che prima assemblavano query sulle tabelle delle liste (`Topbar` →
`AdvancedSearchPanel`, `ClientiView`, `Archive`) chiedono *domande* e non
*query*. Verificato: **nessun file fuori da `components/liste/` importa
`lib/listeApi.js`**.

Ciò che resta è che quel confine è **una convenzione, non una struttura**. Il
file sta in `src/lib/` — la cartella dei moduli condivisi da tutta l'app, quella
in cui si guarda quando serve un helper — mentre i suoi 12 importatori stanno
tutti dentro `components/liste/`. Un modulo di dominio è così diviso su due
convenzioni di organizzazione: la sua UI, la sua persistenza
(`listePersistence.js`), il suo hook dati (`useListeData.js`) e la sua facciata
(`listeModuleApi.js`) stanno insieme per feature; il suo data layer sta altrove
per layer. È esattamente la posizione da cui i tre file del core l'avevano
raggiunto la prima volta.

**Soluzione.** Il file si sposta accanto ai suoi consumatori, e la convenzione
diventa una regola di lint come le altre tre già in `eslint.config.js`:

```
src/components/liste/
├── listeApi.js          ← era src/lib/listeApi.js (privato del modulo)
├── listeModuleApi.js       la facciata PUBBLICA: l'unico ingresso dal core
├── listePersistence.js     le scritture
├── useListeData.js         home + realtime
└── …componenti
```

```js
// eslint.config.js — quarta regola di confine, stessa forma delle tre esistenti
const VIETATO_LISTEAPI_DA_FUORI = {
  group: ['**/liste/listeApi', '**/liste/listeApi.js'],
  message:
    'listeApi.js è PRIVATO del modulo Liste: dal core si passa da ' +
    'components/liste/listeModuleApi.js, che espone domande e non query. ' +
    'Tre viste del core (Topbar/ricerca, ClientiView, Archive) conoscevano la ' +
    'forma delle tabelle di un modulo altrui prima che quella facciata esistesse.',
};
// …applicata a tutti i file TRANNE src/components/liste/**
```

Costo: un `git mv`, 12 percorsi di import da accorciare (`../../lib/` →
`./`), e la regola. Nessun cambiamento di comportamento. Il valore non è
estetico: è che dopo questa mossa la violazione non è più possibile per
distrazione, che è la sola forma in cui si è presentata.

> Se si volesse la versione completa di questa idea — `src/modules/liste/` con
> le stesse regole per ogni futuro modulo di dominio — è una decisione di
> convenzione che vale la pena prendere *prima* del prossimo modulo, non dopo.
> Il modulo Liste è oggi l'unico caso, quindi il costo del cambio è al minimo
> storico.

---

### ST-7 · Due componenti con una macchina a stati di modali scritta a mano — Media

**File.** `src/components/liste/ListeViaggio.jsx:167-181` (14 `useState`, 654
righe) · `src/components/modals/ProfileEditor.jsx` (18 `useState`, 450 righe)

**Perché è una criticità.** 🔬 Entrambi passano `max-lines` (che conta le righe
effettive), quindi nessuna regola li segnala. Ma il numero che conta qui non è
la lunghezza: è **quanti stati indipendenti** un singolo componente coordina.

```js
// ListeViaggio.jsx:167-181
const [openId, setOpenId] = useState(null);
const [detail, setDetail] = useState(null);
const [search, setSearch] = useState("");
const [filter, setFilter] = useState("attive");
const [sort, setSort] = useState("recenti");
const [limit, setLimit] = useState(HOME_PAGE_SIZE);
const [nuovaOpen, setNuovaOpen] = useState(false);
const [strumentiOpen, setStrumentiOpen] = useState(false);
const [resetOpen, setResetOpen] = useState(false);
const [pendingImport, setPendingImport] = useState(null);
const [importProgress, setImportProgress] = useState(null);
const [confirm, setConfirm] = useState(null);
```

Sei di questi (`nuovaOpen`, `strumentiOpen`, `resetOpen`, `pendingImport`,
`confirm`, e `openId` per il dettaglio) descrivono **una cosa sola**: quale
overlay è aperto. Sono mutuamente esclusivi per costruzione, ma niente nel
codice lo dice — quindi lo stato "importa backup aperto **e** reset aperto" è
rappresentabile, e mantenerlo impossibile è responsabilità di ogni handler che
li tocca. È la classe di bug che non si vede in review e si trova in
produzione con «mi si sono aperte due finestre».

La cosa notevole è che **questo progetto ha già risolto lo stesso problema, nel
sottosistema accanto**: `chat/chatReducers.js` esiste esattamente per questo
(`chatPanelReducer` tiene `activeConv` / `newMode` / `forwardingMsg` /
`prefillText` in una transizione sola), e `ChatPanel` — 364 righe, un
sottosistema più complesso — ha 🔬 **zero** `useState`.

**Soluzione.** Lo stesso pattern, applicato dove non è ancora arrivato:

```js
// liste/listeReducers.js — un solo overlay alla volta, per costruzione.
// Stesso movimento di chat/chatReducers.js: prima erano sei useState
// mutuamente esclusivi in ListeViaggio, e lo stato "due overlay aperti" era
// rappresentabile — cioè da tenere impossibile a mano, in ogni handler.
export const overlayIniziale = { tipo: null, dati: null };

export function overlayReducer(stato, azione) {
  switch (azione.type) {
    case "APRI":   return { tipo: azione.overlay, dati: azione.dati ?? null };
    case "CHIUDI": return overlayIniziale;
    // L'avanzamento dell'import è l'unico dato che cambia MENTRE l'overlay
    // resta aperto: è un update sui dati, non una transizione.
    case "PROGRESSO":
      return stato.tipo === "import"
        ? { ...stato, dati: { ...stato.dati, progress: azione.progress } }
        : stato;
    default: return stato;
  }
}
```

```jsx
const [overlay, overlayDispatch] = useReducer(overlayReducer, overlayIniziale);
…
{overlay.tipo === "nuova" && <NuovaListaModal onClose={chiudi} … />}
{overlay.tipo === "strumenti" && <StrumentiDatiModal onClose={chiudi} … />}
{overlay.tipo === "import" && <ImportaBackupConfirmModal progress={overlay.dati.progress} … />}
```

`search`/`filter`/`sort`/`limit` restano `useState`: sono quattro valori
indipendenti e non una macchina a stati — separarli è la parte del rilievo che
*non* va fatta. Per `ProfileEditor`, i 18 `useState` sono in gran parte i campi
di un form (nome, email, telefono, avatar, password…): lì la forma giusta è un
solo oggetto `draft` + un riduttore di campo, come già fa `TaskSlideOver`.

---

### ST-8 · La formattazione delle date è scritta in nove file — Media

**File.** 🔬 16 call site di `toLocaleDateString`/`toLocaleTimeString` in 9 file:
`lib/taskUtils.js:14`, `lib/listeApi.js:416`, `ui/DateTimePicker.jsx:19,29`,
`chat/chatFormat.js:22`, `dashboard/NoticeBoard.jsx:66`,
`dashboard/Dashboard.jsx:160`, `calendar/CalendarPlanner.jsx:61,170,174`,
`modals/bulk/TemplateTab.jsx:159`, `liste/modals/RiepilogoClienteModal.jsx:60`

**Perché è una criticità.** Il rilievo B-3 dell'audit precedente si era chiuso
con la risposta giusta — `formatDate` e `fmtDate` divergono **di proposito**,
ricevono input diversi e rendono formati diversi — e i due punti portano ora il
rimando incrociato. Quella conclusione però copriva due funzioni su un
fenomeno più ampio: le altre **quattordici** formattazioni non stanno in nessuna
delle due, sono scritte in linea nel JSX dei componenti, e producono sei forme
diverse:

| Forma | Dove |
|---|---|
| `28 lug 2026` | `taskUtils.formatDate` |
| `28/07/2026` | `listeApi.fmtDate`, `RiepilogoClienteModal` |
| `28 lug` | `chatFormat`, `NoticeBoard` |
| `martedì 28 luglio` | `Dashboard`, `CalendarPlanner` (giorno) |
| `luglio 2026` | `DateTimePicker`, `CalendarPlanner` (mese) |
| `28 lug — 3 ago 2026` | `CalendarPlanner` (settimana) |

Sei forme sono probabilmente le sei forme giuste: un'intestazione di calendario
e un timestamp di chat non devono somigliarsi. Il difetto non è la varietà, è
che la varietà **non è dichiarata da nessuna parte** e vive dentro il markup.
Concretamente: cambiare la lingua dell'app, o passare a `Intl.DateTimeFormat`
riusato (ogni `toLocaleDateString` ricostruisce un formatter, ed è la chiamata
più costosa in un ciclo su 248 task), oggi vuol dire trovare sedici punti in
nove file leggendo il JSX.

**Soluzione.** Un modulo che **nomina i sei formati** invece di aggiungerne un
settimo, e che riusa i formatter:

```js
// src/lib/dates.js
// I formati di data dell'app, nominati. Non sono un tentativo di ridurli a
// uno: sei forme diverse sono la scelta giusta (un'intestazione di calendario
// e un timestamp di chat non devono somigliarsi). Sono nominate perché prima
// vivevano in sedici punti dentro il JSX di nove file, e la settima variante
// nasceva dal fatto che nessuno sapeva quali fossero le prime sei.
//
// I formatter sono costruiti UNA volta: `toLocaleDateString` ne costruisce uno
// nuovo a ogni chiamata, che in un ciclo su 248 task è la parte costosa.
const F = {
  breve:      new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" }),
  media:      new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short", year: "numeric" }),
  numerica:   new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }),
  giornoLungo:new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long" }),
  meseAnno:   new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }),
  ora:        new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit" }),
};

// `iso` accetta sia un timestamp ISO sia una colonna `date` (YYYY-MM-DD): è la
// distinzione che teneva separate formatDate e fmtDate, e resta esplicita qui.
const aData = (v) => (v instanceof Date ? v : new Date(v));

export const dataBreve      = (v) => (v ? F.breve.format(aData(v)) : "");
export const dataMedia      = (v) => (v ? F.media.format(aData(v)) : "");
export const dataNumerica   = (v) => (v ? F.numerica.format(aData(v)) : "");
export const giornoLungo    = (v) => (v ? F.giornoLungo.format(aData(v)) : "");
export const meseAnno       = (v) => (v ? F.meseAnno.format(aData(v)) : "");
export const oraBreve       = (v) => (v ? F.ora.format(aData(v)) : "");
```

`taskUtils.formatDate` e `listeApi.fmtDate` restano come sono, ma diventano
`dataMedia` e `dataNumerica` in una riga ciascuna — così i loro caveat già
scritti (input diversi, formati voluti) non si perdono e non c'è un secondo
posto in cui la stessa scelta va rispiegata.

---

### ST-9 · `ClientiView` disegna tutte le 818 card — Media

**File.** `src/components/clients/ClientiView.jsx`

**Misura.** ✅ 818 clienti. 📄 Nessun `slice`, nessun `limit`, nessuna
virtualizzazione: `ClienteCard` è montata 818 volte, ognuna con il proprio
`useMemo` sulle note e il chip del conteggio liste.

**Perché è una criticità.** È P2-8, ancora aperto, ma con un'osservazione che
lì non c'era: **il modulo Liste ha già risolto lo stesso problema nello stesso
repo**, e la sua soluzione è di dieci righe:

```js
// liste/ListeViaggio.jsx:174
const [limit, setLimit] = useState(HOME_PAGE_SIZE);   // 10
// …e ogni cambio di filtro/ricerca riazzera il limite:
const vaiA = (key) => { setFilter(key); setLimit(HOME_PAGE_SIZE); };
```

616 liste si sfogliano dieci alla volta; 818 clienti si disegnano tutti insieme.
La differenza non è una decisione presa: è che due viste sono state scritte in
momenti diversi.

**Soluzione.** Lo stesso pattern, non una libreria di virtualizzazione — che
sarebbe la risposta giusta a 10.000 righe, non a 818, e porterebbe una
dipendenza in un progetto che ne ha volutamente una sola:

```jsx
const PAGINA = 24;                       // 3 file da 8 sulla griglia desktop
const [limite, setLimite] = useState(PAGINA);
// Ogni restringimento riazzera la finestra: un utente che cerca "Rossi" si
// aspetta di vedere i Rossi, non i primi 24 clienti filtrati di una finestra
// aperta su un'altra ricerca.
useEffect(() => { setLimite(PAGINA); }, [ricerca, filtroAttivo]);
…
{clientiFiltrati.slice(0, limite).map(c => <ClienteCard key={c.id} … />)}
{clientiFiltrati.length > limite && (
  <button onClick={() => setLimite(l => l + PAGINA)} style={btn.secondario}>
    Mostra altri {Math.min(PAGINA, clientiFiltrati.length - limite)}
    {" "}di {clientiFiltrati.length - limite}
  </button>
)}
```

Da fare **dopo** ST-3: paginare la vista mentre la query può essere troncata in
silenzio maschererebbe il sintomo di ST-3 proprio dove si vedrebbe.

---

### ST-10 · `ChatPanel`: 18 prop e due write path solo-test — Bassa

**File.** `src/components/chat/ChatPanel.jsx:43` ·
`src/components/chat/ConversationView.jsx:81,261`

**Perché.** La chat ha una facciata di comandi (`makeChatCommands`) che è la
sua risposta al registry di persistenza del core, ed è ben fatta. Però
`useChatData` ritorna **anche** i setter grezzi (`setConversations`,
`setMessages`), `VoyageDesk` li passa a `ChatPanel` fra 18 prop, e
`ConversationView` li usa in due punti come fallback:

```js
// ConversationView.jsx:74-81 — mark-as-read
if (markConversationRead) { markConversationRead(conv.id); return; }
setMessages(prev => …);   // "Fallback per i call site che non passano il callback (eg. test)"
// ConversationView.jsx:255-261 — reazioni
if (onToggleReaction) { onToggleReaction(conv.id, msgId, emoji); return; }
setMessages(prev => …);   // "Fallback mock/test"
```

Entrambi i commenti sono onesti e dicono la verità: sono rami per i test e per
la modalità mock. Il rilievo è che sono **la seconda implementazione della stessa
semantica** (segna letto, toggla reazione), compilata nel bundle di produzione,
e nessun test verifica che le due concordino — che è la configurazione che
`persistenceGuards.test.js` esiste per impedire un piano più in su. Se domani il
mark-as-read reale cambiasse regola (per esempio smettesse di marcare i propri
messaggi), il fallback continuerebbe con quella vecchia, e a divergere sarebbe
proprio il ramo che i test esercitano.

**Soluzione.** Far sparire i rami invece di documentarli: `makeChatCommands`
esiste già in una variante locale senza rete (`ChatPanel.jsx:52-56` la usa
quando `commands` non arriva). I due fallback diventano chiamate a quella —
un'implementazione sola, esercitata dai test *e* usata in produzione:

```js
// ConversationView.jsx — un percorso solo. `commands` c'è sempre: ChatPanel
// costruisce la variante locale (senza rete) quando il genitore non la passa,
// quindi il ramo "eg. test" non ha più ragione di esistere — ed era la seconda
// scrittura della stessa regola, mai confrontata con la prima.
useEffect(() => {
  if (unreadCount === 0) return;
  commands.markConversationRead(conv.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [conv.id, unreadCount, myId]);
```

e `useChatData` smette di esportare i setter (`setConversations`/`setMessages`
escono dal valore di ritorno e dalle prop di `ChatPanel`: da 18 a 16).

---

### ST-11 · `clients` arriva sia dal contesto sia come prop — Bassa

**File.** `src/VoyageDesk.jsx:388`, `:420`, `:434`

**Perché.** `ClientsProvider` esiste dall'8 agosto ed è alimentato da
`state.clients` (`:311`), con la motivazione scritta accanto: due provider
distinti «così l'arrivo di un cliente importato non invalida le viste che
guardano i task». 📄 Due componenti lo consumano (`ClientiView`,
`ListeViaggio`); tre continuano a ricevere i clienti come prop:

```jsx
<TaskSlideOver task={state.selectedTask} dispatch={dispatch} clients={state.clients || []} />
{showFABModal && <QuickAddTask clients={state.clients || []} … />}
<BulkTaskCreator … clients={state.clients || []} />
```

Due conseguenze, una piccola e una che è la stessa di ST-1. La piccola: due
strade per lo stesso dato, e la prossima aggiunta copierà quella del vicino.
L'altra: `state.clients || []` crea un **array nuovo a ogni render** quando
`clients` è vuoto o assente — quindi se uno di questi tre componenti venisse
avvolto in `memo` (e `TaskSlideOver` è lazy e pesante, quindi è un candidato
naturale) il `memo` non aggancerebbe nulla, per la stessa ragione di ST-1 e
senza che nulla lo segnali.

**Soluzione.** I tre consumano il contesto, come le due viste che già lo fanno:

```jsx
// TaskSlideOver.jsx / QuickAddTask.jsx / BulkTaskCreator.jsx
const clients = useClients();   // era una prop; il default `|| []` vive nel provider
```

e le tre prop `clients={…}` sparissero da `VoyageDesk.jsx`. `ClientsProvider`
garantisce già l'array (mai `undefined`), quindi il `|| []` difensivo — e
l'identità instabile che portava con sé — non serve più.

---

### ST-12 · La chat è ancora eager — Bassa

**File.** `src/VoyageDesk.jsx:50`

🔬 Confermato sul build di oggi: **nessun chunk `ChatPanel`**, quindi i ~54 kB
della chat (pannello + conversazioni + composer + vocali) sono nel chunk
`index` per ogni sessione, benché `ChatPanel.jsx:213` ritorni `null` da chiuso.
È P2-10, e dopo P2-3 è il gruppo differibile più grande che resta. La forma è la
stessa già applicata sei volte in questo file:

```jsx
const ChatPanel = lazy(() =>
  import("./components/chat/ChatPanel.jsx").then(m => ({ default: m.ChatPanel }))
);
…
{showChat && (
  <Suspense fallback={<LazyFallback overlay />}>
    <ChatPanel open onClose={…} … />
  </Suspense>
)}
```

**Attenzione a un dettaglio non ovvio**, ed è la ragione per cui questo rilievo
non è banale come sembra: 📄 `VoyageDesk.jsx` importa `getUnreadCount` da
`ChatPanel.jsx` (che la ri-esporta da `chatFormat.js`), e il badge dei non letti
si calcola in `useChatData` — cioè fuori dal pannello. Se l'import diventa
dinamico, quel ri-export va sostituito con l'import diretto da
`chat/chatFormat.js`, altrimenti il modulo resta agganciato al chunk eager e il
`lazy()` non sposta niente: **esattamente il difetto di P2-1**, che è già
costato due passaggi di review prima di essere misurato. La regola di lint che
oggi protegge `ClienteListePanel`/`ArchivedListe` va estesa a `ChatPanel`.

---

### ST-13 · La deriva documentale è già ricomparsa — Bassa

**File.** `docs/INDEX.md` (tabella Audit) · `docs/CLAUDE.md:41`

📄 Due scarti, entrambi piccoli, entrambi della stessa famiglia del rilievo A-3
del 7 agosto (che era ALTA perché riguardava la sicurezza):

1. `INDEX.md` dà per aperti «tutti (P2-1 … P2-10)» i rilievi dell'audit di
   performance. 🔬 Cinque sono chiusi (P2-1, P2-2, P2-3, P2-4, P2-7 — vedi la
   tabella in §2), e nemmeno `AUDIT_PERFORMANCE_2026-08.md` porta lo stato di
   avanzamento che l'audit precedente si era imposto come regola («ciascuno
   porta lo stato dei propri, aggiornato quando vengono chiusi»).
2. `CLAUDE.md:41` afferma «19 casi aperti in 12 file» per
   `react/no-multi-comp`. 🔬 Misurati oggi: **20 warning in 10 file**. Il numero
   è cambiato in entrambe le direzioni (un file in meno, un caso in più), quindi
   non è né un miglioramento né un peggioramento: è un contatore che nessuno ha
   rimisurato.

**Soluzione, e questa volta strutturale.** Riscrivere i due numeri a mano
produrrebbe la terza occorrenza dello stesso problema fra due settimane. Il
progetto ha già `scripts/verifica-advisor/` e `scripts/verifica-migrazioni.js`,
cioè il pattern giusto: uno script che **fallisce quando la realtà e il
documento divergono**.

```js
// scripts/verifica-convenzioni/index.js
// Fa fallire la CI quando un numero scritto in docs/ non è più quello misurato.
// Perché esiste: docs/CLAUDE.md ha portato «19 no-multi-comp in 12 file» per
// due sessioni dopo che erano 20 in 10, e docs/INDEX.md dà per aperti cinque
// rilievi P2 che sono chiusi. Un numero in un documento senza un test è una
// data di scadenza che nessuno guarda.
import { ESLint } from 'eslint';

const atteso = leggiDaClaudeMd(/(\d+) casi aperti in (\d+) file/);
const misurato = await contaWarning('react/no-multi-comp');
if (misurato.casi !== atteso.casi || misurato.file !== atteso.file) {
  console.error(
    `no-multi-comp: docs/CLAUDE.md dice ${atteso.casi} casi in ${atteso.file} file, ` +
    `misurati ${misurato.casi} in ${misurato.file}. Aggiorna il documento ` +
    `(o il codice) — la divergenza è il difetto, non il numero.`);
  process.exit(1);
}
```

Con `npm run verifica:convenzioni` nella stessa riga di `verifica:advisor`, il
prossimo scarto si presenta come un test rosso e non come una frase falsa.

---

### ST-14 · `leaked_password_protection` disabilitata — Bassa

✅ Riconfermato oggi sull'advisor live: `auth_leaked_password_protection` è
ancora `WARN`. È B-2 dell'audit di agosto, l'unico rilievo di quel documento
mai chiuso, e non è fattibile da codice: dashboard Supabase → Authentication →
Password. Costo nullo, valore reale visto che l'accesso è a sola password.

Gli altri nove warning dell'advisor sono ✅ quelli attesi e già motivati in
`SICUREZZA.md` (funzioni `SECURITY DEFINER` esposte di proposito: le RPC
transazionali del modulo Liste, `get_vapid_public_key`,
`get_migrazioni_applicate`). Nessuno nuovo rispetto all'8 agosto.

---

### ST-15 · `AppDataContext` ricrea ~20 closure — Bassa

**File.** `src/state/AppDataContext.jsx:50`

📄 Il `useMemo` è corretto e la motivazione scritta sopra è giusta: finché il
reducer non sostituisce `team` o `categories`, il value non cambia identità.
Quando li sostituisce, però, si ricostruiscono venti closure — ed è P2-9, che
resta aperto e resta Bassa: `team` = ✅ 7 righe, e la sostituzione avviene solo
su un evento realtime della tabella `users`.

Va menzionato per una ragione sola, che è la metà davvero utile del rilievo
originale: `SET_TEAM` sostituisce l'array **anche quando i dati sono identici**
(`hooks/useAppHydration.js`), quindi un evento realtime innocuo su `users`
invalida tutti i consumatori del contesto. Un confronto sui campi che contano
prima di dispatchare `SET_TEAM` costa meno che memoizzare venti funzioni, e vale
per tutte le entità idratate allo stesso modo.

---

## 4. Top 3 suggerimenti strategici

### 1. Chiudere l'invariante `memo` dove è nata, cioè nel guscio — e renderla misurata

**ST-1 + ST-2, in quest'ordine.** ST-1 è una riga, ha un effetto 🔬 misurato (da
un render della Dashboard per carattere digitato a zero) e non tocca nulla di
architetturale. Ma il motivo per farla *per prima* è un altro: è la prova che
l'invariante più curata di questo progetto — le viste `memo` con prop stabili,
spiegata in trenta righe di commento in `TasksContext.jsx` e applicata a sei
viste in tre sessioni di lavoro — **non era verificata da nessun test**, e una
funzione dichiarata nel posto sbagliato l'ha annullata sulla vista che conta più
di tutte senza che nulla diventasse rosso.

Il lavoro che vale non è la riga: è la sonda che la accompagna (uno stub `memo`
che conta i propri render, ~20 righe, il modello è già in `adminView.test.jsx`).
Con quella in CI, ST-2 diventa una modifica verificabile invece che un atto di
fede, e le prossime prop instabili si presentano come un test rosso — che è la
sola differenza fra un'invariante e una buona intenzione.

### 2. Togliere le ultime due letture che possono mentire in silenzio

**ST-3 e ST-4.** Hanno la stessa forma e la stessa proprietà sgradevole: quando
si rompono, **non sbagliano — omettono**. `Clients.list()` senza `.range()`
supera il cap e restituisce 1000 righe su 818+N senza errore; `listAll(2000)`
supera la soglia e la cronologia più vecchia della chat smette di esistere per
la UI. Nessuno dei due produce un log, un toast o un test rosso: producono
un'anagrafica incompleta e una chat senza passato, e il sintomo arriva come
«non trovo più il cliente» settimane dopo la causa.

ST-3 va fatto adesso e costa poco, perché il meccanismo è già scritto
(`fetchAllRows`) e va solo promosso da privato di un modulo a helper del data
layer. ST-4 va fatto a metà adesso (usare `tabelle`, che è gratis) e a metà
quando ✅ `messages` supererà ~1500 — con la soglia scritta nel codice accanto
al `limit`, non nella memoria di chi legge questo documento.

### 3. Trasformare le ultime due convenzioni in strutture

Il progetto ha una pratica che vale più di qualunque singolo rilievo: quando una
regola conta, la rende **impossibile da violare per distrazione** invece di
scriverla in un documento. Le tre `no-restricted-imports` di `eslint.config.js`
sono l'esempio migliore — `mockData.js` non *può* rientrare nel bundle di
produzione, un chunk lazy non *può* essere aggirato con un import statico.

Restano tre cose importanti che sono ancora solo convenzioni, e tutte e tre sono
già state violate almeno una volta:

- **Il confine del modulo Liste** (ST-6). `listeModuleApi.js` ha chiuso la
  superficie, ma il data layer privato sta ancora in `lib/`, che è la cartella
  da cui tre viste del core l'avevano raggiunto. Un `git mv` e una quarta regola
  di lint.
- **La semantica dei modali** (ST-5). `ui/Modal.jsx` dà portale, `Escape`,
  `role="dialog"` e blocco scroll una volta sola; dodici modali del modulo Liste
  non li hanno, e la conferma di eliminazione definitiva è fra questi.
- **I numeri nei documenti** (ST-13). Sono già scaduti due volte in tre giorni.
  `scripts/verifica-convenzioni/` li fa scadere in modo rumoroso invece che
  silenzioso.

Nessuna delle tre migliora l'app per l'utente domani. Tutte e tre decidono
quanto costerà il prossimo audit — e la ragione per cui questo documento ha
potuto misurare invece di supporre è che qualcuno ha fatto esattamente questo
lavoro nelle sessioni precedenti.

---

## Appendice — cosa ho verificato e non ho trovato

Elencato perché un audit che riporta solo i problemi non dice quanto in largo ha
guardato.

| Verifica | Esito |
|---|---|
| Import di `lib/supabase.js` fuori dal data layer | 0 📄 — nessun componente costruisce query |
| Import di `Tasks`/`Notices`/`Clients`/`Categories` fuori dal registry | 0 📄 — la regola di lint tiene |
| `lib/listeApi.js` importato da fuori `components/liste/` | 0 📄 — la facciata `listeModuleApi` è rispettata |
| `max-lines` (500 righe effettive) | 0 violazioni 🔬, ed è un errore non un warning |
| Errori ESLint | 0 🔬 (20 warning, tutti `no-multi-comp`) |
| `react-hooks/exhaustive-deps` | 0 🔬 — le omissioni volute portano un disable con la ragione |
| Test | 969 verdi + 7 skipped, 84 file 🔬 |
| Build di produzione | ok 🔬 — `index` 291 kB / 81.7 kB gzip |
| Advisor sicurezza Supabase | 0 errori, 10 warning attesi ✅ |
| `dangerouslySetInnerHTML` / `innerHTML` | 0 📄 |
| `key={index}` su liste con identità stabile | nessun caso problematico 📄 — i 16 ricorrono su celle di calendario, scheletri e barre di waveform, tutti senza id e senza riordino |
| Aggiornamenti di stato dentro un updater di `setState` (effetti in funzioni ripetibili) | 0 📄 — chiuso da `chatCommands.js` e da `ConfirmContext` |
| `ClienteCard` × 818 → chiamate di rete per card | nessuna 📄 — non monta `Avatar`, quindi nessun N+1 sulle signed URL |
| Duplicazione dell'autocomplete cliente | chiusa 📄 — `ui/ClientAutocomplete.jsx`, 4 call site |
| Duplicazione dei filtri di ricerca | chiusa 📄 — `lib/searchUtils.js`, 4 consumatori |
| Componenti che ricevono `state` intero | 3 📄 — solo il guscio (ST-2); tutte e sei le viste sono a posto |

---

*L'analisi (§1-§4) è stata prodotta senza modificare il codice
dell'applicazione. Cinque rilievi — ST-1, ST-2 (primo passo), ST-3, ST-4 (primo
passo) e ST-5 — sono stati applicati in un secondo momento su richiesta
esplicita e sono registrati in §2-bis; ST-6…ST-15 sono stati chiusi il giorno
dopo (§2-ter). Delle due decisioni dichiarate, la parte 2 di ST-2 è stata presa
e chiusa l'11 agosto in un passaggio successivo (§2-quater); la parte 2 di
ST-4 resta aperta, riconfermata sotto soglia lo stesso giorno (§2-quater).
Nessuna DDL è stata eseguita sul database in tutta la sessione: le query a
Supabase sono state di sola lettura (`count(*)` e advisor).*
