# Audit — codebase completa · 31 agosto 2026

Perimetro: **tutto**, in otto aree — bug e logica, sicurezza, performance,
architettura, database, API/backend, frontend/UX, DevOps/deploy. È il primo
audit di questo repository che non ha un perimetro tematico: gli undici
precedenti guardavano ciascuno una superficie, questo guarda dove le superfici
si toccano.

Quattordici rilievi: **uno critico, quattro di alta priorità.**

Base di partenza misurata su questo commit (`4cc2003`): `npm ci` pulito,
`npm test` verde (**1980 passati, 23 saltati su 164 file**), `npm run lint`
senza segnalazioni, `npm run build` + `npm run verifica:bundle` verdi
(80,66 kB gzip anonimo su 86 di soglia, 127,47 kB autenticato su 131),
dodici audit precedenti chiusi.

⟦stato: 0/14 chiusi⟧

> **Sulla numerazione.** `C-` = critico, `A-` = alta priorità, `M-` = media,
> `B-` = bassa, come negli audit dal 12 agosto in poi.

---

## Executive summary

**Questa è una codebase in ottima salute con un buco a forma di soldi.**

Va detto con precisione, perché è la ragione per cui i rilievi sono quattordici
e non quaranta. La sicurezza è di livello raro per un progetto di questa
dimensione: CSP senza `'unsafe-inline'`, allow-list di origini esatta e non a
prefisso, predicato di admin che rispecchia `public.is_admin()` riga per riga e
vive in un modulo puro testato, confronto a tempo costante sul segreto push,
`revoke` su `anon`, policy `restrictive` `rls_active_only` su quattordici
tabelle, le due CVE di `xlsx` mitigate architetturalmente (Worker + guardia sui
prototipi) e dichiarate in un gate invece che ignorate. Non ho trovato XSS, né
SQL/NoSQL injection, né un segreto in chiaro, né un bypass di ruolo. La
performance è dentro i budget e i budget esistono. Il database ha indici,
vincoli e `numeric(12,2)` sugli importi.

**E poi c'è `parseImporto`.**

Il modulo Liste buoni viaggio è un registro contabile: righe di dare e avere su
un buono intestato a un cliente, con un saldo che il cliente legge. La funzione
che traduce ciò che l'operatore digita in un numero sta in
`components/liste/listeFormato.js:96` ed è tre righe. Su `"1.250,00"` — la
cifra che il messaggio di validazione accanto, in `regoleMovimento.js:16`,
indica testualmente come esempio di formato corretto — restituisce **1,25**.
Passa la validazione, supera il `check (importo <> 0)` del database, entra nel
saldo e finisce nella copia Word che esce dall'agenzia. Nessun errore, da
nessuna parte.

Le altre tredici voci di questo audit sono ordinaria manutenzione. C-1 è un
difetto di correttezza contabile in produzione, ed è la sola ragione per cui
questo documento si apre con un `C-`.

I quattro rilievi di alta priorità raccontano invece una storia coerente, e
vale la pena vederla come storia: **tre delle quattro sono promesse che il
sistema fa e non mantiene.** Il registry di persistenza promette il rollback e
non ce l'ha per i task (A-1). L'app promette a chi segnala un errore un codice
con cui rintracciarlo, e quel codice non arriva da nessuna parte (A-4). I form
promettono un'etichetta a ogni campo, e per uno screen reader due terzi di esse
non sono etichette (A-3). La quarta, A-2, è la stessa cosa vista da fuori: la
tastiera è una promessa che l'app non fa mai esplicitamente e che quattordici
elementi rompono in silenzio.

Il tema, se ce n'è uno, è che **questo repository verifica benissimo ciò che ha
deciso di verificare.** `verifica:convenzioni` ha 53 controlli e sei di essi
hanno atteso zero; `eslint.config.js` ha regole `no-restricted-syntax` scritte
apposta per questo progetto; il budget del bundle misura due percorsi. Tutti e
quattordici i rilievi qui sotto vivono esattamente fuori da quei perimetri: gli
importi non hanno un controllo, `src/components/` non ha `checkJs`, non esiste
un plugin di accessibilità, e il registry di persistenza è misurato per le
scritture in volo ma non per il rollback.

---

## Tabella delle priorità

