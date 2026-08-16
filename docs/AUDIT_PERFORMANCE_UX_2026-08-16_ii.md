# Audit performance/scalabilità e UX/error handling — 16 agosto 2026 (secondo passaggio)

Ambito di questo passaggio: **performance e scalabilità** + **UX ed error
handling**. È un secondo passaggio sullo stesso perimetro di
[`AUDIT_ARCHITETTURA_2026-08-16.md`](AUDIT_ARCHITETTURA_2026-08-16.md), fatto
dopo la chiusura dei suoi sei rilievi: quello che segue è ciò che resta quando
i difetti che quel documento descrive non ci sono più. I rilievi ancora aperti
là (`B-1…B-6`) non sono riaperti qui.

Metodo: lettura del codice, `npm ci && npm run build` + `verifica:bundle` sul
build reale, interrogazione in **sola lettura** del database di produzione
(`vmxvnxsqfisucugcpqlc`) per dimensioni e tassi di crescita, e una misura
diretta del costo del filtro di ricerca su un'anagrafica delle dimensioni di
quella vera.

Numeri di partenza, misurati oggi:

| | |
|---|---|
| Chunk d'ingresso | **71,21 kB gzip** (soglia 84) |
| First load | **171,15 kB gzip** (soglia 184) |
| `tasks` | **291 righe**, di cui **209 completate** e 33 nel cestino |
| Payload JSON di `tasks` | **190 kB**, di cui **158 kB (82,5%)** completate o cestinate |
| `task_history` | **657 righe** — 394 negli ultimi 30 giorni (**~13/giorno**) |
| `clients` | **835 righe** |
| Task create | **167 negli ultimi 30 giorni** (~5,6/giorno) |

> **Stato: 1 rilievo su 11 chiuso** — A-1, lo stesso 16 agosto, su richiesta
> esplicita (era il suggerimento strategico n.1). Il resto è analisi.
>
> **Nessun rilievo critico.** I tre rilievi di priorità Alta non perdono dati
> in silenzio e non aggirano permessi: due riguardano ciò che l'utente vede
> quando qualcosa va storto (una schermata d'errore sproporzionata, un form che
> si svuota), il terzo è un costo che oggi non si sente e fra dodici mesi sì.
> Vanno però letti insieme: **A-1 e A-2 sono entrambi difetti già riconosciuti
> dal progetto, corretti in alcuni punti e non in altri.** Non è debito nuovo,
> è un censimento incompleto — e il censimento incompleto è la forma di debito
> che si ripresenta.

---

## Executive Summary

Il progetto è in **buona salute**, e nelle due aree di questo audit lo è per
ragioni verificabili e non per impressione. Il bundle è sotto controllo con
soglie automatiche in CI (`verifica:bundle`), le sei viste pesanti sono dietro
`lazy()`, la catena di memoizzazione del guscio è stata riparata fino in fondo
il 16 agosto e regge (Dashboard, Sidebar, BottomNav e ChatPanel saltano davvero
il render). Sul fronte errori il perimetro è chiuso meglio di quanto sia
comune: tre livelli di boundary, handler globali per `unhandledrejection` e
`error` con dedup e riconoscimento del chunk mancante, codice di segnalazione
al posto dello stack a schermo, banner offline persistente, scheletri per
entità che distinguono «vuoto» da «non lo so ancora». Sono scelte da
gestionale maturo, non da prototipo.

Ciò che emerge da questo passaggio ha una forma sola, ripetuta tre volte: **una
regola giusta, scritta e motivata, applicata a una parte dei call site.**

- Il boundary sugli overlay lazy esiste, ha un file suo e un commento che
  spiega perché serve — ed era applicato a **2 punti di montaggio su 9** (A-1).
  Degli altri sette, quattro — ChatPanel, i due pannelli della Topbar e
  ProfileEditor — in caso di chunk 404 dopo un deploy portavano via **l'intera
  app**; gli altri tre, montati dentro una vista, l'intera **vista**.
  ✔ **Chiuso lo stesso 16 agosto** con `ui/LazyPanel.jsx` (Suspense e boundary
  in un gesto solo), applicato a tutti e nove, più un controllo in
  `verifica:convenzioni` perché il decimo non possa ricominciare da capo.
- La regola «⛔ niente `if (!campo) return;` muto» è scritta in `CLAUDE.md`,
  blindata da un test e applicata a otto form dopo M-3 — ma il censimento
  contava otto form e i form sono nove: **manca quello aperto dal FAB su ogni
  vista** (A-2), che oltre a uscire in silenzio a titolo vuoto è anche l'unico
  percorso di creazione che, se la scrittura fallisce, chiude la modale e
  butta via quello che l'utente ha scritto — mentre le quattro tab del
  BulkTaskCreator fanno esattamente il contrario, con tanto di commento che
  spiega perché.
- La finestra sugli elenchi lunghi («24 card alla volta, non 818») è una
  convenzione documentata, con la motivazione e il caveat sul riazzeramento —
  e vale per **2 viste su 7** (M-2).

La scalabilità ha invece un unico punto che merita una decisione ora, mentre è
ancora una scelta e non un'emergenza: **l'idratazione iniziale scarica lo
storico completo dei task** (A-3). Oggi l'82,5% di quel payload è materiale che
nessuna vista d'ingresso guarda — task completate e cestinate — e cresce di
~5,6 task e ~13 righe di cronologia al giorno, senza potatura, in una tabella
riletta per intero a ogni avvio a freddo. Non è un difetto di correttezza:
`fetchAllRows` è corretto e non tronca in silenzio (è stato il rilievo C-1, ed
è chiuso). È che essere corretti qui significa scaricare **tutto**, per sempre.

---

## Tabella delle priorità

