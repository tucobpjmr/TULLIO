# Audit stato/flusso dati, performance e UX — 16 agosto 2026

Ambito di questo passaggio: **punti 3, 4 e 5** — gestione dello stato e flusso
dati, performance e scalabilità, UX ed error handling. È il seguito dichiarato
di [`AUDIT_ARCHITETTURA_2026-08-15.md`](AUDIT_ARCHITETTURA_2026-08-15.md), che
copriva i punti 1 e 2 e si chiudeva con «stato/flusso dati, performance e UX
seguono in un secondo documento». I rilievi di architettura e sicurezza ancora
aperti restano in quel documento e non sono riaperti qui.

Metodo: lettura del codice + interrogazione del **database di produzione**
(`vmxvnxsqfisucugcpqlc`) in sola lettura — dimensioni e tassi di crescita
reali delle tabelle, definizioni delle funzioni, contenuto della publication
`supabase_realtime` — più l'esecuzione degli strumenti del repository sul
build reale (`npm run build` + `verifica:bundle`, `verifica:convenzioni`).

Verifiche eseguite in ambiente, prima delle correzioni: `npm run lint` →
**0 errori**; `npm test` → **1324 passati, 8 skip**; `npm run build` +
`verifica:bundle` → chunk d'ingresso **70,63 kB gzip** (soglia 84), first load
**170,58 kB gzip** (soglia 184). Dopo le correzioni: lint **0**, test
**1337 passati** (+13), first load **170,63 kB**, `verifica:convenzioni` senza
divergenze.

> **Nessun rilievo critico in questo perimetro**, e la cosa è scritta qui
> perché sia una constatazione e non una dimenticanza. I due rilievi di
> priorità Alta producono uno schermo che diverge dal database (A-1) e un costo
> di render pagato a ogni azione (A-2): nessuno dei due perde dati, nessuno
> aggira un permesso, entrambi si correggono da soli con un F5. Il registro
> delle scritture in volo, il contratto `esitoScrittura`, i rollback
> dichiarativi e la guardia anti-stale del realtime — cioè le quattro cose che
> in questo perimetro potrebbero produrre una perdita — sono state riverificate
> e reggono.

---

## Executive Summary

Il flusso dati del **core** è in ottima salute e non è un'impressione: le
proprietà che di solito si rompono in silenzio qui sono misurate. Il gen-counter
di `useDebouncedTableSubscription` scarta le risposte obsolete, `pendingWrites`
impedisce a un refetch concorrente di annullare a schermo una scrittura
accettata dal database, `esitoScrittura()` traduce in rifiuto il «200 senza
errore» con cui la RLS filtra le righe, e ogni entry del registry porta il
proprio rollback. Le sei viste sono `memo` con prop a identità stabile, e un
test conta i render per dimostrarlo.

Le tre criticità di questo passaggio nascono tutte dallo stesso punto: **le
regole del progetto valgono dove qualcuno le ha applicate, e i due sottosistemi
che non passano dal reducer — la chat e il modulo Liste — sono quelli in cui
sono arrivate ultime o non sono arrivate**. È la stessa diagnosi che A-1
dell'audit del 15 agosto fa per l'architettura, vista dal lato del flusso dati:

- **il modulo Liste** ha una tabella (`lista_beneficiari`) che l'elenco mostra
  e che nessun evento realtime annunciava — non era nemmeno pubblicata su
  `supabase_realtime`. Aggiungere un cointestatario cambiava l'intestazione di
  un buono viaggio per chi la scriveva e per nessun altro (**A-1**);
- **la chat** dichiarava in un commento una stabilità di identità che non aveva
  mai avuto: `commands` si ricostruiva a ogni render del guscio per colpa di una
  dipendenza scritta un livello troppo in alto, e con quella catena rotta il
  pannello e ogni messaggio si ri-renderizzavano a ogni toast, a ogni carattere
  digitato nella ricerca globale, a ogni tick di presenza (**A-2**);
- **la presenza** faceva rete dentro l'updater di `setState`, cioè esattamente
  ciò che `chatCommands.js` vieta a lettere maiuscole dopo che lo stesso difetto
  era costato due INSERT per conversazione (**M-1**).

Sul fronte UX il quadro è simile: gli scheletri onesti, il banner offline, i
toast d'errore che non spariscono da soli e i tre error boundary sono in
piedi e testati, ma la **validazione inline** — regola scritta, testata e
blindata — era applicata a tre form su otto (**M-3**), e il salvataggio del
profilo, l'operazione più lenta di tutta l'app (carica un avatar prima di
scrivere), era l'unica delle tre operazioni asincrone della sua modale senza
alcuno stato in volo: nessun feedback e nessun freno al secondo click (**M-2**).

