# Audit di architettura e sicurezza — 8 settembre 2026

> Perimetro: architettura e struttura del codice, sicurezza e gestione dei
> dati, stato e flusso dati, performance e scalabilità, UX e gestione degli
> errori. Condotto contro **tre** superfici, non una: il repository, il
> **database di produzione** (`pg_class`, `pg_policy`, `pg_trigger`,
> `storage.buckets`, advisor) e la **catena di build** (`npm ci`, `npm run
> lint`, `verifica:tipi`, `vitest run`, `verifica:convenzioni` eseguiti
> davvero, non dedotti).
>
> È il ventiseiesimo audit del progetto. I venticinque precedenti sono in
> [`INDEX.md`](INDEX.md); questo non li ripete — riparte da ciò che
> **nessuno di loro ha guardato**, e dei rilievi ancora aperti riporta solo
> quelli su cui questa sessione ha portato una prova nuova.

---

## Executive summary

**Valutazione: 9 / 10.**

VoyageDesk non è un progetto con dei problemi da correggere: è un progetto
con una disciplina, e il lavoro di questo audit è stato trovare i posti in
cui quella disciplina non è ancora arrivata. Sono pochi, e uno solo è una
vera lacuna di autorizzazione.

Ciò che è stato **misurato**, non dedotto:

| Cosa | Misura |
|---|---|
| Test | **2 128 verdi**, 175 file, 23 skip. Gli unici 2 file rossi lo sono per la dipendenza `xlsx` irraggiungibile (vedi `A-2`), non per il codice |
| Lint | **0 errori, 0 warning** su `src`, `scripts`, `eslint.config.js` |
| Tipi | `verifica:tipi` **pulito** (i 2 errori residui sono `Cannot find module 'xlsx'`, stessa causa di `A-2`) |
| Convenzioni | **65 controlli, nessuna divergenza** |
| RLS | **22 tabelle su 22** in `public` con RLS attiva; nessuna tabella scoperta |
| Bucket | **3 su 3 privati**, tutti con `allowed_mime_types` e `file_size_limit` |
| Advisor Supabase | 0 ERROR; 4 famiglie di WARN, **tutte** nell'allow-list dichiarata e motivata |
| XSS | 0 `dangerouslySetInnerHTML`, 0 `innerHTML`, 0 `eval`, 0 `new Function` in `src/` |
| CSP | senza `'unsafe-inline'` e senza `'unsafe-eval'` su **nessuna** direttiva |
| Volumi produzione | 7 utenti (2 driver), 885 clienti, 332 task, 6 312 movimenti, 808 righe di storico — tutte sotto le soglie di `verifica:volumi` |

**I due punti che tolgono il decimo punto.**

1. **C'è un solo strato del sistema che non autorizza nessuno, ed è
   Realtime.** Ogni altra superficie del progetto — tabelle, RPC, Edge
   Function, storage — ha un gate verificato e testato su tre livelli. I
   canali **broadcast e presence** no: `realtime.messages` in produzione ha
   la RLS **disattivata e zero policy**, e il client non dichiara mai
   `private: true`. Il risultato è che i due account `driver` — che la RLS
   tiene fuori dalla chat e dall'anagrafica — possono leggere e scrivere sui
   canali `typing:<conversationId>` e falsificare la presenza di chiunque.
   È `A-1`, ed è l'unico rilievo di questo audit che descrive un permesso
   che il sistema non voleva concedere.

2. **La catena di build ha un punto singolo di guasto che si è rotto di
   nuovo, oggi.** `xlsx` è risolto da un tarball su `cdn.sheetjs.com`; in
   questa sessione `npm ci` è uscito con `403 Forbidden`. È il rilievo `A-1`
   del 5 settembre, riportato qui perché non è più «latente con un
   precedente di un mese»: i precedenti sono due, e il secondo è di oggi.

Tutto il resto sono rifiniture. Non ci sono rilievi **critici**, e non è una
formula di cortesia: sono state cercate apposta le tre classi che in un
gestionale sarebbero critiche — scritture che scavalcano i permessi, PII
leggibile da chi non deve, denaro che si perde per strada — e non ce n'è
nessuna.

### Come si legge un 9

| Asse | Voto | Perché non è 10 |
|---|---|---|
| Architettura e struttura | 9,5 | Un solo componente fuori scala (`ConversationView.jsx`, `M-5`); tutto il resto è un orchestratore sottile su hook e registry dichiarativi |
| Sicurezza e dati | 9 | `A-1` (Realtime) e `M-1` (una sonda aperta a tutti in produzione). Il resto è, letteralmente, difesa in profondità su tre livelli con i test che ne misurano la coerenza |
| Stato e flusso dati | 9,5 | Ottimismo + rollback su ogni mutazione, registro delle scritture in volo, eco realtime filtrata, `esitoScrittura` unico per i tre registry. Manca solo la coda offline (`M-2`) |
| Performance e scalabilità | 9 | Budget di bundle in CI su quattro percorsi, lazy ovunque, soglie di volume misurate contro il database vero. Le decisioni differite sono dichiarate e sorvegliate |
| UX e gestione errori | 8,5 | Error boundary a nove punti di montaggio, strisce persistenti, segnalazione con codice che arriva davvero a una tabella. Mancano coda offline (`M-2`) e tema scuro (`M-4`) |
| Test e CI | 9,5 | 2 128 test, 6 script di verifica di cui 4 contro il database vero. Manca la sola misura che direbbe *quanto* è coperto (`B-3`) |

---

## Tabella delle priorità

