# Audit architettura, struttura e sicurezza — 14 agosto 2026 (secondo passaggio)

Perimetro richiesto: organizzazione di cartelle e moduli, separazione delle
responsabilità (logica di business, chiamate API, stato locale, componenti UI),
duplicazione, anti-pattern React/JavaScript, componenti troppo estesi.

Questo è il **secondo audit dello stesso giorno**: il primo
([`AUDIT_ARCHITETTURA_2026-08-14.md`](AUDIT_ARCHITETTURA_2026-08-14.md)) ha
chiuso dieci rilievi, tutti verificati chiusi qui. Ripartire dal codice già
corretto ha senso solo se si guarda dove il primo passaggio *non* ha guardato:
il rilievo **C-1** di oggi nasce esattamente da lì — A-1 del primo passaggio ha
chiuso il buco `guard`/`rollback` sugli **avvisi**, e nel farlo ha reso
evidente che la stessa lacuna era rimasta aperta sull'**anagrafica clienti**,
che è l'entità più grande del progetto (835 righe) e l'unica che contiene PII
di persone esterne al team.

> **Tutti e otto i rilievi ✔ chiusi, lo stesso 14 agosto.** Applicati in
> sequenza — C-1 prima di A-1 (così la guardia di C-1 poteva verificare
> entrambi i livelli sullo stesso caso), poi A-2, poi M-1/M-2/M-3, poi
> B-1/B-2 — nello stesso branch di questo audit. `npx vitest run` finale:
> **1282 passati** (era 1234), 7 skip, 109 file + 1 skip; `npm run lint`: 0
> errori; `npm run verifica:convenzioni`: nessuna divergenza (`max-lines` 0
> violazioni, incluso durante il passaggio — due estrazioni di test in file a
> sé, `restoreBackupRollback.js` estratto dal reducer per la stessa ragione
> di `activityLog.js`, sono servite a restare sotto soglia). Il dettaglio per
> rilievo è nella sezione 3, nel blocco `> **✔ CHIUSO…**` sotto ciascun
> titolo.

Verifiche eseguite al momento dell'analisi: `npm ci && npx vitest run` (**1234
passati**, 7 skip, 104
file + 1 file skip — la suite RLS di integrazione, che senza credenziali di
staging non tocca la rete), lettura integrale del data layer
(`lib/api.js`), del registry di persistenza e del suo orchestratore, dei due
sottosistemi fuori dal reducer (chat e Liste viaggio), delle cinque Edge
Function e dei loro helper condivisi, di CSP/header in `vercel.json`, del
service worker, e interrogazione **diretta del database di produzione**
`vmxvnxsqfisucugcpqlc` per le sole letture di consistenza (conteggi di riga e
distribuzione dei ruoli) usate per pesare i rilievi.

> **Nota di metodo.** I due rilievi più gravi non sono stati trovati leggendo
> il codice che sbaglia, ma confrontando **due contratti che nessuno aveva mai
> messo uno accanto all'altro**: quello che il data layer promette a
> `useSyncedDispatch` («ti dico se è andata male mettendo qualcosa in
> `error`») e quello che PostgreSQL applica davvero su una riga negata dalla
> RLS («la riga semplicemente non esiste per te — nessun errore»). Sono
> entrambi corretti presi da soli. È la loro composizione a produrre una
> scrittura rifiutata che l'app festeggia con un toast verde.

---

## 1. Executive Summary

**Il progetto è, e resta, in ottima salute architetturale.** I confini fra i
livelli non sono dichiarati: sono applicati. `lib/api.js` è l'unico punto che
parla con Supabase per il core, e le due sole eccezioni (`auth/AuthContext.jsx`
e `liste/listeApi.js`) sono deliberate e protette da regole di lint.
`state/persistence.js` dichiara le scritture invece di spargerle nei
componenti, e `state/reducer.js` e le sue `guard` chiamano *le stesse funzioni
pure* di `lib/permissions.js` sullo stesso `state.team`, con un test
(`persistenceGuards.test.js`) che verifica azione per azione che i due verdetti
coincidano. La chat e il modulo Liste, i due sottosistemi che non passano dal
reducer, hanno ciascuno il proprio registry esplicito (`chatCommands.js`,
`listePersistence.js`) invece di scritture sparse. Nessun
`dangerouslySetInnerHTML`, nessun `eval`, nessuna dipendenza CSS, CSP senza una
sola direttiva permissiva, tre bucket privati con MIME allowlist, e 1234 test
verdi. Il file più lungo dell'intero `src/` è il data layer (880 righe) e il
componente più lungo è a 578: non esiste un monolite.

**Il difetto più grave di questo passaggio non è in nessuno di quei livelli: è
nella giuntura fra due di essi.** `useSyncedDispatch` decide se una scrittura è
riuscita guardando `res.error`. Ma una `UPDATE`/`DELETE` che la RLS rifiuta
**non produce alcun errore**: la policy filtra le righe, la scrittura tocca
zero righe e PostgREST risponde con successo. Il registry se ne accorge oggi
per pura conseguenza di un dettaglio non correlato — le sole entry i cui metodi
API terminano con `.select().single()` (che su zero righe fallisce con
`PGRST116`) — e non se ne accorge affatto per tutte le altre. Il caso vivo in
produzione: i **3 utenti `agent`** (su 7 totali) vedono il pulsante «Rimuovi»
in anagrafica, la policy `clients_delete` è riservata ad admin e manager, e il
risultato è che l'app mostra «Cliente rimosso», toglie la scheda dallo schermo,
non fa nessun rollback e **lascia la riga nel database**. Nessun errore, nessun
toast rosso, nessun evento realtime che rimetta le cose a posto: la divergenza
dura fino al reload successivo. Su un'operazione che in anagrafica significa
«cancella i dati personali di questa persona», l'app afferma di aver fatto una
cosa che non ha fatto.

**Il secondo tema è la chat, l'unico sottosistema privo della protezione delle
scritture in volo.** Il core ha `entityId` + `MARK_PENDING_WRITE` proprio
perché un refetch concorrente non riporti a schermo il valore pre-scrittura; la
chat — che è il sottosistema con la frequenza di scrittura più alta per
disegno — sostituisce l'**intera mappa dei messaggi** a ogni evento realtime,
senza alcuna nozione di «questo messaggio l'ho appena inviato e non è ancora
committato». Il messaggio appena scritto sparisce dallo schermo e ricompare
quando scrive qualcun altro. Nessun comando della chat, tranne uno, ha un
rollback — e quell'uno lo fa ripristinando uno snapshot dell'intera mappa,
cioè scartando i messaggi arrivati nel frattempo.

**Il resto sono rilievi di manutenibilità:** due fan-out `Promise.all` non
compensati (ripristino backup e rinomina cliente), tre copie della stessa
funzione «scarica un Blob» già **divergenti** fra loro, un escape ICS
incompleto e quattro metodi del data layer senza più chiamanti (un quinto,
inizialmente incluso qui, si è rivelato preparazione dichiarata per un rilievo
precedente — vedi la correzione in B-2).

**Nessun rilievo di questo audit è sfruttabile da un utente non autenticato, e
nessuno permette a un utente di ottenere privilegi che non ha.** Il database
rifiuta correttamente tutto ciò che deve rifiutare — è l'applicazione che, in
alcuni percorsi, non si accorge di essere stata rifiutata.

