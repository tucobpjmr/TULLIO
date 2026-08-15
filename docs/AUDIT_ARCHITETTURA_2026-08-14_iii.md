# Audit architettura, struttura e sicurezza — 14 agosto 2026 (terzo passaggio)

Perimetro richiesto: organizzazione di cartelle e moduli, separazione delle
responsabilità (logica di business, chiamate API, stato locale, componenti UI),
duplicazione, anti-pattern React/JavaScript, componenti troppo estesi.

È il **terzo audit dello stesso giorno**. I due precedenti
([`AUDIT_ARCHITETTURA_2026-08-14.md`](AUDIT_ARCHITETTURA_2026-08-14.md) e
[`_ii`](AUDIT_ARCHITETTURA_2026-08-14_ii.md)) hanno chiuso diciotto rilievi,
tutti verificati chiusi qui. Ripartire da una codebase già ripulita due volte
nella stessa giornata ha senso a una condizione: non rileggere ciò che è appena
stato corretto, ma **prendere le regole appena scritte e chiedersi dove NON
sono state applicate**. Cinque dei nove rilievi di oggi nascono esattamente
così — sono la stessa lacuna di un rilievo già chiuso, rimasta aperta nel
sottosistema gemello:

| Regola stabilita da… | …e non applicata a |
|---|---|
| C-1 del 2° passaggio: una scrittura rifiutata dalla RLS non mette nulla in `error` | la chat e il modulo Liste, che scrivono senza passare da `useSyncedDispatch` (**A-2**) |
| A-1 del 2° passaggio: guard di permesso sulle mutazioni dell'anagrafica | l'import in blocco, l'unica delle quattro rimasta scoperta (**M-1**) |
| `entityId` + `pendingWrites`, e la migrazione che ha messo `clients` in realtime | `SET_CLIENTS`/`SET_NOTICES`, che sostituiscono l'array senza guardare le scritture in volo (**A-1**) |
| il `rollback` che le altre due mutazioni del pannello Team hanno | `APPROVE_TEAM_MEMBER` e `REMOVE_TEAM_MEMBER` (**M-2**) |
| «l'updater di `setState` deve restare PURO», scritto in cima a `chatCommands.js` | `toggleReaction`, che dentro l'updater assegnava le variabili del proprio rollback (**M-3**) |

> **Tutti e nove i rilievi ✔ chiusi, lo stesso 14 agosto**, nello stesso branch
> di questo documento. `npx vitest run` finale: **1316 passati** (era 1282), 7
> skip, 112 file + 1 skip; `npm run lint`: 0 errori, 0 warning;
> `npm run verifica:convenzioni`: nessuna divergenza; `npm run build`: ok.

Verifiche eseguite al momento dell'analisi: `npm ci && npx vitest run` (**1282
passati**, 7 skip — lo stato lasciato dal secondo passaggio), lettura integrale
del data layer (`lib/api.js`), del registry di persistenza e del suo
orchestratore, dei tre sottosistemi di scrittura (core, chat, Liste), degli
hook di idratazione e realtime, di `auth/AuthContext.jsx`, delle cinque Edge
Function e dei loro helper condivisi, delle policy di `conversations`,
`messages` e del bucket `chat-files` nelle migrazioni che le definiscono, di
CSP e header in `vercel.json`, del percorso di import/export (SheetJS, CSV) e
di `docs/CLAUDE.md` contro il codice che descrive.

> **Nota di metodo — un rilievo che stavo per scrivere e non c'è.**
> `openTaskById` (`VoyageDeskInner.jsx`) dichiara `[state.tasks, dispatch]`
> nelle dipendenze, quindi cambia identità a ogni mutazione dei task e la prop
> `onOpenTask` invalida il `memo` di `<Topbar>`: la stessa forma del difetto di
> `openChatTo` chiuso in ST-2. Prima di scriverlo l'ho verificato invece di
> dedurlo, ed è **falso**: `Topbar` chiama `useTasks()` (`Topbar.jsx:89`), cioè
> è iscritta a `TasksContext`, il cui value è memoizzato sulla stessa identità.
> Si ri-renderizza quando i task cambiano comunque, con o senza quella
> dipendenza — stabilizzare la callback avrebbe aggiunto un ref e tolto zero
> render. Il codice porta ora quella verifica scritta accanto, così il prossimo
> a passare di lì non rifà la stessa deduzione.

---

## 1. Executive Summary

**Il progetto è in ottima salute architetturale, e i tre livelli che lo
reggono sono applicati, non dichiarati.** `lib/api.js` resta l'unico punto che
parla con Supabase per il core, con due eccezioni deliberate e protette da
regole di lint. Le mutazioni si dichiarano in un registry (`state/persistence.js`)
invece di spargersi nei componenti, e il registry e il reducer chiamano *le
stesse funzioni pure* di `lib/permissions.js` sullo stesso `state.team`, con un
test che verifica azione per azione che i due verdetti coincidano. I due
sottosistemi fuori dal reducer — chat e Liste viaggio — hanno ciascuno il
proprio registry esplicito. Nessun `dangerouslySetInnerHTML`, nessun `eval`,
CSP senza una sola direttiva permissiva, bucket privati con MIME allowlist,
formula-injection neutralizzata sull'export CSV, parsing dei file importati
dietro un guard anti prototype-pollution e un tetto di dimensione. Il file più
lungo di `src/` è il reducer (541 righe effettive) e il componente più lungo è a
435: non esiste un monolite.

