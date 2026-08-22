# Audit architettura e sicurezza — 23 agosto 2026

Perimetro completo: architettura e struttura del codice (1), sicurezza e
gestione dei dati (2), stato e flusso dati (3), performance e scalabilità (4),
UX ed error handling (5).

Fatto dopo la chiusura di tutti i rilievi dell'audit del 22 agosto, con
esecuzione reale della catena di verifica (`npm ci`, `lint`, `verifica:tipi`,
`test`, `build`, `npm audit`) e rilettura della superficie di sicurezza —
Edge Function, CSP, policy RLS, matrice dei permessi — confrontando **i tre
livelli fra loro** invece che ciascuno con se stesso: `src/lib/permissions.js`,
`supabase/migrations/**` e `docs/SICUREZZA.md`.

È da quel confronto che nasce il rilievo principale, e non è un caso: è
l'unico controllo che nessuno strumento di questo repository esegue.

⟦stato: 0/9 chiusi⟧

## Stato misurato, non riferito

| Controllo | Esito |
|---|---|
| `npm run lint` | pulito, zero warning (`exhaustive-deps` compreso) |
| `npm run verifica:tipi` | zero errori |
| `npm test` | **1596 passati, 8 skipped, 131 file** |
| `npm run build` | 3,08 s, 300 moduli, chunk più grande dopo `xlsx` = `VoyageDesk` 213,75 kB (62,00 kB gzip) |
| `npm audit` | 1 high: `xlsx` (vedi B-2) |
| `cdn.sheetjs.com` | `CONNECT tunnel failed, 403` — **sesta conferma** |

Il progetto è in salute reale, non dichiarata: nessun segreto nel repository,
nessun `dangerouslySetInnerHTML`, CSP senza `unsafe-inline`, RLS attiva su
tutte e 22 le tabelle create, error boundary a tre livelli, code-splitting
effettivo. **Nessun rilievo critico**, ed è una constatazione verificata: ho
riletto i quattro percorsi che potrebbero concederne uno — autenticazione,
Edge Function privilegiate, allow-list degli origin, matrice dei permessi — e
tutti e quattro reggono.

Quello che non regge è il livello sopra: **ciò che dovrebbe accorgersi quando
smetteranno di reggere.**

## Tabella delle priorità

| # | Priorità | Area | Rilievo | Dove |
|---|---|---|---|---|
| **C** | 🔴 Critica | — | **Nessuno.** Constatazione verificata, non assenza di ricerca | — |
| **A-1** | 🟠 Alta | Sicurezza / Correttezza | `canViewTask` concede le urgenti altrui, la policy `tasks_select` no: client, test e `SICUREZZA.md` concordano fra loro e **tutti e tre divergono dal database** | `src/lib/permissions.js:131` |
| **A-2** | 🟠 Alta | Sicurezza / Ops | Il **solo** test che attraversa il confine di rete non viene eseguito da nessuno: nessun job CI, nessuna credenziale | `src/test/integration/rls.test.js` |
| **A-3** | 🟠 Alta | Sicurezza / Ops | Tre controlli di sicurezza escono **0 anche quando non verificano nulla**: verde e verificato sono lo stesso segno | `scripts/verifica-advisor/`, `scripts/verifica-redirect/` |
| **M-1** | 🟡 Media | Documentazione | L'audit del 22 agosto — che ha chiuso un rilievo **critico** — non ha un documento: fuori da `INDEX.md` e fuori dal registro di `verifica:convenzioni` | `docs/` |
| **M-2** | 🟡 Media | Scalabilità | `Messages.listAll(2000)` rilegge il corpus chat intero a ogni evento realtime; la soglia che dovrebbe farlo cambiare è scritta in un documento che nessuno misura | `src/lib/api.js:634` |
| **B-1** | 🟢 Bassa | Architettura | Il `saldo` di una lista è definito due volte: esatto nel database, in virgola mobile nel client — ed è la copia client quella che finisce nei documenti che escono | `src/components/liste/ListaDetail.jsx:78` |
| **B-2** | 🟢 Bassa | Sicurezza | CVE `xlsx` 0.18.5 — sesta conferma del blocco CDN. Resta aperto e mitigato | `src/lib/xlsx.js` |
| **B-3** | 🟢 Bassa | Struttura | `ProfileEditor.jsx`: 12 `useState` in 530 righe, il residuo di B-3 del 15 agosto | `src/components/modals/ProfileEditor.jsx` |
| **B-4** | 🟢 Bassa | Sicurezza | Header: manca `Cross-Origin-Embedder-Policy`, la CSP non ha un canale di report | `vercel.json` |

