# Audit performance e scalabilità — agosto 2026

> Perimetro: **punto 2 (Performance & Scalabilità)** di una revisione in tre
> parti. Stato e flusso dati (punto 1) e UX/gestione errori (punto 3) non sono
> trattati qui.
>
> Rapporto con `AUDIT_ARCHITETTURA_2026-08.md`: quell'audit ha chiuso il
> versante *rete* della performance (granularità del realtime, A-1 e B-1). Il
> versante *client* — peso del bundle, code-splitting, memoizzazione, costo di
> render — non era stato misurato. È l'oggetto di questo documento, e i rilievi
> qui sotto non si sovrappongono a nessuno di quelli.

Tutti i numeri di questo documento sono **misurati**, non stimati:

- pesi dei chunk → `npm run build` (Vite 6.4.3, 231 moduli)
- attribuzione byte→modulo → decodifica dei sourcemap di produzione
- volumi delle tabelle → `count(*)` sul database di produzione, 9 agosto 2026

---

## 1. Executive Summary

L'applicazione è **sana e in buono stato**: il code-splitting esiste, i chunk
vendor sono separati, `xlsx` (429 kB, il singolo modulo più pesante del
progetto) è correttamente caricato on-demand, le sei viste principali sono
avvolte in `memo` e i due context di dominio sono già stati separati per non
invalidarsi a vicenda. Non c'è nessun difetto che comprometta i dati o che
renda l'app inutilizzabile ai volumi attuali.

Il problema è un altro, ed è coerente: **le decisioni di performance sono state
prese una volta e non sono più state misurate.** Tre esempi che sono lo stesso
esempio.

