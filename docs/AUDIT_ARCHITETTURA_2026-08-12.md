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

> **Stato al 12 agosto, sera** — **C-1**, **A-1** e **A-3** sono stati corretti
> nello stesso giorno dell'audit; **A-2** è parzialmente chiuso (il codice del
> controllo è corretto, il secret che lo attiva resta da configurare da chi
> amministra il repository). Vedi §4. I test sono ora **1150**. Gli altri nove
> rilievi restano aperti.

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
| Test | 1138 passati, 7 skip → **1150** dopo la correzione di C-1 (§4) |
| ESLint | 0 errori, 20 warning `react/no-multi-comp` in 13 file |
| Migrazioni | 105 locali, 104 registrate in produzione → **105/105** dopo A-1 (§4) |
| File più vicino al limite `max-lines` | `ListeViaggio.jsx` — **495/500** |
| Oggetti `style={{…}}` inline | 1.528 |

---

## 2. Tabella delle priorità

| # | Rilievo | File | Priorità |
|---|---|---|---|
| **C-1** ✔ | Letture non paginate su tabelle a crescita monotona: troncamento silenzioso previsto per **inizio settembre 2026** — **chiuso il 12 agosto** (§4) | `lib/api.js:289-298` | 🔴 **Critica** |
| **A-1** ✔ | Workflow "Verifica RPC" rosso a ogni run dall'8 agosto: la guardia contro il drift non è più un segnale — **chiuso il 12 agosto** (§4) | `scripts/verifica-rpc/migrazioni.js:52` | 🟠 Alta |
| **A-2** ◐ | Il controllo advisor non ha mai girato: secret assente, exit 0 silenzioso — **il salto è ora visibile in CI** (§4), il secret resta da configurare | `.github/workflows/verifica-rpc.yml:80` | 🟠 Alta |
| **A-3** ✔ | Terza copia di `filterByPeriod` + `PERIOD_OPTIONS` + `chipStyle`, mentre il modulo condiviso esiste già — **chiuso il 12 agosto** (§4) | `views/Trash.jsx:17-43,157-169` | 🟠 Alta |
| **A-4** | `ListeViaggio.jsx` a 495/500 righe: il prossimo intervento sbatte contro il lint | `liste/ListeViaggio.jsx` | 🟠 Alta |
| **M-1** | 1.528 stili inline: componenti gonfi, nessun design system, `unsafe-inline` obbligato in CSP | trasversale | 🟡 Media |
| **M-2** | "Elimina account" non elimina: ban + `active=false`, nessuna cancellazione dei dati personali | `functions/delete-account/index.ts:39` | 🟡 Media |
| **M-3** | `AVVISI_ACCETTATI` accetta per *nome del lint*, non per oggetto: una futura funzione `SECURITY DEFINER` esposta ad `anon` passerebbe muta | `verifica-advisor/advisor.js:28` | 🟡 Media |
| **M-4** | `canAccessListe` non controlla `pending`, `private.can_liste()` sì: divergenza UI/DB nella stessa domanda | `lib/permissions.js:151-155` | 🟡 Media |
| **M-5** | `UPDATE_TEAM_MEMBER` senza guard admin: il trigger DB reverte **in silenzio**, quindi nessun rollback scatta | `state/persistence.js:381` | 🟡 Media |
| **M-6** | Font Google via `@import` dentro lo `<style>` iniettato da React: download dopo il mount, nessun preconnect | `styles/GlobalStyles.jsx:15` | 🟡 Media |
| **B-1** | `invite-user`: `capacity` e `color` non validati | `functions/invite-user/index.ts:57-59` | 🔵 Bassa |
| **B-2** | `Messages.listAll(2000)`: limite dichiarato oltre il cap del server | `lib/api.js:374` | 🔵 Bassa |
| **B-3** | 20 warning `react/no-multi-comp` in 13 file | trasversale | 🔵 Bassa |

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

> **◐ Parzialmente chiuso il 12 agosto 2026 — vedi §4.** La parte 2 (rendere
> visibile il salto) è fatta. La parte 1 (configurare il secret) resta
> **da fare da chi amministra il repository**: richiede un token creato dalla
> dashboard Supabase e un secret creato dalle impostazioni GitHub del repository
> — due azioni fuori dalla portata di questa sessione.

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

