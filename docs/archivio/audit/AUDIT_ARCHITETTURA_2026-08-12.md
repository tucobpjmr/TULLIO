# Audit architettura, struttura e sicurezza — 12 agosto 2026

Perimetro: organizzazione dei moduli, separazione delle responsabilità,
duplicazione, anti-pattern React, superficie di sicurezza (RLS, RPC, Edge
Function) e stato reale della produzione.

A differenza degli audit precedenti, questo **non si è fermato al repository**:
i rilievi C-1, A-1 e A-2 nascono dal confronto fra ciò che il codice dà per
scontato e ciò che il database e la CI fanno davvero. È lì che si sono trovate
le due cose che nessuna lettura del solo codice poteva mostrare.

Verifiche eseguite: `npm run lint` (0 errori), `npm test` (**1138 test
passati**, 7 skip, 99 file), `npm run build`, conteggi diretti sul database di
produzione, advisor di sicurezza Supabase, storico dei run di GitHub Actions.

> **Stato al 13 agosto** — **C-1, A-1, A-2, A-3 e A-4** sono chiusi: vedi §4.
> A-2 si è chiuso in due tempi — il 12 la correzione di codice (annotazione
> sul salto), il 13 chi amministra il repository ha configurato il secret, e
> il rilancio del workflow conferma che l'advisor valuta davvero un lint. I
> test sono **1150**.
>
> **Stesso 13 agosto, secondo intervento** — **M-2, M-3, M-4, M-5, M-6, B-1,
> B-2 e B-3 sono chiusi**: vedi §4-bis. **M-1 era rimasto aperto** con un avvio
> mirato (40 occorrenze convertite in classi utility). I test sono **1164**
> (erano 1150), 7 skip.
>
> **Terzo intervento, 13 agosto — M-1 è chiuso** (§4-ter). 1.153 `style={{…}}`
> costanti sollevati a costanti di modulo (1.487 → **334**, tutti dinamici per
> costruzione), i due `<style>` iniettati a runtime diventati fogli `.css`
> emessi da Vite, e `'unsafe-inline'` **tolto da `style-src`** — l'ultima
> direttiva permissiva della CSP. Il passo che §4-bis dava per impossibile si
> è rivelato possibile: quella sezione conteneva un errore tecnico, corretto e
> spiegato in §4-ter. **14 rilievi su 14 chiusi.**

---

## 1. Executive Summary

**Il progetto è in ottima salute strutturale.** Il confine fra livelli è
dichiarato e — cosa più rara — *misurato*: il registry di `state/persistence.js`
è l'unico punto di scrittura, le regole ESLint (`max-lines`,
`no-restricted-imports`) impediscono la regressione invece di limitarsi a
documentarla, e `src/test/persistenceGuards.test.js` verifica che il verdetto
di permesso del reducer coincida con quello della persistenza. La superficie di
sicurezza lato database è solida: gate RESTRICTIVE per utente attivo, matrice
categoria/ruolo spostata nelle policy, predicato admin condiviso fra le Edge
Function. Nessun `dangerouslySetInnerHTML`, nessun segreto nel repository,
CSP restrittiva senza `unsafe-eval`.

**Il problema non è più la struttura: sono i controlli automatici che la
sorvegliano.** Il workflow *Verifica RPC* ha tre passi. Il primo funziona; gli
altri due, oggi, non danno più un segnale utilizzabile.

- Il workflow **Verifica RPC fallisce a ogni esecuzione dall'8 agosto** (5 run
  su 5 consultati, incluse quelle notturne): la migrazione
  `20260808120000` non risulta registrata in `schema_migrations`. Il contenuto
  è applicato — l'ho verificato colonna per colonna e funzione per funzione, la
  produzione **non è disallineata** — ma un allarme rosso permanente non è
  distinguibile da un allarme vero. Il drift successivo, quello reale, arriverà
  in un workflow già rosso.
- Il controllo **advisor non ha mai girato**: `SUPABASE_ACCESS_TOKEN` non è
  configurato e lo script esce `0` dichiarandosi inconcludente. L'elenco
  `AVVISI_ACCETTATI`, scritto con cura in ST-14 per non far passare i WARN
  nuovi, non ha mai valutato un lint in CI.

E c'è **una bomba a orologeria datata**: `TaskThreads.comments()` /
`history()` leggono due tabelle a crescita monotona senza paginazione.
`task_history` è a **621 righe** e cresce di **~14,8 al giorno** — il cap
`db-max-rows` di PostgREST è a **~26 giorni di distanza** (inizio settembre
2026). Quando arriverà, non ci sarà nessun errore: la cronologia dei task
sparirà dalla UI a ogni evento realtime e ricomparirà a ogni reload.

Sul fronte struttura del codice il debito principale rimasto è il **CSS-in-JS
inline** (1.528 oggetti `style={{}}`, che è il vero motivo per cui i componenti
grandi sono grandi). Il secondo punto — una **duplicazione lasciata aperta a
metà**, `views/archiveFilters.js` creato per unificare tre copie della stessa
logica e `Trash.jsx` restato indietro con la terza — **è stato chiuso lo stesso
giorno** (A-3, §4).

| Indicatore | Valore |
|---|---|
| Moduli sorgente (esclusi i test) | 179 |
| Righe totali `src/` + `supabase/` + `scripts/` | ~55.100 |
| Test | 1138 passati, 7 skip → **1150** dopo la correzione di C-1 (§4) → **1164** dopo M-2…M-6/B-1…B-3 (§4-bis) |
| ESLint | 0 errori, 20 warning `react/no-multi-comp` in 13 file → **0 in 0 file** (✔ risolto, B-3, §4-bis) |
| Migrazioni | 105 locali, 104 registrate in produzione → **105/105** dopo A-1 (§4) |
| File più vicino al limite `max-lines` | `ListeViaggio.jsx` era a **495/500** (✔ risolto, A-4) — ora `TaskSlideOver.jsx`, ~448 |
| Oggetti `style={{…}}` inline | 1.528 → 1.487 (avvio di M-1, §4-bis) → **334** (M-1 chiuso, §4-ter), tutti con almeno una proprietà dinamica. Il numero è ora misurato da `npm run verifica:convenzioni` |
| `'unsafe-inline'` in `style-src` | presente → **rimosso** (§4-ter): la CSP non ha più direttive permissive |

---

## 2. Tabella delle priorità

| # | Rilievo | File | Priorità |
|---|---|---|---|
| **C-1** ✔ | Letture non paginate su tabelle a crescita monotona: troncamento silenzioso previsto per **inizio settembre 2026** — **chiuso il 12 agosto** (§4) | `lib/api.js:289-298` | 🔴 **Critica** |
| **A-1** ✔ | Workflow "Verifica RPC" rosso a ogni run dall'8 agosto: la guardia contro il drift non è più un segnale — **chiuso il 12 agosto** (§4) | `scripts/verifica-rpc/migrazioni.js:52` | 🟠 Alta |
| **A-2** ✔ | Il controllo advisor non ha mai girato: secret assente, exit 0 silenzioso — **chiuso il 13 agosto** (§4): secret configurato, il log conferma una valutazione reale | `.github/workflows/verifica-rpc.yml:80` | 🟠 Alta |
| **A-3** ✔ | Terza copia di `filterByPeriod` + `PERIOD_OPTIONS` + `chipStyle`, mentre il modulo condiviso esiste già — **chiuso il 12 agosto** (§4) | `views/Trash.jsx:17-43,157-169` | 🟠 Alta |
| **A-4** ✔ | `ListeViaggio.jsx` a 495/500 righe: il prossimo intervento sbatte contro il lint — **chiuso il 13 agosto** (§4) | `liste/ListeViaggio.jsx` | 🟠 Alta |
| **M-1** ✔ | 1.528 stili inline: componenti gonfi, nessun design system, `unsafe-inline` obbligato in CSP — **avviato il 13 agosto** (§4-bis, 40 occorrenze in classi utility) e **chiuso lo stesso giorno** (§4-ter): 1.153 sollevati a costanti di modulo, 334 dinamici restano per costruzione, `'unsafe-inline'` via da `style-src` | trasversale | 🟡 Media |
| **M-2** ✔ | "Elimina account" non elimina: ban + `active=false`, nessuna cancellazione dei dati personali — **chiuso il 13 agosto** (§4-bis) | `functions/delete-account/index.ts:39` | 🟡 Media |
| **M-3** ✔ | `AVVISI_ACCETTATI` accetta per *nome del lint*, non per oggetto: una futura funzione `SECURITY DEFINER` esposta ad `anon` passerebbe muta — **chiuso il 13 agosto** (§4-bis) | `verifica-advisor/advisor.js:28` | 🟡 Media |
| **M-4** ✔ | `canAccessListe` non controlla `pending`, `private.can_liste()` sì: divergenza UI/DB nella stessa domanda — **chiuso il 13 agosto** (§4-bis) | `lib/permissions.js:151-155` | 🟡 Media |
| **M-5** ✔ | `UPDATE_TEAM_MEMBER` senza guard admin: il trigger DB reverte **in silenzio**, quindi nessun rollback scatta — **chiuso il 13 agosto** (§4-bis) | `state/persistence.js:381` | 🟡 Media |
| **M-6** ✔ | Font Google via `@import` dentro lo `<style>` iniettato da React: download dopo il mount, nessun preconnect — **chiuso il 13 agosto** (§4-bis) | `styles/GlobalStyles.jsx:15` | 🟡 Media |
| **B-1** ✔ | `invite-user`: `capacity` e `color` non validati — **chiuso il 13 agosto** (§4-bis) | `functions/invite-user/index.ts:57-59` | 🔵 Bassa |
| **B-2** ✔ | `Messages.listAll(2000)`: limite dichiarato oltre il cap del server — **chiuso il 13 agosto** (§4-bis) | `lib/api.js:374` | 🔵 Bassa |
| **B-3** ✔ | 20 warning `react/no-multi-comp` in 13 file — **chiuso il 13 agosto** (§4-bis): 0 in 0 file | trasversale | 🔵 Bassa |