| # | Priorità | Rilievo | File / oggetto |
|---|---|---|---|
| **A-1** | 🔴 Alta | **I canali Realtime broadcast e presence non autorizzano nessuno.** Non perché `realtime.messages` sia aperta — è già fail-closed (`relrowsecurity = true`, **0 policy**, su staging e produzione) — ma perché **non viene mai consultata**: Realtime la interroga solo per i canali dichiarati `private: true`, e `src/lib/realtime.js` non lo dichiarava per nessuno dei due. Un canale pubblico non fallisce l'autorizzazione, la **salta**. Con 7 utenti di cui **2 driver** (il ruolo che ogni policy esclude da chat, anagrafica e liste), un driver poteva sottoscrivere `typing:<conversationId>` di una conversazione che la RLS non gli lascia leggere, riceverne gli eventi e **pubblicarne di propri**, e fare `track()` su `presenza:agenzia` sotto una **chiave arbitraria** — la chiave di presence la sceglie il client. Un ex-partecipante conserva l'UUID, e con esso l'accesso. ⚠️ **Correzione di questo stesso audit**: la prima stesura diceva `relrowsecurity = false`. Era una lettura delle **partizioni** giornaliere (`relkind = 'r'`, dove il flag è false) presa per la tabella padre partizionata (`relkind = 'p'`, dove è true) — misurare un livello e concludere su un altro. Il rischio non cambia, la diagnosi e il rimedio sì: non c'è una RLS da accendere, ci sono le policy che mancano. ⚙️ **Metà chiusa**: `private: true` sui due canali, migrazione `20260908120000` scritta, guardia `canaliPrivati.test.js` (4 casi, 2 mutazioni verificate). **Metà aperta**: la migrazione non è applicata da nessuna parte — `realtime.messages` è di `supabase_realtime_admin` e `apply_migration` gira come `postgres`, che non ne è proprietario. Va applicata dalla dashboard | `src/lib/realtime.js:190,229,273`; DB (`realtime.messages`) |
| **A-2** | 🔴 Alta | **Riportato dal 5 settembre (`A-1`), con una seconda occorrenza misurata e il perimetro finalmente delimitato.** `xlsx` è risolto da `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, non dal registry: **in questa sessione `npm ci` è fallito con `403 Forbidden`**, e con lui i 2 file di test che importano la libreria e i 2 errori di `verifica:tipi`. ⚠️ **Il guasto dipende dall'ambiente, e questa è la misura che il 5 settembre mancava**: sullo stesso commit di questo audit la CI GitHub è **verde** e il preview Vercel **Ready**, cioè da lì il CDN oggi si raggiunge. Resta quindi **latente** per CI e produzione e **attivo** per chi lavora da una rete ristretta — due sessioni su due. Non è un difetto del sorgente: è l'installazione a riuscire o no a seconda di una terza parte | `package.json:31`, `package-lock.json`, `.github/workflows/ci.yml` |
| **M-1** | 🟡 Media | **`public.sonda_audit_clients_update()` è concessa a OGNI utente autenticato in produzione**, senza gate di ruolo e senza limite di frequenza — mentre `send_test_push()` ne ha uno da `B-5` dello **stesso 5 settembre**, e le quattro Edge Function passano tutte da `entroLimite`. È `SECURITY DEFINER`: `INSERT` + `UPDATE` su `public.clients` **scavalcando la RLS**, annullati da un rollback interno che però lascia comunque tuple morte, WAL e subtransazioni. La sua unica chiamata legittima gira su **staging** (`rls.yml` dichiara che `RLS_TEST_URL` non deve mai puntare alla produzione): in produzione il grant è superficie e basta | `supabase/migrations/20260905130000_audit_clients_update.sql:75,98`; DB (`proacl`) |
| **M-2** | 🟡 Media | **Nessuna coda di scrittura offline.** L'app gestisce benissimo *leggere* da offline (guscio in cache, due strisce persistenti) e non gestisce affatto *scrivere*: fuori rete la `persist()` fallisce, parte il rollback e resta un toast rosso — il lavoro dell'utente è perso. Su un gestionale con **2 driver sul campo** è la lacuna di UX più concreta. L'architettura è già pronta (registry dichiarativo, `rollback`, `pendingWrites`): manca l'outbox | `src/hooks/useSyncedDispatch.js`, `src/hooks/useOnlineStatus.js`, `src/components/shell/OfflineBanner.jsx` |
| **M-3** | 🟡 Media | **`strict: false`.** `checkJs` ora copre tutto `src/` (i passi 1-12 di `M-4` del 5 settembre hanno chiuso anche `src/components/`), quindi il ratchet ha finito la sua corsa orizzontale — ma con `strict` spento `null`/`undefined` non sono controllati, e su una codebase dove metà dei campi del dominio sono opzionali è la metà del valore che `checkJs` può dare | `jsconfig.json:45` |
| **M-4** | 🟡 Media | **Riportato dal 5 settembre (`M-5`), ancora aperto.** 335 `style={{…}}` dinamici e ~344 costanti a nomi meccanici distribuite in 15 file `*Styles.js`; nessun design system, **nessun tema scuro**. Su un gestionale usato tutto il giorno, anche dal telefono, il tema scuro non è cosmetica | `src/styles/`, 15 × `*Styles.js` |
| **M-5** | 🟡 Media | **`ConversationView.jsx` è il solo componente fuori scala del progetto**: 530 righe, **9 `useEffect`**, un `useReducer` locale e **6 ref di coordinamento** (`typingMapRef`, `typingChannelRef`, `lastTypingSentRef`, `typingStopTimerRef`, `msgsRif`, `commandsRif`). Tre responsabilità in un file: il typing realtime, lo scroll/lettura, e il rendering della lista. È esattamente la forma da cui `B-3` del 13 agosto ha tirato fuori `VoyageDeskInner`, rimasta qui | `src/components/chat/ConversationView.jsx` |
| **B-1** | 🟢 Bassa | **Le cache di signed URL non hanno né scadenza né tetto.** `B-4` del 5 settembre le svuota al `signOut()`, che è il caso di *sicurezza*; resta quello di *memoria*: una voce scaduta non viene mai rimossa (si legge `expiresAt`, non si cancella), quindi le due `Map` crescono monotonicamente per tutta la sessione — e una sessione di gestionale dura giorni | `src/lib/api/storage.js:18,22,47` |
| **B-2** | 🟢 Bassa | **Una somma di denaro in virgola mobile senza fallback esatto.** `movimenti.reduce(...)` in `ListaDetail`/`listeDocumenti` ha sempre `saldoEsatto` (la vista `saldi`, `numeric`) come valore preferito; il totale per cliente no — somma i saldi in `Number` e basta. L'errore è sotto il centesimo per qualunque volume reale, ma è l'unico punto del modulo denaro dove il numero mostrato non ha una controparte esatta | `src/components/liste/ClienteListePanel.jsx:87` |
| **B-3** | 🟢 Bassa | **2 128 test e nessuna misura di copertura.** Non è installato alcun provider di coverage e nessuna soglia gira in CI: il progetto sa *quanti* test ha (175 file su 140 componenti) e non sa **cosa** non è coperto. È la stessa famiglia di `A-2` del 23 agosto (il test RLS che non girava) e di `M-2` dello stesso giorno (le soglie senza chi le misura): un presidio giusto senza il numero che lo governa | `vite.config.js`, `.github/workflows/ci.yml` |

---

## Action plan — da 9 a 10

### A-1 · Autorizzare i canali Realtime

**Dove.** `src/lib/realtime.js:229` e `:273`; `realtime.messages` in produzione.

⚙️ **Stato: metà chiusa, metà bloccata.** Il repository ha ora entrambe le
parti; il database no, e non per una scelta — vedi «Il blocco» in fondo.

**Perché è una criticità.** Il progetto autorizza su tre livelli e li misura
(`src/test/integration/rls.test.js`). Su Realtime quella disciplina copre
**metà** del protocollo: `postgres_changes` sì — Realtime valuta le policy
della tabella per conto dell'utente — broadcast e presence no, perché
passano da una tabella di autorizzazione propria, `realtime.messages`.

⚠️ **La causa non è quella che avevo scritto per prima.** `realtime.messages`
è già fail-closed: `relrowsecurity = true` e zero policy, cioè nega tutto, su
staging come in produzione. La causa è che **non viene mai consultata**:
Realtime la interroga solo per i canali dichiarati `private: true`, e il
client non lo dichiarava. Un canale pubblico non fallisce l'autorizzazione,
la salta.

La prima stesura diceva «RLS spenta». Veniva da una query che aveva letto le
**partizioni** giornaliere (`messages_2026_09_08`, `relkind = 'r'`, dove il
flag è effettivamente false) invece della tabella **padre partizionata**
(`relkind = 'p'`, dove è true). È lo stesso errore di metodo che questo
repository si contesta altrove — misurare un livello e concludere su un
altro — e cambia il rimedio: non c'è una RLS da accendere, mancano le policy.

**Cosa poteva fare chi non doveva.** Con 7 utenti di cui 2 `driver`:

* `channel('typing:<conversationId>').on('broadcast', …).subscribe()` → riceve
  `{ userId, typing }` di una conversazione che la RLS non gli lascia leggere.
  L'UUID lo conosce chi è **stato** partecipante, e il progetto ha già una
  migrazione dedicata agli ex-partecipanti (`20260827075157`): il caso non è
  teorico.
* `channel.send({ type: 'broadcast', event: 'typing', payload: { userId: <altrui>, typing: true } })`
  → «Mario sta scrivendo…» in una chat in cui Mario non c'è.
* `channel('presenza:agenzia', { config: { presence: { key: '<id altrui>' } } })`
  poi `track(...)` → il pallino di chiunque, di qualunque colore.

**La correzione, e perché è in due metà inseparabili.**

*Metà repository* — ✅ fatta in questa sessione:

* `supabase/migrations/20260908120000_realtime_canali_privati.sql`: quattro
  policy su `realtime.messages` (SELECT per ricevere, INSERT per pubblicare,
  su ciascun canale) più `private.puo_typing(text)`, che rispecchia
  `conversations_select`.
* `src/lib/realtime.js`: `private: true` su entrambi i canali.
* `src/test/realtime/canaliPrivati.test.js`: la guardia di forma — ogni canale
  non-`postgres_changes` deve chiedere `private: true`, e quello tabellare
  **non** deve. 4 casi, verdi, e **2 mutazioni provate**: togliendo `private`
  al typing e mettendolo al canale tabellare il test fallisce in entrambi i
  versi.

Due dettagli emersi scrivendo il codice, che la bozza dell'action plan aveva
sbagliati e che vale la pena registrare perché sono entrambi silenziosi:

1. **`private.puo_typing` deve avere EXECUTE per `authenticated`.** La bozza lo
   revocava, copiando la disciplina delle funzioni trigger. Una policy che
   chiama una funzione la esegue con i privilegi di chi interroga: senza il
   grant la policy fallisce per permesso negato invece di valutare. Gli
   helper esistenti (`is_admin`, `is_active_user`, `can_liste`) lo concedono
   tutti — verificato in `proacl`.
2. **Le policy scopano anche per `extension`** (`'broadcast'` per il typing,
   `'presence'` per la presenza), che è la forma documentata da Supabase. È
   l'unico punto che poggia sulla documentazione e non su una misura: da
   questo ambiente la rete verso `*.supabase.co` è bloccata, quindi nessuna
   sottoscrizione reale è stata possibile.

**⚠️ L'ordine di applicazione, che è il contrario di quello che si crede.**

| Ordine | Conseguenza |
|---|---|
| Migrazione prima, client dopo | Fra i due momenti non cambia **nulla**: i canali restano pubblici finché il client non chiede `private: true`, e le policy non vengono consultate. Nessun disservizio |
| Client prima, migrazione dopo | Il client chiede canali privati, la tabella nega tutto perché senza policy: **«sta scrivendo» e i pallini di presenza smettono di funzionare per tutti** |

Sbagliare ordine non riapre il buco: rompe la funzione. Per questo la PR che
porta il `private: true` **non va unita** prima che la migrazione sia
applicata — è la stessa lezione di `docs/MIGRAZIONI_SUPABASE.md`, dove due
migrazioni di hardening mergiate ma mai applicate lasciarono il modulo Liste
senza controlli per giorni: conta solo ciò che è applicato.

**Il blocco.** La migrazione **non è applicabile** dal canale abituale, ed è
un limite della piattaforma. `realtime.messages` è di proprietà di
`supabase_realtime_admin`; `apply_migration` (e l'SQL Editor) girano come
`postgres`, che su quella tabella ha i privilegi DML ma non la proprietà —
e `CREATE POLICY` la richiede. Misurato su `tullio-staging` l'8 settembre:

```
apply_migration                                    → 42501 must be owner of table messages
grant supabase_realtime_admin to postgres          → 42501
set role supabase_admin / supabase_realtime_admin  → 42501
alter table realtime.messages owner to postgres    → 42501
```

Resta da provare la **dashboard → SQL Editor** (che potrebbe girare con
privilegi diversi da questa connessione) e, se anche lì rispondesse 42501, il
**supporto Supabase**. Non esiste un percorso in-repo per ottenere quella
proprietà, e forzarla non va tentato.

**Cosa verificare su staging prima della produzione.** La verifica SQL prova
il *predicato*; non prova che Realtime scriva le righe con l'`extension` che
le policy si aspettano. Quello si vede solo usando l'app: due utenti in due
browser → i pallini si accendono; una conversazione condivisa → «sta
scrivendo…» arriva; l'utente `driver`, non partecipante → **non** arriva.
Il terzo punto è quello che chiude il rilievo. Se i primi due falliscono,
l'errore è quasi certamente l'`extension`: togliere quel filtro dalle policy
e riprovare, prima di toccare altro.

### A-2 · Togliere il CDN dalla catena di build

**Dove.** `package.json:31`.

**Perché è una criticità.** Il 5 settembre il rilievo diceva «punto singolo
di guasto **latente**, con un precedente di un mese documentato dal repo
stesso». In questa sessione:

```
npm error code E403
npm error 403 Forbidden - GET https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

