# Audit — gestione dello stato e flusso dati · 28 agosto 2026

Perimetro: **stato applicativo e flusso dati lato client.** Re-render inutili,
chiamate API ridondanti, caching, gestione dello stato asincrono
(caricamento/errore/vuoto), race condition di rete e sincronizzazione realtime.
Otto rilievi: **nessuno critico, tre di alta priorità.**

Base di partenza: `npm ci` pulito, `npm test` verde (1823 passati, 23 saltati
su 147 file), `npm run lint` senza segnalazioni, zero
`dangerouslySetInnerHTML`/`innerHTML`/`eval` in `src/`, undici audit precedenti
chiusi.

⟦stato: 5/8 chiusi⟧

> **Sulla numerazione.** `A-` = alta priorità, `M-` = media, `B-` = bassa,
> come negli audit dal 12 agosto in poi.

---

## Executive summary

**Il sottosistema di stato di VoyageDesk non ha difetti di impianto.** Le tre
scelte che di solito si trovano rotte in un'app di questa taglia — dove vive lo
stato, chi lo può scrivere, come si distribuisce ai componenti — qui sono già
risolte e, cosa più rara, *documentate accanto al codice che le applica*:

- lo stato di dominio sta in **un reducer solo**, e nessun componente lo scrive
  a mano: si passa dal registry dichiarativo di `state/persistence.js`
  orchestrato da `useSyncedDispatch`, con permessi, normalizzazione, scrittura,
  rollback e ritiro dei toast su un percorso unico;
- la distribuzione ai componenti è per **fetta e non per `state` intero**
  (`TasksContext`, `ClientsContext`, `AppDataContext`), con le viste in `memo`
  e i callback del guscio stabilizzati — la metà che di solito manca; il test
  `memoViste.test.jsx` la blinda;
- la freschezza realtime è **una sola astrazione** (`useDebouncedTableSubscription`)
  con debounce, coalescing, gen-counter anti-stale e ripresa dopo un buco di
  connessione con soglia.

Soprattutto, il progetto ha già **isolato per iscritto le due invarianti giuste**:

1. *«per un id con una scrittura in volo vince SEMPRE la riga locale»*
   (`state/pendingWrites.js`);
2. *«copre DUE corse, non una: lo smontaggio E il cambio di dipendenza»*
   (`hooks/useCaricamento.js`).

**Tutti gli otto rilievi di questo audit sono lo stesso fatto: le due invarianti
esistono, sono scritte bene, e non sono applicate ovunque.** Nessuno di essi
chiede di progettare qualcosa di nuovo — chiedono di finire di applicare ciò
che il progetto ha già deciso. Ed è la ragione per cui la priorità è alta pur
non essendoci nulla di critico: i guasti di questa famiglia **non si vedono**.
Non lanciano, non colorano un toast di rosso, non lasciano tracce nei log —
riportano a schermo un valore vecchio e ce lo lasciano, spesso *in modo
permanente*, perché il meccanismo che sarebbe venuto a correggerli (l'eco
realtime della propria scrittura) è filtrato per costruzione.

Il rilievo che conta più di tutti è **A-1**, ed è di natura diversa dagli altri:
non è un call site dimenticato ma un buco *dentro* il meccanismo più recente e
più efficace del progetto — `applyRow`, il suggerimento strategico n.1
dell'audit del 16 agosto. Una riga applicata da realtime può essere riportata
indietro dalla risposta di un reload partito **prima** dell'evento, e nessun
secondo giro viene a correggerla. Vale per `tasks`, `notices` e `clients`
insieme, cioè per tutte e tre le entità a cui quel meccanismo si applica.

Non ci sono invece rilievi su: memoizzazione, identità dei `value` di contesto,
prop drilling di `state`, chiamate di rete dentro gli updater di `setState`,
`useEffect` senza cleanup sui canali, o caching mancante. Sono tutte cose già
affrontate, e i controlli automatici che le tengono chiuse funzionano.

---

## Tabella delle priorità

| # | Priorità | Classe | Rilievo | File |
|---|---|---|---|---|
| — | **Critici** | — | *Nessuno.* | — |
| **A-1** | Alta | Race / sync realtime | `applyRow` non invalida i reload in volo: la riga appena applicata viene riportata indietro dalla risposta di un reload partito prima, **e nessun secondo giro la corregge** | `hooks/useDebouncedTableSubscription.js:158-172` |
| **A-2** ✔ | Alta | Race / stato asincrono | Il feed notifiche è l'unico stato realtime **senza protezione delle scritture in volo**: «segna letta» può tornare indietro e restarci | `hooks/useNotifications.js:42-51` |
| **A-3** ✔ | Alta | Race / stato asincrono | `SET_TEAM` è l'unica entità realtime del reducer che **non** passa da `fondiScrittureInVolo`, e nessuna entry del team dichiara `entityId` | `state/reducer.js:392-395`, `state/persistence.js:519,593,613,633,770` |
| **M-1** ✔ | Media | Race / dipendenza | `TaskAttachments`: `useIsMounted()` copre lo smontaggio ma **non il cambio di `taskId`** — e lo slide-over resta montato passando da un task all'altro | `components/tasks/TaskAttachments.jsx:60-70` |
| **M-2** | Media | Stato di attesa disonesto | `TaskHistoryPanel`: `caricando` non torna a `true` al cambio di `taskId` — la cronologia del task precedente viene mostrata, con il suo conteggio, come se fosse quella del nuovo | `components/tasks/TaskHistoryPanel.jsx:41-63,77` |
| **M-3** ✔ | Media | Race / gen-counter | `caricaStorico`/`caricaClienti` non condividono alcuna generazione con il reload della sottoscrizione: due risposte concorrenti, vince quella che arriva ultima | `hooks/useAppHydration.js:410-457` |
| **B-1** | Bassa | Troncamento silenzioso | `Notifications.list({ limit: 100 })`: il badge dei non letti conta solo le 100 più recenti e non lo dice | `lib/api/notifiche.js:17-21`, `components/shell/Topbar.jsx:100` |
| **B-2** ✔ | Bassa | Race / dipendenza | `ClienteListePanel`: stessa classe di M-1, finestra più stretta (il cambio cliente riporta al tab Task) | `components/liste/ClienteListePanel.jsx:42-67` |

---

## Action plan dettagliato

### A-1 · `applyRow` non invalida i reload in volo

**Dove.** `src/hooks/useDebouncedTableSubscription.js:158-172` (la funzione
`debounced`), `:128-133` (`gen` e `run`). Riguarda le tre sottoscrizioni che
usano `applyRow`: `tasks`, `notices`, `clients` in `hooks/useAppHydration.js`.

**Perché è una criticità.** `applyRow` è la correzione più efficace fatta sul
flusso dati (suggerimento strategico n.1, audit del 16 agosto): l'evento porta
già la riga, quindi la si applica invece di ricaricare l'entità intera. Il
codice però la applica **fuori dal gen-counter**:

```js
const debounced = (tbl, payload) => {
  const fn = filterRef.current;
  if (fn && !fn(payload)) return;
  if (applyRowRef.current?.(tbl, payload)) return;   // ← esce PRIMA di toccare `gen`
  pending.add(tbl);
  …
};
```

`gen` avanza solo quando parte un reload (`run`). Un evento gestito da
`applyRow` non lo tocca, quindi **non invalida un reload già in volo**. La
sequenza che rompe:

1. la scheda torna in primo piano dopo più di 30 s → `onReconnectSignal()` →
   parte un reload completo (`run(null)`, `gen = N`);
2. mentre quella query è in volo — su mobile sono centinaia di ms, a volte
   secondi — un **altro utente** modifica un task; l'evento arriva,
   `applyRow` lo applica, lo stato è corretto;
3. la risposta del reload arriva. È il pre-immagine: è stata *chiesta* prima
   dell'evento. `isCurrent()` ritorna `true` (`gen` è ancora `N`), quindi
   `SET_TASKS` sostituisce l'array e **la modifica sparisce**;
4. `fondiScrittureInVolo` non la salva: non è una *nostra* scrittura, quindi
   quell'id non è in `pendingWrites`;
5. non arriva nessuna correzione. L'unico evento che avrebbe potuto portarla è
   quello del passo 2, che è già stato consumato.

Il risultato è uno stato **stabilmente sbagliato** fino al reload della pagina,
prodotto proprio dal percorso di recupero (`online`, ritorno in primo piano)
che esiste per garantire il contrario. È esattamente la finestra descritta in
`state/pendingWrites.js` per le scritture proprie, applicata a quelle altrui —
dove nessuna delle due protezioni esistenti arriva.

**Soluzione.** L'invariante da scrivere è: *un evento applicato per riga rende
obsoleta qualunque risposta chiesta prima di esso.* Si ottiene facendo avanzare
la generazione anche su `applyRow`, e ri-programmando il reload che così si
scarta — perché quel reload, quando è il recupero da un buco di connessione,
serve davvero.

```js
// src/hooks/useDebouncedTableSubscription.js

useEffect(() => {
  if (!enabled) return;
  let cancelled = false;
  let gen = 0;
  // Quante richieste sono partite e non ancora concluse. Serve a distinguere
  // «applyRow durante un reload» (il caso di A-1) da «applyRow a riposo», che
  // è il caso normale e non deve costare niente.
  let inVolo = 0;

  const run = (tabelle) => {
    const my = ++gen;
    inVolo += 1;
    return Promise.resolve(reloadRef.current(() => !cancelled && my === gen, tabelle))
      .finally(() => { inVolo -= 1; });
  };

  …

  const debounced = (tbl, payload) => {
    const fn = filterRef.current;
    if (fn && !fn(payload)) return;
    if (applyRowRef.current?.(tbl, payload)) {
      // A-1 · La riga È stata applicata, ed è più recente di qualunque
      // risposta già chiesta: quelle diventano obsolete. Avanzare `gen` le
      // scarta (il loro `isCurrent()` diventa falso), e siccome un reload in
      // volo può essere il recupero dopo un buco di connessione — cioè
      // l'unica cosa che sa quali ALTRI eventi si sono persi — non basta
      // buttarlo via: va rifatto. Il debounce lo coalesce con gli altri
      // eventi della raffica, quindi il costo è una query, non una per riga.
      if (inVolo > 0) {
        gen += 1;
        pending.add(tbl);
        clearTimeout(timer);
        timer = setTimeout(() => {
          const tabelle = pending;
          pending = new Set();
          run(tabelle);
        }, delay);
      }
      return;
    }
    pending.add(tbl);
    clearTimeout(timer);
    timer = setTimeout(() => {
      const tabelle = pending;
      pending = new Set();
      run(tabelle);
    }, delay);
  };
```

> **Nota sul costo.** Il ramo caro scatta solo quando un evento realtime cade
> *dentro* la finestra di un reload — cioè raramente, e quasi sempre dopo una
> riconnessione, dove una query in più è precisamente il prezzo che questo hook
> dichiara di voler pagare («il costo di un reload di troppo è una query; il
> costo di un reload mancato è dati muti»). Fuori da quella finestra
> (`inVolo === 0`) il comportamento è identico a oggi: `applyRow` applica e
> l'evento si ferma lì.

**Test di regressione da aggiungere** (`src/test/realtime/`): un reload
finto lento, un evento `applyRow` durante la sua attesa, e l'asserzione che lo
stato finale contenga la riga dell'evento e non quella del reload.

---

### A-2 · Il feed notifiche non protegge le proprie scritture in volo

**Dove.** `src/hooks/useNotifications.js:42-51` (il reload) contro `:56`
(`markRead`), `:67` (`markAllRead`), `:89` (`remove`), `:106` (`clearAll`), più
`VoyageDeskInner.jsx:markChatNotificationsRead`.

**Perché è una criticità.** Il reload sostituisce l'elenco intero senza alcuna
fusione:

```js
useDebouncedTableSubscription(["notifications"], async (isCurrent) => {
  const { data, error } = await NotificationsAPI.list({ limit: 100 });
  if (!isCurrent()) return;
  if (error) { … return; }
  setNotifications((data || []).map(fromDbNotification));   // ← sostituzione secca
}, { enabled, deps: [enabled] });
```

Le quattro mutazioni sono ottimistiche e ben scritte (le compensazioni di
`remove` e `clearAll` sono mirate, non snapshot: è la scelta giusta per un feed
vivo). Manca però l'altra metà, quella che `state/pendingWrites.js` documenta
per tasks/notices/clients. La sequenza:

1. l'utente clicca su una notifica → `markRead` applica in ottimistico e manda
   l'`UPDATE`;
2. nello stesso istante un trigger DB inserisce una notifica nuova. Le
   notifiche nascono server-side con `origin_client` **NULL** — lo dice il
   commento in `lib/api/notifiche.js` — quindi l'evento **non** è filtrato e
   alimenta il debounce;
3. 200 ms dopo parte `Notifications.list()`. L'`UPDATE` del passo 1 può non
   aver ancora committato: la risposta contiene la notifica con `read: false`;
4. `setNotifications` sostituisce l'elenco → **il pallino torna, il badge
   risale**;
5. quando l'`UPDATE` committa, la sua eco porta il *nostro* `origin_client` e
   viene scartata da `subscribeToTable`. **Nessun reload viene a correggere.**

Lo stato locale resta divergente dal database — sul database la notifica *è*
letta — fino al prossimo evento su `notifications`, che può non arrivare mai
nella sessione. Su `remove`/`clearAll` il sintomo è più visibile ancora: le
notifiche cancellate riappaiono (la loro `DELETE` non è taggabile, quindi lì un
evento correttivo poi arriva — ma dopo un lampeggio).