| # | Priorità | Area | Rilievo | File |
|---|---|---|---|---|
| A-1 ✔ | 🟠 **Alta** | UX / errori | 7 punti di montaggio `lazy()` su 9 senza error boundary proprio: un chunk 404 dopo un deploy porta via l'intera app (4) o l'intera vista (3) — **chiuso lo stesso 16 agosto** | `VoyageDeskInner.jsx:484`, `shell/Topbar.jsx:169,191`, `shell/UserSwitcher.jsx:218`, `clients/ClientiView.jsx:336`, `clients/ClienteDetailPanel.jsx:91`, `views/Archive.jsx:289` |
| A-2 | 🟠 **Alta** | UX / errori | `QuickAddTask` — il form più usato dell'app — esce in silenzio a titolo vuoto E perde i dati se la scrittura fallisce | `modals/QuickAddTask.jsx:118-149` |
| A-3 | 🟠 **Alta** | Scalabilità | L'idratazione scarica lo storico completo dei task: 82,5% del payload è non operativo, cresce ~13 righe/giorno senza tetto | `hooks/useAppHydration.js:144`, `lib/api.js:319` |
| M-1 | 🟡 Media | UX / errori | `ClientiView.handleSave` chiude la modale senza attendere la scrittura: `saving` non si vede mai, doppio invio possibile, dati persi in caso d'errore | `clients/ClientiView.jsx:160-176`, `clients/ClienteModal.jsx:44,81,184` |
| M-2 | 🟡 Media | Performance | La finestra sugli elenchi lunghi è applicata a 2 viste su 7: Archivio, Cestino e le cinque code disegnano l'array intero | `views/Archive.jsx:188,247`, `views/Trash.jsx:187`, `dashboard/queues/*` |
| M-3 | 🟡 Media | Performance | Ricerca a testo libero senza debounce né indice: **6,32 ms per battuta** su 835 clienti, contro 0,19 ms con indice precalcolato | `clients/ClientiView.jsx:124-141`, `views/Archive.jsx:63-71`, `lib/searchUtils.js:50` |
| M-4 | 🟡 Media | UX / errori | Il commento digitato viene cancellato prima che la scrittura sia confermata | `tasks/TaskSlideOver.jsx:128-138` |
| B-1 | 🟢 Bassa | Performance | L'intera app è nel chunk d'ingresso anche per chi è fermo alla schermata di login | `auth/AuthGate.jsx:3` |
| B-2 | 🟢 Bassa | UX / errori | Il toast «Task aggiornato!» precede la conferma del server e può essere smentito dal toast successivo | `state/reducer.js:307-309` |
| B-3 | 🟢 Bassa | UX / errori | Quattro call site ancora fuori dalla regola di M-3, tutti nella variante «bottone spento» | `views/Trash.jsx:392`, `chat/NewConversationView.jsx:149`, `modals/bulk/TemplateTab.jsx:198`, `liste/modals/EditListaModal.jsx:51` |
| B-4 | 🟢 Bassa | Performance | `Archive` ricalcola filtro, permessi e ordinamento a ogni render senza `useMemo` | `views/Archive.jsx:60-71,100` |

---

## Action plan dettagliato

### 🟠 A-1 · Sette punti di montaggio `lazy()` senza error boundary ✔

> **Chiuso lo stesso 16 agosto** — vedi «Correzione» in fondo alla sezione.
>
> ⚠️ **Correzione a questo stesso rilievo, emersa implementando il fix.** La
> prima stesura diceva che tutti e sette portavano via «l'INTERA app». È vero
> per **quattro**; per gli altri tre — ClientImportModal, ClienteListePanel,
> ArchivedListe — il primo boundary sopra di sé è `ViewErrorBoundary`, perché
> sono montati *dentro* una vista. Lì si perde l'intera **vista** (con un
> "riprova" che riporta alla Dashboard) per non essere riusciti ad aprire un
> modale sopra di essa: sproporzionato allo stesso modo, ma non la stessa
> cosa. Il rilievo e la correzione non cambiano, la sua descrizione sì.

**Dove.** Con il boundary che ciascuno aveva *ereditato* prima della correzione:

| Punto di montaggio | Primo boundary sopra | Cosa si perdeva |
|---|---|---|
| `VoyageDeskInner.jsx:484` — ChatPanel | `main.jsx` | **tutta l'app** |
| `shell/Topbar.jsx:169` — AdvancedSearchPanel | `main.jsx` | **tutta l'app** |
| `shell/Topbar.jsx:191` — NotificationsPanel | `main.jsx` | **tutta l'app** |
| `shell/UserSwitcher.jsx:218` — ProfileEditor | `main.jsx` | **tutta l'app** |
| `clients/ClientiView.jsx:336` — ClientImportModal | `ViewErrorBoundary` | l'intera vista |
| `clients/ClienteDetailPanel.jsx:91` — ClienteListePanel | `ViewErrorBoundary` | l'intera vista |
| `views/Archive.jsx:289` — ArchivedListe | `ViewErrorBoundary` | l'intera vista |

I quattro con `main.jsx` sono quelli montati **fuori** dal `<main>` della vista
attiva: la Topbar sta sopra `ViewErrorBoundary` nella gerarchia, ChatPanel le è
fratello.

**Perché è un difetto.** Non è una deduzione: la motivazione è già scritta nel
progetto, in cima a `components/OverlayErrorBoundary.jsx`.

> React non dà un error boundary implicito a `lazy()`/`Suspense`: se il chunk
> risponde 404 dopo un deploy, o il modale semplicemente esplode in render,
> l'errore sale fino all'ErrorBoundary di main.jsx — quello che sostituisce
> TUTTA l'app con la schermata "Ricarica". Sproporzionato per un pannello.

Quel file esiste, è corretto, ed è usato in **due** dei nove punti in cui
l'app monta un componente `lazy()`: TaskSlideOver e BulkTaskCreator. Negli
altri sette c'è `<Suspense>` da solo — e `Suspense` non intercetta errori,
gestisce solo l'attesa. Due aggravanti:

1. **Lo scenario non è teorico, è il più frequente in produzione.** Lo dice
   `lib/errorReporting.js`: «un chunk lazy che risponde 404 è il caso più
   frequente in produzione: succede a OGNI deploy con una scheda aperta».
   Un'agenzia lascia l'app aperta tutto il giorno; il deploy avviene mentre è
   aperta. Chi in quel momento apre la campanella delle notifiche non vede un
   pannello che non si apre: vede l'app sparire e sostituirsi con la schermata
   nera «Qualcosa è andato storto».
2. **Tre dei quattro casi peggiori stanno nella shell** (i due pannelli della
   Topbar e ProfileEditor dentro UserSwitcher), cioè SOPRA `ViewErrorBoundary`
   nella gerarchia. Per loro non esiste alcun boundary intermedio nemmeno in
   teoria: la risalita va diritta a quello di `main.jsx`.

