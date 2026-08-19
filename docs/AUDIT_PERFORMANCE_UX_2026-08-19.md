# Audit performance/scalabilità e UX/error handling — 19 agosto 2026

Terzo passaggio sul perimetro performance/UX, dopo quelli del 16 agosto
(`AUDIT_ARCHITETTURA_2026-08-16.md`, punti 3-5) e del secondo passaggio dello
stesso giorno (`AUDIT_PERFORMANCE_UX_2026-08-16_ii.md`, undici rilievi tutti
chiusi fra il 16 e il 18).

Quei due hanno chiuso tutto ciò che avevano trovato. Questo parte da lì: non
cerca difetti nuovi in codice nuovo — quasi non ce n'è — ma applica ai call
site **le regole che quegli audit hanno stabilito**, e conta dove non arrivano.
È la forma che il progetto ha già visto tre volte (A-1, M-2 e M-3 del 16 agosto
erano tutti «una regola giusta, scritta e motivata, applicata a una parte dei
call site»), e non è un caso che si ripresenti: una convenzione scritta in
`docs/CLAUDE.md` si propaga per imitazione, e l'imitazione si ferma dove
qualcuno ha aperto un altro file per copiarne la forma.

**Nessun rilievo critico.** I quattro meccanismi che potrebbero perdere dati —
scritture in volo, `esitoScrittura`, rollback, guardia anti-stale — reggono,
e questa volta non è una constatazione ereditata: A-4 qui sotto attraversa sei
percorsi di scrittura che nessun audit precedente aveva percorso, e in tutti e
sei il *database* resta coerente. Quello che si perde è ciò che l'utente ha
digitato, che è un danno di UX e non di integrità.

## Metodo

Baseline verificata prima di aprire qualunque rilievo, sul repository a
`36a5d8a`:

| | |
|---|---|
| `npm test` | **1488 passati**, 8 saltati (125 file) |
| `npm run lint` | pulito |
| `npm run build` | 298 moduli, 4,73 s |
| `npm run verifica:bundle` | OK — ingresso 14,47 kB, first load 114,41 kB gzip |

Le misure di questo documento sono **misurate, non stimate**: il benchmark del
filtro di ricerca gira sulla funzione reale (`src/lib/searchUtils.js`), il
rilievo sul budget del bundle è stato verificato **provocando la regressione**
che dovrebbe intercettare, e il grafo dei chunk è letto dal manifest di Vite
sul build vero.

---

## Tabella delle priorità

| # | Priorità | Area | Rilievo | File |
|---|---|---|---|---|
| A-1 ✔ | 🟠 **Alta** | Performance | Il budget del bundle non copre il chunk che **tutte** le sessioni scaricano: 60,93 kB gzip su 175,34 senza alcuna soglia. Verificato provocando la regressione — un `import` statico di `ChatPanel` sposta 14,47 kB gzip dentro e `verifica:bundle` stampa **OK** | `scripts/verifica-bundle/index.js:60-101` |
| A-2 ✔ | 🟠 **Alta** | Performance | La ricerca avanzata normalizza i campi **per riga a ogni battuta**: è M-3 del 16 agosto non applicato all'ultimo call site — e quello con il corpus più grande. **6,21 ms per battuta** oggi, 49,25 ms a 2500 task | `search/AdvancedSearchPanel.jsx:145` |
| A-3 ✔ | 🟠 **Alta** | Scalabilità | Il battito di presenza è una `UPDATE` su `public.users` ogni 30 s per sessione, su una tabella a `REPLICA IDENTITY FULL` osservata da **due** canali per sessione: il traffico realtime cresce con **U²** | `hooks/usePresence.js:98`, `lib/api.js:966` |
| A-4 ✔ | 🟠 **Alta** | UX / errori | `useSalvataggio` — «⛔ mai chiudere o svuotare prima di conoscere l'esito» — è su **3 call site**; altri **sei** form chiudono o svuotano nello stesso turno del dispatch. Fra questi l'editor che **revoca i privilegi** di un account | `dashboard/NoticeBoard.jsx:350`, `admin/tabs/AdminTeamTab.jsx:101`, +4 |
| M-1 | 🟡 Media | Scalabilità | `clients` è l'unica entità rimasta **senza finestra**: l'anagrafica intera a ogni idratazione e a ogni riconnessione — e `public.clients` non ha indici oltre la PK mentre la query ordina per `name` e chiede `count: 'exact'` a ogni pagina | `lib/api.js:862-864`, `hooks/useAppHydration.js:475` |
| M-2 ✔ | 🟡 Media | Performance | La lista messaggi della chat è l'unico elenco lungo **senza `memo` sulla riga e senza finestra**, e contiene un `indexOf` dentro la `map` (O(n²)). Si ri-renderizza **ogni 2,5 s** mentre un collega scrive | `chat/ConversationView.jsx:409-410`, `chat/message/ChatMessage.jsx` |
| M-3 ✔ | 🟡 Media | UX / errori | Il ripristino dal Cestino sono **due scritture dipendenti** (`UPDATE_TASK` poi `RESTORE_TASK`), nessuna delle due attesa: se la prima è rifiutata la task torna con i valori vecchi e le modifiche appena digitate spariscono senza che nulla lo dica | `views/Trash.jsx:121-123` |
| B-1 | 🔵 Bassa | Scalabilità | **11 canali realtime sempre aperti** per sessione, due dei quali sulla stessa tabella (`users`) e due su tabelle che cambiano poche volte l'anno (`categories`, `message_templates`) | `hooks/useAppHydration.js`, `hooks/usePresence.js:109` |
| B-2 | 🔵 Bassa | UX / errori | `AddTeamMemberModal` è l'unico form rimasto fuori da **entrambe** le convenzioni di validazione: `if (!name.trim())` invece di `validaCampi`, e il messaggio in un `div` senza `role="alert"`, senza `aria-invalid`/`aria-describedby`, non associato al campo | `modals/AddTeamMemberModal.jsx:43-49` |

---

# Executive summary

**Il progetto è in buona salute, e non nel senso generico.** Su questo
perimetro tre delle quattro cose che di solito si trovano rotte in un
gestionale React non lo sono, e non per fortuna: hanno un file dedicato, un
commento che spiega perché esiste, e un controllo automatico che le tiene
oneste.

- **Code splitting**: nove punti di montaggio `lazy()`, tutti e nove con un
  error boundary proprio (`LazyPanel` = Suspense + boundary in un gesto solo).
  `xlsx` — 143 kB gzip, quattro volte il chunk d'ingresso — è dietro un
  `import()` dinamico. Il chunk d'ingresso è a **14,47 kB gzip**.
- **Memoizzazione**: le sei viste principali sono `memo` e ricevono prop a
  identità stabile (il `state` non è più una prop di nessuna); `TaskRow` e
  `TaskCard` sono `memo`; gli elenchi lunghi hanno una finestra condivisa
  (`useFinestra`, applicata a 9 viste); l'indice di ricerca dell'anagrafica è
  precalcolato sulla riga e non sulla query.
- **Gestione errori**: `ErrorBoundary` di primo livello, `ViewErrorBoundary`
  per vista, `OverlayErrorBoundary` per pannello, handler globali per le
  promise non gestite e per i chunk 404 con dedup e codice di segnalazione,
  banner offline persistente e non chiudibile, flag di caricamento **per
  entità** con scheletri invece di vuoti dichiarati troppo presto, `FieldError`
  con `role="alert"` + `aria-invalid` + `aria-describedby` e focus riportato
  sul primo campo invalido.

Quello che resta non è una lista di dimenticanze: sono **quattro regole giuste
che si fermano prima dell'ultimo call site**, più una scelta d'architettura che
è corretta oggi e diventa il tetto dell'applicazione domani.

La regola dei call site vale per A-1, A-2 e A-4, ed è la stessa storia:
`verifica:bundle` misura il first load dell'utente **anonimo** (che apre il
login una volta), non quello dell'**autenticato** (che è ogni sessione di un
gestionale, dove la sessione persiste); l'indice di ricerca precalcolato è su
tre call site su quattro e manca proprio in quello che carica il corpus intero;
`useSalvataggio` è su tre form su nove.

La scelta d'architettura è A-3, ed è l'unico rilievo che non si chiude
spostando codice. La presenza degli utenti è modellata come **una colonna di
una tabella scritta ogni 30 secondi**, e ogni scrittura è un evento realtime
consegnato a tutti i client sottoscritti. Con U sessioni contemporanee il
traffico è **U²/15 messaggi al secondo**, cioè circa **2 milioni al mese già
con le sette persone di oggi** e ~26 milioni con venticinque. È il tipo di
costo che non si vede finché il team è piccolo, e che quando si vede non si
corregge con un'ottimizzazione: si corregge cambiando dove vive il dato. Il
progetto ha già il meccanismo giusto in casa — il canale **broadcast** che usa
per l'indicatore «sta scrivendo», che non tocca il database.

---

# Action plan dettagliato