Su **performance e scalabilità** non c'è un problema aperto oggi e ce n'è uno
prevedibile: il budget del bundle è rispettato con margine (170,6 kB gzip di
first load su 184), il code-splitting copre tutto ciò che è differibile, la
memoizzazione delle viste regge. Ma l'idratazione ricarica **corpus interi** a
ogni evento — tutti i task con commenti e cronologia, tutti i messaggi, tutto
l'elenco liste — ed è la scelta giusta alla scala attuale (290 task, 13
messaggi, 628 liste) e quella sbagliata a una scala 10×. Il suggerimento
strategico n. 1 propone il passo che la rende superflua senza riscrivere nulla.

---

## Tabella delle priorità

| ID | Priorità | Punto | Rilievo | Stato |
|---|---|---|---|---|
| **A-1** ✔ | Alta | 3 | `lista_beneficiari` non è pubblicata su `supabase_realtime` e nessuna RPC che la scrive tocca la riga padre: aggiungere o togliere un cointestatario non emette alcun evento, e l'intestazione della lista resta vecchia su ogni altro client | ✔ corretto e **applicato in produzione** |
| **A-2** ✔ | Alta | 3, 4 | La catena di memoizzazione della chat è rotta a monte: `notif` (oggetto letterale) nelle deps di `markChatNotificationsRead` rende instabile `commands`; `ChatPanel` non è `memo` e il value del suo `ChatContext` è un letterale nel JSX | ✔ corretto |
| **M-1** ✔ | Media | 3 | `usePresence.toggleMyBusy` esegue una scrittura di rete e una seconda `setState` **dentro l'updater** di `setMyBusy`: due scritture di presenza per click in StrictMode | ✔ corretto |
| **M-2** ✔ | Media | 5 | `ProfileEditor`: il salvataggio (upload avatar + scrittura profilo) non ha stato in volo — nessun feedback e doppio click possibile | ✔ corretto |
| **M-3** ✔ | Media | 5 | Validazione inline applicata a 3 form su 8: cinque call site escono in silenzio o si limitano a spegnere il bottone | ✔ corretto |
| **B-1** | Bassa | 3 | All'avvio la tabella `users` viene letta due volte in pochi ms (`AuthContext.loadProfile` + idratazione di `useAppHydration`) | aperto |
| **B-2** | Bassa | 4 | Il value di `AuthContext` è un oggetto letterale non memoizzato | aperto |
| **B-3** | Bassa | 3 | Sette letture del data layer non passano da `fetchAllRows`; due sono su tabelle che crescono e non si potano (`notices`, `conversations`) | aperto |
| **B-4** | Bassa | 4 | `Messages.listAll()` rilegge il corpus intero dei messaggi a ogni evento | decisione dichiarata, riconfermata con i numeri |
| **B-5** | Bassa | 5 | La finestra "Urgenti" della Dashboard calcola `Date.now()` dentro un `useMemo`: non si aggiorna col passare del tempo | aperto |
| **B-6** | Bassa | 4 | Il tick di presenza (30 s) resta l'unico render periodico dell'app: dopo A-2 tocca il solo pannello chat aperto | residuo dichiarato |
| **B-7** ✔ | Bassa | — | Due audit non erano nel registro di `verifica:convenzioni`: il loro `⟦stato: N/M chiusi⟧` non lo verificava nessuno | ✔ corretto |

---

## Action plan dettagliato

### A-1 · La cointestazione non arriva agli altri client ✔

**Dove.** `src/components/liste/useListeData.js:127` (sottoscrizione), la
publication `supabase_realtime` sul database, `src/components/liste/listeApi.js:52`
(`LISTA_SELECT`), `src/components/liste/listeApi.js:64` (`intestazioneLista`).

**Perché è un difetto.** `LISTA_SELECT` incorpora
`lista_beneficiari(client_id, clients(name))` in **ogni riga dell'elenco**, e
`intestazioneLista()` ne compone il titolo della lista — «MARIO ROSSI e MARIA
BIANCHI» — che è quello che si vede in testata, nel riepilogo cliente e nella
copia agente. Ma:

1. `lista_beneficiari` **non era nella publication** `supabase_realtime`
   (verificato su `pg_publication_tables` in produzione);
2. le due RPC che la scrivono — `aggiungi_beneficiario_lista`,
   `rimuovi_beneficiario_lista` — **non toccano la riga padre** in
   `liste_viaggio` (verificato leggendo `pg_get_functiondef` in produzione:
   inseriscono in `lista_beneficiari` e in `lista_history`, e basta;
   `sposta_titolare_lista`, che invece la tocca, non aveva il problema);