---

## 3. Action plan dettagliato

### 🔴 C-1 · Troncamento silenzioso di commenti e cronologia

> **✔ Chiuso il 12 agosto 2026 — vedi §4.** Il codice qui sotto è quello *prima*
> della correzione: resta perché è il difetto che il test di regressione
> descrive, e perché la classe di errore («omette, e in silenzio») è la stessa
> che si ripresenterà alla prossima lettura nuova.

**File**: `src/lib/api.js:289-298` · consumatore: `src/hooks/useAppHydration.js:109-127`

```js
export const TaskThreads = {
  comments: () =>
    supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)')
      .order('created_at'),                       // ← nessun limite, nessuna paginazione
  history: () =>
    supabase.from('task_history')
      .select('id, task_id, actor_id, action, old_value, new_value, created_at, users(name)')
      .order('created_at'),                       // ← idem
};
```

**Perché è critico.** `lib/pagination.js` apre dichiarando che questa è «la
classe di difetto peggiore che questo data layer possa avere, perché quando si
verifica non sbaglia — omette, e in silenzio». La correzione è stata applicata a
`clients` (ST-3) e alle liste, ma queste due letture sono rimaste fuori — e sono
le uniche due su tabelle che **crescono e non si potano mai**.

Misure prese sulla produzione il 12 agosto 2026:

| Tabella | Righe | Crescita | Margine dal cap |
|---|---|---|---|
| `task_history` | **621** | ~14,8/giorno (dal 1° luglio) | **~26 giorni** |
| `comments` | 7 | trascurabile | ampio |

Il sintomo, quando arriverà, è peggiore di un errore, perché è **intermittente
e si auto-guarisce**:

1. l'idratazione completa usa `TASK_SELECT_WITH_COMMENTS`, dove commenti e
   cronologia sono *risorse annidate* — non toccate dal cap. Dopo un reload,
   tutto è corretto;
2. ma appena qualcuno commenta, `useAppHydration` prende la strada `soloThread`
   e ricarica le due tabelle **piatte**, dove il cap morde;
3. `SET_TASK_THREADS` fa `comments[t.id] || []` (`reducer.js:243`): i task le cui
   righe sono cadute oltre la soglia ricevono **array vuoto**, non "invariato";
4. l'ordinamento è `created_at` **ascendente** → a sparire sono le righe **più
   recenti**, cioè proprio quelle che si stanno guardando.

Risultato: la cronologia di un task svanisce quando un collega commenta
qualcos'altro, e torna premendo F5. È il genere di difetto che si attribuisce
alla rete per settimane.

**Soluzione.**

```js
// src/lib/api.js
import { fetchAllRows, WITH_COUNT } from './pagination.js';   // già importato

// `.order('id')` come seconda chiave: fetchAllRows richiede un ordinamento
// DETERMINISTICO e `created_at` non è unico — due righe scritte nello stesso
// trigger (status + priority cambiati insieme) hanno lo stesso timestamp, e
// senza la seconda chiave due pagine consecutive possono ripetere o saltare
// una riga. Stessa ragione del `.order('name').order('id')` su Clients.list.
export const TaskThreads = {
  comments: () =>
    fetchAllRows(() => supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)', WITH_COUNT)
      .order('created_at').order('id')),
  history: () =>
    fetchAllRows(() => supabase.from('task_history')
      .select('id, task_id, actor_id, action, old_value, new_value, created_at, users(name)', WITH_COUNT)
      .order('created_at').order('id')),
};
```

`fetchAllRows` ritorna già `{ data, error }`: `useAppHydration` non cambia.

**Il passo che non va saltato.** Paginare rende la lettura *corretta*, non
*sostenibile*: fra un anno significherà scaricare ~6.000 righe di cronologia a
ogni commento. Il seguito naturale è leggere le due tabelle **per task aperto**
invece che per intero — è la stessa decisione già dichiarata aperta per i
messaggi (ST-4, soglia `messages > ~1500`), e le due vanno prese insieme.
Nell'immediato vale anche una potatura: `task_history` oltre i 24 mesi non è
consultata da nessuna vista.

Da chiudere nello stesso commit, per la stessa ragione: **`Tasks.list()`**
(`api.js:242`, 276 righe oggi, cestino incluso) — il commento in `api.js:643`
lo indica già come «il prossimo candidato».

---

### 🟠 A-1 · La guardia contro il drift è rossa da cinque giorni

> **✔ Chiuso il 12 agosto 2026 — vedi §4.** Applicata la prima delle due vie
> proposte qui sotto (registrare la riga), non la seconda: l'eccezione sarebbe
> stata una riga falsa in un elenco che esiste per i casi non tracciabili.

**File**: `scripts/verifica-rpc/migrazioni.js:52` · workflow `.github/workflows/verifica-rpc.yml`

Storico dei run di *Verifica RPC*: **failure** su tutte e cinque le esecuzioni
consultate (11-12 agosto, push e schedule). Il log:

```
✗ 1 migrazioni presenti nel repository non risultano applicate:
    20260808120000_origin_client_clients_task_history.sql
```

**Verificato sulla produzione: non è un drift vero.** Ho controllato uno per uno
i quattro effetti di quella migrazione:

| Effetto atteso | Stato in produzione |
|---|---|
| `clients.origin_client` | ✔ presente |
| `task_history.origin_client` | ✔ presente (44 righe già valorizzate) |
| `log_task_history()` propaga `origin_client` | ✔ presente nel corpo della funzione |
| `modifica_lista()` azzera `origin_client` | ✔ presente nel corpo della funzione |

È stata applicata a mano senza passare dallo strumento che scrive in
`supabase_migrations.schema_migrations`: manca **solo la riga di registro**.

**Perché resta Alta nonostante non ci sia nulla di rotto.** È esattamente la
situazione che `sonda.js` e `migrazioni.js` descrivono nei loro commenti come da
evitare: «un falso positivo permanente è il modo per cui un controllo smette di
essere creduto». Il workflow gira su ogni push a `main` — cioè su ciò che Vercel
manda in produzione — e da cinque giorni chi lo guarda ha una sola informazione:
*è rosso come ieri*. Il prossimo scarto vero sarà indistinguibile.

**Soluzione — l'ordine conta.** Prima si registra la riga mancante (fix
definitivo), e solo se non è possibile si ricorre all'eccezione:

```sql
-- Da eseguire una volta sola: allinea il registro alla realtà già applicata.
insert into supabase_migrations.schema_migrations (version, name)
values ('20260808120000', 'origin_client_clients_task_history')
on conflict do nothing;
```

Se si preferisce non toccare la tabella di sistema, la via già prevista dal
progetto è l'eccezione **nominata con il motivo**, come le altre tre:

```js
// scripts/verifica-rpc/migrazioni.js
export const ECCEZIONI_STORICHE = new Set([
  '20260610_notifications_extra',
  '20260610_step_j_fix',
  '20260614_mention_composite_names',
  // 20260808120000 · applicata a mano l'8 agosto (colonne, log_task_history()
  // e modifica_lista() verificate presenti in produzione il 12 agosto), ma non
  // registrata in schema_migrations: lo strumento usato non scrive nel
  // registro. Il contenuto NON è in scarto — lo è solo la riga di bookkeeping.
  '20260808120000_origin_client_clients_task_history',
]);
```

Poi rilanciare con `workflow_dispatch`: applicare una migrazione non tocca il
repository, quindi nulla farebbe ripartire il controllo da solo.

---

### 🟠 A-2 · Il controllo advisor non ha mai valutato un lint