## A-1 · Il budget del bundle non copre il chunk che tutte le sessioni scaricano

**File**: `scripts/verifica-bundle/index.js:60-101` · **Priorità**: 🟠 Alta

### Il rilievo

`verifica:bundle` esiste per una ragione dichiarata nel suo stesso commento in
testa: chiudere **la categoria** di guasto che P2-1, P2-2 e P2-3 avevano
prodotto tre volte — «un import statico che scavalca un `lazy()` già deciso
altrove». La fonte di verità è `dist/index.html`, e il commento spiega perché è
la scelta giusta: è lì che Vite scrive con `<script type="module">` e
`<link rel="modulepreload">` l'insieme esatto di chunk che il browser scarica
prima del primo render.

Era vero fino a B-1 dell'audit del 16 agosto, che ha reso `VoyageDesk.jsx` un
`lazy()` con prefetch da `auth/AuthGate.jsx:29-34`. Da quel momento l'app —
reducer, registry di persistenza, data layer, idratazione, guscio, Dashboard,
ClientiView — **non è più in `dist/index.html`**: è un chunk dinamico, che il
prefetch avvia comunque alla valutazione del modulo, cioè in ogni sessione.

Il risultato è un budget che misura il percorso di chi **non è ancora entrato**
e lascia senza soglia il percorso di **chiunque sia dentro**:

```
                             kB gzip    soglia
chunk d'ingresso              14,47      21      ✅ misurato
react                         45,48       —
supabase                      54,46       —
  ── first load ANONIMO      114,41     121      ✅ misurato
VoyageDesk (l'app)            60,93       —      ⛔ nessuna soglia
  ── first load AUTENTICATO  175,34       —      ⛔ nessuna soglia
```

35% del payload che ogni sessione scarica sta fuori dal controllo.

### Perché è Alta e non Media

Perché **non è una teoria**. Ho riaperto a mano il difetto che il controllo
esiste per intercettare — `ChatPanel` da `lazy()` a import statico in
`VoyageDeskInner.jsx:76`, cioè esattamente ST-12 rimesso indietro — e ho
ricostruito:

```
dist/assets/VoyageDesk-CSjFLsjA.js   263,82 kB │ gzip: 75,40 kB   (era 60,93)
dist/assets/ChatPanel-*.js           — scomparso, assorbito

  chunk d'ingresso: 14.47 kB gzip (soglia 21 kB)
  totale first load: 114.41 kB gzip (soglia 121 kB)

verifica:bundle: OK.
```

14,47 kB gzip rientrati nel percorso caldo, `verifica:bundle: OK`. La
regressione è passata dritta, e con essa passerebbe qualunque altra: quella
`no-restricted-imports` copre tre moduli **per nome** (`ClienteListePanel`,
`ArchivedListe`, `mockData`), il budget doveva coprire la categoria, e la
categoria oggi vive in un chunk che il budget non guarda.

Il commento del file dice: «Se le tocchi per farle passare, prima capisci quale
chunk si è spostato». Il difetto non è nelle soglie — sono giuste e strette. È
che il perimetro si è spostato sotto di loro quando B-1 ha reso l'app un chunk
dinamico, e la soglia è rimasta dov'era.

### La soluzione

La fonte di verità resta il build, ma un livello più in là: il **manifest** di
Vite porta il grafo dichiarato — quali chunk l'entry importa staticamente e
quali dinamicamente — che è la stessa analisi con cui Rollup decide cosa va
dove. Segue esattamente il prefetch di `AuthGate`, senza doverlo indovinare da
un nome di file.

**1.** `vite.config.js` — abilitare il manifest:

```js
  build: {
    // A-1 (audit del 19 agosto). Il budget di `verifica:bundle` leggeva solo
    // dist/index.html, cioè il first load dell'utente ANONIMO. Da B-1 l'app è
    // un chunk DINAMICO prefetchato da AuthGate: non compare lì, e quindi non
    // aveva soglia. Il manifest porta il grafo (imports statici + dinamici)
    // con cui il controllo ricostruisce anche il first load AUTENTICATO —
    // quello di ogni sessione.
    manifest: true,
    rollupOptions: { /* … invariato … */ },
  },
```

**2.** `scripts/verifica-bundle/index.js` — terza e quarta soglia, misurate sul
build attuale (14,47 / 114,41 / **60,93** / **175,34**) con lo stesso margine
+6 kB dichiarato per le altre due:

```js
const SOGLIA_INGRESSO_KB    = 21;
const SOGLIA_FIRST_LOAD_KB  = 121;
// ─── A-1 · il chunk dell'app, e il first load di chi è DENTRO ─────────────
// In un gestionale la sessione persiste: l'utente tipico non vede mai il
// login, quindi il first load che conta è questo. 60,93 e 175,34 kB gzip
// misurati il 19 agosto; +6 kB di margine come sopra — assorbe la crescita
// normale del codice, non un chunk lazy intero rientrato in eager (il più
// piccolo dei nove, ClienteListePanel, ne sposta di più).
const SOGLIA_APP_KB         = 67;
const SOGLIA_AUTENTICATO_KB = 182;

// Il grafo dichiarato dal build: `imports` sono i chunk che l'entry tira
// dentro staticamente (react, supabase), `dynamicImports` quelli che un
// `import()` differisce — cioè, per l'entry, l'app che AuthGate prefetcha.
// Un solo livello di profondità è voluto: è ciò che il prefetch avvia,
// non l'intera chiusura transitiva dei lazy() interni all'app.
function primoCaricamento(manifest) {
  const entry = Object.values(manifest).find(e => e.isEntry);
  if (!entry) {
    console.error('verifica:bundle: nessuna entry nel manifest — build cambiata?');
    process.exit(1);
  }
  const anonimo = new Set([entry.file, ...(entry.imports || []).map(k => manifest[k].file)]);
  const app = new Set();
  for (const k of entry.dynamicImports || []) {
    app.add(manifest[k].file);
    for (const i of manifest[k].imports || []) {
      // Già nel first load anonimo (react): non si conta due volte.
      if (!anonimo.has(manifest[i].file)) app.add(manifest[i].file);
    }
  }
  return { anonimo: [...anonimo], app: [...app] };
}
```

…e i due controlli nuovi accanto ai due esistenti, con lo stesso messaggio di
rimedio.

**3.** `docs/CLAUDE.md` — la frase sul budget porta oggi due numeri; devono
diventare quattro, così `verifica:convenzioni` li fa scadere in modo rumoroso
come fa già per gli altri.

**Costo**: ~40 righe di script, nessun codice applicativo.
**Effetto**: la categoria che il progetto ha già pagato **quattro volte**
(P2-1, P2-2, P2-3, B-1) torna coperta sul percorso che ogni sessione attraversa.

---

## A-2 · La ricerca avanzata normalizza per riga a ogni battuta

**File**: `src/components/search/AdvancedSearchPanel.jsx:145` (e `:193` per le
liste) · **Priorità**: 🟠 Alta

### Il rilievo

M-3 dell'audit del 16 agosto ha diviso `matchTermini` in due funzioni per una
ragione precisa, scritta in `lib/searchUtils.js:53-70`: **la normalizzazione
dipende dalla riga, non dalla query**. `indicizza` la calcola una volta per
riga quando cambiano i dati; `matchIndice` confronta i termini con il
risultato. `matchTermini` resta «per i call site che hanno una riga sola da
confrontare e non un elenco da indicizzare».

Tre call site su quattro hanno adottato l'indice:

| Call site | Funzione | Corpus |
|---|---|---|
| `clients/ClientiView.jsx:161,169` | `indicizza` + `matchIndice` | 818 clienti |
| `views/Archive.jsx:95,102` | `indicizza` + `matchIndice` | 209 task archiviate |
| `liste/listeOrdinamento.js:43,58` | `indicizzaLista` + `matchIndice` | 616 liste |
| **`search/AdvancedSearchPanel.jsx:145`** | **`matchTermini`** | **tutte le task + i commenti** |

Il quarto non è un call site «con una riga sola»: è un `filter` su un elenco,
dentro un `useMemo` che ha `keyword` nelle dipendenze — quindi il lavoro si
rifà per intero a ogni carattere digitato. Ed è il call site con il corpus
**più grande di tutti**, per costruzione: questo pannello chiama
`useStoricoTaskCompleto()` (`:75`) proprio perché ha una casella «includi nel
cestino» e un filtro «completato», cioè dichiara di cercare in ciò che la
finestra dell'idratazione non carica. Il suo corpus è il corpus intero,
**cestino incluso**, e i campi confrontati includono `(t.comments || []).map(c => c.text)`.

### La misura

Benchmark sulla funzione reale (`src/lib/searchUtils.js`), corpus sintetico con
la forma di un task di produzione (titolo, descrizione, cliente, riferimento
pratica, 3 commenti), media su 20 esecuzioni:

| task | oggi (`matchTermini`) | con indice | indice costruito 1× |
|---|---|---|---|
| **292** (produzione, 17 ago) | **6,21 ms** per battuta | 0,18 ms | 8,62 ms |
| 1 000 | 19,04 ms | 0,59 ms | 25,72 ms |
| 2 500 (~12 mesi) | 49,25 ms | 1,47 ms | 56,17 ms |
| 5 000 | 98,10 ms | 2,65 ms | 114,69 ms |

Sono i numeri di un portatile da sviluppo; su un telefono di fascia media (3-5×,
lo stesso fattore usato in M-3) oggi sono **18-30 ms per battuta**, e a 2500
task **150-250 ms** — prima del render React, sul thread principale, fra il
tasto premuto e il carattere che compare.

La riga che rende il numero non ipotetico è già in `docs/AUDIT_PERFORMANCE_UX_2026-08-16_ii.md`:
**~5,6 task al giorno**. 2500 task è dove arriva questa installazione in circa
un anno.

### La soluzione

La stessa di `ClientiView`, e per la stessa ragione:

```js
// A-2 · L'indice della ricerca avanzata. Stesso ragionamento di
// ClientiView (M-3): la normalizzazione dipende dalla RIGA, non dalla
// query, quindi si costruisce quando cambia il corpus e non a ogni
// battuta. Qui pesa più che altrove — questo pannello chiede lo storico
// INTERO (useStoricoTaskCompleto sopra) e confronta anche i commenti.
// Misurato: 6,21 ms per battuta contro 0,18 su 292 task, 49,25 contro
// 1,47 su 2500.
const indice = useMemo(
  () => tasks.map(t => ({
    t,
    idx: indicizza(t.title, t.description, t.client, t.praticaRef,
                   (t.comments || []).map(c => c.text || "")),
  })),
  [tasks]);

const results = useMemo(() => {
  if (!hasFilters) return [];
  const termini = terminiRicerca(keyword);
  const from = startOfLocalDay(dateFrom);
  const to   = endOfLocalDay(dateTo);

  return indice.filter(({ t, idx }) => {
    // I filtri strutturali PRIMA del confronto testuale: scartano una riga
    // con un confronto di uguaglianza, e ogni riga scartata qui è un
    // matchIndice risparmiato.
    if (!includeTrashed && t.deletedAt) return false;
    if (cats.length && !cats.includes(t.category)) return false;
    if (stats.length && !stats.includes(t.status)) return false;
    if (agents.length && !(t.assignees || []).some(a => agents.includes(a))) return false;
    if (from) { if (!t.dueDate || new Date(t.dueDate) < from) return false; }
    if (to)   { if (!t.dueDate || new Date(t.dueDate) > to)   return false; }
    return matchIndice(termini, idx);
  }).map(r => r.t).sort(/* … invariato … */);
}, [indice, keyword, dateFrom, dateTo, cats, stats, agents, includeTrashed, hasFilters]);
```

L'import a `:17` passa da `{ matchTermini, terminiRicerca }` a
`{ indicizza, matchIndice, terminiRicerca }`.

⚠️ **Due dettagli che non vanno persi.** Il primo: l'indice si costruisce su
`tasks`, che per questo pannello arriva **dopo** — `caricandoStorico` è vero
mentre lo storico è in volo — quindi il `useMemo` si ricostruisce una volta a
storico arrivato, ed è corretto così (8,62 ms una volta contro 6,21 ms per
battuta). Il secondo: `:193` fa lo stesso su `liste`, dove
`listeOrdinamento.js` **esporta già** `indicizzaLista` — lì la correzione è
riusare quella, non scriverne una terza.

**Copertura**: i test esistenti su apostrofi, ordine delle parole e cognomi
elisi valgono già come verifica che l'indice non cambi la semantica — è la
ragione per cui M-3 ha lasciato `matchTermini` scritta *sopra* le altre due.

---

## A-3 · Il battito di presenza rende il traffico realtime quadratico

**File**: `src/hooks/usePresence.js:98`, `src/lib/api.js:966-990`,
`supabase/migrations/20260611221308_origin_tagging_comments_users.sql`
· **Priorità**: 🟠 Alta

### Il rilievo

La presenza degli utenti è modellata come **stato persistente**: ogni sessione
scrive il proprio `status` + `last_seen_at` su `public.users` ogni 30 secondi
(`usePresence.js:98`), incondizionatamente — anche a scheda nascosta, dove il
browser si limita a diradare il timer a ~1/minuto.

`public.users` è nella publication `supabase_realtime`
(`20260609091432_user_presence.sql:30`), quindi ogni battito è un evento
consegnato a **tutti** i client sottoscritti. E ogni sessione la sottoscrive
**due volte**:

- `hooks/useAppHydration.js:402` — il refresh del team;
- `hooks/usePresence.js:109` — la presenza.

Non è una svista: `lib/api.js:956-964` spiega perché i topic devono essere
univoci («più subscriber possono ascoltare la STESSA tabella: `users`, ad
esempio, è osservata sia dal refresh team sia dalla presence») — la soluzione a
un crash di supabase-js, non una scelta sul numero di canali.

C'è un filtro, ed è scritto bene: `useAppHydration.js:445-457` scarta gli
`UPDATE` che toccano solo `status`, `last_seen_at`, `origin_client`. Ma quel
filtro gira **nel browser, dopo che il messaggio è stato consegnato**. Il
risparmio è il refetch, non il traffico.

E c'è un moltiplicatore: `public.users` è a `REPLICA IDENTITY FULL`
(`20260611221308`), quindi ogni evento porta la **riga intera due volte**
(vecchia e nuova). La migrazione lo aveva già annotato — «Side effect: payload
realtime un po' più grandi (irrilevante alle dimensioni attuali)» — ed è vero:
è irrilevante a sette utenti, ed è la premessa di questo rilievo.

### La misura

Con **U** sessioni contemporanee, ogni finestra di 30 s produce U scritture su
`users`, e ognuna è consegnata a U sessioni × 2 canali:

> **messaggi/s = 2U² / 30 = U²/15**

Su una giornata lavorativa (8 h × 22 giorni = 633 600 s/mese di sessioni
sovrapposte), **dai soli battiti**:

| Sessioni contemporanee | msg/s | msg/mese |
|---|---|---|
| **7** (il team di oggi) | 3,3 | **~2,1 M** |
| 15 | 15,0 | ~9,5 M |
| 25 | 41,7 | ~26,4 M |
| 50 | 166,7 | ~105,6 M |

⚠️ Il consumo di piano va confrontato con il contatore reale del progetto:
l'allowance documentata del piano Free è **2 M messaggi/mese**, quella del Pro
**5 M**, ma sono numeri di listino che vanno riverificati sul piano in corso —
qui la cosa da leggere non è la cella, è la **forma della curva**. Il costo non
cresce con l'uso dell'app: cresce col **quadrato del numero di colleghi
collegati**, anche in una giornata in cui nessuno tocca una task.

### La soluzione

Il progetto ha già il meccanismo giusto, e lo usa a due file di distanza.
`lib/api.js:997-1009` — `subscribeToTyping` — è un canale **broadcast**: «A
differenza di `subscribeToTable` non tocca il DB: gli eventi vivono solo finché
i client sono connessi (il typing non va persistito)». La presenza ha
esattamente la stessa natura: è vera finché la sessione è aperta, e alla
riconnessione si ricostruisce da sé.

Supabase Realtime ha una primitiva dedicata — **Presence** — che tiene lo stato
nel canale, lo sincronizza fra i client e lo ritira da solo alla disconnessione:
nessuna `UPDATE`, nessun WAL, nessuna valutazione di RLS per riga, nessun
`REPLICA IDENTITY FULL` da trasportare. Il costo passa da U² messaggi a un
evento per **cambio di stato reale** (entro, esco, mi metto occupato).

```js
// hooks/usePresence.js — la presenza è EFFIMERA, come il "sta scrivendo".
// A-3 (audit del 19 agosto): era una UPDATE su public.users ogni 30 s per
// sessione, cioè un evento realtime consegnato a U sessioni × 2 canali. Il
// battito non portava informazione — diceva "sono ancora qui", che è
// esattamente ciò che un canale connesso dice da sé.
const canale = supabase.channel(`presenza:agenzia`, {
  config: { presence: { key: myId } },
});
canale
  .on('presence', { event: 'sync' }, () => setPresenceMap(daStatoCanale(canale.presenceState())))
  .subscribe(async (stato) => {
    if (stato !== 'SUBSCRIBED') return;
    await canale.track({ status: myBusyRef.current ? 'busy' : 'online', at: Date.now() });
  });
// Il toggle "Occupato" e il visibilitychange diventano un `track()` in più —
// un evento per CAMBIO, non uno ogni 30 secondi.
```