**Il difetto più grave di oggi non è in un livello ma in un ORDINE.**
`chatCommands.removeConversation` eseguiva due passi sul server: prima
cancellava dal bucket **tutti** gli allegati della conversazione — vocali,
documenti di pratica, foto di passaporti caricate da qualunque partecipante —
poi cancellava la riga. L'ordine aveva una ragione scritta accanto ed era
corretta (dopo il DELETE della riga le policy dello storage non autorizzano più
la pulizia), ma metteva l'operazione **irreversibile** per prima e condizionata
a nulla: se la DELETE falliva — la rete che cade fra due `await`, su mobile, non
è un caso limite — la conversazione restava viva per tutti i partecipanti con
ogni allegato distrutto e non recuperabile. E poteva anche non fallire affatto
pur non facendo niente: `Conversations.remove` non chiedeva `count`, quindi un
rifiuto della RLS era indistinguibile da una cancellazione riuscita, toast
verde compreso.

**Il secondo tema è una protezione che esiste, funziona, ed è rimasta ferma su
una sola entità mentre il database si muoveva sotto.** `pendingWrites` impedisce
che un refetch concorrente riporti a schermo il valore pre-scrittura, e
`state/persistence.js` dichiarava per iscritto di applicarlo ai soli task
perché «dichiararlo su clienti o avvisi marcherebbe id che nessuno rilegge».
Era vero il giorno in cui è stato scritto. Dalla migrazione `20260807215625`
`clients` **è** una tabella in realtime: il refetch concorrente esiste, e la
finestra si è aperta sull'entità più grande del progetto — l'unica che contiene
PII di persone esterne al team. Il sintomo è il peggiore che un'anagrafica
possa dare: il salvataggio si annulla da solo qualche secondo dopo il toast
verde, e sul database invece era andato a buon fine.

**Il terzo è un contratto giusto, scritto nel posto sbagliato.** Il secondo
passaggio ha stabilito che «è andata bene» non è `!res.error` e ha aggiunto
`count: 'exact'` agli otto metodi mirati a una riga — ma ha messo la LETTURA di
quel conteggio dentro `hooks/useSyncedDispatch.js`, cioè dentro l'orchestratore
del solo core. La chat e il modulo Liste scrivono senza passare di lì e sono
rimasti con la versione cieca. Non è una simmetria estetica: `Messages.setPinned`
chiedeva già il conteggio e nessuno lo leggeva — il pin è l'unica scrittura che
si fa sul messaggio **altrui**, cioè quella che il trigger
`messages_blocca_modifiche_altrui` sorveglia, quindi anche la più esposta al
rifiuto silenzioso.

**Il resto sono rilievi di manutenibilità**, tutti piccoli e tutti della stessa
famiglia: una guardia di permesso saltata sul gemello in blocco, due
compensazioni mancanti sul pannello Team, uno snapshot catturato dentro un
updater di `setState`, il margine del reducer sceso a **3 righe** dal proprio
tetto dichiarato, due metodi di scrittura senza chiamanti nel data layer, e la
prima riga di `docs/CLAUDE.md` — il documento che `INDEX.md` indica come da
leggere prima di ogni modifica — che descriveva ancora l'app come «un
single-file React da ~7071 righe».

---

## 2. Tabella delle priorità

| ID | Priorità | Rilievo | File |
|---|---|---|---|
| **C-1** ✔ | **Critico** | Eliminare una conversazione distrugge gli allegati di tutti i partecipanti PRIMA di sapere se la riga sarà davvero cancellata; nessun ripristino, e un rifiuto RLS passa per successo | `components/chat/chatCommands.js:114`, `lib/api.js:440` |
| **A-1** ✔ | Alta | `SET_CLIENTS`/`SET_NOTICES` ignorano `pendingWrites`: da quando `clients` è in realtime, un refetch concorrente annulla a schermo una modifica che il database ha accettato | `state/reducer.js:503,585`, `state/persistence.js` |
| **A-2** ✔ | Alta | Il contratto «`count === 0` è un rifiuto» vive dentro `useSyncedDispatch`: chat e Liste hanno la propria copia cieca. `Messages.setPinned` chiede un conteggio che nessuno legge | `hooks/useSyncedDispatch.js:44`, `components/chat/chatCommands.js` |
| **M-1** ✔ | Media | `ADD_CLIENTS_BULK` è l'unica mutazione dell'anagrafica senza `guard` né controllo nel reducer: l'import è protetto dal solo bottone nascosto | `state/persistence.js:354`, `state/reducer.js:597` |
| **M-2** ✔ | Media | `APPROVE_TEAM_MEMBER` e `REMOVE_TEAM_MEMBER` non hanno `rollback`: un fallimento lascia in UI un utente approvato/rimosso che il database non ha cambiato | `state/persistence.js:559,564` |
| **M-3** ✔ | Media | `toggleReaction` assegna le variabili del proprio rollback DENTRO l'updater di `setMessages` — l'impurità che l'intestazione dello stesso file condanna | `components/chat/chatCommands.js:264` |
| **M-4** ✔ | Media | `state/reducer.js` a 547 righe effettive contro il tetto dichiarato di 550: la deroga è esaurita, la prossima `case` rompe la build | `state/reducer.js`, `eslint.config.js` |
| **B-1** ✔ | Bassa | `docs/CLAUDE.md` descrive un'app che non esiste da mesi (single-file, CSS in `FontLoader`) e dichiara aperta una lacuna chiusa oggi | `docs/CLAUDE.md` |
| **B-2** ✔ | Bassa | `Comments.remove` e `Messages.remove`: due metodi di scrittura senza alcun chiamante nel data layer | `lib/api.js:406,505` |