| Rilievo | Gravità | Cosa | Dove |
|---|---|---|---|
| C-1 | **Critico** | `parseImporto` mangia il separatore delle migliaia: `1.250,00 € → 1,25 €`, in silenzio, su quattro percorsi di scrittura | `src/components/liste/listeFormato.js:96` |
| A-1 | Alta | Nessun `rollback` per l'intero dominio task: dopo una scrittura fallita la UI resta sul valore mai salvato | `src/state/persistence.js` |
| A-2 | Alta | Quattordici elementi interattivi non raggiungibili da tastiera (`<div onClick>` senza `role`/`tabIndex`/`onKeyDown`) | `chat/`, `calendar/`, `clients/`, `liste/`, `tasks/bulk/` |
| A-3 | Alta | 51 `<label>` su 75 senza `htmlFor`: per uno screen reader quei campi non hanno nome | 20 file in `src/components/` |
| A-4 | Alta | Il codice di segnalazione mostrato all'utente in produzione non arriva a nessuno | `src/lib/errorReporting.js:56` |
| M-1 | Media | «Come si legge un importo» esiste in due copie divergenti, e quella giusta è nello script | `listeFormato.js:96` vs `scripts/importa-liste/parser.js:80` |
| M-2 | Media | `checkJs` copre 8.169 righe su 36.618 (22%): `hooks/` e `components/` fuori — cioè dove vive C-1 | `jsconfig.json` |
| M-3 | Media | Nessun rate limiting sulle quattro Edge Function esposte al browser | `supabase/functions/` |
| M-4 | Media | `delete-user` classifica gli errori per sottostringa del messaggio di GoTrue | `supabase/functions/delete-user/index.ts` |
| M-5 | Media | `delete-account`: azione irreversibile senza riautenticazione, e l'email resta occupata per sempre | `supabase/functions/delete-account/index.ts` |
| B-1 | Bassa | `parseImporto` accetta coda non numerica e spazi: `"12abc" → 12`, `"1 250,00" → 1` | `src/components/liste/listeFormato.js:96` |
| B-2 | Bassa | `Clients.cerca`: `%` e `_` digitati dall'utente sono wildcard SQL | `src/lib/api/clienti.js:92` |
| B-3 | Bassa | `fetchAllRows` senza tetto su clienti e liste: la finestra esiste solo sui task | `src/lib/pagination.js` |
| B-4 | Bassa | Le cinque Edge Function non hanno un contratto scritto da nessuna parte | `supabase/functions/` |

---

## 1. Bug e logica

### C-1 · `parseImporto` divide per mille, in silenzio — **Critico**

**Dove.** `src/components/liste/listeFormato.js:96-100`

```js
export const parseImporto = (raw, segno = 1) => {
  const n = parseFloat(String(raw ?? '').replace(',', '.'));
  if (!n || Number.isNaN(n)) return null;
  return Math.abs(n) * (segno < 0 ? -1 : 1);
};
```

**Cosa succede.** `.replace(',', '.')` sostituisce **la prima virgola**, e
`parseFloat` si ferma al secondo punto. Misurato:

| Digitato | Restituito |
|---|---|
| `1.250,00` | **1.25** |
| `12.345,67` | **12.345** |
| `1.250` | **1.25** |
| `1 250,00` | **1** |
| `1250,00` | 1250 ✓ |
| `100,50` | 100.5 ✓ |

**Perché è critico e non alto.** Tre cose insieme, e nessuna delle tre da sola
lo sarebbe:

1. **Il sistema suggerisce all'utente proprio il formato che sbaglia.** Il
   messaggio di errore del campo, in `components/liste/regoleMovimento.js:16`,
   è testualmente: *«Importo non valido: usa una cifra come 1.250,00.»* Quella
   cifra diventa 1,25.
2. **Nessun controllo lo intercetta.** Il valore non è `null`, quindi
   `interpretabile()` lo accetta e nessun `FieldError` compare; è `≠ 0`, quindi
   il `check (importo <> 0)` di `movimenti_lista`
   (`20260713174309_modulo_buoni_liste_viaggio.sql:24`) lo accetta; sta
   comodamente dentro `numeric(12,2)`. Il dato entra e nessuno protesta.
3. **Esce dal sistema.** L'importo alimenta `liste_saldi.saldo`, il riepilogo
   che il cliente riceve (`riepilogoTesto`) e la copia Word per l'agente
   (`docHtml`) — cioè il documento che, dice il commento in
   `listeDocumenti.js:31`, *«è proprio quello in cui una cifra sbagliata è più
   difficile da smentire»*.

**Quattro percorsi di scrittura sono coinvolti**, non uno:
`AddMovBox.jsx:84` (registrazione, il form a frequenza più alta del
gestionale), `modals/EditMovimentoModal.jsx:54` (correzione),
`CellEditor.jsx:60` (modifica in linea nella tabella), `modals/BulkMovimentiModal.jsx:116`
(inserimento multiplo).

**Perché i test non lo vedono.** `src/test/liste/listeApi.test.js:60-76`
esercita `parseImporto` su `"12,50"`, `"12.50"`, `"0"`, `""`, `"abc"`, `null`:
**nessun valore sopra le mille unità**, cioè nessuno in cui il separatore delle
migliaia possa comparire. 1980 test verdi e questo passa in mezzo.

**Soluzione.**

```js
// listeFormato.js — il separatore delle migliaia si toglie PRIMA della virgola
// decimale, ed è ciò che scripts/importa-liste/parser.js:80 già fa.
export const parseImporto = (raw, segno = 1) => {
  const s = String(raw ?? '').trim().replace(/\s/g, '');
  // Rifiuta ciò che non è un importo, invece di leggerne il prefisso (B-1):
  // parseFloat("12abc") vale 12, e un importo mezzo interpretato è peggio di
  // un importo rifiutato.
  if (!/^-?\d{1,3}(\.\d{3})*(,\d{1,2})?$|^-?\d+([.,]\d{1,2})?$/.test(s)) return null;
  const n = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(n) || n === 0) return null;
  return Math.abs(n) * (segno < 0 ? -1 : 1);
};
```

