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

> **Stato: 11 rilievi su 11 chiusi.** A-1, poi A-2, M-1 e M-4 insieme, lo
> stesso 16 agosto (erano i suggerimenti strategici n.1 e n.2); A-3 con i suoi
> tre passi il 17; **M-2, M-3, B-1, B-2, B-3 e B-4 il 18 agosto**, i sei che
> restavano.
>
> Ogni rilievo chiuso porta la propria sezione «Correzione (applicata)» con
> ciò che **è emerso implementando** e che il rilievo non poteva vedere. Vale
> la pena leggerle: in quattro casi su sei il rilievo era più stretto della
> realtà (B-4 valeva anche per Cestino e code, M-3 anche per l'Archivio, che
> non usava affatto `searchUtils`) o indicava una strada che non ha retto alla
> prova (il ritiro del toast «per messaggio» di B-2, il riazzeramento con
> `useEffect` di M-2). Una sola voce è stata **respinta**: `EditListaModal:51`
> non era un «bottone spento» ma una sola-lettura voluta — il difetto lì era
> il messaggio in un toast, ed è quello che è stato corretto.
>
> **Misure dopo la chiusura** (18 agosto): chunk d'ingresso **14,47 kB gzip**
> (era 72,46 — B-1), first load **114,41 kB** (era 172,40), soglie di
> `verifica:bundle` riportate sulla misura nuova (21 / 121). Lint 0,
> **1463 test verdi**, `verifica:convenzioni` 25 controlli senza divergenze.
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
  spiega perché. ✔ **Chiuso lo stesso 16 agosto** insieme a M-1 e M-4, che
  sono lo stesso difetto altrove: `hooks/useSalvataggio.js` rende «salva e
  chiudi» un contratto solo invece di una cosa che ogni call site si ricorda.
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
| A-2 ✔ | 🟠 **Alta** | UX / errori | `QuickAddTask` — il form più usato dell'app — esce in silenzio a titolo vuoto E perde i dati se la scrittura fallisce — **chiuso lo stesso 16 agosto** | `modals/QuickAddTask.jsx:118-149` |
| A-3 ✔ | 🟠 **Alta** | Scalabilità | L'idratazione scarica lo storico completo dei task: 82,5% del payload è non operativo, cresce ~13 righe/giorno senza tetto — **chiuso il 17 agosto** (§A-3) | `hooks/useAppHydration.js:144`, `lib/api.js:319` |
| M-1 ✔ | 🟡 Media | UX / errori | `ClientiView.handleSave` chiude la modale senza attendere la scrittura: `saving` non si vede mai, doppio invio possibile, dati persi in caso d'errore — **chiuso lo stesso 16 agosto** | `clients/ClientiView.jsx:160-176`, `clients/ClienteModal.jsx:44,81,184` |
| M-2 ✔ | 🟡 Media | Performance | La finestra sugli elenchi lunghi è applicata a 2 viste su 7: Archivio, Cestino e le cinque code disegnano l'array intero — **chiuso il 18 agosto** | `hooks/useFinestra.js`, `ui/MostraAltri.jsx`, `views/Archive.jsx`, `views/Trash.jsx`, `dashboard/queues/*` |
| M-3 ✔ | 🟡 Media | Performance | Ricerca a testo libero senza debounce né indice: **6,32 ms per battuta** su 835 clienti, contro 0,19 ms con indice precalcolato — **chiuso il 18 agosto** | `lib/searchUtils.js`, `clients/ClientiView.jsx`, `views/Archive.jsx`, `liste/listeOrdinamento.js` |
| M-4 ✔ | 🟡 Media | UX / errori | Il commento digitato viene cancellato prima che la scrittura sia confermata — **chiuso lo stesso 16 agosto** | `tasks/TaskSlideOver.jsx:128-138` |
| B-1 ✔ | 🟢 Bassa | Performance | L'intera app è nel chunk d'ingresso anche per chi è fermo alla schermata di login — **chiuso il 18 agosto**: entry 72,46 → **14,47 kB gzip** | `auth/AuthGate.jsx` |
| B-2 ✔ | 🟢 Bassa | UX / errori | Il toast «Task aggiornato!» precede la conferma del server e può essere smentito dal toast successivo — **chiuso il 18 agosto** | `state/toastQueue.js`, `state/reducer.js`, `hooks/useSyncedDispatch.js` |
| B-3 ✔ | 🟢 Bassa | UX / errori | Quattro call site ancora fuori dalla regola di M-3, tutti nella variante «bottone spento» — **chiuso il 18 agosto** | `views/Trash.jsx`, `chat/NewConversationView.jsx`, `modals/bulk/TemplateTab.jsx`, `liste/modals/EditListaModal.jsx` |
| B-4 ✔ | 🟢 Bassa | Performance | `Archive` ricalcola filtro, permessi e ordinamento a ogni render senza `useMemo` — **chiuso il 18 agosto**, insieme a M-3 | `views/Archive.jsx`, `views/Trash.jsx`, `dashboard/queues/*` |

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

### 🟠 A-2 · `QuickAddTask`: il form più usato esce in silenzio e perde i dati ✔

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