3. `useListeData` si sottoscriveva a due tabelle su tre.

Le tre cose insieme fanno una sola: **nessun evento di nessun tipo**. Chi
aggiunge il cointestatario lo vede subito (il modulo ricarica a mano dopo ogni
scrittura, per scelta dichiarata), tutti gli altri continuano a vedere
l'intestazione vecchia finché non arriva un evento su
`liste_viaggio`/`movimenti_lista` per motivi indipendenti, o finché non
ricaricano la pagina. È uno stato a schermo divergente dal database che **non
si corregge da solo**, su un documento che si stampa e si consegna al cliente.

La tabella ha **0 righe** in produzione: la cointestazione è la funzione più
recente del modulo. Il difetto è quindi latente, non ancora osservato — e la
finestra per chiuderlo senza che sia mai costato niente è adesso.

**Correzione.** Tre pezzi:

```sql
-- supabase/migrations/20260815235446_lista_beneficiari_realtime.sql
-- (applicata in produzione via MCP apply_migration e verificata:
--  pg_publication_tables la elenca accanto a liste_viaggio e movimenti_lista)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public' and tablename = 'lista_beneficiari'
  ) then
    alter publication supabase_realtime add table public.lista_beneficiari;
  end if;
end $$;
```

```js
// src/components/liste/useListeData.js
useDebouncedTableSubscription(
  ["liste_viaggio", "movimenti_lista", "lista_beneficiari"],
  reload,
  { enabled, deps: [enabled] },
);
```

```js
// …e il ramo di reload parziale scritto in POSITIVO invece che in negativo:
// prima era «non contiene liste_viaggio ⇒ solo saldi», cioè qualunque tabella
// nuova finiva per default nel ramo che non la riguarda.
const soloSaldi = tabelle !== null && tabelle.size > 0
  && [...tabelle].every((t) => t === "movimenti_lista");
```

Il terzo pezzo è quello che rende la correzione *utile*: con la condizione
scritta in negativo, la sottoscrizione ci sarebbe stata e non avrebbe
ricaricato l'elenco — il difetto sarebbe rimasto aperto con il codice che
sembrava chiuderlo.