### 🔵 B-3 · 20 warning `react/no-multi-comp`

Arretrato dichiarato e stabile. L'estrazione di `ListaRow` (A-4) ne chiude uno
senza lavoro aggiuntivo; gli altri restano churn non giustificato finché i file
sono sotto soglia.

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

### ◐ A-2 — il salto ora si vede, il secret resta da configurare

Fatta solo la parte 2 delle due proposte. `scripts/verifica-advisor/index.js`,
nel ramo che si prende quando `SUPABASE_ACCESS_TOKEN` non è impostato, emette
ora anche un'annotazione GitHub oltre ai due `console.log` che già c'erano:

```js
console.log('::warning title=Advisor non verificati::' +
  'SUPABASE_ACCESS_TOKEN assente: gli advisor Supabase non sono stati controllati.');
```

Verificato eseguendo lo script senza il token in locale: l'annotazione compare,
`exit 0` invariato (un controllo nuovo non deve rendere rosso il workflow di
chi non l'ha richiesto — resta vero anche dopo la correzione). In GitHub
Actions questa riga produce un avviso in cima al log del job e nel riepilogo
del run: da qui in avanti "saltato" e "passato" hanno un aspetto diverso.

**La parte 1 — configurare il secret — non è stata fatta, e non poteva
esserlo da questa sessione.** Richiede due azioni fuori dalla portata degli
strumenti disponibili:

1. generare un Personal Access Token dalla dashboard Supabase
   (Account → Access Tokens) — un'operazione legata all'account di chi
   amministra il progetto, non al progetto stesso;
2. salvarlo come secret `SUPABASE_ACCESS_TOKEN` nelle impostazioni GitHub del
   repository (Settings → Secrets and variables → Actions).

Ho verificato con `get_advisors` (Management API, la stessa che lo script
chiamerebbe) che a oggi non ci sono sorprese in attesa: **0 ERROR**, i 10 WARN
sono esattamente quelli già in `AVVISI_ACCETTATI`. Il controllo advisor tornerà
a valutare qualcosa in CI solo dopo che chi amministra il repository avrà
completato i due passi sopra — finché non succede, l'annotazione appena
aggiunta è l'unico segnale che il controllo non sta guardando nulla.

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

### 2. Riportare le guardie a verdi, e tenerle verdi

Il progetto ha investito parecchio in controlli automatici — verifica RPC,
verifica migrazioni, advisor, `verifica:convenzioni`, oltre 1100 test — e due
di essi non davano segnale: uno rosso per un motivo di bookkeeping (A-1, **ora
chiuso**), l'altro mai girato (A-2, **ancora aperto**: manca il secret, e serve
che l'assenza si veda invece di uscire 0 in silenzio). È il capitale peggio
speso possibile: il costo è già stato pagato, il beneficio è zero, e la presenza
del controllo scoraggia dal cercarne un altro.

Vale la regola generale più del singolo fix: **nessun controllo può fallire in
modo permanente** — o si corregge la causa, o si accetta l'eccezione per
iscritto e col motivo, come `ECCEZIONI_STORICHE` già fa. E il corollario che
A-2 mostra: **un controllo che si salta deve dirlo dove qualcuno lo legge**,
altrimenti "saltato" e "passato" hanno lo stesso aspetto.

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

---

## 6. Cosa è stato controllato e risulta a posto

Vale la pena scriverlo, perché un audit che elenca solo i problemi fa sembrare
peggiore di com'è un progetto che su questi fronti sta bene:

- **Confine delle scritture**: nessun componente chiama il data layer per le
  entità del reducer; le due regole `no-restricted-imports` passano a zero
  violazioni e reggono da sole.
- **Doppio livello di permessi**: reducer e registry chiamano le stesse funzioni
  pure di `lib/permissions.js` sullo stesso `state.team`, e
  `persistenceGuards.test.js` lo verifica azione per azione. M-5 è l'unica
  eccezione trovata.
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