**Correzione (applicata).** La metà (a) con gli helper che il progetto già ha
(`validaCampi`/`primoCampoInvalido`/`FieldError`/`ariaCampo`, esattamente come
`AddMovBox` e `ClienteModal`); la metà (b) **non** riscrivendo a mano il
`setBusy`/`await`/`if (error)` — che è il gesto che tre call site su dieci
sbagliano — ma dietro il contratto condiviso descritto nel suggerimento
strategico n.2, `src/hooks/useSalvataggio.js`:

```jsx
// fuori dal componente: le regole sono costanti
const REGOLE = { title: obbligatorio("Il titolo è obbligatorio: è con questo che il task compare in elenco, nelle code e nelle notifiche.") };
const ORDINE = ["title"];
```

```jsx
const { salva, inVolo: busy, errore: erroreSalvataggio, avviso, bloccato } = useSalvataggio(
  async () => {
    const id = crypto.randomUUID();
    const res = await onAdd({ id, ...form, … });
    if (res?.error) return res;                 // niente upload: senza la riga
                                                // task la RLS del bucket rifiuta
    for (const f of pendingFiles) {
      const { error } = await TaskFiles.upload(f, id, { uploadedBy: currentUserId });
      // `avviso` e non `error`: la task ESISTE già.
      if (error) return { avviso: `Task creata, ma l'allegato "${f.name}" non è stato caricato. Riprova dal dettaglio della task: la task è salva.` };
    }
    return { error: null };
  },
  { alSuccesso: onClose },
);