---

## 🟠 A-1 · Le urgenti altrui: tre livelli d'accordo fra loro e in disaccordo col database

**Dove.** `src/lib/permissions.js:131`, `supabase/migrations/20260630075528_tasks_global_queue_agent_visibility.sql:35`, `docs/SICUREZZA.md:197`, `src/test/permissions.test.js:136`.

**Il fatto.** `canViewTask` concede al non-admin la visione di una task urgente
di chiunque:

```js
// src/lib/permissions.js:125-133
export const canViewTask = (team, task, userId) => {
  const role = getRoleType(team, userId);
  if (role === 'admin') return true;
  if (role === 'driver') return isMyTask(task, userId);
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
  if (isUrgent(task)) return true;      // ← questo ramo
  return false;
};
```

La policy che consegna davvero le righe non ha quel ramo:

```sql
-- 20260630075528, policy tasks_select — vigente
using (
  (select public.is_manager_or_admin())
  or (select auth.uid()) = any(assignees)
  or created_by = (select auth.uid())
  or (cardinality(assignees) = 0 and (select public.can_view_global_queue()))
);
```

`is_manager_or_admin()` è `role IN ('admin','manager')`. Quindi per **admin e
manager** il ramo `isUrgent` è ininfluente: ricevono comunque tutto. Per il
**driver** non si raggiunge. Resta esattamente un ruolo in cui quel ramo
decide qualcosa — l'**agent** — ed è l'unico per cui il database non consegna
mai la riga.

**Perché è alta, e in che direzione.** Il database è il livello **più
stretto**: non è un buco di sicurezza, nessuno vede ciò che non deve. Sono
altre due cose, entrambe reali:

1. **Una funzione di prodotto è inerte per il ruolo a cui è destinata.**
   `UrgentQueue.jsx:48-49` dichiara: «Mostra sia le proprie task urgenti
   (editabili dal dettaglio) sia **quelle altrui** (read-only, con scorciatoia
   "contatta" verso l'assegnatario)», e `ConversationView.jsx:64` cita il
   prefill «es. da "contatta agente" su urgenti altrui». Per un Senior Agent
   quella scorciatoia non compare mai: la tab Urgenti contiene le sue task e
   la coda globale, e nient'altro. Funziona solo per chi vedeva già tutto.

2. **`SICUREZZA.md:197` afferma una capacità che il database non concede.**
   La riga «Vede task | tutti | propri + coda globale + urgenti | propri +
   coda globale + urgenti | …» è la specifica di sicurezza del progetto, ed è
   falsa per tre colonne su cinque. È la stessa classe di difetto che M-4
   dell'audit del 15 agosto ha nominato — «il commento è diventato la
   specifica, e ha già divergito dal database su una policy di sicurezza» —
   sopravvissuta alla sua stessa chiusura, questa volta nella tabella
   normativa invece che in un commento.

**Perché nessun test lo ha visto.** `src/test/permissions.test.js:136-140` e
`:172-176` asseriscono il comportamento del client:

```js
it("un agent vede i propri, la coda globale e gli urgenti altrui", () => {
  expect(canViewTask(TEAM, task({ assignees: ["mgr1"], dueDate: IN_24H }), "senior1")).toBe(true);
});
```

Il test è **corretto rispetto al client** e la suite è verde. Verifica il
client contro se stesso, che è tutto ciò che 1596 test in-process possono
fare. Il test che avrebbe trovato questa divergenza esiste ed è A-2.

**La correzione.** Bisogna prima decidere **quale dei due livelli ha ragione**,
e non è una scelta di stile: è una scelta di prodotto sulla riservatezza delle
task fra colleghi. Le due strade sono entrambe legittime e vanno percorse
intere, non a metà.

*Strada 1 — la funzione si vuole (allineare il database).* La policy acquista
il ramo che le manca, con lo stesso predicato di urgenza usato dal client
(`due_date` entro 24h, non completata):

```sql
-- supabase/migrations/20260823HHMMSS_tasks_select_urgenti_altrui.sql
--
-- A-1 dell'audit del 23 agosto. `canViewTask` (lib/permissions.js:131) e la
-- matrice di SICUREZZA.md §permessi concedono all'agent la VISIONE delle task
-- urgenti altrui; questa policy non lo faceva, quindi la riga non arrivava
-- mai al client e la scorciatoia "contatta" di UrgentQueue.jsx era inerte
-- proprio per l'unico ruolo in cui il ramo decide qualcosa.
--
-- La finestra è 24h ed è la STESSA di isUrgent() in lib/taskUtils.js: due
-- numeri scritti in due posti sono la premessa della prossima divergenza, e
-- questo rilievo nasce esattamente da lì. Se cambia là, cambia qui.
--
-- ⚠️ SOLO SELECT. `tasks_update` NON acquista il ramo: il client dice già
-- «urgente ≠ modificabile» (canEditTask non ha il ramo isUrgent, e
-- permissions.test.js:171 lo asserisce per nome). Allargare anche l'UPDATE
-- trasformerebbe un allineamento in un ampliamento di privilegio.
create or replace function public.is_urgent_task(p_due timestamptz, p_status text)
returns boolean language sql immutable as $$
  select p_due is not null
     and p_status is distinct from 'done'
     and p_due >= now()
     and p_due <= now() + interval '24 hours';
$$;

revoke all on function public.is_urgent_task(timestamptz, text) from public, anon;
grant execute on function public.is_urgent_task(timestamptz, text) to authenticated;

drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (
    (select public.is_manager_or_admin())
    or (select auth.uid()) = any(assignees)
    or created_by = (select auth.uid())
    or (cardinality(assignees) = 0 and (select public.can_view_global_queue()))
    -- A-1: le urgenti altrui, ai ruoli che la coda globale già la vedono
    -- (admin/manager/agent attivi) — il driver resta fuori, come nel client.
    or (public.is_urgent_task(due_date, status) and (select public.can_view_global_queue()))
  );
```

*Strada 2 — la funzione non si vuole (allineare client, test e documento).*
Si toglie il ramo dal client, si corregge la tabella di `SICUREZZA.md`, si
inverte l'asserzione del test e si rimuove la parte read-only di
`UrgentQueue.jsx` insieme alla scorciatoia «contatta»:

```js
// src/lib/permissions.js — canViewTask
  if (isMyTask(task, userId)) return true;
  if (isInGlobalQueue(task)) return true;
- if (isUrgent(task)) return true;
  return false;
```

```md
<!-- docs/SICUREZZA.md:197 -->
-| Vede task | tutti | propri + coda globale + urgenti | propri + coda globale + urgenti | propri + coda globale + urgenti | solo propri |
+| Vede task | tutti | propri + coda globale | propri + coda globale | propri + coda globale | solo propri |
```

**Raccomandazione: strada 1.** La funzione è progettata, documentata,
implementata in UI e citata da un secondo modulo (il prefill della chat): è
stata voluta tre volte. Il livello che non l'ha mai avuta è quello che nessuno
ha aggiornato, non quello che ha deciso di non averla.

⚠️ In entrambe le strade la correzione **non è completa senza A-2**: qualunque
delle due si scelga, senza un test che attraversi il confine la prossima
divergenza nascerà nello stesso silenzio.

---

## 🟠 A-2 · Il solo test che attraversa il confine non lo esegue nessuno

**Dove.** `src/test/integration/rls.test.js`, `package.json:14`, `.github/workflows/ci.yml`.

**Il fatto.** Il file esiste, è scritto bene, e il suo preambolo dice
esattamente perché:

> «la matrice di autorizzazione è scritta DUE volte […] nessun test esistente
> attraversa il confine di rete: tutti verificano che il CLIENT si comporti
> bene, mai che il DATABASE rifiuti chi il client non ferma. Se le due copie
> divergono […] nessun test esistente lo segnala. **Questo file lo fa**»

Ma:

```js
const url = process.env.RLS_TEST_URL;
const suite = url && anonKey ? describe : describe.skip;
```

e in `.github/workflows/ci.yml` **non esiste alcun passo** che esegua
`npm run test:rls` o fornisca `RLS_TEST_URL` — verificato: zero occorrenze.
Nel run completo di questo audit il file compare come **1 skipped su 132**, ed
è l'unico.

**Perché è alta.** È lo stesso identico argomento con cui il progetto ha
classificato A-3 il 22 agosto — «lo script esisteva dal 15 agosto ed era a
zero errori, ma non lo eseguiva nessuno: viveva sulla macchina di chi si
ricordava di lanciarlo» — applicato un livello più su, e alla verifica di
sicurezza invece che a quella dei tipi. Con un'aggravante misurabile: mentre
`verifica:tipi` era davvero a zero, **questo test avrebbe trovato A-1**. Non è
un controllo che passerebbe perché non c'è niente da trovare: è un controllo
che non ha mai guardato, e c'era.

Lo skip è anche la scelta *giusta* in locale — «non verificato qui» ≠ «rotto» —
ma in CI produce un segno di spunta verde identico a quello di un test
eseguito, che è la proprietà che rende il difetto invisibile.

**La correzione.** Provisioning di un progetto Supabase di **staging** (mai
produzione: il preambolo del file spiega perché — le insert di sonda restano
se una policy non rifiuta), i sei segreti nel repository, e un job separato:

```yaml
# .github/workflows/rls.yml
#
# A-2 dell'audit del 23 agosto. Il test di RLS è il solo che attraversi il
# confine fra i due livelli in cui la matrice di autorizzazione è scritta
# (lib/permissions.js e le policy private.*), ed è il solo che nessuno
# eseguiva: senza RLS_TEST_URL si auto-skippa, e in CI uno skip e un successo
# portano lo stesso segno verde.
#
# Perché un workflow a parte e non un passo dentro ci.yml: come
# verifica-rpc.yml, tocca un database vero. Su pull request il codice precede
# legittimamente le migrazioni, e il job diventerebbe rosso al momento
# sbagliato.
#
# ⚠️ RLS_TEST_URL deve puntare a uno STAGING. Il test inserisce righe di sonda
# che RESTANO nella tabella proprio nei casi in cui fallisce — su produzione
# sarebbero dati sporchi in mezzo a quelli veri.
name: Verifica RLS

on:
  push:
    branches: [main]
    paths:
      - 'src/lib/permissions.js'
      - 'src/state/persistence.js'
      - 'supabase/migrations/**'
      - 'src/test/integration/**'
      - '.github/workflows/rls.yml'
  schedule:
    - cron: '0 7 * * *'
  workflow_dispatch: {}

jobs:
  rls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with: { node-version: 24, cache: npm }
      - run: npm ci
      - name: Il database rifiuta ciò che il client non ferma
        env:
          RLS_TEST_URL: ${{ secrets.RLS_TEST_URL }}
          RLS_TEST_ANON_KEY: ${{ secrets.RLS_TEST_ANON_KEY }}
          RLS_TEST_DRIVER_EMAIL: ${{ secrets.RLS_TEST_DRIVER_EMAIL }}
          RLS_TEST_DRIVER_PASSWORD: ${{ secrets.RLS_TEST_DRIVER_PASSWORD }}
          RLS_TEST_JUNIOR_EMAIL: ${{ secrets.RLS_TEST_JUNIOR_EMAIL }}
          RLS_TEST_JUNIOR_PASSWORD: ${{ secrets.RLS_TEST_JUNIOR_PASSWORD }}
          RLS_TEST_PENDING_EMAIL: ${{ secrets.RLS_TEST_PENDING_EMAIL }}
          RLS_TEST_PENDING_PASSWORD: ${{ secrets.RLS_TEST_PENDING_PASSWORD }}
        run: npm run test:rls
```

E — questa è la metà che conta, ed è la lezione di A-3 del 22 agosto — lo skip
**non deve poter passare inosservato dentro il job che esiste per eseguirlo**:

```js
// src/test/integration/rls.test.js
// In CI lo skip non è un esito accettabile: il job rls.yml esiste per
// ESEGUIRE questo file, e uno skip lì dentro è il difetto (A-2), non una
// configurazione mancante. In locale resta uno skip, che è la risposta giusta
// a «non ho le credenziali di staging».
if (process.env.CI && !url) {
  throw new Error(
    "[rls] RLS_TEST_URL assente in CI: i segreti di staging non sono " +
    "configurati. Vedi .github/workflows/rls.yml — questo file NON deve " +
    "poter essere saltato dal job che esiste per eseguirlo."
  );
}
const suite = url && anonKey ? describe : describe.skip;
```

**Primo caso da aggiungere alla suite**, che è A-1 reso eseguibile:

```js
it("l'agent riceve davvero le urgenti altrui che canViewTask gli concede", async () => {
  // La divergenza di A-1: il client dice sì, la policy tasks_select non ha il
  // ramo. Questo test è l'unico punto in cui la contraddizione è osservabile.
  const { client } = await accedi(process.env.RLS_TEST_JUNIOR_EMAIL, process.env.RLS_TEST_JUNIOR_PASSWORD);
  const { data } = await client.from("tasks").select("id")
    .not("assignees", "cs", `{${userIdJunior}}`)
    .gte("due_date", new Date().toISOString())
    .lte("due_date", new Date(Date.now() + 24 * 3600e3).toISOString())
    .neq("status", "done");
  expect(canViewTask(TEAM, urgenteAltrui, userIdJunior)).toBe(true);
  expect(data?.length ?? 0).toBeGreaterThan(0); // oggi FALLISCE: il DB non la manda
});
```

---

## 🟠 A-3 · Verde e verificato sono lo stesso segno

**Dove.** `scripts/verifica-advisor/index.js:47,56`, `scripts/verifica-redirect/index.js:84,104,112`.

**Il fatto.** Due dei quattro passi di `verifica-rpc.yml` escono `0` anche
quando non hanno verificato nulla:

```js
// verifica-advisor/index.js:47
console.log('⚠  SUPABASE_ACCESS_TOKEN non configurato: controllo advisor saltato.');
…
process.exit(0);
```

```js
// verifica-redirect/index.js:107
if (stato === 'inconcludente') { … process.exit(0); }
```

La scelta è motivata nel codice ed è ragionevole in sé: un controllo che non
può concludere non deve dichiarare un guasto. Ma l'esito arriva su GitHub
Actions come **un segno di spunta verde indistinguibile** da quello di un
controllo che ha guardato e non ha trovato niente. Chi apre la pagina del
workflow legge «verificato» in entrambi i casi.

**Perché è alta e non media.** `verifica:redirect` è il controllo nato per
**C-1 del 22 agosto**, cioè per il rilievo *critico* di takeover di account: è
il solo che guardi un valore che nel repository non c'è (la allow-list vive
solo nella dashboard Supabase, ed è per questo che ci è rimasto dentro un
`*.vercel.app/**` per due mesi senza che nulla lo dicesse). Se domani la sonda
diventasse permanentemente inconcludente — GoTrue cambia forma di risposta, la
chiave anon ruota, la rete cade — quel critico tornerebbe **senza sorveglianza
e con la CI verde**, che è esattamente lo stato da cui il progetto è appena
uscito.