**Soluzione.** Lo stesso registro `id → in volo` del core, con la stessa forma
usata da `useChatData` per i messaggi (`messaggiInVolo`), che è il precedente da
imitare perché è già uno stato **fuori** dal reducer.

```js
// src/hooks/useNotifications.js

// A-2 · Le notifiche su cui una nostra scrittura è ancora in volo, con la
// riga locale che deve vincere. È `fondiScrittureInVolo` (state/pendingWrites.js)
// per uno stato che non passa dal reducer — stessa invariante, stesso perché:
// fra il dispatch ottimistico e il commit passano centinaia di ms, e in quella
// finestra un evento ALTRUI (le notifiche nascono da trigger, con
// origin_client NULL: non sono filtrate) fa ripartire list(). La risposta è
// più vecchia per la NOSTRA riga, e l'eco della nostra scrittura — che sarebbe
// l'unica correzione possibile — è taggata e viene scartata.
//
// Un ref e non uno stato: non deve provocare render da solo, cambia sempre
// insieme alla riga che rappresenta (già applicata in ottimistico).
const inVoloRef = useRef(new Map()); // id → { riga | null }  (null = cancellata)

const marca = useCallback((id, riga) => {
  inVoloRef.current.set(id, riga);
}, []);
const smarca = useCallback((id) => {
  inVoloRef.current.delete(id);
}, []);

// La fusione, pura e testabile a parte.
const fondi = (arrivate, inVolo) => {
  if (!inVolo.size) return arrivate;
  const tenute = arrivate
    .filter(n => !inVolo.has(n.id) || inVolo.get(n.id) !== null)  // cancellata → resta fuori
    .map(n => (inVolo.has(n.id) ? inVolo.get(n.id) : n));
  const serviti = new Set(arrivate.map(n => n.id));
  // …e il simmetrico: una riga che il server non serve ancora non va persa.
  const mancanti = [...inVolo.entries()]
    .filter(([id, riga]) => riga && !serviti.has(id))
    .map(([, riga]) => riga);
  return mancanti.length ? [...mancanti, ...tenute] : tenute;
};

useDebouncedTableSubscription(["notifications"], async (isCurrent) => {
  const { data, error } = await NotificationsAPI.list({ limit: 100 });
  if (!isCurrent()) return;
  if (error) { … return; }
  setNotifications(fondi((data || []).map(fromDbNotification), inVoloRef.current));
}, { enabled, deps: [enabled] });

const markRead = useCallback((id) => {
  if (!enabled) return;
  const letta = vive.current.find(n => n.id === id);
  if (!letta) return;
  const aggiornata = { ...letta, read: true };
  marca(id, aggiornata);
  setNotifications(prev => prev.map(n => (n.id === id ? aggiornata : n)));
  NotificationsAPI.markRead(id)
    .then(r => {
      if (r?.error) {
        console.error("[notifications] markRead", r.error);
        onError("Notifica: aggiornamento fallito");
      }
    })
    // `finally` e non `then`: un errore di rete che lasciasse l'id marcato per
    // sempre farebbe smettere QUELLA notifica di aggiornarsi da realtime per
    // il resto della sessione — lo stesso ragionamento di useSyncedDispatch.
    .finally(() => smarca(id));
}, [enabled, onError, marca, smarca]);
```

`remove` marca `null` (riga cancellata: non deve rientrare), `clearAll` marca
`null` per tutti gli id noti, `markAllRead` marca la versione letta di ciascuno.
`markChatNotificationsRead` in `VoyageDeskInner.jsx` scrive lo stesso feed dal
di fuori (via `setNotifications`) e va fatto passare per la stessa marcatura —
altrimenti resta l'unico ingresso scoperto.

#### Come è stato chiuso — e la copia che non è stata scritta

Fatto, con **una** differenza rispetto alla soluzione proposta qui sopra, ed è
la parte che conta: la `fondi` locale non è stata scritta. Il registro è una
`Map<id, contatore>` — la stessa forma di `state.pendingWrites` — e la fusione è
`fondiScrittureInVolo` di `state/pendingWrites.js`, importata.

Il motivo non è il risparmio di quindici righe: la `fondi` abbozzata sopra
**è** quella funzione, riscritta a mano, semantica per semantica (per un id in
volo vince il locale; una riga cancellata in ottimistico non rientra; una riga
che il server non serve ancora non si perde). Aggiungerla avrebbe reso quattro
le copie di un'invariante che quel modulo esiste per tenerne **una** — ed è
letteralmente la frase con cui si apre: «un'invariante scritta tre volte è
un'invariante che regge fino alla prima distrazione». Che il rilievo proponesse
una copia è, col senno di poi, il sintomo del rilievo stesso: la fusione era
già lì, e non si vedeva perché viveva dentro il reducer.

Due scelte da segnalare:

1. **Un contatore, non un booleano.** Su una stessa notifica si sovrappongono
   due scritture — «segna letta» e poi «elimina» — e un `delete` alla
   conclusione della prima riaprirebbe la finestra per la seconda a metà
   strada. È lo stesso `MARK/UNMARK_PENDING_WRITE` del reducer, e il caso è
   verificato (`uno smarcamento non annulla l'altra scrittura ancora in volo`).
2. **`markChatNotificationsRead` è rientrato nell'hook** come
   `markReadForConversation`, invece di ricevere `marca`/`smarca` dall'esterno.
   Spostarlo non è un riordino: la protezione diventa una proprietà del feed,
   non qualcosa che ogni chiamante deve ricordarsi. L'identità stabile che
   `chatMemo.test.jsx` misura è conservata (`useCallback` con sole dipendenze
   stabili) e ora è verificata anche alla sorgente.

Sette casi nuovi in `src/test/hooks/useNotifications.test.jsx`, **quattro
verificati contro il codice precedente** (falliscono sulla sostituzione secca) e
uno contro un registro a booleano.

⚠️ **Cosa resta aperto, trovato scrivendo il presidio e non chiuso.**
`conversations` è l'ultimo stato in blocco dell'app senza fusione:
`useChatData` sostituisce l'elenco delle conversazioni a ogni reload
(`setConversationsRaw((convsRes.data || []).map(fromDbConversation))`) mentre
`chatCommands` le crea, rinomina e fissa in ottimistico. È la stessa finestra —
`conversations` è in realtime — ma non è la stessa correzione: il registro dei
messaggi è indicizzato per conversazione (`messaggiInVolo`) e non serve a
questo, quindi ne va aggiunto un secondo. È registrato qui e non chiuso di
straforo dentro un rilievo che parlava del feed notifiche.

---

### A-3 · `SET_TEAM` è l'unica entità realtime senza `fondiScrittureInVolo`