const handleSubmit = async () => {
  const trovati = validaCampi(form, REGOLE);
  const primo = primoCampoInvalido(trovati, ORDINE);
  if (primo) {
    setErrori(trovati);
    rifCampo[primo]?.current?.focus();   // metà del rimedio è il focus
    return;
  }
  setErrori({});
  await salva();
};
```

```diff
-<label className="vd-field-label-lg">TITOLO *</label>
-<input {...inp("title")} placeholder="Descrivi brevemente il task..." />
+<label className="vd-field-label-lg" htmlFor="qat-title">TITOLO *</label>
+<input
+  id="qat-title" ref={titleRef} {...inp("title")}
+  placeholder="Descrivi brevemente il task..."
+  {...ariaCampo("qat-title-err", errori.title)}
+/>
+<FieldError id="qat-title-err">{errori.title}</FieldError>
```

L'errore si spegne appena si scrive nel campo, come negli altri form: dentro
`inp()`, `setErrori(prec => (prec[field] ? { ...prec, [field]: undefined } : prec))`.

**Un terzo esito che la prima stesura non aveva previsto.** Questa scheda
diceva «la modale resta aperta con i dati» come se i casi fossero due,
riuscito e fallito. Scrivendo il codice se ne è visto un terzo, ed è quello
che rende il rilievo più che cosmetico: **la task creata con un allegato non
caricato**. Lì la modale deve restare aperta *ma riprovare è la cosa
sbagliata* — la task esiste, un secondo «Crea Task» ne farebbe una seconda. Il
codice originale aveva già questo buco (`setFileError(...); setBusy(false);
return;` lascia il bottone premibile), e riprodurlo dietro l'hook sarebbe
stato un refactoring che conserva il difetto. Da qui il ritorno `{ avviso }`:
il pannello resta aperto, dice dove recuperare l'allegato, e il bottone di
conferma sparisce lasciando solo «Chiudi». Lo stesso buco è ancora aperto in
`ManualTab` e `ImportTab`, che non sono stati toccati da questo passo — sono
corretti sull'asse del rilievo e sbagliati su questo, ed è materiale per un
rilievo a sé, non per una modifica non richiesta a un file che funziona.

---

### 🟠 A-3 · L'idratazione scarica lo storico completo dei task ✔

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

#### ✔ Chiuso il 17 agosto 2026 — tutti e tre i passi

**Cosa è stato fatto.** `Tasks.list` guadagna `completeDal`, l'idratazione
chiede la finestra e non chiede più il cestino, e cinque viste chiedono il
corpus intero al mount via `state/StoricoTaskContext.jsx`.

**Prima correzione al rilievo, emersa misurando.** La tabella qui sopra dice
«82,5% del payload non operativo», ed è vero — ma quel numero descrive ciò che
è *eleggibile* a uscire dal payload, non ciò che esce oggi. Rimisurato in
produzione il 17 agosto, con la finestra effettivamente implementata a 60
giorni:

| | righe |
|---|---|
| `tasks` totali | 292 |
| completate (non cestinate) | 209 |
| cestinate | 33 |
| **fuori dalla finestra di 60 giorni** | **33 — le sole cestinate** |
| fuori da una finestra di 30 giorni (non adottata) | 109 |

La prima task del database è dell'11 giugno: **nessuna task completata ha
ancora sessanta giorni**, quindi oggi la finestra toglie dall'avvio soltanto il
cestino — l'11% delle righe, non l'82,5%. Questo non indebolisce il rilievo, lo
precisa: A-3 non era un risparmio da incassare, era il momento in cui la
correzione costa zero. Fra dodici mesi lo stesso predicato lascia fuori la
maggioranza del payload, e a quel punto introdurlo significherebbe togliere
dati a viste che nel frattempo hanno dato per scontato di averli.

**Seconda correzione, sull'ampiezza del passo 2.** Il rilievo nominava due
viste — Archivio e Cestino. Sono cinque: il censimento dei consumatori di
`useTasks()` ha trovato anche `AdminStatsTab` (il tasso di completamento è un
rapporto fra due conteggi di cui la finestra pota UNO SOLO: senza il corpus
intero non mostrerebbe un numero incompleto ma un numero **sbagliato**),
`AdminIOTab` (l'export è un backup, e un backup che omette in silenzio le task
più vecchie è peggio di un export fallito — i tre bottoni restano `disabled`
finché lo storico non è arrivato) e `AdvancedSearchPanel` (ha una casella
«includi nel cestino» e un filtro di stato che comprende «completato»: entrambi
promettono di cercare in ciò che la finestra non carica, e una ricerca che non
trova non dice «non ho cercato lì», dice «non c'è»). Le due viste del rilievo
originale erano quelle in cui il difetto si *vede*; queste tre sono quelle in
cui non si vede, che è la ragione per cui vanno nominate.

**La parte che non si legge nel diff, e che è il vero rischio del passo 1.**
Una volta che una vista ha chiesto il corpus intero, l'idratazione deve
restare completa **per il resto della sessione**. `useDebouncedTableSubscription`
rifà il reload completo su `online` e su `visibilitychange`, e se quel reload
tornasse alla finestra il Cestino aperto si svuoterebbe da solo: nessuna
eccezione, nessun toast, e il dato torna premendo F5 — cioè la classe di
guasto che si attribuisce alla rete per settimane. Da qui il ref
`storicoCompleto`, letto dal reload al momento della chiamata, alzato **prima**
della richiesta (così ogni reload concorrente parte già completo) e riabbassato
se quella fallisce (il ref dice «lo stato *deve* contenere il corpus», e se non
è mai arrivato tenerlo alzato significherebbe non riprovare mai). Stessa
famiglia: una risposta della finestra può arrivare **dopo** quella dello
storico, e `isCurrent()` non la scarta — è il gen-counter delle richieste dello
stesso tipo, e queste due non lo sono. Il reload confronta il proprio parametro
di partenza col ref e scarta la propria risposta se nel frattempo il mondo è
cambiato.

**Terza nota, su `includeDeleted`.** Toglierlo dall'idratazione è stato
possibile solo grazie al suggerimento strategico n.1 (merge per riga, chiuso il
16 agosto): il commento che lo cablava a `true` spiegava che senza il cestino
la ri-idratazione scattata subito dopo un `DELETE_TASK` avrebbe svuotato la
vista Cestino. Oggi il soft-delete è un UPDATE applicato per riga da `applyRow`
e **nessun reload parte più per un cestinamento**. Le due correzioni sono state
scritte in giorni diversi e da percorsi diversi, ma la seconda è la premessa
della prima: senza, questo passo avrebbe reintrodotto un difetto già visto.

**Guardie.** `src/test/finestraIdratazione.test.js` (6 casi: la forma della
query, i due assi `completeDal`/`includeDeleted` che non devono confondersi, il
fail-open sulle righe `done` senza data), `src/test/storicoTask.test.jsx` (14
casi: le due metà, l'idempotenza, il flag che si chiude anche sull'errore, il
reload di riconnessione che resta completo, la corsa fra le due risposte, e un
controllo positivo che verifica che la sonda sappia accorgersi dell'*assenza*
della richiesta), tre casi nuovi in `src/test/statiDiAttesa.test.jsx` (con lo
storico in volo l'Archivio non scrive un totale) e il controllo «viste che
chiedono lo storico» in `verifica:convenzioni`, che tiene onesto il numero
scritto in `CLAUDE.md` in **entrambe** le direzioni: una vista di troppo — una
vista d'ingresso, che filtra già con `getActiveTasks` — annullerebbe il rilievo
lasciandone in piedi tutto il codice, senza che nulla fallisca.

#### ✔ Passo 3 — la cronologia si legge per task aperto

Fatto subito dopo, verificato il preview del passo 1-2 in produzione. È il
passo che il rilievo dichiarava subordinato agli altri due («solo dopo»), ed è
anche — misurandolo — **quello che paga di più oggi**.

**Il difetto, nella sua forma esatta.** `task_history` è l'unica tabella
dell'app che cresce e non si pota mai, e aveva **un solo lettore**: il pannello
CRONOLOGIA dello slide-over, che ne guarda un task per volta e solo mentre è
aperto. Veniva però letta INTERA in due punti diversi:

1. annidata dentro `TASK_SELECT_WITH_COMMENTS`, cioè a ogni idratazione;
2. piatta, a ogni evento realtime su `task_history` — che scatta a ogni cambio
   di stato, priorità, scadenza o assegnatario fatto da **chiunque** in
   agenzia, su **ogni** client connesso.

Il secondo è il costo che cresce peggio: `fetchAllRows` pagina in modo
SERIALE, quindi la proiezione a dodici mesi (~5.500 righe) sono sei round-trip
in fila per aggiornare un pannello quasi sempre chiuso.

**Misure di produzione, 17 agosto 2026.**

| | valore |
|---|---|
| `task_history` totale | 661 righe |
| di cui **nel payload d'avvio** (dentro la finestra del passo 1) | **602** |
| media per task | 2,4 righe |
| massimo su un singolo task | 11 righe |
| `comments` (per confronto) | 7 righe |

Il payload d'avvio perde 602 righe annidate e le sostituisce con una lettura di
~2,4 righe quando un task si apre. **È il contrario del passo 1**, che oggi ne
toglie 33 ed è preventivo: qui il risparmio è immediato e già la parte
maggioritaria del grafo che l'idratazione portava con sé.

**Cosa è cambiato.** `task_history` non è più nella select dei task, non è più
fra le tabelle sottoscritte da `useAppHydration` (che ne ascolta due),
`history` non è più un campo del task, e `SET_TASK_THREADS` porta i soli
commenti. Il pannello è `components/tasks/TaskHistoryPanel.jsx`, con lo stesso
schema di `TaskAttachments` che gli sta accanto nello slide-over: stato locale,
fetch al mount, `useIsMounted`, più una sottoscrizione che vive solo mentre è
montato.

**La cosa che rende il passo 3 una correzione e non uno spostamento.** La
sottoscrizione del pannello **filtra sul proprio `task_id`**. Senza quel
filtro avremmo sostituito «una lettura grande e rara» con «una lettura piccola
e frequentissima», a schermo identica e con nessun test che fallisce — cioè
avremmo scritto il codice di A-3 tenendone il difetto. È il caso su cui
insiste `cronologiaPerTask.test.jsx`, insieme al suo controllo positivo (un
evento sul PROPRIO task deve invece rileggere: senza quello, un `filterEvent`
che scarta tutto passerebbe).

**Una correzione al rilievo, ancora.** Il testo del passo 3 indicava come
modello `lista_history` con `limit 50`. Non è stato seguito, e la ragione è la
differenza fra i due pannelli: là è un elenco di *attività recenti*, dove il
tetto è esattamente ciò che si vuole mostrare; qui è la cronologia COMPLETA di
un task, e un `limit` taglierebbe in silenzio le righe più vecchie — a partire
da «task creata», che è quella che si va a cercare. `historyForTask` resta
quindi su `fetchAllRows`: su una singola riga padre costa lo stesso round-trip
e non ha un limite da sbagliare.

**Perché i commenti NON hanno seguito la stessa strada.** Sembrano la metà
gemella della cronologia — stessa tabella figlia, stesso reload selettivo — e
il censimento dei lettori dice che non lo sono: `AdvancedSearchPanel` cerca
DENTRO il testo dei commenti (`matchTermini(… t.comments.map(c => c.text))`),
quindi quel corpus serve davvero per intero a una funzione che l'utente usa.
Nessuno cerca dentro la cronologia. La differenza fra le due non è la
dimensione (7 righe contro 661), è il numero di lettori — ed è la ragione per
cui il passo 3 tocca una sola delle due.

**Guardie.** `src/test/cronologiaPerTask.test.jsx` (9 casi: la lettura per
task, il filtro realtime e il suo controllo positivo, il pre-image sulle
DELETE, la disiscrizione allo smontaggio, e i tre stati di attesa —
caricamento, vuoto ed errore, che qui sono **tre e non due**: «non c'è
cronologia» e «non sono riuscito a leggerla» portano a due conclusioni diverse
per chi guarda). Più il caso `historyForTask` in `paginazione.test.js` (il
filtro `.eq` esiste, e i commenti NON ce l'hanno), l'asserzione di ASSENZA in
`mappers.test.js` (`fromDbTask` non porta più la cronologia — la regressione
sarebbe muta: rimettere il ramo annidato farebbe funzionare tutto e
riaprirebbe A-3 senza che nulla fallisca), e l'inversione di contratto in
`realtimeGranularita.test.jsx`, dove «un evento su `task_history` ricarica solo
la cronologia» è diventato «non è più sottoscritta a `task_history`» — che
asserisce l'assenza dell'**handler**, non solo l'assenza di effetti, altrimenti
il caso passerebbe anche con un canale vivo che non fa nulla.

---

### 🟡 M-1 · `ClientiView.handleSave` chiude la modale senza attendere la scrittura ✔

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

**Correzione (applicata).** `handleSave` attende e riporta l'esito senza
chiudere niente; a chiudere è la modale, che è anche l'unica a sapere se ha
ancora qualcosa da perdere:

```js
const handleSave = async (form, { renameTasks = [] } = {}) => {
  const res = modal?.mode === "edit" && modal.cliente
    ? await dispatch({ type: "UPDATE_CLIENT", payload: { ...modal.cliente, ...form } })
    : await dispatch({ type: "ADD_CLIENT", payload: { id: crypto.randomUUID(), ...form, createdAt: new Date().toISOString() } });

  if (res?.error) return res;

  // Il rename dei task segue solo se il cliente è stato scritto DAVVERO:
  // rinominarli dopo una scrittura fallita li allontanerebbe da un'anagrafica
  // rimasta com'era.
  if (renameTasks.length && modal?.cliente) {
    await dispatch({ type: "RENAME_CLIENT_IN_TASKS", payload: { from: modal.cliente.name, to: form.name } });
  }
  return { error: null };
};
```

e nella modale il ciclo di vita del salvataggio è tutto nell'hook:

```diff
-const [saving, setSaving] = useState(false);
-const montato = useIsMounted();
+const { salva, inVolo: saving, errore: erroreSalvataggio } = useSalvataggio(onSave, { alSuccesso: onClose });
…
-  setSaving(true);
-  await onSave({ ...form, name: form.name.trim() }, { renameTasks: … });
-  if (!montato()) return;
-  setSaving(false);
+  await salva({ ...form, name: form.name.trim() }, { renameTasks: … });
```

più un `<FieldError id="cli-save-err">{erroreSalvataggio}</FieldError>` sopra i
bottoni.

La scheda diceva «`useIsMounted` resta e resta necessario»: resta necessario,
ma **non qui** — è passato dentro `useSalvataggio`, che è anche il punto in cui
lo smontaggio viene provocato (è `alSuccesso` a chiamare `onClose`). `ClienteModal`
non lo importa più. Il guard resta a carico del chiamante per ogni altra
`await`: le fetch al mount dei pannelli, l'upload dell'avatar in `ProfileEditor`.

Effetto collaterale che vale il rilievo da solo: **«Salvataggio...» ora si può
vedere**. Era già scritto nel file, ma nessuno poteva incontrarlo — il
componente veniva smontato nello stesso turno del click. Il caso di test che
lo osserva (`salvaEChiudi.test.jsx`) tiene la scrittura in volo con una promise
differita, ed è l'unico modo di distinguere «il feedback c'è» da «il feedback è
scritto».

---

### 🟡 M-2 · La finestra sugli elenchi è applicata a 2 viste su 7 ✔

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

**Correzione (applicata il 18 agosto).** L'hook è
`src/hooks/useFinestra.js`, e il piede dell'elenco — comando più conteggio —
è `src/components/ui/MostraAltri.jsx`. Sono **nove** le viste che ci passano:
le due che avevano già la finestra (`ClientiView`, `ListeViaggio`, migrate
all'hook così che non resti una seconda forma canonica accanto a quella nuova)
e le sette che non ce l'avevano — Archivio, Cestino e le cinque code.

Tre cose sono emerse implementando, e nessuna è nel diagramma qui sopra.

1. **Il riazzeramento non è un `useEffect`.** La firma proposta
   (`useFinestra(elementi, passo, deps)` con `deps` passato a `useEffect`)
   sarebbe un array di dipendenze *dinamico*, che `react-hooks/exhaustive-deps`
   non sa verificare — e quella regola è a **zero warning per scelta**, cioè un
   warning nuovo per definizione. Sarebbe anche una correzione *dopo* il fatto:
   un render con la finestra vecchia, poi l'effetto che la richiude. L'hook
   adegua quindi lo stato **in render** confrontando una chiave derivata dai
   restringimenti: React ri-esegue il componente prima di toccare il DOM, e a
   schermo non arriva mai lo stato intermedio.
2. **Le due frasi le compone il chiamante, non il componente.** «Mostra altri
   24» e «Mostra altre 24» dipendono dal nome che segue, e nell'app *task* è
   femminile nell'Archivio («task completate») e maschile nel Cestino («task
   eliminati»). `MostraAltri` prende quindi due stringhe già composte e tiene
   solo il layout: comporre testo per interpolazione è il modo in cui nasce
   «Descrizione è obbligatorio» (vedi il commento in `lib/validators.js`).
3. **La finestra si riazzera sui restringimenti, non sull'elenco.** Se
   dipendesse dall'identità dell'array, un evento realtime che aggiunge una
   riga richiuderebbe la finestra sotto gli occhi di chi ha appena premuto
   «mostra altri». È un caso a sé in `src/test/finestraElenchi.test.jsx`.

Il passo è 24 per Archivio e Cestino (come l'anagrafica) e **10** per le code
(`QUEUE_PAGINA` in `queueShared.js`): una coda è una *card* della dashboard,
non una pagina. `ListeViaggio` tiene il proprio bottone `lv-btn` invece di
`MostraAltri` — il CSS del modulo è scopato sotto `.lv-root`, quindi il piede
condiviso ci arriverebbe senza i propri stili: stessa meccanica, aspetto di
casa.

Guardia: `src/test/finestraElenchi.test.jsx` (13 casi) conta le **righe a
schermo**, non le chiamate interne, ed esercita insieme le due metà che si
dimenticano una alla volta — il tetto e il riazzeramento.

---

### 🟡 M-3 · Ricerca a testo libero senza debounce né indice ✔

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

**Correzione (applicata il 18 agosto).** `lib/searchUtils.js` espone
`indicizza(...campi)` e `matchIndice(termini, idx)`, e `matchTermini` è ora
scritta **sopra** le due: la semantica (apostrofi, ordine delle parole, cognomi
elisi) resta definita in un punto solo, e i test che la fissano sono anche il
modo di verificare che l'indice non l'abbia cambiata — `src/test/searchUtils.test.js`
ha un caso che passa dieci query dai casi reali per **entrambe** le strade e
pretende la stessa risposta. Tre viste indicizzano: `ClientiView` (`useMemo` su
`clients`), `Archive` (su `archived`, insieme a B-4) e `ListeViaggio`.

Due cose sono emerse implementando.

1. **Nell'elenco liste il costo era doppio di quello misurato.**
   `filtraListe` girava su **quattro** insiemi (attive, esaurite, tutte,
   cestino) a ogni battuta, quindi le liste attive venivano normalizzate due
   volte per carattere digitato, cointestatari inclusi. Ora si filtra l'indice
   una volta sola e si partiziona per stato: `filtraIndicizzate` in
   `liste/listeOrdinamento.js`. `filtraListe` resta esportata — ha un
   chiamante che confronta senza avere un elenco da indicizzare, e i suoi test.
2. **L'Archivio non usava affatto `searchUtils`**: cercava con un
   `` `${title} ${client} ${praticaRef}`.toLowerCase().includes(q) `` scritto
   a mano. Oltre a essere lo stesso lavoro ripetuto, era una *seconda*
   definizione di «trovare»: qui «d amato» non trovava la task di D'AMATO che
   la ricerca clienti trovava — la stessa domanda con due risposte diverse.
   Indicizzarlo ha chiuso anche quello.

---

### 🟡 M-4 · Il commento digitato si perde se la scrittura fallisce ✔

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

**Correzione (applicata).** Svuotare **dopo** la conferma, con lo stesso
contratto degli altri due — non con un `useState` in più scritto a mano, che è
esattamente il modo in cui i tre call site avevano finito per divergere:

```jsx
const { salva: inviaCommento, inVolo: commentoInVolo, errore: erroreCommento } = useSalvataggio(
  (testo) => dispatch({
    type: "ADD_COMMENT",
    payload: { taskId: task.id, comment: { user: getMember(currentUserId)?.name || "Utente", text: testo, time: new Date().toISOString() } },
  }),
  {
    alSuccesso: () => setNewComment(""),
    messaggioErrore: "Commento non inviato. Il testo è ancora qui, riprova.",
  },
);