1. Quattro moduli sono `lazy()`. Uno dei quattro — il modulo Liste viaggio — è
   nel bundle eager per **40 kB su 42**, perché due componenti fuori dal
   modulo (`ClienteListePanel` dalla scheda cliente, `ArchivedListe`
   dall'archivio) lo importano staticamente. Il `lazy()` c'è, la separazione
   no.
2. Il commento in `VoyageDesk.jsx:296` dice «solo AdminView e il modulo Liste
   sono lazy, le altre viste risolvono sincronicamente». È vero, ed è il
   punto: Cestino, Archivio, Calendario, import clienti, editor profilo e
   ricerca avanzata pesano insieme **~90 kB** e stanno tutti nel primo
   download, per chiunque, sempre.
3. `TasksContext.jsx` porta trenta righe di commento su *perché* le viste
   devono essere `memo` e non ricevere `state`. Poi `Topbar`, `Sidebar` e
   `BottomNav` ricevono `state` intero e non sono `memo`. La regola è scritta,
   il guscio non la applica.

Il risultato quantificato: **il 53% del chunk principale (217 kB su 411) è
differibile senza cambiare una riga di comportamento**, e i due componenti più
caldi dell'app — Dashboard e CalendarPlanner — non hanno **un solo `useMemo`**
fra loro, pur ricalcolando a ogni render sei ordinamenti su 248 task il primo,
e tre espansioni complete delle ricorrenze il secondo (di cui due su intervalli
che non sono a schermo).

Sulla scalabilità il verdetto è più netto: **nessuna vista è paginata o
virtualizzata**. Oggi non fa male — 818 clienti si disegnano. Ma `Clients.list()`
non ha `.range()` e la tabella è a **818 righe su un cap PostgREST che di
default è 1000**: è la cifra più importante di questo audit, perché a ~180
clienti di distanza il sintomo non è un rallentamento, è un'anagrafica che
smette di mostrare le ultime righe **in silenzio**.

**Salute complessiva: buona, con un debito di misurazione.** Nessun rilievo
critico. Le correzioni proposte sono localizzate — nessuna richiede di
riprogettare qualcosa — e le prime tre valgono da sole un dimezzamento del
bundle iniziale.

### Il payload iniziale, oggi

| Chunk | Raw | Gzip | Quando si scarica |
|---|---:|---:|---|
| `index` | 423.0 kB | 112.4 kB | sempre |
| `supabase` | 211.1 kB | 54.5 kB | sempre |
| `react` | 141.7 kB | 45.5 kB | sempre |
| **Totale primo caricamento** | **775.9 kB** | **212.4 kB** | |
| `xlsx` | 429.5 kB | 143.1 kB | on-demand ✔ |
| `BulkTaskCreator` | 42.2 kB | 11.2 kB | on-demand ✔ |
| `ListeViaggio` | 42.1 kB | 12.2 kB | on-demand *(parziale — vedi P2-1)* |
| `AdminView` | 40.3 kB | 11.7 kB | on-demand ✔ |
| `TaskSlideOver` | 19.2 kB | 5.7 kB | on-demand ✔ |

### Composizione del chunk `index` (423 kB), per funzionalità

Attribuzione ricavata dal sourcemap di produzione.

| Gruppo | Raw | Differibile? |
|---|---:|---|
| Guscio, reducer, `lib/api`, primitive UI, auth | 192.7 kB | no — è il nucleo |
| **Chat** (pannello + conversazioni + composer + vocali) | **54.5 kB** | sì — è dietro un toggle |
| **Modulo Liste** finito nel chunk eager | **40.1 kB** | sì — è già un chunk lazy |
| **Cestino + Archivio** | **23.3 kB** | sì — viste secondarie |
| **Calendario** | **20.9 kB** | sì — vista secondaria |
| **`mockData.js`** (dati demo) | **17.9 kB** | sì — non serve in produzione |
| **ProfileEditor + CropModal** | **14.2 kB** | sì — modale raro |
| Modali eager (QuickAddTask, NoticeEditor…) | 13.9 kB | in parte |
| **ClientImportModal** | **12.1 kB** | sì — modale raro |
| **Ricerca avanzata** | **11.8 kB** | sì — pannello a scomparsa |
| **NotificationsPanel** | **8.5 kB** | sì — pannello a scomparsa |

**Differibile: ~217 kB su 411 attribuiti (53%).** Applicando P2-1, P2-2 e P2-3
il chunk iniziale scende a **~60 kB gzip contro i 112 attuali**.

### Volumi di produzione (9 agosto 2026)

| Tabella | Righe | Come viene letta |
|---|---:|---|
| `movimenti_lista` | 5 316 | paginata con `.range()` ✔ |
| `clients` | **818** | **`select()` senza `.range()`** ⚠️ |
| `liste_viaggio` | 616 | paginata ✔ |
| `task_history` | 578 | intera, ricaricata su evento |
| `tasks` | 248 (29 cestinate) | intera, con commenti e cronologia annidati |
| `users` | 7 | intera |
| `messages` | 13 | `.limit()` ✔ |

---

## 2. Tabella delle priorità

| # | Priorità | Area | Problema | File |
|---|---|---|---|---|
| — | **CRITICI** | — | **Nessuno.** | — |
| P2-1 | ~~**Alta**~~ ✔ **risolto** (commit `8d3afb3`) | Bundle | Il chunk `lazy` del modulo Liste è aggirato: 40 kB su 42 stanno nel bundle eager, importati da fuori il modulo | `clients/ClienteDetailPanel.jsx:10`, `views/Archive.jsx:18` |
| P2-2 | ~~**Alta**~~ ✔ **risolto** (commit `8d3afb3`) | Bundle | `mockData.js` (17.9 kB) è il modulo più pesante del bundle di produzione, e serve solo in sviluppo | `state/mockData.js`, `state/reducer.js:27` |
| P2-3 | ~~**Alta**~~ ✔ **risolto** (commit `8d3afb3`) | Bundle | Sei viste/modali secondarie (~90 kB) sono nel primo download: solo 4 moduli su ~140 sono `lazy` | `VoyageDesk.jsx:41-46`, `shell/Topbar.jsx:11` |
| P2-4 | ~~**Alta**~~ ✔ **risolto** (verificato il 10 agosto) | Render | Dashboard e CalendarPlanner non hanno **un solo `useMemo`**: 6 ordinamenti su 248 task e 3 espansioni di ricorrenze a ogni render, comprese 2 fuori schermo | `dashboard/Dashboard.jsx:54-110`, `calendar/CalendarPlanner.jsx:63-78` |
| P2-5 | ~~**Alta**~~ ✔ **risolto** (come ST-3) | Scalabilità | `Clients.list()` senza `.range()` con la tabella a 818 righe: troncamento **silenzioso** al cap PostgREST (default 1000) | `lib/api.js:606` |
| P2-6 | ~~Media~~ ✔ **risolto** (come ST-2 (parte 1)) | Render | `Topbar`/`Sidebar`/`BottomNav` ricevono `state` intero e non sono `memo`: ri-render del guscio a ogni azione, toast compresi | `VoyageDesk.jsx:269,294,315` |
| P2-7 | ~~Media~~ ✔ **risolto** (verificato il 10 agosto) | Render | `ViewportContext` pubblica `width` grezzo con value non memoizzato: ogni frame di resize invalida 40 consumatori | `components/Viewport.jsx:29-33` |
| P2-8 | ~~Media~~ ✔ **risolto** (come ST-9, l'11 agosto) | Scalabilità | Nessuna virtualizzazione né paginazione lato client in nessuna vista: 818 clienti e 616 liste si renderizzano interi | `clients/ClientiView.jsx`, `liste/ListeViaggio.jsx` |
| P2-9 | ~~Bassa~~ ✔ **risolto** (come ST-15, l'11 agosto) | Render | `AppDataContext` ricrea 20 closure a ogni sostituzione di `team`, e `SET_TEAM` sostituisce l'array anche quando i dati sono identici | `state/AppDataContext.jsx:50`, `hooks/useAppHydration.js:170` |
| P2-10 | ~~Bassa~~ ✔ **risolto** (come ST-12, l'11 agosto) | Bundle | La chat (54.5 kB) è eager benché il pannello ritorni `null` da chiuso | `VoyageDesk.jsx:45`, `chat/ChatPanel.jsx:213` |

---

## 3. Action Plan dettagliato

### P2-1 · Il code-splitting del modulo Liste è aggirato — Alta

**File.** `src/components/clients/ClienteDetailPanel.jsx:10`,
`src/components/views/Archive.jsx:18`

**Motivo della criticità.** `ListeViaggio` è `lazy()` in `VoyageDesk.jsx:58`, e
il suo chunk esiste davvero (42.1 kB). Ma due componenti che **non** stanno nel
modulo Liste importano staticamente pezzi del modulo:

```
ClientiView (eager)  →  ClienteDetailPanel  →  ClienteListePanel  →  listeStyles.jsx  16.3 kB
                                                                  →  lib/listeApi.js   8.7 kB
Archive (eager)      →  ArchivedListe                                                  7.7 kB
Topbar (eager)       →  AdvancedSearchPanel →  liste/listeModuleApi.js
```

Bilancio misurato sul sourcemap: **40.1 kB del modulo Liste sono nel chunk
eager**, contro i 42.1 kB del chunk lazy. Il `lazy()` dimezza un modulo che
credeva di rimuovere per intero. `listeStyles.jsx` da solo — 16.3 kB di CSS del
modulo Liste — è il **secondo modulo più pesante dell'intero bundle di
produzione**, e lo scarica anche il Driver, che a `canAccessListe` risulta
escluso dal modulo.

**Soluzione.** Rendere lazy i due punti di ingresso laterali. Sono entrambi
condizionali (un tab della scheda cliente, una sezione dell'archivio), quindi il
`Suspense` non introduce nessuno stato nuovo da gestire.

```jsx
// src/components/clients/ClienteDetailPanel.jsx
- import { ClienteListePanel } from "../liste/ClienteListePanel.jsx";
+ import { lazy, Suspense } from "react";
+ import { LazyFallback } from "../ui/LazyFallback.jsx";
+ // Trascina con sé listeStyles.jsx (16.3 kB) e lib/listeApi.js (8.7 kB): senza
+ // import() finiscono nel chunk eager e annullano il lazy() di ListeViaggio.
+ const ClienteListePanel = lazy(() =>
+   import("../liste/ClienteListePanel.jsx").then(m => ({ default: m.ClienteListePanel }))
+ );

  {tab === "liste" && (
-   <ClienteListePanel cliente={cliente} … />
+   <Suspense fallback={<LazyFallback />}>
+     <ClienteListePanel cliente={cliente} … />
+   </Suspense>
  )}
```

```jsx
// src/components/views/Archive.jsx — stessa forma per ArchivedListe
- import { ArchivedListe } from "../liste/ArchivedListe.jsx";
+ const ArchivedListe = lazy(() =>
+   import("../liste/ArchivedListe.jsx").then(m => ({ default: m.ArchivedListe }))
+ );
```

Per `AdvancedSearchPanel`, che importa tre funzioni pure da `listeModuleApi.js`,
la correzione giusta è diversa: quelle funzioni non hanno bisogno di stare nel
modulo Liste. Vanno spostate in `src/lib/`, dove già vive `listeApi.js`, così
l'import non attraversa più il confine del chunk.

**Verifica.** Dopo la modifica, `listeStyles`, `listeApi` e `ArchivedListe` non
devono comparire nell'attribuzione del sourcemap di `index-*.js`.

---

### P2-2 · `mockData.js` è il modulo più pesante del bundle di produzione — Alta

**File.** `src/state/mockData.js` (17.9 kB nel chunk eager),
`src/state/reducer.js:27`, `src/VoyageDesk.jsx:13`,
`src/components/shell/Topbar.jsx:10`,
`src/components/notifications/NotificationsPanel.jsx:11`

**Motivo della criticità.** 17.9 kB di dati demo — team fittizio, task
d'esempio, conversazioni e messaggi di prova — sono nel primo download di ogni
utente in produzione. Non è codice morto che il tree-shaking possa togliere: i
rami che li usano sono **raggiungibili a runtime** (`makeInitialState` li
sceglie con `hasRealTeam ? [] : INITIAL_TASKS`), quindi Rollup li deve tenere.

Un solo export serve davvero in produzione: `INITIAL_CATEGORIES`, che
`reducer.js:709` usa **incondizionatamente** come valore iniziale prima che
`SET_CATEGORIES` idrati dal database. Non è un mock — è configurazione, e sta
nel file sbagliato. Gli altri sei export sono demo.

Da notare che il gate esiste già ma è applicato al posto sbagliato:
`Topbar.jsx:20` protegge le notifiche mock con `import.meta.env.DEV`, ma
l'`import` in cima al file resta statico, quindi il modulo entra nel bundle
comunque. Lo stesso vale per `NotificationsPanel.jsx:171`, dove
`MOCK_NOTIFICATIONS` è un fallback che in produzione non si verifica mai
(`notifications` è sempre un array).

**Soluzione.** Separare la configurazione dai mock, e rendere il ramo demo
eliminabile a build time — esattamente il trattamento già applicato con
successo al cambio-utente (rilievo M-3 dell'audit precedente, verificato sul
bundle).

```js
// NUOVO src/state/taskCategories.js — configurazione, non mock.
// Valore iniziale delle categorie prima che SET_CATEGORIES idrati dal DB.
export const INITIAL_CATEGORIES = { /* … spostato da mockData.js … */ };
```

```js
// src/state/reducer.js
- import { INITIAL_TEAM, INITIAL_CATEGORIES, INITIAL_TASKS, INITIAL_NOTICES } from "./mockData.js";
+ import { INITIAL_CATEGORIES } from "./taskCategories.js";
+ import { demoState } from "./demoState.js";

  function makeInitialState({ team, currentUserId } = {}) {
    const hasRealTeam = Array.isArray(team) && team.length > 0;
+   // In produzione `import.meta.env.DEV` è la costante `false`: il ramo
+   // collassa a build time e demoState resta senza referenti, quindi mockData
+   // esce dal bundle invece di restarci semplicemente irraggiungibile.
+   const demo = import.meta.env.DEV && !hasRealTeam ? demoState() : null;
    return {
-     tasks: hasRealTeam ? [] : INITIAL_TASKS,
-     team: hasRealTeam ? [...team] : [...INITIAL_TEAM],
+     tasks: demo?.tasks ?? [],
+     team: hasRealTeam ? [...team] : (demo?.team ?? []),
      categories: { ...INITIAL_CATEGORIES },
-     notices: hasRealTeam ? [] : INITIAL_NOTICES,
+     notices: demo?.notices ?? [],
      …
```

`demoState.js` è un thin wrapper sincrono su `mockData.js`; l'import statico
resta, ma sotto un ramo che in produzione è `false`, quindi Rollup elimina
entrambi. Stesso trattamento per `Topbar` e `NotificationsPanel`: togliere
l'import di `MOCK_NOTIFICATIONS` e sostituire il fallback con `[]`.

`INITIAL_CONVERSATIONS`/`INITIAL_MESSAGES` in `VoyageDesk.jsx:13` seguono la
stessa strada — `useChatData` li riceve già come prop, basta passare `null` in
produzione.

**Guadagno.** 17.9 kB raw dal chunk eager, a comportamento invariato in
produzione. Verificabile come M-3: nessuna stringa dei task demo deve
sopravvivere nel bundle buildato.

---

### P2-3 · Sei viste secondarie (~90 kB) nel primo download — Alta

**File.** `src/VoyageDesk.jsx:41-46`, `src/components/shell/Topbar.jsx:11`,
`src/components/clients/ClientiView.jsx:14`,
`src/components/shell/UserSwitcher.jsx:8`

**Motivo della criticità.** Il commento in `VoyageDesk.jsx:296` è accurato — e
descrive il problema. Su ~140 moduli, quattro sono `lazy`. Tutto il resto è nel
primo download, incluse cose che la maggior parte delle sessioni non apre mai:

| Modulo | Raw | Quando serve |
|---|---:|---|
| `Trash` | 13.8 kB | vista Cestino |
| `CalendarPlanner` (+ griglie, ricorrenze, ICS) | 20.9 kB | vista Calendario |
| `ClientImportModal` | 12.1 kB | import CSV/Excel clienti |
| `AdvancedSearchPanel` | 11.5 kB | pannello ricerca a scomparsa |
| `ProfileEditor` + `CropModal` | 14.2 kB | modifica profilo |
| `Archive` | 8.6 kB | vista Archivio |
| `NotificationsPanel` | 8.5 kB | campanella |

**Soluzione.** Estendere lo schema già in uso — `lazy()` + il `Suspense` che
avvolge `renderView()` esiste già in `VoyageDesk.jsx:303` e non va toccato.

```jsx
// src/VoyageDesk.jsx
- import { CalendarPlanner } from "./components/calendar/CalendarPlanner.jsx";
- import { Trash } from "./components/views/Trash.jsx";
- import { Archive } from "./components/views/Archive.jsx";
+ const CalendarPlanner = lazy(() =>
+   import("./components/calendar/CalendarPlanner.jsx").then(m => ({ default: m.CalendarPlanner })));
+ const Trash = lazy(() =>
+   import("./components/views/Trash.jsx").then(m => ({ default: m.Trash })));
+ const Archive = lazy(() =>
+   import("./components/views/Archive.jsx").then(m => ({ default: m.Archive })));
```

`Dashboard` e `ClientiView` restano eager: la prima è la vista d'ingresso, la
seconda è quella più usata dopo di essa, e differirle scambierebbe peso con un
flash di fallback su ogni sessione.

Per i tre modali (`ClientImportModal`, `ProfileEditor`, `AdvancedSearchPanel`) e
per `NotificationsPanel` vale lo schema di `BulkTaskCreator`: `lazy` +
`<Suspense fallback={<LazyFallback overlay />}>` attorno al montaggio
condizionale che già esiste.

**Precisazione doverosa sul beneficio.** Differire una vista sposta il costo,
non lo elimina: chi apre il Calendario paga comunque i 20.9 kB, e li paga con
una latenza in più invece che all'avvio. Il guadagno è reale perché la
distribuzione è asimmetrica — l'avvio è pagato da **tutti, ogni volta**, mentre
il Cestino è aperto da pochi e di rado. È anche il motivo per cui vale la pena
aggiungere un prefetch su hover/focus delle voci di navigazione, che azzera la
latenza percepita senza rimettere il peso nell'avvio.

---

### P2-4 · Dashboard e CalendarPlanner senza un solo `useMemo` — Alta

**File.** `src/components/dashboard/Dashboard.jsx:54-110`,
`src/components/calendar/CalendarPlanner.jsx:63-78`

**Motivo della criticità.** Sono i due componenti che il commento di
`TasksContext.jsx:15-18` cita per nome come «il costo non era teorico», e sono
gli unici due grossi dell'app **senza alcuna memoizzazione interna**.
`memo` sul confine del componente li protegge dai render del genitore. Non li
protegge dal proprio stato locale — ed è quello che cambia di continuo.

**CalendarPlanner.** A ogni render:

```js
const presentCats = [...new Set(tasks.filter(…).map(t => t.category))];  // 248 task
const baseTasks   = tasks.filter(t => isActiveTask(t) && canViewTask(t, uid));
const expandedMonth = expandRecurring(baseTasks, monthStart, monthEnd);
const expandedWeek  = expandRecurring(baseTasks, _wkS, _wkE);
const expandedDay   = expandRecurring(baseTasks, _dyS, _dyE);
```

`expandRecurring` gira **tre volte**, su mese, settimana e giorno, mentre
`viewMode` ne mostra **uno**: due terzi del lavoro è per intervalli fuori
schermo. Ogni chiamata itera tutti i task attivi e, per ognuno ricorrente,
avanza occorrenza per occorrenza fino a un tetto di 400, spargendo uno spread
`{...t}` per ogni occorrenza emessa. Scatta a ogni `setSelectedDay`,
`setCatFilter`, `setViewMode`, cambio mese, e a ogni frame di resize (P2-7).

**Dashboard.** Sei passate `filter`+`sort` su 248 task a ogni render —
`agentWorkload` (un `filter` annidato per membro del team), `next7`,
`unassigned`, `personalQueue`, `urgentCandidates`, `urgentTasks` — ricalcolate
tutte quando l'utente cambia tab della coda.

**Soluzione.** `useMemo` con le dipendenze reali, e — per il calendario —
calcolare **solo l'intervallo visibile**.

```jsx
// src/components/calendar/CalendarPlanner.jsx
+ const baseTasks = useMemo(
+   () => tasks.filter(t => isActiveTask(t) && canViewTask(t, uid)),
+   [tasks, canViewTask, uid],
+ );
+
+ const presentCats = useMemo(
+   () => [...new Set(baseTasks.filter(t => t.dueDate).map(t => t.category))].filter(Boolean),
+   [baseTasks],
+ );
+
+ // Un solo intervallo per volta: espandere anche mese e settimana mentre è
+ // aperta la vista giorno significa scartare i due terzi del lavoro appena
+ // fatto. `range` dipende da viewMode, quindi cambiare vista ricalcola —
+ // che è esattamente quando serve.
+ const range = useMemo(() => {
+   if (viewMode === "day") {
+     const s = new Date(dayDate); s.setHours(0, 0, 0, 0);
+     const e = new Date(dayDate); e.setHours(23, 59, 59, 999);
+     return [s, e];
+   }
+   if (viewMode.startsWith("week")) {
+     const s = new Date(weekDays[0]); s.setHours(0, 0, 0, 0);
+     const e = new Date(weekDays[6]); e.setHours(23, 59, 59, 999);
+     return [s, e];
+   }
+   return [new Date(year, month, 1, 0, 0, 0), new Date(year, month + 1, 0, 23, 59, 59)];
+ }, [viewMode, dayDate, weekDays[0]?.getTime(), year, month]);
+
+ const expanded = useMemo(() => expandRecurring(baseTasks, range[0], range[1]), [baseTasks, range]);
```

```jsx
// src/components/dashboard/Dashboard.jsx
+ const visibleTasks = useMemo(() => getVisibleTasks(getActiveTasks(tasks), uid),
+   [tasks, getVisibleTasks, uid]);
+
+ const personalQueue = useMemo(
+   () => allTasks.filter(t => isMyTask(t, uid) && t.status !== "done").sort(byDueDate),
+   [allTasks, uid],
+ );
+ // … idem per unassigned, urgentCandidates, next7, agentWorkload
```

I comparatori (`byDueDate`, `byPriority`) vanno estratti a livello di modulo:
oggi sono funzioni anonime ricreate dentro ogni `sort`.

**Nota sulle dipendenze.** `canViewTask`/`getVisibleTasks` arrivano da
`useAppData` e cambiano identità a ogni sostituzione di `team` — vanno nelle
deps, ed è il motivo per cui P2-9 (stabilizzare quelle closure) moltiplica il
valore di questo rilievo invece di essere indipendente da esso.

**✅ Implementato**, dopo P2-7 e dopo aver misurato (suggerimento strategico
#3). `useMemo` su tutte e sei le passate di Dashboard (`allTasks`,
`visibleTasks`, `agentWorkload`, `next7`, `unassigned`, `personalQueue`,
`urgentCandidates`, `urgentTasks`, `overdueTasks`) e su `baseTasks`/
`presentCats`/`range`/`expanded` di CalendarPlanner — un solo intervallo
espanso per render, quello della vista attiva, non più tre. `byDueDate`/
`byPriorityThenDueDate` estratti a livello di modulo in `Dashboard.jsx`, come
proposto sopra. `npm run misura:render` (nuovo, vedi P2-7) misura
`expandRecurring` isolata: a 248 task sintetici, tre chiamate/render costano
~3.4 ms contro ~1.5 ms per una — non il "forse un millisecondo" ipotizzato,
ma nemmeno il problema in sé. Il problema era il moltiplicatore di P2-7.

---

### P2-5 · `Clients.list()` senza `.range()` a 818 righe — Alta

**File.** `src/lib/api.js:606`

```js
list: () => supabase.from('clients').select('*').order('name'),
```

**Motivo della criticità.** ✅ Misurato: `clients` è a **818 righe**. Il cap
`db-max-rows` di PostgREST tronca le risposte senza `.range()` **senza
segnalare errore** — `error` resta `null`, arrivano meno righe, e nessuno se ne
accorge. Se il cap del progetto è il default storico di 1000, l'anagrafica è a
**182 clienti dal troncamento silenzioso**.

Il sintomo sarebbe: alcuni clienti non compaiono in elenco, l'autocomplete non
li trova, un operatore ne ricrea uno che esiste già. È lo stesso meccanismo che
ha prodotto i doppioni descritti in `useAppHydration.js` — e stavolta senza
nemmeno un messaggio d'errore da cui partire.

L'audit precedente aveva sollevato la domanda (§2-ter) ma lasciato la verifica
aperta, perché su Supabase il valore vive nella configurazione di piattaforma
(Settings → API → Max rows) e non è leggibile da SQL. **Resta da guardare a
mano, una volta.** Ma la correzione non ha bisogno di quella risposta per
essere giusta: paginare con `.range()` fermandosi sul `count` esatto del
`Content-Range` è corretto *qualunque* sia il cap, e non dipende dal suo valore.

**Soluzione.** L'infrastruttura esiste già ed è collaudata: `fetchAllRows` in
`listeApi.js:66` fa esattamente questo per il modulo Liste. Va promossa a
utility condivisa e riusata.

```js
// src/lib/pagination.js — promosso da listeApi.js, stessa implementazione
export const PAGE_SIZE = 1000;
export const WITH_COUNT = { count: 'exact' };
export const fetchAllRows = async (buildQuery) => { /* … invariato … */ };
```

```js
// src/lib/api.js
+ import { fetchAllRows, WITH_COUNT } from './pagination.js';

  export const Clients = {
-   list: () => supabase.from('clients').select('*').order('name'),
+   // 818 righe al 9 agosto 2026. Senza .range() il cap db-max-rows tronca in
+   // silenzio (error === null): l'ordinamento si chiude su `id` perché senza
+   // ORDER BY deterministico due pagine possono ripetere o saltare righe.
+   list: () => fetchAllRows(() =>
+     supabase.from('clients').select('*', WITH_COUNT).order('name').order('id')),
```

Stesso trattamento per `Tasks.list()` (248 righe, ma con commenti e cronologia
annidati, quindi il conteggio righe non è l'unico limite) e `Users.listAll()`
(7 righe — non urgente, ma la coerenza costa una riga).

---

### P2-6 · Il guscio riceve `state` intero e non è `memo` — Media

**File.** `src/VoyageDesk.jsx:269` (`Topbar`), `:294` (`Sidebar`), `:315`
(`BottomNav`)

**Motivo della criticità.** È l'anti-pattern che `TasksContext.jsx:6-19`
descrive nel dettaglio e che l'audit precedente ha rimosso da tutte e sei le
viste (M-1 per `AdminView`) — lasciato intatto nel guscio, che si ri-renderizza
a **ogni** azione: un toast che appare, lo stesso toast che sparisce da solo
dopo tre secondi, ogni carattere digitato nella ricerca globale.

`Topbar` usa sei campi (`activeView`, `searchQuery`, `tasks`, `currentUserId`,
`showNotif`) e monta `AdvancedSearchPanel` e `NotificationsPanel`. `Sidebar` ne
usa quattro. Nessuno dei tre è `memo`, e passargli `state` renderebbe `memo`
inefficace comunque.

**Soluzione.** Stessa cura applicata alle viste: prop mirate + `memo`. `tasks`
e `currentUserId` arrivano già dai context, non servono come prop.

```jsx
// src/VoyageDesk.jsx
  <Topbar
-   state={state}
+   activeView={state.activeView}
+   searchQuery={state.searchQuery}
+   showNotif={state.showNotif}
    dispatch={dispatch}
    … />
```

```jsx
// src/components/shell/Topbar.jsx
- export const Topbar = ({ state, dispatch, … }) => {
+ export const Topbar = memo(function Topbar({ activeView, searchQuery, showNotif, dispatch, … }) {
+   const tasks = useTasks();                       // invece di state.tasks
+   const { currentUserId } = useAppData();         // invece di state.currentUserId
```

`Sidebar`/`BottomNav`: `team` e `currentUserId` da `useAppData`, restano
`activeView` e `sidebarCollapsed` come prop.

---

### P2-7 · `ViewportContext` invalida 40 consumatori a ogni frame di resize — Media

**File.** `src/components/Viewport.jsx:29-33`

```jsx
const [width, setWidth] = useState(window.innerWidth);
// …
const vp = { width, isMobile: width <= 640, isTablet: …, isDesktop: … };
return <ViewportContext.Provider value={vp}>{children}</ViewportContext.Provider>;
```

**Motivo della criticità.** Due difetti che si sommano.

1. Lo stato è la **larghezza in pixel**, non la fascia. Trascinare il bordo
   della finestra da 1400 a 1000 px produce ~400 `setWidth` (uno per frame, il
   `requestAnimationFrame` li coalesce ma non li elimina), mentre le tre
   risposte che interessano ai consumatori — `isMobile`, `isTablet`,
   `isDesktop` — non cambiano nemmeno una volta.
2. `vp` è un **oggetto nuovo a ogni render** del provider, quindi anche un
   render per un motivo estraneo invalida ogni consumatore.

I consumatori di `useViewport` sono **40**. Fra questi Dashboard e
CalendarPlanner, che a ogni invalidazione rifanno rispettivamente i sei
ordinamenti e le tre espansioni di P2-4. Il resize della finestra è quindi il
percorso più caro dell'applicazione, per un'informazione che è ferma.

**Soluzione.** Pubblicare le soglie, non i pixel, e memoizzare il value.

```jsx
+ const band = (w) => (w <= 640 ? "mobile" : w <= 1024 ? "tablet" : "desktop");

  export const ViewportProvider = ({ children }) => {
-   const [width, setWidth] = useState(window.innerWidth);
+   const [width, setWidth] = useState(() =>
+     typeof window !== "undefined" ? window.innerWidth : 1280);
    useEffect(() => {
      …
      const onResize = () => {
        if (raf) cancelAnimationFrame(raf);
-       raf = requestAnimationFrame(() => setWidth(window.innerWidth));
+       raf = requestAnimationFrame(() => setWidth((prev) => {
+         const next = window.innerWidth;
+         // Un re-render solo quando cambia la FASCIA. Chi ha bisogno del pixel
+         // esatto (Sidebar, per l'auto-collapse) lo legge sempre da `width`,
+         // che resta nel value: quello che sparisce è il render a vuoto per
+         // ognuno dei ~400 pixel attraversati da un trascinamento.
+         return band(next) === band(prev) ? prev : next;
+       }));
      };
      …
    }, []);
-   const vp = { width, isMobile: width <= 640, … };
+   const vp = useMemo(() => ({
+     width,
+     isMobile: width <= 640,
+     isTablet: width > 640 && width <= 1024,
+     isDesktop: width > 1024,
+   }), [width]);
```

⚠️ **Attenzione a un consumatore.** `Sidebar.jsx:68-73` ha un effetto che
dipende da `width` per l'auto-collapse su finestra stretta, e confronta fasce
proprie (`narrow`/`wide`) con soglie che **non coincidono** con quelle del
viewport. Con questa modifica `width` si aggiorna solo al cambio di fascia
viewport, quindi quelle soglie vanno riconciliate — o si espone anche la fascia
`narrow` dal provider. Va verificato con `src/test/` prima di considerare
chiusa la modifica.

**✅ Implementato**, per primo fra P2-4/P2-7 (suggerimento strategico #3: P2-7
rimuove l'invalidazione, poi P2-4 rimuove il ricalcolo che quell'invalidazione
innescava). La riconciliazione scelta: le soglie di `setWidth` che decidono se
un resize produce un render includono anche 1280 (quella di `Sidebar.jsx`),
non solo 640/1024 — `Sidebar.jsx` non ha dovuto cambiare, riceve `width`
aggiornato esattamente ai cambi che già gestiva. Verificato in
`src/test/viewport.test.jsx` (nuovo): il `value` del context non cambia per un
resize dentro la stessa fascia, cambia alle tre soglie, e l'auto-collapse di
Sidebar scatta/si annulla nei punti giusti senza dispatch spuri dentro la
stessa fascia desktop.

`npm run misura:render` (nuovo — `scripts/misura-render/index.js`, non un
gate di CI: uno strumento, come richiesto dal suggerimento #3) quantifica
perché l'ordine P2-7-poi-P2-4 conta: un trascinamento del bordo finestra
produceva fino a ~400 render (uno per frame, il resize event coalescente ma
non eliminato dal `requestAnimationFrame` esistente), ciascuno con tre
chiamate a `expandRecurring` se la vista Calendario era aperta — **~1.37 s**
di solo calcolo sul thread principale per un singolo trascinamento, a 248 task
sintetici. Dopo entrambi i fix: al più 3 render (le tre soglie di fascia), una
chiamata ciascuno — **~4.5 ms**. La cifra "un millisecondo" ipotizzata
dall'audit sottostimava il costo per render (~1.5 ms, non sub-ms) ma
sovrastimava quanto contasse da solo: il moltiplicatore di P2-7 era il vero
problema.

---

### P2-8 · Nessuna virtualizzazione né paginazione lato client — Media

**File.** `src/components/clients/ClientiView.jsx`,
`src/components/liste/ListeViaggio.jsx`, `src/components/views/Trash.jsx`

**Motivo della criticità.** Nessuna vista limita quanto disegna. `ClientiView`
mappa `filtered` per intero (`:242`): **818 card**, ciascuna con avatar, badge liste e
`ContactActions`. `ListeViaggio` disegna **616 liste**. La ricerca è già
memoizzata (`ClientiView.jsx:104` — fatto bene), ma il `filter` non è il costo:
il costo sono i nodi DOM, che a ricerca vuota ci sono tutti.

A questi volumi si sopravvive. Il punto è la traiettoria: il costo cresce
linearmente con l'anagrafica, e un gestionale con questa struttura tipicamente
la vede crescere in modo monotòno.

**Soluzione.** La più economica e la meno invasiva è la paginazione incrementale
— nessuna dipendenza nuova, nessun cambio di layout, e degrada bene:

```jsx
+ const PAGINA = 60;
+ const [mostrati, setMostrati] = useState(PAGINA);
+ // Torna a inizio elenco quando cambia il criterio: senza, chi ha scorso
+ // fino a 600 clienti e poi cerca vede il "carica altri" già esaurito.
+ useEffect(() => { setMostrati(PAGINA); }, [search, sortBy, linkFilter]);

- {filtered.map(c => <ClienteCard key={c.id} … />)}
+ {filtered.slice(0, mostrati).map(c => <ClienteCard key={c.id} … />)}
+ {filtered.length > mostrati && (
+   <button onClick={() => setMostrati(n => n + PAGINA)}>
+     Mostra altri ({filtered.length - mostrati})
+   </button>
+ )}
```

Una virtualizzazione vera (windowing) è la risposta corretta oltre le ~2 000
righe, ma introduce una dipendenza e complica altezze variabili e
`SwipeActions`. Non la consiglierei adesso: prima la paginazione, che copre due
ordini di grandezza di crescita a costo quasi nullo.

---

### P2-9 · `AppDataContext` ricrea 20 closure a ogni cambio di `team` — Bassa

**File.** `src/state/AppDataContext.jsx:50`, `src/hooks/useAppHydration.js:170`

**Motivo della criticità.** Il `useMemo` del provider ricostruisce un oggetto
con **una ventina di closure** (`getMember`, `canViewTask`, `getVisibleTasks`,
…) ogni volta che cambia l'identità di `team`. Tutti e 40 i consumatori si
invalidano, e le funzioni finiscono nelle deps degli `useMemo` di P2-4,
vanificandoli.

Il moltiplicatore è a monte: `SET_TEAM` (`reducer.js:393`) assegna
`action.payload` senza confronto, e `useAppHydration.js:170` costruisce un array
nuovo con `(data || []).map(...)` a ogni reload. Il `filterEvent` sugli
heartbeat di presence — aggiunto nella sessione 29 e corretto — evita il caso
peggiore, ma ogni reload che passa il filtro sostituisce l'array **anche quando
i dati sono identici**.

**Soluzione.** Chiudere il ciclo dove nasce: non sostituire `team` se il
contenuto non è cambiato. Il team è a 7 righe, il confronto è gratuito.

```js
// src/state/reducer.js
  case "SET_TEAM": {
    const team = action.payload || [];
+   // Il reload realtime ricostruisce l'array anche quando nulla è cambiato
+   // (es. un UPDATE che il filtro presence non ha intercettato). Sostituirlo
+   // invaliderebbe AppDataContext e con esso tutti i 40 consumatori, insieme
+   // agli useMemo che dipendono da canViewTask/getVisibleTasks.
+   if (stessoTeam(state.team, team)) return state;
    return { ...state, team };
  }
```

con `stessoTeam` confronto shallow campo per campo in `lib/permissions.js` o in
un helper accanto al reducer — **non** `JSON.stringify`, che è sensibile
all'ordine delle chiavi e costa più del confronto che sostituisce.

---

### P2-10 · La chat (54.5 kB) è eager benché il pannello sia chiuso — Bassa

**File.** `src/VoyageDesk.jsx:45`, `src/components/chat/ChatPanel.jsx:213`

**Motivo della criticità.** `ChatPanel` ritorna `null` quando `open` è falso
(`:213`), ma l'import è statico: il pannello, le conversazioni, la composer, le
reazioni, il player e il recorder vocali — **54.5 kB, il gruppo più pesante
dopo il nucleo** — sono nel primo download di ogni sessione, anche di quelle in
cui la chat non si apre mai.

**Perché Bassa e non Alta.** Diversamente dalle viste di P2-3, qui c'è un
vincolo reale: `useChatData` gira in `VoyageDeskInner` a prescindere dal
pannello, perché alimenta il badge dei non letti in sidebar e le notifiche. Non
si può differire l'hook senza perdere quel badge.

Si può però differire tutta la **UI**, che è la parte pesante: l'hook e
`chatFormat.js` (che calcola i non letti) restano eager, il pannello diventa
`lazy` e si monta solo a `showChat` vero. Va misurato dopo la separazione,
perché il taglio netto fra hook e UI passa in mezzo a `chatCommands.js` e va
verificato modulo per modulo — motivo per cui questo rilievo va affrontato
**dopo** P2-1/2/3, non insieme.

---

## 4. Top 3 suggerimenti strategici

### 1. Chiudere il code-splitting che è già stato deciso (P2-1 + P2-2 + P2-3)

Non è un lavoro nuovo: è finire quello iniziato. Il `lazy()` c'è, il `Suspense`
c'è, `LazyFallback` c'è, i chunk vendor sono separati. Manca che le importazioni
rispettino i confini che quelle decisioni presuppongono — e oggi non lo fanno in
tre punti, tutti e tre a una riga di distanza dalla correzione.

**Effetto misurabile: il chunk iniziale da 112 kB a ~60 kB gzip.** Su una
connessione mobile è il primo caricamento dimezzato, per ogni utente, ogni
volta. È l'intervento col rapporto beneficio/rischio migliore dell'intero
audit: nessuna logica cambia, e la verifica è meccanica (ricostruire il bundle e
rileggere l'attribuzione del sourcemap).

Sono nell'ordine giusto per essere fatti insieme: P2-2 è indipendente, P2-1
sblocca il chunk Liste, P2-3 estende lo schema.

### 2. Rendere misurabile il peso del bundle, invece di riscoprirlo fra sei mesi

Questo audit ha trovato 217 kB differibili perché qualcuno ha decodificato i
sourcemap a mano. Nessuno lo rifarà spontaneamente, e i tre difetti trovati
sono **tutti dello stesso tipo**: un import aggiunto in buona fede che
attraversa il confine di un chunk. Non c'è modo di accorgersene leggendo la
diff — `import { ClienteListePanel } from "../liste/..."` è una riga
perfettamente ragionevole, e costa 25 kB.

È lo stesso argomento che il progetto ha già accettato altrove: `max-lines` in
ESLint esiste perché la dimensione dei file era una convenzione non misurata, e
`docs/CLAUDE.md` traccia il numero di warning proprio per vederlo salire o
scendere. Il peso del bundle merita lo stesso trattamento:

- un budget in CI (`index` ≤ 70 kB gzip dopo il punto 1) che fallisce la build
  quando lo si supera;
- una regola `no-restricted-imports` che vieti a `components/clients/**` e
  `components/views/**` di importare da `components/liste/**` se non con
  `import()` — lo stesso meccanismo già usato per `VIETATO_APPGLOBALS`.

Il valore non è il numero: è che il ventunesimo import di troppo diventa un
errore di build invece di un rilievo fra sei mesi.

**✅ Implementato.** Due meccanismi distinti, sullo stesso modello di
`VIETATO_APPGLOBALS`:

- `no-restricted-imports` in `eslint.config.js` (`VIETATI_IMPORT_LISTE_EAGER`,
  `VIETATO_MOCKDATA_DIRETTO`) vieta per nome l'import statico dei quattro
  moduli coinvolti in P2-1/P2-2 — `ClienteListePanel.jsx`, `ArchivedListe.jsx`,
  `mockData.js` — fuori dai punti d'ingresso ammessi. `no-restricted-imports`
  colpisce solo `ImportDeclaration`/`export … from`, non `ImportExpression`:
  `lazy(() => import(...))` resta permesso per costruzione, non per
  eccezione elencata a mano. Verificato riaprendo a mano l'import in
  `ClienteDetailPanel.jsx`: `eslint` si ferma con errore prima ancora del
  build.
- `npm run verifica:bundle` (`scripts/verifica-bundle/index.js`, in CI dopo
  `npm run build`) legge `dist/index.html` — `<script type="module">` +
  `<link rel="modulepreload">`, cioè l'esatto insieme che Vite fa scaricare
  prima del primo render — e fallisce se il chunk d'ingresso supera 84 kB gzip
  o il first load completo supera 184 kB (misurato dopo P2-1/2/3: 77.95 kB /
  177.90 kB, +6 kB di margine su entrambe). È il backstop generico per
  qualunque nuovo modulo non ancora nominato dalla regola ESLint sopra.

Le soglie di CI sono più basse di quella originariamente proposta qui (70 kB)
perché si basano sul risultato reale post-fix (77.95 kB), non su una stima:
l'obiettivo non era indovinare un numero ma smettere di doverlo indovinare.

### 3. Misurare i due componenti caldi prima di ottimizzarli — e poi ottimizzarli (P2-4 + P2-7)

Metto la misura prima della correzione di proposito. `expandRecurring` chiamata
tre volte per render invece di una è un difetto certo, ma **quanto** costi a 248
task non lo so, e nemmeno il progetto lo sa: non c'è un profilo, un benchmark o
un test di performance in tutta la codebase. A questi volumi potrebbe essere
un millisecondo.

Il motivo per cui va comunque corretto non è il millisecondo di oggi: è che il
lavoro **cresce col numero di task e ricorrenze**, e nel frattempo il percorso
di invalidazione più frequente (il resize, P2-7) lo attraversa a ogni frame. Le
due cose vanno affrontate insieme perché sono la stessa: un calcolo non
memoizzato è innocuo finché nessuno lo invalida, e un context che invalida
troppo è innocuo finché non c'è nulla di caro a valle. Qui ci sono entrambi.

L'ordine che consiglio: un `React.Profiler` attorno alla vista attiva in dev con
i volumi di produzione (248 task, 818 clienti — già disponibili), poi P2-7
(rimuove l'invalidazione), poi P2-4 (rimuove il ricalcolo), e la stessa misura
ripetuta per verificare che i due interventi abbiano fatto quello che promettono
invece di essere creduti sulla parola.

**✅ Implementato, in quest'ordine.**

1. **Misura.** `<Profiler>` attorno alla vista attiva in `VoyageDesk.jsx`,
   dietro `VITE_PROFILE_VIEWS=true` in dev (stessa tecnica di gating di
   `demoState.js`: fuori da quel guard esce dal bundle di produzione). E — dato
   che un profiler React richiede un browser per dare un numero, mentre la
   domanda "quanto costa `expandRecurring` a 248 task" è rispondibile subito,
   senza avviare l'app — `npm run misura:render`
   (`scripts/misura-render/index.js`): benchmark Node sulla funzione pura,
   invariata, con 248 task sintetici alla scala di produzione. Non è un gate:
   uno strumento, ripetibile, che prima non esisteva.
2. **P2-7.** Fatto per primo, come consigliato: rimuove l'invalidazione.
3. **P2-4.** Fatto dopo: rimuove il ricalcolo che quell'invalidazione
   innescava.

**Risposta misurata, non stimata.** Una chiamata a `expandRecurring` su 248
task costa **~1.5 ms** — misurabile, non il "forse un millisecondo" buttato lì
come ipotesi, ma nemmeno abbastanza da giustificare da solo il rilievo. Il
motivo vero era P2-7: un trascinamento del bordo finestra, che prima
produceva fino a ~400 render (uno a frame), portava quel ~1.5 ms a
**~1.37 secondi** di solo calcolo se la vista Calendario era aperta — un
numero che un `console.log` sporadico non avrebbe mai fatto notare, perché
dipende da COME si ridimensiona la finestra, non da SE. Dopo P2-7+P2-4: al più
tre render (le soglie di fascia), una chiamata ciascuno, **~4.5 ms** — la
stessa misura, ripetuta, non creduta sulla parola. Dettagli e numero esatto
delle iterazioni in P2-4/P2-7 sopra.

---

## Appendice — cosa ho verificato e NON ho trovato

Per pari completezza rispetto a quanto segnalato, e per non far ricercare due
volte le stesse cose:

- ✅ **`xlsx` è caricato correttamente on-demand.** 429 kB — il singolo modulo
  più pesante del progetto — in un chunk async. Tutti e tre i punti d'uso
  (`AdminIOTab`, `ImportTab`, `ClientImportModal`) passano da `lib/xlsx.js` con
  `import()` dinamico. Zero import statici. È fatto bene.
- ✅ **Nessuna duplicazione di moduli fra i chunk.** Verificata l'attribuzione
  dei sourcemap di `ListeViaggio`, `AdminView`, `BulkTaskCreator`,
  `TaskSlideOver`: nessun modulo compare in più di un chunk. `manualChunks` in
  `vite.config.js` fa esattamente quello che il suo commento dichiara.
- ✅ **Il cambio-utente demo è davvero fuori dal bundle di produzione**
  (rilievo M-3 dell'audit precedente): riconfermato su questa build.
- ✅ **`Messages.list()` è paginata** con `.limit()` (`api.js:340`), come
  `Notifications` (`:531`, `:536`). Non tutte le query sono senza limite: il
  problema di P2-5 riguarda `clients`, `tasks` e `users`.
- ✅ **`useDebouncedTableSubscription` gestisce correttamente le risposte
  obsolete** (gen-counter + `isCurrent()`) e la ripresa dopo disconnessione. Non
  ho trovato race condition nel percorso di idratazione — ma il flusso dati è
  materia del punto 1, e questa non è un'analisi esaustiva di quel perimetro.
- ✅ **I comparatori dei `sort` non mutano gli array del reducer**: `Dashboard`
  usa `[...base].sort(...)` o `filter().sort()` su array già nuovi. Nessuna
  mutazione dello state.
- ⚠️ **Non ho potuto verificare il valore di `db-max-rows`** (vedi P2-5): vive
  nella configurazione di piattaforma Supabase, non leggibile da SQL né dalle
  API di gestione. Resta da guardare a mano una volta — ma la correzione
  proposta è corretta a prescindere dal valore.
- ⚠️ **Non ho profilato i tempi di render reali**: non esiste una baseline nel
  progetto e crearne una era fuori dal perimetro di questa analisi. È il motivo
  per cui il suggerimento strategico n. 3 mette la misura prima della modifica.