**La correzione.** Non è far fallire il job — l'inconcludenza resta un esito
legittimo. È **renderla visibile** e **farla scadere**:

```js
// scripts/verifica-redirect/index.js
//
// A-3 dell'audit del 23 agosto. Uscire 0 quando il controllo non ha potuto
// concludere è la scelta giusta (un controllo che non ha guardato non deve
// dichiarare un guasto), ma su GitHub Actions produceva lo stesso segno verde
// di un controllo riuscito. La distinzione ora esiste in due punti: nel
// riepilogo del job, che una persona legge, e in un annotation di warning.
const annota = (livello, testo) => {
  console.log(`::${livello}::${testo}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      `### ⚠️ Redirect URL — **NON VERIFICATO**\n\n${testo}\n`);
  }
};

if (stato === 'inconcludente') {
  annota('warning',
    'verifica:redirect inconcludente: la allow-list dei Redirect URL NON è ' +
    'stata verificata in questa esecuzione. È il controllo di C-1 (takeover ' +
    'di account, audit del 22 agosto): due esecuzioni inconcludenti di fila ' +
    'vanno trattate come un guasto del controllo, non come rumore.');
  process.exit(0);
}
```

più, nel workflow, un passo finale che **non** sia condizionato dai precedenti
e riassuma che cosa è stato davvero verificato:

```yaml
      - name: Riepilogo — che cosa è stato verificato davvero
        if: always()
        run: |
          echo "## Verifica RPC — esito per controllo" >> "$GITHUB_STEP_SUMMARY"
          echo "Un ✅ qui sopra NON significa 'verificato': i controlli advisor e" >> "$GITHUB_STEP_SUMMARY"
          echo "redirect escono 0 anche quando non hanno potuto concludere (A-3)." >> "$GITHUB_STEP_SUMMARY"
          echo "Le righe ⚠️ sopra dicono quali." >> "$GITHUB_STEP_SUMMARY"