const handleComment = () => {
  const testo = newComment.trim();
  if (!testo) return;
  inviaCommento(testo);       // il testo passa come ARGOMENTO, non per closure
};
```

Il testo viaggia come argomento e non catturato dalla closure: così `esegui`
non dipende da `newComment` e non si ricostruisce a ogni battuta. Il bottone
`↑` si spegne per la sola durata della scrittura, e il messaggio compare sotto
la casella legato all'input via `ariaCampo`/`FieldError` — la stessa forma della
validazione inline, perché è lo stesso problema: dire cosa non ha funzionato
**dove** è successo.

---

### 🟢 B-1 · L'app intera è nel chunk d'ingresso anche alla schermata di login ✔

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

**Correzione (applicata il 18 agosto).** Misurato prima e dopo, come chiesto:

| | prima | dopo |
|---|---|---|
| Chunk d'ingresso | 72,46 kB gzip | **14,47 kB** (−80%) |
| First load (entry + react + supabase) | 172,40 kB gzip | **114,41 kB** (−34%) |

Il `Suspense` non aggiunge una schermata nuova: il fallback è la **stessa**
splash che `AuthGate` mostra già mentre `getSession()` risolve — l'attesa del
chunk e quella dell'auth sono la stessa attesa per chi guarda.

Due cose emerse implementando.

1. **Il prefetch va `catch`-ato.** `caricaApp()` lanciato e non atteso è una
   promise che, se il chunk manca, diventa una *unhandled rejection* — cioè lo
   stesso guasto raccontato due volte, e la prima volta prima ancora che
   l'app serva. Il `catch` è vuoto di proposito: l'errore VERO lo solleva il
   `lazy()` quando React prova a montare, dove c'è un boundary che gli dà un
   codice di segnalazione.
2. **La rete di sicurezza è quella di PRIMO livello**, non
   `ViewErrorBoundary`/`OverlayErrorBoundary` come negli altri otto montaggi:
   qui il chunk mancante *è* l'app, non esiste «il resto di Tullio continua a
   funzionare» in cui rientrare, e la pagina intera con «Ricarica» è la sola
   uscita sensata. Il controllo `lazy() senza boundary` di
   `verifica:convenzioni` è stato allargato per riconoscerla — la condizione
   verificata resta la stessa, un `lazy()` e un boundary nello stesso file.

**Le soglie di `verifica:bundle` sono scese con la misura** (84 → 21 kB
d'ingresso, 184 → 121 kB di first load, stesso margine di +6 kB dichiarato
lì): lasciarle dov'erano avrebbe significato 70 kB di gioco che non
intercettano più niente — un controllo che smette di controllare senza mai
diventare rosso. Con la soglia nuova, un `import` statico di `VoyageDesk`
rimesso per distrazione (~72 kB) si ferma in CI.

---

### 🟢 B-2 · Il toast di successo precede la conferma del server ✔

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

**Correzione (applicata il 18 agosto).** Non per messaggio, però, e la
differenza è la parte che si è vista solo implementando: **per AZIONE**.
Rimuovere per testo avrebbe richiesto, dentro `fail()`, una tabella
`tipo azione → frase di successo` — cioè una seconda copia dei messaggi del
reducer, da tenere allineata a mano su una quarantina di `pushToast`, e il
primo che divergesse fallirebbe in silenzio (il toast falso resta, nessun test
rosso). Ogni toast porta invece il tipo dell'azione che l'ha prodotto, marcato
**nel wrapper** `reducer` — che quel tipo ce l'ha già sotto mano — e
`RETRACT_TOASTS` toglie i soli toast *di successo* di quell'azione.

Due proprietà volute, entrambe con un caso in `src/test/toastQueue.test.js`:
gli **errori** non si ritirano (un rifiuto per permessi è un fatto accaduto, e
si ritira ciò che il server non ha confermato, non ciò che ha respinto), e i
successi di **altre** azioni restano (possono venire da una scrittura andata a
buon fine un attimo prima: toglierli sarebbe la stessa bugia al contrario).

Il ritiro va fatto **sempre**, non solo dove c'è un rollback: la compensazione
riporta indietro la coda dei toast, ma solo le azioni che dichiarano
`rollback` ce l'hanno. E va fatto **dopo** il rollback, altrimenti è lui a
riportare indietro il toast appena ritirato — l'ordine è fissato da
`src/test/syncedDispatch.test.jsx`, che asserisce la sequenza esatta delle
azioni dispatchate.

Effetto collaterale strutturale: il reducer ha toccato il tetto di 550 righe.
Il numero **non è stato alzato** — è uscita la politica della coda dei toast
(dedup, cap, marcatura, ritiro) in `src/state/toastQueue.js`, che come
`activityLog.js` non è una transizione di stato ma una regola che il reducer
applica.

---

### 🟢 B-3 · Quattro call site ancora fuori dalla regola di M-3 ✔

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

**Correzione (applicata il 18 agosto).** Tutti e quattro passano ora da
`validaCampi` + `FieldError`/`ariaCampo`, con il focus sul primo campo
sbagliato in ordine visivo e nessun `disabled` al posto del messaggio. Le
due condizioni di `NewConversationView` e le tre di `TemplateTab` sono ora
dette **una per una**: è il punto del rilievo, e i test lo esercitano
mostrando che a nome compilato compare l'*altra* condizione.

Tre precisazioni emerse implementando, che il rilievo non poteva vedere.

1. **`EditListaModal:51` non è un «bottone spento».** `disabled={!rinomina}`
   è sul CAMPO del nome titolare, ed è una sola-lettura voluta e documentata:
   rinominare il titolare cambia l'anagrafica condivisa di tutta l'agenzia, e
   la spunta è il consenso esplicito. Il difetto lì era un altro, della stessa
   famiglia ma peggiore: `onSave.onError("Il nome del cliente è obbligatorio")`
   mandava il messaggio in un **toast**, cioè esattamente il difetto che la
   regola descrive (angolo dello schermo, sparisce da solo, nessun legame con
   l'input). Il `disabled` del campo resta; il messaggio è sceso sotto il campo.
2. **`busy` non è una condizione di form.** In `TemplateTab` le tre condizioni
   spente insieme (`!tpl || !eventDate || busy`) sono di due nature diverse:
   le prime due sono cose da compilare, la terza è il freno al doppio invio
   mentre la scrittura è in volo. `disabled={busy}` resta — la sua ragione è
   già a schermo, «⏳ Creazione…» — e le altre due sono diventate messaggi.
3. **La scelta del template era una quarta condizione invisibile.** Il piede
   con «✓ Crea 0 task» è a schermo anche nella schermata di *scelta*: togliendo
   `!tpl` dal `disabled` senza aggiungerne la regola, il comando avrebbe
   chiesto una data che in quel momento non è sulla pagina. Ha quindi una
   regola sua, con `ORDINE` visivo — prima il template, poi la data.

E una nota di ARIA: sull'elenco dei membri di `NewConversationView` non si
mette `ariaCampo`. `aria-invalid` è un attributo dei **controlli**, e su
un'intestazione descriverebbe una cosa che non esiste; lì il messaggio si
annuncia da sé (`FieldError` ha `role="alert"`) e il focus lo porta sotto gli
occhi.

---

### 🟢 B-4 · `Archive` ricalcola filtro, permessi e ordinamento a ogni render ✔

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

**Correzione (applicata il 18 agosto, insieme a M-3).** Come descritto, con
`getVisibleTasks` nelle dipendenze — arriva da `useAppData()`, il cui value è
già `useMemo` su `[team, categories, currentUserId]`, quindi la memoizzazione
regge davvero invece di invalidarsi a ogni render (una funzione ricreata dal
provider avrebbe reso i tre `useMemo` decorativi, ed è il modo in cui questa
correzione si scrive male).

**Il rilievo era più stretto della realtà**: lo stesso difetto, identico, era
in `Trash` (`trashed` + `editableCount`, tre passate su tutte le task a ogni
cambio di chip) e nelle cinque code, dove filtro e ordinamento giravano a ogni
render della Dashboard — compresi quelli che non riguardavano quella card. Sono
stati memoizzati insieme, perché è anche la condizione perché la finestra di
M-2 non ricalcoli la propria `slice` a vuoto: elenco con identità nuova a ogni
render, finestra che si ricostruisce comunque.

---

## Due affermazioni di `docs/CLAUDE.md` da correggere ✔

`INDEX.md` fissa la regola: «se `CLAUDE.md` è in disaccordo col codice, il
codice è la fonte di verità e `CLAUDE.md` va corretto nello stesso commit che
scopre la discrepanza». Questo audit ne scopre due, entrambe scritte in buona
fede al momento in cui erano vere per il perimetro allora considerato:

1. **Validazione dei form** — «✅ Dal 16 agosto (M-3) non resta un solo call
   site fuori». Ne restavano cinque: `QuickAddTask` (A-2) e i quattro di B-3.
   ✔ **Corretta** nello stesso commit che ha chiuso A-2: la frase ora dice che
   il censimento di M-3 contava otto form su nove, che il nono è rientrato, e
   nomina i quattro di B-3 ancora fuori.
2. **Elenchi lunghi** — la regola descrive `ClientiView` e `ListeViaggio` come
   se fossero l'insieme degli elenchi lunghi dell'app. Non lo sono: Archivio,
   Cestino e le cinque code non hanno finestra (M-2). Va detto quali viste la
   applicano e quali no, finché non la applicano tutte.
   ✔ **Corretta il 18 agosto**, insieme a M-2 — e ora la frase può dire
   *tutte*: la regola nomina `hooks/useFinestra.js` come unica implementazione
   e le nove viste che ci passano, invece di due esempi che si leggevano come
   l'insieme.

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
`src/hooks/useSalvataggio.js`, `{ salva, inVolo, errore, avviso, bloccato }`.

**Applicato il 16 agosto**: 3 call site (`QuickAddTask`, `ClienteModal`,
il box commenti di `TaskSlideOver`), +19 casi di test (1.378 → **1.397**
verdi), controllo `call site di useSalvataggio` in `verifica:convenzioni`,
chunk d'ingresso da 71,34 a **72,07 kB** gzip su una soglia di 84.

Tre cose sono cambiate rispetto alla bozza qui sopra, tutte scrivendo il
codice:

1. **Il freno al doppio invio è un ref, non lo stato `inVolo`.** La bozza
   leggeva `if (inVolo) return` da una variabile di render: fra due click
   ravvicinati React può non aver ancora ri-renderizzato, quindi entrambi i
   gestori la leggerebbero `false`. Lo stato resta, ma per l'unico compito che
   gli spetta davvero — *dipingere* l'attesa.
2. **`esegui` e `alSuccesso` vivono in un ref aggiornato dopo il commit**, così
   `salva` ha identità stabile (passabile a un componente `memo` senza
   rianimarlo, che è la premessa dichiarata della memoizzazione in questo
   progetto) e il call site non deve avvolgere `esegui` in un `useCallback` con
   la lista di dipendenze giusta — cosa che con un form intero nella closure si
   sbaglia in silenzio, salvando i valori di due render fa.
3. **Un terzo esito, `{ avviso }`**, per la riuscita parziale. Vedi A-2: è il
   caso in cui riprovare è la cosa sbagliata, e senza un posto dove esprimerlo
   il call site più importante sarebbe tornato a scriversi il proprio ciclo a
   mano — cioè il difetto, ricostruito dentro la sua correzione.

Una cosa che l'hook **non** fa, e che vale la pena dire: non è un controllo
statico. «Questo form si chiude prima di conoscere l'esito» non è una domanda
a cui un sorgente risponda da solo — dipende da chi passa `onSave`, da cosa
quel `onSave` attende e da chi chiama `setModal(null)`, cioè da tre file
diversi. Per questo la guardia qui è un test e non un grep: `salvaEChiudi.test.jsx`
verifica per ogni call site, insieme, che il pannello **non** sia stato chiuso
e che i valori digitati siano **ancora nel DOM** — il solo messaggio d'errore
passerebbe anche su una modale che si chiude subito dopo averlo mostrato. Il
controllo in `verifica:convenzioni` fa il mestiere di quello script, che è
diverso: tiene onesto il numero scritto in `CLAUDE.md`, così un form riscritto
a mano fuori dal contratto fa scendere il conteggio e la CI lo dice.

Restano fuori dal contratto i salvataggi già corretti a mano (le quattro tab
del `BulkTaskCreator`, `ProfileEditor`): convertirli è lavoro meccanico e
senza rischio, ma è anche l'unico modo perché non resti una seconda forma
corretta accanto a quella canonica — la stessa ragione per cui A-1 ha
convertito anche i due punti di montaggio che il boundary ce l'avevano già.

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