⚠️ **`1.250` resta ambiguo** e la regex sopra lo legge come **1250** (tre cifre
dopo il punto = migliaia, che è la convenzione italiana). È una scelta, non una
deduzione: va detta all'utente nel `placeholder` del campo, non lasciata al
parser.

**Priorità.** Immediata, e prima di tutto il resto di questo documento.
**Va accompagnata da una verifica sui dati già in produzione**: i movimenti con
`importo` a due decimali sotto le 10 unità su liste il cui saldo non torna sono
i candidati. Il fix del codice non ripara le righe già scritte.

### B-1 · `parseImporto` legge il prefisso di ciò che non è un importo — **Bassa**

Stessa funzione. `parseFloat("12abc")` vale `12`: una battitura sbagliata
diventa un movimento valido invece di un errore in rosso. `"1 250,00"` diventa
`1`. Chiuso dalla stessa correzione di C-1 (la regex rifiuta invece di
troncare).

### A-1 · Il dominio task non ha rollback — **Alta**

**Dove.** `src/state/persistence.js`, ventotto entry.

Il registry dichiara `guard` / `normalize` / `persist` / `rollback` / `mapError`
e `useSyncedDispatch.js:117` esegue il rollback quando `persist` fallisce. La
copertura però non è uniforme, ed è asimmetrica in modo netto:

| Dominio | Entry con `rollback` |
|---|---|
| Avvisi | 3 su 4 |
| Clienti | 5 su 5 |
| Team / profilo | 5 su 5 |
| **Task** | **1 su 8** (solo `ADD_TASKS_BULK`) |

Restano scoperte `ADD_TASK`, `UPDATE_TASK`, `MOVE_TASK`, `DELETE_TASK`,
`RESTORE_TASK`, `PURGE_TASK`, `UNDO_LAST_ACTION`, `ADD_COMMENT` — cioè
**spostare, modificare, cestinare e ripristinare una task**, le quattro azioni
più frequenti del gestionale.

**Cosa vede l'utente.** Trascina una task da «In corso» a «Completata», la rete
cade, compare il toast rosso — e la task **resta nella colonna sbagliata**. Il
`RETRACT_TOASTS` di `useSyncedDispatch.js:150` ritira il messaggio di successo,
quindi la contraddizione a schermo non c'è; resta lo stato sbagliato senza
niente che lo dica.

**Perché non si ripara da solo.** I task usano `applyRow`
(`useAppHydration.js:486` → `MERGE_TASK_ROW`): un evento realtime di un altro
utente applica **la sua riga** e non innesca un refetch. La riga rimasta
sbagliata viene corretta solo dal reload completo alla ripresa
(`online`, o `visibilitychange` oltre i 30 s — `useDebouncedTableSubscription.js:5`).
In un pomeriggio tranquillo in agenzia, con la scheda sempre in primo piano,
possono passare ore.

**Soluzione.** Le entry hanno già in mano lo stato precedente: il pattern è
quello che `UPDATE_NOTICE` usa già.

```js
UPDATE_TASK: {
  guard: /* invariato */,
  entityId: (a) => a.payload?.id,
  persist: (s, a) => TasksAPI.update(a.payload.id, toDbTaskPatch(a.payload)),
  rollback: (s, a) => {
    const prev = findTask(s, a.payload?.id);
    return prev ? { type: "UPDATE_TASK", payload: prev } : null;
  },
  mapError: () => "task non aggiornata",
},
MOVE_TASK: {
  // …
  rollback: (s, a) => {
    const prev = findTask(s, a.payload?.taskId);
    return prev ? { type: "MOVE_TASK", payload: { taskId: prev.id, newStatus: prev.status } } : null;
  },
},
DELETE_TASK:  { /* … */ rollback: (s, a) => ({ type: "RESTORE_TASK", payload: a.payload }) },
RESTORE_TASK: { /* … */ rollback: (s, a) => ({ type: "DELETE_TASK",  payload: a.payload }) },
ADD_TASK:     { /* … */ rollback: (s, a) => ({ type: "ROLLBACK_TASKS_BULK", payload: [a.payload.id] }) },
```