**Dove.** `src/state/reducer.js:392-395`; entry senza `entityId` in
`src/state/persistence.js`: `UPDATE_TEAM_MEMBER:519`, `APPROVE_TEAM_MEMBER:593`,
`REMOVE_TEAM_MEMBER:613`, `TOGGLE_TEAM_MEMBER_ACTIVE:633`, `UPDATE_OWN_PROFILE:770`.

**Perché è una criticità.** Il reducer applica l'invariante a tre entità su
quattro:

```js
case "SET_TASKS":   … fondiScrittureInVolo(action.payload, state.tasks,   state.pendingWrites)
case "SET_CLIENTS": … fondiScrittureInVolo(action.payload, state.clients, state.pendingWrites)
case "SET_NOTICES": … fondiScrittureInVolo(action.payload, state.notices, state.pendingWrites)

case "SET_TEAM": {
  const team = action.payload || [];
  return { ...state, team };          // ← sostituzione secca
}
```

E il ciclo `MARK_PENDING_WRITE` non parte affatto per il team, perché nessuna
delle cinque entry dichiara `entityId` — `useSyncedDispatch` marca solo gli id
che la entry gli indica. Quindi anche aggiungendo `fondiScrittureInVolo` a
`SET_TEAM` non cambierebbe nulla: **servono le due metà.**

La sottoscrizione su `users` è viva (`useAppHydration.js:543`, debounce 800 ms)
e `filterEvent` scarta i soli UPDATE di presenza — tutto il resto (un invito
accettato, un ruolo cambiato da un altro admin, un signup) fa partire il reload.
La sequenza è identica ad A-2, con una posta più alta perché il team è il dato
da cui dipendono **tutte le decisioni di autorizzazione lato client**
(`AppDataContext` costruisce `io`/`per` da lì):

1. un admin disattiva un membro → `TOGGLE_TEAM_MEMBER_ACTIVE` applica in
   ottimistico e chiama la Edge Function;
2. nella stessa finestra un secondo evento su `users` fa partire
   `UsersAPI.listAll()`;
3. la risposta serve ancora `active: true`; `stessaLista` vede una differenza
   reale e `SET_TEAM` sostituisce l'array → **la disattivazione si annulla a
   schermo**, sopra un toast verde che dice che è riuscita;
4. l'eco della propria scrittura è taggata e viene scartata: nessuna correzione.

Su `UPDATE_OWN_PROFILE` lo stesso percorso riporta indietro nome, avatar,
email e telefono appena salvati.

**Soluzione.** Le due metà, entrambe di poche righe.

```js
// src/state/reducer.js
case "SET_TEAM": {
  // A-3 · Stessa protezione di SET_TASKS/SET_CLIENTS/SET_NOTICES, e per la
  // stessa ragione: il refetch è più recente per tutte le righe TRANNE quelle
  // che stiamo scrivendo noi, per cui il server può ancora servire il
  // pre-immagine. Il team è anche il dato da cui dipendono i permessi lato
  // client (state/AppDataContext.jsx): una riga riportata indietro qui non è
  // solo un campo sbagliato, è un verdetto di autorizzazione sbagliato.
  return {
    ...state,
    team: fondiScrittureInVolo(action.payload, state.team, state.pendingWrites),
  };
}
```

```js
// src/state/persistence.js — la metà che fa partire la marcatura
UPDATE_TEAM_MEMBER:        { …, entityId: (a) => a.payload?.id },
APPROVE_TEAM_MEMBER:       { …, entityId: (a) => a.payload },
REMOVE_TEAM_MEMBER:        { …, entityId: (a) => a.payload },
TOGGLE_TEAM_MEMBER_ACTIVE: { …, entityId: (a) => a.payload },
UPDATE_OWN_PROFILE:        { …, entityId: (s, a) => s.currentUserId },
```

> ⚠️ `UPDATE_OWN_PROFILE` non ha l'id nel payload: l'utente è `currentUserId`.
> O si estende la firma di `entityId` a `(action, state)` — che è l'opzione
> pulita, e `useSyncedDispatch` ha già `s` in mano al punto di chiamata — o la
> entry aggiunge l'id in `normalize`. La prima è preferibile: la seconda mette
> nello stato React un campo che esiste solo per farsi leggere da un'altra
> parte del meccanismo.

**Controllo da aggiungere** perché non ricapiti con la quinta entità: un test
che enumera i `case "SET_*"` del reducer per le entità pubblicate su realtime e
verifica che ciascuno passi da `fondiScrittureInVolo`. Oggi la regola è vera per
convenzione e nulla la misura — è la stessa forma del rilievo A-1 dell'audit del
26 agosto (un controllo verde su un perimetro non dichiarato).

#### Come è stato chiuso

Le due metà, come descritte, più la firma di `entityId` estesa a
`(action, state, uid)` — la stessa di `normalize`. È l'opzione che il rilievo
indicava come preferibile, e l'ha richiesta `UPDATE_OWN_PROFILE`: è l'unica
mutazione dell'app il cui soggetto non sta nel payload, perché la riga scritta è
sempre quella dell'utente loggato. L'alternativa (aggiungere l'id in
`normalize`) avrebbe messo nello stato React un campo che esiste solo per farsi
rileggere dall'orchestratore, e `s` è già in mano al punto di chiamata.

Dieci casi in `src/test/state/pendingWritesTeam.test.js`, sul modello di
`pendingWritesClientiAvvisi.test.js`: **quattro verificati contro il codice
precedente** — falliscono sulla sostituzione secca — e uno è la contropartita
(senza scritture in volo il refetch resta la fonte di verità: una fusione che
tenesse sempre il locale renderebbe il team un dato che non si aggiorna più).
Un caso esistente di `syncedDispatch.test.jsx` è stato aggiornato: asseriva la
sequenza esatta dei dispatch di `TOGGLE_TEAM_MEMBER_ACTIVE`, che ora comprende
la coppia di marcatura.

⚠️ **Cosa resta aperto, dichiarato dal presidio e non chiuso.** Quattro entry
mutano in blocco fette protette senza marcare — `EMPTY_TRASH`,
`UNDO_LAST_ACTION`, `RENAME_CLIENT_IN_TASKS`, `RESTORE_BACKUP` — ed è la
ragione per cui il controllo **non** pretende che ogni mutazione dichiari
`entityId`: sono quattro decisioni diverse (quanti id marcare in un'operazione
che ne tocca centinaia, e per quanto), non una dimenticanza sola. Pretenderlo
avrebbe aperto subito una lista di eccezioni, e «un controllo con una lista di
eccezioni che cresce ha smesso di controllare».

---

### M-1 · `TaskAttachments`: la corsa sul cambio di `taskId`

**Dove.** `src/components/tasks/TaskAttachments.jsx:60-70`.