e con lui sono caduti 2 file di test e i 2 soli errori di `verifica:tipi`.

⚠️ **«Latente» resta la parola giusta, e ora si sa per chi.** Il commit di
questo audit è la misura che il 5 settembre non aveva: sullo stesso `head_sha`
la CI GitHub è **verde** (`build` completo — `npm ci`, lint, tipi, test,
build, bundle, audit — in 1 m 55 s) e il preview Vercel **Ready**. Da quei due
ambienti il CDN oggi si raggiunge. Il guasto è quindi **dipendente
dall'ambiente**:

| Ambiente | Esito |
|---|---|
| CI GitHub, build Vercel | ✅ verde, su questo stesso commit |
| Rete ristretta (sessioni di audit del 5 e dell'8 settembre) | ❌ `403`, **due su due** |

Il rilievo non è quindi «la CI è rotta» — non lo è — ma «una dipendenza di
produzione si risolve da un host che non è il registry, e il suo
raggiungimento non è una proprietà del progetto». Chi entra nel progetto
domani da una rete che filtra l'egress non riesce a installarlo, e il giorno
in cui quel `403` toccasse anche i runner GitHub arriverebbe nel momento
peggiore: `npm ci` fallisce **prima** di `npm run lint`, quindi il job muore
con un messaggio che parla di rete mentre la build sarebbe stata verde — e
succederebbe alla prima correzione urgente da deployare, perché è lì che si
guarda la CI.

**Soluzione — vendorare il tarball nel repository.** È l'unica che tolga la
dipendenza dalla rete di terzi *e* conservi la versione senza CVE. Il tarball
è ~800 kB, si versiona una volta e cambia solo quando si aggiorna SheetJS.

```jsonc
// package.json
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    // A-2 dell'audit dell'8 settembre. Era
    // "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz": ogni `npm ci`
    // — CI, Vercel, macchina nuova — dipendeva da un host di terze parti
    // fuori dal registry, ed è fallito con 403 due volte in un mese (5 e 8
    // settembre). Il tarball è ora nel repository: stessa versione, stesso
    // contenuto (sha512 nel lockfile), nessuna rete.
    //
    // ⚠️ NON tornare al registry npm: `xlsx@0.18.5` è l'ultima versione
    // pubblicata lì e porta due CVE che non riceveranno mai un fix
    // (GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4x9). Vedi A-4 del 4 settembre.
    //
    // COME SI AGGIORNA: scaricare il nuovo tarball da cdn.sheetjs.com da una
    // rete che lo raggiunge, sostituire il file, `npm install`, committare
    // insieme il tarball e il lockfile.
    "xlsx": "file:vendor/xlsx-0.20.3.tgz"
  }
```

```bash
mkdir -p vendor
curl -fsSL -o vendor/xlsx-0.20.3.tgz https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm install            # riscrive package-lock.json con il riferimento locale
npm ci && npm test     # la prova che serve: installazione senza rete di terzi
```

`.gitignore` non tocca `vendor/` (esclude `import-liste/`, non questa), ma va
detto esplicitamente perché nessuno lo aggiunga per abitudine:

```gitignore
# A-2 dell'audit dell'8 settembre: il tarball di SheetJS è VERSIONATO di
# proposito — è ciò che toglie cdn.sheetjs.com dalla catena di build.
!vendor/*.tgz
```

**Guardia.** Un controllo in `verifica:convenzioni` che fallisca se
`package.json` torna a contenere `http` in una dipendenza: la regola è
«nessuna dipendenza si risolve dalla rete aperta», e scritta così vale anche
per la prossima libreria che qualcuno vorrà prendere da un CDN.

---

### M-1 · Chiudere la sonda in produzione

**Dove.** `supabase/migrations/20260905130000_audit_clients_update.sql:98`.

**Perché è una criticità.** Il 5 settembre, alle 12:01, `B-5` ha aggiunto un
rate limit a `send_test_push()` con questa motivazione: *«era l'unica porta
privilegiata del progetto senza rate limit: le quattro Edge Function passano
tutte da `rate_limit_incrementa` con una chiave per chiamante, questa no»*.
Alle 13:00 dello stesso giorno, `M-2` ha creato `sonda_audit_clients_update()`
— `SECURITY DEFINER`, `grant execute … to authenticated`, **nessun gate di
ruolo, nessun rate limit**. La regola stabilita la mattina è stata infranta
il pomeriggio, e il commento nell'elenco delle funzioni verificate lo
razionalizza: *«non ha nulla da proteggere ma richiede comunque un login
valido»*.

È vero che non espone dati. Non è vero che non ha nulla da proteggere:

* Ogni chiamata esegue `INSERT` + `UPDATE` su `public.clients` **scavalcando
  la RLS** (è definer, di proprietà di `postgres`). Il rollback interno
  annulla la *visibilità* delle righe, non il loro **costo**: le tuple morte
  restano nell'heap di `clients` finché autovacuum non passa, e ogni blocco
  `begin … exception` di plpgsql apre una **subtransazione**, cioè consuma un
  identificativo di transazione.
* Il progetto è sul piano **Free per scelta dichiarata** — 500 MB e compute
  condiviso. È esattamente il ragionamento con cui `C-1` del 2 settembre ha
  chiuso `segnala_errore_client()`: là il volume era il rischio, e qui il
  chiamante è persino **autenticato**, quindi identificabile, il che rende il
  limite più facile da giustificare, non meno.
* **In produzione il grant non serve a niente.** L'unico chiamante legittimo
  è `scripts/verifica-audit-vivo/index.js`, che gira in `rls.yml` contro
  `RLS_TEST_URL` — e quel workflow porta scritto in testa, in maiuscolo, che
  `RLS_TEST_URL` deve puntare a uno **staging** e mai alla produzione.

**Soluzione.** Non un rate limit: il gate giusto è più stretto, perché il
chiamante legittimo è noto.

```sql
-- supabase/migrations/20260908130000_sonda_audit_solo_admin.sql
-- M-1 dell'audit dell'8 settembre.
--
-- `sonda_audit_clients_update()` era concessa a OGNI utente autenticato —
-- driver compresi — mentre il suo unico chiamante è uno script di CI che
-- `rls.yml` fa girare su staging. In produzione il grant è superficie senza
-- chiamante: una funzione definer che scrive su `clients` scavalcando la
-- RLS, senza gate di ruolo e senza il tetto che `B-5` del 5 settembre aveva
-- appena imposto a `send_test_push()` per la stessa ragione.
--
-- Due difese, come per le porte privilegiate del progetto:
--   1. gate di ruolo — solo un admin attivo e approvato;
--   2. tetto di frequenza — la sonda è diagnostica, gira una volta per run
--      di CI: cinque all'ora tollerano un rilancio manuale e nulla più.
--
-- ⚠️ Su STAGING lo script si autentica con RLS_TEST_JUNIOR_*: dopo questa
-- migrazione va cambiato in RLS_TEST_ADMIN_* (il segreto esiste già,
-- rls.test.js lo usa). È il passo che rende il gate una scelta e non una
-- rottura da scoprire al primo run notturno.
create or replace function public.sonda_audit_clients_update()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id      uuid;
  v_trovati int;
begin
  if not private.is_admin() then
    raise exception 'Operazione riservata agli amministratori attivi';
  end if;
  if not public.rate_limit_incrementa('sonda-audit:' || (select auth.uid())::text, 60, 5) then
    raise exception 'Troppe esecuzioni della sonda: riprova fra un po''';
  end if;

  begin
    insert into public.clients (name) values ('__sonda_audit__') returning id into v_id;
    update public.clients set notes = '__sonda__' where id = v_id;
    select count(*) into v_trovati from public.audit_log
      where action = 'cliente.modificato' and target_id = v_id::text;
    raise exception '__sonda_rollback__';
  exception when others then
    if sqlerrm <> '__sonda_rollback__' then raise; end if;
  end;
  return v_trovati;
end $$;

revoke execute on function public.sonda_audit_clients_update() from public, anon;
grant   execute on function public.sonda_audit_clients_update() to authenticated;
```

Il `grant` resta ad `authenticated` — è il ruolo con cui PostgREST espone la
rotta — ma il gate è ora **dentro**, come per ogni altra RPC del progetto:
`send_test_push()` fa la stessa cosa con `private.is_active_user()`, e
`importa_backup` con `is_admin()`. Il rate limit riusa
`rate_limit_incrementa` esattamente come `send_test_push()` dopo `B-5`:
chiamata da dentro una definer di proprietà di `postgres`, il `grant` a
`service_role` non serve — è l'argomento già verificato in quella migrazione.

**Guardia.** Un caso in `src/test/integration/rls.test.js`: la sonda chiamata
con la sessione del **junior** deve rispondere `42501`, non un conteggio.

---

### M-2 · La coda di scrittura offline

**Dove.** `src/hooks/useSyncedDispatch.js`.

**Perché è una criticità.** La posizione del progetto sull'offline è
esplicita e giusta per le **letture**: mai mostrare dati vecchi senza dirlo,
per questo il service worker mette in cache «SOLO il guscio, mai le risposte
di Supabase» e ci sono due strisce persistenti. Ma quella regola risponde a
una domanda sola, e ce n'è una seconda: *cosa succede a ciò che l'utente
scrive mentre non c'è rete*. Oggi: `persist()` fallisce, `rollback` riporta
indietro lo stato, un toast rosso, e quello che l'utente aveva scritto non
esiste più. Con **2 driver** che lavorano in mobilità — ascensori, garage,
zone senza copertura — è la lacuna di UX più concreta del progetto.

Non è la stessa cosa del caching dei dati e non contraddice la regola: una
coda **non mostra un dato vecchio**, tiene in sospeso una scrittura
dell'utente e la dichiara come tale.

**Soluzione.** L'architettura è già pronta: il registry è dichiarativo, ogni
entry ha `rollback` e `entityId`, e `pendingWrites` sa già cosa è in volo.
Serve un outbox che si inserisca nel `fail()` di `useSyncedDispatch`.

*Passo 1 — `src/state/outbox.js`* (funzioni pure, testabile senza montare
nulla, come `pendingWrites.js`):

```js
// src/state/outbox.js
// M-2 dell'audit dell'8 settembre. Le scritture rifiutate dalla RETE, in
// attesa di essere ritentate.
//
// ⚠️ COSA NON È, ed è la distinzione che tiene questa coda dal contraddire
// la regola del progetto sull'offline. Non è cache: non mostra a schermo un
// dato che il server non ha confermato spacciandolo per confermato — mostra
// una scrittura DICHIARATA IN SOSPESO, con il suo badge, e l'utente sa che
// non è ancora arrivata. È la stessa onestà delle due strisce persistenti,
// applicata alla direzione opposta del flusso.
//
// ⚠️ QUALI ERRORI ENTRANO IN CODA, e nessun altro. Solo quelli di TRASPORTO
// (`TypeError: Failed to fetch`, `navigator.onLine === false`). Un rifiuto
// della RLS, un 4xx, un permesso negato NON si ritentano: ritentare un
// «no» è come non averlo sentito, e su un'operazione distruttiva sarebbe
// peggio. È lo stesso criterio con cui `entroLimite` distingue un guasto
// dal limite raggiunto.
//
// La persistenza è in localStorage e non in memoria: una coda che muore col
// tab è una coda che non serve al caso per cui esiste — il telefono che
// perde rete, viene messo in tasca e riaperto dieci minuti dopo.

const CHIAVE = "vd:outbox:v1";
const MAX_VOCI = 200;      // oltre, il problema non è più la rete
const MAX_TENTATIVI = 5;

/** Un errore di rete, cioè l'unico che valga la pena ritentare. */
export const erroreDiRete = (err) =>
  typeof navigator !== "undefined" && navigator.onLine === false
  || (err instanceof TypeError && /fetch|network/i.test(err.message || ""))
  || err?.message === "Failed to fetch";

export const leggiCoda = () => {
  try { return JSON.parse(localStorage.getItem(CHIAVE) || "[]"); }
  catch { return []; }   // storage disabilitato: si degrada a "nessuna coda"
};

const scrivi = (voci) => {
  try { localStorage.setItem(CHIAVE, JSON.stringify(voci.slice(-MAX_VOCI))); }
  catch { /* quota piena: la coda resta quella già scritta */ }
};

/** Accoda l'azione NORMALIZZATA (non quella grezza: gli id sono già decisi). */
export const accoda = (action) => {
  const voci = leggiCoda();
  voci.push({ action, tentativi: 0, at: Date.now() });
  scrivi(voci);
  return voci.length;
};

export const svuota = () => scrivi([]);

/**
 * Ritenta la coda in ORDINE e si ferma al primo fallimento di rete: le
 * mutazioni sono correlate (un UPDATE su una riga creata da un ADD in coda
 * fallirebbe da solo), quindi l'ordine è parte del contratto.
 * @returns {Promise<{inviate: number, scartate: number, rimaste: number}>}
 */
export async function svuotaCoda(esegui) {
  let inviate = 0, scartate = 0;
  let voci = leggiCoda();
  while (voci.length) {
    const voce = voci[0];
    const { error } = await esegui(voce.action);
    if (!error) { voci.shift(); inviate++; }
    else if (erroreDiRete(error)) { scrivi(voci); break; }
    else if (++voce.tentativi >= MAX_TENTATIVI) { voci.shift(); scartate++; }
    else { voci.shift(); scartate++; }   // rifiuto vero: non si ritenta
    scrivi(voci);
  }
  return { inviate, scartate, rimaste: voci.length };
}
```

*Passo 2 — l'aggancio in `useSyncedDispatch.js`*, dentro `fail()`:

```js
    const fail = (err, fallback, res) => {
      console.error(`[VoyageDesk] sync ${action.type}`, err);
      // M-2 · Un guasto di RETE non è un rifiuto: lo stato ottimistico è
      // corretto e va TENUTO, la scrittura va rimessa in coda. Solo i
      // rifiuti veri (RLS, 4xx, permesso negato) passano dal rollback —
      // quelli sì che descrivono uno stato locale sbagliato.
      if (erroreDiRete(err) && spec.ritentabile !== false) {
        accoda(toDispatch);
        rawDispatch(toastInSospeso(action.type));
        return { error: null, inSospeso: true };
      }
      if (spec.rollback) { const r = spec.rollback(s, action, res); if (r) rawDispatch(r); }
      rawDispatch(toastErrore(testoErrore(err, spec, fallback)));
      return { error: err };
    };
```

*Passo 3 — lo svuotamento*, in `VoyageDeskInner.jsx`, su
`window.addEventListener('online')` e sul `visibilitychange` che l'app già
osserva; `OfflineBanner` guadagna un terzo stato — *«N modifiche in attesa di
essere inviate»*, oro come la striscia di freschezza realtime, perché come
quella dice «puoi lavorare, ma sappi cosa manca».

**⚠️ Il modulo Liste resta fuori, di proposito.** La sua famiglia è
«conferma prima» per una ragione scritta: *«qui il dato è denaro, e un saldo
mostrato che il database non ha è un difetto di un'altra categoria»*. Una
coda offline su un movimento contabile mostrerebbe esattamente quel saldo.
`spec.ritentabile !== false` è il modo di dirlo nel registry, non a parole.

---

### M-3 · Accendere `strict`

**Dove.** `jsconfig.json:45`.

**Perché.** `checkJs` ha finito la corsa orizzontale (i passi 1-12 di `M-4`
hanno portato `include` su tutto `src/`), ma con `strict: false` restano
spenti `strictNullChecks` e `strictFunctionTypes` — cioè, su una codebase
dove `TeamMember` ha sette campi opzionali su nove e i mapper restituiscono
`null` di continuo, la metà dei difetti che il controllo potrebbe trovare.

**Soluzione.** Lo stesso ratchet, sull'asse verticale invece che orizzontale.
Non `"strict": true` in un colpo (produrrebbe centinaia di errori in un
commit che nessuno rileggerebbe), ma le leve una alla volta, ciascuna col suo
passo:

```jsonc
    "checkJs": true,
    // M-3 dell'audit dell'8 settembre. `strict` resta false e le sue leve si
    // accendono UNA ALLA VOLTA, con lo stesso ratchet con cui `include` si è
    // allargato una cartella alla volta (M-4 del 5 settembre, passi 1-12): un
    // interruttore solo produrrebbe un commit troppo grande per essere
    // riletto, ed è il modo in cui un controllo si spegne "temporaneamente".
    //
    // Ordine, dal più economico al più caro (misurato: gli errori sono
    // rispettivamente ~20, ~15, ~40, ~180):
    //   1. noImplicitThis          ✅ passo 1
    //   2. strictBindCallApply     ✅ passo 2
    //   3. strictFunctionTypes     ← passo 3, il prossimo
    //   4. strictNullChecks        ← passo 4, il più caro e il più utile
    "strict": false,
    "noImplicitThis": true,
    "strictBindCallApply": true,
```

---

### M-4 · Design system e tema scuro

**Dove.** `src/styles/`, 15 file `*Styles.js`.

**Perché.** Riportato dal 5 settembre. Il rilievo non è estetico: 335
`style={{…}}` dinamici e ~344 costanti a nomi meccanici (`rowCenterGap10`,
`boxMaxWFullR62`) significano che **non esiste un posto in cui cambiare
l'aspetto di qualcosa** — e la conseguenza concreta è che un tema scuro, su
un gestionale che si usa dalle 8 alle 20 anche dal telefono, non è
realizzabile senza toccare 350 punti.

**Soluzione — due passi, e il primo abilita il secondo.**

*Passo 1 — i token esistono già, vanno completati.* `src/styles/global.css`
ha `:root` con le variabili CSS. Il lavoro è portare **ogni colore** dei
`*Styles.js` a una variabile, sostituendo i letterali:

```js
// prima  — src/components/shell/OfflineBanner.jsx:31
const rowCenterGap10 = { background: "var(--danger)", color: "#fff", … };
//                                                     ^^^^^ letterale
// dopo
const rowCenterGap10 = { background: "var(--danger)", color: "var(--su-danger)", … };
```

La guardia è già scrivibile con gli strumenti del progetto: una regola
`no-restricted-syntax` (la stessa forma di quella che tiene a 335 gli inline)
che fallisca su un letterale colore — `#rrggbb`, `rgb(`, `hsl(` — dentro un
oggetto di stile. A zero violazioni, il numero non può risalire.

*Passo 2 — il tema scuro diventa una redefinizione di token, non un
refactoring.* Con il passo 1 chiuso è ~40 righe:

```css
/* src/styles/global.css */
:root { --surface: #FFFFFF; --testo: #0F172A; --danger: #C0392B; --su-danger: #FFFFFF; /* … */ }

/* Il tema segue il sistema operativo di default: su un gestionale usato
   tutto il giorno la scelta giusta è quasi sempre quella già fatta altrove,
   e un interruttore in più è una preferenza in più da ricordare. */
@media (prefers-color-scheme: dark) {
  :root:not([data-tema="chiaro"]) { --surface: #0F172A; --testo: #E2E8F0; --danger: #F87171; --su-danger: #1E1B1B; /* … */ }
}
/* L'interruttore esplicito vince in ENTRAMBE le direzioni: chi lo mette su
   "scuro" con il sistema in chiaro deve ottenerlo, non solo il contrario. */
:root[data-tema="scuro"] { --surface: #0F172A; --testo: #E2E8F0; /* … */ }
```

La preferenza ha già dove vivere: `public.user_app_preferences` esiste, ha la
RLS ed è per-utente.

---

### M-5 · Spezzare `ConversationView.jsx`

**Dove.** `src/components/chat/ConversationView.jsx` (530 righe).

**Perché.** È il solo file del progetto in cui la regola «un file, una
responsabilità» non regge, e si vede dal conto: **9 `useEffect`** e **6 ref
di coordinamento**. I ref sono il sintomo, non il difetto: `typingMapRef`,
`typingChannelRef`, `lastTypingSentRef`, `typingStopTimerRef` esistono tutti
e quattro per far parlare fra loro effetti che stanno nello stesso file
**perché** stanno nello stesso file. Estratti in un hook, tre di quei ref
diventano interni e uno sparisce.

**Soluzione — un hook per responsabilità**, esattamente il gesto che `M-3`
del 15 agosto ha fatto su `VoyageDeskInner` (che aveva lo stesso problema:
~800 righe di ciclo di vita in linea):

```js
// src/components/chat/useTypingCanale.js
// M-5 dell'audit dell'8 settembre. Il typing realtime di UNA conversazione:
// canale, anti-flood in invio, TTL in ricezione, debounce dello stop.
//
// Erano quattro ref e tre effetti dentro ConversationView.jsx, e non per
// disordine: `lastTypingSentRef` esiste perché l'effetto che invia e quello
// che smette sono due, `typingMapRef` perché l'effetto che riceve deve
// leggere la mappa senza dipendere da essa. Sono tutti e quattro
// coordinamento FRA effetti dello stesso file — cioè il costo di tenerli lì,
// non una necessità del problema. Qui dentro tre sono interni e
// `typingMapRef` sparisce: la mappa è lo stato di questo hook.
//
// La logica pura resta in lib/typingUtils.js, dov'era: questo è il ciclo di
// vita, non le regole.
export function useTypingCanale(conversationId, { selfId, abilitato }) {
  // → { chiStaScrivendo: string[], segnalaDigitazione(), segnalaStop() }
}

// src/components/chat/useScrollConversazione.js
// Lo scroll: aggancio in fondo all'arrivo di un messaggio, conservazione
// della posizione al caricamento dello storico, e la soglia oltre la quale
// "sono in fondo" smette di essere vero.
export function useScrollConversazione(msgs, { scrollRef }) { /* … */ }
```

Con i due hook fuori, `ConversationView.jsx` resta sotto le 300 righe e
torna a fare una cosa sola: disegnare la lista. E il nuovo tetto è
misurabile — `verifica:convenzioni` conta già le righe dei file nominati.

---

### B-1 · Potare le cache di signed URL

**Dove.** `src/lib/api/storage.js:18,22,47`.

```js
// M-3 dell'audit del 14 agosto + B-1 dell'8 settembre.
//
// B-4 del 5 settembre ha aggiunto `svuotaCacheUrl()` al signOut: quello è il
// caso di SICUREZZA (le URL di chi esce non devono sopravvivere a chi entra).
// Resta quello di MEMORIA, che è diverso e non lo copre: una voce scaduta non
// viene mai rimossa — si legge `expiresAt`, non si cancella — quindi le due
// Map crescono monotonicamente per tutta la sessione. Su un gestionale in cui
// la sessione dura giorni e si aprono decine di allegati, è una perdita lenta
// che nessun `signOut` interrompe perché il `signOut` non arriva mai.
//
// Tetto e non TTL-sweep: un `setInterval` di pulizia sarebbe un timer da
// spegnere e una dipendenza dal tempo in un modulo che non ne ha nessun'altra.
// Il tetto pota alla scrittura, cioè esattamente quando la Map cresce, e
// costa un `shift` sull'ordine di inserimento che `Map` garantisce già.
const MAX_VOCI_CACHE = 200;

const memorizza = (cache, path, voce) => {
  // Le scadute prima delle vecchie: sono inutili per definizione, mentre una
  // voce vecchia ma valida può ancora servire.
  if (cache.size >= MAX_VOCI_CACHE) {
    const ora = Date.now();
    for (const [k, v] of cache) if (v.expiresAt <= ora) cache.delete(k);
    while (cache.size >= MAX_VOCI_CACHE) cache.delete(cache.keys().next().value);
  }
  cache.set(path, voce);
};

export const creaSignedUrlGetter = (bucket, cache) => async (path) => {
  if (!path) return { url: null, error: null };
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return { url: cached.url, error: null };
  const supabase = await getSupabase();
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SIGNED_URL_S);
  const url = data?.signedUrl ?? null;
  if (url) memorizza(cache, path, { url, expiresAt: Date.now() + TTL_SIGNED_URL_S * 1000 - MARGINE_SCADENZA_MS });
  return { url, error };
};
```

---

### B-2 · Il totale per cliente ha una controparte esatta

**Dove.** `src/components/liste/ClienteListePanel.jsx:87`.

**Perché.** `ListaDetail.jsx:92` e `listeDocumenti.js:44,71` preferiscono
sempre `saldoEsatto` — la vista `saldi`, che somma in `numeric(12,2)` — e
cadono sul `reduce` in virgola mobile solo come ripiego. Il totale per
cliente non ha quel ripiego: somma i saldi in `Number` e basta. L'errore è
sotto il centesimo per qualunque volume reale (servirebbero importi
sull'ordine di 10¹³), quindi **non è un bug oggi**: è l'unico punto del
modulo denaro in cui il numero mostrato non ha una controparte esatta, e in
un modulo che ha già la regola giusta scritta tre volte, la quarta va scritta
uguale.

```js
// B-2 dell'audit dell'8 settembre. La somma resta in JS, ma arrotondata al
// centesimo come fa `parseImporto` in scrittura (lib/importi.js): è la
// stessa regola alle due estremità del dato, invece che a una sola.
// L'alternativa — una vista `saldi_per_cliente` che sommi in `numeric` —
// è più corretta e più cara: si valuta quando il pannello mostrerà anche
// il dettaglio, non per un totale che oggi è esatto comunque.
const totale = useMemo(
  () => Number(liste.reduce((s, l) => s + Number(saldi[l.id]?.saldo || 0), 0).toFixed(2)),
  [liste, saldi],
);
```

---

### B-3 · Sapere cosa non è coperto

**Dove.** `vite.config.js`, `.github/workflows/ci.yml`.

**Perché.** 2 128 test su 175 file sono molti, e 140 componenti sono
altrettanti: il progetto sa **quanti** test ha e non sa **cosa** non è
coperto. È la stessa famiglia di `A-2` e `M-2` del 23 agosto — un presidio
giusto senza il numero che lo governa — e ha la stessa cura: un ratchet, non
una soglia ambiziosa.

```js
// vite.config.js
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    // B-3 dell'audit dell'8 settembre. Le soglie sono un RATCHET e non un
    // obiettivo: si impostano al valore MISURATO oggi, arrotondato per
    // difetto di un punto, e salgono quando la copertura sale. Una soglia
    // ambiziosa che nessuno raggiunge viene abbassata al primo rosso, ed è
    // il modo in cui un controllo smette di controllare — la stessa
    // argomentazione delle soglie di `verifica:bundle`.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary"],
      include: ["src/**/*.{js,jsx}"],
      exclude: ["src/test/**", "src/state/mockData.js", "src/state/demoState.js"],
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 }, // ← al primo run, sostituire con i valori misurati
    },
  },
```

```yaml
      # B-3: la copertura è un ratchet, non un obiettivo — vedi vite.config.js.
      - run: npm run test:coverage
```

---

## Cosa è stato verificato ed è a posto

Vale la pena scriverlo perché un audit che elenca solo i difetti descrive
male il progetto, e perché la prossima sessione non rifaccia il lavoro.

**Sicurezza**

* **RLS**: 22 tabelle su 22 in `public` con `relrowsecurity = true`. `rate_limit`
  e `private.conversazioni_eliminate` hanno RLS senza policy — è il **divieto**
  (si scrivono solo da funzioni definer), non una dimenticanza, e l'advisor lo
  segnala a livello INFO.
* **Gerarchia dei permessi su tre livelli**: `lib/permissions.js` (puro) ↔
  `guard` dei registry ↔ policy `private.can_*`, con
  `src/test/integration/rls.test.js` a misurare che non divergano — su un
  database vero, con sessioni vere di ogni ruolo.
* **Edge Function**: predicato admin unico e puro (`adminPredicate.ts`,
  testabile da Vitest), rate limit per chiamante nel database, audit su ogni
  operazione distruttiva, errori opachi al chiamante e dettagliati a log con
  un codice che li lega, CORS su allow-list esatta (non un prefisso).
* **Storage**: 3 bucket su 3 privati, tutti con `file_size_limit` e
  `allowed_mime_types`; signed URL con margine di scadenza esplicito.
* **XSS**: nessun `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function`, `document.write` in tutto `src/`. Gli unici `href` dinamici
  sono `mailto:`/`tel:`/`sms:`/`wa.me` con prefisso fisso; i due `window.open`
  passano `noopener`.
* **CSP**: nessuna direttiva permissiva — né `'unsafe-inline'` né
  `'unsafe-eval'`, `object-src 'none'`, `frame-ancestors 'none'`,
  `base-uri 'self'`. Font ospitati con l'app, nessuna terza parte.
* **CSRF**: non applicabile per costruzione — l'autenticazione è un Bearer
  letto da `localStorage`, non un cookie, quindi non viaggia in automatico.
* **Prototype pollution**: il parse XLSX gira in un worker usa-e-getta, le
  chiavi pericolose sono tagliate al confine e `withPrototypePollutionGuard`
  sorveglia il passaggio.

**Architettura e stato**

* Un orchestratore sottile (`VoyageDeskInner`) su sette hook di dominio e sette
  provider annidati in ordine dichiarato e motivato.
* Persistenza **dichiarativa** in tre registry con un contratto comune
  (`state/registroScritture.js`): `guard`, `normalize`, `persist`, `rollback`,
  `mapError`, `entityId`. Nessun `if (error)` scritto a mano.
* «Scrittura riuscita» ha **una** definizione (`lib/esitoScrittura.js`), e
  tiene conto del caso che quasi tutti sbagliano: la RLS non rifiuta, rende
  invisibile — `count === 0`, non `error`.
* L'eco realtime è filtrata per `origin_client`, con l'eccezione dei `DELETE`
  documentata e motivata (là il tag non è l'origine di chi cancella).
* Nessun globale mutabile: i permessi si decidono sullo stesso `state.team`
  che React sta renderizzando, e una regola di lint impedisce il ritorno.

**Performance**

* Budget di bundle in CI su **quattro** percorsi — ingresso, first load
  anonimo, chunk dell'app, first load autenticato — letti dal manifest del
  build, non stimati.
* `lazy()` su 13 punti di montaggio, ciascuno con la sua rete
  (`LazyPanel`/`ViewErrorBoundary`), e il client Supabase pieno dietro un
  `import()` dinamico: chi resta al login non lo scarica mai.
* 181 fra `useMemo`/`useCallback`/`memo`, e `VIETATO_CONTEXT_VALUE_LETTERALE`
  a impedire che un `value` non memoizzato li vanifichi.
* Soglie di volume misurate **contro il database vero** in CI: `messages`
  13/1500, `task_history` 808/5000, `clients` 885/3000, `movimenti_lista`
  6 312/50 000.

**UX ed errori**

* `ErrorBoundary` di primo livello + `ViewErrorBoundary`/`OverlayErrorBoundary`
  su ogni montaggio lazy; handler globali per promise non gestite e chunk
  mancanti.
* Il codice `VD-…` mostrato all'utente **arriva davvero** a
  `public.error_reports` (1 riga in produzione: la catena funziona), leggibile
  dagli admin da `ErrorReportsSection`, con tre difese contro l'abuso.
* Validazione dei form componibile e pura, con il messaggio **sotto il campo**
  e gli attributi ARIA, non un toast in un angolo.
* Tre regole `jsx-a11y` a livello **error** (`click-events-have-key-events`,
  `no-static-element-interactions`, `label-has-associated-control`), a zero
  violazioni.
* Il registro di controllo ha un lettore (`AdminLogTab`), i trigger di audit su
  `clients` (INSERT/UPDATE/DELETE) e `users` (DELETE, privilegi) esistono in
  produzione, e una sonda distingue «non è successo niente» da «ha smesso di
  scrivere» — che è il rilievo con cui `audit_log` a zero righe smette di
  essere ambiguo.

---

## Metodo

Per rendere verificabile ciò che sopra è affermato:

| Superficie | Come |
|---|---|
| Repository | Lettura diretta di ~90 moduli di `src/`, delle 5 Edge Function e dei 7 moduli `_shared`, dei 6 script di verifica e dei 4 workflow |
| Catena di build | `npm ci` (fallito, `A-2`), `npm install`, `npm run lint`, `npm run verifica:tipi`, `npx vitest run`, `npm run verifica:convenzioni` — **eseguiti**, non dedotti |
| Database di produzione | `pg_class`/`pg_policy` su `public` e su `realtime`, `pg_trigger`, `storage.buckets`, advisor di sicurezza, conteggi di volume — via MCP Supabase, **sole letture** |
| Documentazione | I 25 audit precedenti, per non ripetere ciò che è già stato trovato e per riportare con prove nuove solo ciò che è ancora aperto |

Ciò che **non** è stato verificato, e va detto:

* **Gli header HTTP in produzione.** `tullio-seven.vercel.app` non è
  raggiungibile dalla rete di questa sessione (`403` dal proxy di egress): la
  CSP è stata letta da `vercel.json`, non dalla risposta. L'audit del 22
  agosto l'aveva verificata dal vivo e da allora il file non è cambiato.
* **Il comportamento dei canali Realtime dal vivo.** `A-1` è stabilito su
  due fatti verificati — RLS spenta su `realtime.messages`, `private: true`
  assente nel client — e sul contratto documentato di Supabase Realtime, non
  su una sottoscrizione eseguita con il token di un driver. Il caso in
  `rls.test.js` proposto nell'action plan è ciò che lo renderebbe misurato
  invece che dedotto, ed è il motivo per cui è parte della correzione e non
  un di più.