`ROLLBACK_TASKS_BULK` esiste già nel reducer e accetta un elenco di id: `ADD_TASK`
non richiede un case nuovo. `PURGE_TASK` e `UNDO_LAST_ACTION` sono i due casi
in cui il rollback è genuinamente difficile (la riga non c'è più): lì la
risposta giusta è un refetch mirato, non una compensazione.

**Da rendere misurabile.** `verifica:convenzioni` ha già un controllo sulle
«metà scoperte delle scritture in volo» (`index.js:398`) che legge questo stesso
file. Un controllo gemello — *entry con `persist` su un'entità dello state e
senza `rollback`* — trasforma questo rilievo in un ratchet invece che in una
nota che scade.

**Priorità.** Alta, subito dopo C-1.

### M-4 · `delete-user` classifica gli errori per sottostringa — **Media**

**Dove.** `supabase/functions/delete-user/index.ts`

```ts
const lower = rawMsg.toLowerCase();
if (lower.includes("not found")) { /* ripulisci il residuo, 200 */ }
if (lower.includes("foreign key") || lower.includes("violates")) { /* 409 */ }
```

Il ramo «not found» **cancella la riga in `public.users`** e risponde
`success: true`. Il testo di quel messaggio è un dettaglio interno di GoTrue,
non un contratto: un cambio di formulazione fra due release fa cadere un errore
reale nel ramo sbagliato — e nel primo caso il fallimento diventa un successo,
con la riga applicativa rimossa e l'utente auth ancora vivo.

**Soluzione.** Classificare sul codice, non sulla prosa: `delErr.status === 404`
(o `delErr.code`), con il match testuale come solo fallback e un `console.warn`
quando è il fallback a decidere — così la deriva si vede nei log invece di
manifestarsi come un successo falso.

**Priorità.** Media. È l'endpoint più distruttivo del sistema, e questo è
l'unico punto in cui non è scritto con lo stesso rigore del resto.

### B-2 · `%` e `_` digitati sono wildcard — **Bassa**

`src/lib/api/clienti.js:92` — `query.ilike('name', '%${t}%')`. Non è
injection (postgrest-js codifica il valore), ma chi cerca `50%` cerca in realtà
`50` seguito da qualsiasi cosa. Fix: `t.replace(/[%_]/g, m => '\\' + m)`.

---

## 2. Sicurezza

**Nessun rilievo critico né alto.** Questa sezione è breve perché la superficie
è stata chiusa bene, e vale la pena elencare cosa ho verificato e trovato a
posto: nessun `dangerouslySetInnerHTML` né `innerHTML` in tutto `src/`; l'unico
sink di HTML grezzo (`listeDocumenti.js`) applica `escHtml` in tutti i suoi
punti di testo libero; CSP `script-src 'self'` e `style-src 'self'` senza
`'unsafe-inline'` (`vercel.json`), con `frame-ancestors 'none'` e
`object-src 'none'`; origini CORS e `redirectTo` da un elenco esatto di tre
host (`_shared/originConsentite.ts`) e non da un prefisso; `requireActiveAdmin`
rispecchia `public.is_admin()` inclusi `active` e `pending`, e una query fallita
dà 403 e non un via libera; il segreto di `send-push` si confronta a tempo
costante; le chiavi vengono solo da `import.meta.env` / `Deno.env`, zero
credenziali in chiaro in `src/`, `scripts/`, `.github/`.

### M-3 · Nessun rate limiting sulle Edge Function — **Media**

Le quattro funzioni esposte al browser (`invite-user`, `delete-user`,
`set-user-active`, `delete-account`) verificano **chi** chiama e non **quanto**.
`invite-user` in particolare, in mano a un token admin compromesso o a uno
script, invia email dal dominio dell'agenzia senza tetto: quota SMTP bruciata,
reputazione del mittente danneggiata, e un canale di spam che parte da un
dominio legittimo. Non è un bypass di autorizzazione — serve un admin attivo e
approvato — ma è l'unico moltiplicatore di danno rimasto.

**Soluzione.** Il modo più economico su questo stack è una tabella di conteggio
letta dalla funzione stessa, non un servizio in più:

```sql
-- N inviti per admin per finestra oraria, dal database e non dalla memoria
-- dell'isolate (che su Deno Deploy non sopravvive fra due invocazioni).
create table if not exists public.rate_limit (
  chiave text not null, finestra timestamptz not null, conteggio int not null default 0,
  primary key (chiave, finestra)
);
```

con un `insert … on conflict do update set conteggio = rate_limit.conteggio + 1
returning conteggio` e un 429 sopra soglia. Venti inviti l'ora per admin non
disturbano nessun uso reale.

**Priorità.** Media.

### M-5 · `delete-account`: irreversibile, senza riautenticazione — **Media**

`supabase/functions/delete-account/index.ts` accetta qualunque token valido,
banna l'utente per dieci anni e anonimizza il profilo. Due cose:

1. **Nessuna riautenticazione.** Una sessione lasciata aperta su una postazione
   condivisa — in agenzia è la norma — basta a cancellare l'account. Lo
   standard per un'azione irreversibile è richiedere la password corrente
   (`supabaseAuth.signInWithPassword` lato client, o `reauthentication` di
   GoTrue) subito prima.
2. **L'email resta occupata.** La riga in `auth.users` non viene rimossa, quindi
   quell'indirizzo non può più essere invitato: un rientro in agenzia richiede
   un intervento manuale sul database. È probabilmente voluto (l'integrità
   referenziale di task e messaggi), ma non è scritto da nessuna parte e
   `user_contacts` viene comunque cancellata — cioè si perde l'informazione
   *senza* liberare l'indirizzo, che è il peggiore dei due esiti.

**Priorità.** Media. Il punto 1 è mezz'ora di lavoro.

### Nota — password e protezione credenziali

`validators.js:PASSWORD_MIN = 8`, nessun requisito ulteriore, e
`leaked_password_protection` è spento perché richiede il piano Supabase Pro
(scelta registrata e accettata il 12 agosto). **Non lo riapro come rilievo**:
è documentato, motivato e deciso da chi amministra il progetto. Vale però
ricordare che è l'unica difesa mancante su un'app che tiene dati di clienti
finali, e che il costo del Pro è la sua unica ragione.

---

## 3. Performance

**Nessun rilievo alto o medio.** Le misure di questo commit:

```
first load anonimo      80,66 kB gzip   (soglia 86)
first load autenticato 127,47 kB gzip   (soglia 131)
chunk d'ingresso        35,18 kB gzip   (soglia 41)
chunk dell'app          46,80 kB gzip   (soglia 51)
```

Diciassette chunk lazy con soglia informativa, `xlsx` (137 kB gzip) dietro un
`import()` e in un Worker, `@supabase/supabase-js` scaricato solo alla prima
query vera. Gli indici sul database coprono le colonne effettivamente filtrate
(`tasks(status)`, `tasks(due_date)` entrambi parziali su `deleted_at is null`,
GIN su `assignees` e `participants`, trigram su `clients`). Ho cercato query
N+1 nel data layer: non ce ne sono — `EMPTY_TRASH` e `RESTORE_BACKUP`, che le
avevano, sono già stati corretti in blocco.

### B-3 · La finestra esiste solo sui task — **Bassa**

`useAppHydration.js:108` limita i task a `FINESTRA_COMPLETATE_GG = 60`. Clienti
e liste passano invece da `fetchAllRows` (`lib/pagination.js`), che scarica
**tutto** paginando a mille righe per volta: corretto per non troncare in
silenzio, ma senza tetto. È esplicitamente una scelta documentata, e alla scala
attuale non si vede; a cinquemila clienti sarà il prossimo A-.

**Soluzione.** Quando arriverà: `useClientiCompleti()` esiste già ed è il posto
giusto — la vista che guarda l'anagrafica chiede l'anagrafica, e le altre no.
Serve solo estendere lo stesso schema della finestra dei task.

---

## 4. Architettura e codice

Il livello è alto e misurato: `max-lines` a 500 è un errore di lint a zero
violazioni, un file per componente, `no-restricted-imports` chiude i moduli
privati di `lib/api/`, quattro regole `no-restricted-syntax` scritte per questo
progetto, nessun `TODO`/`FIXME` in tutto `src/`, nessuno stato globale mutabile.
Non ho rilievi SOLID da segnalare che non siano già chiusi.

### M-1 · La stessa regola di dominio, in due copie, e diverge — **Media**

**È la causa architetturale di C-1**, e va corretta insieme a lui o tornerà.

«Come si legge un importo scritto da una persona italiana» è una regola di
dominio, e questo repository la implementa due volte:

| Dove | Come | Su `1.250,00` |
|---|---|---|
| `components/liste/listeFormato.js:96` | `.replace(',', '.')` | **1.25** ✗ |
| `scripts/importa-liste/parser.js:80` | `.replace(/\./g, '').replace(',', '.')` | 1250 ✓ |

L'import in blocco legge gli importi correttamente; il form che l'operatore usa
ogni giorno no. Le due non sono divergenti per caso: sono state scritte in
momenti diversi da chi risolveva due problemi diversi, ed è esattamente il
difetto che `_shared/requireActiveAdmin.ts` porta scritto nel preambolo
(«i controlli duplicati non divergono, restano uguali e sbagliati insieme») —
qui però sono divergenti, che è la variante peggiore: una delle due è giusta e
nessuno se ne accorge.

**Soluzione.** Una sola implementazione in `src/lib/` (è dominio, non
presentazione, e `src/lib/` è sotto `checkJs`), importata sia da
`listeFormato.js` sia dallo script. Con i casi limite nel test: `1.250,00`,
`12.345,67`, `1250,00`, `0,00`, `12abc`, `1 250,00`.

### M-2 · `checkJs` copre il 22% del codice, e non copre dove serve — **Media**

`jsconfig.json` include `src/lib/**` e `src/state/**`: **8.169 righe su 36.618**.
Fuori restano `src/hooks/` (2.400 righe, fra cui `useAppHydration` e
`useSyncedDispatch`, cioè idratazione e orchestrazione delle scritture) e tutto
`src/components/` — **dove vive C-1**.

Il commento in testa al file dice che le due cartelle successive sono
`src/components/` e `src/hooks/` e che «si allarga quando la cartella nuova è a
zero». È la regola giusta; è ferma dal 15 agosto.

**Soluzione.** `src/hooks/**/*.js` per primo: è la cartella più piccola, la più
critica e non contiene JSX, quindi non richiede di decidere niente sul typing
dei componenti. Poi `src/components/**` una sottocartella per volta, con
`liste/` per prima — vista C-1.

**Priorità.** Media, ma il primo passo costa poco e va fatto insieme a C-1.

---

## 5. Database e modello dati

**Nessun rilievo.** Lo dico per esteso perché è insolito.

126 migrazioni; RLS attiva ovunque con una policy `restrictive` `rls_active_only`
su quattordici tabelle che interseca ogni policy permissiva con «utente attivo e
approvato»; `revoke` su `anon` (`20260806170000`); `search_path` fissato su
tutte le `security definer` vive (le quattro migrazioni che ne mancavano sono
`revoke`/`grant` senza funzioni proprie, e l'unica funzione scoperta —
`next_dossier_number`, che era anche una race condition da `COUNT(*)+1` — è
stata prima corretta e poi eliminata da `20260814210000`); vincoli `check` sui
valori di dominio; `numeric(12,2)` sugli importi, non `float`; il soft delete è
una colonna `deleted_at` con gli indici parziali che la rispettano.

L'unica cosa da tenere d'occhio non è un difetto dello schema ma del processo:
la storia delle migrazioni nel repo non coincide con `schema_migrations` sul
database, `supabase db push` è vietato e l'applicazione è manuale.
`npm run verifica:rpc` gira ogni giorno in CI e confronta le RPC chiamate dal
codice con quelle presenti — è la mitigazione giusta ed è già in piedi. Non
apro un rilievo perché non c'è niente da correggere nel codice; va però messo
in conto che una migrazione committata e non applicata è, su questo progetto,
uno stato normale e non un incidente.

---

## 6. API e backend

Il «backend» sono PostgREST (generato) e cinque Edge Function. Il design REST
non è una scelta del progetto e i codici HTTP delle funzioni sono corretti
(401/403/400/409/502/500), con i messaggi d'errore volutamente indistinti dove
serve (`MSG_NON_AUTORIZZATO` è uno solo per tre rifiuti diversi, e il preambolo
spiega perché). La paginazione c'è ed è un contratto (`fetchAllRows`,
`fetchRowsUpTo`).