⚠️ **Cosa va deciso prima di scrivere la migrazione, non dopo.** `users.status`
e `users.last_seen_at` non servono solo al pallino: `computePresence`
(`chat/chatPresence.js`) considera «online» un `last_seen` di meno di un minuto,
e `AdminTeamTab` mostra «visto l'ultima volta». Con Presence il primo caso è
gratis (chi è nel canale è online, chi non c'è non lo è) ma il secondo **si
perde**, perché nessuno scrive più `last_seen_at`. Le due uscite sensate: (a)
tenere una `UPDATE` di `last_seen_at` a bassissima frequenza — una all'apertura
della sessione e una all'uscita, non una ogni 30 s — accettando una precisione
di «oggi» invece di «due minuti fa»; (b) rinunciare a «visto l'ultima volta» e
dirlo. **(a)**, perché in un gestionale sapere se un collega ha aperto l'app
oggi è un'informazione operativa, ma la scelta va scritta nel documento prima
di toccare `usePresence`, non dedotta a valle da cosa smette di funzionare.

**Passo intermedio, se il rifacimento non entra subito**: `filterEvent` è già
il posto giusto, sbagliato solo di lato. Portare il filtro sul **server** —
`.on('postgres_changes', { event: 'UPDATE', filter: '…' })` non basta per un
predicato su quali colonne sono cambiate, ma un trigger che non tocchi la riga
quando cambia il solo `last_seen_at`, oppure una tabella `user_presence`
separata **fuori** dalla publication, tolgono il traffico alla radice.
Unificare i due canali `users` in uno solo **dimezza** il costo senza cambiare
nient'altro: è mezz'ora di lavoro e vale il 50% della curva.

---

## A-4 · «Mai chiudere prima di conoscere l'esito» vale su 3 form su 9

**File**: sei call site, elencati sotto · **Priorità**: 🟠 Alta

### Il rilievo

`docs/CLAUDE.md:59` porta la regola in forma assoluta, in grassetto, con lo
stop: «**⛔ Mai chiudere o svuotare prima di conoscere l'esito**: *ogni*
salvataggio passa da `useSalvataggio(esegui, { alSuccesso })`». Il file
dell'hook (`hooks/useSalvataggio.js:1-25`) spiega perché esiste con parole che
descrivono in anticipo questo rilievo:

> «La differenza fra i due gruppi non era una decisione: era l'ordine in cui
> sono stati scritti, e quale file si era aperto per copiarne la forma. Finché
> la regola vive nei commenti di chi l'ha applicata, il prossimo form la
> riprodurrà o no per caso.»

L'hook è stato scritto per togliere il «per caso». È applicato a **tre** call
site — `QuickAddTask`, `ClienteModal`, `TaskSlideOver` — più due che fanno la
stessa cosa a mano e correttamente (`BulkTaskCreator`, `ProfileEditor`).

`verifica:convenzioni` controlla che il numero **3** scritto nel documento
corrisponda ai file che importano l'hook, e `src/test/salvaEChiudi.test.jsx`
fissa il comportamento di quei tre. Nessuno dei due chiede se **3 sia il numero
giusto**. Sono sei i form che scrivono attraverso `useSyncedDispatch` — che
ritorna `Promise<{ error }>` proprio perché il chiamante possa attenderla — e
non la attendono:

| File:riga | Azione | Cosa sparisce |
|---|---|---|
| `dashboard/NoticeBoard.jsx:337-350` | `ADD_NOTICE` / `UPDATE_NOTICE` | Il testo dell'avviso, i tag, il colore. La modale si chiude nello stesso turno |
| `admin/tabs/AdminTeamTab.jsx:101-102` | `UPDATE_TEAM_MEMBER` | **Il cambio di ruolo** — l'editor si richiude e mostra il valore ottimistico |
| `admin/tabs/AdminCategoriesTab.jsx:46-47` | `UPDATE_CATEGORY` | Etichetta, icona e colore in modifica |
| `admin/tabs/MessageTemplatesSection.jsx:81-83` | `ADD_/UPDATE_MESSAGE_TEMPLATE` | `cancel()` svuota `draftLabel` e `draftText` |
| `modals/AddCategoryModal.jsx:46-47` | `ADD_CATEGORY` | Nome, icona, colori della categoria nuova |
| `views/Trash.jsx:121-123` | `UPDATE_TASK` + `RESTORE_TASK` | Vedi **M-3**: due scritture dipendenti, forma diversa |

Tutti e sei validano correttamente con `validaCampi` + `FieldError` + focus sul
primo campo invalido. **La validazione è arrivata dappertutto, l'attesa
dell'esito no** — e sono due metà della stessa promessa: la prima dice
all'utente che cosa manca, la seconda che i dati sono ancora lì.

### Perché è Alta, e qual è il caso peggiore

Il database resta coerente: `useSyncedDispatch` fa rollback e il registry mostra
il toast col messaggio. Il danno è che l'utente ha perso ciò che aveva
scritto — che è il motivo per cui `useSalvataggio` mette il messaggio *inline*
e non in un toast: «il toast col messaggio del database lo mostra già il
registry — qui si dice l'unica cosa che il toast non dice, cioè che i dati sono
ancora lì». Con la modale chiusa quella frase non ha dove comparire, e il toast
resta a dire che qualcosa è andato storto su un form che non esiste più.

Il caso peggiore è **`AdminTeamTab.jsx:101`**, e non per il numero di
caratteri persi. `state/persistence.js:510-516` dice a cosa serve quell'azione:

> «Il cambio di ruolo — cioè il modo con cui un admin REVOCA i privilegi di un
> account compromesso o di chi cambia mansione».

L'editor in linea si chiude sul dispatch. Se la scrittura è rifiutata, l'admin
vede il ruolo nuovo (ottimistico), poi il rollback lo riporta indietro e un
toast passa. Su una card fra sette, in un pannello dove si stava facendo altro,
«il toast è passato» e «il declassamento non c'è stato» sono lo stesso
fotogramma. Il rilievo M-5 del 13 agosto ha già irrobustito il *guard* di
quell'azione; questo è l'altro lato — che l'esito sia **visto**.

### La soluzione

L'hook esiste, ha il contratto giusto e i test. Ogni call site è un innesto di
poche righe. `NoticeBoard.jsx`, come modello per gli altri cinque:

```jsx
// A-4 · L'esito PRIMA della chiusura. Era `dispatch(...)` senza await seguito
// da `setCreating(false); setEditing(null)` nello stesso turno: su una
// scrittura rifiutata (RLS — canEditNotice nega ai non-autori — o rete che
// cade) l'avviso appariva, spariva, e il testo digitato non esisteva più. È
// lo stesso difetto che M-1 del 16 agosto ha chiuso in ClientiView.handleSave.
const salvataggio = useSalvataggio(
  (data) => (editing
    ? dispatch({ type: "UPDATE_NOTICE", payload: { id: editing.id, ...data } })
    : dispatch({ type: "ADD_NOTICE", payload: {
        id: crypto.randomUUID(), ...data, author: currentUserId,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      } })),
  { alSuccesso: () => { setCreating(false); setEditing(null); },
    messaggioErrore: "Avviso non salvato. Il testo è ancora qui, riprova." },
);

{(creating || editing) && (
  <NoticeEditorModal
    notice={editing}
    onClose={() => { setCreating(false); setEditing(null); }}
    onSave={salvataggio.salva}
    inVolo={salvataggio.inVolo}
    errore={salvataggio.errore}
  />
)}
```

`NoticeEditorModal` accoglie le due prop nuove come già fa `ClienteModal`:
il pulsante mostra «Salvataggio…» ed è `disabled` mentre `inVolo`, e `errore`
compare accanto ai campi in un `FieldError` — che il file **importa già**.

> Nota di dettaglio: `id: "n" + Date.now()` a `:340` non è un difetto —
> `persistence.js:270` normalizza gli id non-UUID con `newId()` e il reducer
> riceve l'azione normalizzata. Ma `crypto.randomUUID()` al call site, come fa
> `ClientiView:200`, toglie di mezzo la domanda.

Gli altri cinque sono la stessa forma: `saveEdit`/`save`/`submit` diventano
l'argomento `esegui`, e `cancelEdit()`/`cancel()`/`onClose()` diventano
`alSuccesso`.

### Che questo rilievo non si riapra

`verifica:convenzioni` tiene onesto il **numero**, e va aggiornato a 9 con la
correzione. Ma il numero da solo non avrebbe intercettato *questo* rilievo:
3 era corretto quando è stato scritto. Il controllo che chiude la categoria è
l'altro — quello che `montaggiLazySenzaRete` fa per i `lazy()` senza boundary:
non «quanti sono», ma **«ce n'è uno che non lo fa»**. La forma esiste già in
`scripts/verifica-convenzioni/convenzioni.js`; qui il predicato sarebbe «un file
che dispatcha un'azione del registry `PERSISTENCE` e chiama un setter di
chiusura nello stesso blocco, senza `await` né `useSalvataggio`». È lo stesso
salto che `no-restricted-imports` ha fatto per il bundle: dal contare al negare.

---

## M-1 · `clients` è l'unica entità rimasta senza finestra

**File**: `src/lib/api.js:862-864`, `src/hooks/useAppHydration.js:475-490`
· **Priorità**: 🟡 Media

A-3 dell'audit del 16 agosto ha messo una finestra sui task, con la
motivazione scritta in `useAppHydration.js:43-52`:

> «È corretto (nessun troncamento silenzioso, C-1) ed è esattamente il tipo di
> correttezza che peggiora da sola: la quota di quel payload che serve alle
> viste d'ingresso cala man mano che l'agenzia usa il gestionale, cioè il tempo
> di avvio cresce con l'anzianità dell'installazione.»

La frase descrive `clients` parola per parola. L'idratazione chiama
`ClientsAPI.list()` (`:476`), che è `fetchAllRows` **senza filtro**: l'anagrafica
intera, a ogni avvio a freddo e a ogni ripresa dopo un buco di connessione, in
memoria per tutta la sessione. 818 righe oggi, alimentate «a blocchi via
`ClientImportModal`, non una riga alla volta» — è il commento di
`api.js:840-846`, e descrive una crescita a scalini, non lineare.

Si somma un secondo fattore, indipendente e verificato sulle migrazioni:
**`public.clients` non ha alcun indice oltre la primary key**
(`20260608115454_fase1_clients_suppliers_dossiers.sql:3-13`), mentre la query è
`.select('*', { count: 'exact' }).order('name').order('id').range(…)`. Ogni
pagina è quindi un ordinamento completo della tabella **più** un `count(*)`
esatto con RLS applicata. A 818 righe è una pagina sola e non si misura; a 20 000
sono venti round-trip **seriali**, ciascuno con il proprio sort e il proprio
count.

Le altre entità non hanno il problema per ragioni diverse e tutte già
argomentate: `notices`, `categories`, `message_templates` e `users` sono
piccole e limitate dal dominio; i task hanno la finestra; `messages` ha un tetto
dichiarato (`fetchRowsUpTo`, 2000). `clients` è l'unica a crescere senza tetto e
a essere letta intera.

**La soluzione**, nell'ordine in cui conviene farla:

1. **L'indice, subito** — una riga di migrazione, nessun rischio, e serve
   comunque a qualunque forma prenda il punto 2:
   ```sql
   -- M-1 (audit del 19 agosto). Clients.list() ordina per (name, id) e pagina
   -- con .range(): senza indice ogni pagina è un sort completo della tabella.
   -- La seconda colonna è quella dello spareggio di fetchAllRows — l'indice
   -- deve avere le stesse due, nello stesso ordine, o la paginazione continua
   -- a ordinare a mano.
   create index if not exists idx_clients_name_id on public.clients (name, id);
   ```
2. **La finestra** — ma la forma va scelta guardando i lettori, non copiata da
   A-3. I task avevano un criterio temporale naturale («completate da meno di
   60 giorni»); un cliente non «scade». I due lettori che vogliono davvero
   l'anagrafica intera sono la vista Clienti (che ha già `useFinestra`, quindi
   ne disegna 24) e l'autocomplete cliente sui task. Per entrambi la risposta è
   la stessa e non è una finestra: è una **ricerca lato server** (`ilike` +
   `limit`), con in memoria solo i clienti effettivamente referenziati dai task
   caricati. È il lavoro più grande di questo audit e l'unico che cambia un
   contratto del data layer — motivo per cui resta Media e non Alta: **oggi non
   costa nulla**, e il momento per farlo è quando l'indice del punto 1 c'è già.