> **✔ Chiuso il 13 agosto 2026 — vedi §4.** Chiuso in due tempi: il 12 la
> correzione di codice (annotazione sul salto), il 13 chi amministra il
> repository ha generato il token e configurato il secret. Il rilancio del
> workflow (run #91) conferma nel log una valutazione reale: 20 lint, 0
> errori, 0 avvisi non accettati.

**File**: `.github/workflows/verifica-rpc.yml:80` · `scripts/verifica-advisor/index.js:47`

Dal log del run del 12 agosto:

```
env:
  SUPABASE_ACCESS_TOKEN:
⚠  SUPABASE_ACCESS_TOKEN non configurato: controllo advisor saltato.
```

**Perché conta.** Il rilievo ST-14 ha costruito un meccanismo preciso —
`AVVISI_ACCETTATI`, l'accettazione nominata, il messaggio «se è una scelta
consapevole, nominala con il motivo accanto» — e quel meccanismo **non ha mai
girato in CI**. L'exit `0` silenzioso era la scelta giusta il giorno in cui il
controllo è stato aggiunto (un controllo nuovo non deve rendere rosso il
workflow di chi non l'ha chiesto), ma è diventato il modo in cui il controllo
non esiste senza che nessuno se ne accorga.

Eseguendolo a mano oggi: 10 lint WARN, tutti coperti dall'elenco, **nessun
ERROR**. Nessuna sorpresa — il che rende la correzione economica e senza rischi.

**Soluzione, due parti.**

1. Configurare il secret: Supabase → Account → Access Tokens (sola lettura) →
   GitHub → Settings → Secrets and variables → Actions → `SUPABASE_ACCESS_TOKEN`.
2. Rendere l'assenza del secret **visibile invece che silenziosa**:

```js
// scripts/verifica-advisor/index.js
if (!token) {
  console.log('⚠  SUPABASE_ACCESS_TOKEN non configurato: controllo advisor saltato.');
  console.log('   Vedi il commento in cima a questo file per come crearlo.');
  // Annotazione GitHub: compare in cima al run e nel riepilogo della PR.
  // Senza, "saltato" e "passato" hanno lo stesso aspetto nell'interfaccia —
  // ed è così che questo controllo è rimasto inerte dal giorno in cui è nato.
  console.log('::warning title=Advisor non verificati::' +
    'SUPABASE_ACCESS_TOKEN assente: gli advisor Supabase non sono stati controllati.');
  process.exit(0);
}
```

---

### 🟠 A-3 · La terza copia del filtro per periodo

> **✔ Chiuso il 12 agosto 2026 — vedi §4.**

**File**: `src/components/views/Trash.jsx:17-43` e `:157-169`

`src/components/views/archiveFilters.js` è nato con questa intestazione:

> «Filtro per periodo e chip di selezione, **condivisi** dall'archivio task e
> dall'archivio liste viaggio: due viste diverse, la stessa domanda e finora due
> copie della stessa logica.»

Lo importano `Archive.jsx:17` e `ArchivedListe.jsx:15`. **`Trash.jsx` no**: ha
la propria `PERIOD_OPTIONS`, la propria `filterByPeriod` (identica salvo il
campo data, cablato su `deletedAt`) e — righe 162-169 — lo stile del chip
**carattere per carattere uguale** a `chipStyle(active)`.

**Perché è Alta e non Media.** Non è "codice duplicato" in astratto: è un
consolidamento **fatto e lasciato a metà**, che è la forma peggiore. Chi legge
`archiveFilters.js` conclude che la regola vive in un posto solo; chi cambia
l'etichetta di un periodo la cambia in due viste su tre. La prova che la deriva
è già iniziata: il primo periodo si chiama `"Sempre"` nel modulo condiviso e
`"Tutti"` in `Trash.jsx`.

**Soluzione.** `filterByPeriod` accetta già il nome del campo data
(`filterByPeriod(items, period, dateField)`): non serve generalizzarla, serve
usarla.

```jsx
// src/components/views/Trash.jsx
import { PERIOD_OPTIONS, filterByPeriod, chipStyle } from "./archiveFilters.js";
// ↑ e si cancellano le righe 17-43 (PERIOD_OPTIONS + filterByPeriod locali)

// riga 72, dove oggi si chiama la copia locale a due argomenti:
const visible = filterByPeriod(trashed, period, "deletedAt");

// e i chip, al posto delle righe 158-170:
{PERIOD_OPTIONS.map(opt => (
  <button key={opt.key} type="button"
          onClick={() => setPeriod(opt.key)}
          style={chipStyle(period === opt.key)}>
    {opt.label}
  </button>
))}
```

Effetto: −27 righe da un file che è a 444/500, una definizione sola per tre
viste, e la stessa etichetta ovunque. La regola ESLint che tiene chiuso il
percorso può seguire, sul modello di `VIETATI_IMPORT_LISTE_EAGER`.

---

### 🟠 A-4 · `ListeViaggio.jsx` è a 495 righe su 500

> **✔ Chiuso il 13 agosto 2026 — vedi §4.**

**File**: `src/components/liste/ListeViaggio.jsx`

Misurato con la stessa regola che fallisce in CI (`max-lines`, `skipBlankLines`,
`skipComments`): **495**. Cinque righe di margine.

`max-lines` è stata promossa da warning a errore proprio perché «un errore a
zero violazioni dice una cosa sola e verificabile: il prossimo che supera la
soglia si ferma qui invece che in code review». Funziona — ma il prossimo a
fermarsi è chiunque tocchi il modulo Liste, e si fermerà **mentre sta facendo
altro**: lo split verrà fatto di corsa, dentro un commit che doveva parlare
d'altro. Meglio farlo adesso, quando è una scelta.

**Soluzione.** Il file contiene già tre cose separabili senza discussione:

```
src/components/liste/
├── listeOrdinamento.js   ← FILTRI, FILTRI_ALTROVE, ORDINAMENTI, cmpData,
│                            filtraListe, ordinaListe        (righe 33-101, pure)
├── ListaRow.jsx          ← il componente riga                (righe 103-146)
└── ListeViaggio.jsx      ← il solo contenitore               (~350 righe)
```

Le funzioni delle righe 33-101 sono **pure** e già esportate (`filtraListe`,
`ordinaListe` sono importate dai test): spostarle non tocca nessun consumatore
oltre all'import. `ListaRow` è un secondo componente nello stesso file, quindi
l'estrazione chiude anche uno dei 20 warning `react/no-multi-comp` (B-3).

Stesso trattamento, con meno urgenza, per `TaskSlideOver.jsx` (448) e
`Trash.jsx` (444, che A-3 porta già a ~417).

---

### 🟡 M-1 · 1.528 stili inline: la vera ragione per cui i componenti sono lunghi

> ✔ **Chiuso il 13 agosto — vedi §4-ter.** Quel che segue è il rilievo come
> era scritto, tenuto perché la sua terza conseguenza (la CSP) è stata chiusa
> per una via che questa analisi dava per impraticabile. Il punto (c)
> dell'ordine consigliato, in fondo, contiene l'errore.

**File**: trasversale — `Trash.jsx` 68 occorrenze, `TaskSlideOver.jsx` 67,
`CalendarPlanner.jsx` 58, `AdvancedSearchPanel.jsx` 50.

Tre conseguenze, in ordine di importanza:

1. **Fa sembrare grandi componenti che non lo sono.** In `Trash.jsx` la logica
   sta in un centinaio di righe; le altre 350 sono presentazione. La soglia
   `max-lines` misura quindi soprattutto quanto CSS c'è nel file, non quanta
   responsabilità.
2. **Impedisce di stringere la CSP.** `GlobalStyles` inietta un `<style>`, e
   per questo `vercel.json` deve concedere `style-src 'unsafe-inline'`. È
   l'unica direttiva permissiva rimasta in una CSP per il resto esemplare.
3. **Costo di render.** Ogni `style={{…}}` è un oggetto nuovo a ogni render:
   prop sempre diversa, `memo` che non può mai saltare — è la stessa classe di
   problema di `openChatTo` documentata in `VoyageDesk.jsx:231`, applicata a
   1.528 casi invece che a uno.

**Non serve un big-bang** (né una libreria: le dipendenze di runtime sono
quattro, e vanno tenute quattro). Il progetto ha già il pattern giusto in
`liste/listeStyles.jsx`, `admin/adminStyles.js`, `clients/clientStyles.js`:
oggetti di stile **estratti dal componente e definiti una volta a livello di
modulo**.

```jsx
// PRIMA — src/components/views/Trash.jsx, dentro il render
<div style={{ display: "flex", alignItems: "center", gap: 10 }}>

// DOPO — in cima al file (o in views/trashStyles.js quando sono molti):
// fuori dal componente = una sola allocazione per l'intera vita del modulo,
// non una per render.
const RIGA = { display: "flex", alignItems: "center", gap: 10 };
// …
<div style={RIGA}>
```

Ordine consigliato: (a) estrarre gli stili **costanti** dei quattro file più
densi — meccanico, verificabile a vista, nessun rischio; (b) portare in
`styles/tokens.js` quelli che si ripetono fra viste (il chip di A-3 è già uno);
(c) quando il `<style>` globale sarà l'ultimo consumatore di `unsafe-inline`,
spostarlo in un `.css` importato da Vite e **stringere la CSP** — che è la parte
che paga davvero.

---

### 🟡 M-2 · "Elimina account" non elimina

**File**: `supabase/functions/delete-account/index.ts:39-47`

```ts
const { error: banErr } = await adminClient.auth.admin.updateUserById(user.id, {
  ban_duration: "87600h",          // 10 anni
});
// …
await adminClient.from("users").update({ active: false }).eq("id", user.id);
```

`api.js:203` è esplicito sul perché — «Does NOT hard-delete: preserves
comments/messages» — ed è una scelta tecnicamente corretta: la FK CASCADE
porterebbe via commenti e messaggi altrui.

**Il problema non è tecnico, è di parola data.** L'utente clicca "Elimina
account" e i suoi dati personali restano: nome, avatar, e in `user_contacts`
**email e telefono** — leggibili, per policy, da ogni utente autenticato
(`20260629222802_user_contacts_select_team`). Per un gestionale che tratta
anagrafiche di clienti reali in UE, "cancellazione" che significa "sospensione"
è una promessa che il codice non mantiene.

**Soluzione — anonimizzare invece che cancellare**, che soddisfa entrambi i
vincoli:

```ts
// Ban (revoca la sessione) + anonimizzazione dei dati personali. Le righe
// figlie restano, con l'autore ridotto a "Utente eliminato": i thread di
// commenti e le conversazioni non si sbriciolano, e nessun dato personale
// sopravvive alla richiesta di cancellazione.
const { error: banErr } = await adminClient.auth.admin.updateUserById(user.id, {
  ban_duration: "87600h",
});
if (banErr) { /* … invariato … */ }

await adminClient.from("users").update({
  active: false,
  name: "Utente eliminato",
  avatar: "??",
  photo_url: null,
}).eq("id", user.id);

// I PII veri vivono qui, non su public.users (migrazione 20260613100833).
await adminClient.from("user_contacts").delete().eq("user_id", user.id);
```

Da accompagnare con una riga nella modale di conferma che dica cosa succede
davvero («il tuo accesso viene revocato e i tuoi dati personali rimossi; i
messaggi già inviati restano visibili come "Utente eliminato"»). E la stessa
domanda va posta per `delete-user` (admin), che invece hard-elimina.

---

### 🟡 M-3 · Gli avvisi accettati sono nominati per lint, non per oggetto

**File**: `scripts/verifica-advisor/advisor.js:28-49`

```js
const AVVISI_ACCETTATI = new Set([
  'anon_security_definer_function_executable',        // ← per NOME del lint
  'authenticated_security_definer_function_executable',
  // …
]);
```

L'intento di ST-14 era «l'accettazione è NOMINATA», per non perdere i WARN
nuovi. La granularità però si ferma al *tipo* di lint, non all'*oggetto*: oggi
`anon_security_definer_function_executable` copre `get_migrazioni_applicate()`
— esposta ad `anon` con una motivazione scritta ed esaminabile. Ma domani
**qualunque** nuova funzione `SECURITY DEFINER` concessa ad `anon` finirebbe
sotto la stessa riga, silenziosamente. Cioè proprio il caso che l'elenco esiste
per intercettare, applicato alla categoria di lint più delicata delle quattro.

**Soluzione — accettare la coppia (lint, oggetto)**, che l'advisor fornisce già
in `metadata.name`:

```js
// Per i lint che parlano di un OGGETTO specifico, l'accettazione è per oggetto:
// accettare il tipo di lint significherebbe accettare in anticipo anche le
// funzioni che non esistono ancora — che è il caso che conta.
const FUNZIONI_ESPOSTE_ACCETTATE = new Set([
  'get_migrazioni_applicate',        // version/name già pubblici nel repo Git
  'get_vapid_public_key',            // chiave PUBBLICA VAPID
  'reset_completo', 'importa_backup', 'elimina_lista_definitivamente',
  'rimuovi_beneficiario_lista', 'sposta_titolare_lista', 'send_test_push',
  // Le RPC del modulo Liste: gate applicativo interno (private.can_liste /
  // private.is_admin) — vedi docs/SICUREZZA.md.
]);

const LINT_PER_OGGETTO = new Set([
  'anon_security_definer_function_executable',
  'authenticated_security_definer_function_executable',
]);

export function valutaLints(lints) {
  const errori = lints.filter((l) => l.level === 'ERROR');
  const avvisi = lints.filter((l) => l.level === 'WARN');
  const accettato = (l) => (LINT_PER_OGGETTO.has(l.name)
    ? FUNZIONI_ESPOSTE_ACCETTATE.has(l.metadata?.name)
    : AVVISI_ACCETTATI.has(l.name));
  const nonAccettati = avvisi.filter((l) => !accettato(l));
  return { fallisce: errori.length > 0 || nonAccettati.length > 0, errori, avvisi, nonAccettati };
}
```

Con i 10 lint attuali l'esito non cambia (verificato). Cambia il giorno in cui
qualcuno esporrà la prossima funzione.

---

### 🟡 M-4 · `canAccessListe` e `can_liste()` non rispondono la stessa cosa

**File**: `src/lib/permissions.js:151-155` vs migrazione `20260806130000`

```js
export const canAccessListe = (team, userId) => {
  const m = getMember(team, userId);
  if (!m || m.active === false) return false;      // ← manca `pending`
  return RUOLI_LISTE.includes(toDbRole(m.role));
};
```

```sql
create or replace function private.can_liste() ... as $$
  SELECT EXISTS (SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.active
      AND coalesce(u.pending, false) = false      -- ← il database lo controlla
      AND u.role = ANY (ARRAY['admin','manager','agent']));
$$;
```

L'intestazione della funzione dichiara: «Rispecchia `private.can_liste()` lato
database». Oggi non lo fa più — la migrazione `20260806130000` ha aggiunto
`pending` a tutti e cinque gli helper `private.*`, e la controparte JavaScript
non è stata aggiornata.

**Impatto pratico: nullo oggi.** `main.jsx:135` monta `PendingScreen` prima di
`VoyageDesk`, quindi un utente `pending` non arriva mai a questa funzione. E la
divergenza è nella direzione sicura (il client concede, il database nega).

**Perché va comunque chiusa.** È esattamente la classe di difetto che questo
file, nella sua intestazione, dichiara di esistere per prevenire: «a divergere è
il livello che decide *cosa mostrare* rispetto a quello che decide *cosa è
permesso*». Una funzione che afferma di rispecchiare il database e non lo fa è
peggio di una che non lo afferma. Nello stesso file, `getAssignableTeam` il
controllo lo fa (`m.active !== false && !m.pending`).

```js
export const canAccessListe = (team, userId) => {
  const m = getMember(team, userId);
  // `pending` come `active`: la 20260806130000 lo ha aggiunto a tutti gli
  // helper private.*, e questa funzione dichiara di rispecchiarli.
  if (!m || m.active === false || m.pending) return false;
  return RUOLI_LISTE.includes(toDbRole(m.role));
};
```

---

### 🟡 M-5 · `UPDATE_TEAM_MEMBER`: il trigger reverte in silenzio, il rollback non scatta

**File**: `src/state/persistence.js:381-431` · trigger `20260806120000`

Il guard copre due casi (ruolo fuori enum, auto-declassamento) ma **non
verifica che il chiamante sia admin**. La difesa è delegata alla RLS — che però
per le colonne privilegiate non rifiuta: le **riscrive**.

```sql
create or replace function public.users_block_privileged_self_update() ... as $$
begin
  if private.is_admin() then return new; end if;
  new.role      := old.role;      -- ← non solleva: riporta indietro, in silenzio
  new.seniority := old.seniority;
  ...
```

Conseguenza: per un chiamante non-admin l'`UPDATE` **riesce**, PostgREST
risponde 200, `res.error` è `null` → il `rollback` dichiarato non viene mai
invocato, e lo state React conserva il ruolo nuovo mentre il database ha quello
vecchio. È letteralmente il disallineamento descritto nel commento di questa
stessa entry («l'unico segnale del problema era il ruolo che tornava indietro al
reload successivo»), che il rollback doveva chiudere e in questo percorso non
chiude.

**Impatto pratico: basso.** `AdminView` è montata solo per gli admin
(`VoyageDesk.jsx:333` + `reducer.js:73`), quindi il percorso richiede una
`dispatch` costruita a mano. È difesa in profondità, non un buco aperto.

**Soluzione — due righe, ai due livelli che il progetto tiene già allineati:**

```js
// src/state/persistence.js — nel guard di UPDATE_TEAM_MEMBER
guard: (s, a, uid) => {
  // Il trigger users_block_privileged_self_update REVERTE senza errore per un
  // chiamante non-admin: la scrittura "riesce", quindi nessun rollback può
  // accorgersene. Il rifiuto deve arrivare prima della rete.
  if (!isAdmin(s.team, uid)) return false;
  const next = toDbRole(a.payload?.role);
  if (!next) return false;
  return a.payload?.id !== uid || next === 'admin';
},
```

```js
// src/state/reducer.js — case "UPDATE_TEAM_MEMBER", stesso rifiuto
if (!isAdmin(state.team, uid)) return _denied("Operazione riservata agli amministratori");
```

`persistenceGuards.test.js` verifica già che i due verdetti coincidano: il test
copre la modifica senza bisogno di un caso nuovo.

---

### 🟡 M-6 · I font partono dopo il mount di React

**File**: `src/styles/GlobalStyles.jsx:15` · `index.html`

```jsx
export const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display…');
```

Consolidare in un `@import` unico è stato un miglioramento reale (prima il
modulo Liste ne aveva uno suo). Ma la posizione resta la peggiore possibile: il
browser scopre l'`@import` **solo dopo** aver scaricato il bundle, eseguito
React e montato `<GlobalStyles/>` — poi risolve `fonts.googleapis.com`, scarica
il CSS, e *solo allora* scopre i `.woff2` su `fonts.gstatic.com`. Sono due
round-trip DNS+TLS in serie, in fondo alla catena critica, su un'app che si apre
molto da mobile. `index.html` non ha alcun `preconnect`.

**Soluzione — spostare la dichiarazione dove il preload scanner la vede subito:**

```html
<!-- index.html, dentro <head> prima dello <script type="module"> -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" media="print" onload="this.media='all'"
      href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=DM+Sans:wght@300;400;500;600&family=Inter:wght@400;500;600;700&display=swap" />
```

e la riga 15 di `GlobalStyles.jsx` si cancella. Il `media="print"` + `onload`
rende il foglio non bloccante mantenendo la scoperta anticipata; `display=swap`
è già presente, quindi il testo resta leggibile durante lo scambio. La CSP
consente già entrambi gli host.

---

### 🔵 B-1 · `invite-user`: due campi non validati

**File**: `supabase/functions/invite-user/index.ts:57-59`

```ts
const capacity: number = Number(body.capacity) || 8;   // accetta -5, 1e9, 0.5
const color: string = body.color || "#3B82F6";         // stringa libera
```

Il ruolo è validato contro un `Set` e la `redirectTo` da `safeRedirect` — questi
due no. Non è sfruttabile (chiama solo un admin attivo, e `color` finisce in
`style={{background: …}}` che React tratta via CSSOM), ma un `capacity` di
`1e9` sballa i calcoli di carico del team e un `color` non valido rende
invisibile un avatar.

```ts
const capacity: number = Math.min(40, Math.max(1, Math.round(Number(body.capacity)) || 8));
const HEX = /^#[0-9a-fA-F]{6}$/;
const color: string = HEX.test(body.color ?? "") ? body.color : "#3B82F6";
```

### 🔵 B-2 · `Messages.listAll(2000)` chiede più del massimo servibile

**File**: `src/lib/api.js:374` — il `.limit(2000)` è oltre il cap `db-max-rows`,
quindi il valore reale è il cap, non 2000. Oggi `messages` è a 13 righe e non è
un problema; rientra nella stessa decisione già aperta di ST-4 (messaggi per
conversazione). Da allineare quando si chiuderà C-1, con cui condivide la causa.

### 🔵 B-3 · 19 warning `react/no-multi-comp` (era 20)

Arretrato dichiarato e stabile. L'estrazione di `ListaRow` (A-4, §4) lo ha già
chiuso di uno senza lavoro aggiuntivo — misurato: 19 casi in 12 file, contro i
20 in 13 di apertura. Gli altri diciotto restano churn non giustificato
finché i file sono sotto soglia.

---

## 4. Correzioni applicate — 12 agosto 2026

Chiusi **C-1** e **A-1**, cioè il rilievo con una data e la guardia che non
guardava più. Gli altri undici restano aperti.

### ✔ C-1 — le tre letture ora paginano

`src/lib/api.js`: `TaskThreads.comments()`, `TaskThreads.history()` e
`Tasks.list()` passano da `fetchAllRows` + `WITH_COUNT`, ciascuna con un
ordinamento chiuso su `id`.

Le prime due erano il rilievo; la terza era dichiarata «il prossimo candidato»
nel commento in fondo a `Clients.list` e in `docs/CLAUDE.md`, ferma sulla
riserva che `count: 'exact'` avesse «un costo per richiesta da misurare prima»,
perché la sua select porta commenti e cronologia annidati. **Misurato**, e la
riserva non regge: il conteggio esatto di PostgREST è un aggregato sulla sola
tabella di primo livello — le risorse annidate non vi entrano — quindi è un
`select count(*) from tasks`, che in produzione costa **11 ms** comprensivi di
pianificazione, contro uno `statement_timeout` di 8 s. Tenerle separate avrebbe
significato lasciare aperto per un costo dello 0,14% del budget di richiesta il
difetto che questo audit chiama critico.

Sulla seconda chiave di ordinamento c'è un dettaglio che vale più della regola
generale: su `task_history` `created_at` **non è unico per costruzione**, non
per caso. `log_task_history()` inserisce più righe nella STESSA transazione
quando un update cambia più campi insieme (stato e priorità in un solo salvataggio
hanno lo stesso timestamp al microsecondo). Senza `.order('id')` sarebbe proprio
la tabella più esposta al cap ad avere anche l'ordinamento meno stabile.

Blindato da 12 nuovi casi in `src/test/paginazione.test.js` (`describe.each` sulle
tre letture: pagina, chiede il conteggio, ordina in modo deterministico,
restituisce tutte e 1500 le righe finte contro un cap simulato di 1000).
Il fake builder del test ha ora un `.is()` concatenabile, che serve al filtro
del cestino di `Tasks.list`.

**Test: 1150 passati** (erano 1138), lint 0 errori.

### ✔ A-1 — il registro delle migrazioni è allineato

```sql
insert into supabase_migrations.schema_migrations (version, name)
values ('20260808120000', 'origin_client_clients_task_history')
on conflict (version) do nothing;
```

Eseguita in produzione il 12 agosto. È la correzione *giusta* delle due che
questo documento proponeva, e la differenza non è di comodità: `ECCEZIONI_STORICHE`
esiste per le migrazioni che **non sono tracciabili** (applicate prima che il
progetto avesse un flusso tracciato, o spezzate in più chiamate con nomi
diversi). Questa non è nessuna delle due — è applicata e perfettamente
identificabile — quindi metterla fra le eccezioni avrebbe archiviato come
"non verificabile" l'unico caso che invece si poteva semplicemente sistemare,
e avrebbe lasciato in quel Set una riga falsa da spiegare a chi la leggerà fra
sei mesi.

`statements` resta `NULL`: registrare un corpo SQL che non è stato eseguito da
questo percorso direbbe una cosa non vera su *come* la migrazione è arrivata in
produzione.

Il workflow *Verifica RPC* è stato rilanciato con `workflow_dispatch` — applicare
una migrazione non tocca il repository, quindi niente lo avrebbe fatto ripartire
da solo.

> ⚠️ La verifica non è ripetibile da questo ambiente: `npm run verifica:migrazioni`
> in locale risponde `HTTP 403: Host not in allowlist` (la stessa egress policy
> di B-2 nell'audit dell'11 agosto, lì sulla CDN di SheetJS). Il controllo va
> letto da GitHub Actions, che la raggiunge.

### ✔ A-3 — la terza copia è sparita

`src/components/views/Trash.jsx` importa ora `PERIOD_OPTIONS`, `filterByPeriod`
e `chipStyle` da `./archiveFilters.js`, esattamente come proposto: nessuna
generalizzazione, `filterByPeriod` accettava già il nome del campo data e non
lo usava solo questo call site.

```jsx
import { PERIOD_OPTIONS, filterByPeriod, chipStyle } from "./archiveFilters.js";
// …
const visible = filterByPeriod(trashed, period, "deletedAt");
// …
{PERIOD_OPTIONS.map(opt => (
  <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)}
          style={chipStyle(period === opt.key)}>
    {opt.label}
  </button>
))}
```

Effetto misurato: **458 righe** (da 490), tre viste su tre ora sulla stessa
definizione, e la stessa etichetta ovunque — il primo periodo si chiama
**"Sempre"** anche nel Cestino, non più **"Tutti"**. Nessun test verificava quel
testo (cercato in `Trash.test.jsx`: nessuna occorrenza), quindi il cambio
lessicale non ha richiesto di toccare i test.

Non fatta la regola ESLint proposta a chiusura del paragrafo (sul modello di
`VIETATI_IMPORT_LISTE_EAGER`): con l'unica copia rimasta ora quella condivisa,
non c'è più un secondo percorso da cui la regola dovrebbe difendere — resta un
miglioramento a sé, non parte della correzione di A-3.

### ✔ A-2 — chiuso in due tempi: il codice il 12, il secret il 13

Il 12 agosto, la sola parte di codice: `scripts/verifica-advisor/index.js`, nel
ramo che si prende quando `SUPABASE_ACCESS_TOKEN` non è impostato, emette
un'annotazione GitHub oltre ai due `console.log` che già c'erano:

```js
console.log('::warning title=Advisor non verificati::' +
  'SUPABASE_ACCESS_TOKEN assente: gli advisor Supabase non sono stati controllati.');
```

Verificato eseguendo lo script senza il token in locale: l'annotazione compare,
`exit 0` invariato (un controllo nuovo non deve rendere rosso il workflow di
chi non l'ha richiesto — resta vero anche dopo la correzione).

Configurare il secret — generare un Personal Access Token dalla dashboard
Supabase e salvarlo come `SUPABASE_ACCESS_TOKEN` nelle impostazioni GitHub del
repository — era fuori dalla portata degli strumenti disponibili: **il 13
agosto** l'ha fatto chi amministra il repository.

Il workflow è stato rilanciato con `workflow_dispatch` (run #91, `success`).
Il log dello step "Verifica gli advisor" non è più il messaggio di skip:

```
0 errori, 0 avvisi non accettati, 10 avvisi motivati (20 lint totali).
```

**20 lint totali** è la somma di `security` + `performance`: la prova diretta
che lo script sta chiamando davvero la Management API e classificando ogni
lint, non limitandosi a uscire 0. Coincide con quanto verificato il 12 agosto
con `get_advisors` (0 ERROR, i 10 WARN tutti in `AVVISI_ACCETTATI`): nessuna
sorpresa, come previsto.

### ✔ A-4 — `ListaRow` e la logica di ordinamento hanno il proprio file

Estratte, come proposto, le due parti separabili senza discussione:

```
src/components/liste/
├── listeOrdinamento.js   ← FILTRI, FILTRI_ALTROVE, ORDINAMENTI, cmpData,
│                            filtraListe, ordinaListe        (pure)
├── ListaRow.jsx          ← il componente riga
└── ListeViaggio.jsx      ← il solo contenitore
```

`filtraListe` e `ordinaListe` erano già esportate per i test (`listeApi.test.js`,
`listeRicerca.test.jsx`): spostarle ha richiesto aggiornare quei due import,
nessun altro consumatore. `ListaRow` non dipendeva da alcuno stato del
genitore — solo da `listeApi.js` per la formattazione.

Effetto: `ListeViaggio.jsx` esce dalla zona rossa di `max-lines`, e
l'estrazione di `ListaRow` chiude anche uno dei venti casi `react/no-multi-comp`
aperti (**B-3**, ora 19 in 12 file — rimisurato da `npm run verifica:convenzioni`,
che ha anche imposto l'aggiornamento del numero scritto a mano in `CLAUDE.md`,
esattamente come previsto da ST-13).

Non fatta l'estrazione equivalente su `TaskSlideOver.jsx` (448) e `Trash.jsx`
(417 dopo A-3): restano sotto soglia, quindi il rilievo originale li segnalava
solo "con meno urgenza" — non erano parte di A-4.

---

## 4-bis. Correzioni applicate — 13 agosto 2026 (M-2…M-6, B-1…B-3)

Secondo intervento della stessa giornata di A-2/A-4. Sette dei nove rilievi
Media/Bassa sono chiusi con codice; M-1 restava aperto — vedi la sua
sottosezione per il perché di allora e per cosa era stato comunque fatto.
**È stato poi chiuso nel terzo intervento della stessa giornata: §4-ter**, che
corregge anche l'errore tecnico contenuto in quella sottosezione.

### ✔ M-2 — "Elimina account" ora anonimizza, non solo banna

`supabase/functions/delete-account/index.ts`: dopo il ban (invariato, resta
l'operazione critica che va a buon fine per prima), tre operazioni in
parallelo con `Promise.allSettled` — nessuna deve poter far fallire la
richiesta il cui passo critico è già passato:

```ts
adminClient.from("users").update({
  active: false, name: "Utente eliminato",
  avatar: null, color: null, photo_url: null,
}).eq("id", user.id),
adminClient.from("user_contacts").delete().eq("user_id", user.id),
adminClient.from("push_subscriptions").delete().eq("user_id", user.id),
adminClient.storage.from("avatars").remove([`${user.id}/avatar.jpg`]),
```

Come proposto: `user_contacts` (email/telefono, l'unica vera PII fuori da
`public.users` dal 20260613100833) sparisce, il nome diventa un segnaposto
leggibile nei thread preservati invece di restare quello vero. Aggiunta
rispetto alla proposta: anche le sottoscrizioni push (endpoint del
dispositivo — inutili con l'account bannato, e comunque PII) e il file
avatar nel bucket privato. `comments`/`messages`/`tasks` restano intatti,
per la stessa ragione già scritta nel file: sono cronologia condivisa del
team, non dati personali dell'account che se ne va.

### ✔ M-3 — l'accettazione per lint-e-oggetto, non solo per lint

`scripts/verifica-advisor/advisor.js`: `FUNZIONI_SECURITY_DEFINER_VERIFICATE`
(le otto funzioni di `docs/SICUREZZA.md` §1) più
`LINT_PER_FUNZIONE_SECURITY_DEFINER` (i due soli lint per cui il nome non
basta). `valutaLints` ora
richiede, per quei due, che `metadata.name` sia una delle otto — **fail
closed**: un lint senza `metadata.name` leggibile non è accettato al buio,
resta un rilievo aperto invece di sparire in silenzio, la stessa scelta già
fatta per gli avvisi nuovi in generale. Quattro test nuovi in
`verificaAdvisor.test.js`, incluso il caso che il rilievo descrive: una
funzione mai vista con lo stesso nome di lint delle otto note.

### ✔ M-4 — `canAccessListe` rifiuta anche i pending

`src/lib/permissions.js`: aggiunto `|| m.pending` esattamente come proposto.
Il test che prima fissava il comportamento vecchio (`permissions.test.js`,
"un utente ancora in attesa di approvazione conserva l'accesso al modulo") è
stato riscritto per il nuovo: era la codifica del difetto, non una garanzia
da preservare.

### ✔ M-5 — guard esplicito + rilevazione del revert silenzioso

`src/state/persistence.js`, entry `UPDATE_TEAM_MEMBER`: `guard` ora controlla
`isAdmin(s.team, uid)` prima del resto (non solo l'auto-declassamento), come
proposto — anche se ridondante con `ADMIN_ONLY_ACTIONS` del wrapper
`reducer` (che già nega la stessa cosa), perché l'entry non deve dipendere
per intero da un elenco esterno per la sua unica barriera critica. In più,
non nella proposta: `persist()` ora confronta il ruolo tornato dalla
`.select()` con quello richiesto (`rispecchiaRuoloScritto`) — copre il caso
che il guard locale non può vedere, un chiamante che è admin sullo state
React ma non lo è più per il database (demote concorrente, team stale), dove
il trigger reverte senza errore e senza questo confronto `res.error`
resterebbe `null`. Due test nuovi in `persistenceGuards.test.js`.

### ✔ M-6 — preconnect + `<link>` nell'HTML iniziale

`index.html`: `preconnect` a `fonts.googleapis.com`/`fonts.gstatic.com` più
un `<link rel="stylesheet">` nell'head, visto dal preload scanner prima
ancora che il parser raggiunga `<body>`. `GlobalStyles.jsx` non contiene più
l'`@import`. **Non** il `media="print" onload="this.media='all'"`
suggerito: quell'attributo `onload` è JavaScript inline sull'attributo HTML,
e la CSP di questo progetto ha `script-src 'self'` **senza** `unsafe-inline`
— il trucco proposto sarebbe stato bloccato dalla stessa CSP che M-1 vuole
proteggere. Il `<link>` semplice costa un frame di render bloccante in meno
di ottimizzazione ma non viola nulla; `font-display: swap` (già presente)
copre comunque il FOUT.

### ✔ B-1 — `capacity` e `color` validati lato server

`supabase/functions/invite-user/index.ts`: `capacity` accettato solo se
intero fra 1 e 100 (altrimenti default 8, stesso trattamento permissivo di
`role`), `color` solo se `/^#[0-9a-fA-F]{6}$/` (altrimenti il default
`#3B82F6`). Stessa forma della proposta, range più largo (1-100 invece di
1-40: nessuna capacità nota nell'app la richiede, ma non c'è motivo di
stringere oltre "positivo e non assurdo").

### ✔ B-2 — `Messages.listAll` pagina davvero fino al limite dichiarato

A differenza della proposta (che rimandava, «non è un problema oggi»): il
limite di 2000 ora è consegnato per davvero. `fetchRowsUpTo` in
`src/lib/pagination.js` — variante di `fetchAllRows` con un tetto invece che
"fino a fine tabella" — pagina con `.range()` in blocchi da `PAGE_SIZE`
(1000, lo stesso cap) finché non raggiunge `limit` o il database finisce le
righe. Aggiunto anche un secondo ordinamento (`.order('id')`) per la
determinismo richiesto da qualunque paginazione con `.range()` — mancava,
ed era lo stesso genere di lacuna già chiuso da C-1 sulle altre tre letture.
Test in `paginazione.test.js` (`Messages.listAll`) e `fetchRowsUpTo` a sé.

### ✔ B-3 — 0 in 0 file

Ogni secondo componente locale flagged da `react/no-multi-comp` è ora in un
file suo: `Sidebar`/`BottomNav` (+ `navHelpers.js`, `NavBadge.jsx`),
`TaskCard`/`TaskRow`/`CategoryPill` (+ `taskCardShared.js`), i tre chip di
`QueueShell` (`FilterChip`/`FilterLabel`/`FilterRow`), `ToastItem`,
`AvatarImg`, `ContactMenuItem`/`ContactText`, `ListeChip`,
`ClienteTaskTab`/`DatiAnagrafici`, `PushToggle`, `FilterDropdown`,
`VoyageDeskInner` (estratto da `VoyageDesk.jsx`, che resta il thin wrapper
`ViewportProvider`), `PendingScreen`/`ProfileErrorScreen`/`AuthGate`
(estratti da `main.jsx`, ora privo di qualunque componente proprio). Nessuna
fusione di responsabilità: dove due componenti condividevano un helper puro
(`catMeta`, `getNavBadges`…) l'helper è finito in un `*.js` a sé, non
duplicato. `npm run verifica:convenzioni` misura 0/0 e la frase in
`CLAUDE.md` è aggiornata di conseguenza (era proprio il meccanismo che ST-13
esiste per far scattare).

### ⚙ M-1 — avviato, non chiuso: perché e cosa è stato fatto

> ⚠️ **Superato da §4-ter (M-1 è chiuso), e su un punto SBAGLIATO.** La
> parentesi qui sotto sulla CSP — «il risultato passa comunque dall'attributo
> `style`, che la CSP governa a prescindere» — non è vera, ed è stata l'unica
> ragione per cui il terzo effetto sembrava irraggiungibile. La sezione resta
> integrale: un errore cancellato non insegna niente a chi legge, e questo ha
> quasi tenuto chiuso un fix per sempre. La correzione è in §4-ter.

**Non è risolvibile in una sessione senza il rischio che questo audit
esiste per evitare.** 1.528 `style={{…}}` sparsi su 104 file: anche
convertirne la maggioranza a mano, senza poter verificare visivamente ogni
schermata in un browser reale, è la stessa classe di scommessa che un audit
dovrebbe segnalare, non prendere di nascosto. La scelta — deliberata, non
per mancanza di tempo — è la stessa già fatta per `auth_leaked_password_
protection` (B-2 dell'8 agosto): accettare esplicitamente lo stato reale
invece di produrre una chiusura cosmetica.

**Cosa è stato fatto**: i tre pattern `style={{…}}` ripetuti **alla lettera**
in più punti (misurato per stringa esatta, non per somiglianza) sono ora
classi CSS in `GlobalStyles.jsx` — `.vd-flex-1-min0` (21 occorrenze in 19
file), `.vd-field-label` (9, in `Trash.jsx`/`ProfileEditor.jsx`),
`.vd-field-label-lg` (10, in `QuickAddTask.jsx`). 40 oggetti in meno, **1.487
restano**. Zero cambiamento visivo per costruzione: i valori sono copiati
dagli originali, non normalizzati — a differenza di un refactor "a occhio",
questo è verificabile leggendo il diff. `npm run build` e l'intera suite
(1164 test) restano verdi.

Questo chiude una fetta piccola e verificabile dei tre effetti che M-1
descrive (componenti gonfi, costo di render, `unsafe-inline` in CSP) — la
terza in particolare resta lontana: finché anche un solo `style={{…}}`
sopravvive in un componente React, `style-src` non può perdere
`unsafe-inline` (React applica gli stili via CSSOM, ma il risultato passa
comunque dall'attributo `style`, che la CSP governa a prescindere da dove
l'oggetto JS è definito — un dettaglio verificato qui perché **non è
ovvio**: un `const` a livello di modulo, come suggerito più sotto in questo
stesso documento, risolve il costo di render e la leggibilità, non la CSP).

**Percorso per chi lo riprenderà**, nell'ordine di rischio crescente:
1. Altri pattern esatti ripetuti (misurabili con lo stesso metodo usato qui:
   `grep` sul valore letterale di `style={{…}}`, non a occhio) → altre classi
   utility. Stesso rischio di questo intervento: ~zero.
2. I quattro file più densi (`Trash.jsx`, `TaskSlideOver.jsx`,
   `CalendarPlanner.jsx`, `AdvancedSearchPanel.jsx`) verso `*Styles.js` per
   modulo, come già `listeStyles.jsx`/`adminStyles.js`/`clientStyles.js` —
   richiede la verifica visiva che questa sessione non poteva dare.
3. Solo quando il `<style>` globale resta l'ultimo consumatore di stili non
   in classe: spostarlo in un `.css` importato da Vite e togliere
   `'unsafe-inline'` da `style-src` in `vercel.json` — l'unico passo che
   incassa il terzo effetto, e l'ultimo da fare per costruzione.

---

## 4-ter. M-1 chiuso, e la frase che stava per impedirlo

*(terzo intervento del 13 agosto)*

### Cosa è stato fatto

**1 — I 1.153 `style={{…}}` costanti sono costanti di modulo.** Su 1.487
oggetti, 1.153 erano fatti di soli letterali: nessuna proprietà che dipenda
dallo stato, ricostruiti identici a ogni render. Ora sono `const` di modulo e
il JSX li passa per nome. Restano **334** oggetti inline, ognuno con almeno una
proprietà dinamica — quelli vanno costruiti a ogni render, ed è giusto che lo
siano.

Dove sono finiti: 61 forme che ricorrono in tre o più file stanno in
`src/styles/common.js` (la stessa card, lo stesso bottone di chiusura, la
stessa cella di tabella sono UN oggetto per tutta l'app); 12 componenti fra i
più densi hanno il loro `*Styles.js` accanto — `trashStyles.js`,
`taskSlideOverStyles.js`, `calendarPlannerStyles.js`… — come già facevano
`adminStyles.js` e `clientStyles.js`; gli altri stanno in cima al proprio file.

**2 — I due `<style>` iniettati a runtime sono fogli `.css`.** `GlobalStyles`
e `ListeStyles` erano componenti React che inserivano un `<style>` nel
documento: sono diventati `src/styles/global.css` (importato da `main.jsx`) e
`src/components/liste/liste.css` (importato dai due componenti che aprono il
modulo). Vite li emette come `<link>` serviti da `self`. Con loro è passato in
`global.css` anche il blocco safe-area che stava in un `<style>` dentro
`index.html`, che ora non ha più CSS proprio.

**3 — `'unsafe-inline'` è fuori da `style-src`.** Era l'ultima direttiva
permissiva della CSP. Oggi: `style-src 'self' https://fonts.googleapis.com`.

**4 — La guardia, perché il numero non risalga da solo.** Una regola
`no-restricted-syntax` in `eslint.config.js` segnala un `style={{…}}` fatto di
soli letterali (niente spread, niente chiavi calcolate): a zero violazioni. E
`npm run verifica:convenzioni` **rimisura** i 334 rimasti e fa fallire la CI se
divergono da quanto scritto in `docs/CLAUDE.md` — lo stesso meccanismo di
ST-13, applicato al numero che in tre sessioni è stato riscritto a mano quattro
volte (1.528 → 1.487 → 334).

### Perché si poteva fare senza guardare ogni schermata

§4-bis si era fermato qui, e la cautela era giusta per il refactor che aveva in
mente: convertire stili inline in **classi CSS** sposta le regole nella
cascata, dove possono incrociarne altre, e quello senza browser non si fa.

Ma il sollevamento a costante non è quel refactor. L'inizializzatore di ogni
costante è la **fetta di sorgente originale** dell'oggetto: stesse chiavi,
stessi valori, stesso ordine, virgolette comprese. React riceve un oggetto
uguale a quello di prima; l'unica differenza è che è sempre lo stesso oggetto —
che è precisamente il difetto da correggere. Non c'è un pixel che possa
cambiare, e non perché lo si spera: perché la trasformazione non tocca i valori.

E non è stato dedotto, è stato **verificato**: per ognuno dei 1.153 attributi
riscritti la costante è stata risolta (nel file, in `common.js` o nel
`*Styles.js`) e la sua forma canonica confrontata con quella di prima, presa da
`git`. Zero difformità. Stesso metodo per i due fogli CSS: 4.441 e 13.880
caratteri di regole identici a commenti rimossi.

### La frase sbagliata, e cosa insegna

§4-bis scriveva che `style-src` non può perdere `'unsafe-inline'` finché
sopravvive un solo `style={{…}}`, perché «React applica gli stili via CSSOM, ma
il risultato passa comunque dall'attributo `style`, che la CSP governa a
prescindere». **Non è così.** La CSP controlla l'attributo `style` quando viene
*parsato* — nel markup o via `setAttribute` — non quando le proprietà sono
scritte via CSSOM (`node.style.setProperty`), che è ciò che fa React. Nel
codice non c'è un solo `setAttribute("style", …)`, e nell'HTML costruito non
c'è un solo attributo `style`.

Verificato in un browser vero, non su una lettura di specifica: il build reale,
servito in locale con la nuova policy come header e caricato in Chromium, rende
la schermata di login con 13 elementi che portano un attributo `style` non
vuoto, i due fogli di stile applicati e **zero violazioni CSP**. La stessa
prova era già in `docs/SICUREZZA.md` §8 dal 6 agosto, in una riga che diceva
esattamente il contrario di §4-bis — e nessuno dei due documenti citava
l'altro.

Vale più della correzione: **una frase tecnica scritta con sicurezza dentro un
audit diventa il motivo per cui nessuno riprova**. Quella parentesi era perfino
marcata come «un dettaglio verificato qui perché non è ovvio» — il tono della
verifica senza la verifica. È la stessa classe di difetto che ST-13 e questo
audit inseguono nei numeri, applicata a un'affermazione: la cura è la stessa,
scrivere accanto come la si è controllata, così che chi legge sappia se sta
guardando una misura o una convinzione.

### Cosa resta aperto, e non è M-1

- **Nessun design system.** `styles/common.js` è un registro delle forme in uso,
  non un vocabolario: `rowCenterGap8` descrive la forma, non il ruolo. È
  onesto — un nome meccanico segnala che quella forma non ha (ancora) un
  significato nell'app — ma la promozione in `tokens.js` di quelle che un
  significato ce l'hanno resta da fare, una alla volta e con una ragione.
- **334 stili dinamici.** Non sono un arretrato: dipendono dallo stato. Alcuni
  potrebbero diventare classi con una custom property (`style={{ "--n": n }}`),
  che è un refactor visivo — quello sì da fare con un browser davanti.
- **Le classi utility restano tre.** Convertire forme costanti in classi CSS
  (invece che in oggetti di modulo) toglierebbe l'attributo `style` dal DOM,
  non solo l'allocazione. È il passo migliore e quello che va guardato: la
  cautela di §4-bis, qui, resta valida per intero.

---

## 5. Top 3 suggerimenti strategici

### 1. ✔ Paginare le due letture rimaste — era l'unico rilievo con una data

C-1 non era un rischio teorico: `task_history` è a 621 righe, cresce di ~14,8 al
giorno, e il cap era a **~26 giorni**. Quando ci fosse arrivato non ci sarebbe
stato un errore da cercare — solo una cronologia che sparisce quando un collega
commenta e torna premendo F5. **Fatto il 12 agosto** (§4): il progetto aveva già
`lib/pagination.js`, costruito esattamente per questo.

Il seguito resta aperto e non è urgente allo stesso modo: paginare rende la
lettura *corretta*, non *sostenibile*. Fra un anno significherà scaricare ~6.000
righe di cronologia a ogni commento, e il passo successivo è leggerle **per task
aperto** — la stessa decisione già dichiarata aperta per i messaggi (ST-4,
soglia `messages > ~1500`), da prendere insieme a quella.

### 2. ✔ Riportare le guardie a verdi, e tenerle verdi

Il progetto ha investito parecchio in controlli automatici — verifica RPC,
verifica migrazioni, advisor, `verifica:convenzioni`, oltre 1100 test — e due
di essi non davano segnale: uno rosso per un motivo di bookkeeping (**A-1**),
l'altro mai girato (**A-2**, perché mancava il secret e l'uscita 0 era
indistinguibile da un successo). **Entrambi chiusi** (§4): il 13 agosto il
rilancio del workflow ha confermato che l'advisor valuta davvero 20 lint. È
stato il capitale peggio speso possibile fino a quel momento: il costo era
già pagato, il beneficio zero, e la presenza del controllo scoraggiava dal
cercarne un altro.

Vale la regola generale più del singolo fix: **nessun controllo può fallire in
modo permanente** — o si corregge la causa, o si accetta l'eccezione per
iscritto e col motivo, come `ECCEZIONI_STORICHE` già fa. E il corollario che
A-2 ha mostrato: **un controllo che si salta deve dirlo dove qualcuno lo
legge**, altrimenti "saltato" e "passato" hanno lo stesso aspetto — è il pezzo
di questa correzione che resta anche dopo che il secret è stato configurato,
per la prossima volta che mancherà una credenziale.

### 3. Trattare gli stili come un livello, non come una proprietà del JSX

I 1.528 `style={{…}}` sono la causa comune di tre cose che negli audit
compaiono separate: componenti che sfiorano `max-lines` (A-4), `memo` che non
possono saltare un render, e l'unica direttiva permissiva rimasta nella CSP. Non
serve una libreria né un big-bang: il pattern giusto esiste già in quattro
moduli (`listeStyles`, `adminStyles`, `clientStyles`, `tokens`). Estrarre gli
stili costanti dai quattro file più densi, promuovere in `tokens.js` quelli
ripetuti, e — quando lo `<style>` globale sarà l'ultimo consumatore — spostarlo
in un `.css` e togliere `'unsafe-inline'` da `style-src`. È l'unico intervento
di questo audit che paga su tre fronti diversi con un lavoro solo.

**Fatto il 13 agosto** (M-1, §4-bis e §4-ter): prima i pattern ripetuti alla
lettera come classi (−40), poi i 1.153 oggetti costanti sollevati a costanti di
modulo (1.487 → 334, tutti dinamici) e i due `<style>` iniettati a runtime
diventati fogli `.css`. I tre fronti sono incassati tutti e tre: i componenti
densi hanno il loro `*Styles.js`, `memo` vede prop di stile stabili, e
`style-src` ha perso `'unsafe-inline'`. Quel che resta non è più questo
rilievo: è la promozione da registro di forme (`styles/common.js`) a
vocabolario (`tokens.js`), che si fa un nome alla volta e quando un nome c'è.

---

## 6. Cosa è stato controllato e risulta a posto

Vale la pena scriverlo, perché un audit che elenca solo i problemi fa sembrare
peggiore di com'è un progetto che su questi fronti sta bene:

- **Confine delle scritture**: nessun componente chiama il data layer per le
  entità del reducer; le due regole `no-restricted-imports` passano a zero
  violazioni e reggono da sole.
- **Doppio livello di permessi**: reducer e registry chiamano le stesse funzioni
  pure di `lib/permissions.js` sullo stesso `state.team`, e
  `persistenceGuards.test.js` lo verifica azione per azione. M-5 era l'unica
  eccezione trovata — **chiusa il 13 agosto** (§4-bis).
- **RLS**: gate RESTRICTIVE "utente attivo e approvato" su tutte le tabelle
  sensibili, matrice categoria/ruolo nelle policy e non solo nella UI,
  `users_block_privileged_self_update` a protezione delle colonne di privilegio,
  helper spostati in `private` con `search_path` fissato.
- **Edge Function**: predicato admin condiviso (`_shared/adminPredicate.ts`) che
  rispecchia `private.is_admin()` colonna per colonna, CORS con allowlist,
  confronto a tempo costante sul segreto push, `safeRedirect` sugli inviti.
- **XSS**: nessun `dangerouslySetInnerHTML`, nessun `innerHTML`, nessun `eval`;
  CSP senza `unsafe-eval`, `object-src 'none'`, `frame-ancestors 'none'`.
- **Segreti**: nessuna credenziale nel repository. La chiave `anon` nei workflow
  è pubblica per costruzione, con la motivazione scritta accanto.
- **Advisor Supabase**: 0 ERROR, 10 WARN tutti motivati (vedi però M-3 e A-2).
- **Produzione allineata**: verificata riga per riga la migrazione segnalata da
  A-1 — colonne, trigger e funzioni sono tutti presenti.