```

Stesso trattamento per `verifica-advisor/index.js:47`.

---

## 🟡 M-1 · L'audit del 22 agosto non ha lasciato un documento

**Dove.** `docs/` (assenza), `docs/INDEX.md:31-45`, `scripts/verifica-convenzioni/index.js:33-56`.

**Il fatto.** L'audit del 22 agosto ha chiuso un rilievo **critico** (C-1,
Redirect URL), quattro alti e sette fra medi e bassi. È citato per nome in 18
file fra `src/`, `supabase/` e `docs/` — `originConsentite.ts` ne porta il
ragionamento per esteso, `CLAUDE.md:43` ne cita A-2, due migrazioni portano la
data nel nome. Ma:

- non esiste `docs/AUDIT_*_2026-08-22.md`;
- `docs/INDEX.md` non ha la sua riga nella tabella degli audit;
- non compare nell'array `AUDIT` di `scripts/verifica-convenzioni/index.js`.

Ogni altro audit dal 10 agosto in poi ha tutti e tre.

**Perché conta.** `verifica:convenzioni` esiste per ST-13, cioè perché «un
documento che afferma qualcosa di falso viene creduto», e B-6 dell'audit del
16 agosto ha esteso il registro proprio con l'argomento che *un audit fuori dal
registro ha un `⟦stato⟧` che nessuno verifica*. Il risultato è che il
controllo anti-deriva del progetto **non vede l'audit più recente**, che è
anche quello con il rilievo più grave mai chiuso. Il registro sorveglia dieci
audit e ignora l'undicesimo.

**La correzione.** Ricostruire il documento dai commit `4be62f4` e `a5cd298`
(che portano il resoconto completo nei messaggi), registrarlo in `INDEX.md` e
aggiungerlo al registro:

```js
// scripts/verifica-convenzioni/index.js — array AUDIT
  { file: 'AUDIT_PERFORMANCE_UX_2026-08-19.md', prefisso: ['C', 'A', 'M', 'B'] },