Il caso peggiore è ChatPanel, e per una ragione che si vede solo mettendo in
fila due decisioni entrambe giuste: da ST-12 il pannello è montato **solo da
aperto**, quindi il chunk (15,48 kB gzip, il più grande fra i lazy) si scarica
per la prima volta nel momento in cui l'utente clicca — cioè il momento in cui
la finestra di rischio del 404 post-deploy è aperta.

**Correzione (applicata).** Il boundary c'era già, mancava l'applicazione
uniforme. La forma che non lascia spazio a un ottavo call site dimenticato è
una primitiva che compone i due pezzi, così «montare un lazy» e «avere un
boundary» diventano la stessa operazione:

```jsx
// src/components/ui/LazyPanel.jsx
// Suspense e boundary insieme: montare un componente lazy SENZA rete di
// sicurezza non deve più essere una cosa che si può scrivere per distrazione.
// Il boundary sta FUORI da Suspense di proposito — così copre anche un errore
// lanciato dal fallback — ed è comunque antenato del componente lazy, che è
// l'unica condizione perché lo intercetti.
import { Suspense } from "react";
import { OverlayErrorBoundary } from "../OverlayErrorBoundary.jsx";
import { LazyFallback } from "./LazyFallback.jsx";

export function LazyPanel({ resetKey, onReset, overlay = false, children }) {
  return (
    <OverlayErrorBoundary resetKey={resetKey} onReset={onReset}>
      <Suspense fallback={<LazyFallback overlay={overlay} />}>
        {children}
      </Suspense>
    </OverlayErrorBoundary>
  );
}
```

Il call site di ChatPanel diventa:

```diff
 {showChat && (
-  <Suspense fallback={<LazyFallback overlay />}>
+  <LazyPanel resetKey="chat" onReset={closeChatPanel} overlay>
     <ChatPanel open onClose={closeChatPanel} … />
-  </Suspense>
+  </LazyPanel>
 )}
```

e quello della campanella in `Topbar.jsx`:

```diff
 {showNotif && (
-  <Suspense fallback={<LazyFallback />}>
+  <LazyPanel resetKey="notifiche" onReset={() => setShowNotif(false)}>
     <NotificationsPanel … />
-  </Suspense>
+  </LazyPanel>
 )}
```

`onReset` non è un dettaglio: senza, il pannello d'errore ha un bottone
«Chiudi» che non chiude niente e lo stato `showNotif` resta `true`.

Tutti e nove i punti di montaggio passano ora da qui — inclusi i due che il
boundary ce l'avevano già, così non resta una seconda forma corretta accanto a
quella canonica. `ViewErrorBoundary` resta dov'era: è il boundary della vista
attiva, un'altra cosa dal boundary di un pannello montato sopra di essa.

**Guardia — due, e fanno due lavori diversi.**

`src/test/lazyPanel.test.jsx` (5 casi) fissa la proprietà vera, che non è «il
riquadro d'errore compare» ma «l'errore NON sale». Il primo caso è un
**controllo positivo**: monta lo stesso chunk rotto con il solo `<Suspense>` e
verifica che l'antenato esploda davvero. Senza quel caso, gli altri
passerebbero identici anche con un `LazyPanel` che non fa niente, perché in
`render()` non c'è nessun antenato a cui l'eccezione possa arrivare.

`montaggiLazySenzaRete` in `scripts/verifica-convenzioni/convenzioni.js`
(controllo `lazy() senza boundary`, atteso **0**) impedisce la ricaduta: segnala
per nome ogni file che importi `lazy` da react senza nominare alcuna rete di
sicurezza. Due dettagli non ovvi, entrambi emersi facendolo:

- **il segnale è l'IMPORT, non la chiamata.** La prima versione cercava
  `/\blazy\s*\(/` e al primo giro ha segnalato `ui/LazyFallback.jsx` — che
  dice «mentre un chunk lazy (AdminView, …) viene scaricato» in un commento ed
  è il file del *fallback*, non un punto di montaggio. L'import di `lazy` da
  react c'è se e solo se il file può montarne uno, e non può restare per
  sbaglio: `no-unused-vars` lo toglierebbe;
- **solleva se NESSUN file importa `lazy`**, come ogni altra lettura di quello
  script: un controllo verde perché non ha trovato niente da controllare è il
  difetto che `verifica:convenzioni` esiste per chiudere.

---

### 🟠 A-2 · `QuickAddTask`: il form più usato esce in silenzio e perde i dati

**Dove.** `src/components/modals/QuickAddTask.jsx:118-149`.

Sono due difetti nella stessa funzione, e vanno corretti insieme perché sono i
due estremi dello stesso percorso: cosa succede prima di scrivere e cosa
succede se la scrittura fallisce.

#### (a) Il `return` muto — il nono form che il censimento di M-3 non ha contato

```js
const handleSubmit = async () => {
  if (!form.title.trim() || busy) return;   // ← QuickAddTask.jsx:119
```

M-3 dell'audit del 16 agosto ha convertito cinque form alla validazione inline,
descrivendo il difetto in termini che si applicano parola per parola a questa
riga: «si preme "Salva"/"Crea" e non succede niente. Nessun messaggio, nessun
focus, nessun indizio. Per chi usa uno screen reader nessuna delle due varianti
esiste affatto». Il perimetro dichiarato era «tre form su otto» → otto su otto.
I form però sono nove, e il nono è quello che si apre dal **FAB presente su
ogni vista** e dalla **scorciatoia `K`**: il percorso di creazione task più
usato dell'applicazione. L'etichetta dice `TITOLO *`, l'asterisco promette una
regola, e la regola non si manifesta in alcun modo.

#### (b) La modale si chiude sul fallimento e porta via quello che l'utente ha scritto

```js
const result = await onAdd({ id, ...form, … });

if (pendingFiles.length && !(result && result.error)) {   // ← result.error letto SOLO per gli allegati
  …
}
setBusy(false);
onClose();                                                 // ← chiude comunque
```

`onAdd` è `dispatch({ type: "ADD_TASK", … })`, cioè `useSyncedDispatch`, che
ritorna `Promise<{ error }>` e, in caso di fallimento, fa **rollback dello
stato ottimistico** e mostra `Salvataggio fallito: …`. L'esito combinato per
l'utente è: la modale si chiude, la task appare per un istante e sparisce, un
toast dice che non è andata — e titolo, descrizione, cliente, contatti, numero
di pratica e la lista degli allegati selezionati non esistono più. L'unica via
è riscrivere tutto da capo, senza nemmeno poter rileggere ciò che si era
scritto.