Le righe di codice indicate sono quelle **prima** della correzione (commit
`HEAD` del branch di partenza), così restano leggibili accanto al `git diff`.

---

## 3. Action plan dettagliato

### C-1 · L'irreversibile veniva per primo — allegati di chat distrutti su una cancellazione che poteva non avvenire

> **✔ CHIUSO.** `chatCommands.removeConversation` ora cancella la riga per
> prima, ne legge il `count`, e tocca lo storage solo dopo una cancellazione
> confermata; `Conversations.remove` chiede `CONTA_RIGHE`; la conversazione
> torna in lista se il DELETE non passa. Guardie:
> `src/test/chatConvDeleteOrdine.test.js` (5 casi), più i due casi aggiornati
> in `chatConvDelete.test.jsx`. Migrazione
> `20260814220000_chat_files_delete_orfani.sql` per il costo residuo.

**Dov'era** — `src/components/chat/chatCommands.js:114-133`:

```js
const removeConversation = (convId) => {
  setConversations(prev => prev.filter(c => c.id !== convId));
  setMessages(prev => { /* … delete next[convId] … */ });
  if (!enabled || !isUuid(convId)) return;
  (async () => {
    const filesRes = await MessagesAPI.removeConversationFiles(convId);   // ① irreversibile
    if (filesRes?.error) console.warn("[chat] conv files cleanup", filesRes.error);
    const { error } = await ConversationsAPI.remove(convId);              // ② può fallire
    if (error) { fallito(…); return; }                                    // ③ nessun ripristino
    onSuccess("Conversazione eliminata");
  })();
};
```

**Perché è critico.** Tre difetti che si compongono, e nessuno dei tre è
visibile leggendo la funzione da sola.

1. **L'ordine.** Il commento accanto motivava ①-prima-di-② correttamente: la
   policy `chat_files_delete` (migrazione `20260705092239`) autorizza la
   pulizia a chi è *partecipante di una conversazione esistente*, quindi dopo
   il DELETE della riga i file diventerebbero orfani non cancellabili. Vero —
   ma la conclusione tratta era che l'operazione **irreversibile** andasse
   eseguita per prima, condizionata a nulla. Se ② fallisce (rete che cade fra
   due `await`, sessione revocata, utente tolto dai `participants` nel
   frattempo), la conversazione resta viva **per tutti i partecipanti** con
   ogni allegato già distrutto: vocali, documenti di pratica, copie di
   passaporti. Non c'è un rollback possibile per ①.
2. **Il rifiuto silenzioso.** `ConversationsAPI.remove` non chiedeva `count`.
   Una DELETE che la RLS filtra tocca zero righe e risponde 2xx: `error` è
   `null`, quindi il ramo di successo partiva lo stesso — «Conversazione
   eliminata», scomparsa dalla lista, riga ancora nel database. È esattamente
   il difetto C-1 del secondo passaggio, mai esteso alla chat.
3. **Nessun ripristino.** La conversazione e i suoi messaggi erano già tolti
   dallo stato locale; sul ramo d'errore restava solo un toast. Nessun evento
   realtime viene a rimetterli (una scrittura fallita non ne emette), quindi la
   divergenza dura fino al reload — e nel frattempo l'utente crede di aver
   cancellato una chat che gli altri continuano a vedere.

**Soluzione.** Riga prima, storage dopo, e il parametro diventa la
conversazione intera perché è ciò che serve a rimetterla in lista — la stessa
scelta già fatta per `setMessagePinned`, che riceve `pinned` esplicito invece
di dedurlo:

```js
const removeConversation = (conv) => {
  const convId = typeof conv === "string" ? conv : conv?.id;
  if (!convId) return;
  const snapshot = typeof conv === "string" ? null : conv;
  const scartaMessaggi = () => setMessages(prev => { /* … */ });

  setConversations(prev => prev.filter(c => c.id !== convId));
  if (!enabled || !isUuid(convId)) { scartaMessaggi(); return; }

  (async () => {
    const errore = esitoScrittura(await ConversationsAPI.remove(convId)); // legge anche count
    if (errore) {
      if (snapshot) {
        setConversations(prev => (prev.some(c => c.id === convId) ? prev : [snapshot, ...prev]));
      }
      fallito("conv.delete", errore, `Chat: eliminazione conversazione fallita: …`);
      return;                                    // lo storage NON viene toccato
    }
    scartaMessaggi();
    const filesRes = await MessagesAPI.removeConversationFiles(convId);
    if (filesRes?.error) console.warn("[chat] conv files cleanup", filesRes.error);
    onSuccess("Conversazione eliminata");
  })();
};
```

con, in `lib/api.js`, `remove: (id) => supabase.from('conversations').delete(CONTA_RIGHE).eq('id', id)`.

I messaggi **non** si tolgono più prima della conferma: senza la conversazione
in lista sono invisibili comunque, e tenerli è ciò che rende il ripristino
completo invece che una chat vuota.