Rate limiting: vedi **M-3**.

### B-4 · Le Edge Function non hanno un contratto scritto — **Bassa**

`invite-user` accetta `email`, `name`, `role`, `capacity`, `color`, `resend`,
`redirectTo`; ne valida cinque con default silenziosi (un `role` sconosciuto
diventa `agent`, una `capacity` fuori range diventa 8). È ragionevole, ma
esiste solo nel corpo della funzione: chi chiama lo deduce leggendola, e i
default silenziosi sono proprio ciò che un contratto dovrebbe rendere
esplicito. `docs/SICUREZZA.md` descrive il modello di autorizzazione, non le
forme di richiesta e risposta.

**Soluzione.** Non serve OpenAPI: un `supabase/functions/README.md` con le
cinque firme, i campi accettati, i default e i codici di risposta è
proporzionato alla dimensione della superficie.

---

## 7. Frontend e UX

Il responsive è curato (`useViewport`, breakpoint dichiarati, `SwipeActions` e
`BottomNav` su mobile, safe-area iOS), gli stati vuoti e di attesa sono onesti
per regola esplicita (scheletri invece di «nessun elemento» finché il primo
fetch non è tornato, `…` invece di `0`), i form hanno validazione per campo con
`aria-invalid`/`aria-describedby` accoppiati e focus sul primo campo sbagliato
in ordine visivo, e `useSalvataggio` impedisce di chiudere prima di conoscere
l'esito su 26 call site. Il feedback c'è.