---

## M-2 · La lista messaggi: O(n²), niente `memo`, niente finestra

**File**: `src/components/chat/ConversationView.jsx:398-423`,
`src/components/chat/message/ChatMessage.jsx` · **Priorità**: 🟡 Media

Tre difetti che si moltiplicano fra loro, tutti nello stesso blocco.

**1. Un `indexOf` dentro la `map`** (`:409-410`):

```jsx
return visible.map((m) => {
  const i = msgs.indexOf(m);        // ⛔ scansione lineare, per ogni messaggio
```

`msgs.indexOf` scandisce l'array completo per ogni riga disegnata: O(n²) per
render. Serve per `prevMsg={msgs[i - 1]}` — l'indice nella timeline **intera**,
perché `visible` è filtrato — quindi il bisogno è reale e la forma no.

**2. `ChatMessage` non è `memo`**, e i suoi callback nascono nuovi a ogni
render: `onReply={(m) => cvd({ type: "REPLYING", v: m })}` è un'arrow inline
(`:418`), e `handleReact`/`handleTogglePin` non sono `useCallback` — il file non
importa affatto `useCallback`. È l'unico componente di riga di un elenco lungo
senza `memo`: `TaskRow` e `TaskCard` ce l'hanno.

**3. È l'unico elenco lungo senza `useFinestra`.** `hooks/useFinestra.js:1-18`
dichiara la convenzione e i nove call site che la applicano; la lista messaggi
non è fra loro. Il tetto è `Messages.listAll(2000)`, che è un tetto **su tutte
le conversazioni**, non su quella aperta.

⚠️ `docs/CLAUDE.md` dice «ci passano **tutte e nove**» ed è letteralmente vero
— sono nove le **viste** con elenchi lunghi, e la conversazione aperta non è
una vista. Non c'è quindi una frase da correggere nel documento (la regola di
`INDEX.md` sul disaccordo fra `CLAUDE.md` e il codice non si applica): c'è un
elenco lungo che l'enumerazione non nomina, ed è la ragione per cui una regola
espressa come lista di call site smette di coprire prima di diventare falsa —
lo stesso punto del suggerimento strategico n. 3.

**Ciò che rende i tre un rilievo e non tre note**: questo albero si
ri-renderizza **su un timer**, non solo quando l'utente agisce. Mentre un
collega scrive, un evento broadcast arriva ogni `TYPING_PING_MS` = **2,5
secondi** (`lib/typingUtils.js:16`) e passa da `commitTypingMap` →
`SET_TYPING_MAP` → render dell'intera `ConversationView`; `useTickLento`
(`:40`) ne aggiunge uno ogni 30 s per far invecchiare i pallini di presenza. Su
una conversazione da 500 messaggi sono 500 `ChatMessage` — avatar, forme d'onda,
reazioni — ricostruiti ogni 2,5 secondi, più 125 000 confronti di `indexOf`,
mentre l'utente guarda tre puntini che lampeggiano.

Oggi `messages` è a 13 righe: nessuno lo vede. È il rilievo con il rapporto
costo/beneficio migliore del documento, perché la correzione è di venti righe.

```jsx
// M-2 · L'indice nella timeline intera si calcola UNA volta, non per riga.
// `visible` è un sottoinsieme filtrato di `msgs`, e prevMsg deve venire dalla
// timeline completa: la coppia (messaggio, indice) si porta dietro dal punto
// in cui esiste già, invece di ricercarla con indexOf dentro la map.
const finestra = useFinestra(msgs, 50, [conv.id, msgSearch, showPinnedOnly]);
const visibili = useMemo(() => {
  const q = msgSearch.toLowerCase();
  return finestra.visibili
    .map((m, i) => ({ m, prev: finestra.visibili[i - 1] }))
    .filter(({ m }) => {
      if (showPinnedOnly && !m.pinned) return false;
      if (msgSearch && !m.text?.toLowerCase().includes(q)) return false;
      return true;
    });
}, [finestra.visibili, msgSearch, showPinnedOnly]);

// I callback stabili sono la PREMESSA del memo su ChatMessage: senza, la riga
// si ri-renderizza comunque a ogni tick di typing e il memo non toglie niente.
const rispondiA = useCallback((m) => cvd({ type: "REPLYING", v: m }), []);
```

…e `ChatMessage` diventa `export const ChatMessage = memo(function ChatMessage({…}) {…})`.

⚠️ Sulla finestra c'è una decisione da prendere, non un default: una chat si
legge **dal fondo**, quindi la finestra va sugli ultimi N e il «mostra altri»
risale, all'opposto delle sette viste esistenti — dove `useFinestra` taglia in
coda. `useFinestra` va bene così com'è se le si passa `msgs` già invertito, ma
la scelta va scritta accanto al call site, altrimenti il prossimo che legge
`useFinestra.js` trova una convenzione che qui è applicata al contrario senza
capire perché. E `scrollRef` va ancorato dopo il primo render della finestra,
altrimenti la conversazione si apre a metà.

---

## M-3 · Il ripristino dal Cestino: due scritture dipendenti, nessuna attesa

**File**: `src/components/views/Trash.jsx:108-124` · **Priorità**: 🟡 Media

Voce separata da A-4 perché il difetto ha una forma diversa: non è solo «chiude
troppo presto», è **una sequenza che non è una sequenza**.

```js
const { deletedAt, ...updates } = restoring;
dispatch({ type: "UPDATE_TASK",   payload: updates });      // le modifiche
dispatch({ type: "RESTORE_TASK",  payload: restoring.id }); // il ripristino
setRestoring(null);                                          // la modale se ne va
```

La funzionalità è «ripristina **modificando prima**» (è in `README.md` fra le
feature: «Cestino — soft-delete con ripristino + modifica prima del
ripristino»), quindi le due scritture non sono indipendenti: la seconda ha senso
solo se la prima è passata. Sono partite entrambe senza attesa, e l'unica cosa
garantita è l'**ordine di invio**, non quello di esito.