**Il costo dichiarato, e come è stato azzerato.** Invertire l'ordine è il
rovescio dell'osservazione originale: al momento della pulizia la conversazione
non esiste più, quindi la policy autorizza il chiamante sui soli file di cui è
`owner_id` (o su tutti, se è admin) e gli allegati caricati dagli **altri**
partecipanti resterebbero come orfani. È un costo recuperabile — byte, e una
bonifica — contro una perdita di dati che non lo è, quindi la correzione vale
anche da sola; ma lasciare nel bucket allegati che un utente ha chiesto di
eliminare è un problema suo, di conservazione di dati personali. La migrazione
`supabase/migrations/20260814220000_chat_files_delete_orfani.sql` lo chiude
aggiungendo un quarto ramo alla policy di DELETE: un oggetto di `chat-files` il
cui primo segmento di path **non corrisponde ad alcuna conversazione** può
essere rimosso da qualunque utente autenticato. Si applica ai soli oggetti già
irraggiungibili (nessuna policy di SELECT li rende leggibili, nessun messaggio
li referenzia più) e non allarga di un millimetro l'accesso ai file vivi.

✔ **Applicata in produzione il 15 agosto** via MCP `apply_migration` (che
registra la propria versione, `20260815155307`; la versione del file,
`20260814220000`, è stata inserita a mano in
`supabase_migrations.schema_migrations` per allineare repository e database —
vedi `docs/MIGRAZIONI_SUPABASE.md`). Verificata `pg_policies`: i quattro rami
sono tutti presenti, `private.is_admin()` e non `public.is_admin()` (vedi nota
nel file). `get_advisors` (security e performance) non segnala nulla di nuovo:
tutti gli avvisi restituiti sono preesistenti e già noti.

---

### A-1 · `pendingWrites` proteggeva i soli task, mentre `clients` diventava una tabella in realtime

> **✔ CHIUSO.** `fondiScrittureInVolo` estratta in `state/pendingWrites.js` e
> usata dai tre case di lista; `entityId` dichiarato sulle sette entry di
> clienti e avvisi. Guardia: `src/test/pendingWritesClientiAvvisi.test.js`
> (16 casi).

**Dov'era** — `src/state/reducer.js:503` e `:585`:

```js
case "SET_NOTICES":
  return { ...state, notices: Array.isArray(action.payload) ? action.payload : [] };
…
case "SET_CLIENTS":
  return { ...state, clients: Array.isArray(action.payload) ? action.payload : [] };
```

**Perché.** `SET_TASKS` non sostituisce una riga che stiamo scrivendo, e il
commento in `state/persistence.js` spiegava perché le altre entità non
dichiarassero `entityId`: «il registro dei pendenti è consultato da `SET_TASKS`,
e dichiararlo su clienti o avvisi marcherebbe id che nessuno rilegge». Era una
decisione corretta *e datata*: senza una subscription su `clients` non esiste il
refetch concorrente da cui difendersi. La migrazione `20260807215625` ha messo
`clients` in realtime e nessuno è tornato a rileggere quella frase.

La sequenza, oggi, in produzione:

1. l'utente salva una scheda cliente → il reducer applica in ottimistico e
   mostra «Cliente aggiornato!»;
2. prima che la UPDATE committi, la scrittura di un **altro** utente qualsiasi
   fa ripartire `ClientsAPI.list()` (debounced, ma sono centinaia di ms);
3. la risposta è più recente per tutte le righe tranne la nostra, che il server
   serve ancora nel pre-immagine: `SET_CLIENTS` sostituisce l'array e la
   modifica sparisce dallo schermo;
4. quando la UPDATE committa, la sua eco realtime porta il nostro
   `origin_client` e viene **scartata** da `subscribeToTable` — quindi nessun
   secondo refetch viene a correggere la UI.

Il risultato è un salvataggio che si annulla da solo qualche istante dopo il
toast verde, su dati anagrafici, mentre sul database è andato a buon fine. Al
reload successivo il valore giusto ricompare: intermittente e auto-guarente,
cioè il modo migliore per essere attribuito alla rete per settimane. Vale
identico per gli avvisi.

**Soluzione.** La logica che viveva in linea dentro `SET_TASKS` diventa una
funzione sola — non per riusarla in tre punti, ma perché è l'invariante («per un
id in volo vince SEMPRE la riga locale») e un'invariante scritta tre volte è
un'invariante che regge fino alla prima distrazione:

```js
// src/state/pendingWrites.js
export function fondiScrittureInVolo(incoming, locali, pending) {
  const arrivate = Array.isArray(incoming) ? incoming : [];
  if (!pending?.size) return arrivate;
  const correnti = locali || [];
  const perId = new Map(correnti.map(r => [r.id, r]));
  const tenute = arrivate
    .filter(r => !pending.has(r.id) || perId.has(r.id))
    .map(r => (pending.has(r.id) ? perId.get(r.id) : r));
  const serviti = new Set(arrivate.map(r => r.id));
  const nonAncoraSulServer = correnti.filter(r => pending.has(r.id) && !serviti.has(r.id));
  return nonAncoraSulServer.length ? [...nonAncoraSulServer, ...tenute] : tenute;
}
```

```js
// state/reducer.js — i tre case
case "SET_TASKS":
  return { ...state, tasks: fondiScrittureInVolo(action.payload, state.tasks, state.pendingWrites) };
case "SET_NOTICES":
  return { ...state, notices: fondiScrittureInVolo(action.payload, state.notices, state.pendingWrites) };
case "SET_CLIENTS":
  return { ...state, clients: fondiScrittureInVolo(action.payload, state.clients, state.pendingWrites) };
```