Che questo sia un difetto e non una scelta lo dice il progetto stesso: le
**quattro** tab del BulkTaskCreator fanno il contrario, con il commento che
spiega perché (`ManualTab.jsx:128`):

> Creazione fallita: niente upload (senza la riga task la RLS del bucket
> rifiuterebbe comunque) e soprattutto il modale RESTA APERTO con i dati.

Lo stesso vale per `ImportTab` («il modale resta aperto con file e mappatura
intatti, altrimenti l'operatore dovrebbe ricaricare il CSV e rimappare tutto»),
`TemplateTab`, `DuplicateTab` e `ProfileEditor`. Il percorso singolo — quello
che si usa cento volte al giorno — è l'unico rimasto fuori.

**Soluzione.** Entrambe le metà, con gli helper che il progetto già ha
(`validaCampi`/`primoCampoInvalido`/`FieldError`/`ariaCampo`, esattamente come
`AddMovBox` e `ClienteModal`):

```jsx
// in cima al file, fuori dal componente: le regole sono costanti
const REGOLE = { title: obbligatorio("Il titolo è obbligatorio.") };
const ORDINE = ["title"];
```

```jsx
const [errori, setErrori] = useState({});
const [saveError, setSaveError] = useState("");
const titleRef = useRef(null);
const rifCampo = { title: titleRef };

const handleSubmit = async () => {
  if (busy) return;
  const trovati = validaCampi(form, REGOLE);
  const primo = primoCampoInvalido(trovati, ORDINE);
  if (primo) {
    setErrori(trovati);
    rifCampo[primo]?.current?.focus();   // metà del rimedio è il focus
    return;
  }
  setErrori({});
  setSaveError("");
  setBusy(true);

  const id = crypto.randomUUID();
  const result = await onAdd({ id, ...form, … });

  // La modale RESTA APERTA con i dati: il registry ha già fatto rollback e
  // mostrato il toast, ma il toast sparisce e quello che l'utente ha scritto
  // non deve sparire con lui. Stesso contratto di ManualTab/ImportTab.
  if (result && result.error) {
    setSaveError("Creazione non riuscita. I dati sono ancora qui, riprova.");
    setBusy(false);
    return;
  }

  for (const f of pendingFiles) {
    const { error: e } = await TaskFiles.upload(f, id, { uploadedBy: currentUserId });
    if (e) {
      setFileError(`Task creata, ma l'upload di "${f.name}" è fallito. Riprova dal dettaglio della task.`);
      setBusy(false);
      return;
    }
  }
  setBusy(false);
  onClose();
};
```

```diff
 <label className="vd-field-label-lg">TITOLO *</label>
-<input {...inp("title")} placeholder="Descrivi brevemente il task..." />
+<input
+  {...inp("title")}
+  ref={titleRef}
+  placeholder="Descrivi brevemente il task..."
+  {...ariaCampo("qa-title-err", errori.title)}
+/>
+<FieldError id="qa-title-err">{errori.title}</FieldError>
```

L'errore va spento appena si scrive nel campo, come negli altri form: dentro
`inp()`, `setErrori(prec => (prec[field] ? { ...prec, [field]: undefined } : prec))`.

---

### 🟠 A-3 · L'idratazione scarica lo storico completo dei task

**Dove.** `hooks/useAppHydration.js:144` → `lib/api.js:319`.

```js
const { data, error } = await TasksAPI.list({ withComments: true, includeDeleted: true });
```

**Perché è un difetto.** Non di correttezza — `fetchAllRows` è la risposta
giusta al cap `db-max-rows` e non tronca in silenzio (C-1, chiuso). Il punto è
un altro: **essere corretti in questo modo significa scaricare tutto, per
sempre**, e la quota di «tutto» che serve alle viste d'ingresso cala di giorno
in giorno. Misurato oggi in produzione:

| | oggi | fra 12 mesi (al ritmo attuale) |
|---|---|---|
| `tasks` | 291 righe (190 kB JSON) | ~2.300 righe (~1,5 MB) |
| di cui completate o cestinate | **242 — 82,5% del payload (158 kB)** | ~2.000 |
| `task_history` | 657 righe | **~5.500 righe** |
| Round-trip seriali per la sola cronologia | 1 | **6** |

L'ultima riga è la parte che non si vede leggendo il codice: `fetchAllRows`
pagina con un `await` dentro un `for`, quindi le pagine sono **sequenziali**.
Oggi una pagina basta; a 5.500 righe di cronologia sono sei richieste in fila
sul percorso `soloThread`, che scatta a **ogni commento scritto da chiunque**.
E il costo si paga tre volte: a ogni avvio a freddo, a ogni ripresa dopo un
buco di connessione, e in memoria per tutta la sessione (le task cestinate
restano nello stato di proposito, per non svuotare il Cestino — scelta corretta
oggi, che però ancora la crescita al reducer).

Il paradosso da cui partire per la correzione: le viste che questo payload
alimenta guardano **le task attive**. La Dashboard filtra con `getActiveTasks`,
il Calendario pure. Le due viste che vogliono il resto — Archivio e Cestino —
sono già `lazy()`, aperte da una minoranza di sessioni, e potrebbero chiedersi
i propri dati da sole.

**Soluzione (in tre passi, nell'ordine).**

**1. Una finestra sull'idratazione.** `Tasks.list` guadagna un parametro
esplicito, e l'idratazione smette di chiedere il cestino:

```js
// lib/api.js
// `completeDal`: la finestra oltre la quale una task completata non serve più
// alle viste d'ingresso. Non è un limite di righe (che tronca in silenzio, è
// il difetto di B-2) ma un PREDICATO: ciò che resta fuori è definito, non è
// "quello che è avanzato dopo le prime mille".
list: ({ includeDeleted = false, withComments = false, completeDal = null } = {}) =>
  fetchAllRows(() => {
    let q = supabase.from('tasks').select(withComments ? TASK_SELECT_WITH_COMMENTS : '*', WITH_COUNT)
      .order('due_date', { ascending: true }).order('id');
    if (!includeDeleted) q = q.is('deleted_at', null);
    if (completeDal) q = q.or(`status.neq.done,completed_at.gte.${completeDal}`);
    return q;
  }),