+ // M-1 dell'audit del 23 agosto. Mancava: l'audit del 22 ha chiuso il C-1 di
+ // takeover di account e non aveva né documento né riga di registro, cioè la
+ // condizione che B-6 (16 agosto) ha esteso questo array per impedire.
+ { file: 'AUDIT_ARCHITETTURA_2026-08-22.md', prefisso: ['C', 'A', 'M', 'B'] },
+ { file: 'AUDIT_ARCHITETTURA_2026-08-23.md', prefisso: ['C', 'A', 'M', 'B'] },
```

⚠️ Aggiungere la riga al registro **senza** scrivere il documento fa fallire
`verifica:convenzioni` con `LetturaFallita`: le due metà vanno insieme.

---

## 🟡 M-2 · Il corpus chat intero a ogni evento, con la soglia affidata a un documento

**Dove.** `src/lib/api.js:605-641`, `src/hooks/useChatData.js`.

**Il fatto.** `Messages.listAll(2000)` legge **tutti** i messaggi di **tutte**
le conversazioni visibili, ed è ciò che il reload realtime della chat chiama a
ogni evento (debounced). La sostituzione per-conversazione esiste già,
scritta e mai collegata:

```js
// src/lib/api.js:605
// Non chiamata da nessuna parte, DI PROPOSITO: è il secondo passo di ST-4 […]
// la lettura per-conversazione che sostituirà il corpus intero di listAll()
// quando `messages` supererà la soglia scritta lì (~1500) — oggi 13.
listForConversation: (conversation_id, limit = 200) => …
```

La decisione è ragionata e oggi corretta: a 13 righe paginare sarebbe
complessità comprata in anticipo. **Il rilievo non è la decisione: è il suo
innesco.** «Quando `messages` supererà ~1500» è una condizione su un dato di
produzione, e nessuno dei sei script di verifica misura dati di produzione:
`verifica:convenzioni` misura *questo repository*, `verifica:rpc` e
`verifica:migrazioni` misurano *l'esistenza* di RPC e migrazioni, non i
volumi. La soglia è quindi una frase in un documento del 10 agosto, e ciò che
la farà scattare è che qualcuno se ne ricordi.

È la stessa forma di A-2 e A-3: un presidio che esiste, è corretto, e non è
collegato a niente che lo esegua.

**La correzione.** La soglia diventa una sonda, accanto a quelle che già
interrogano la produzione in sola lettura:

```js
// scripts/verifica-volumi/index.js
//
// M-2 dell'audit del 23 agosto. Le decisioni di scalabilità di questo progetto
// sono espresse come soglie su volumi di produzione — `messages > ~1500` per
// ST-4 passo 2, `db-max-rows` per le letture paginate — e nessuno le misurava:
// vivevano come frasi in documenti, cioè come promemoria. Questa sonda le
// trasforma in un controllo che parla da solo quando il momento arriva.
//
// Sola lettura, chiave anon, nessuna scrittura: stesso profilo di
// verifica-rpc. Esce 1 quando una soglia è superata — è il segnale che il
// secondo passo di ST-4 va collegato, non che qualcosa è rotto.
const SOGLIE = [
  { tabella: 'messages', max: 1500,
    rimedio: 'Collega Messages.listForConversation (api.js:614) al posto di ' +
             'listAll: vedi ST-4 passo 2 in AUDIT_STRUTTURA_2026-08-10.md.' },
  { tabella: 'tasks', max: 2500,
    rimedio: 'La finestra `completeDal` regge, ma verifica il costo del ' +
             'count esatto: misurato 11 ms su 276 righe il 12 agosto.' },
];
```

da agganciare a `verifica-rpc.yml` come quinto passo, con lo stesso
`if: always()` degli altri.

---

## 🟢 B-1 · Il saldo di una lista è definito due volte

**Dove.** vista `liste_saldi` (`20260728190000_sync_modulo_liste_viaggio.sql:98`) contro `ListaDetail.jsx:78`, `RiepilogoClienteModal.jsx:15`, `ClienteListePanel.jsx:64`, `listeApi.js:488` (`docHtml`) e `:518` (`riepilogoTesto`).

**Il fatto.** Il database calcola il saldo in `numeric(12,2)`, cioè in
aritmetica decimale esatta:

```sql
COALESCE(SUM(m.importo) FILTER (WHERE m.deleted_at IS NULL), 0) AS saldo
```

Il client lo ricalcola in virgola mobile IEEE-754:

```js
// src/components/liste/ListaDetail.jsx:78
const saldo = useMemo(() => movimenti.reduce((s, m) => s + Number(m.importo), 0), [movimenti]);
```

**Quanto sbaglia, misurato.** Su 2000 movimenti casuali a due decimali fra
−1000 e +1000: **scarto 9,1 × 10⁻¹¹ €**. Undici ordini di grandezza sotto il
centesimo, e `eur()` arrotonda comunque a due decimali in visualizzazione;
`EPS = 0.004` copre il caso del confronto con zero. **Non è un difetto di
correttezza, e non va corretto come se lo fosse.**

**Perché è comunque un rilievo.** È la stessa domanda con due risposte, sulla
sola grandezza monetaria dell'applicazione — il principio che
`lib/permissions.js` enuncia in cima («una sola definizione di ogni regola») e
che `canAccessListe` esiste per rispettare. E la copia in virgola mobile è
quella che finisce nei documenti che **escono dal sistema**: la copia agente
in Word (`docHtml`) e il riepilogo per il cliente (`riepilogoTesto`), cioè le
due uscite in cui una cifra non verificabile è più difficile da smentire.

**La correzione**, minima: il saldo si legge da dove è già esatto.

```js
// src/components/liste/ListaDetail.jsx
// B-1 dell'audit del 23 agosto. `liste_saldi.saldo` è calcolato dal database
// in numeric(12,2); sommare qui in float64 è una SECONDA definizione della
// stessa grandezza, e ricalcolare ciò che è già arrivato esatto non fa
// guadagnare nulla. Lo scarto misurato è 9e-11 € su 2000 movimenti — non è
// un difetto di correttezza, è una definizione di troppo, sull'unica
// grandezza monetaria dell'app e proprio sulla copia che finisce nel
// documento Word consegnato all'agente.
// Il fallback locale resta per il solo caso in cui la riga di `saldi` non sia
// ancora arrivata (primo render dopo una scrittura, prima del reload).
const saldo = useMemo(
  () => (saldi[lista.id]?.saldo !== undefined
    ? Number(saldi[lista.id].saldo)
    : movimenti.reduce((s, m) => s + Number(m.importo), 0)),
  [saldi, lista.id, movimenti],
);
```

---

## 🟢 B-2 · CVE `xlsx` 0.18.5 — sesta conferma

Riverificato oggi, non dedotto:

```
$ curl -sS --max-time 25 https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
curl: (56) CONNECT tunnel failed, response 403
```

`npm audit` conferma 1 sola vulnerabilità high, `xlsx`, «No fix available» sul
registry npm. Il blocco di rete verso `cdn.sheetjs.com` persiste — è la
**sesta** conferma consecutiva (S-06 del 6 agosto, audit dell'11, del 12, B-4
del 15, del 18, oggi). La mitigazione applicativa (`MAX_IMPORT_BYTES` +
`withPrototypePollutionGuard`, quest'ultimo esteso ai descrittori da M-2 del
22 agosto) resta il fix effettivo. **Nessuna azione nuova**: il rilievo è
registrato, motivato e correttamente non chiuso.

---

## 🟢 B-3 · `ProfileEditor.jsx`: 12 `useState` in 530 righe

Il residuo di B-3 del 15 agosto, che aveva ridotto quattro componenti sopra le
400 righe ma non questo — oggi il primo del progetto per numero di stati
locali. Non ha difetti funzionali; è il candidato naturale per lo stesso
trattamento già applicato altrove (un `useReducer` per il form, come
`convViewReducer` in `chat/chatReducers.js`), quando lo si toccherà per altro.

## 🟢 B-4 · Header: due assenze

`vercel.json` porta una CSP restrittiva e completa (niente `unsafe-inline`,
`frame-ancestors 'none'`, `object-src 'none'`). Mancano due cose, entrambe
minori:

- **`Cross-Origin-Embedder-Policy`**: c'è `COOP: same-origin` ma non `COEP`,
  quindi l'isolamento cross-origin non è completo. Da valutare con attenzione:
  `require-corp` romperebbe il caricamento dei font Google, che sono l'unica
  risorsa cross-origin della pagina.
- **CSP senza canale di report**: né `report-uri` né `report-to`. Una
  violazione oggi blocca la risorsa e non lo dice a nessuno; con un endpoint di
  report, il primo tentativo di iniezione — o la prima regressione che aggiunge
  uno stile inline — diventa un segnale invece di un bug visivo.

---

## Sintesi: dove sta davvero il debito

Tre dei quattro rilievi più gravi di questo audit (A-1, A-2, A-3) e uno dei
medi (M-2) sono **la stessa cosa vista da quattro lati**: questo progetto ha
un impianto di verifica notevole — sei script, tre workflow, 1596 test,
`no-restricted-imports` che codifica le convenzioni come regole eseguibili —
e quell'impianto misura, quasi sempre, **il repository contro se stesso**.

Le due cose che possono degradare senza che il repository cambi di una riga —
la coerenza fra i permessi del client e quelli del database, e i volumi di
produzione — sono presidiate da un test che non gira, da due sonde che possono
tacere restando verdi, e da una soglia scritta in un documento. A-1 è la prova
che la prima delle due **è già degradata**, e che è successo senza rumore.

La direzione di lavoro non è aggiungere controlli: è collegare quelli che
esistono già.