La fusione non serve a niente se le entry non dichiarano cosa stanno scrivendo:
`entityId` è stato aggiunto ad `ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`,
`ADD_CLIENTS_BULK` (l'array intero del batch), `ADD_NOTICE`, `UPDATE_NOTICE`,
`DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`. È la metà del meccanismo che si dimentica
quando si aggiunge una entry, perché tutto continua a funzionare — tranne in
una finestra di qualche centinaio di ms che nessun test tocca: per questo il
test la verifica entry per entry.

---

### A-2 · «È andata bene» aveva tre definizioni, e due erano cieche

> **✔ CHIUSO.** `esitoScrittura()` + `RIFIUTO_RLS` estratti in
> `src/lib/esitoScrittura.js`, usati da `useSyncedDispatch` e da tutti e sette
> i comandi della chat. Guardia: `src/test/esitoScrittura.test.js`.

**Dov'era** — `src/hooks/useSyncedDispatch.js:44-51`, e la sua assenza in
`components/chat/chatCommands.js` (sette `if (r?.error)`) e in
`components/liste/listePersistence.js`.

**Perché.** C-1 del secondo passaggio ha stabilito il fatto che conta — una
`UPDATE`/`DELETE` rifiutata dalla RLS non produce alcun errore, perché la
clausola `USING` filtra le righe invece di sollevare — e ha aggiunto
`count: 'exact'` agli otto metodi del data layer mirati a una riga per chiave
primaria. Ma ha messo la **lettura** di quel conteggio dentro l'orchestratore
del core. Un contratto che vale per il data layer intero non può vivere dentro
uno dei suoi consumatori: gli altri due sottosistemi che scrivono — la chat, che
è quello con la frequenza di scrittura più alta dell'app, e il modulo Liste —
sono rimasti alla versione di prima.

Il caso che rende la cosa misurabile e non teorica: `Messages.setPinned`
**chiede già** `count: 'exact'` (fu aggiunto insieme agli altri sette) e nessun
chiamante lo legge — il conteggio viaggia sulla rete a ogni pin e viene buttato
via. Il pin è anche l'unica scrittura che si fa sul messaggio **altrui**, cioè
quella sorvegliata dal trigger `messages_blocca_modifiche_altrui`
(`20260806150000`): è la più esposta al rifiuto, ed era l'unica senza rete di
sicurezza.

**Soluzione.**

```js
// src/lib/esitoScrittura.js
export const RIFIUTO_RLS = {
  message: "operazione non consentita dal database (permessi insufficienti)",
};

export const esitoScrittura = (r) => {
  if (r?.error) return r.error;
  if (typeof r?.count === "number" && r.count === 0) return RIFIUTO_RLS;
  return null;
};
```

`useSyncedDispatch` la importa al posto della propria copia
(`import { esitoScrittura as esito } from "../lib/esitoScrittura.js"`), e i
comandi della chat passano da `if (r?.error)` a
`const errore = esitoScrittura(r); if (errore) …`. Il pin guadagna anche il
ripristino che gli mancava — lo stato precedente arriva dal chiamante, che il
messaggio ce l'ha già sotto mano:

```js
const setMessagePinned = (convId, msgId, pinned, pinnedBy = null, precedente = null) => {
  …
  MessagesAPI.setPinned(msgId, pinned, pinned ? pinnedBy : null).then(r => {
    const errore = esitoScrittura(r);
    if (errore) {
      const prima = precedente || { pinned: !pinned, pinnedBy: null, pinnedAt: null };
      setMessages(prev => ({ …ripristina il solo messaggio toccato… }));
      fallito("msg.pinned", errore, `Chat: pin fallito: …`);
    }
  });
};
```

L'adozione resta **per-metodo**: dove il data layer non chiede il conteggio
(`markAllRead` su zero non lette, `hardDeleteMany` su un cestino vuoto — casi in
cui zero righe è un esito normale) il comportamento non cambia di una virgola.

---

### M-1 · L'import dell'anagrafica era protetto da un bottone nascosto

> **✔ CHIUSO.** `guard: canEditClient` sulla entry, stesso rifiuto nel case del
> reducer, e lo scenario aggiunto alla verifica di parità
> (`persistenceGuards.test.js`, 4 ruoli × 1 scenario).

**Dov'era** — `src/state/persistence.js:354` (`ADD_CLIENTS_BULK`, nessun
`guard`) e `src/state/reducer.js:597` (il case, nessun controllo).

**Perché.** A-1 del secondo passaggio ha dato un guard a `ADD_CLIENT`,
`UPDATE_CLIENT` e `DELETE_CLIENT` — e ha saltato il gemello in blocco. Il gate
rimasto era il fatto che `ClientiView.jsx:200` non renderizzi il pulsante
«Importa da Excel» per chi non ha `canEditClient`. È precisamente ciò che il
registry delle Liste, in questo stesso repository, dichiara di non voler più
accettare: «nascondere un bottone non è un controllo: è una scelta di layout» —
e qui su un percorso che scrive **centinaia di righe di PII in un colpo solo**.
Il database rifiuterebbe comunque (la policy `clients_insert` è la stessa che
`canEditClient` rispecchia), ma l'utente vedrebbe prima «N clienti importati!» e
poi un errore, con l'anagrafica a schermo che per qualche istante contiene righe
che non esistono.