```

```js
// hooks/useAppHydration.js
const FINESTRA_COMPLETATE_GG = 60;
const dal = new Date(Date.now() - FINESTRA_COMPLETATE_GG * 864e5).toISOString();
const { data, error } = await TasksAPI.list({ withComments: true, completeDal: dal });
```

**2. Archivio e Cestino si idratano da sé.** Sono già lazy e già `memo`;
diventano le uniche due viste che chiedono `{ includeDeleted: true }` e la
finestra completa, al mount, con il proprio flag di caricamento (lo scheletro
c'è già). È il passo che rende il punto 1 non una perdita di funzionalità ma
uno spostamento del costo su chi lo usa.

**3. Solo dopo, la potatura di `task_history`.** Con i primi due passi il
percorso `soloThread` legge una cronologia che nessuno guarda per intero: il
candidato naturale è leggerla **per task aperto** (come fa già `lista_history`
con `limit 50`, rilievo ritirato in stesura il 16 agosto proprio per questo)
invece che per corpus.

**Attenzione, e va detto prima di iniziare:** questo cambio tocca i conteggi.
`Archive` mostra «209 task completate» leggendo lo stato globale; con la
finestra quel numero diventa «le completate degli ultimi 60 giorni» finché la
vista non ha caricato le proprie. Il passo 2 non è opzionale né rinviabile — è
la metà che rende onesto il passo 1.

---

### 🟡 M-1 · `ClientiView.handleSave` chiude la modale senza attendere la scrittura

**Dove.** `clients/ClientiView.jsx:160-176`, con `clients/ClienteModal.jsx:44,81,184`.

```js
const handleSave = async (form, { renameTasks = [] } = {}) => {
  if (modal?.mode === "edit" && modal.cliente) {
    dispatch({ type: "UPDATE_CLIENT", … });      // ← non awaited
    …
  } else {
    dispatch({ type: "ADD_CLIENT", … });         // ← non awaited
  }
  setModal(null);                                 // ← smonta la modale, subito
};
```

**Perché è un difetto.** `ClienteModal` fa le cose per bene — validazione
inline, `useIsMounted`, `setSaving(true)`, `await onSave(...)` — ma `onSave` è
questa funzione, che non attende i dispatch e smonta il chiamante nello stesso
turno. Tre conseguenze:

1. **`saving` non si vede mai.** Il bottone dichiara `{saving ? "Salvataggio..." : "Salva"}`
   ma il componente è smontato prima che quel ramo possa essere dipinto: è codice
   che non può eseguire, e chi legge il file crede che il feedback ci sia.
2. **La protezione dal doppio invio è nominale**, per la stessa ragione.
3. **Sul fallimento i dati sono persi**, con la stessa dinamica di A-2 — con
   l'aggravante che qui si tratta di anagrafica, l'unica entità con dati
   personali di persone esterne al team, e che il modulo Liste crea clienti per
   conto proprio: il doppione in anagrafica è già un problema noto.

**Soluzione.** `handleSave` attende e riporta l'esito; la modale decide se
chiudersi. Il contratto diventa quello che `ClienteModal` già si aspetta:

```js
const handleSave = async (form, { renameTasks = [] } = {}) => {
  const res = modal?.mode === "edit" && modal.cliente
    ? await dispatch({ type: "UPDATE_CLIENT", payload: { ...modal.cliente, ...form } })
    : await dispatch({ type: "ADD_CLIENT", payload: { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() } });

  // Il rename dei task segue solo se il cliente è stato scritto davvero:
  // rinominarli dopo una scrittura fallita li disallineerebbe dall'anagrafica.
  if (!res?.error && renameTasks.length) {
    await dispatch({ type: "RENAME_CLIENT_IN_TASKS", payload: { from: modal.cliente.name, to: form.name } });
  }
  if (res?.error) return res;    // la modale resta aperta con i dati
  setModal(null);
  return { error: null };
};
```

```diff
 // ClienteModal.jsx
-await onSave({ ...form, name: form.name.trim() }, { renameTasks: … });
-if (!montato()) return;
-setSaving(false);
+const res = await onSave({ ...form, name: form.name.trim() }, { renameTasks: … });
+if (!montato()) return;              // salvataggio riuscito: il padre ci ha smontati
+setSaving(false);
+if (res?.error) setSaveError("Salvataggio non riuscito. I dati sono ancora qui, riprova.");
```

`useIsMounted` resta e resta necessario: sul percorso riuscito lo smontaggio
avviene ancora, ed è l'esito normale.

---

### 🟡 M-2 · La finestra sugli elenchi è applicata a 2 viste su 7

**Dove.** `views/Archive.jsx:188,247`, `views/Trash.jsx:187`, e le cinque code
in `dashboard/queues/` (es. `PersonalQueue.jsx:145`, `OverdueQueue.jsx:109`,
`UnassignedQueue.jsx:134`).

**Perché è un difetto.** La convenzione è scritta in `docs/CLAUDE.md`:

> **Elenchi lunghi: una finestra, non tutte le righe**: `ClientiView` disegna
> 24 card alla volta (`PAGINA`) come `ListeViaggio` ne disegna 10
> (`HOME_PAGE_SIZE`), e ogni restringimento — ricerca, filtro, ordinamento —
> RIAZZERA la finestra.

Le due viste citate sono le due che ce l'hanno. L'Archivio ne monta **209**
oggi (ogni card con il proprio `SwipeActions`, gli avatar degli assegnatari e
il chip di categoria) e cresce di ~4 al giorno senza potatura: è la vista che
diverge per prima. Le code hanno un tetto naturale — le task aperte non si
accumulano — ma `Scadute` e `Coda globale` non ce l'hanno affatto: sono
esattamente le due che si allungano quando l'agenzia va in affanno, cioè il
momento in cui la dashboard deve essere più reattiva, non meno.

**Soluzione.** Lo stesso pattern, non una libreria: è la risposta giusta a
10.000 righe, non a 209, e il progetto ha una sola dipendenza runtime per
scelta. Estratto in un hook così che la terza vista non lo riscriva:

```js
// src/hooks/useFinestra.js
// La finestra dell'elenco + il riazzeramento a ogni restringimento. Erano due
// copie identiche in ClientiView e ListeViaggio; la terza sarebbe stata quella
// in cui una delle tre si dimentica il riazzeramento e mostra i primi 24 di
// una ricerca precedente.
export function useFinestra(elementi, passo, deps) {
  const [limite, setLimite] = useState(passo);
  useEffect(() => { setLimite(passo); }, deps);   // ricerca/filtro/ordinamento
  const visibili = useMemo(() => elementi.slice(0, limite), [elementi, limite]);
  return { visibili, restanti: elementi.length - visibili.length, ancora: () => setLimite(n => n + passo) };
}
```

```diff
 // views/Archive.jsx
