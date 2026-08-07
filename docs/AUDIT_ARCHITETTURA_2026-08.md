# Audit architetturale e di sicurezza — agosto 2026

Analisi del repository `tucobpjmr/tullio` (VoyageDesk 0.9.0) al 7 agosto 2026.

**Metodo e marcatura delle fonti.** Ogni affermazione è marcata con come è stata
verificata, seguendo la convenzione già in uso in `docs/SICUREZZA.md`:

- ✅ **verificato sul database live** — progetto `vmxvnxsqfisucugcpqlc`, via
  `execute_sql` / `get_advisors`
- 📄 **verificato nel repo** — letto nel sorgente o nei file di migrazione
- 🔬 **misurato** — `npx vitest run`, `npx eslint .` eseguiti in questa sessione

La distinzione non è pedanteria: è la stessa ragione per cui `docs/CLAUDE.md`
avverte che la storia delle migrazioni nel repo non coincide con
`schema_migrations`. Una parte non trascurabile dei rilievi di questo documento
nasce proprio da affermazioni scritte una volta e mai più rimisurate.

---

## 1. Executive Summary

**Stato di salute: buono.** Questo non è un progetto in debito tecnico: è un
progetto che ha già pagato il suo debito tecnico e ne conserva la
documentazione. Le prove:

| Indicatore | Valore | Fonte |
|---|---|---|
| Test | **789 verdi su 789**, 64 file | 🔬 |
| ESLint | **0 errori**, 23 warning (22 stilistici + 1 deps) | 🔬 |
| Advisor sicurezza Supabase | **0 errori**, 10 warning, tutti attesi | ✅ |
| Tabelle senza RLS | **0** | ✅ |
| GRANT su `public` per il ruolo `anon` | **0** | ✅ |
| Sink HTML (`dangerouslySetInnerHTML`/`innerHTML`) | **0** | 📄 |
| Migrazioni di sicurezza recenti applicate in produzione | **11 su 11** | ✅ |

Il refactoring del monolite è reale e riuscito: `VoyageDesk.jsx` è sceso a 369
righe di sola orchestrazione, le decisioni di autorizzazione sono funzioni pure
in `lib/permissions.js` invocate **dagli stessi due livelli** (reducer e
registry di persistenza) con un test che ne verifica la coincidenza, e il
registry dichiarativo di `state/persistence.js` ha eliminato lo `switch` da 283
righe che duplicava a mano i controlli di permesso.

**La cosa più importante che ho verificato, e che vale la pena dire per prima:
non ho trovato vulnerabilità critiche.** Ho cercato specificamente le classi che
in un gestionale multi-ruolo fanno danno — escalation di privilegi, RLS
mancante, chiavi esposte, XSS, IDOR sugli allegati, redirect aperti negli
inviti — e ognuna risulta già chiusa, in molti casi con la motivazione scritta
accanto alla correzione. Le migrazioni del 6 agosto (bucket avatar reso privato,
MIME allowlist sugli allegati, revoca dei GRANT ad `anon`, matrice categoria per
ruolo portata in RLS, gate `pending` negli helper) **sono tutte applicate al
database di produzione**, verificato riga per riga e non solo per presenza del
file. ✅

Il baricentro dei problemi residui si è quindi spostato dalla sicurezza a due
aree diverse:

1. **Scalabilità del modello di sincronizzazione.** Il pattern
   "ricarico tutto a ogni evento realtime" è applicato uniformemente, ed è
   stata una scelta consapevole e giusta quando i dati erano pochi. I dati non
   sono più pochi: **616 liste viaggio e 5.315 movimenti** ✅. Ogni movimento
   registrato da chiunque provoca, su ogni client connesso, tre query complete.
   È il problema con la traiettoria peggiore del progetto.

2. **Disallineamento fra la documentazione e ciò che il codice fa oggi.**
   `docs/SICUREZZA.md` è un documento eccellente e sopra la media, e proprio per
   questo è pericoloso quando invecchia: oggi descrive la CSP come non
   bloccante, mentre in produzione **blocca**, e descrive il vincolo del Junior
   Agent come non applicato dal database, mentre il database lo applica. Chi lo
   legge per prendere una decisione la prende su premesse false.

Un'osservazione trasversale, perché spiega diversi rilievi che seguono: la
qualità di questo codice è tenuta insieme da **commenti molto lunghi e molto
buoni** che spiegano il *perché* di ogni scelta. È una pratica rara e da
difendere. Il suo costo è che un commento sbagliato pesa qui più che altrove,
perché qui i commenti vengono creduti — e i rilievi ALTA-3 e MEDIA-3 sono
esattamente questo caso.

---

## 2. Tabella delle priorità