**Nota sul contratto `origin_client`.** `src/test/realtimeOriginContract.test.js`
impone che ogni tabella pubblicata abbia `origin_client`, ed è diventato rosso
subito: `lista_beneficiari` non ce l'ha. Non è un'eccezione nuova — è
esattamente quella già dichiarata per `liste_viaggio` e `movimenti_lista` («si
scrive solo via RPC, che non trasportano l'origine»), ed è stata aggiunta con
la stessa motivazione e lo stesso follow-up (`p_origin` sulle RPC del modulo).
Il prezzo è **un reload in più per chi ha appena scritto**, che nel modulo
Liste ricarica comunque a mano; il guadagno è l'intestazione giusta per tutti
gli altri.

**Guardie.** Due casi in `src/test/realtimeGranularita.test.jsx`: la
sottoscrizione include `lista_beneficiari`, e un evento su quella tabella
ricarica **l'elenco**, non i soli saldi.

---

### A-2 · La chat rifà tutto a ogni render del guscio ✔

**Dove.** `src/VoyageDeskInner.jsx:202-212` (`markChatNotificationsRead`),
`src/hooks/useChatData.js:80-96` (`makeChatCommands` memoizzato),
`src/components/chat/ChatPanel.jsx:289` (value del `ChatContext`),
`src/hooks/useNotifications.js:123` (l'oggetto di ritorno).

**Perché è un difetto.** `useChatData.js` dichiara, in un commento, l'invariante
che giustifica il `currentUserIdRef` al suo interno:

> «Senza il ref, `commands` cambierebbe identità a ogni cambio utente e
> ChatPanel — che lo memoizza — si invaliderebbe.»

Non era vero, e la catena si legge in quattro passi:

1. `useNotifications` ritorna `{ notifications, setNotifications, markRead, … }`,
   un **oggetto letterale**: nuovo a ogni render del guscio;
2. `markChatNotificationsRead` in `VoyageDeskInner` aveva `notif` fra le
   dipendenze del proprio `useCallback` → nuovo a ogni render;
3. quella funzione è `onConversationRead` di `useChatData`, che è una
   dipendenza del `useMemo` di `makeChatCommands` → **`commands` nuovo a ogni
   render**;
4. `ChatPanel` non era `memo`, e il value del suo `ChatContext` era un oggetto
   letterale nel JSX → ogni consumatore (conversazione aperta, elenco, **ogni
   bolla di messaggio**, nessuna delle quali memoizzata) si ri-renderizzava
   insieme a lui.

Il guscio si ri-renderizza a ogni toast, a ogni carattere digitato nella ricerca
globale, a ogni tick di presenza (30 s), a ogni notifica in arrivo. Con la chat
aperta su una conversazione, ognuno di quegli eventi ridisegnava l'intera
conversazione. È lo stesso difetto di ST-1 (`openChatTo` funzione nuda) che tre
sessioni di lavoro sulle viste hanno chiuso — fermatosi alla porta della chat.

Ed è anche il motivo per cui `ConversationView` ha due `eslint-disable` con la
spiegazione «`commands` è un oggetto del genitore, includerlo farebbe ripartire
il mark-as-read a ogni suo render»: **la premessa era vera**, e la
compensazione locale nascondeva la causa.

**Correzione.** Le due metà, nello stesso commit, come impone la regola del
progetto:

```js
// src/VoyageDeskInner.jsx — la dipendenza è la FETTA che si usa, non il
// contenitore. I setter di useState hanno identità garantita da React.
const { setNotifications: setNotifiche } = notif;
const markChatNotificationsRead = useCallback((convId) => {
  setNotifiche(prev => prev.map(n => ( … )));
  …
}, [useSupabase, setNotifiche]);

// …e la prop callback del pannello, che senza useCallback annullerebbe il memo:
const closeChatPanel = useCallback(() => {
  setShowChat(false);
  setChatIntent(null);
}, []);
```

```jsx
// src/components/chat/ChatPanel.jsx
export const ChatPanel = memo(function ChatPanel({ … }) {
  …
  const ctxValue = useMemo(() => ({
    tasks: tasks || [], currentUserId: me, dispatch: dispatch || noop,
    presenceMap: presenceMap || vuoto, messageTemplates: messageTemplates || vuotaLista,
    onForward: handleForwardStart,
  }), [tasks, me, dispatch, presenceMap, messageTemplates, handleForwardStart]);
  …
  return <ChatContext.Provider value={ctxValue}>…</ChatContext.Provider>;
});
```

`noop`/`vuoto`/`vuotaLista` sono costanti di modulo per la stessa ragione per
cui lo sono gli stili: un `|| {}` dentro il `useMemo` sarebbe un oggetto nuovo a
ogni valutazione. `handleForwardStart` è passato a `useCallback` con
`activeConv` letto da un ref, perché entra nel value.

**Guardia.** `src/test/chatMemo.test.jsx`, nella forma di `memoViste.test.jsx`:
uno stub `memo` conta i propri render mentre si digitano dieci caratteri nella
ricerca globale a chat aperta, con il controllo positivo che l'app *ha*
ri-renderizzato. **Verificato che fallisce senza la correzione** (dieci render
in più), più un secondo caso che verifica che il pannello vero sia `memo`: le
due metà si rompono separatamente e vanno verificate separatamente.

---

### M-1 · Rete dentro l'updater di `setState`, nella presenza ✔

**Dove.** `src/hooks/usePresence.js:24-39`.

**Perché è un difetto.** Il toggle "Occupato" faceva così:

```js
setMyBusy(prev => {
  const nv = !prev;
  myBusyRef.current = nv;
  if (enabled && myId) {
    UsersAPI.setPresence(myId, st);   // ← rete
    setPresenceMap(p => ({ … }));     // ← seconda setState
  }
  return nv;
});
```

È testualmente ciò che `docs/CLAUDE.md` vieta (⛔ «Mai chiamate di rete dentro
l'updater di `setState`»), regola nata perché lo stesso difetto nella chat
produceva **due INSERT** per ogni conversazione creata. Un updater deve essere
puro: React 18 lo invoca due volte in StrictMode di proposito, e il Concurrent
rendering può scartare un render già calcolato e rigiocare la coda su una base
più recente. Misurato: **due `setPresence` per click**.

**Correzione.** Il valore nuovo si calcola dal ref — che è già il mirror di
`myBusy` per l'heartbeat, quindi non è una seconda fonte di verità — e le
conseguenze stanno fuori:

```js
const toggleMyBusy = useCallback(() => {
  const nv = !myBusyRef.current;
  myBusyRef.current = nv;
  setMyBusy(nv);
  if (!enabled || !userId) return;
  const st = nv ? 'busy' : 'online';
  UsersAPI.setPresence(userId, st).then(r => {
    if (r?.error) console.warn("[presence] toggleMyBusy", r.error);
  });
  setPresenceMap(p => ({ …, [userId]: { …, status: st, last_seen_at: … } }));
}, [enabled, userId]);
```

L'esito della scrittura, che prima veniva scartato (`.then(() => {})`), finisce
ora in console come già faceva `beat()`.

**Guardia.** `src/test/presenceToggle.test.jsx` monta l'hook dentro
`<StrictMode>` — la condizione in cui il difetto si manifesta — e conta le
scritture per click. **Verificato che fallisce sul codice di prima** (2 invece
di 1, su entrambi i versi del toggle).

---

### M-2 · Il salvataggio del profilo non si vede e si può ripetere ✔

**Dove.** `src/components/modals/ProfileEditor.jsx:163` (handler) e `:461`
(bottone).

**Perché è un difetto.** `handleSave` è la sequenza più lunga della modale: se
la foto è nuova carica un blob sul bucket `avatars` e **solo dopo** dispatcha
`UPDATE_OWN_PROFILE`. Per tutta la durata dell'upload lo schermo era immobile —
nessuno spinner, nessuna etichetta, il bottone identico a prima — e un secondo
click ripartiva da capo: **secondo upload dell'avatar e seconda scrittura**.

La stessa modale gestisce correttamente le altre due operazioni asincrone
(`esitoPwd.fase === "invio"` e `esitoElim.fase === "invio"`, entrambe con
bottone spento ed etichetta «Salvataggio…»/«Eliminazione…»): mancava la terza,
che è anche la più lenta e l'unica che l'utente usa tutti i giorni.

⚠️ Da non confondere con la criticità #10: quel `disabled` — il bottone spento
*perché il form è incompleto* — resta vietato, ed è il motivo per cui questo
bottone continua a essere premibile a nome vuoto (premuto, indica il campo e ci
porta il focus). Qui si spegne **solo per la durata di una scrittura già
partita**.

**Correzione.**

```jsx
const [salvaInVolo, setSalvaInVolo] = useState(false);

const handleSave = async () => {
  if (salvaInVolo) return;
  …
  setSalvaInVolo(true);
  …
  if (upErr || !url) { …; setSalvaInVolo(false); return; }
  const res = await dispatch({ type: "UPDATE_OWN_PROFILE", payload });
  if (!montato()) return;      // stesso contratto di useIsMounted() già in uso
  setSalvaInVolo(false);
  if (res?.error) return;
  onClose();
};

<button onClick={handleSave} disabled={salvaInVolo} aria-busy={salvaInVolo}
        style={salvaInVolo ? boxF13Bold3InVolo : boxF13Bold3}>
  {salvaInVolo ? "Salvataggio…" : "✓ Salva profilo"}
</button>
```

`aria-busy` perché lo stato in volo deve esistere anche per chi non vede il
cambio di colore, come per gli scheletri e i fallback di attesa.

**Guardie.** Tre casi in `src/test/profileEditorSave.test.jsx` con un dispatch
sospeso: il bottone lo dice ed è spento mentre scrive; due click ravvicinati
restano **una** scrittura; dopo un errore torna premibile — altrimenti la
modale resterebbe aperta con un form non più inviabile.

---

### M-3 · La validazione inline si era fermata a tre form su otto ✔

**Dove.** `NoticeEditorModal.jsx:73` + `:189`, `AddCategoryModal.jsx:24`,
`AdminCategoriesTab.jsx:35`, `MessageTemplatesSection.jsx:52` + `:92`,
`AdminTeamTab.jsx:91`.

**Perché è un difetto.** La regola («inline, non via toast; ⛔ niente
`if (!campo) return;` muto e niente bottone disabilitato al posto del
messaggio») è scritta, motivata e blindata da un test — e valeva per
`ClienteModal`, `AddMovBox` e `ProfileEditor`. Gli altri cinque call site erano
rimasti alla forma di prima, in due varianti entrambe già respinte:

- **bottone spento** (`NoticeEditorModal`, `MessageTemplatesSection`): un
  modale che si apre con il proprio comando disabilitato si legge come rotto, e
  con due campi obbligatori non dice **quale** dei due manchi;
- **`return` muto** (`AddCategoryModal`, `AdminCategoriesTab`, `AdminTeamTab`):
  si preme "Salva"/"Crea" e non succede niente. Nessun messaggio, nessun focus,
  nessun indizio.

Per chi usa uno screen reader nessuna delle due varianti esiste affatto.

**Correzione.** Tutti e cinque passano ora dai validatori puri, con messaggio
sotto il campo, `aria-invalid`/`aria-describedby` e focus sul primo campo
sbagliato in **ordine visivo**; l'errore si spegne appena si scrive nel campo.
Esempio (`NoticeEditorModal`):

```jsx
const REGOLE = { text: obbligatorio("L'avviso non può essere vuoto.") };

const submit = () => {
  const trovati = validaCampi({ text }, REGOLE);
  if (trovati.text) { setErrori(trovati); textareaRef.current?.focus(); return; }
  setErrori({});
  onSave({ text: text.trim(), color, pinned, tags });
};

<textarea … {...ariaCampo("vd-notice-text-err", errori.text)} />
<FieldError id="vd-notice-text-err">{errori.text}</FieldError>
{/* niente più `disabled={!text.trim()}` */}
<button onClick={submit} style={boxF12Pubblica}>📌 Pubblica avviso</button>
```

`MessageTemplatesSection` ha due campi obbligatori e usa quindi anche
`primoCampoInvalido(errori, ORDINE)` con l'ordine visivo (`label`, poi `text`).

**Effetto collaterale misurato**: togliendo i due bottoni con stile calcolato
sul contenuto, gli style inline dinamici scendono da 335 a **333** —
`verifica:convenzioni` ha fatto fallire la CI finché `docs/CLAUDE.md` non è
stato aggiornato, che è precisamente il suo lavoro.

**Guardie.** Cinque casi nuovi in `src/test/validazioneInline.test.jsx` sui due
percorsi più frequenti (pubblicare un avviso, creare una categoria), con le
stesse tre proprietà già fissate per `ClienteModal`.

---

### B-1 · `users` letta due volte all'avvio

**Dove.** `src/auth/AuthContext.jsx:120-160` e `src/hooks/useAppHydration.js:197-252`.

`AuthContext.loadProfile` legge `users` per intero (serve il team prima di
montare l'app, caveat #17), e pochi millisecondi dopo l'idratazione di
`useAppHydration` la rilegge con `UsersAPI.listAll()` + `getContacts`. Sono due
query identiche a distanza di un round-trip, su ogni avvio di sessione.

Non è corretto in nessuno dei due punti toglierla senza pensarci: quella di
`AuthContext` decide *se* montare l'app, quella di `useAppHydration` apre la
sottoscrizione realtime e va eseguita comunque al mount dell'hook. La strada
pulita è passare il team già caricato come idratazione iniziale e far partire la
sottoscrizione senza il primo fetch — cioè un parametro in più su
`useDebouncedTableSubscription` («la prima volta non ricaricare, ce l'ho già»),
che tocca tutti e nove i consumatori. Costo attuale: una query su una tabella
da 7 righe. **Aperto, non urgente.**

### B-2 · Il value di `AuthContext` non è memoizzato

**Dove.** `src/auth/AuthContext.jsx:302-333`.

È l'unico provider dell'app il cui value è un oggetto letterale (gli altri
cinque passano tutti da `useMemo`, con la ragione scritta accanto). L'impatto
oggi è contenuto perché `AuthProvider` si ri-renderizza di rado (sessione,
profilo, team, `loading`), ma è la stessa forma che in A-2 ha propagato
instabilità per quattro livelli, e i consumatori — `AuthGate`, `LoginScreen`,
`ProfileEditor`, `UserSwitcher` — non hanno modo di difendersi. **Aperto**:
`useMemo` sulle undici dipendenze, da fare quando si tocca quel file.

### B-3 · Sette letture non passano da `fetchAllRows`

**Dove.** `lib/api.js`: `Users.list`, `Users.listAll`, `Notices.list`,
`Conversations.listMine`, `Categories.list`, `MessageTemplates.list`;
`auth/AuthContext.jsx`: `supabase.from('users').select('*')`.

Il documento del 12 agosto (C-1) chiude con «non resta una sola lettura del data
layer che possa essere troncata in silenzio». **La frase è più larga di ciò che
è stato fatto**: le sette letture qui sopra sono `select` nude, e PostgREST
tronca a `db-max-rows` rispondendo 200 senza errore. Cinque sono su tabelle
limitate per costruzione (il team: 7 righe; le categorie: 12; i template: 4) e
lì una paginazione non aggiungerebbe nulla. Due no:

| Tabella | Righe oggi | Cresce? |
|---|---|---|
| `notices` | **0** | sì, nessuna potatura |
| `conversations` | **4** | sì, una per chat aperta |

Sono lontanissime dal cap e la correzione è meccanica (`fetchAllRows` +
`WITH_COUNT` + ordinamento chiuso su una colonna unica). **Aperto**, con la
raccomandazione di farlo quando si tocca uno dei due metodi, e di correggere
insieme la frase del 12 agosto: è il tipo di affermazione che la prossima
persona legge come una garanzia.

### B-4 · `Messages.listAll()` a ogni evento — decisione già presa

**Dove.** `src/hooks/useChatData.js:110-143`, `lib/api.js:517`.

Ogni evento su `messages` fa rileggere **tutti** i messaggi (tetto 2000,
paginato da `fetchRowsUpTo`), non quelli della conversazione toccata. È il
secondo passo di ST-4, esplicitamente rimandato sotto una soglia scritta nel
codice (`messages > ~1500`). Riconfermato con il numero reale: **13 messaggi in
produzione**. Non è un rilievo aperto, è una decisione con una soglia — e la
soglia è lontana.

### B-5 · La finestra "Urgenti" non invecchia

**Dove.** `src/components/dashboard/Dashboard.jsx:143-151`.

`urgentCandidates` filtra su `Date.now()` dentro un `useMemo` con dipendenze
`[showUrgent, visibleTasks]`: il tempo non è una dipendenza, quindi una
Dashboard lasciata aperta non vede una task *diventare* urgente finché non
cambia qualcosa nei task. Nella pratica il realtime rimescola `tasks` spesso e
il difetto si auto-guarisce, il che è anche il motivo per cui non è mai stato
notato. La correzione onesta non è togliere il `useMemo` (ricalcolerebbe sei
filtri a ogni render) ma aggiungere un tick lento — la stessa forma che
`usePresence` usa per l'ageing. **Aperto.**

### B-6 · Il tick di presenza è l'unico render periodico

**Dove.** `src/hooks/usePresence.js:91-94`.

Ogni 30 s `setPresenceMap(prev => ({ ...prev }))` forza un render per far
invecchiare i pallini di presenza. Dopo A-2 il costo è confinato: le viste e il
guscio sono `memo` con prop stabili, quindi si ri-renderizza il pannello chat —
e solo se è aperto, perché `presenceMap` è una sua prop e cambia identità per
costruzione. Confinarlo del tutto significherebbe spostare l'ageing dentro i
componenti che mostrano la presenza. **Residuo dichiarato**, non un difetto
aperto.

### B-7 · Due audit fuori dal registro di `verifica:convenzioni` ✔

**Dove.** `scripts/verifica-convenzioni/index.js:27-35`.

Il registro `AUDIT` elencava sei documenti su otto: mancavano l'audit del **15
agosto** — quello con più rilievi ancora aperti (4/12) — e questo. Il marcatore
`⟦stato: N/M chiusi⟧` di `INDEX.md` esiste per essere letto da una macchina, e
per quei due non lo leggeva nessuno: poteva divergere dal documento senza che
niente diventasse rosso. Corretto aggiungendo entrambe le righe;
`npm run verifica:convenzioni` esegue ora **20 controlli**, nessuna divergenza.

---

## Controlli verificati a posto

Non tutto ciò che è stato guardato è diventato un rilievo. Le proprietà qui
sotto sono state riverificate in questo passaggio e reggono — sono elencate
perché «non l'ho trovato» e «l'ho cercato e c'era» sono due frasi diverse:

- **guardia anti-stale del realtime**: gen-counter + `isCurrent()` dopo ogni
  await in tutti i consumatori; in `useListeData` la generazione è condivisa fra
  reload manuale e reload realtime, quindi conta l'ordine di partenza e non
  quello di arrivo;
- **scritture in volo**: `pendingWrites` è letto da `SET_TASKS`,
  `SET_TASK_THREADS`, `SET_CLIENTS` e `SET_NOTICES`; `entityId` è dichiarato
  sulle entry di task, clienti e avvisi; la chat ha il proprio `inVoloRef`;
- **esito delle scritture**: `esitoScrittura()` è usato dal core, dalla chat e
  dal modulo Liste; `CONTA_RIGHE` è sui metodi che mirano a una riga per PK;
- **stati di attesa onesti**: un flag per entità, chiuso sia sul successo sia
  sull'errore del primo fetch, con la condizione `loading && dati.length === 0`
  nelle viste e `…` al posto di `0` nei conteggi;
- **errori**: tre error boundary (globale, vista, overlay), toast d'errore che
  **non** spariscono da soli, codice di segnalazione in produzione e dettaglio
  in console, banner offline persistente;
- **memoizzazione delle viste**: sei viste + AdminView + guscio, tutte `memo`
  con prop a identità stabile, misurate da `domainProviders.test.jsx` e
  `memoViste.test.jsx`; `Dashboard` e `CalendarPlanner` hanno le proprie
  derivazioni sotto `useMemo`;
- **bundle**: 170,63 kB gzip di first load su una soglia di 184; `xlsx`
  (143 kB gzip) resta un chunk async; chat, admin, liste, calendario, cestino,
  archivio, slide-over e bulk sono tutti `lazy()`;
- **paginazione del modulo Liste**: `list`, `listTrash`, `saldi`,
  `clientiConListe` e le quattro letture del backup passano da `fetchAllRows`
  con ordinamento deterministico; `movimenti` e `history` sono per-lista e
  limitate.

## Rilievi ritirati in stesura

Restano a verbale, come nei passaggi precedenti:

1. **«`lista_history` è il prossimo `task_history`»** — la tabella è a 713
   righe e cresce, come quella che il 12 agosto era il rilievo critico C-1. Ma
   si legge solo con `ListeAPI.history(listaId, limit = 50)`, cioè per lista e
   con un tetto esplicito: il cap di PostgREST non la tocca. Il parallelo era
   suggestivo e sbagliato.
2. **«`Notices.list` è troncabile: è un difetto»** — lo è, ma la tabella ha
   **0 righe** e il rilievo, isolato, avrebbe avuto un peso che non ha. È
   confluito in B-3 insieme alle altre sei, dove la cosa interessante non è la
   singola query ma la frase del 12 agosto che le dichiarava tutte già chiuse.

---

## Top 3 suggerimenti strategici

### 1. Ricaricare la riga, non il corpus — un merge per-riga in `useDebouncedTableSubscription`

Oggi ogni evento realtime provoca il refetch di un'entità **intera**: tutti i
task con commenti e cronologia (290 righe, ~73 kB di sole tasks più 67 kB di
cronologia, prima del JSON e dei join sui nomi), tutti i messaggi, tutto
l'elenco liste. È robusto, è semplice, ed è la ragione per cui questo progetto
non ha mai avuto un bug di merge — ma il costo cresce col **prodotto** fra
numero di righe e frequenza di scrittura, e sono le due cose che crescono
insieme quando l'agenzia usa davvero il gestionale.

Il passo non è riscrivere l'idratazione: è aggiungere ai payload realtime, che
già contengono la riga (`payload.new`), un percorso «applica questa riga» per le
tabelle in cui la riga è autosufficiente — `tasks`, `clients`, `notices` — e
tenere il refetch completo per gli eventi che non lo sono (DELETE senza replica
identity full, tabelle figlie, ripresa dopo un buco di connessione). Le difese
che servono esistono già tutte: `origin_client` per scartare la propria eco,
`pendingWrites` per non sovrascrivere una scrittura in volo, il gen-counter per
l'ordine. Fatto bene, elimina la classe di costo invece di spostarla, e rende
`SOGLIA_RIPRESA_MS` l'unico posto in cui si ricarica tutto.

### 2. Una regola di lint per il value di un Context

A-2 è costato quattro livelli di propagazione ed è nato da un oggetto letterale
scritto nel JSX di un `Provider`. Il progetto ha già la regola gemella per gli
`style={{…}}` costanti (`no-restricted-syntax`, zero violazioni, con
`verifica:convenzioni` a rimisurare i residui) e sa quanto vale: chiude la
*categoria* invece del singolo caso. Una regola che vieti
`<X.Provider value={{…}}>` e `value={[…]}` — cioè che imponga `useMemo` o una
costante di modulo — costa poche righe di configurazione e rende impossibile
riaprire A-2 da un altro file. Oggi le violazioni sarebbero **una** (quella di
`AuthContext`, B-2): il momento giusto per introdurla è quello in cui l'arretrato
è di un caso.

### 3. Portare il modulo Liste sotto lo stesso contratto realtime del core

A-1 non è un caso isolato: è il terzo rilievo consecutivo che nasce dal fatto
che il modulo Liste ha un'architettura dati parallela (A-1 del 15 agosto lo dice
per l'architettura, A-2 del 14 agosto — terzo passaggio — per `esitoScrittura`,
questo per il realtime). La tabella non era pubblicata, le RPC non taggano
l'origine, e il contratto che il core ha — «ogni tabella in realtime ha
`origin_client`, ogni scrittura lo trasporta» — nel modulo vale come eccezione
dichiarata su tre tabelle su tre.

Il lavoro concreto è quello già scritto come follow-up nella migrazione
`20260808120000`: aggiungere `p_origin` alle sedici RPC del modulo (con `drop` +
`create`, non `create or replace`, che produrrebbe un overload) e taggare le
scritture lato client. Va fatto in un passaggio dedicato perché tocca saldi e
movimenti finanziari e perché, applicando le migrazioni a mano, un client che
mandi `p_origin` a un database non ancora migrato farebbe fallire **ogni**
scrittura del modulo — l'ordine è quindi: prima il database, poi il client. Il
guadagno è togliere tre eccezioni da un contratto che, per il resto dell'app, è
verificato da un test.