**L'accessibilità no**, e le due voci qui sotto sono la stessa lacuna vista da
due lati: **non esiste un controllo automatico** — `eslint-plugin-jsx-a11y` non
è fra le dipendenze e non compare in `eslint.config.js`. Tutto ciò che è stato
fatto in accessibilità (ed è parecchio: i modali hanno `role="dialog"`, le
attese hanno `role="status"`, gli errori di campo sono accoppiati) è stato
fatto a mano, rilievo per rilievo. Ciò che nessun audit ha ancora nominato è
rimasto scoperto.

### A-2 · Quattordici elementi interattivi non raggiungibili da tastiera — **Alta**

`<div onClick>` senza `role`, senza `tabIndex`, senza `onKeyDown`: invisibili
al Tab, inerti su Invio, e per uno screen reader non annunciati come
attivabili.

| File:riga | Cosa non si può fare da tastiera |
|---|---|
| `chat/ConversationList.jsx:112` | **aprire una conversazione** |
| `chat/NewConversationView.jsx:126, 179` | avviare una chat 1:1, selezionare un partecipante |
| `clients/ClienteCard.jsx:52` | **aprire una scheda cliente** |
| `calendar/CalendarMonthGrid.jsx:108, 132` | selezionare un giorno, **aprire una task dal calendario** |
| `calendar/CalendarDayGrid.jsx:96` | aprire una task |
| `calendar/CalendarWeekGridDay.jsx:41` | aprire una task |
| `calendar/CalendarPlanner.jsx:311` | aprire una task |
| `liste/ListaDetail.jsx:269` | **modificare in linea la descrizione di un movimento** |
| `clients/ClientImportModal.jsx:320, 421` | scegliere il file, includere/escludere una colonna |
| `tasks/bulk/TemplateTab.jsx:133` | scegliere un template di pratica |
| `tasks/bulk/ImportTab.jsx:230` | scegliere il file |