| # | Priorità | Area | Problema | File |
|---|---|---|---|---|
| — | **CRITICI** | — | **Nessuno.** Nessuna vulnerabilità sfruttabile né difetto che comprometta i dati. | — |
| A-1 | **Alta** | Performance | Refetch completo di liste + cestino + saldi a ogni evento su `movimenti_lista` (5.315 righe) | `useListeData.js:46-68` |
| A-2 | **Alta** | Correttezza | `clients` (818 righe) è l'unica entità senza subscription realtime: le modifiche altrui non arrivano mai | `useAppHydration.js:143-153` |
| A-3 | **Alta** | Sicurezza (doc) | `SICUREZZA.md` afferma che la CSP non blocca e che il vincolo Junior non è nel DB: entrambe false oggi | `docs/SICUREZZA.md` §4-§6-§8 |
| M-1 | Media | Architettura | `AdminView` è l'unica vista che riceve `state` intero e lo drilla in 5 tab | `AdminView.jsx:13,65-69` |
| M-2 | Media | Duplicazione | Autocomplete cliente triplicato (logica + markup dropdown) | `TaskSlideOver.jsx:79-85`, `QuickAddTask.jsx:61-69`, `ManualTab.jsx:141-144` |
| M-3 | Media | Sicurezza | Macchinario di cambio-utente (`SET_CURRENT_USER` + banner rollback) vivo nel bundle di produzione | `reducer.js:139-179`, `AdminRollbackBanner.jsx` |
| M-4 | Media | Test | Nessun test verifica le policy RLS: il livello che conta davvero non è coperto | `src/test/**` |
| M-5 | Media | Correttezza | `stateRef` aggiornato in `useEffect`: finestra di stato stale su dispatch multipli nello stesso tick | `useSyncedDispatch.js:27` |
| B-1 | Bassa | Performance | Refetch completo anche su `tasks` (246 task + 569 righe di cronologia) | `useAppHydration.js:32-46` |
| B-2 | Bassa | Config | `leaked_password_protection` ancora disabilitata | dashboard Supabase |
| B-3 | Bassa | Duplicazione | Due formattatori di data e due limiti di dimensione file non riconciliati | `taskUtils.js:4`, `listeApi.js:411`, `fileUtils.js:6`, `chatFiles.js:9` |
| B-4 | Bassa | Lint | 22 `react/no-multi-comp` + 1 `exhaustive-deps` | vari |

---

## 3. Action Plan dettagliato

### A-1 · Refetch completo del modulo Liste a ogni movimento

**File.** `src/components/liste/useListeData.js:46-68`

**Misura.** ✅ `liste_viaggio` = 616 righe, `movimenti_lista` = 5.315 righe.

**Perché è una criticità.** `reload()` non sa *quale* tabella ha generato
l'evento, quindi fa sempre tutto:

```js
const [rListe, rCestino, rSaldi] = await Promise.all([
  ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
]);
```

ed è sottoscritto a due tabelle:

```js
useDebouncedTableSubscription(["liste_viaggio", "movimenti_lista"], reload, …);
```

Registrare **un** movimento — l'operazione più frequente del modulo — fa quindi
scaricare a *ogni client connesso* l'elenco completo delle liste, il cestino
completo e i saldi completi. `ListeAPI` pagina a 1000 righe (`listeApi.js:58`)
ma pagina per *scaricare tutto*, non per scaricarne meno.

Il commento in testa al file è onesto sul fatto che il pattern è "volutamente
più semplice di un merge incrementale". Aveva ragione. Il punto è che la
premessa implicita — che i dati restino piccoli — è scaduta: 5.315 movimenti
non sono un dataset di prova, e la crescita è lineare nell'uso normale del
prodotto.

**Soluzione.** Non serve riscrivere il modello a merge incrementale. Basta
dare a `reload` l'informazione che già esiste ma viene buttata via: *quale*
tabella ha generato l'evento. Un movimento cambia i saldi, mai l'elenco delle
liste né il cestino.

Primo passo, in `hooks/useDebouncedTableSubscription.js` — propagare la tabella:

```js
    const list = Array.isArray(tables) ? tables : [tables];
    // `run` accetta ora l'insieme delle tabelle che hanno generato gli eventi
    // coalescati dal debounce: chi ricarica può così ricaricare solo la parte
    // che quegli eventi possono aver invalidato. `null` = idratazione
    // iniziale, dove non c'è un evento e va caricato tutto.
    let pending = new Set();

    const run = (tabelle) => {
      const my = ++gen;
      return reloadRef.current(() => !cancelled && my === gen, tabelle);
    };

    run(null); // idratazione iniziale: tutto

    const debounced = (payload) => {
      const fn = filterRef.current;
      if (fn && !fn(payload)) return;
      pending.add(payload?.table);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const tabelle = pending;
        pending = new Set();
        run(tabelle);
      }, delay);
    };
```

Secondo passo, in `useListeData.js` — consumarla:

```js
  const reload = useCallback(async (isCurrent = () => true, tabelle = null) => {
    setLoadError(null);
    // Un movimento cambia i saldi e nient'altro: l'elenco delle liste e il
    // cestino non possono essere stati invalidati da un insert su
    // movimenti_lista. Ricaricarli comunque significava, a ogni movimento
    // registrato da chiunque, scaricare 616 liste su ogni client connesso.
    // `tabelle === null` = idratazione iniziale, dove serve tutto.
    const soloSaldi = tabelle !== null
      && tabelle.size > 0
      && !tabelle.has("liste_viaggio");

    if (soloSaldi) {
      const rSaldi = await ListeAPI.saldi();
      if (!isCurrent()) return;
      if (rSaldi.error) { /* … stesso ramo d'errore di sotto … */ return; }
      setDati((d) => ({
        ...d,
        saldi: Object.fromEntries((rSaldi.data || []).map((s) => [s.lista_id, s])),
      }));
      return;
    }

    const [rListe, rCestino, rSaldi] = await Promise.all([
      ListeAPI.list(), ListeAPI.listTrash(), ListeAPI.saldi(),
    ]);
    // … resto invariato …
  }, []);
```

Effetto: da 3 query complete a 1 per l'evento di gran lunga più frequente,
senza toccare il modello mentale del modulo né la sua robustezza (il
gen-counter e il debounce restano quelli).

> **Nota di verifica.** `payload.table` è presente nel payload
> `postgres_changes` di supabase-js. Va confermato con un `console.log` in
> sviluppo prima di fare affidamento sul campo: se mancasse, l'alternativa è
> registrare la tabella nella closure creata da `list.map(...)` in
> `subscribeToTable`, che la conosce per costruzione.