-{visible.map(task => ( … ))}
+{finestra.visibili.map(task => ( … ))}
+{finestra.restanti > 0 && (
+  <button onClick={finestra.ancora}>Mostra altre {Math.min(finestra.restanti, PAGINA)} di {finestra.restanti}</button>
+)}
```

Il totale resta visibile e vero — «24 di 209» e «24» sono due affermazioni
diverse, ed è la ragione per cui la convenzione lo richiede.

---

### 🟡 M-3 · Ricerca a testo libero senza debounce né indice

**Dove.** `clients/ClientiView.jsx:124-141` (e `views/Archive.jsx:63-71`,
`liste/ListeViaggio.jsx`), su `lib/searchUtils.js:50`.

**Perché è un difetto.** `matchTermini` normalizza i campi **a ogni confronto**:
per ogni riga, per ogni campo, `normalize('NFD')` + due `replace` con regex
Unicode, più una seconda stringa senza spazi. Il filtro gira dentro un `useMemo`
che dipende da `search`, quindi si ricalcola per intero **a ogni battuta**, su
tutte le righe. Misurato con la funzione vera su un'anagrafica delle dimensioni
di quella di produzione (835 righe, 5 campi, note incluse):

| | per battuta |
|---|---|
| Filtro attuale | **6,32 ms** |
| Con indice precalcolato | **0,19 ms** (−97%) |
| Costruzione dell'indice (una volta per cambio anagrafica) | 4,74 ms |

Su desktop 6 ms non si vedono. Su un telefono di fascia media (3-5×) sono
20-30 ms per battuta, **prima** del render React delle card — e la scala è
lineare: a 5.000 clienti diventano ~38 ms su desktop e oltre 150 ms su mobile,
cioè digitazione visibilmente in ritardo. La normalizzazione dipende dalla
riga, non dalla query: ricalcolarla a ogni battuta è lavoro ripetuto per
costruzione.

**Soluzione.** Indicizzare una volta per anagrafica, non una volta per battuta.
`searchUtils.js` espone già i pezzi:

```js
// lib/searchUtils.js
// L'indice di ricerca di una riga: il testo normalizzato dei suoi campi, più
// la variante senza spazi per i cognomi elisi. Dipende dalla RIGA, non dalla
// query — quindi si calcola quando cambiano i dati, non quando si digita.
export const indicizza = (...campi) => {
  const testo = campi.flat().map(normalizzaTesto).filter(Boolean).join(' ');
  return { testo, attaccato: testo.replace(/ /g, '') };
};

export const matchIndice = (termini, idx) =>
  !termini.length || (!!idx.testo && termini.every(t => idx.testo.includes(t) || idx.attaccato.includes(t)));
```

```js
// clients/ClientiView.jsx
// L'indice si ricostruisce solo quando cambia l'anagrafica (import, realtime,
// creazione), non a ogni battuta.
const indice = useMemo(
  () => clients.map(c => ({ c, idx: indicizza(c.name, c.email, c.city, c.phone, c.notes) })),
  [clients]);

const filtered = useMemo(() => {
  const termini = terminiRicerca(search);
  let base = indice.filter(r => matchIndice(termini, r.idx)).map(r => r.c);
  …
}, [indice, search, sortBy, linkFilter, listeByClient]);
```

`matchTermini` resta per i call site che confrontano una riga sola (non tutti
hanno un elenco da indicizzare) e va implementata sopra le due nuove funzioni,
così la semantica resta definita in un punto solo — i test esistenti su
apostrofi, ordine delle parole e cognomi elisi devono continuare a passare
invariati, ed è il modo di verificare che l'indice non abbia cambiato le regole.

Il debounce **non** serve una volta tolto il lavoro ripetuto, e sarebbe la
correzione peggiore delle due: introduce un ritardo percepito per nascondere un
costo invece di toglierlo.

---

### 🟡 M-4 · Il commento digitato si perde se la scrittura fallisce

**Dove.** `tasks/TaskSlideOver.jsx:128-138`.

```js
const handleComment = () => {
  if (!newComment.trim()) return;
  dispatch({ type: "ADD_COMMENT", payload: { … } });
  setNewComment("");           // ← svuotato prima di sapere com'è andata
};
```

**Perché è un difetto.** `dispatch` ritorna una promise che qui non si attende.
Se la scrittura fallisce, il registry fa rollback (il commento sparisce dal
thread) e mostra il toast — ma il testo nella casella è già stato cancellato:
non c'è modo di recuperarlo se non riscriverlo, e i commenti di un gestionale
non sono monosillabi. È lo stesso difetto di A-2 in miniatura, e sulla stessa
pagina in cui il resto è fatto bene (i campi testo persistono al blur con
un solo `UPDATE_TASK`, non uno per carattere).

**Soluzione.** Svuotare **dopo** la conferma, e tenere lo stato in volo:

```js
const [inviando, setInviando] = useState(false);