**Soluzione** — le due metà, come per tutte le altre mutazioni:

```js
// state/persistence.js
ADD_CLIENTS_BULK: {
  guard: (s, a, uid) => canEditClient(s.team, uid),
  …
},

// state/reducer.js
case "ADD_CLIENTS_BULK": {
  if (!canEditClient(state.team, uid)) return _denied("Non hai i permessi per importare clienti");
  …
}
```

Il controllo nel reducer non è ridondante: quando un `guard` nega,
`useSyncedDispatch` dispatcha **comunque** l'azione originale contando sul
reducer per produrre il rifiuto — senza il secondo controllo l'import verrebbe
applicato in locale lo stesso.

---

### M-2 · Le due mutazioni del pannello Team senza compensazione

> **✔ CHIUSO.** `rollback` + `mapError` su entrambe. Guardia: tre casi in
> `persistenceGuards.test.js`, di cui uno che **esegue** davvero le
> compensazioni attraverso il reducer.

**Dov'era** — `src/state/persistence.js:559` e `:564`, due entry di una riga:

```js
APPROVE_TEAM_MEMBER: { persist: (s, a) => UsersAPI.approve(a.payload) },
REMOVE_TEAM_MEMBER:  { persist: (s, a) => UsersAPI.deleteUser(a.payload) },
```

**Perché.** Sono le uniche due mutazioni sul team senza compensazione, mentre
`UPDATE_TEAM_MEMBER` e `TOGGLE_TEAM_MEMBER_ACTIVE` — le altre due dello stesso
pannello — ce l'hanno entrambe, e per la ragione dichiarata in quelle entry: il
dato che si scosta è **chi può accedere**. Il reducer ha già tolto il `pending`
(o la riga intera), la scrittura fallisce, e il pannello mostra un utente
approvato che il database considera ancora in attesa. Nessun evento realtime lo
corregge — una scrittura fallita non ne emette — quindi la divergenza dura fino
al prossimo refresh del team, e nel frattempo l'admin crede di aver dato un
accesso che non ha dato. `UsersAPI.approve` chiede già `CONTA_RIGHE`: con il
rollback, un rifiuto della RLS diventa finalmente osservabile su entrambi i lati.

**Soluzione** — si rimanda il membro **intero** pre-dispatch, non un patch: il
case fa merge sulla riga esistente, quindi `{ pending: true }` da solo
lascerebbe a video l'`active` che l'approvazione ha cambiato — un rollback
parziale, che sembra riuscito ed è peggio di nessuno.

```js
APPROVE_TEAM_MEMBER: {
  persist: (s, a) => UsersAPI.approve(a.payload),
  rollback: (s, a) => {
    const prev = (s.team || []).find(m => m.id === a.payload);
    return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
  },
  mapError: (err) => err?.message || "utente non approvato",
},
REMOVE_TEAM_MEMBER: {
  persist: (s, a) => UsersAPI.deleteUser(a.payload),
  rollback: (s, a) => {
    const prev = (s.team || []).find(m => m.id === a.payload);
    return prev ? { type: "ADD_TEAM_MEMBER", payload: prev } : null;
  },
  mapError: (err) => err?.message || "utente non eliminato",
},
```

Entrambe riusano action già esistenti — è ciò che fa scattare
`meta.compensazione` nel wrapper `reducer`, che riporta indietro i toast: senza,
«Agente aggiornato» comparirebbe accanto a «Salvataggio fallito» sullo stesso
gesto. Il test non si limita a confrontare l'oggetto ritornato: applica la
compensazione al reducer e verifica che lo stato torni davvero indietro, perché
un rollback che il reducer scarta è peggio di nessun rollback — dice di aver
rimesso le cose a posto senza farlo.

---

### M-3 · Uno snapshot catturato dentro l'updater di `setState`

> **✔ CHIUSO.** `toggleReaction(convId, msgId, emoji, reazioniPrima)`: lo stato
> precedente arriva dal chiamante e l'updater torna una funzione pura di `prev`.

**Dov'era** — `src/components/chat/chatCommands.js:264-302`:

```js
let reazioniPrima;
let trovato = false;
setMessages(prev => {
  const next = list.map(m => {
    if (m.id !== msgId) return m;
    trovato = true;                       // ← scrittura su variabile esterna
    reazioniPrima = m.reactions || {};    // ← dentro l'updater
    …
  });
  return trovato ? { ...prev, [convId]: next } : prev;
});
```

**Perché.** L'intestazione di questo stesso file dedica venti righe a spiegare
che gli updater di `setState` devono essere **puri**, perché React 18 li invoca
due volte in StrictMode e può rieseguirli in Concurrent Rendering — e che è per
questo che la persistenza della chat non si deduce più differenziando prev/next
lì dentro. Qui la stessa forma era rimasta in piccolo: il valore su cui si basa
la compensazione (e il flag che decide *se* compensare) dipende da quante volte
React ha eseguito l'updater e da quale `prev` gli ha passato. Oggi le due
invocazioni di StrictMode ricevono lo stesso `prev` e il risultato coincide,
quindi non è un difetto osservabile — è un'assunzione sul motore di rendering
scritta in un file che dichiara di non farne.

**Soluzione** — il messaggio ce l'ha già il chiamante: `handleTogglePin`, dieci
righe più sotto nello stesso componente, fa `msgs.find(m => m.id === msgId)` da
sempre. Si fa lo stesso per le reazioni:

```js
// ConversationView.jsx
const handleReact = (msgId, emoji) => {
  const target = msgs.find(m => m.id === msgId);
  commands.toggleReaction(conv.id, msgId, emoji, target?.reactions || null);
};

// chatCommands.js — l'updater non scrive più nulla fuori da sé
const toggleReaction = (convId, msgId, emoji, reazioniPrima = null) => {
  setMessages(prev => {
    const list = prev[convId];
    if (!list || !list.some(m => m.id === msgId)) return prev;
    return { ...prev, [convId]: list.map(m => …) };
  });
  …
};
```

---

### M-4 · Il reducer a tre righe dal proprio tetto

> **✔ CHIUSO** dall'estrazione di A-1: **547 → 541** righe effettive, pur avendo
> aggiunto il controllo di permesso di M-1. Il tetto resta 550 e non è stato
> alzato.

**Dov'era** — `src/state/reducer.js`, 547 righe effettive contro il tetto di
550 dichiarato in `eslint.config.js` (`max-lines`, `skipBlankLines` +
`skipComments`).

**Perché.** Il tetto è l'**unica** deroga a `max-lines` in tutto il progetto ed
è motivata per iscritto: il reducer è uno `switch`, e spezzarlo per dimensione
distribuirebbe su più file le transizioni di un'unica macchina a stati. La
stessa nota dice però anche come va letto il margine: «Se il reducer arriva lì,
la domanda giusta non è alzare ancora il numero — è se una fetta di dominio
meriti un reducer suo». A 547/550 il margine è **tre righe**: qualunque
correzione che tocchi il reducer — comprese due delle nove di oggi — rompe la
build prima di essere scritta, e la pressione a quel punto è di alzare il
numero, che è il modo in cui un'eccezione motivata diventa un'esenzione
permanente. È successo due volte in questo file (`activityLog.js`,
`restoreBackupRollback.js`) e in entrambe la risposta giusta è stata estrarre
ciò che **non è** una transizione di stato.

**Soluzione.** Nessuna riga è stata tolta per far numero: l'estrazione di
`fondiScrittureInVolo` (A-1) porta fuori nove righe di logica di fusione dal
case `SET_TASKS` e ne fa una funzione riusata da tre case, che ne riporta
dentro tre. Il saldo è −6 righe **con** in più il guard di M-1. Il margine
torna a nove righe; la raccomandazione per il prossimo giro resta quella scritta
in `eslint.config.js` — quando ci si riavvicina, la fetta candidata è il gruppo
di case dell'anagrafica clienti, che è l'unico blocco coeso e indipendente dal
resto della macchina a stati.

---

### B-1 · Il documento che si legge prima di toccare il codice descriveva un'altra app

> **✔ CHIUSO.** Riscritte le due sezioni superate; aggiornate le due
> affermazioni che oggi non valgono più.

**Dov'era** — `docs/CLAUDE.md`, §«Identità progetto»:

> «**VoyageDesk** … Attualmente è un single-file React (`src/VoyageDesk.jsx`,
> ~7071 righe). L'obiettivo immediato è portarlo in un progetto Vite reale per
> abilitare persistenza, multi-file, TypeScript e test.»

**Perché.** `README.md` segnala questa stessa descrizione come superata da prima
del refactoring Step P — con tanto di nota esplicita («risaliva a prima … ed era
rimasta ferma per molte sessioni») — mentre `INDEX.md` indica `CLAUDE.md` come
il documento **da leggere prima di qualsiasi modifica al codice**. Il primo
paragrafo del documento normativo affermava quindi il contrario del documento
d'ingresso, su un fatto strutturale: che l'app sia un file solo senza
persistenza. La regola per questo caso è scritta in fondo a `INDEX.md` («se
`CLAUDE.md` è in disaccordo col codice, il codice è la fonte di verità e
`CLAUDE.md` va corretto nello stesso commit che scopre la discrepanza»), e vale
anche per la sua prima riga. Altre tre affermazioni erano scadute nello stesso
modo: le CSS variables «definite in `:root` dentro FontLoader» (il componente
non esiste più dal 13 agosto, ed è la sua rimozione ad aver permesso di togliere
`'unsafe-inline'` dalla CSP), la chat come «`useState`, migrazione a reducer
pianificata», e la nota di `entityId` «dichiarato sulle sole entry dei task …
manca solo dichiararlo», che descriveva la lacuna chiusa oggi da A-1.

**Soluzione.** Le sezioni sono state riscritte con lo stato attuale e, dove il
testo superato aveva valore di storia, conservato in una citazione con la data
in cui ha smesso di essere vero. Le regole nuove di oggi (contratto di
`esitoScrittura`, ordine delle operazioni irreversibili nella chat, snapshot
passati dal chiamante) sono entrate nei bullet corrispondenti, che è dove
qualcuno le cercherà.

Stessa correzione, nello stesso commit, per le quattro cifre scadute di
`README.md`: «676 test» (sono 1316), «96 migrazioni» (109), «quattro Edge
Function» (cinque: mancava `set-user-active`, viva in produzione dal 12
agosto). Sono numeri che nessuno ricalcola leggendoli, ed è per questo che
`npm run verifica:convenzioni` esiste — ma copre le metriche del codice e lo
stato degli audit, non queste. Il modo strutturale per non riscriverle a mano
la prossima volta sarebbe estendere quello script; qui sono state solo
corrette, perché aggiungere controlli è un lavoro suo e non un pezzo di questo
audit.