---

### A-2 · `clients` non ha subscription realtime

**File.** `src/hooks/useAppHydration.js:143-153`

**Misura.** ✅ `clients` = 818 righe.

**Perché è una criticità.** Tutte le altre entità di dominio hanno una
subscription: `tasks`/`comments`/`task_history` (riga 32), `notices` (48),
`categories` (63), `users` (91), e fuori da questo hook `conversations`/
`messages`, `notifications`, `liste_viaggio`/`movimenti_lista`. I clienti no:

```js
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    ClientsAPI.list()
      .then((cRes) => { … })
      .finally(() => { if (!cancelled) setCrmLoading(false); });
    return () => { cancelled = true; };
  }, [enabled, dispatch]);
```

Una `useEffect` che parte una volta sola al mount. Chi crea un cliente lo vede
subito (l'aggiornamento ottimistico del reducer), **chiunque altro no, fino a un
reload completo della pagina**.

Non è teorico e non riguarda solo l'anagrafica: il modulo Liste crea clienti per
conto proprio — `AggiungiBeneficiarioModal` passa `newClientName` quando si
aggiunge un beneficiario non ancora in anagrafica. Il flusso concreto che si
rompe: l'utente A crea un cliente aggiungendo un beneficiario, l'utente B apre
l'autocomplete cliente su un task e non lo trova, lo ricrea a mano, e si
ritrovano due righe per la stessa persona. Con 818 clienti già in tabella, la
deduplica a posteriori non è banale.

**Soluzione.** Allinearlo al pattern usato da tutte le altre entità. La
sostituzione è quasi meccanica, e `crmLoading` continua a funzionare perché
`useDebouncedTableSubscription` esegue l'idratazione iniziale al mount:

```js
  const [crmLoading, setCrmLoading] = useState(enabled);

  // I clienti erano l'unica entità di dominio senza subscription: una
  // useEffect al mount e nient'altro. Un cliente creato da un altro utente —
  // anche dal modulo Liste, che ne crea passando newClientName — non arrivava
  // mai in questa sessione, e l'autocomplete lo dava per inesistente. Il
  // risultato osservabile era il doppione in anagrafica, non un dato mancante.
  useDebouncedTableSubscription(["clients"], async (isCurrent) => {
    const { data, error } = await ClientsAPI.list();
    if (!isCurrent()) return;
    if (error) {
      console.error("[CRM] hydration", error);
      onError(`Caricamento clienti fallito: ${error.message || ""}`);
      setCrmLoading(false);
      return;
    }
    dispatch({ type: "SET_CLIENTS", payload: (data || []).map(fromDbClient) });
    setCrmLoading(false);
  }, { enabled, deps: [enabled] });
```

> **Prerequisito da verificare prima del merge.** ✅ Va confermato che
> `public.clients` sia pubblicata sulla publication `supabase_realtime`.
> È esattamente l'inciampo già documentato per il modulo Liste, che ha avuto
> bisogno della migrazione `20260806090000_liste_realtime.sql` proprio perché
> una subscription su tabelle non pubblicate non riceve mai un evento — e
> fallisce in silenzio, che è il modo peggiore.
> Controllo: `select * from pg_publication_tables where pubname =
> 'supabase_realtime' and tablename = 'clients';`

---

### A-3 · `docs/SICUREZZA.md` afferma il falso su due punti di sicurezza

**File.** `docs/SICUREZZA.md`, §4 (matrice permessi), §5 (XSS), §6 (cosa fare),
§8 (CSP)

**Perché è una criticità.** Questo documento è, dichiaratamente, l'artefatto su
cui si ragiona della postura di sicurezza del progetto. Oggi contiene tre
affermazioni che il codice e il database smentiscono. Non sono imprecisioni di
stile: sono le premesse di decisioni.

**1. La CSP è descritta come non bloccante. Blocca.** 📄

`docs/SICUREZZA.md` §5 e §8:

> `Content-Security-Policy-Report-Only` … **non blocca nulla** … Fino a quando
> non viene promossa a header bloccante, la mitigazione strutturale contro
> l'esfiltrazione del token resta assente.

`vercel.json` spedisce invece l'header **bloccante**:

```json
{ "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; …" }
```

Due conseguenze opposte e entrambe dannose. Chi legge il documento per valutare
il rischio residuo da XSS conclude che la difesa non c'è, mentre c'è. E — più
grave — chi legge §6 punto 3 ("resta da promuoverla a bloccante") crede di
avere ancora un margine di sperimentazione che non ha: aggiungere uno script
inline, un CDN o un endpoint non previsto **rompe la produzione subito**, senza
il periodo di osservazione che il documento promette.

**2. Il vincolo del Junior Agent è descritto come non applicato dal database.
Il database lo applica.** ✅

`docs/SICUREZZA.md` §4:

> ⚠️ **Asimmetria da conoscere.** La restrizione del Junior Agent … è applicata
> dal client e dal guard di persistenza, **non dalla RLS**. Un Junior che
> chiamasse l'API Supabase direttamente … passerebbe … Renderlo tale richiede
> una colonna sotto-ruolo in `public.users` e un predicato RLS che la legga.

Entrambe le cose esistono e sono in produzione, verificate sul database live:
`public.users.seniority` esiste, `private.can_use_task_category(text)` esiste, ed
è cablata nel `WITH CHECK` di `tasks_insert` e `tasks_update`. Le due migrazioni
(`users_seniority`, `rls_task_category_and_pending_gate`) risultano in
`schema_migrations`. §6 punto 4 ("Decidere sul sotto-ruolo Junior … Oggi non è
né l'una né l'altra cosa") è quindi un lavoro già fatto ma ancora elencato come
aperto.

**3. Dati di contorno scaduti.** L'intestazione dice "93 migrazioni nel repo":
📄 sono 102. §6 punto 2 marca `set_updated_at_search_path` come "**non
applicata**": ✅ risulta applicata (`20260806090457`), e infatti il warning
`function_search_path_mutable` **non compare più** nell'advisor.

**Soluzione.** Correzioni puntuali, da applicare al documento:

- §5 e §8: sostituire ogni occorrenza di `Content-Security-Policy-Report-Only`
  con `Content-Security-Policy`; riscrivere la chiusura di §8 da "Come
  promuoverla a bloccante" a una nota di stato — *la policy è bloccante dal
  deploy del 6 agosto; ogni nuova origine (script, font, endpoint, CDN) va
  aggiunta qui prima di essere usata, altrimenti la richiesta viene bloccata in
  produzione*; correggere in §5 la frase "la mitigazione strutturale … resta
  assente".
- §4: sostituire il riquadro ⚠️ sull'asimmetria Junior con la descrizione del
  meccanismo attuale (colonna `users.seniority` + `private.can_use_task_category`
  nel `WITH CHECK` di `tasks_insert`/`tasks_update`), e chiudere §6 punto 4.
- §6 punto 2: marcare come applicata, citando la versione `20260806090457`.
- Intestazione: 102 migrazioni, data al 7 agosto 2026.
- §1: aggiungere il warning nuovo `anon_security_definer_function_executable`
  su `get_migrazioni_applicate()` alla tabella dei warning attesi, con la
  motivazione già scritta nella migrazione `revoke_anon_table_grants`
  (è il ping keep-warm, concesso ad `anon` di proposito). ✅ Oggi l'advisor lo
  segnala e il documento non lo spiega, quindi al prossimo giro sembrerà una
  regressione.

Suggerimento di processo, perché il problema si ripresenterà: le affermazioni
✅ di questo documento hanno una scadenza. Vale la pena aggiungere a
`scripts/verifica-advisor/` un controllo che fallisca quando l'insieme dei
warning dell'advisor **differisce** da quello atteso e scritto nel documento —
in entrambe le direzioni. Un warning nuovo va guardato; un warning sparito va
cancellato dal documento.

---

### M-1 · `AdminView` riceve `state` intero

**File.** `src/components/admin/AdminView.jsx:13,65-69`

**Perché.** `VoyageDesk.jsx` documenta esplicitamente l'invariante architetturale
opposta, e spiega perché:

> Le viste NON ricevono più `state`: leggono task e clienti dai provider e si
> fanno passare solo le fette piccole che consumano davvero … `state` cambia
> identità dopo qualunque azione — un toast, un carattere nella ricerca — e
> finché era una prop costringeva la vista attiva a ri-renderizzarsi per intero.

Cinque viste su sei rispettano la regola. `AdminView` no, e la propaga a tutte e
cinque le sue tab:

```jsx
export const AdminView = ({ state, dispatch }) => {
  …
  {tab === "team" && <AdminTeamTab state={state} dispatch={dispatch} />}
  {tab === "io"   && <AdminIOTab   state={state} dispatch={dispatch} />}
  {tab === "stats"&& <AdminStatsTab state={state} dispatch={dispatch} />}
  {tab === "cats" && <AdminCategoriesTab state={state} dispatch={dispatch} />}
  {tab === "log"  && <AdminLogTab  state={state} dispatch={dispatch} />}
```

Conseguenza pratica: con il pannello Admin aperto, **ogni** carattere digitato
nella ricerca della Topbar e **ogni** toast ri-renderizza l'intera vista Admin,
statistiche comprese. È anche l'unica vista dove un futuro `memo` non potrebbe
mai agganciarsi.

Va detto che l'impatto è contenuto — la vista è riservata agli admin e non è
quella dove si passa la giornata. Il motivo per sistemarla è un altro: è
l'eccezione che rende l'invariante non verificabile, e le invarianti con
un'eccezione sono quelle che si perdono.

**Soluzione.** Ogni tab dichiara le fette che consuma. `team`, `categories` e
`currentUserId` sono già in `AppDataContext`; le tab che leggono i task hanno
già `TasksContext`. Restano da passare come prop mirate solo `activityLog`,
`messageTemplates` e `agencyName`:

```jsx
export const AdminView = ({ state, dispatch }) => {
  …
  {/* Ogni tab riceve la sua fetta, non lo state: le prop qui sotto hanno
      identità stabile finché quella fetta non cambia davvero, mentre `state`
      ne cambia a ogni toast. Team, categorie e utente corrente non compaiono
      perché le tab li leggono già da AppDataContext. */}
  {tab === "team"  && <AdminTeamTab dispatch={dispatch} />}
  {tab === "io"    && <AdminIOTab dispatch={dispatch} agencyName={state.agencyName} />}
  {tab === "stats" && <AdminStatsTab />}
  {tab === "cats"  && <AdminCategoriesTab dispatch={dispatch} />}
  {tab === "log"   && <AdminLogTab dispatch={dispatch} activityLog={state.activityLog} />}
```

Da fare tab per tab, verificando con `grep -n "state\." src/components/admin/tabs/`
quali campi ciascuna legge davvero prima di tagliare.

---

### M-2 · Autocomplete cliente triplicato

**File.** `TaskSlideOver.jsx:79-85` · `QuickAddTask.jsx:61-69` ·
`ManualTab.jsx:141-144`

**Perché.** La stessa logica non banale — filtro per sottostringa, taglio a 6,
e la regola "nascondi la tendina se l'unico risultato coincide esattamente con
quanto digitato" — è scritta tre volte, con tre nomi di variabili diversi:

```js
// TaskSlideOver.jsx:79
const clientQuery = draft.client.trim().toLowerCase();
const clientMatches = (clientQuery ? clients.filter(c => c.name?.toLowerCase().includes(clientQuery)) : clients).slice(0, 6);
const showClientList = editable && clientFocus && clientMatches.length > 0 &&
  !(clientMatches.length === 1 && clientMatches[0].name?.toLowerCase() === clientQuery);

// QuickAddTask.jsx:61 — identica, senza `editable`
// ManualTab.jsx:141   — identica, dentro una IIFE nel JSX, nomi accorciati
```

più il markup della tendina, ricopiato tre volte con gli stessi valori di stile
(`maxHeight: 180`, `zIndex: Z.swipePanel`, il `setTimeout(…, 150)` sul blur che
serve a non chiudere la tendina prima del click).

Il costo non è l'estetica: è che una modifica al comportamento della ricerca
cliente ha tre punti di applicazione e nessuno che li leghi. Vale la pena notare
che altrove il progetto ha già affrontato e risolto esattamente questo problema
— `lib/searchUtils.js` esiste perché la ricerca dell'anagrafica e quella delle
liste divergevano — quindi lo strumento culturale c'è già.

**Soluzione.** Un hook per la logica e un componente per il markup, in
`src/components/ui/ClientAutocomplete.jsx`:

```jsx
// src/components/ui/ClientAutocomplete.jsx
// La tendina di suggerimento cliente, condivisa da TaskSlideOver, QuickAddTask
// e ManualTab. Prima era scritta tre volte: stessa logica di filtro, stessa
// regola "nascondi se l'unico match è esatto", stesso markup con gli stessi
// valori di stile. Il campo cliente resta testo libero (task.client è una
// stringa, non una FK), quindi questo componente suggerisce e non vincola.
import { useState } from "react";
import { Z } from "../../styles/tokens.js";

const MAX_SUGGERIMENTI = 6;

export function useClientSuggestions(clients, valore, { enabled = true } = {}) {
  const [focus, setFocus] = useState(false);
  const query = (valore || "").trim().toLowerCase();
  const matches = (query
    ? (clients || []).filter(c => c.name?.toLowerCase().includes(query))
    : (clients || [])
  ).slice(0, MAX_SUGGERIMENTI);
  // Un solo risultato identico a ciò che è già scritto non è un suggerimento:
  // è la ripetizione di quanto l'utente ha appena selezionato.
  const visible = enabled && focus && matches.length > 0 &&
    !(matches.length === 1 && matches[0].name?.toLowerCase() === query);
  return {
    matches,
    visible,
    // 150ms: il blur arriva prima del click sulla voce, chiudere subito
    // annullerebbe la selezione.
    inputProps: {
      autoComplete: "off",
      onFocus: () => setFocus(true),
      onBlur: () => setTimeout(() => setFocus(false), 150),
    },
    close: () => setFocus(false),
  };
}

export function ClientSuggestions({ matches, visible, onPick }) {
  if (!visible) return null;
  return (
    <div style={{
      position: "absolute", top: "100%", left: 0, right: 0, zIndex: Z.swipePanel,
      marginTop: 3, background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
      maxHeight: 180, overflowY: "auto",
    }}>
      {matches.map(c => (
        <button key={c.id} type="button" onMouseDown={() => onPick(c)} style={{
          display: "block", width: "100%", textAlign: "left", padding: "8px 10px",
          background: "none", border: "none", font: "inherit", cursor: "pointer",
        }}>{c.name}</button>
      ))}
    </div>
  );
}
```

Uso, in `TaskSlideOver.jsx`:

```jsx
const cli = useClientSuggestions(clients, draft.client, { enabled: editable });
…
<div style={{ position: "relative" }}>
  <input value={draft.client} {...cli.inputProps}
         onChange={e => setDraft(d => ({ ...d, client: e.target.value }))}
         onBlur={() => { cli.inputProps.onBlur(); commitText("client", { nullable: true }); }} />
  <ClientSuggestions matches={cli.matches} visible={cli.visible}
                     onPick={(c) => { cli.close(); pickClient(c); }} />
</div>
```

`pickClient` resta dov'è: l'ereditarietà del contatto dall'anagrafica è logica di
TaskSlideOver, non del suggeritore. Nota che `onMouseDown` sostituisce `onClick`
nel componente estratto — è ciò che rende il `setTimeout(…, 150)` sul blur non
più necessario a lungo termine, ma va cambiato in un secondo passo per non
mescolare due modifiche.

---

### M-3 · Il cambio-utente vive ancora nel bundle di produzione

**File.** `src/state/reducer.js:139-179` · `src/components/shell/AdminRollbackBanner.jsx`
· `src/components/shell/UserSwitcher.jsx:41`

**Perché.** L'unico punto d'ingresso UI è correttamente disattivato:

```js
// UserSwitcher.jsx:41
const SHOW_DEMO_SWITCH = import.meta.env.DEV && import.meta.env.VITE_DEMO_SWITCH === 'true';
```

`import.meta.env.DEV` è `false` nel build di produzione, quindi il ramo viene
eliminato dal bundler. 📄 Ho verificato che non esistano altri dispatcher di
`SET_CURRENT_USER` oltre a `UserSwitcher` e ad `AdminRollbackBanner` (che
compare solo *dopo* uno switch già avvenuto). **Non è quindi una vulnerabilità:
non c'è modo di raggiungerlo in produzione.**

Il rilievo è di superficie residua. Il `case "SET_CURRENT_USER"` resta nel
reducer di produzione, e quel case cambia `state.currentUserId` — cioè
esattamente il valore su cui poggiano *tutte* le decisioni di permesso lato
client, compresa `canAccessAdmin(state.team, state.currentUserId)` che decide se
montare `AdminView`. Il commento in `UserSwitcher` è preciso sul fatto che
questo confonde le RLS ("auth.uid() server-side resta l'utente reale"), quindi
le scritture fallirebbero comunque; ma la vista Admin verrebbe montata, con i
dati che quella sessione può già leggere.

In un progetto che ha appena speso una migrazione (`revoke_anon_table_grants`)
per rimuovere privilegi *non sfruttabili* con la motivazione esplicita — «resta
un errore, smette di essere un incidente» — questo codice è lo stesso caso,
nell'altro strato.

**Soluzione.** Compilare via il codice, non solo l'ingresso. In `reducer.js`:

```js
    case "SET_CURRENT_USER": {
      // Cambio-utente demo: cambia SOLO currentUserId lato client, mentre
      // auth.uid() lato server resta l'utente reale — quindi non concede
      // nessun dato, ma monta viste (Admin) decise da currentUserId. L'unico
      // ingresso UI è già gate-ato da import.meta.env.DEV in UserSwitcher;
      // questo secondo guard toglie il case dal bundle di produzione invece di
      // limitarsi a renderlo irraggiungibile. Stessa logica della migrazione
      // revoke_anon_table_grants: un privilegio non sfruttabile è comunque un
      // privilegio da non concedere.
      if (!import.meta.env.DEV) return state;
      const newId = action.payload;
      …
```

e allo stesso modo rendere condizionale il montaggio del banner in
`VoyageDesk.jsx`:

```jsx
        {import.meta.env.DEV && state.adminRollbackTo && state.adminSwitchedAt && (
          <AdminRollbackBanner … />
        )}
```

> **Attenzione ai test.** 📄 Diversi test dispatchano `SET_CURRENT_USER` per
> esercitare la matrice permessi. Sotto Vitest `import.meta.env.DEV` è `true`,
> quindi restano verdi — ma va verificato con un `vitest run` prima del merge,
> non dato per scontato.

Alternativa, se il cambio-utente demo non serve più a nessuno: rimuovere del
tutto `SET_CURRENT_USER`, `adminRollbackTo`, `adminSwitchedAt`,
`CANCEL_ADMIN_ROLLBACK`, `AdminRollbackBanner` e il ramo demo di
`UserSwitcher`. È meno codice e una decisione in meno da rispiegare. La scelta
fra le due dipende da quanto il test multi-ruolo manuale sia ancora usato, che
è informazione che ha chi sviluppa, non chi legge il repo.

---

### M-4 · Nessun test verifica le policy RLS

**File.** `src/test/**`

**Perché.** 🔬 789 test verdi, di cui una parte consistente dedicata ai permessi:
`permissions.test.js` (matrice sulle funzioni pure), `persistenceGuards.test.js`
(guard ≡ verdetto del reducer), `reducerPurity.test.js`, `syncedDispatch.test.jsx`
(un'azione negata non raggiunge il server). È una copertura seria.

Copre però **un solo lato del confine**. Nessun test apre una connessione con il
token di un `driver` e verifica che il database rifiuti davvero l'insert di un
task `payment`. Il documento `SICUREZZA.md` §7 lo riconosce onestamente ("è il
buco di copertura più significativo dell'area sicurezza"), e resta vero.

Perché conta più di quanto sembri: dal 6 agosto le regole di autorizzazione sono
scritte **due volte** — in `lib/permissions.js` e nelle policy/funzioni
`private.*`. È esattamente la configurazione che il registry di persistenza
esiste per evitare in un altro strato ("due switch paralleli da tenere allineati:
qualsiasi divergenza non produce un errore di compilazione"). Qui la divergenza
è possibile e nessun test la intercetterebbe.

**Soluzione.** Un test d'integrazione, fuori da `vitest run` di default perché
richiede credenziali e tocca un database vero. Da eseguire su un branch Supabase
o su un progetto di staging, **mai in produzione**:

```js
// src/test/integration/rls.test.js — richiede RLS_TEST_URL / credenziali di
// staging; escluso dalla suite di default (vedi vite.config.js `test.exclude`).
//
// Perché esiste: da 20260806081127 la matrice categoria-per-ruolo è scritta in
// DUE posti — lib/permissions.js e private.can_use_task_category(). Nessun test
// esistente attraversa il confine: verificano che il client si comporti bene,
// mai che il database rifiuti chi il client non ferma. Questo lo fa.
import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const url = process.env.RLS_TEST_URL;
const suite = url ? describe : describe.skip; // niente credenziali → skip, non fallimento

suite("RLS: la matrice categoria è applicata dal database", () => {
  let driver;
  beforeAll(async () => {
    driver = createClient(url, process.env.RLS_TEST_ANON_KEY);
    const { error } = await driver.auth.signInWithPassword({
      email: process.env.RLS_TEST_DRIVER_EMAIL,
      password: process.env.RLS_TEST_DRIVER_PASSWORD,
    });
    if (error) throw error;
  });

  it("rifiuta a un driver la creazione di un task fuori da 'transfer'", async () => {
    const { data: { user } } = await driver.auth.getUser();
    const { error } = await driver.from("tasks").insert({
      title: "sonda rls", category: "payment", status: "todo", created_by: user.id,
    });
    // 42501 = insufficient_privilege: è la RLS che rifiuta, non un vincolo
    // qualunque. Asserire solo "error è truthy" farebbe passare il test anche
    // se fallisse per un NOT NULL mancante.
    expect(error).toBeTruthy();
    expect(error.code).toBe("42501");
  });

  it("consente a un driver la categoria 'transfer'", async () => {
    const { data: { user } } = await driver.auth.getUser();
    const { data, error } = await driver.from("tasks")
      .insert({ title: "sonda rls ok", category: "transfer", status: "todo", created_by: user.id })
      .select().single();
    expect(error).toBeNull();
    await driver.from("tasks").delete().eq("id", data.id);
  });
});
```

Anche solo tre o quattro casi — driver/categoria, junior/categoria, utente
`pending` respinto, non-admin che tenta `update` di `users.role` — cambierebbero
la natura dell'affermazione «client e database concordano» da *letta* a
*misurata*. Con `describe.skip` in assenza di credenziali il file non disturba
la CI di chi non le ha.

---

### M-5 · `stateRef` aggiornato in `useEffect`

**File.** `src/hooks/useSyncedDispatch.js:26-28`

**Perché.**

```js
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);
```

`useEffect` gira **dopo** il commit. Fra due `dispatch` chiamati nello stesso
handler, `stateRef.current` è ancora quello *precedente al primo*. Il motivo per
cui il ref esiste (mantenere stabile l'identità di `dispatch`) è giusto; il
punto di aggiornamento no.

L'impatto oggi è limitato, e va detto onestamente: i `guard` sono idempotenti
rispetto a questo scarto, e i casi che leggono lo stato per *calcolare* il
valore da scrivere — `TOGGLE_TEAM_MEMBER_ACTIVE` con `!curr?.active`,
`TOGGLE_PIN_NOTICE` con `!prev?.pinned` — sono guidati da click separati, fra i
quali l'effetto ha già girato. È una latenza, non un bug osservato.

Vale però la pena chiuderla, perché è la classe di difetto che si manifesta solo
quando qualcuno aggiunge un flusso che dispatcha due volte di fila — cosa che il
codice già fa altrove (`pickClient` in `TaskSlideOver.jsx:89-96` dispatcha
`client` e poi `contact`).

**Soluzione.** Assegnare in fase di render. Per un ref che rispecchia una prop o
uno state — senza leggerlo nello stesso render — è il pattern corretto e non
introduce impurità osservabile:

```js
  // Assegnato in RENDER e non in useEffect: l'effetto gira dopo il commit,
  // quindi fra due dispatch nello stesso handler il ref conserverebbe lo stato
  // precedente al primo. I guard non se ne accorgono (sono idempotenti), ma le
  // entry che dal vecchio stato CALCOLANO il valore da scrivere — il `!curr.active`
  // di TOGGLE_TEAM_MEMBER_ACTIVE, il `!prev.pinned` di TOGGLE_PIN_NOTICE —
  // sceglierebbero sul valore sbagliato. Il ref non viene mai letto durante il
  // render, quindi l'assegnazione non rende questo componente impuro.
  const stateRef = useRef(state);
  stateRef.current = state;
```

---

### B-1 · Refetch completo anche su `tasks`

**File.** `src/hooks/useAppHydration.js:32-46`

✅ `tasks` = 246, `task_history` = 569, `comments` = 7. Oggi il volume è
modesto, ma la struttura è la stessa di A-1 e peggiora nello stesso modo:
`TASK_SELECT_WITH_COMMENTS` porta con sé commenti e cronologia con i join sui
nomi, `includeDeleted: true` include il cestino, non c'è paginazione, e la
sottoscrizione è su **tre** tabelle — quindi anche un semplice commento
ricarica l'intero grafo dei task.

La stessa correzione di A-1 (propagare la tabella d'origine) si applica qui:
un evento su `comments` o `task_history` non richiede di ricaricare i task.
Priorità bassa perché il volume attuale non fa male; è il candidato successivo
non appena A-1 è in piedi, visto che il meccanismo sarà già pronto.

Va inoltre verificato ✅ se il progetto ha un cap di righe lato PostgREST
(`db-max-rows`): con una query senza `.range()` un eventuale cap tronca la
risposta **in silenzio**, e il sintomo sarebbe "alcuni task non si vedono", che
è difficilissimo da attribuire.

### B-2 · `leaked_password_protection` disabilitata

✅ Confermato dall'advisor live, già elencato in `SICUREZZA.md` §6 punto 1.
Resta un interruttore nella dashboard (Auth → Password), non fattibile da
codice. Costo nullo, valore reale visto che l'accesso è a sola password.

### B-3 · Formattatori e limiti duplicati

📄 `taskUtils.js:4` (`formatDate`) e `listeApi.js:411` (`fmtDate`) formattano
entrambi date per la UI, con nomi e comportamenti diversi. `fileUtils.js:6`
fissa 50 MB per gli allegati task, `chatFiles.js:9` 25 MB per la chat.

Nessuno dei due è un difetto — il modulo Liste ha di proposito una sua identità
visiva, e i due limiti possono benissimo essere una scelta. Il rilievo è che
*non è scritto da nessuna parte che siano scelte*, quindi il prossimo che tocca
uno dei due non sa se sta allineando o divergendo. Basta un commento incrociato
su ciascuno che rimandi all'altro e dica perché differiscono.

### B-4 · Warning ESLint

🔬 22 `react/no-multi-comp` e 1 `react-hooks/exhaustive-deps`
(`Toast.jsx:14`, dipendenza `dispatch` mancante — innocua, `dispatch` ha
identità stabile per costruzione in `useSyncedDispatch`). Zero errori.

I 22 `no-multi-comp` sono in larga parte legittimi: un sotto-componente privato
accanto a chi lo usa è più leggibile di un file in più. La raccomandazione non è
di sistemarli, ma di **decidere**: o si disattiva la regola in
`eslint.config.js` con una riga di motivazione, o la si rispetta. 22 warning
permanenti addestrano a non leggere l'output del linter, ed è quello il costo
vero — perché è lo stesso output in cui comparirà il ventitreesimo, che magari
conta.

---

## 4. Top 3 suggerimenti strategici

### 1. Dare al realtime la granularità che gli manca — e iniziare dal modulo Liste

**Perché prima di tutto.** È l'unico rilievo con una traiettoria: gli altri
costano oggi quanto costeranno fra sei mesi, questo no. 616 liste e 5.315
movimenti fanno sì che ogni movimento registrato scarichi tre dataset completi
su ogni client connesso, e sia il numero di righe sia il numero di utenti
crescono. La correzione (A-1) è contenuta — propagare al callback di reload
*quale* tabella ha generato l'evento — e sblocca la stessa correzione per i task
(B-1) senza altro lavoro di impianto.

Da fare per primo anche perché è a rischio bassissimo: non tocca permessi, non
tocca RLS, non cambia il modello di dati, e il gen-counter esistente continua a
proteggere dalle risposte fuori ordine.

### 2. Portare a misura ciò che oggi è affermato: RLS testata, documentazione verificata

Il progetto ha una qualità non comune, e la deve a un metodo esplicito: scrivere
accanto a ogni scelta il perché, e verificare invece di supporre. I due rilievi
A-3 e M-4 sono la stessa crepa in quel metodo, ai due estremi. Da un lato
`SICUREZZA.md` afferma cose che erano vere e non lo sono più — con l'effetto
paradossale di **sottostimare** la postura reale (la CSP blocca, il Junior è
applicato dal DB) e insieme di autorizzare mosse pericolose (aggiungere uno
script inline "tanto è Report-Only"). Dall'altro, la conformità fra i permessi
client e le policy RLS è garantita «dalla lettura, non da un test» — parole del
documento stesso — proprio ora che quelle regole sono scritte in due posti.

Concretamente: correggere le quattro affermazioni scadute di `SICUREZZA.md`, e
aggiungere quattro test d'integrazione RLS (driver/categoria, junior/categoria,
utente `pending`, escalation di `users.role`). È mezza giornata, e trasforma la
frase più importante del documento da opinione informata a fatto misurato.

### 3. Rendere l'architettura verificabile, non solo documentata

`VoyageDesk.jsx` contiene un'invariante scritta bene — *le viste non ricevono
`state`* — con la motivazione tecnica accanto. Cinque viste su sei la
rispettano; `AdminView` no (M-1). Allo stesso modo, tutte le entità di dominio
hanno una subscription realtime tranne `clients` (A-2), e tutte le entità
passano dal registry di persistenza.

Il valore di sistemare queste due eccezioni non è il micro-guadagno di
performance: è che **un'invariante con un'eccezione non è più un'invariante**,
e smette di poter essere controllata — da una persona in review come da un test.
Una volta chiuse, entrambe diventano affermazioni verificabili meccanicamente
(un test che monta ogni vista e asserisce che non riceva `state`; un test che
confronti l'elenco delle entità del reducer con quello delle tabelle
sottoscritte). Il progetto ha già dimostrato di saper fare esattamente questo
con `persistenceGuards.test.js`, che blinda la coincidenza fra guard e reducer:
è lo stesso movimento, applicato a due invarianti che oggi vivono solo nei
commenti.

---

## Appendice — cosa ho verificato e non ho trovato

Elencato perché un audit che riporta solo i problemi non dice quanto in largo ha
guardato, e perché la prossima persona non rifaccia lo stesso lavoro.

| Verifica | Esito |
|---|---|
| Tabelle `public` senza RLS | nessuna ✅ |
| Errori dell'advisor di sicurezza | 0 ✅ (10 warning, tutti attesi e motivati) |
| GRANT residui su `public` per `anon` | 0 ✅ |
| Bucket `avatars` pubblico | no, privato ✅ |
| `allowed_mime_types` su `chat-files` / `task-files` | 36 tipi entrambi, SVG e HTML esclusi ✅ |
| Migrazioni di sicurezza del 6 agosto applicate | 11 su 11 ✅ |
| Colonna `users.seniority` + `private.can_use_task_category` | presenti e cablate in `tasks_insert`/`tasks_update` ✅ |
| `dangerouslySetInnerHTML` / `innerHTML` | 0 occorrenze 📄 |
| Segreti nel bundle client | solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` 📄 |
| Redirect aperto nell'invito (`safeRedirect`) | ristretto a produzione + preview del progetto, label annidate escluse 📄 |
| CORS delle Edge Function | riflette l'Origin solo se del progetto, altrimenti produzione 📄 |
| Autorizzazione delle Edge Function | `invite-user` e `delete-user` admin-only; `delete-account` self-service; `send-push` su secret confrontato a tempo costante 📄 |
| Sink di navigazione con input utente | `window.open(signedUrl, "_blank", "noopener")` e schemi `tel:`/`sms:`/`wa.me` da `sanitizePhone` 📄 |
| Escalation via `users_update_self` | bloccata dal trigger che ripristina `role`/`active`/`pending`/`capacity`/`id` 📄 |
| Coerenza fra file di migrazione e stato applicato | allineata; le versioni in `schema_migrations` non coincidono con i nomi dei file, ma `scripts/verifica-rpc/verifica-migrazioni.js` confronta per nome e gestisce già lo scarto 📄 ✅ |

---

*Documento di sola analisi: nessuna modifica al codice applicativo, alle
migrazioni o alla configurazione è stata effettuata in questa sessione.*