Il caso che fa danno non è raro né esotico: `UPDATE_TASK` ha un guard di
permesso (`canEditTask`) e passa dalla RLS; `RESTORE_TASK` ha i propri.
Se la prima è rifiutata e la seconda passa — è lo scenario di C-1 del secondo
passaggio del 14 agosto, dove una `UPDATE` filtrata dalla RLS ritorna zero
righe — **la task torna dal cestino con i valori vecchi**, le otto caselle
appena compilate non sono da nessuna parte, e la modale si è già chiusa. Il
rollback rimette a posto il database; il toast dice che qualcosa è fallito; a
schermo c'è una task ripristinata che sembra a posto. Non è una perdita di
dati nel database — è peggio da diagnosticare, perché ha l'aspetto della
riuscita.

La correzione è `useSalvataggio` con le due scritture **in sequenza dentro
`esegui`**, che è il caso per cui l'hook ritorna una promise:

```js
// M-3 · Le due scritture sono DIPENDENTI: il ripristino ha senso solo se le
// modifiche sono passate. In sequenza dentro `esegui`, e la modale resta
// aperta con gli otto campi compilati se la prima non passa.
const ripristino = useSalvataggio(
  async () => {
    const { deletedAt, ...updates } = restoring;
    const r = await dispatch({ type: "UPDATE_TASK", payload: updates });
    if (r?.error) return r;
    return dispatch({ type: "RESTORE_TASK", payload: restoring.id });
  },
  { alSuccesso: () => setRestoring(null),
    messaggioErrore: "Ripristino non riuscito. Le modifiche sono ancora qui, riprova." },
);
```

---

## B-1 · Undici canali realtime sempre aperti per sessione

**File**: `src/hooks/useAppHydration.js`, `src/hooks/usePresence.js:109`,
`src/hooks/useChatData.js:132`, `src/hooks/useNotifications.js:42`
· **Priorità**: 🔵 Bassa

`useDebouncedTableSubscription` apre **un canale per tabella**
(`:172`: `list.map((tbl) => subscribeToTable(tbl, …))`). A regime, dal mount
dell'app e per tutta la sessione:

`tasks`, `comments`, `notices`, `categories`, `users` (idratazione), `clients`,
`message_templates`, `conversations`, `messages`, `notifications`, `users`
(presenza) = **11**. Più `liste_viaggio`, `movimenti_lista`,
`lista_beneficiari` col modulo Liste aperto, `task_history` col pannello
cronologia, e uno di typing per conversazione aperta: **fino a 16**.

Tre osservazioni, in ordine di rendimento:

- **`users` è sottoscritta due volte** dalla stessa sessione. È il
  moltiplicatore ×2 di A-3, e unificare i due canali è la mezz'ora di lavoro
  che ne dimezza la curva. La ragione del topic univoco
  (`api.js:956-964`) è un crash di supabase-js su due `.on()` dopo
  `subscribe()`, non un vincolo sul numero di subscriber: un canale solo con
  due handler risolve entrambi.
- **`categories` e `message_templates`** hanno un canale dedicato ciascuno per
  tabelle rispettivamente da ~10 e 4 righe, che cambiano quando un admin apre
  il pannello — poche volte l'anno. Un `visibilitychange` che rilegge le due
  tabelle al ritorno in primo piano coprirebbe lo stesso bisogno con zero
  canali permanenti (la soglia dei 30 s per la ripresa esiste già, M-3 del 12
  agosto).
- Il resto è giustificato: sono le tabelle su cui il realtime **è** la feature.

Bassa perché a sette utenti non si misura, e perché il rendimento vero sta in
A-3 — questo è il contorno di quel rilievo, non un secondo problema.

---

## B-2 · L'ultimo form fuori dalle due convenzioni di validazione

**File**: `src/components/modals/AddTeamMemberModal.jsx:43-49`
· **Priorità**: 🔵 Bassa

Il progetto ha due convenzioni per la validazione, entrambe scritte e
verificate: `validaCampi` + `REGOLE` (`lib/validators.js`, 13 call site) per la
regola, e `FieldError` (`ui/FieldError.jsx`, 14 call site) per dirla —
`role="alert"` perché venga annunciata quando compare, `aria-invalid` +
`aria-describedby` sul controllo perché sia associata al campo, e il focus
riportato sul primo campo invalido.

`AddTeamMemberModal` è fuori da entrambe:

```js
if (!name.trim()) { setErr("Il nome è obbligatorio."); return; }
…
if (trimmedEmail && !isValidEmail(trimmedEmail)) { setErr("Email non valida."); return; }
```

`err` finisce in un `div` con lo stile `boxF125Danger` (`:25`): rosso, visibile,
e per il resto muto — nessun `role="alert"`, quindi uno screen reader non lo
annuncia; nessun `aria-describedby`, quindi non è associato al campo che
descrive; nessun focus riportato, quindi su mobile il messaggio può comparire
sopra la piega mentre la tastiera copre metà schermo; e `err` è **uno slot
solo** per due campi, quindi un nome vuoto *e* una mail sbagliata mostrano un
problema per volta.

È lo stesso difetto che M-3 del 16 agosto ha chiuso in
`MessageTemplatesSection` («Due campi obbligatori e nessuno dei due indicato —
l'utente doveva indovinare quale mancasse»), rimasto qui.

La correzione è meccanica — `REGOLE_MEMBRO` esiste già a due file di distanza
(`AdminTeamTab.jsx:31`) e il pattern con `primoCampoInvalido` + `focus()` è in
`MessageTemplatesSection.jsx:69-80`:

```js
const REGOLE = {
  name:  obbligatorio("Il nome del membro è obbligatorio."),
  email: (v) => (v && !isValidEmail(v) ? "Email non valida." : null),
};
const ORDINE = ["name", "email"];
// …
const trovati = validaCampi({ name, email: email.trim() }, REGOLE);
const primo = primoCampoInvalido(trovati, ORDINE);
if (primo) { setErrori(trovati); (primo === "name" ? rifNome : rifEmail).current?.focus(); return; }
```

Bassa: è un pannello di amministrazione usato di rado, e l'errore comunque si
vede. Ma è l'ultimo call site di due convenzioni che altrove sono complete, e
chiuderlo costa venti righe — è il rilievo che si chiude mentre si aspetta la
review di un altro.

---

# Top 3 suggerimenti strategici

### 1. Togliere la presenza dal database — la sola curva quadratica dell'app

*(chiude A-3, dimezza B-1)*

È l'unico rilievo del documento che non riguarda quanto è veloce l'app, ma
**fino a quanti utenti esiste**. Ogni altro costo qui dentro cresce con i dati —
task, clienti, messaggi — e i dati crescono con l'uso, cioè con il valore che
l'app produce. Questo cresce col **quadrato dei colleghi collegati**, e produce
zero: un battito ogni 30 secondi che dice «sono ancora qui» a un canale che è
già connesso.

Il progetto ha già fatto la scelta giusta una volta, per l'indicatore «sta
scrivendo»: `subscribeToTyping` è broadcast, «non tocca il DB: gli eventi vivono
solo finché i client sono connessi». La presenza ha la stessa natura e la stessa
risposta. La differenza pratica: da `U²/15` messaggi al secondo a un evento per
**cambio di stato reale**.

Va fatto adesso e non quando si vedrà, per la ragione che l'audit del 17 agosto
ha già scritto a proposito della finestra sui task: «oggi questa correzione non
fa quasi nulla, ed è il momento giusto per farla». A venticinque utenti sarebbe
un'urgenza, e un'urgenza è il momento peggiore per decidere cosa fare di
`last_seen_at`.

### 2. Portare il budget del bundle sul percorso che l'app percorre davvero

*(chiude A-1)*

`verifica:bundle` è il pezzo di infrastruttura meglio motivato del repository:
nasce da un guasto ripetuto **tre volte** — P2-1, P2-2, P2-3, lo stesso difetto
con tre nomi — e il suo commento in testa spiega perché un import così «passa la
review: è codice ragionevole, il costo è nel grafo dei chunk, non nella riga».

Poi B-1 ha reso l'app un chunk dinamico, e il controllo ha smesso di guardare
dove l'app è finita. Non è diventato rosso: **ha continuato a stampare OK**,
che è la forma in cui un controllo smette di controllare senza che nessuno se
ne accorga — la stessa cosa che il file dice delle soglie troppo larghe. L'ho
verificato riaprendo la regressione: 14,47 kB gzip rientrati nel percorso caldo,
`verifica:bundle: OK`.

Sono ~40 righe di script e nessun codice applicativo. Il valore non è i 60,93
kB: è che il presidio contro la categoria di guasto che questo progetto ha già
pagato quattro volte torni a coprire il percorso che ogni sessione attraversa.

### 3. Dal contare i call site al negare quelli mancanti

*(chiude la categoria di A-2, A-4, M-2 e B-2 — cioè quattro dei nove rilievi)*

Quattro rilievi di questo audit sono **lo stesso rilievo**: una regola giusta,
con un file suo e un commento che la spiega, applicata a una parte dei call
site. L'indice di ricerca su 3 su 4. `useSalvataggio` su 3 su 9. `memo` sulla
riga di elenco su 2 su 3. `validaCampi` + `FieldError` su 13 su 14.

E non è la prima volta: A-1, M-2 e M-3 del 16 agosto avevano esattamente questa
forma, e il documento di allora lo aveva già notato. Il progetto se ne accorge
ogni volta **dopo**, con un audit — che è un ottimo modo di trovarli e un modo
costoso di non averli.

Lo strumento per chiuderla esiste già, ed è la differenza fra i due controlli
che `verifica:convenzioni` esegue oggi:

- `usiSalvataggio` **conta** i file che importano l'hook e li confronta con un
  numero scritto in `docs/CLAUDE.md`. Tiene onesto il numero. Non ha
  intercettato A-4, e non poteva: 3 era corretto quando è stato scritto.
- `montaggiLazySenzaRete` **nega**: cerca un `lazy()` che non abbia un boundary,
  e fallisce se ne trova uno. Non ha bisogno di sapere quanti dovrebbero
  essercene.

Il secondo tipo è quello che chiude una categoria; il primo la documenta. Tre
predicati nuovi, sulla forma di quello che c'è già:

1. un file che dispatcha un'azione del registry `PERSISTENCE` **e** chiama un
   setter di chiusura nello stesso blocco, senza `await` né `useSalvataggio`;
2. un `filter` su un array dentro un `useMemo` che ha una query testuale nelle
   dipendenze **e** chiama `matchTermini` invece di `matchIndice`;
3. un componente passato come figlio di una `.map()` su un array di dominio che
   non sia `memo`.

Il terzo ha dei falsi positivi e va calibrato. I primi due no: sono
riconoscibili sul sorgente quanto un `lazy()` senza boundary. È il salto che
`no-restricted-imports` ha già fatto per il bundle — dal ricordarsi al non
poter più sbagliare — applicato alle tre convenzioni che questo audit ha trovato
a metà strada.

---

## Verifica di questo documento

Comandi eseguiti sul repository a `36a5d8a`, prima e dopo:

```
npm ci && npm run build          # 298 moduli, 4,73 s
npm test                         # 1488 passati, 8 saltati (125 file)
npm run lint                     # pulito
npm run verifica:bundle          # OK — 14,47 / 114,41 kB gzip
```

Il benchmark di A-2 (`bench.mjs`, corpus sintetico sulla funzione reale di
`lib/searchUtils.js`) e l'esperimento di regressione di A-1 (`ChatPanel` da
`lazy()` a import statico, build, `verifica:bundle`) sono stati eseguiti su
copie temporanee e **il repository è stato riportato allo stato iniziale**:
`git diff` vuoto prima di scrivere questo documento.