---

## 2. Tabella delle priorità

| # | Priorità | Rilievo | File | Impatto |
|---|---|---|---|---|
| **C-1** | 🔴 **Critico** — ✔ chiuso 14/8 | Una scrittura **rifiutata dalla RLS è indistinguibile da una riuscita** per ogni metodo del data layer che non richiede indietro la riga scritta. Caso vivo: i 3 `agent` in produzione «eliminano» un cliente che resta nel database | `lib/api.js:749`, `state/persistence.js:384`, `hooks/useSyncedDispatch.js:121-125` | Successo dichiarato su una scrittura mai avvenuta, senza errore né rollback né correzione da realtime — su cancellazione di PII |
| **A-1** | 🟠 **Alta** — ✔ chiuso 14/8 | Anagrafica clienti: le tre mutazioni sono le uniche del registry senza `guard`, e `ADD`/`UPDATE_CLIENT` anche senza `rollback`. Manca del tutto un `canEditClient` in `permissions.js`, e la UI mostra i pulsanti a ogni ruolo | `state/persistence.js:323,366,384`, `lib/permissions.js`, `components/clients/ClientiView.jsx:153-175,379` | La stessa lacuna chiusa il 14/8 sugli avvisi, rimasta aperta sull'entità più grande (835 righe) e con PII |
| **A-2** | 🟠 **Alta** — ✔ chiuso 14/8 | Chat senza protezione delle scritture in volo: l'idratazione sostituisce l'intera mappa messaggi; `sendMessage` non ha compensazione; il rollback di `toggleReaction` ripristina uno snapshot **totale** | `hooks/useChatData.js:71-99`, `components/chat/chatCommands.js:133-149,233` | Messaggio inviato che sparisce e riappare (e che l'utente rimanda → doppione); reazione annullata che porta via i messaggi arrivati nel frattempo |
| **M-1** | 🟡 Media — ✔ chiuso 14/8 | `RESTORE_BACKUP`: `Promise.all` con **una richiesta per riga** del file di backup, senza blocchi e senza rollback | `state/persistence.js:551-571` | Su un backup da centinaia di task: centinaia di richieste concorrenti, fallimento parziale non compensato, UI che mostra tutto ripristinato |
| **M-2** | 🟡 Media — ✔ chiuso 14/8 | `RENAME_CLIENT_IN_TASKS`: `Promise.all` di N update senza rollback, mentre il reducer ha già rinominato tutto | `state/persistence.js:372-382` | Rinomina applicata a schermo su task che sul server hanno ancora il nome vecchio |
| **M-3** | 🟡 Media — ✔ chiuso 14/8 | Tre copie di «scarica un Blob», **già divergenti**: la terza revoca l'object URL a `0 ms` invece di `500 ms` | `admin/adminExport.js:4`, `liste/listeApi.js:505`, `calendar/calendarIcs.js:92-101` | Stessa classe di M-3 del primo passaggio (signed URL): qui la divergenza non è ipotetica, è già nel codice |
| **B-1** | 🟢 Bassa — ✔ chiuso 14/8 | `icsEscape` neutralizza `\n` ma **non `\r`**: un titolo con CR produce una content line non conforme a RFC 5545 | `calendar/calendarIcs.js:16-22` | File `.ics` che un parser leniente spezza in righe extra; il contenuto arriva da testo scritto dagli utenti |
| **B-2** | 🟢 Bassa — ✔ chiuso 14/8 | Quattro metodi del data layer senza più alcun chiamante (un quinto era preparazione dichiarata, non rimosso — vedi correzione) | `lib/api.js` | Superficie morta che descrive letture che l'app non fa più |

**Accettati, non rilievi** (riverificati oggi): `auth_leaked_password_protection`
(richiede il piano Pro), le sette RPC `SECURITY DEFINER` eseguibili da
`authenticated` (hanno tutte il controllo di ruolo nel corpo), `xlsx@0.18.5`
(CDN SheetJS irraggiungibile dalla egress policy; la mitigazione applicativa in
`lib/xlsx.js` è il fix effettivo). **Non è un rilievo** neppure il costo di
`Messages.listAll()` a ogni evento: il pattern è O(tutti i messaggi) per evento,
ma la produzione è a **13 messaggi** — la soglia dichiarata in ST-4 (`> ~1500`)
è lontanissima, e anticipare la partizione per conversazione oggi sarebbe
complessità comprata senza motivo. La correttezza di A-2, invece, non dipende
dal volume: dipende dai tempi, ed è vera anche a 13 messaggi.

---

## 3. Action plan dettagliato

### 🔴 C-1 — Una scrittura rifiutata dalla RLS non è distinguibile da una riuscita

> **✔ CHIUSO il 14 agosto, stesso giorno.** `CONTA_RIGHE` (`{ count: 'exact' }`)
> aggiunto agli otto metodi del data layer che mirano a una riga per chiave
> primaria (`Clients.update/remove`, `Tasks.softDelete/restore`,
> `Notices.togglePin/remove`, `Users.approve`, `Messages.setPinned`);
> `useSyncedDispatch` tratta `count === 0` come `RIFIUTO_RLS` con lo stesso
> percorso di un `error` esplicito — rollback e toast compresi. Guardia:
> `src/test/rifiutoSilenzioso.test.jsx`, che riproduce il caso vivo
> (`DELETE_CLIENT` con `count: 0`) e verifica che `count: 1` resti un
> successo e che l'assenza di `count` (metodo non migrato) non cambi
> comportamento.

**File:** `src/lib/api.js:749-750` (il metodo), `src/state/persistence.js:384-396`
(l'entry), `src/hooks/useSyncedDispatch.js:121-125` (il punto che decide).

#### Cosa succede

`useSyncedDispatch` è l'unico luogo in cui si decide se una scrittura è andata
male:

```js
// hooks/useSyncedDispatch.js:121-125 — stato attuale
.then((res) => {
  const err = Array.isArray(res) ? res.find(r => r?.error)?.error : res?.error;
  return err ? fail(err, "errore sconosciuto", res) : { error: null };
})
```

La premessa è che una scrittura respinta metta qualcosa in `error`. Per un
`INSERT` è vero: una `WITH CHECK` violata solleva `42501`. Per **`UPDATE` e
`DELETE` non lo è**: la clausola `USING` di una policy non *rifiuta* le righe,
le rende **invisibili**. La scrittura viene eseguita su zero righe, che è
esattamente ciò che accade cancellando un id inesistente, e PostgREST risponde
`204 No Content` senza errore. `res.error` è `null`. Il registry conclude
«riuscita».

Oggi questa lacuna è coperta **per coincidenza** dai soli metodi che terminano
con `.select().single()` — su zero righe `single()` fallisce con `PGRST116` — e
la coincidenza è visibile nel codice: `Clients.update` (`api.js:738`) ce l'ha,
`Clients.remove` (`api.js:749`) no, e la differenza fra i due non è stata presa
per questa ragione, ma perché a un `update` serve la riga aggiornata e a un
`delete` no.

Che questo sia il problema di fondo e non un dettaglio lo dimostra il fatto che
il codice **lo ha già incontrato una volta e lo ha risolto in un punto solo**:

> `rispecchiaRuoloScritto` (`persistence.js:108-114`) esiste perché il trigger
> `fix_users_privilege_escalation` «ripristina in silenzio role/active/…
> — nessun errore, la UPDATE "riesce" e basta». La soluzione adottata lì è
> chiedere al database *cosa ha davvero scritto* e confrontarlo con ciò che si
> voleva scrivere.

C-1 è la stessa domanda applicata a tutte le altre entry: **quante righe hai
davvero toccato?**

#### Il percorso vivo in produzione

Verificato oggi sul database: 7 utenti, di cui **3 `agent`**, 2 `driver`, 1
manager, 1 admin. La policy che governa la cancellazione di un cliente è:

```sql
-- migrations/20260622213133_perf_rls_initplan_dedup.sql:36-43
create policy clients_delete on public.clients
for delete to authenticated
using (exists (select 1 from public.users
  where users.id = (select auth.uid())
    and users.role = any(array['admin','manager'])));
```

`agent` non c'è. La voce di menu «Clienti» è invece visibile agli agent
(`shell/navHelpers.js:9`), e la scheda cliente mostra il pulsante «Rimuovi» a
chiunque (`ClientiView.jsx:379`): non esiste alcun gating di ruolo in tutta la
cartella `components/clients/`. La sequenza completa, per uno dei tre agent:

1. click su «Rimuovi» → `handleDelete` → `dispatch({ type: "DELETE_CLIENT" })`;
2. `useSyncedDispatch`: `DELETE_CLIENT` non è in `ADMIN_ONLY_ACTIONS` e la sua
   entry non ha `guard` → nessun pre-check, si procede;
3. il reducer toglie il cliente dalla lista e accoda **«Cliente rimosso»**
   (`reducer.js:589-592`);
4. `ClientsAPI.remove(id)` → la RLS non vede alcuna riga → `0 righe`,
   `error: null`;
5. `useSyncedDispatch` conclude successo: **nessun rollback** (che pure
   esisterebbe, `persistence.js:386-389`), nessun toast d'errore;
6. nessun evento realtime viene generato da una DELETE che non ha cancellato
   niente → nessun refetch → `SET_CLIENTS` non arriva mai a rimettere la riga.

Risultato: la scheda resta sparita dallo schermo dell'agent fino al reload,
mentre nel database c'è ancora. L'operatore che stava dando seguito a una
richiesta di cancellazione dati ha ricevuto una conferma per un'operazione mai
avvenuta.

> **Perché non è A-1 ma un rilievo a sé.** Aggiungere il `guard` mancante
> (A-1) chiude *questo* percorso, ma non la classe: resta aperta ogni volta
> che il verdetto del client e quello del database divergono — l'utente
> disattivato da un altro admin mentre sta lavorando (la policy restrittiva
> `rls_active_only` lo blocca su **tutto**, e il `team` in `state` non lo sa
> ancora), il ruolo cambiato in un'altra sessione, o semplicemente una policy
> modificata sul database senza toccare `permissions.js`. Il guard è la difesa
> in profondità; questo è il rilevamento.

#### Soluzione

Due pezzi indipendenti, il secondo utile anche da solo.

**(a) I metodi che scrivono UNA riga già esistente chiedono il conteggio.**

```js
// src/lib/api.js — nuova costante accanto a WITH_COUNT (già importata da pagination.js)
// Chiede a PostgREST quante righe la scrittura ha DAVVERO toccato.
//
// Serve a distinguere "riuscita" da "rifiutata dalla RLS", che senza questo
// sono la stessa risposta: la clausola USING di una policy non solleva un
// errore, rende le righe invisibili — e una UPDATE/DELETE su zero righe è
// indistinguibile da una su un id inesistente. Vale SOLO per i metodi che
// mirano a UNA riga già esistente per chiave primaria: lì `count === 0`
// significa "non me l'ha lasciata toccare". Non va aggiunta alle scritture
// che possono legittimamente non toccare nulla (markAllRead, hardDeleteMany
// su un cestino vuoto): là zero è un esito normale, non un rifiuto.
const CONTA_RIGHE = { count: 'exact' };

export const Clients = {
  // …
  update: (id, patch) =>
    supabase.from('clients').update(withOrigin(patch), CONTA_RIGHE)
      .eq('id', id).select().single(),
  remove: (id) =>
    supabase.from('clients').delete(CONTA_RIGHE).eq('id', id),
};
```

Da trattare allo stesso modo (tutte mirano a una riga per PK e nessuna
richiede indietro la riga): `Tasks.softDelete` / `Tasks.restore`
(`api.js:316-319`), `Notices.remove` / `Notices.togglePin` (`api.js:409-412`),
`Users.approve` (`api.js:180`), `Messages.setPinned` (`api.js:504`).

**(b) L'orchestratore legge il conteggio, quando c'è.**

```js
// src/hooks/useSyncedDispatch.js — sostituisce il .then(res) attuale
// Una scrittura respinta dalla RLS NON mette nulla in `error`: la policy filtra
// le righe, la UPDATE/DELETE ne tocca zero e PostgREST risponde 204. Se il
// metodo del data layer ha chiesto il conteggio (CONTA_RIGHE), zero righe su
// un'operazione che ne mirava una è un RIFIUTO, e va trattato come tale:
// rollback + toast, non "salvato". Dove `count` non c'è (undefined) il
// comportamento resta quello di prima, quindi l'adozione è per-metodo e non
// richiede di toccare tutte le entry insieme.
const RIFIUTO_RLS = {
  message: "operazione non consentita dal database (permessi insufficienti)",
};
const esito = (r) => {
  if (r?.error) return r.error;
  if (typeof r?.count === 'number' && r.count === 0) return RIFIUTO_RLS;
  return null;
};

.then((res) => {
  const err = Array.isArray(res) ? res.map(esito).find(Boolean) : esito(res);
  return err ? fail(err, "errore sconosciuto", res) : { error: null };
})
```

**Guardia di regressione** (`src/test/pendingWrites.test.js` o un file nuovo
`rifiutoSilenzioso.test.js`): una `persist` che risolve
`{ data: null, error: null, count: 0 }` deve produrre **il rollback e il toast
d'errore**, non `{ error: null }`; e la stessa che risolve `count: 1` deve
restare un successo. È il test che oggi non esiste per nessuna entry, perché
nessuna entry sapeva di poter ricevere quella risposta.

**Fuori dal repository, per completezza:** la suite
`src/test/integration/rls.test.js` esiste già e attraversa il confine di rete
con utenti veri di staging. Il caso «agent che cancella un cliente» è
esattamente ciò che sa verificare — vale la pena aggiungerlo lì quando le
credenziali di staging sono a disposizione, perché è l'unico livello che prova
il comportamento *del database* invece di quello del mock.

---

### 🟠 A-1 — L'anagrafica clienti è l'ultima entità del registry senza `guard`

> **✔ CHIUSO il 14 agosto, stesso giorno.** `canEditClient`/`canDeleteClient`
> in `lib/permissions.js` (verificate contro le policy RLS lette **dal
> database di produzione**, non dedotte dal solo repository — vedi la
> correzione sull'insert più sotto); `guard`+`rollback` sulle tre entry;
> `baseReducer` nega per davvero sui tre case (stessa lezione del primo
> passaggio: senza, un guard negato dall'orchestratore non impedisce
> l'applicazione locale); i pulsanti «Modifica»/«Rimuovi»/«Nuovo
> cliente»/«Importa» in `ClientiView.jsx` e `ClienteCard.jsx` compaiono solo
> per chi la RLS lascerebbe agire. **Un dettaglio emerso implementando la
> correzione**: la stesura originale di questo rilievo leggeva l'insert come
> aperto a «qualunque utente attivo» — sbagliato, verificato dopo con
> `pg_policies` in produzione: `20260622213034` **stringe** un `with check
> (true)` introdotto dalla migrazione precedente, non lo allenta. Insert,
> select e update condividono lo stesso elenco di ruoli, ed è per questo che
> `canEditClient` li copre entrambi con un'unica lista. Guardie:
> `src/test/clientGuardsPersistence.test.jsx` (guard/rollback/UI, stesso
> schema di `noticeGuardsPersistence.test.js`), estensione di
> `persistenceGuards.test.js`. Test: **1256 verdi** (era 1234).

**File:** `src/state/persistence.js:323-329` (ADD), `:366` (UPDATE), `:384-396`
(DELETE); `src/lib/permissions.js` (la funzione che manca);
`src/components/clients/ClientiView.jsx:153-175` e `:379` (la UI).

#### Cosa succede

Dopo la chiusura di A-1 del primo passaggio, gli avvisi hanno `guard` e
`rollback` su tutte e tre le mutazioni. I clienti no:

```js
// state/persistence.js:323-329, 366, 384-396 — stato attuale, ridotto
ADD_CLIENT:    { normalize: …, persist: (s, a) => ClientsAPI.create(toDbClient(a.payload)) },
UPDATE_CLIENT: { persist: (s, a) => ClientsAPI.update(a.payload.id, toDbClientPatch(a.payload)) },
DELETE_CLIENT: { persist: …, rollback: …, mapError: … },   // rollback sì, guard no
```

Nessuna delle tre ha un `guard`; `ADD_CLIENT` e `UPDATE_CLIENT` non hanno
nemmeno un `rollback`. Il database, invece, discrimina eccome — verificato
leggendo le policy **direttamente dal database di produzione** (non dedotto
dal solo repository, dove `20260622213034` sembra a prima vista aprire
l'insert a «qualunque utente attivo»: in realtà quella migrazione **stringe**
un `with check (true)` introdotto dalla precedente, non lo allenta):

| operazione | ruoli ammessi | fonte |
|---|---|---|
| `select` | admin, manager, agent | `20260613092440_restrict_pii_select.sql:5` |
| `insert` | admin, manager, agent | `20260622213034_fix_clients_insert_rls.sql:5` |
| `update` | admin, manager, agent | `20260622213133:27` |
| `delete` | admin, manager | `20260622213133:36` |

più la policy **restrittiva** `rls_active_only`
(`20260621153006_rls_hardening_active_users.sql:54`) che, in `AND` con tutte,
blocca qualunque utente disattivato. Insert, select e update condividono oggi
lo stesso elenco di ruoli — è per questo che `canEditClient` qui sotto copre
entrambe le scritture con un'unica lista.

E in `lib/permissions.js` — il file che esiste proprio perché «la stessa
domanda non abbia due risposte diverse fra UI e database» — **non esiste alcuna
funzione sui clienti**: né `canEditClient`, né `canDeleteClient`. È l'unica
entità di dominio senza. Di conseguenza `components/clients/` non ha un solo
controllo di ruolo: i pulsanti «Modifica» e «Rimuovi» sono mostrati a tutti.

Senza `rollback` su `UPDATE_CLIENT`, il caso più comune di tutti — non un
permesso, la **rete che cade su mobile**, che è la ragione per cui esiste
`OfflineBanner` — lascia a schermo la scheda modificata mentre il server ha
ancora quella di prima. E poiché una scrittura fallita non genera eventi
realtime, nessun refetch viene a correggere: la divergenza dura fino al reload.
Su `ADD_CLIENT` la conseguenza si propaga: il cliente resta in lista, l'utente
gli crea sopra una lista viaggio, e la RPC fallisce per violazione di foreign
key su un cliente che sul server non è mai esistito.

#### Soluzione

**(1) La regola, una volta sola**, accanto a `canEditNotice` che ha già la
stessa forma:

```js
// src/lib/permissions.js — in fondo, dopo canEditNotice
// ─── CRM: ANAGRAFICA CLIENTI ─────────────────────────────────────────────────
// Rispecchia le policy RLS su public.clients — verificate lette dal database:
//   select/insert/update → admin, manager, agent (20260613092440, 20260622213034, 20260622213133)
//   delete                → admin, manager        (20260622213133)
// più la policy restrittiva rls_active_only, che le AND-a tutte con "utente
// attivo". Il driver è fuori da tutte e quattro per disegno: non ha accesso ai
// dati commerciali.
//
// Sono due funzioni e non una perché il database ne ha due: unificarle
// significherebbe scegliere quale delle due policy tradire.
const RUOLI_CLIENTI_SCRITTURA = ['admin', 'manager', 'agent'];
const RUOLI_CLIENTI_ELIMINAZIONE = ['admin', 'manager'];

const clienteConsentito = (team, userId, ruoli) => {
  const m = getMember(team, userId);
  if (!m || m.active === false || m.pending) return false;
  return ruoli.includes(toDbRole(m.role));
};

export const canEditClient = (team, userId) =>
  clienteConsentito(team, userId, RUOLI_CLIENTI_SCRITTURA);
export const canDeleteClient = (team, userId) =>
  clienteConsentito(team, userId, RUOLI_CLIENTI_ELIMINAZIONE);
```

**(2) Le tre entry del registry**, con lo stesso trattamento degli avvisi:

```js
// src/state/persistence.js
ADD_CLIENT: {
  guard: (s, a, uid) => canEditClient(s.team, uid),
  normalize: (a) => ({ ...a, payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() } }),
  persist: (s, a) => ClientsAPI.create(toDbClient(a.payload)),
  // La riga inserita in ottimistico non esiste sul server: se l'INSERT non
  // arriva va tolta, altrimenti l'utente ci lavora sopra (una lista viaggio,
  // un task) e la scrittura successiva fallisce per foreign key su un cliente
  // che non è mai esistito.
  rollback: (s, a) => ({ type: "ROLLBACK_CLIENTS_BULK", payload: [a.payload.id] }),
  mapError: (err) => err?.message || "cliente non salvato",
},

UPDATE_CLIENT: {
  guard: (s, a, uid) => canEditClient(s.team, uid),
  persist: (s, a) => ClientsAPI.update(a.payload.id, toDbClientPatch(a.payload)),
  // Si rimanda la scheda INTERA pre-dispatch, non un patch: il case del
  // reducer fa merge di `...action.payload` sulla riga esistente, quindi un
  // sottoinsieme lascerebbe a video i campi che il patch aveva cambiato — un
  // rollback parziale, che sembra riuscito ed è peggio di nessuno. Stessa
  // ragione di UPDATE_NOTICE e UPDATE_TEAM_MEMBER.
  rollback: (s, a) => {
    const prev = (s.clients || []).find(c => c.id === a.payload?.id);
    return prev ? { type: "UPDATE_CLIENT", payload: prev } : null;
  },
  mapError: (err) => err?.message || "cliente non aggiornato",
},

DELETE_CLIENT: {
  guard: (s, a, uid) => canDeleteClient(s.team, uid),
  persist: (s, a) => ClientsAPI.remove(a.payload),
  rollback: …,   // invariato
  mapError: …,   // invariato
},
```

`ROLLBACK_CLIENTS_BULK` esiste già (`reducer.js:632`) e accetta un array di id:
riusarlo per il singolo evita un case nuovo che farebbe la stessa cosa.

**(3) Il reducer deve rifiutare davvero.** È la lezione emersa chiudendo A-1
sugli avvisi e va applicata qui *nello stesso momento*: quando un `guard` nega,
`useSyncedDispatch` dispatcha comunque l'azione originale contando sul reducer
per il toast di rifiuto (`useSyncedDispatch.js:65-68`). Ma `baseReducer` non
controlla alcun permesso sui tre case dei clienti — quindi senza questo pezzo
l'azione verrebbe applicata in locale lo stesso, e il `guard` avrebbe solo
impedito la richiesta di rete:

```js
// src/state/reducer.js — nei tre case CRM
case "UPDATE_CLIENT": {
  if (!canEditClient(state.team, uid)) return _denied("Non hai i permessi per modificare l'anagrafica");
  // …invariato
}
case "DELETE_CLIENT": {
  if (!canDeleteClient(state.team, uid)) return _denied("Solo Admin e Manager possono rimuovere un cliente");
  // …invariato
}
```

**(4) La UI smette di offrire ciò che il database nega**, come già fa
`NoticeBoard`:

```jsx
// src/components/clients/ClientiView.jsx
const { currentUserId, canAccessListe, canEditClient, canDeleteClient } = useAppData();
const puoModificare = canEditClient(currentUserId);
const puoEliminare  = canDeleteClient(currentUserId);
// …
<ClienteCard … onDelete={puoEliminare ? (c => setConfirmDelete(c)) : null} onEdit={puoModificare ? … : null} />
```

(le due funzioni vanno esposte da `state/AppDataContext.jsx` accanto alle altre,
già legate al `team` del provider).

**Guardie:** estendere `src/test/persistenceGuards.test.js` — che già verifica
per ogni action che il verdetto del `guard` coincida con quello del reducer —
ai tre case dei clienti, e un test di UI sul modello di
`noticeBoardPermessi.test.jsx` che monti la vista come `agent` e asserisca
l'assenza del pulsante «Rimuovi».

---

### 🟠 A-2 — La chat è l'unico sottosistema senza protezione delle scritture in volo

> **✔ CHIUSO il 14 agosto, stesso giorno.** Registro delle scritture in volo
> in `useChatData.js` (`inVoloRef` + `messaggiInVolo`, l'equivalente di
> `pendingWrites` per la chat), `marcaInVolo`/`smarcaInVolo` iniettati in
> `makeChatCommands`; `sendMessage` compensa togliendo il messaggio
> ottimistico se l'INSERT fallisce (o se la conversazione a cui appartiene
> non è mai stata creata); il rollback di `toggleReaction` ripristina le sole
> `reactions` del messaggio toccato, non più uno snapshot totale. Guardie:
> `src/test/useChatData.test.jsx` (riproduce la sequenza — un evento realtime
> altrui fa ripartire `listAll()` prima del commit, il messaggio resta a
> schermo), estensione di `src/test/chatCommands.test.js` (compensazione
> dell'invio, e il caso che il vecchio snapshot totale non copriva: un
> messaggio arrivato DURANTE il round-trip del toggle non sparisce se la RPC
> fallisce).

**File:** `src/hooks/useChatData.js:71-99` (l'idratazione),
`src/components/chat/chatCommands.js:133-149` (`sendMessage`), `:207-237`
(`toggleReaction`, in particolare la riga **233**).

#### (a) Il messaggio appena inviato può sparire dallo schermo

`state/persistence.js` dedica un blocco di commento di dieci righe a spiegare
perché esistono `entityId` e `MARK_PENDING_WRITE`:

> «Fra il dispatch ottimistico e il commit della scrittura passano centinaia di
> ms, e in quella finestra un evento realtime causato da un ALTRO utente fa
> ri-scaricare la lista intera. Se la SELECT del refetch arriva al server prima
> che la nostra UPDATE abbia fatto commit, la risposta è più recente per tutte
> le altre righe e più VECCHIA per la nostra […] Quando poi la UPDATE committa,
> la sua eco realtime porta il nostro `origin_client` e viene scartata — quindi
> nessun secondo refetch viene a correggere la UI.»

Questo ragionamento vale **parola per parola** per la chat, che è il
sottosistema con la frequenza di scrittura più alta dell'app, e la chat non ha
nulla di equivalente:

```js
// hooks/useChatData.js:86-97 — stato attuale
const msgsByConv = {};
for (const r of msgsRes.data || []) { … }
setMessagesRaw(msgsByConv);   // ← sostituzione INTEGRALE, senza eccezioni
```

La sequenza: A invia un messaggio (locale ottimistico + INSERT in volo) → B
invia il suo → l'evento su `messages` sveglia il debounce da 200 ms → `listAll()`
parte e il server non ha ancora committato l'INSERT di A → la risposta non
contiene il messaggio di A → `setMessagesRaw` sostituisce l'intera mappa e il
messaggio di A **sparisce dalla sua schermata**. Quando l'INSERT di A committa,
la sua eco realtime porta `origin_client` di A e `subscribeToTable`
(`api.js:854-857`) la scarta: nessun refetch viene a correggere. Il messaggio
riappare solo quando scrive qualcun altro, o al reload.

L'utente che vede sparire ciò che ha appena scritto lo riscrive. Il messaggio
era già nel database: il risultato osservabile è il **doppione in chat**, con lo
stesso testo e due timestamp diversi.

#### (b) Nessun comando della chat ha una compensazione

`sendMessage` (`:133-149`) aggiunge il messaggio in locale e, se l'INSERT
fallisce, si limita a un toast:

```js
const invia = () => MessagesAPI.send(toDbMessage(normalized, convId)).then(r => {
  if (r?.error) fallito("msg.send", r.error, `Chat: invio messaggio fallito: …`);
});
```

Il messaggio resta a schermo, indistinguibile da uno consegnato, e sparisce al
reload successivo. Lo stesso vale per `updateConversation` (`:87`),
`removeConversation` (`:107`) e `setMessagePinned` (`:155`).

#### (c) L'unico rollback esistente ripristina troppo

```js
// chatCommands.js:210-233 — stato attuale, ridotto
let snapshot = null;
setMessages(prev => { …; snapshot = prev; … });        // l'INTERA mappa
MessagesAPI.toggleReaction(msgId, emoji).then(r => {
  if (r?.error) { if (snapshot) setMessages(snapshot); … }   // :233
});
```

`snapshot` è la mappa `{ [convId]: Message[] }` **completa** al momento del
toggle. Fra il toggle e la risposta della RPC passa un round-trip, e in quella
finestra possono essere arrivati messaggi nuovi da realtime: ripristinare lo
snapshot li **cancella dallo stato**, in tutte le conversazioni, non solo in
quella toccata. È un rollback che per annullare una emoji porta via dei
messaggi — e a differenza del messaggio di (a), questi non hanno un evento che
li rimetta.

#### Soluzione

**(a+b) Una nozione di «messaggio in volo», al livello che possiede lo stato.**
La chiave è che `sendMessage` normalizza l'id a un uuid *prima* dell'INSERT
(`:134`), quindi l'id locale e quello sul database **coincidono**: la fusione è
possibile per id, senza euristiche.

```js
// src/hooks/useChatData.js
// Messaggi la cui INSERT è ancora in volo. È l'equivalente di `pendingWrites`
// nel reducer del core, per la stessa ragione: fra il dispatch ottimistico e
// il commit passano centinaia di ms, e in quella finestra un evento realtime
// altrui fa ripartire listAll(). La risposta è più recente per tutti i
// messaggi tranne il nostro, che non c'è ancora — e sostituire la mappa intera
// lo farebbe sparire, senza che nulla venga poi a rimetterlo (l'eco della
// nostra INSERT porta il nostro origin_client e viene scartata).
const inVoloRef = useRef(new Map());   // id → messaggio ottimistico

const messaggiInVolo = useCallback((mappaDalServer) => {
  if (!inVoloRef.current.size) return mappaDalServer;
  const out = { ...mappaDalServer };
  for (const [convId, msg] of raggruppaPerConv(inVoloRef.current)) {
    const presenti = new Set((out[convId] || []).map(m => m.id));
    const mancanti = msg.filter(m => !presenti.has(m.id));
    if (mancanti.length) out[convId] = [...(out[convId] || []), ...mancanti];
  }
  return out;
}, []);

// …nel reload:
setMessagesRaw(messaggiInVolo(msgsByConv));
```

`chatCommands` riceve i due segnali (`marca`/`smarca`) come già riceve i setter,
e li usa in `sendMessage` **con lo stesso `finally` di `useSyncedDispatch`** —
un id che restasse marcato per sempre sarebbe un difetto peggiore di quello che
si sta chiudendo:

```js
// src/components/chat/chatCommands.js — sendMessage
const sendMessage = (convId, msg) => {
  const normalized = !enabled || isUuid(msg.id) ? msg : { ...msg, id: newId() };
  setMessages(prev => ({ ...prev, [convId]: [...(prev[convId] || []), normalized] }));
  if (!enabled) return normalized;
  marcaInVolo(convId, normalized);
  const invia = () => MessagesAPI.send(toDbMessage(normalized, convId))
    .then(r => {
      if (r?.error) {
        // Compensazione: il messaggio non è mai arrivato sul server. Lasciarlo
        // a schermo lo rende indistinguibile da uno consegnato — e sparirà da
        // solo al reload, cioè nel momento in cui l'utente non lo sta più
        // guardando. Toglierlo qui, insieme al toast, è l'unica versione
        // onesta di "non è partito".
        setMessages(prev => ({
          ...prev,
          [convId]: (prev[convId] || []).filter(m => m.id !== normalized.id),
        }));
        fallito("msg.send", r.error, `Chat: invio messaggio fallito: ${r.error.message || ""}`);
      }
    })
    .finally(() => smarcaInVolo(normalized.id));
  // …invariato: attesa della creazione conversazione
};
```

**(c) Il rollback della reazione tocca solo il messaggio che ha toccato:**

```js
// src/components/chat/chatCommands.js — toggleReaction
// Si ricorda la sola mappa `reactions` del messaggio toccato, non l'intero
// stato: fra il toggle e la risposta della RPC possono essere arrivati
// messaggi nuovi da realtime, e ripristinare uno snapshot totale li
// cancellerebbe — un rollback che per annullare una emoji porta via dei
// messaggi, in tutte le conversazioni.
const reazioniPrima = null;   // catturata nell'updater, come oggi lo snapshot
// …
if (r?.error) {
  setMessages(prev => ({
    ...prev,
    [convId]: (prev[convId] || []).map(m =>
      m.id === msgId ? { ...m, reactions: reazioniPrima ?? {} } : m),
  }));
  fallito("toggleReaction", r.error, `Chat: reazione non salvata: …`);
}
```

**Guardie:** `src/test/chatPercorsoUnico.test.jsx` e `chatConvCreate.test.jsx`
sono già il posto giusto. Tre casi da aggiungere: (1) un reload che arriva
mentre l'INSERT è in volo non deve far sparire il messaggio; (2) un INSERT
fallito deve toglierlo *e* mostrare il toast; (3) un `toggleReaction` fallito
non deve perdere un messaggio arrivato nel frattempo.

---

### 🟡 M-1 — `RESTORE_BACKUP`: una richiesta per riga, senza blocchi né rollback

> **✔ CHIUSO il 14 agosto, stesso giorno.** `persist` costruisce un job per
> riga (tipo/chiave/se esisteva già) ed esegue a blocchi di 50 con
> `Promise.allSettled`, senza short-circuit: un job fallito non impedisce
> agli altri di procedere. `rollback` compensa in modo mirato — le righe
> ESISTENTI fallite tornano al valore pre-dispatch, quelle CREATE e mai
> arrivate sul server vengono tolte — via il nuovo case
> `ROLLBACK_RESTORE_BACKUP`, il cui calcolo è in `state/restoreBackupRollback.js`
> (estratto per non sforare il tetto di 550 righe effettive del reducer, la
> stessa ragione per cui esiste `activityLog.js`). Guardie:
> `src/test/restoreBackupChunking.test.js` (chunking, un fallimento non ferma
> gli altri, la forma di `res.falliti`), estensione di
> `src/test/reducer.test.js` per il nuovo case.

**File:** `src/state/persistence.js:551-571`.

```js
// stato attuale, ridotto
const ops = [
  ...payload.tasks.map(t => (taskIds.has(t.id) ? TasksAPI.update(…) : TasksAPI.create(…))),
  ...Object.entries(payload.categories).map(…),
  ...payload.notices.map(…),
];
return ops.length ? Promise.all(ops) : NOOP;
```

È la stessa forma che il progetto ha già corretto due volte — `EMPTY_TRASH`
(M-4 del 12 agosto, diventata una `delete … in (…)` atomica) e
`ADD_CLIENTS_BULK` (A-2 dell'11 agosto, diventata insert a blocchi con rollback
parziale) — rimasta sull'unica operazione il cui input **arriva da un file
scelto dall'utente**, quindi di dimensione non governata dal codice. Con i 289
task in produzione, un backup completo ripristinato su un'installazione vuota
sono ~289 richieste HTTP concorrenti; `Promise.all` le lancia tutte insieme.

Il fallimento è peggiore del numero: `useSyncedDispatch` prende **il primo**
errore dell'array (`:124`), mostra un toast, e non c'è alcun `rollback` — il
reducer ha però già fuso l'intero backup nello stato. Lo schermo mostra un
ripristino completo, il database ne ha una parte.

**Soluzione:** riusare il blocco già collaudato di `ClientsAPI.createMany`
(`api.js:759-768`) — sequenza di blocchi, `scritti` che dice al rollback dove
fermarsi — e dichiarare un `rollback` che rimetta lo stato **al pre-dispatch**
per le sole righe non arrivate. Le entità sono tre e disomogenee (task,
categorie, avvisi): la strada più corta è un `persist` che esegua le tre liste
**in sequenza, a blocchi di 50**, si fermi al primo errore e ritorni
`{ error, scritti: { tasks: n, categories: n, notices: n } }`, con il
`rollback` che ridispatcha `RESTORE_BACKUP` con lo **stato precedente** delle
sole righe oltre quel confine. Il costo è una entry più lunga; il beneficio è
che il ripristino da backup — l'operazione di disaster recovery del core, come
lo era quella del modulo Liste in C-1 del primo passaggio — smette di poter
mentire sul proprio esito.

---

### 🟡 M-2 — `RENAME_CLIENT_IN_TASKS`: N update senza compensazione

> **✔ CHIUSO il 14 agosto, stesso giorno.** `Promise.allSettled` invece di
> `Promise.all` (nessuno short-circuit: ogni update procede indipendentemente
> dagli altri); il toast conta quanti («N task su M non aggiornati») invece
> di riportare il testo grezzo di Postgrest; il nuovo case
> `ROLLBACK_RENAME_CLIENT_IN_TASKS` riporta al nome PRECEDENTE i soli task
> falliti. Guardie: estensione di `src/test/syncedDispatch.test.jsx` (un
> update fallito su N non ferma gli altri; il fallito torna al nome vecchio,
> il riuscito resta rinominato; nessun rollback se tutto riesce) e di
> `src/test/reducer.test.js` per il nuovo case.

**File:** `src/state/persistence.js:372-382`.

```js
return Promise.all(daAggiornare.map(t => TasksAPI.update(t.id, { client_id: to })));
```

Il reducer ha già rinominato il cliente in **tutti** i task che l'utente può
modificare. Se una delle N update fallisce (rete, o la RLS su un task che nel
frattempo è stato riassegnato), `useSyncedDispatch` mostra un toast e nient'altro:
a schermo tutti i task portano il nome nuovo, sul server una parte ha ancora il
vecchio — e siccome la scheda cliente trova i task *per nome*, quelli rimasti
indietro smettono di comparire nella scheda, che è precisamente il difetto che
la propagazione del rename esiste per evitare.

**Soluzione:** `Promise.allSettled` invece di `Promise.all`, e un rollback che
riporti indietro **i soli id falliti** (l'informazione c'è: l'indice del
risultato corrisponde all'indice di `daAggiornare`). Il toast dovrebbe dire
quanti — «rinominati N task su M» è actionable, «Salvataggio fallito» no:

```js
persist: async (s, a, uid) => {
  // …invariato fino a daAggiornare
  const esiti = await Promise.allSettled(
    daAggiornare.map(t => TasksAPI.update(t.id, { client_id: to })));
  const falliti = daAggiornare.filter((_, i) =>
    esiti[i].status === "rejected" || esiti[i].value?.error);
  return falliti.length
    ? { error: { message: `${falliti.length} task su ${daAggiornare.length} non aggiornati` }, falliti }
    : { error: null };
},
rollback: (s, a, res) => (res?.falliti?.length
  ? { type: "RENAME_CLIENT_IN_TASKS_PARZIALE", payload: { ids: res.falliti.map(t => t.id), to: a.payload.from } }
  : null),
```

---

### 🟡 M-3 — Tre copie di «scarica un Blob», già divergenti

> **✔ CHIUSO il 14 agosto, stesso giorno.** `scaricaBlob` in
> `lib/fileUtils.js` è l'unica implementazione, col margine di 500ms prima
> della revoca; `adminExport.downloadFile` e `listeApi.downloadBlob` restano
> come alias di una riga (`export { scaricaBlob as … }`) per non toccare i
> loro undici call site nello stesso commit; `calendarIcs.exportTasksToIcs`
> chiama direttamente `scaricaBlob`. Guardia:
> `src/test/fileUtils.test.js` blinda in particolare il dettaglio su cui la
> terza copia divergeva — nessuna revoca nello stesso tick, revoca dopo
> esattamente 500ms.

**File:** `src/components/admin/adminExport.js:4-11`,
`src/components/liste/listeApi.js:505-514`,
`src/components/calendar/calendarIcs.js:92-101`.

Le prime due sono identiche riga per riga, e la seconda lo dichiara nel proprio
commento («Stesso pattern di `downloadFile` in AdminView.jsx») — cioè la
duplicazione è nota e annotata invece che chiusa. La terza è inline dentro
`exportTasksToIcs` e **differisce**:

```js
setTimeout(() => URL.revokeObjectURL(url), 500);   // adminExport.js:9, listeApi.js:513
setTimeout(() => URL.revokeObjectURL(url), 0);     // calendarIcs.js:101
```

Non è una differenza estetica: revocare l'object URL nello stesso tick del
click è ciò che i 500 ms delle altre due esistono per evitare. Su Safari/iOS —
la piattaforma per cui questo progetto ha una PWA, una safe-area e un intero
handoff dedicato — la revoca immediata può far fallire il download. È la stessa
classe di M-3 del primo passaggio (tre copie della signed URL): là il rischio
era che un fix ne raggiungesse una sola, qui **la divergenza è già avvenuta**.

**Soluzione:** una sola funzione in `src/lib/fileUtils.js` (che già ospita gli
helper di file e non ha dipendenze di dominio), e i tre call site che la usano.

```js
// src/lib/fileUtils.js
// Innesca il download lato client di un Blob già pronto. Una sola
// implementazione per i tre percorsi che esportano (CSV/JSON dal pannello
// Admin, .doc e backup del modulo Liste, .ics dal calendario): erano tre
// copie, e avevano già smesso di coincidere — la terza revocava l'object URL
// nello stesso tick del click.
//
// Il RITARDO prima di revoke è l'invariante che questa funzione rende
// esplicita: il browser deve avere il tempo di iniziare il download prima che
// la URL diventi invalida. Su Safari/iOS revocare subito lo fa fallire in
// silenzio. Finché il numero era scritto a mano in tre punti, i 500 ms non
// erano una regola: erano una coincidenza fra due dei tre call site.
const RITARDO_REVOKE_MS = 500;

export const scaricaBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), RITARDO_REVOKE_MS);
};
```

`adminExport.downloadFile` e `listeApi.downloadBlob` restano come ri-export di
una riga (`export const downloadBlob = scaricaBlob;`) per non toccare i loro
undici call site nello stesso commit.

---

### 🟢 B-1 — `icsEscape` non neutralizza il ritorno a capo `\r`

> **✔ CHIUSO il 14 agosto, stesso giorno.** `\r\n|\r|\n` in un'unica
> sostituzione, prima delle altre. Guardia: tre casi nuovi in
> `src/test/calendarIcs.test.js` (CRLF, CR nudo, LF — stessa sequenza di
> escape per tutti e tre; il risultato non contiene mai un `\r`/`\n` grezzo).

**File:** `src/components/calendar/calendarIcs.js:16-22`.

```js
export function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")     // ← \r non compare da nessuna parte
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
```

RFC 5545 §3.1 separa le content line con `CRLF`. Il titolo e la descrizione di
un task sono testo scritto dagli utenti — e in questo progetto possono arrivare
da un **import CSV/Excel** (`ImportTab`, `ClientImportModal`), cioè da file che
usano `CRLF` come terminatore di riga: un valore multi-riga incollato in una
cella porta dentro `\r\n`. Dopo l'escape attuale la sequenza diventa `CR` +
`\n` letterale, cioè un `CR` **grezzo in mezzo a una content line**. I parser
stretti la trattano come non conforme, quelli lenienti spezzano la riga — che è
il presupposto per iniettare proprietà nel calendario di chi importa il file.

`foldIcsLine` non protegge: gira dopo, e conta ottetti.

**Soluzione** (una riga, e va prima delle altre sostituzioni di controllo):

```js
export function icsEscape(s) {
  return String(s ?? "")
    .replace(/\\/g, "\\\\")
    // CRLF, CR nudo e LF nudo diventano tutti la stessa sequenza di escape:
    // una content line non può contenere un ritorno a capo grezzo (RFC 5545
    // §3.1), e il CR da solo — che arriva dai file importati con terminatore
    // Windows — passava indenne perché l'unica regola qui guardava \n.
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
```

**Guardia:** `src/test/calendarIcs.test.js` ha già i casi di escape — basta
aggiungere un titolo con `\r\n` e asserire che l'output non contenga `\r` fuori
dai separatori di riga generati da `buildIcs`.

---

### 🟢 B-2 — Quattro metodi del data layer senza chiamanti

> **✔ CHIUSO il 14 agosto, stesso giorno.** `Users.get`, `Tasks.get`,
> `Comments.listForTask`, `Clients.get` rimossi da `lib/api.js`. Verificato
> zero chiamanti prima della rimozione (`grep` su tutto `src/`) e lint pulito
> dopo.

> **Correzione, in fase di applicazione.** La stesura originale di questo
> rilievo elencava CINQUE metodi, `Messages.listForConversation` compreso.
> È sbagliato: quel metodo è citato **per nome** in
> `docs/AUDIT_STRUTTURA_2026-08-10.md` (ST-4, parte 2) come preparazione
> DELIBERATA per la lettura per-conversazione da collegare quando `messages`
> supererà la soglia scritta lì (~1500, oggi 13) — «va scritto come rilievo
> Media […] non per mancanza di tempo». La ricerca che ha prodotto questo
> rilievo ha guardato solo gli USI nel repository, senza incrociare gli AUDIT
> precedenti che lo citano per nome: un errore di metodo, lo stesso genere di
> «due metà da verificare insieme» richiamato nell'audit del 14 agosto
> (mattina). `Messages.listForConversation` NON va rimossa. Restano quattro.

**File:** `src/lib/api.js` — `Users.get`, `Tasks.get`, `Comments.listForTask`,
`Clients.get`.

Nessuno dei quattro ha un chiamante in `src/` (né nei test), e nessuno dei
quattro è citato per nome in un audit precedente come preparazione
intenzionale — verificato con `grep` su `docs/*.md` prima di applicare la
correzione qui sopra, non solo dedotto. Non fanno danno, ma descrivono letture
che l'app non fa.

**Soluzione:** rimuoverli, e annotare in `docs/AUDIT_STRUTTURA_2026-08-10.md`
(dove ST-4 vive) che la lettura per conversazione **va scritta quando servirà**,
invece di lasciarne una versione non esercitata nel data layer.

---

## 4. Cosa è stato verificato ed è a posto

Elencato perché un audit che nomina solo i difetti non dice se il resto è stato
guardato.

- **Separazione delle responsabilità.** Il data layer è l'unico a conoscere
  Supabase (due eccezioni deliberate, entrambe protette da
  `no-restricted-imports`). Le funzioni di permesso sono pure e ricevono il
  team come argomento. Il reducer è puro. Lo stato di UI effimero è fuori dal
  reducer di dominio. Le viste non ricevono più `state` ma le sole fette che
  consumano.
- **Anti-pattern React.** Nessun aggiornamento di stato dentro un updater
  `setState` (era il difetto strutturale della vecchia chat, chiuso da
  `chatCommands`); nessun effetto senza cleanup; `useCallback`/`memo` usati
  dove servono a un bail-out reale e non a caso (`memoViste.test.jsx` lo
  blinda); nessun `key={index}` su liste mutabili; nessun componente multiplo
  per file (`react/no-multi-comp` a zero).
- **Dimensione dei componenti.** Nessun file supera la soglia, e la soglia è
  misurata (`max-lines` a 500 righe **effettive**, errore a zero violazioni;
  `npm run verifica:convenzioni` lo conferma oggi). Il componente più lungo è
  `ListeViaggio.jsx`, 579 righe totali ma **435 effettive** — la differenza è
  il commento, che in questo progetto è denso per scelta e non conta contro la
  soglia. L'unico file vicino al proprio tetto è `state/reducer.js` a 533/550,
  con la deroga dichiarata e argomentata in `eslint.config.js:328-357`: da
  tenere d'occhio, non un rilievo.
- **Sicurezza applicativa.** Nessun `dangerouslySetInnerHTML`, nessun `eval`,
  nessun `innerHTML`. I due `window.open` passano `noopener`. L'unico
  `target="_blank"` ha `rel="noopener noreferrer"`. Nessun token in
  `localStorage` scritto a mano (solo preferenze e l'intent push). La
  generazione HTML per l'export `.doc` (`listeApi.js:461-490`) escapa ogni
  interpolazione. L'export CSV neutralizza le formule (`adminExport.js:24-31`).
  Il parsing dei file importati ha limite di dimensione **e** guard anti
  prototype-pollution.
- **CSP e header** (`vercel.json`): nessuna direttiva permissiva rimasta,
  `frame-ancestors 'none'`, `object-src 'none'`, connect-src limitato al
  progetto Supabase.
- **Edge Function:** le quattro privilegiate passano tutte dallo stesso
  `requireActiveAdmin` + `adminPredicate`; `send-push` confronta il proprio
  secret a tempo costante; il `redirectTo` degli inviti è validato contro la
  famiglia di host del progetto (niente open redirect); il CORS riflette
  l'Origin solo se appartiene al progetto.
- **Paginazione:** ogni lettura del data layer che deve arrivare intera passa
  da `fetchAllRows`/`fetchRowsUpTo` — verificato riga per riga, nessuna
  regressione rispetto a C-1 del 12 agosto.

---

## 5. Ordine di intervento — applicato

1. **C-1** — è il rilievo che cambia la classe di garanzia del registry, e i
   due pezzi (`CONTA_RIGHE` nei metodi, `esito()` nell'orchestratore) sono
   piccoli e testabili senza rete.
2. **A-1** — chiude il percorso concreto di C-1 e allinea l'ultima entità
   rimasta al trattamento che le altre hanno già. Fatto **dopo** C-1, così la
   guardia di regressione poteva verificare entrambi i livelli sullo stesso
   caso.
3. **A-2** — indipendente dai primi due; tocca solo la chat.
4. **M-1, M-2, M-3** — manutenzione.
5. **B-1, B-2** — igiene, una riga ciascuno (B-2 corretto in corsa: era
   scritto per cinque metodi, uno si è rivelato preparazione dichiarata per
   un rilievo precedente — vedi la nota in B-2).

Eseguito in questo ordine, nello stesso branch, lo stesso 14 agosto. Nessun
rilievo è rimasto parzialmente applicato.