---

### B-2 · Due metodi di scrittura senza chiamanti

> **✔ CHIUSO.** `Comments.remove` e `Messages.remove` rimossi da `lib/api.js`.

**Dov'era** — `src/lib/api.js:406` (`Comments.remove`) e `:505`
(`Messages.remove`).

**Perché.** Nessun componente, nessun hook, nessuna entry di registry e nessun
test li chiama: l'app non ha una funzione «cancella questo commento» né
«cancella questo messaggio». Un metodo di scrittura senza chiamanti nel data
layer non è inerte — è una scorciatoia già pronta per chi domani vorrà
cancellare un commento senza passare dal registry, cioè senza guard, senza
rollback e senza tag `origin_client`.

**La verifica che serviva farla prima.** B-2 del secondo passaggio ha rimosso
quattro metodi con questo stesso criterio e ne ha ripristinato uno subito dopo
(`Messages.listForConversation`), perché era stato letto solo l'**uso nel
repository** senza incrociare gli audit, che lo citavano per nome come
preparazione deliberata di ST-4. Qui il controllo è stato fatto per primo:
`grep -r "Comments.remove\|Messages.remove" docs/ src/` non trova alcuna
menzione al di fuori della definizione. La cancellazione della **conversazione**
resta e passa da `Conversations.remove`, che i messaggi se li porta dietro in
CASCADE.

---

## 4. Cosa è stato verificato e trovato a posto

- **Confini fra livelli.** `lib/api.js` unico punto di contatto con Supabase per
  il core; le due eccezioni (`auth/AuthContext.jsx`, `liste/listeApi.js`) sono
  dichiarate e protette da quattro regole `no-restricted-imports` /
  `no-restricted-properties` in `eslint.config.js`, tutte a zero violazioni.
- **Parità permessi.** `persistenceGuards.test.js` confronta azione per azione e
  ruolo per ruolo il verdetto del `guard` con quello del reducer; l'elenco
  `ADMIN_ONLY_ACTIONS` è verificato effettivo; la completezza del registry è
  misurata leggendo i `case` dal sorgente, non da una lista scritta a mano.
- **Terzo livello di autorizzazione.** Le Edge Function privilegiate passano
  tutte da `requireActiveAdmin` + `puoAgireComeAdmin`, che ricalca
  `public.is_admin()` incluse le condizioni `active` e `pending`; il predicato è
  un modulo puro e testato (`edgeFunctionAdminGate.test.js`). `send-push`
  confronta il proprio secret a tempo costante.
- **Letture troncabili.** Nessuna lettura che debba arrivare intera è rimasta su
  una `select` nuda: `Clients.list`, `Tasks.list`, `TaskThreads.comments/history`
  passano da `fetchAllRows`, `Messages.listAll` da `fetchRowsUpTo`, tutte con
  ordinamento chiuso su una colonna unica.
- **Import/export.** Il parsing SheetJS è dietro `withPrototypePollutionGuard` e
  un tetto di 15 MB verificato **prima** della lettura in memoria; l'export CSV
  neutralizza i trigger di formula (`=`, `+`, `-`, `@`, TAB, CR). L'export
  Excel passa da `json_to_sheet`, che scrive celle di tipo stringa e non
  formule: verificato, non dedotto.
- **Superficie client.** Nessun `dangerouslySetInnerHTML`, nessun `eval`,
  nessun `window.confirm`/`alert` (tutti convertiti a `useConfirm()`/toast),
  CSP senza direttive permissive, `frame-ancestors 'none'`, HSTS a due anni.
- **`AuthContext`.** Il `value` del provider non è memoizzato, e **non è un
  rilievo**: il provider si ri-renderizza solo quando cambia uno dei suoi stati
  (`session`, `profile`, `team`, `loading`, `recovery`, `authError`), cioè
  quando i consumatori devono comunque aggiornarsi. Memoizzare non toglierebbe
  un render.

---

## 5. Suggerimenti strategici (non rilievi)

1. **Una Edge Function per l'eliminazione di una conversazione.** C-1 è chiuso e
   la migrazione degli orfani ne azzera il costo residuo, ma la forma davvero
   corretta è una sola operazione lato server (service role) che cancella riga e
   allegati dentro lo stesso confine transazionale, come già fanno
   `delete-user` e `delete-account` per l'utente. Il client non ha modo di
   rendere atomici due passi su due sottosistemi diversi: può solo scegliere
   quale dei due sbagli meno quando si rompe in mezzo — che è ciò che C-1 ha
   fatto.
2. **`entityId` per il team.** Le entry sul team sono ora le uniche mutazioni con
   rollback ma senza dichiarazione delle scritture in volo, perché `SET_TEAM`
   non consulta il registro. La subscription su `users` ha un `filterEvent` che
   scarta gli heartbeat di presence, quindi la finestra è più stretta che
   altrove — ma esiste, e la correzione sarebbe di quattro righe il giorno in
   cui `SET_TEAM` adottasse `fondiScrittureInVolo` come hanno fatto oggi
   clienti e avvisi.
3. **Il secondo passo di ST-4** (messaggi per conversazione invece del corpus
   intero) resta l'unica decisione dichiarata e non presa, sotto la soglia
   scritta nel codice (`messages > ~1500`). Non è ancora il momento.