Non sono dettagli periferici: aprire una conversazione, aprire una scheda
cliente e aprire una task dal calendario sono tre dei percorsi principali
dell'app. Per un gestionale usato tutto il giorno da operatori — dove chi è
veloce lavora da tastiera, e dove un collega con disabilità motoria o visiva
deve poter lavorare — è una barriera piena, non un fastidio.

**Soluzione.** Dove l'elemento è un comando, è un `<button>`; dove il markup
non lo permette (una `<td>`, una riga di tabella), servono i tre attributi
insieme:

```jsx
<div
  role="button"
  tabIndex={0}
  onClick={() => onSelect(c)}
  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(c); } }}
  aria-label={`Apri la conversazione con ${nome}`}
>
```

**E soprattutto**: installare `eslint-plugin-jsx-a11y` con
`click-events-have-key-events` e `no-static-element-interactions`. Senza, la
prossima card interattiva ricomincia da capo — che è precisamente ciò che è
successo qui.

**Priorità.** Alta.

### A-3 · 51 `<label>` su 75 non sono etichette — **Alta**

`<label style={labelStyle}>Nome *</label>` seguita da un `<input>` **fratello**,
senza `htmlFor` e senza annidamento: visivamente un'etichetta, per l'albero di
accessibilità due nodi scollegati. Uno screen reader annuncia «casella di testo»
e nient'altro. Misurato su `src/components/`: **51 senza `htmlFor`, 24 con** —
in venti file, fra cui `AddCategoryModal`, `AddTeamMemberModal`,
`BulkInviteModal`, `ClienteModal`, `NoticeEditorModal`, `ProfileEditor`,
`AccountSicurezza` e sei modali del modulo Liste.

Peggio nella modifica in linea (`AdminCategoriesTab.jsx:89`,
`AdminTeamTab.jsx:205`): lì l'unico testo è un `placeholder`, che **sparisce
appena si digita** e non è un nome accessibile in nessun caso.

**Soluzione.** Il progetto ha già `ariaCampo(id, errore)` in
`components/ui/FieldError.jsx` che accoppia `aria-invalid`/`aria-describedby`
per costruzione: la forma giusta è estenderlo a produrre anche `id` e restituire
l'`htmlFor` da mettere sulla label, così l'accoppiamento resta una cosa sola e
non due da ricordare.

```jsx
// una sola fonte per id, htmlFor e aria-*
const campo = ariaCampo("vd-cat-label", errori.label); // → { id, htmlFor, aria-* }
<label htmlFor={campo.id} style={labelStyle}>Nome *</label>
<input {...campo} … />
```

Per gli `<input type="color">` senza etichetta visibile (ce ne sono sei) basta
`aria-label`: `title` non è un nome accessibile affidabile.

**Priorità.** Alta. È una modifica meccanica e ampia: si fa bene una volta,
guidata dalla regola `jsx-a11y/label-has-associated-control` di A-2.

---

## 8. DevOps e deploy

La CI è seria e va detto: `lint`, `verifica:convenzioni` (53 controlli, sei con
atteso zero), `verifica:tipi`, `test`, `build`, `verifica:bundle` e
`verifica:audit` con allow-list motivata; più `verifica:rpc` e le prove RLS su
un workflow separato, e un ping programmato che tiene sveglio il progetto
Supabase. Nessuna variabile hardcodata, `.env` fuori dal repo, e le variabili
GitHub sono `variables` e non `secrets` proprio dove il valore non è segreto —
con la motivazione scritta accanto.

### A-4 · Il codice di segnalazione non arriva a nessuno — **Alta**

**Dove.** `src/lib/errorReporting.js:56`, `components/ui/ErrorDetails.jsx`

In produzione, davanti a un errore di programmazione, l'app dice all'utente:

> «Operazione non riuscita. Se si ripete, **segnala il codice VD-M2X8K1-A4C7**.»

Quel codice viene generato, stampato con `console.error` **nel browser
dell'utente**, e finisce lì. Non esiste un sink registrato in produzione
(`registraSinkErrori` alimenta il toast in-app, non un servizio), non c'è Sentry
né un endpoint di raccolta, e le Edge Function scrivono nei log di Supabase che
sono un'altra cosa e non hanno quel codice.

**Perché è alta e non media.** Il meccanismo è progettato bene — separare ciò
che serve all'utente da ciò che serve a chi ripara è raro e questo repository
l'ha fatto — ma **è progettato per metà**. L'utente fa la sua parte: annota il
codice, lo comunica. Chi riceve la segnalazione non ha dove cercarlo. È una
promessa che il sistema fa a ogni errore e non può mantenere, e il costo non è
solo l'informazione persa: è che al secondo o terzo codice inutile gli operatori
smettono di segnalarli.

**Soluzione.** Chiudere il cerchio, e la via più corta usa ciò che c'è già:

```js
// registrare un sink che PERSISTE, accanto a quello che mostra il toast.
// `audit_log` esiste già, ha già gli indici (at desc, actor_id+at) e ha già
// una policy di sola lettura per gli admin; il pannello Admin → Log attività
// lo mostra già. Serve una `action` nuova, non una tabella nuova.
registraSinkErrori(async (messaggio, { codice, motivo, origine }) => {
  mostraToast(messaggio);
  await ErroriAPI.registra({ codice, origine, testo: superficie(motivo) });
});
```