---

# §2 · Chiusura dei quattro rilievi Alta — 19 agosto

Chiusi lo stesso giorno, su richiesta esplicita: **A-1, A-2, A-3 e A-4**. Con
A-4 si chiude anche **M-3**, che non era un quinto intervento ma la stessa
modifica: il ripristino del Cestino è uno dei sei call site di A-4, e metterlo
in sequenza dentro `useSalvataggio` *è* la correzione che M-3 chiedeva.

Restano aperti **M-1, M-2, B-1 e B-2**. B-1 esce dimezzato senza essere stato
toccato: il suo fattore ×2 era la doppia sottoscrizione a `users`, e A-3 ne ha
tolta una.

| | prima | dopo |
|---|---|---|
| Test | 1488 | **1518** (+30) |
| Lint | 0 | 0 |
| `verifica:convenzioni` | 27 controlli | 27, nessuna divergenza |
| Chunk d'ingresso | 14,47 kB gzip | 14,59 (soglia 21) |
| First load anonimo | 114,41 | 114,53 (soglia 121) |
| **Chunk dell'app** | 60,93, **senza soglia** | 61,30 (**soglia 67**) |
| **First load autenticato** | 175,34, **senza soglia** | 175,83 (**soglia 182**) |

## A-1 ✔ — il budget misura anche il percorso di tutti i giorni