const handleComment = async () => {
  const testo = newComment.trim();
  if (!testo || inviando) return;
  setInviando(true);
  const res = await dispatch({ type: "ADD_COMMENT", payload: { taskId: task.id, comment: { user: authorName, text: testo, time: new Date().toISOString() } } });
  setInviando(false);
  if (!res?.error) setNewComment("");   // il toast d'errore lo mostra già il registry
};
```

---

### 🟢 B-1 · L'app intera è nel chunk d'ingresso anche alla schermata di login

**Dove.** `auth/AuthGate.jsx:3` — `import VoyageDesk from '../VoyageDesk.jsx';`

L'import statico porta nel chunk d'ingresso (71,21 kB gzip) il reducer, il
registry di persistenza, il data layer, il guscio, la Dashboard e la
ClientiView: chi è fermo alla schermata di login scarica e **parsa** tutto
prima di poter digitare la password.

La correzione ovvia — `lazy(() => import('../VoyageDesk.jsx'))` — sarebbe però
un peggioramento per il caso più frequente: in un gestionale la sessione
persiste, quindi l'utente tipico è **già autenticato** e si ritroverebbe una
cascata seriale (entry → init auth → chunk app). La forma corretta è lazy **con
prefetch avviato subito**, in parallelo all'init di auth:

```js
// auth/AuthGate.jsx
// Il download parte SUBITO, in parallelo a getSession(): chi ha una sessione
// valida non paga alcuna cascata (il chunk è già in volo mentre auth risolve),
// e chi arriva alla schermata di login non paga il parse dell'app che non ha
// ancora aperto. `lazy()` da solo darebbe il secondo beneficio al prezzo del
// primo.
const caricaApp = () => import('../VoyageDesk.jsx');
const VoyageDesk = lazy(caricaApp);
caricaApp();   // prefetch, non atteso
```

Da misurare con `verifica:bundle` prima e dopo: il beneficio è reale solo se
l'entry scende in modo visibile, e va confrontato con l'aggiunta di un
`Suspense` sul percorso d'ingresso.

---

### 🟢 B-2 · Il toast di successo precede la conferma del server

**Dove.** `state/reducer.js:307-309`.

`UPDATE_TASK` accoda «Task aggiornato!» nel reducer, cioè **prima** che la
scrittura parta. Se fallisce, l'utente vede in colonna «Task aggiornato!» e
«Salvataggio fallito: …» — due affermazioni contraddittorie, con quella falsa
in cima. `errorReporting.js` definisce questa classe di difetto meglio di
quanto si possa riassumere: «in un gestionale dove si registrano movimenti di
denaro, "credo di aver salvato" è il difetto più costoso possibile».

Non va tolta l'UI ottimistica, che è una scelta giusta e costosa da smontare.
La correzione proporzionata è che il percorso d'errore **ritiri** il toast che
sta smentendo, invece di affiancarlo: `fail()` in `useSyncedDispatch` già
dispatcha la compensazione con `meta.compensazione`, quindi ha il punto giusto
per farlo — basta che `pushToast` sappia rimuovere per messaggio, cosa che già
fa per il dedup.

---

### 🟢 B-3 · Quattro call site ancora fuori dalla regola di M-3

`views/Trash.jsx:392` (`disabled={!restoring.title?.trim()}`),
`chat/NewConversationView.jsx:149` (`disabled={!groupName.trim() || selected.length < 2}`),
`modals/bulk/TemplateTab.jsx:198` (`disabled={!tpl || !eventDate || busy}`),
`liste/modals/EditListaModal.jsx:51` (`disabled={!rinomina}`).

Tutti e quattro nella variante «bottone spento» che M-3 ha respinto, e i due
centrali con **più condizioni**: il comando è disabilitato e non dice quale
delle due o tre manchi — che è testualmente la motivazione con cui è stato
corretto `MessageTemplatesSection`. Trattamento identico a quello già
applicato: regole pure, messaggio sotto il campo, focus sul primo campo
sbagliato in ordine visivo, niente `disabled`.

Fuori dal rilievo, di proposito: `ConversationView.jsx:174`
(`if (!input.trim()) return;`) e `TaskSlideOver.jsx:129`. Premere invio su una
casella di chat vuota è un no-op atteso dalla convenzione di ogni client di
messaggistica, non un form da validare.

---

### 🟢 B-4 · `Archive` ricalcola filtro, permessi e ordinamento a ogni render

**Dove.** `views/Archive.jsx:60-71` e `:100`.

```js
const archived = getVisibleTasks(getArchivedTasks(tasks), me).sort(…);   // nessun useMemo
const visible  = filterByPeriod(archived, period, "completedAt").filter(…);
const presentCats = Array.from(new Set(archived.map(t => t.category)));
```

Tre passate su tutte le task (filtro archiviate, controllo permessi per riga,
ordinamento) più il filtro e il `Set` delle categorie, a ogni render — cioè a
ogni battuta nel campo di ricerca e a ogni cambio di chip. È lo stesso rilievo
che P2-4 ha corretto sulla Dashboard, sulla vista che non era in quel
perimetro. Correzione meccanica: `useMemo` su `archived` (deps `[tasks, me]`),
su `visible` (deps `[archived, period, category, query]`) e su `presentCats`
(deps `[archived]`). Da fare **insieme a M-3**, altrimenti l'indice di ricerca
viene ricostruito da un `archived` con identità nuova a ogni render e il
guadagno si annulla.

---

## Due affermazioni di `docs/CLAUDE.md` da correggere

`INDEX.md` fissa la regola: «se `CLAUDE.md` è in disaccordo col codice, il
codice è la fonte di verità e `CLAUDE.md` va corretto nello stesso commit che
scopre la discrepanza». Questo audit ne scopre due, entrambe scritte in buona
fede al momento in cui erano vere per il perimetro allora considerato:

1. **Validazione dei form** — «✅ Dal 16 agosto (M-3) non resta un solo call
   site fuori». Ne restano cinque: `QuickAddTask` (A-2) e i quattro di B-3. La
   frase va sostituita con il conteggio reale nello stesso commit che chiude
   A-2.
2. **Elenchi lunghi** — la regola descrive `ClientiView` e `ListeViaggio` come
   se fossero l'insieme degli elenchi lunghi dell'app. Non lo sono: Archivio,
   Cestino e le cinque code non hanno finestra (M-2). Va detto quali viste la
   applicano e quali no, finché non la applicano tutte.

Nessuna delle due è un difetto di codice — sono il motivo per cui i due difetti
di codice sono sopravvissuti a un audit: chi legge `CLAUDE.md` prima di
scrivere conclude, correttamente rispetto al testo, che la regola è già
applicata ovunque.

---

## Controlli verificati a posto

Elencati perché l'assenza di rilievo sia una constatazione e non una svista.

- **Bundle e code splitting**: entry 71,21 kB gzip su soglia 84, first load
  171,15 su 184, verificati in CI. Nove viste/pannelli dietro `lazy()`, `xlsx`
  (143 kB gzip) in chunk async, vendor separati per la cache fra deploy.
- **Memoizzazione del guscio**: `memo` su Topbar/Sidebar/BottomNav e sulle sei
  viste, con le callback stabilizzate ai call site — cioè la metà senza cui il
  `memo` non salta un render. Verificato da `memoViste.test.jsx` e
  `chatMemo.test.jsx`.
- **Provider di dominio separati** (Tasks/Clients/AppData): l'arrivo di un
  cliente non sveglia le viste che guardano i task.
- **Boundary di render**: tre livelli (root, vista, overlay) con riarmo su
  `viewKey`/`resetKey`, codice di segnalazione al posto dello stack a schermo,
  dettaglio completo in console. Il rilievo A-1 riguarda **dove** sono
  applicati, non come sono fatti.
- **Handler globali**: `unhandledrejection` + `error` in capture, con
  riconoscimento di errori di risorsa, `AbortError`, rumore di ResizeObserver e
  chunk mancante (messaggio dedicato), più anti-raffica a 5 s con potatura.
- **Stati di caricamento onesti**: un flag per entità, scheletri al posto dei
  vuoti, «…» al posto di «0» nei conteggi, chiusura del flag anche
  sull'errore. È la classe di difetto UX più comune nei gestionali, ed è chiusa.
- **Banner offline** persistente e non chiudibile, con il limite di
  `navigator.onLine` dichiarato nel codice.
- **Coda dei toast**: dedup per messaggio, cap a 3, live region sempre montata.
- **Conferme distruttive** via `useConfirm()` invece di `window.confirm`.
- **Import/export e bulk**: creazione multi-riga atomica, `scritti` per sapere
  quanti blocchi sono passati, modale che resta aperta con i dati sull'errore.

---

## Top 3 suggerimenti strategici

### 1. Rendere impossibile montare un `lazy()` senza rete di sicurezza ✔ FATTO

La primitiva `LazyPanel` di A-1 più il controllo in `verifica:convenzioni`
chiudono sette difetti oggi e il decimo call site fra sei mesi. È l'intervento
con il rapporto costo/beneficio più alto dell'intero audit: **~40 righe di
primitiva** (più guardie e test), e toglie di mezzo lo scenario in cui l'evento
più frequente in produzione — un deploy con le schede aperte — trasforma «un
pannello non si apre» in «l'app è sparita».

**Applicato il 16 agosto**: 9 punti di montaggio su 9 passano da `LazyPanel`,
+10 casi di test (1.368 → **1.378** verdi), controllo `lazy() senza boundary`
attivo in CI (atteso 0), entry chunk da 71,21 a **71,34 kB** gzip su una soglia
di 84. Vale la pena notare *perché* il difetto è sopravvissuto a sette
audit: il boundary esiste, il commento che lo motiva è ottimo, e leggendo
`OverlayErrorBoundary.jsx` si conclude che il problema è risolto. Era vero per
i due call site che quel commento nomina.

### 2. Un contratto unico «salva e chiudi», invece di dieci call site che se lo ricordano

A-2, M-1 e M-4 sono lo stesso difetto in tre punti: **chiudere o svuotare prima
di sapere com'è andata**. Le quattro tab del BulkTaskCreator e `ProfileEditor`
lo fanno bene; `QuickAddTask`, `ClientiView` e il box commenti no. La
differenza non è una decisione, è l'ordine in cui sono stati scritti — e
finché la regola vive nei commenti di chi l'ha applicata, il prossimo form la
riprodurrà o no a seconda di quale file si è aperto per copiarne la forma.

Un hook condiviso la rende la strada di minor resistenza:

```js
// src/hooks/useSalvataggio.js
// Le tre cose che ogni salvataggio di questa app deve fare, in un posto solo:
// stato in volo (niente doppio invio), la modale RESTA APERTA sull'errore, e
// l'input si svuota solo dopo la conferma. Il toast lo mostra già il registry:
// qui non se ne aggiunge un secondo.
export function useSalvataggio(esegui, { alSuccesso } = {}) {
  const [inVolo, setInVolo] = useState(false);
  const [errore, setErrore] = useState("");
  const montato = useIsMounted();

  const salva = useCallback(async (...args) => {
    if (inVolo) return { error: new Error("in volo") };
    setInVolo(true); setErrore("");
    const res = await esegui(...args);
    if (!montato()) return res;
    setInVolo(false);
    if (res?.error) { setErrore("Salvataggio non riuscito. I dati sono ancora qui, riprova."); return res; }
    alSuccesso?.();
    return res;
  }, [esegui, inVolo, montato, alSuccesso]);

  return { salva, inVolo, errore };
}
```

Con questo, `QuickAddTask`, `ClienteModal`, il box commenti e i prossimi form
condividono lo stesso comportamento perché usano la stessa funzione, non perché
qualcuno si è ricordato la regola.

### 3. Decidere adesso la finestra di idratazione, mentre è una scelta

A-3 è l'unico rilievo di questo audit che **peggiora da solo**. Oggi il costo è
invisibile: 190 kB di JSON, una pagina sola, nessuno se ne accorge. Fra dodici
mesi sono ~1,5 MB e sei round-trip seriali su un percorso che scatta a ogni
commento — e a quel punto la correzione non sarà più «aggiungere un predicato
alla query», perché nel frattempo altre viste avranno dato per scontato che lo
stato contenga *tutte* le task (l'Archivio già lo fa per i conteggi).

Il valore strategico non è il risparmio di banda, è **spezzare il legame fra
l'anzianità dell'installazione e il tempo di avvio**. Un gestionale che
rallenta man mano che l'agenzia lo usa è un gestionale che punisce i clienti
migliori, e la correzione costa poco solo finché la finestra è ancora
un'aggiunta invece che una rimozione. I passi 1 e 2 di A-3 sono un intervento
di mezza giornata oggi; il passo 3 può aspettare, gli altri due no.

---

*Misure di produzione rilevate in sola lettura il 16 agosto 2026. Il benchmark
del filtro di ricerca è stato eseguito sulla funzione reale di
`lib/searchUtils.js` con un'anagrafica sintetica di 835 righe che riproduce le
forme descritte in quel file (apostrofi, abbreviazioni, ordine cognome/nome non
uniforme).*