⚠️ **Con due cautele, non negoziabili su un gestionale con dati di clienti**:
mai il `componentStack` completo né il messaggio grezzo se può contenere dati
di riga (nomi, importi, email) — solo `name`, `message` normalizzato e origine;
e il ritmo va limitato riusando l'anti-raffica che `giaSegnalato()` già
implementa (`errorReporting.js:102`), altrimenti un errore in un `useEffect` in
loop scrive mille righe al minuto.

Se si preferisce un servizio esterno, va aggiunto il suo host a `connect-src`
nella CSP di `vercel.json` — che è oggi il solo `self` più Supabase.

**Priorità.** Alta.

### Nota — test

1980 test unitari e di integrazione su 164 file, incluse le prove RLS contro un
database vero. **Nessun test end-to-end**: nessun Playwright, nessun Cypress.
Non apro un rilievo — la piramide è ragionevole e i test di integrazione
coprono la parte che di solito sfugge — ma vale osservare che i due rilievi
alti di questa sezione e della precedente (A-2, A-4) sono precisamente il
genere di cosa che un e2e con navigazione da tastiera troverebbe, e che nessun
test unitario troverà mai.

---

## Top 5 da risolvere subito

1. **C-1 — `parseImporto`.** Un registro contabile che divide per mille certe
   cifre, in silenzio, senza che nessun controllo protesti, e con il messaggio
   di validazione che suggerisce proprio il formato che sbaglia. Va corretto
   nel codice **e** verificato sui dati già scritti in produzione.
2. **M-1 — l'implementazione unica dell'importo.** Va insieme a C-1: senza,
   la seconda copia (quella giusta, nello script) resta un incidente in attesa
   di ricapitare a rovescio.
3. **A-1 — rollback del dominio task.** Sette entry da aggiungere, il pattern
   già scritto in tre domini su quattro, e un controllo di
   `verifica:convenzioni` che impedisca all'ottava di nascere scoperta.
4. **A-4 — il codice di segnalazione che arriva da qualche parte.** La metà
   difficile è già fatta; manca il sink, con le due cautele sui dati e sul
   ritmo.
5. **A-2 + A-3 — accessibilità, con il plugin per primo.** Installare
   `eslint-plugin-jsx-a11y` *prima* di correggere: altrimenti si sistemano
   sessantacinque punti e il sessantaseiesimo nasce identico la settimana dopo.

---

## Piano d'azione

**Questa settimana — correttezza.**
C-1 con i suoi test (i casi limite sopra le mille unità, che oggi mancano),
M-1 nello stesso commit, e una query di verifica sui movimenti già scritti.
Poi A-1, con il controllo di `verifica:convenzioni` che lo rende un ratchet.
Il primo passo di M-2 (`src/hooks/**` sotto `checkJs`) sta comodamente qui:
è la cartella più critica e non contiene JSX.

**Le due settimane successive — le promesse mantenute.**
A-4 (sink degli errori con le due cautele), poi `eslint-plugin-jsx-a11y` in
`eslint.config.js` **a warning**, per misurare la dimensione reale prima di
decidere il ritmo; A-3 e A-2 file per file finché il conteggio non è zero, e
solo allora si alza a errore. Nello stesso periodo M-5 punto 1 (la
riautenticazione su `delete-account`), che è mezz'ora.

**Il mese — la superficie amministrativa.**
M-3 (rate limiting a tabella), M-4 (classificazione per codice e non per
prosa), B-4 (il README delle Edge Function), e i due bassi rimasti (B-2, B-3)
quando si passa di lì. `src/components/**` sotto `checkJs`, una sottocartella
per volta, `liste/` per prima.

---

## Refactoring consigliati

**Uno solo, e non è nella lista dei rilievi.** `src/lib/` è già il posto dove
vivono le funzioni pure di dominio ed è già sotto `checkJs`: **le regole di
dominio del modulo Liste non ci sono.** `parseImporto` (un'interpretazione),
`saldoClass`/`EPS` (una soglia contabile) e `intestazioneLista` (una regola di
composizione dell'intestatario) stanno in `components/liste/listeFormato.js` —
un file che si chiama «formato» e contiene tre cose che non sono formato, in
una cartella non verificata dai tipi. C-1 è nato lì dentro, e la seconda copia
è nata fuori proprio perché la prima non era in un posto raggiungibile.

Il modulo Liste è chiuso di proposito (una regola `no-restricted-imports` lo
protegge, e la chiusura è una buona decisione): la proposta non è aprirlo, ma
riconoscere che **l'interpretazione di un importo non appartiene a un modulo**
— appartiene all'applicazione, come `dates.js` e `validators.js`. È un file
spostato e due import, ed è ciò che impedisce a C-1 di riaccadere in una forma
diversa.

Per il resto: nessun refactoring architetturale da consigliare. La separazione
fra registry di scrittura, transport realtime, data layer a porta e viste senza
`state` regge, ed è verificata da regole di lint scritte apposta. Quello che
manca non è struttura — è copertura di ciò che la struttura già promette.