`vite.config.js` accende `build.manifest: true`;
`scripts/verifica-bundle/index.js` legge il grafo dichiarato dal build
(`imports` statici e `dynamicImports` dell'entry, un livello) e aggiunge due
soglie: **chunk dell'app 67 kB** e **first load autenticato 182 kB**, misurate
sul build e con lo stesso margine +6 kB delle altre due.

**La verifica che conta non è che le soglie passino — è che la regressione ora
fallisca.** Riaperto a mano ST-12 (`ChatPanel` da `lazy()` a import statico in
`VoyageDeskInner.jsx`):

```
  chunk dell'app: 75.56 kB gzip (soglia 67 kB)
  totale autenticato: 190.09 kB gzip (soglia 182 kB)

verifica:bundle: chunk dell'app 75.56 kB > soglia 67 kB.
verifica:bundle: first load autenticato 190.09 kB > soglia 182 kB.
```

Exit code **1** (prima: `OK`, exit 0). Il messaggio di rimedio distingue ora i
due casi: se ha sforato l'anonimo si guarda `dist/index.html`, se ha sforato
l'autenticato il modulo rientrato non compare lì e la traccia è il chunk lazy
sparito dall'elenco che `vite build` stampa in console.

Il branch di prova è stato ripristinato: `git diff` vuoto su
`VoyageDeskInner.jsx`.

## A-2 ✔ — l'indice anche nell'ultimo call site

`AdvancedSearchPanel` costruisce ora **due** indici — `indiceTask` su `[tasks]`
e `indiceListe` su `[liste]` — e filtra con `matchIndice`. L'import di
`matchTermini` è sparito dal file.

⚠️ **`indiceListe` non riusa `indicizzaLista`** del modulo Liste, ed è
deliberato: là i campi sono tre, qui quattro — c'è anche `note`, perché la
ricerca globale è il punto in cui si cerca dentro tutto. Riusare l'altra
funzione avrebbe *ristretto* questa ricerca, ed esportarne una variante dal
modulo Liste violerebbe il confine (il core parla al modulo solo da
`listeModuleApi.js`). La primitiva condivisa è `indicizza`, non l'indice
composto — e la regola è ora scritta in `docs/CLAUDE.md`, dove mancava.

Guardia: cinque casi comportamentali in `ricercaGlobale.test.jsx` (commento,
apostrofi + ordine invertito, numero di pratica, termini tutti obbligatori,
filtri strutturali) più due di forma, con il controllo positivo che pretende
i due `useMemo`. I casi comportamentali sono la parte che conta: il rilievo era
di costo, quindi il rischio della correzione è tutto nel perdere un campo.

## A-3 ✔ — la presenza esce dal database

- `lib/presenza.js` (nuovo): `computePresence`, `PRESENCE_COLORS/LABELS`,
  `TICK_PRESENZA_MS`, `REFRESH_PRESENZA_MS` e `daStatoCanale`. È
  `chat/chatPresence.js` salito in `lib/` — non per ordine, ma perché i lettori
  sono diventati due.
- `lib/api.js`: `subscribeToPresence({ key, payload, onSync })`, gemello di
  `subscribeToTyping`, con la stessa degradazione a client non utilizzabile.
- `hooks/usePresence.js`: niente più `setInterval(() => beat())` e niente più
  `subscribeToTable("users")`. Restano **tre** `setPresence` per sessione —
  avvio, toggle «Occupato», chiusura — e ognuna ha una ragione che il canale
  non copre.
- `admin/tabs/AdminTeamTab.jsx`: il pallino passa da `computePresence` e la tab
  arma `useTickLento`.

**La decisione dichiarata nel rilievo, presa:** è l'opzione (a). `last_seen_at`
resta, con precisione «ha aperto l'app» invece di «due minuti fa» — in
un'agenzia sapere se un collega ha aperto il gestionale oggi è
un'informazione operativa, e buttarla via per un'ottimizzazione sarebbe stato
scambiare un costo per una feature.

⚠️ **Una conseguenza che il rilievo non aveva previsto, emersa
implementando**: `AdminTeamTab` leggeva `m.status` grezzo, quindi con le
scritture diradate avrebbe mostrato «Online» per chi ha chiuso il browser
stamattina. Passandolo a `computePresence` la card diventa **più** onesta di
prima, non meno: fin qui l'unico modo di accorgersi che un «Online» era vecchio
era leggere il «3h fa» scritto accanto. È anche il motivo per cui il file è
salito in `lib/`.

Il traffico che resta, con U sessioni: gli eventi di presenza non passano più
da `postgres_changes` (nessun WAL, nessuna RLS per riga, nessun payload
`REPLICA IDENTITY FULL`), e le scritture su `users` passano da ~960 per
sessione di otto ore a **tre**.

Guardia: `presenzaCanale.test.jsx`, 10 casi. Il metodo è quello che il rilievo
richiedeva — un difetto di costo non si vede da nessuna schermata, quindi i
casi sono in NEGATIVO («dieci minuti aperti = una scrittura sola», «nessun
secondo canale su `users`», «`visibilitychange` non scrive») e **ognuno ha
accanto il proprio controllo positivo**, altrimenti passerebbero tutti con
l'hook spento. Aggiornato anche il controllo positivo di B-6 in
`tickLento.test.jsx`: pretendeva `setInterval(() => beat())`, cioè il difetto
appena chiuso — ora pretende `setInterval(… .track())` e in più nega la
scrittura dentro l'intervallo.

## A-4 ✔ — nove call site su nove (e M-3 con loro)

`useSalvataggio` applicato ai sei che restavano fuori:

| File | Azione | Cosa non si perde più |
|---|---|---|
| `modals/NoticeEditorModal.jsx` | `ADD_/UPDATE_NOTICE` | testo, tag, colore |
| `admin/tabs/AdminTeamTab.jsx` | `UPDATE_TEAM_MEMBER` | **il cambio di ruolo** |
| `admin/tabs/AdminCategoriesTab.jsx` | `UPDATE_CATEGORY` | etichetta, icona, colori |
| `admin/tabs/MessageTemplatesSection.jsx` | `ADD_/UPDATE_MESSAGE_TEMPLATE` | etichetta e testo |
| `modals/AddCategoryModal.jsx` | `ADD_CATEGORY` | nome, icona, colori |
| `views/Trash.jsx` | `UPDATE_TASK` → `RESTORE_TASK` | le otto caselle (e vedi M-3) |

`NoticeBoard.jsx` non chiude più: ritorna la promise del dispatch, e chi chiude
è la modale — che è anche l'unica a sapere se ha ancora dati da proteggere. Ne
è uscito anche `id: "n" + Date.now()` → `crypto.randomUUID()`: il registry
normalizzava comunque, ma generarlo nella forma giusta toglie la domanda.

**M-3 ✔ con lo stesso commit**: le due scritture del ripristino sono ora in
sequenza dentro `esegui`, con la seconda subordinata all'esito della prima. Il
test lo verifica in entrambe le direzioni — con l'`UPDATE_TASK` rifiutata il
`RESTORE_TASK` **non parte** e la modale resta compilata; con entrambe accettate
partono nell'ordine e la modale si chiude.

Guardia: `salvaEChiudiSeiForm.test.jsx`, 11 casi, con il metodo del file
gemello — ogni caso guarda **due** cose insieme, che il pannello non si sia
chiuso *e* che i valori digitati siano ancora nel DOM. Un test che si
accontentasse del messaggio passerebbe anche su una modale che si chiude subito
dopo averlo mostrato, che è il difetto.

⚠️ **Che i call site siano 9 e non 3 non chiude la CATEGORIA.**
`verifica:convenzioni` li CONTA, e 3 era corretto quando è stato scritto: quel
controllo non avrebbe intercettato A-4 e non poteva. Il controllo che negherebbe
quelli mancanti — sulla forma di `montaggiLazySenzaRete` — resta il
**suggerimento strategico n. 3**, non fatto qui perché è un intervento sullo
strumento di verifica e non su uno dei quattro rilievi chiesti.


---

# §3 · Suggerimento strategico n. 3, e M-2 — 19 agosto

Il suggerimento e il rilievo sono chiusi **insieme**, e non per comodità: il
terzo predicato del suggerimento è quello che intercetta M-2, quindi
agganciarlo prima della correzione avrebbe voluto dire mettere in CI un
controllo rosso — cioè la cosa che questo progetto chiama «un warning con un
arretrato aperto», rumore che si impara a saltare.

## Il suggerimento — tre controlli che NEGANO

`verifica:convenzioni` passa da 27 a **30 controlli**. I tre nuovi hanno atteso
**0** e non un numero letto da un documento:

| Controllo | Forma cercata |
|---|---|
| form che scrivono senza attendere l'esito | importa `validaCampi` **e** dispatcha un'azione del registry **e** non ha né `useSalvataggio` né `await dispatch(` |
| ricerche che normalizzano a ogni battuta | `matchTermini` dentro un `useMemo` |
| `indexOf`/`findIndex` dentro una `.map()` | la forma O(n²) di M-2 |

**Perché non bastavano quelli che c'erano.** `usiSalvataggio` conta i call site
e li confronta con `docs/CLAUDE.md`. Non ha intercettato A-4, e **non poteva**:
«3 call site usano `useSalvataggio`» era vero quando è stato scritto — il
difetto era che i form fossero nove. Un controllo che conta scade quando l'app
cresce; uno che nega no. `montaggiLazySenzaRete` lo faceva già ed è il modello.

**Verificati contro il codice di prima**, che è l'unica prova che valga: fatti
girare su `6b50e55` (il commit dell'audit, prima delle correzioni) trovano

```
form senza attesa esito : AdminCategoriesTab, AdminTeamTab,
                          MessageTemplatesSection, AddCategoryModal, Trash
ricerche senza indice   : AdvancedSearchPanel
iterazioni quadratiche  : ConversationView
```

cioè **5 form su 6**, la ricerca di A-2 e l'iterazione di M-2. Un controllo che
non trova il difetto che esiste per trovare non controlla niente.

⚠️ **Il sesto form non lo trova, e va detto.** `NoticeBoard` dispatchava ma non
importa `validaCampi` (la validazione è nella modale), e `NoticeEditorModal`
valida ma non dispatcha — chiama `onSave`. Il predicato guarda un file per
volta, e quel difetto era distribuito su due. È il limite dichiarato di questi
controlli: verificano una FORMA leggibile dal sorgente, non un comportamento
che dipende da tre file. Il comportamento lo fissano i test.

⚠️ **E il predicato dei form è «valida E scrive», non «scrive».** Una
`DELETE_CLIENT` dietro una conferma, dispatchata e seguita da `chiudiOverlay()`,
**non** è il difetto: non c'è niente di digitato da perdere, e l'ottimistico con
rollback e toast è il pattern giusto per quel caso. Restringere a chi ha un
form è ciò che separa i sei call site del rilievo dai molti che vanno bene così
— e c'è un caso di test apposta.

Ognuno dei tre **solleva** se non trova il proprio presupposto (nessun file che
validi, nessuno che usi `matchIndice`, un registry vuoto): «zero ricerche senza
indice» e «zero ricerche» sono la stessa cifra e due affermazioni diverse.

**Cosa NON è stato fatto, e perché.** Il quarto predicato ipotizzato dal
suggerimento — «un componente figlio di una `.map()` che non sia `memo`» — è
stato provato e **scartato**: nella variante praticabile (per convenzione di
nome: `*Row`, `*Card`, `*Item`, `*Chip`, `*Pill`) sarebbe partito con **10
segnalazioni su 12**, e nove sono legittime — un chip di categoria e un
`ToastItem` non hanno niente da memoizzare. Un controllo che nasce rosso su
casi corretti è la premessa della lista di eccezioni che cresce, cioè del
controllo che smette di controllare. Al suo posto c'è il terzo predicato,
stretto sulla forma esatta di M-2.

## M-2 ✔ — la lista messaggi

Tre difetti che si moltiplicavano, corretti insieme perché lo erano:

1. **`msgs.indexOf(m)` dentro la `.map()`** → la coppia `(messaggio,
   precedente)` si costruisce una volta sola in un `useMemo` su `[msgs]`, dove
   l'indice ce l'ha già la callback.
2. **`ChatMessage` non era `memo`** → ora lo è, e le sue tre callback hanno
   identità stabile (`useCallback` con `msgs`/`commands` in un ref, la stessa
   tecnica di `useSyncedDispatch`). ⚠️ Le due metà sono arrivate **insieme**:
   con una sola si aggiunge un confronto che non può mai riuscire.
3. **Nessuna finestra** → `useFinestra` con `PAGINA_MESSAGGI = 50`.

⚠️ **La finestra apre in CODA**, all'opposto delle altre nove viste. Non è
un'eccezione alla convenzione ma la stessa convenzione su un elenco che si
legge dall'ultima riga: si passa l'array rovesciato e si rimette in ordine ciò
che torna, così la meccanica resta una sola.

⚠️ **Il filtro viene prima della finestra**, e questa è la parte che si sarebbe
sbagliata volentieri: finestrare e poi filtrare farebbe rispondere «non c'è» a
una ricerca dentro la conversazione su un messaggio che esiste ma è più vecchio
di cinquanta — la stessa disonestà che A-3 del 16 agosto ha corretto sulla
ricerca dei task, in piccolo.

Emerso implementando: `const msgs = messages[conv.id] || []` costruiva un array
nuovo a ogni render sulle conversazioni vuote, quindi nessuno dei memo nuovi
avrebbe mai potuto saltare un giro. `exhaustive-deps` — che il progetto tiene a
zero warning — lo ha detto per nome.