```js
const montato = useIsMounted();

const load = useCallback(async () => {
  setLoading(true);
  const { data, error: e } = await TaskFiles.listForTask(taskId);
  if (!montato()) return;          // ← copre lo smontaggio, NON il cambio di taskId
  if (!e) setFiles(data || []);
  setLoading(false);
}, [taskId, montato]);

useEffect(() => { load(); }, [load]);
```

**Perché è una criticità.** `useCaricamento` esiste dal 26 agosto proprio per
questo, e il suo preambolo lo dice: *«⚠️ COPRE DUE CORSE, non una. Lo smontaggio
E il cambio di dipendenza — l'ultima risposta ARRIVATA non è per forza l'ultima
richiesta FATTA»*. Qui è coperta solo la prima.

E la seconda non è teorica: lo slide-over **resta montato passando da un task
all'altro** — è scritto in `VoyageDeskInner.jsx` accanto a `LazyPanel`
(`resetKey` è la chiave del boundary, **non** una `key` React, quindi non
rimonta l'albero), ed è il percorso normale quando si aprono due notifiche di
seguito. Con due richieste in volo, se quella del task **A** risponde dopo
quella del task **B**, `montato()` è ancora `true` e lo stato finisce con gli
allegati di A sotto l'intestazione di B, con `loading` già chiuso: nessun
indizio visivo che sia sbagliato. Su un pannello che elenca **allegati**,
mostrare quelli di un'altra pratica non è un difetto estetico.

**Soluzione.** Il primitivo che il progetto ha già.

```js
import { useCaricamento } from "../../hooks/useCaricamento.js";

const { dato: files, caricando: loading } = useCaricamento(
  () => TaskFiles.listForTask(taskId),
  [taskId],
  { iniziale: [], suErrore: (e) => console.error("[allegati] listForTask", e) },
);
```

`useCaricamento` non espone un setter, e questo componente aggiunge/rimuove
righe in ottimistico (`setFiles(prev => …)` in `handleFiles` e `handleRemove`).
Due strade, e la prima è quella giusta:

- **(a)** tenere `useCaricamento` per il caricamento e un `useState` per gli
  scostamenti ottimistici, riconciliati sul `dato` (è il pattern che
  `useNotifications` già usa: elenco dal server + compensazioni mirate);
- **(b)** se si preferisce non introdurre due sorgenti, replicare qui il
  gen-counter a mano — ma allora va replicato **anche** in B-2, e a quel punto è
  la terza copia della stessa regola: vedi il suggerimento strategico n.1.

#### Come è stato chiuso

Strada **(a)**, con una correzione al primitivo che il rilievo non aveva
previsto: `useCaricamento` non esponeva un setter, ed **era quella mancanza a
tenere il pannello sulla guardia di solo smontaggio**. Aggiungerne uno
(`imposta`) è meno invasivo delle due sorgenti di verità che (a) proponeva —
l'elenco resta uno solo, e gli scostamenti ottimistici (l'allegato caricato che
va in cima, quello eliminato che esce) scrivono su quello stesso stato. La
guardia sulle due corse non si indebolisce: vive nell'effetto, e `imposta` non
la attraversa. Il preambolo dell'hook dichiara il confine, ⛔ compreso: se il
valore viene dalla rete, viene da `carica`.

Due cose scoperte facendolo:

1. **`{ data: null, error: null }` è un dato valido per l'hook**, e
   `TaskFiles.listForTask` può rispondere così. Il `setFiles(data || [])` del
   caricamento a mano non era difensivo: era la normalizzazione, e andava
   spostata dentro `carica` invece di sparire.
2. **Il conteggio in testata aveva lo stesso difetto dell'elenco**, un livello
   più su: `ALLEGATI (3)` restava quello del task precedente mentre il nuovo
   caricava, contraddicendo il «Caricamento…» che gli stava sotto. È ora dietro
   `!loading` — la stessa famiglia di M-2, trovata perché la correzione passava
   di lì.

`src/test/tasks/taskAttachmentsCorse.test.jsx`, due casi, **entrambi verificati
contro il codice precedente**: falliscono sulla guardia di solo smontaggio, che
è il modo in cui questo difetto si presenta.

⚠️ **Cosa resta aperto in questo file, trovato correggendo e non chiuso.**
`handleFiles` ha la stessa corsa sul percorso del GESTORE: fra l'`await` di
`TaskFiles.upload` e lo scostamento ottimistico, `taskId` può essere cambiato, e
`montato()` — che è il contratto giusto per un gestore — non lo vede. L'allegato
appena caricato finirebbe in cima all'elenco della pratica sbagliata. Non è
stato corretto qui perché non è la stessa correzione: `useCaricamento` non
c'entra (non c'è nessun effetto), e la risposta è una domanda di progetto —
se il contratto dei gestori debba conoscere il proprio SOGGETTO oltre al proprio
montaggio. Va deciso, non aggiunto di straforo dentro un rilievo che parlava
d'altro.

---

### M-2 · `TaskHistoryPanel`: `caricando` non si riapre al cambio di task

**Dove.** `src/components/tasks/TaskHistoryPanel.jsx:41-63` e `:77`.

```js
const [righe, setRighe] = useState([]);
const [caricando, setCaricando] = useState(true);   // ← solo il valore INIZIALE

const carica = useCallback(async (isCurrent) => {
  const { data, error } = await TaskThreads.historyForTask(taskId);
  if (!montato() || (isCurrent && !isCurrent())) return;
  …
  setCaricando(false);                              // ← non torna mai a true
}, [taskId, montato]);

useDebouncedTableSubscription(["task_history"], carica, { deps: [taskId], … });
```

**Perché è una criticità.** La corsa qui **è** gestita bene — `deps: [taskId]`
fa ripartire la sottoscrizione con un gen-counter nuovo, ed è il motivo per cui
questo pannello non compare in M-1. Il difetto è l'altro: passando dal task A al
task B, `righe` contiene ancora la cronologia di A e `caricando` è `false`,
quindi il pannello disegna

```
CRONOLOGIA (7)      ← il conteggio di A
· priorità → alta, da Marco, 3 giorni fa      ← eventi di A
```

sotto il titolo di **B**, finché la query non risponde. È precisamente ciò che
`docs/CLAUDE.md` chiama *stato di attesa disonesto*, e in un pannello che serve
a rispondere a «chi ha cambiato cosa» — quello che si apre quando qualcosa non
torna — è la risposta sbagliata data con sicurezza.

**Soluzione.** Riaprire lo stato di attesa quando cambia il soggetto. Lo si
ottiene senza un secondo `useEffect`, legando i dati al task a cui appartengono:

```js
// Le righe portano con sé il task di cui sono la cronologia: finché non
// coincide con quello a schermo, ciò che abbiamo in mano è la cronologia di
// qualcun altro e va trattato come «non ancora arrivata», non come «questa».
// Un solo stato invece di due tenuti allineati a mano.
const [caricato, setCaricato] = useState({ taskId: null, righe: null });
const caricando = caricato.taskId !== taskId;
const righe = caricando ? null : caricato.righe;

const carica = useCallback(async (isCurrent) => {
  const { data, error } = await TaskThreads.historyForTask(taskId);
  if (!montato() || (isCurrent && !isCurrent())) return;
  if (error) console.error("[VoyageDesk] TaskThreads.historyForTask", error);
  setCaricato({ taskId, righe: error ? null : (data || []).map(fromDbHistory) });
}, [taskId, montato]);
```

Il render sotto già distingue `caricando` da `righe === null` (errore) e da
`righe.length === 0` (nessuna cronologia): non cambia.

---

### M-3 · `caricaStorico`/`caricaClienti` senza generazione condivisa

**Dove.** `src/hooks/useAppHydration.js:410-429` e `:441-457`.

**Perché è una criticità.** Le due funzioni fanno una query e dispatchano
`SET_TASKS`/`SET_CLIENTS` **senza alcuna guardia**: né `isCurrent()` (non ne
hanno uno: non nascono dentro l'effetto della sottoscrizione) né una generazione
propria. Un solo verso è protetto, e a mano:

```js
// nel reload della sottoscrizione — protegge il reload dallo storico
if (!completo && storicoCompleto.current) return;
```

Il verso opposto no. Se il reload della sottoscrizione parte **dopo**
`caricaStorico` (quindi già con `completo = true`, corpus intero) ma risponde
**prima**, l'array più recente viene poi sovrascritto dalla risposta più vecchia
di `caricaStorico`. Entrambe sono il corpus intero, quindi la perdita è di
freschezza e non di righe — è per questo che è Media e non Alta — ma è
esattamente il *last-write-wins fra due fetch concorrenti* che tutto il resto
del file esiste per escludere, e la finestra si allarga quando si aprono
Archivio o Cestino su una connessione lenta.

`useListeData` ha già risolto lo stesso identico problema, e il suo commento
spiega perché la soluzione è quella:

> *«Incrementando `genRef` a OGNI reload, da qualunque origine, l'ordine di
> ARRIVO delle risposte smette di contare: conta solo l'ordine di PARTENZA.»*

**Soluzione.** La stessa, portata qui.

```js
// M-3 · La generazione condivisa fra il reload della sottoscrizione e i due
// caricamenti su richiesta (storico, anagrafica). Senza, le tre origini si
// ignorano a vicenda e vince chi risponde per ultimo invece di chi è partito
// per ultimo — vedi useListeData.js, dove la stessa correzione è già in piedi.
const genTaskRef = useRef(0);

const caricaStorico = useCallback(async () => {
  if (!enabled || storicoCompleto.current) return;
  storicoCompleto.current = true;
  setCaricandoStorico(true);
  const mia = ++genTaskRef.current;
  const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
  if (mia !== genTaskRef.current) { setCaricandoStorico(false); return; }
  …
}, [enabled, dispatch, onError, segnaCaricata]);
```

e, nel reload della sottoscrizione, la stessa coppia in AND con `isCurrent()`:

```js
const mia = ++genTaskRef.current;
const { data, error } = await TasksAPI.list({ … });
if (!isCurrent() || mia !== genTaskRef.current) return;
```

Idem per `caricaClienti` con un `genClientiRef`. La riga `if (!completo &&
storicoCompleto.current) return;` resta: dice una cosa diversa (*la risposta in
mano è più STRETTA di ciò che lo stato deve contenere*) e la generazione non la
copre.

#### Come è stato chiuso

`genTask` e `genClienti`, in AND con `isCurrent()` — più **due** metà che il
rilievo non aveva viste, e sono loro il contenuto vero della correzione.

**La prima: il turno lo consuma chi SCRIVE, non chi parte.** La forma proposta
qui sopra (`if (mia !== gen.current) return;` subito dopo l'`await`) è «vince
chi è partito per ultimo», e sbaglia un caso — scoperto rileggendo il proprio
diff, non da un test che falliva: una richiesta più recente che **fallisce** non
porta dati, ma avendo già preso il turno scarterebbe la risposta più vecchia che
i dati ce li ha. Si butterebbe via un'anagrafica arrivata per intero perché una
seconda richiesta, partita dopo, ha trovato la rete giù — cioè si trasformerebbe
un errore transitorio in una perdita di dati, che è peggio della corsa che si
stava chiudendo. Il contatore ha quindi due metà: `emesse` (le richieste
partite) e `scritte` (l'ultimo turno che ha davvero scritto), e `vinceIlTurno`
si chiama **dopo** aver gestito l'errore, sul solo percorso che dispatcha.

**La seconda: chi consegna il corpus chiude l'attesa, chiunque dei due sia.**

Scrivere solo la generazione avrebbe spostato il difetto invece di chiuderlo. Il
ramo «sono stale» di `caricaStorico` non può chiudere `caricandoStorico`: lo
chiuderebbe mentre il corpus è ancora in volo, cioè mostrerebbe un Archivio
incompleto come completo — la classe di guasto peggiore fra quelle che questo
progetto si vieta. E non può nemmeno non chiuderlo da nessuna parte, o resterebbe
uno scheletro perpetuo. I due flag hanno quindi smesso di significare «la MIA
richiesta è in volo» per significare «il corpus non è ancora in stato», e li
chiude chi consegna, su **ogni** esito — riuscito o fallito.

Per i clienti la fabbrica `idratazione` ha preso due opzioni (`gen`,
`alTermine`) invece di essere aggirata: sono generiche — «questa entità ha più
di uno scrittore», «c'è un'attesa da chiudere oltre al flag di entità» — e
tenere `clients` fuori dalla fabbrica avrebbe riaperto M-1 del 26 agosto.

Cinque casi nuovi (`storicoTask.test.jsx`, `clientiRealtime.test.jsx`): per
ciascuna delle due entità il verso della corsa che il rilievo descrive e la
contropartita sul flag, più il caso della richiesta più recente che fallisce.
**I due casi sulla corsa falliscono senza la generazione, e quello sul
fallimento fallisce sulla versione ingenua di essa** — cioè su ciò che il
rilievo proponeva; gli altri due presidiano il modo in cui la correzione stessa
potrebbe rompersi.

---

### B-1 · Il badge dei non letti conta solo le 100 notifiche più recenti

**Dove.** `src/lib/api/notifiche.js:17-21`, `src/hooks/useNotifications.js:43`,
`src/components/shell/Topbar.jsx:100`.

`Notifications.list({ limit: 100 })` è l'unica sorgente del feed, e il badge è
`notifList.filter(n => !n.read).length`. Un utente che accumula più di cento
notifiche (la chat ne genera una per messaggio: `20260725_chat_message_notifications`)
ha un non letto invisibile e **non contato**, senza che nulla lo dica. È la
stessa classe di guasto che `lib/pagination.js` esiste per chiudere — *«non
sbaglia: omette, e in silenzio»* — qui però con un `limit` esplicito, quindi non
c'è un cap del server da paginare: c'è una decisione da rendere onesta.

**Soluzione.** Non paginare tutto (un feed non serve intero), ma **separare il
conteggio dall'elenco**: il totale dei non letti non deve dipendere da quante
righe si è scelto di disegnare.

```js
// src/lib/api/notifiche.js
// Il CONTEGGIO dei non letti, indipendente dalla finestra dell'elenco: il
// badge dice «quante ne hai», e non deve poter dire una cosa diversa solo
// perché il pannello ne disegna cento. `head: true` non trasferisce righe —
// è un Content-Range e basta.
contaNonLette: () =>
  supabase.from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false),
```

`useNotifications` lo rilegge nello stesso reload e lo espone come
`nonLetteTotali`; la Topbar usa quello per il badge e l'elenco resta a 100. In
subordine — se si preferisce non aggiungere una query — basta rendere il
troncamento visibile nel pannello («mostrate le 100 più recenti»), che è meno
buono ma smette di affermare il falso.

---

### B-2 · `ClienteListePanel`: stessa corsa di M-1, finestra più stretta

**Dove.** `src/components/liste/ClienteListePanel.jsx:42-67`.

Identico a M-1: `useIsMounted()` come sola guardia, `load` con `[cliente.id]`
nelle dipendenze, due risposte che possono incrociarsi. La finestra è più
stretta perché `ClienteDetailPanel` riporta al tab «Task» al cambio cliente
(`:38-44`), quindi il pannello di norma si smonta — ma non quando
`initialTab === "liste"`, che è il percorso da cui si arriva cliccando il badge
delle liste in `ClientiView`. Stessa correzione di M-1, e va fatta insieme: sono
i due call site che restano fuori da `useCaricamento`.

#### Come è stato chiuso

Stessa correzione di M-1, e qui il conto è più netto: il pannello aveva **tre**
`useState` scritti a mano (dato, flag, errore) più il `useCallback` e il
`useEffect`, e ne resta una chiamata sola. Le due query viaggiano dentro lo
stesso `carica` e atterrano in un oggetto solo — `{ liste, saldi }` — così le
due metà non possono mai essere di due clienti diversi, che era una corsa in
più di cui il rilievo non parlava.

L'unica cosa che l'hook non dava è il **«Riprova»** del riquadro d'errore.
Non è diventato una seconda porta d'ingresso (`ricarica()` chiamata da un
gestore, che dovrebbe rifarsi la guardia per conto proprio): un tentativo nuovo
**è** un caricamento nuovo, quindi si dichiara come tale, fra le dipendenze.

---

## Top 3 suggerimenti strategici

### 1 · Un contratto solo per «la risposta è arrivata tardi», e renderlo verificabile

Il progetto ha **tre** risposte alla stessa domanda — `isCurrent()` del
gen-counter, `useIsMounted()`, `useCaricamento()` — e `useCaricamento` è già
quella giusta per il caso «carico in un effetto». Ne mancano due call site
(M-1, B-2) e una terza forma scritta a mano (M-3), ed è per questo che la
domanda continua a riaprirsi: chi scrive il prossimo pannello parte dal vicino,
e il vicino oggi è `useIsMounted()` da solo.

Il passo non è convertire i due file — è **togliere la scelta**. Una regola in
`eslint.config.js`, nella famiglia di quelle già presenti
(`VIETATE_ENTITA_DELLO_STATE`, `VIETATI_MODULI_API_INTERNI`), che segnali
`useIsMounted()` usato in un componente che ha anche un `useEffect` di
caricamento, indirizzando a `useCaricamento`. `useIsMounted` resta legittimo
dov'è oggi corretto — dentro un **gestore** (`useSalvataggio`, `BulkInviteModal`,
`AccountSicurezza`, `ProfileEditor`) — e smette di essere ciò che si eredita
copiando.

**Impatto:** chiude M-1, M-3 e B-2, e soprattutto chiude la *classe*. Costo: una
regola e due file.

#### Come è stato chiuso — e cosa si è scoperto facendolo

Fatto: M-1, M-3 e B-2 chiusi, e il confine è ora presidiato. **Ma non da una
regola ESLint, e non è un ripiego.**

`no-restricted-syntax` valuta un nodo per volta e non ha memoria di ciò che il
file contiene altrove, mentre il predicato qui è RELAZIONALE — «questo file
importa `useIsMounted` **e** chiama `useEffect(`». Un selettore sul solo import
segnalerebbe anche i quattro usi legittimi (`BulkInviteModal`,
`AccountSicurezza`, `ProfileEditor`, `useSalvataggio`), cioè esattamente il caso
da permettere. Il presidio vive quindi in `verifica:convenzioni`, con atteso
**0** — che è dove il progetto mette già i predicati relazionali, per la stessa
ragione per cui M-3 del 26 agosto non è diventato una regola di lint.

**Il controllo ha trovato subito un caso che il rilievo dava per inesistente**,
ed è la cosa più utile successa qui: `src/hooks/useSalvataggio.js` importa
`useIsMounted` per il proprio gestore **e** ha un `useEffect` che tiene fresco un
ref. Nessun caricamento, nessuna corsa — il predicato era giusto sui consumatori
e sbagliato sui contratti. La risposta **non** è stata un'eccezione nominata
(`docs/CLAUDE.md`: «un controllo con una lista di eccezioni che cresce ha smesso
di controllare») ma un PERIMETRO dichiarato: `src/components/**`, lo stesso
confine che `eslint.config.js` traccia per le entità dello stato, e per lo stesso
motivo — `src/hooks/` è il layer in cui gli effetti sono la materia, non un modo
di caricare.

Il perimetro porta con sé i suoi due controlli positivi, perché *«un atteso di 0
protegge dal debito che CRESCE, non dal perimetro che si RESTRINGE»*: il
controllo solleva se nessun componente importa più `useIsMounted` (il perimetro
si è svuotato) e se nessuno importa `useCaricamento` (la diagnosi resterebbe
senza rimedio). Non un numero di file dichiarato a mano, che sarebbe rosso a ogni
gestore legittimo nuovo: la sua **non-vacuità**, che è ciò che davvero può venire
a mancare.

⛔ Resta dichiarato ciò che segnalerebbe ancora a torto: un componente con un
`useEffect` che non carica — un focus trap, un listener di tastiera — più un
`useIsMounted()` per il proprio gestore. Oggi non ne esiste nessuno. Se ne
nascesse uno, la risposta non è l'eccezione: è che quel file ha due lavori.

Effetto collaterale, misurato: i sette casi nuovi portavano
`verificaConvenzioni.test.js` da 485 a 563 righe di codice, oltre il tetto
`max-lines` che dal 23 agosto non ha deroghe. Stanno in
`src/test/scripts/guardiaDiSoloSmontaggio.test.js`.

### 2 · Finire di applicare l'invariante delle scritture in volo alle due entità scoperte

`fondiScrittureInVolo` è scritta bene, è testata, e copre tre entità su cinque.
Le due scoperte — **team** (A-3) e **notifiche** (A-2) — non sono le meno
importanti: il team è il dato da cui dipendono i permessi lato client, le
notifiche sono il feed che l'utente tocca più spesso. In entrambe il guasto è lo
stesso e non si vede: un'azione riuscita che si annulla da sola a schermo, senza
che nulla venga poi a correggerla.

E poiché la regola oggi vive **per convenzione**, il passo che conta è il
controllo: un test che enumera le entità pubblicate su `supabase_realtime` e
verifica che ogni `SET_*` corrispondente passi da `fondiScrittureInVolo` e che
ogni entry del registry che le muta dichiari `entityId`. Il progetto ha già
`realtimeOriginContract.test.js`, che misura esattamente questo tipo di
invariante fra codice e database: è lo stesso schema, applicato all'altra metà
del contratto realtime.

**Impatto:** chiude A-2 e A-3 e impedisce alla sesta entità di ripetere il
difetto.

#### Come è stato chiuso — e perché il controllo non è quello proposto

A-2 e A-3 sono chiusi. Il presidio esiste, ⛔ **ma non enumera le tabelle
pubblicate su realtime, e non è un ripiego.**

Guardando davvero l'elenco, quell'enumerazione avrebbe avuto bisogno di
eccezioni entro la prima riga: delle quattordici tabelle in publication, tre
non hanno alcuno stato in blocco (`task_history` vive nel pannello che la
mostra), tre sono il modulo Liste che non passa dal reducer, e due —
`categories`, `message_templates` — hanno sottoscrizioni **`senzaCanale`**,
cioè nessun evento altrui che faccia ripartire il loro refetch. Un controllo
che parte dalle tabelle deve dichiararle una per una; e «un controllo con una
lista di eccezioni che cresce ha smesso di controllare».

Il predicato che regge senza eccezioni è più stretto e più preciso, e sta in
`scrittureInVoloAMeta` (`verifica:convenzioni`, atteso **0**): **nessuna delle
due metà può esistere senza l'altra.** Cioè
  · una fetta che il reducer FONDE deve avere almeno una entry che la MARCA
    (altrimenti la fusione gira su una mappa sempre vuota: si legge come una
    protezione e non lo è);
  · una entry che MARCA deve scrivere una fetta che qualcuno FONDE (altrimenti
    marca id che nessuno consulta);
  · e una sottoscrizione con **canale vivo** che dispatcha un `SET_*` deve
    fondere — dove «canale vivo» è letto dal codice (`senzaCanale`) e non
    dichiarato a mano, che è ciò che rende il perimetro derivato invece che
    ricopiato.

È il predicato giusto perché è il modo in cui questa classe si guasta: **ognuna
delle due metà, da sola, fa sembrare fatta l'altra.** Il team era scoperto da un
anno con entrambe mancanti — non c'era neanche una metà a fare da indizio.

⛔ Il costo, dichiarato nel preambolo del controllo invece che taciuto: i feed
FUORI dal reducer (`useNotifications`, `useChatData`) non passano da alcun
`SET_*` e lì non si vedono; a misurarli sono i loro test di comportamento. È il
motivo per cui `conversations` — l'ultimo stato in blocco senza fusione — è
registrato come rilievo aperto sotto A-2 e non come eccezione dentro il
controllo.

Undici casi in `src/test/scripts/scrittureInVoloAMeta.test.js`, di cui **quattro
riproducono le forme esatte del codice prima di A-3** e quattro sono i controlli
positivi di sé stesso (il controllo solleva se perde i soggetti, se un parser
diventa cieco, o se non distingue più le due classi di sottoscrizione).

### 3 · Chiudere il buco fra `applyRow` e i reload in volo

`applyRow` è la correzione che ha ridotto di più il traffico e il costo del
flusso dati, ed è l'unico punto in cui la freschezza può **regredire in modo
permanente** invece di limitarsi a ritardare. Il difetto (A-1) è sottile per una
ragione precisa: il gen-counter protegge i reload *fra loro*, ma `applyRow` non
è un reload, quindi non partecipa a quell'ordine — e la riga che applica è, per
costruzione, più recente di qualunque risposta già chiesta.

Vale come suggerimento strategico e non solo come rilievo perché tocca
l'astrazione condivisa da **nove** sottoscrizioni: correggerlo in
`useDebouncedTableSubscription` lo corregge ovunque, oggi e per ogni
sottoscrizione futura, senza toccare un solo consumatore.

**Impatto:** chiude A-1 su `tasks`, `notices` e `clients` insieme, e mette la
proprietà «l'ordine di partenza è l'unico che conta» al riparo dall'unico
percorso che ancora la aggira.

---

## Cosa è stato verificato e non ha prodotto rilievi

Perché il perimetro di questo audit sia leggibile anche fra sei mesi:

- **Re-render.** Viste tutte in `memo`, `value` dei contesti memoizzati su una
  dipendenza per riferimento, callback del guscio stabili, `state` non più
  passato come prop. `memoViste.test.jsx` blinda la parte fragile. Nessun
  rilievo.
- **Chiamate ridondanti.** Il team non si rilegge al mount
  (`saltaPrimoCaricamento`), la cronologia non si rilegge per tutti i task,
  i commenti si chiedono per id, l'anagrafica e lo storico partono su richiesta,
  `categories`/`message_templates` non tengono un canale aperto. Nessun rilievo.
- **Caching.** `Messages.listAll()` rilegge il corpus a ogni evento, ma è una
  decisione dichiarata **con una soglia che il codice controlla e segnala**
  (`SOGLIA_MESSAGGI_CORPUS`): è debito misurato, non debito dimenticato.
- **Stati di attesa.** Un flag per entità, chiuso sia sul successo sia
  sull'errore, con l'anagrafica che parte da `false` perché nessuno l'ha ancora
  chiesta. L'unica eccezione trovata è M-2.
- **Purezza degli updater.** Nessuna chiamata di rete dentro un `setState`
  updater; le tre occorrenze storiche sono state corrette e ciascuna ha il
  proprio commento sul perché. Nessun rilievo.
- **Ciclo di vita dei canali.** Ogni `subscribeTo*` ha il proprio cleanup, i
  topic sono univoci, l'eco è filtrata per `origin_client` con il caso `DELETE`
  trattato a parte e spiegato. Nessun rilievo.
