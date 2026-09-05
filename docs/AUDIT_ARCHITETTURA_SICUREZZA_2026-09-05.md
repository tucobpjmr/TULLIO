# Audit — architettura e sicurezza · 5 settembre 2026

Perimetro completo, i cinque punti richiesti: architettura e struttura del
codice, sicurezza e gestione dei dati, gestione dello stato e flusso dati,
performance e scalabilità, UX/UI e gestione errori.

Condotto — come quello del 4 settembre — **su tre livelli e non su uno**:
il repository, il **database di produzione** (`pg_proc`, `pg_policies`,
`pg_trigger`, `pg_publication`, `pg_class.relreplident`, advisor, dati reali)
e la **catena di build** (`npm ci`, lint, `tsc`, 2.121 test, `vite build`,
`verifica:bundle`, `npm audit`), eseguita per intero in questa sessione.

## Come è stato fatto, e perché conta per leggere i risultati

L'audit del 4 settembre ha chiuso 16 rilievi su 19 fra il 4 e il 5. Questo
documento **non li ricontrolla uno per uno**: li dà per chiusi dove il codice
e il database lo confermano, e cerca altrove. È una scelta di metodo, non di
pigrizia — un audit che ripercorre il perimetro appena battuto trova ciò che è
già stato trovato, e il valore marginale di un ventiduesimo passaggio sulle
stesse aree è vicino a zero.

Le aree scelte sono quelle che **nessuno dei ventuno audit precedenti ha
guardato**:

| Area mai battuta prima | Come è stata guardata |
|---|---|
| La **catena di installazione** (`npm ci`, non `npm run build`) | Eseguita davvero, da questa rete |
| Il **contratto realtime di Supabase su `DELETE`** | `pg_class.relreplident` in produzione + documentazione ufficiale |
| La **navigazione** (URL, history, back del browser) | `grep` su tutto il sorgente: zero `pushState`, zero `popstate` |
| La **capacità offline** della PWA (non la sua *rilevazione*) | `public/sw.js`, 80 righe, nessun handler `fetch` |
| Il **registro di audit come dato**, non come schema | `select count(*) from audit_log` in produzione |
| **Terze parti nel percorso critico** e trasferimento dati | `index.html`, CSP, `vercel.json` |

Quattro dei dodici rilievi qui sotto **non sono visibili leggendo il
sorgente**: uno richiede di eseguire l'installazione, uno di interrogare
`pg_class`, uno di contare le righe di una tabella di produzione, uno di
leggere la documentazione di una piattaforma contro il codice che la usa.

---

## Executive summary

### Valutazione: **9 / 10**

Questo è, senza esagerazione, uno dei repository applicativi meglio tenuti che
si possano leggere. Non è una formula di cortesia, ed è misurabile:

| Misura | Esito, verificato in questa sessione |
|---|---|
| Test | **2.121 passati**, 23 skip, 173 file — nessun fallimento |
| Lint (ESLint 9 flat, regole custom di confine) | **0 errori, 0 warning** |
| `verifica:tipi` (`checkJs` su `lib` + `state` + `hooks`) | **0 errori** |
| `vite build` | riuscita, 17 chunk lazy |
| `verifica:bundle` | first load anonimo **81,41 kB gzip** (soglia 86), autenticato **130,06 kB** (soglia 138) |
| RLS | attiva su **tutte** le tabelle pubblicate in realtime, `rls_active_only` RESTRICTIVE presente |
| XSS | zero `dangerouslySetInnerHTML`/`innerHTML`/`eval`; l'unico sink di HTML grezzo (`listeDocumenti.js`) escapa a mano ogni punto di testo libero |
| CSV injection | `escapeCSV` neutralizza `= + - @ \t \r`, applicata in **4 export su 4** |
| `href` dinamici | 6 occorrenze, **tutte** con schema fisso (`mailto:`/`tel:`/`sms:`/`https://wa.me/`) — nessun `javascript:` possibile |
| Secret nel bundle | solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, pubblici per disegno |

Il rapporto fra test e sorgente è **2.121 test su 39.849 righe non-test in 286
file**; `docs/` porta ventidue audit e un indice che distingue il vigente dallo
storico; ogni decisione non ovvia ha accanto il ragionamento che l'ha prodotta
e — cosa più rara — il **ragionamento sbagliato che l'ha preceduta**.

**Il rischio principale non è più dentro l'applicazione: è ai suoi bordi.**
I due rilievi che questo audit apriva in alta priorità stanno entrambi fuori dal
codice che l'audit del 4 settembre ha esaminato — uno nella catena che
*installa* il progetto, uno in ciò che il progetto *non ha mai avuto*. Il primo
è poi stato **ridimensionato a Media** da una verifica che ha smentito metà del
rilievo (⛔ vedi la correzione dentro `A-1`), e il secondo è stato **chiuso lo
stesso giorno** (✔ vedi «Come è stato chiuso (A-2)» in fondo): non resta
quindi nessun rilievo di alta priorità aperto. Erano questi due:

* `A-1` ⚠️ **ridimensionato ad Alta → Media, e la correzione va letta prima del
  rilievo** — la chiusura di `A-4` del 4 settembre (le due CVE di `xlsx`) ha
  risolto la vulnerabilità e, nello stesso movimento, ha reso **ogni
  installazione del progetto dipendente dalla raggiungibilità di
  `cdn.sheetjs.com`**. In questa sessione `npm ci` è fallito con `403
  Forbidden` su quella URL, ma **non è un guasto in atto**: sul commit di
  questo audit la CI GitHub e il deploy Vercel sono entrambi verdi. È un punto
  singolo di guasto **latente**, con un precedente non ipotetico — l'audit del
  4 settembre descrive il fix «fermo da un mese» per la stessa ragione.
  ⛔ La seconda metà del rilievo, quella che gli valeva l'alta priorità
  («`npm audit` non risolve più la versione e riporta due CVE già corrette»),
  **era sbagliata**: era stata misurata su un lockfile che il mio stesso
  ambiente di prova aveva alterato. Sul lockfile vero `npm audit` dice
  `found 0 vulnerabilities`.
* `A-2` — l'app **non ha URL**. Nessun `pushState`, nessun `popstate`, nessun
  router: `activeView` vive nel reducer e basta. Per un gestionale è la
  funzione mancante più costosa — un manager non può mandare a un agente il
  link di una task, il tasto Indietro di Android chiude la PWA invece di
  tornare alla schermata precedente, e un refresh riporta sempre alla
  dashboard.

Nessuno dei due è un errore di scrittura. Il primo è **il costo collaterale di
una correzione riuscita**, che nessuno ha misurato dopo averla applicata; il
secondo è **una decisione mai presa**, che a 39.849 righe non si è ancora
manifestata come tale.

### Cosa ho verificato senza trovare rilievi

Elenco esplicito, perché «non l'ho trovato» e «non l'ho guardato» sono due
affermazioni diverse e solo la prima ha valore.

| Area | Esito |
|---|---|
| **Realtime su `DELETE`: fuga della riga intera** | ❗ **Cercato apposta, e chiuso.** Sette tabelle sono a `REPLICA IDENTITY FULL` (`tasks`, `messages`, `users`, `notices`, `comments`, `conversations`, `notifications`) e tutte e sette sono nella publication. Supabase **non applica la RLS agli eventi `DELETE`**, quindi con `old` completo un driver riceverebbe il testo di ogni messaggio privato cancellato. Non succede: la documentazione ufficiale dice che *con RLS attiva* il `old` di una `DELETE` è ridotto alla **sola chiave primaria**, e la RLS è attiva su tutte e sette. La difesa non è nel codice del progetto, ma c'è |
| Hijacking di `search_path` sulle `SECURITY DEFINER` | 24 funzioni hanno `search_path=public` invece di `''`. Non sfruttabile: `has_schema_privilege('authenticated','public','CREATE')` è **false** — nessun ruolo applicativo può creare oggetti che le ombreggino |
| Gate `active`/`pending` sulle scritture PII | `rls_active_only` è RESTRICTIVE, `ALL`, con `private.is_active_user()` su USING **e** WITH CHECK: un utente disattivato o mai approvato non scrive su `clients` nemmeno con il ruolo giusto (vedi però `B-1`) |
| RPC distruttive | `reset_completo` e `importa_backup` hanno `private.is_admin()`; le RPC liste `can_liste()`, che include `active AND NOT pending` — letto su `pg_proc.prosrc`, non dedotto |
| `registra_audit` | riservata a `service_role` (`proacl`), come dichiarato: A-2 del 4 settembre è chiuso davvero |
| Le cinque funzioni trigger di audit | `EXECUTE` a `postgres` e `service_role` soltanto: M-3 del 4 settembre è chiuso davvero |
| CSV/formula injection | `FORMULA_TRIGGERS` + apice iniziale, applicata in tutti e quattro gli export; l'export XLSX passa da SheetJS che scrive celle stringa, non formule |
| `javascript:` in `href` | impossibile: tutti e sei gli `href` dinamici hanno lo schema fisso nel template |
| Doppia sessione / token | il client pieno non ha un `GoTrueClient` proprio (opzione `accessToken`); `clientPromise` è un singleton ma legge il token a ogni richiesta, quindi sopravvive correttamente a un cambio utente |
| Race condition sulle scritture | `prendiTurno`/`vinceIlTurno` (il turno lo consuma **chi scrive**, non chi parte) + `isCurrent()` + `MARK_PENDING_WRITE`, con l'ordine fissato da un test |
| Re-render | `state` non arriva più intero alle viste: sette provider separati, ognuno con `useMemo` a dipendenza singola per riferimento, più `memo` sulle viste. `VIETATO_CONTEXT_VALUE_LETTERALE` impedisce la regressione |
| Elenchi lunghi | `useFinestra` su tutte le viste lunghe, con riazzeramento in render (non in `useEffect`) al cambio di filtro |
| Feedback di salvataggio | `useSalvataggio` in 29 file, con il caso «riuscito a metà» esplicito nel contratto (vedi però `B-3`) |
| Error boundary | tre livelli + `unhandledrejection`/`error`/`securitypolicyviolation` + codice `VD-…` che raggiunge `error_reports` |
| Stato «non lo so ancora» | un flag di caricamento **per entità**, che si chiude anche sull'errore, più un terzo stato «questa entità non si è caricata» |
| Rilevazione offline / freschezza realtime | due strisce persistenti e non chiudibili, con colori diversi perché le due condizioni permettono cose diverse (vedi però `M-1`) |

---

## Tabella delle priorità

| ID | Priorità | Rilievo | File / punto |
|---|---|---|---|
| **A-1** | 🟡 Media ⚠️ *ridimensionato da Alta il 5 settembre — la correzione va letta prima del rilievo* | `xlsx` è risolto da un **tarball su `cdn.sheetjs.com`**, non dal registry: ogni `npm ci` — CI, build Vercel, ogni macchina nuova — dipende da una terza parte. Oggi funziona (CI e Vercel verdi sul commit di questo audit) e **in questa sessione è fallito con `403 Forbidden`**: è un punto singolo di guasto **latente**, con un precedente di un mese documentato dal repo stesso. ⛔ La seconda metà del rilievo — «`npm audit` riporta due CVE già corrette» — **era sbagliata**: `npm audit` sul lockfile reale dice `found 0 vulnerabilities`. ⚠️ *Parzialmente chiuso il 5 settembre*: le due voci morte di `ALLOWLIST` sono state tolte; resta da vendorare il tarball | `package.json:30`, `package-lock.json:6316`, `scripts/verifica-audit/index.js`, `.github/workflows/ci.yml` |
| **A-2** ✔ | ~~🔴 Alta~~ **chiuso il 5 settembre** | **L'app non ha URL.** Zero `pushState`/`popstate`/router in 286 file: nessun link condivisibile a una task, a una lista o a un cliente; il tasto Indietro di Android chiude la PWA; il refresh riporta sempre alla dashboard. Il meccanismo di deep-link **esiste già** (`?task=`/`?chat=`) ma viene consumato e cancellato al primo render. **Chiuso**: `src/hooks/useUrlStato.js` — vedi «Come è stato chiuso (A-2)» in fondo | `src/state/reducer.js` (`activeView`), `src/hooks/usePushNavigation.js:31-44`, `vercel.json:2` |
| **M-1** | 🟡 Media | **PWA senza guscio offline.** `public/sw.js` non ha alcun handler `fetch`: l'app gestisce benissimo «vado offline mentre è aperta» (due strisce persistenti) e **non gestisce affatto** «viene aperta da offline» — schermata d'errore del browser, non l'app che spiega | `public/sw.js:2`, `src/main.jsx:22-28` |
| **M-2** | 🟡 Media | **Il registro di audit su `clients` è parziale e non verificabile.** Nessun trigger su `UPDATE` — nome, email, telefono, indirizzo e note di **885 persone esterne al team** si modificano senza traccia; l'`INSERT` registra solo gli import multi-riga (`if v_n > 1`). `audit_log` ha **0 righe** e nulla distingue «non è successo niente di registrabile» da «ha smesso di funzionare» | DB (`audit_clients_insert`, `pg_trigger` su `clients`), `supabase/migrations/20260826214000_audit_log.sql` |
| **M-3** | 🟡 Media | **Google Fonts da CDN di terza parte** in un `<link>` bloccante: l'IP di ogni visitatore raggiunge Google prima di qualunque consenso, i font non sono disponibili offline, e un dominio esterno sta sul percorso critico di rendering di un gestionale che tratta PII di clienti | `index.html:26-31`, `vercel.json:16` (`style-src`/`font-src`) |
| **M-4** | 🟡 Media | **Riportato dal 4 settembre (`M-5`), ancora aperto.** `checkJs` copre `src/lib` + `src/state` + `src/hooks`; `src/components` — **184 file**, la maggioranza del sorgente — resta fuori, e `strict` è `false` | `jsconfig.json:52-56` |
| **M-5** | 🟡 Media | **Riportato dal 4 settembre (`M-8`), ancora aperto.** 335 `style={{…}}` inline dinamici e ~344 costanti a nomi meccanici, nessun design system, nessun tema scuro | `src/styles/`, 15 × `*Styles.js` |
| **B-1** | 🟢 Bassa | `private.can_clienti_scrittura()` e `can_clienti_eliminazione()` — introdotte **ieri** da `B-1` del 4 settembre — sono le uniche `private.can_*` che **non** contengono `active AND NOT pending`: `can_liste()`, `can_use_task_category()`, `can_view_global_queue()` ce l'hanno tutte. Oggi non è sfruttabile (`rls_active_only` le AND-a), ma il nome promette una risposta completa che il corpo non dà | DB (`private.can_clienti_scrittura`, `can_clienti_eliminazione`) |
| **B-2** | 🟢 Bassa | Due punti del codice leggono `payload.old.task_id` su un evento `DELETE`, dove Supabase consegna **solo la chiave primaria**. Oggi entrambi degradano in sicurezza, ma il meccanismo è scritto nei commenti come funzionante e verrà ricopiato | `src/components/tasks/TaskHistoryPanel.jsx:82`, `src/hooks/useAppHydration.js:492` |
| **B-3** | 🟢 Bassa | `ProfileEditor` riscrive a mano le cinque cose che `useSalvataggio` esiste per non far riscrivere, e sul freno al doppio invio usa un `useState` dove l'hook documenta che serve un `ref`: due affermazioni contraddittorie sulla stessa regola, nello stesso repository | `src/components/shell/ProfileEditor.jsx:110,142` vs `src/hooks/useSalvataggio.js:71-77` |
| **B-4** | 🟢 Bassa | `avatarUrlCache` e `signedUrlCache` sono `Map` di modulo mai svuotate: `signOut()` non ricarica la pagina, quindi le signed URL (TTL 1 h) di un utente sopravvivono al login del successivo nella stessa scheda | `src/lib/api/storage.js:18,22`, `src/auth/AuthContext.jsx:277` |
| **B-5** | 🟢 Bassa | `public.send_test_push()` è l'unica porta privilegiata del progetto **senza rate limit**: le quattro Edge Function passano tutte da `entroLimite`, questa no, e ogni chiamata fa partire un Web Push reale | DB (`send_test_push`), `supabase/functions/_shared/rateLimit.ts` |

---

## Action plan — da 9 a 10

### A-1 · L'installazione del progetto dipende da un CDN di terza parte

**Dove.** `package.json:30`, `package-lock.json:6316`,
`scripts/verifica-audit/index.js:33-45`, `.github/workflows/ci.yml`.

**Cosa ho fatto, e cosa è successo.** Ho eseguito `npm install` in questa
sessione, come farebbe chiunque entri nel progetto:

```
npm error code E403
npm error 403 403 Forbidden - GET https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
```

Nessun `node_modules`. Non «lint fallito» o «un test rosso»: **il progetto non
si installa**. Ho potuto eseguire test, lint, tipi e build solo dopo aver
sostituito temporaneamente quella riga con la versione da registry — e l'ho
ripristinata prima di scrivere.

⚠️ **DOVE FUNZIONA, E PERCHÉ IL RILIEVO RESTA.** Va detto subito, perché
cambia come si legge tutto il resto: **oggi la catena funziona**. Il commit che
porta questo documento ha la CI GitHub verde (`npm ci` riuscito, incluso il
download dal CDN) e il deploy Vercel `Ready`. Non è quindi un guasto in atto, e
chi legge «`npm ci` è fallito» senza questo paragrafo si farebbe l'idea
sbagliata: il rilievo non è che il progetto sia rotto, è che **la sua
installabilità dipende da qualcuno che non è il progetto**.

Non è nemmeno la rete di questa sessione a essere esotica. È la stessa classe
di blocco che l'audit del 4 settembre ha descritto per esteso — «il fix è fermo
da un mese perché `cdn.sheetjs.com` risponde 403» — e che ha richiesto un
workflow GitHub Actions una tantum per essere aggirata. La correzione ha
rimosso la CVE e ha lasciato in piedi la **causa**: il pacchetto non è su npm,
e ora ogni `npm ci` del progetto ne dipende.

Chi paga, se e quando il CDN non risponde:

| Chi | Stato oggi | Cosa succede se il CDN non risponde |
|---|---|---|
| CI (`.github/workflows/ci.yml`, primo step `npm ci`) | ✅ verde | Ogni PR rossa, per una ragione che non c'entra con la PR |
| Build Vercel | ✅ `Ready` | **Deploy impossibile** — compresa una correzione urgente |
| Nuovo sviluppatore, o una macchina nuova | ? | Non arriva al primo `npm run dev` |
| Ambienti aziendali con proxy in allow-list | ❌ | `registry.npmjs.org` è quasi sempre ammesso, `cdn.sheetjs.com` quasi mai |
| Questa sessione, il 5 settembre | ❌ `403` | Nessun `node_modules` |

**Perché è Media e non Bassa, pur non essendo un'interruzione.** Due ragioni
— erano tre, e la terza è caduta: vedi la correzione qui sotto.

1. **La probabilità non è nota né controllabile**, e il precedente non è
   ipotetico: SheetJS ha già lasciato il registry npm una volta, ed è quel
   trasloco ad aver creato la situazione. La seconda decisione della stessa
   organizzazione avrebbe lo stesso effetto, senza preavviso.
2. **Il guasto arriverebbe nel momento peggiore.** Un build che non parte è
   tollerabile di martedì; non lo è quando serve deployare una correzione
   urgente, ed è esattamente allora che si scopre di dipendere da un terzo.

Il rimedio costa quindici minuti e 1,1 MB nel repository, e non ha
controindicazioni: è il rapporto costo/rischio a tenerlo sopra la bassa
priorità, non un danno in corso.

### ⛔ Una correzione a questo stesso rilievo, e come è stata trovata

La prima stesura di `A-1` aveva una **seconda metà, ed era sbagliata**. Diceva
che `npm audit` non riesce più a risolvere la versione di `xlsx` (`range: "*"`)
e che `verifica:audit` riporta perciò in permanenza due CVE già corrette,
assorbendole con una motivazione ora falsa. Su quella metà `A-1` era
classificato **alta priorità**.

**Non è vero, ed è stato smentito dalla misura più semplice possibile:**

```
$ npm audit --omit=dev --package-lock-only
found 0 vulnerabilities
```

Il lockfile registra `"version": "0.20.3"` accanto alla URL del CDN, e npm la
confronta con il database degli advisory esattamente come farebbe per un
pacchetto del registry. Nessuna CVE riportata, nessuna voce stampata da
`verifica:audit`, nessuna affermazione falsa in CI.

**Come era nato l'errore**, perché conta più della correzione: per eseguire la
suite in un ambiente dove `cdn.sheetjs.com` è bloccato, avevo sostituito
temporaneamente `xlsx` con la versione da registry (`0.18.5`) — e quel
`npm install` aveva **riscritto il lockfile**. La prova su `npm audit` è stata
fatta dopo, con il `package.json` originale ripristinato ma il **lockfile
ancora modificato**: npm vedeva `xlsx@0.18.5` dal registry e riportava
correttamente le due CVE. Ho letto quel risultato come una proprietà del
progetto mentre era una proprietà del mio ambiente di misura.

È lo stesso errore di metodo che questo documento attribuisce altrove — misurare
un livello e concludere su un altro — commesso qui dallo strumento che li
misurava. Il rimedio non è «stare più attenti»: è che una misura fatta su uno
stato alterato va rifatta sullo stato vero prima di entrare in un documento, e
`--package-lock-only` su una copia pulita del repository è il modo per farlo.

**Cosa resta di vero, ed è la sola metà del rilievo:** l'installazione dipende
da un CDN di terza parte. Per questo `A-1` è **Media** e non Alta: manca la
metà che era «già vera adesso», e ciò che resta è un rischio latente su un
evento che oggi non si sta verificando.

**Una cosa piccola c'era davvero**, ed è stata chiusa il 5 settembre: le due
voci di `ALLOWLIST` in `scripts/verifica-audit/index.js` descrivevano CVE
ormai corrette con la frase «nessun fix su npm … Mitigata». Non venivano mai
stampate — nessun advisory le raggiungeva — quindi non ingannavano nessun
lettore della CI; erano però **eccezioni per un rischio che non esiste più**,
e finché restavano un ritorno a una `xlsx` vulnerabile (un rollback, un merge
sbagliato, un lockfile rigenerato male) sarebbe passato in silenzio, assorbito
da loro. Sono state tolte, e l'elenco è ora vuoto: verificato per mutazione —
con `xlsx@0.18.5` nel lockfile il gate esce **1** e nomina i due GHSA, dove
prima sarebbe uscito 0.

**La soluzione: vendorare il tarball, non ri-scaricarlo.** Il file è già in
cache locale con il suo `integrity` sha512 nel lockfile. Portarlo dentro il
repository lo rende parte del codice sorgente: nessuna rete al momento
dell'installazione, nessuna terza parte, e la stessa identica immutabilità che
oggi garantisce l'hash.

```bash
# Una volta sola, da un ambiente che raggiunge il CDN (o dalla cache npm):
mkdir -p vendor
curl -fsSL https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz -o vendor/xlsx-0.20.3.tgz

# Verifica che sia BIT PER BIT quello che il lockfile già attesta — non
# "un file dal nome giusto": l'integrity nel lockfile è la fonte, non il nome.
node -e "
const {createHash}=require('crypto'), fs=require('fs');
const atteso=require('./package-lock.json').packages['node_modules/xlsx'].integrity;
const ottenuto='sha512-'+createHash('sha512').update(fs.readFileSync('vendor/xlsx-0.20.3.tgz')).digest('base64');
if (ottenuto!==atteso) { console.error('DIVERSO\n atteso:   '+atteso+'\n ottenuto: '+ottenuto); process.exit(1); }
console.log('integrity coincide con il lockfile:', ottenuto);
"
```

```diff
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
-   "xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"
+   "xlsx": "file:vendor/xlsx-0.20.3.tgz"
  }
```

Poi `npm install` per riscrivere il lockfile, e `.gitignore` va lasciato in
pace: `vendor/` **deve** essere versionato — è il punto.

> ⚠️ Il tarball è ~1,1 MB. È il prezzo dichiarato: un megabyte nel repository
> in cambio di un'installazione che non dipende da nessuno. La stessa scelta
> che il progetto ha già fatto altrove — elencare gli host uno per uno invece
> di descriverli con un pattern — applicata alle dipendenze.

**L'allow-list è già stata sistemata**, il 5 settembre, e in senso opposto a
quello che questo rilievo proponeva nella sua prima stesura: le due voci non
sono state riscritte con una motivazione nuova, sono state **tolte**, e
`ALLOWLIST` è ora `{}`. Il ragionamento sta nel preambolo di
`scripts/verifica-audit/index.js`; qui basta la parte che si verifica:

```
# con il lockfile di oggi (xlsx@0.20.3)
$ npm run verifica:audit
verifica:audit: OK — nessuna advisory high/critical fuori allow-list.

# per mutazione, con xlsx@0.18.5 nel lockfile
$ npm audit --omit=dev --json | node scripts/verifica-audit/index.js
verifica:audit: advisory high/critical NON nell'allow-list:
  GHSA-4R6H-8V6P-XVW6 (xlsx, high) — Prototype Pollution in sheetJS
  GHSA-5PGG-2G8V-P4X9 (xlsx, high) — SheetJS ReDoS
$ echo $?
1
```

La seconda metà della prova è quella che conta: con le voci in elenco quel
comando sarebbe uscito **0**. Un rientro a una `xlsx` vulnerabile passava in
silenzio, ed è ciò che smette di succedere.

**La verifica che rende il rilievo chiuso e non solo corretto** — e va fatta
da un ambiente **senza accesso al CDN**, che è la condizione in cui il difetto
si manifesta:

```bash
rm -rf node_modules
npm ci          # deve riuscire senza toccare cdn.sheetjs.com
npm test && npm run lint && npm run verifica:tipi && npm run build
npm run verifica:audit   # resta verde: l'elenco delle eccezioni è vuoto
```

**Cosa non va fatto.** Rimettere le due voci nell'allow-list «per sicurezza»
— la prima stesura di questo rilievo lo consigliava, sulla premessa sbagliata
di cui sopra, ed è il contrario di ciò che serve: un'eccezione per una CVE
corretta non protegge da nulla e nasconde il caso in cui quella CVE torna.
E non va tolto `withPrototypePollutionGuard`: non è un ripiego in attesa del
fix, è difesa in profondità su un parser che legge file di terzi.

---

### A-2 · L'app non ha URL

**Dove.** `src/state/reducer.js` (`activeView`), `src/hooks/usePushNavigation.js:31-44`,
`vercel.json:2`.

**Cosa ho verificato.** Un `grep` su 286 file:

```
pushState   → 1 occorrenza,  in usePushNavigation.js, e serve a CANCELLARE l'URL
popstate    → 0
react-router→ 0 (nessuna dipendenza di routing, per scelta)
```

`vercel.json` riscrive `/(.*)` su `/`, quindi qualunque path serve la stessa
pagina; `activeView` vive nel reducer e nessuno lo riflette nella barra degli
indirizzi.

**Perché è di alta priorità in un gestionale.** Non è un difetto di eleganza
architetturale. Sono quattro cose che l'utente non può fare:

1. **Mandare un link.** «Guarda questa pratica» è l'atto più comune fra un
   manager e un agente. Oggi la risposta è «apri l'app, vai in Archivio, cerca
   Rossi, la terza». L'app ha una chat interna e un sistema di menzioni, cioè
   ha già costruito tutto il contesto in cui un link servirebbe, e non può
   produrne uno.
2. **Tornare indietro.** Su Android e sulla PWA installata, il tasto Indietro
   non ha uno stack da svuotare: **chiude l'applicazione**. Da una slide-over
   aperta, da una lista, da qualunque punto.
3. **Ricaricare senza perdere il posto.** Un refresh — o il ripristino di una
   scheda dopo che il sistema ha liberato memoria, cosa che iOS fa spesso —
   riporta alla dashboard.
4. **Aprire due cose in due schede.** Confrontare due liste affiancate è
   impossibile.

**Perché il costo di correggerlo è basso.** Metà del lavoro **è già scritta**:
`usePushNavigation` legge `?task=` e `?chat=`, li applica e li rimuove. Manca
il verso opposto — scriverli — e l'ascolto di `popstate`. Non serve un router:
serve un hook che tenga sincronizzati tre valori dello stato con la query
string.

```js
// src/hooks/useUrlStato.js — NUOVO
//
// A-2 dell'audit del 5 settembre. Il ponte fra `activeView`/`selectedTask`/
// `listeTarget` e la barra degli indirizzi, nei DUE versi.
//
// PERCHÉ NON UN ROUTER. Il progetto ha una dipendenza runtime sola oltre a
// React e supabase-js, ed è una scelta dichiarata. Qui non c'è niente da
// risolvere che giustifichi la seconda: le viste sono nove, non c'è
// annidamento, non ci sono parametri di path. Serve la History API e basta.
//
// ⚠️ L'ORDINE DEI DUE EFFETTI NON È INDIFFERENTE. Lo stato è la fonte di
// verità e l'URL ne è il RIFLESSO: l'effetto che scrive l'URL non deve poter
// innescare quello che lo legge, o due navigazioni ravvicinate si
// rincorrerebbero. `popstate` scatta SOLO sulla navigazione dell'utente
// (avanti/indietro) e mai su `pushState`/`replaceState`, quindi il ciclo non
// si chiude da sé — ma solo perché usiamo la History API e non l'hash.
import { useEffect, useRef } from "react";

/** Lo stato navigabile, nella forma in cui vive nell'URL. */
const daUrl = (search) => {
  const p = new URLSearchParams(search);
  return {
    view: p.get("v") || "dashboard",
    task: p.get("task") || null,
    lista: p.get("lista") || null,
  };
};

const aUrl = ({ view, task, lista }) => {
  const p = new URLSearchParams();
  // La dashboard è il default: non si scrive, così `/` resta `/`.
  if (view && view !== "dashboard") p.set("v", view);
  if (task) p.set("task", task);
  if (lista) p.set("lista", lista);
  const qs = p.toString();
  return window.location.pathname + (qs ? `?${qs}` : "");
};

export function useUrlStato({ activeView, selectedTaskId, listaApertaId, dispatch }) {
  const ultimo = useRef(null);

  // STATO → URL. `replaceState` per il primo allineamento (non deve creare una
  // voce di cronologia che nessuno ha chiesto), `pushState` per i cambi veri:
  // è la differenza fra "l'app si è avviata su questa vista" e "l'utente ci è
  // andato", e solo la seconda deve essere annullabile con Indietro.
  useEffect(() => {
    const url = aUrl({ view: activeView, task: selectedTaskId, lista: listaApertaId });
    if (url === ultimo.current) return;
    const primo = ultimo.current === null;
    ultimo.current = url;
    window.history[primo ? "replaceState" : "pushState"]({ vd: true }, "", url);
  }, [activeView, selectedTaskId, listaApertaId]);

  // URL → STATO. Solo su navigazione dell'utente.
  useEffect(() => {
    const onPop = () => {
      const s = daUrl(window.location.search);
      // `ultimo` si aggiorna QUI e non nell'effetto sopra: senza, il dispatch
      // che segue rientrerebbe nel primo effetto, che troverebbe l'URL già
      // cambiato e farebbe un pushState di ciò che l'utente ha appena
      // annullato — il tasto Indietro non funzionerebbe.
      ultimo.current = aUrl(s);
      dispatch({ type: "SET_VIEW", payload: s.view, ...(s.lista ? { lista: s.lista } : {}) });
      dispatch({ type: "SET_SELECTED_TASK", payload: s.task });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [dispatch]);
}
```

Il montaggio va accanto agli altri hook di orchestrazione in
`VoyageDeskInner.jsx`, e `usePushNavigation` **non va toccata**: continua a
consumare `?task=`/`?chat=` all'avvio a freddo, e questo hook riscrive subito
dopo la forma canonica.

> ⚠️ **Due dettagli che decidono se funziona davvero.**
> **(1)** `SET_VIEW` e `SET_SELECTED_TASK` passano già dai permessi
> (`canAccessAdmin`, `canAccessListe`, `canViewTask`): un URL costruito a mano
> verso una vista vietata produce il toast di rifiuto e non la vista, **senza
> aggiungere un solo controllo**. È il motivo per cui questo hook può
> dispatchare senza filtrare: la barriera esiste già, e sta nel posto giusto.
> **(2)** L'id di una task in URL non è un segreto e non deve diventarlo: la
> RLS decide cosa si vede, non l'ignoranza dell'id. Vale la pena scriverlo
> accanto all'hook, perché il dubbio verrà.

**Test di regressione, in `src/test/hooks/`:**

```jsx
it("Indietro dopo un cambio vista riporta alla vista precedente", async () => {
  // dashboard → liste → Indietro → dashboard, verificando lo STATO e non l'URL:
  // l'URL è il riflesso, e un test che guarda solo lui passerebbe anche se il
  // reducer non seguisse.
});
it("un URL verso una vista vietata non la monta e alza il toast di rifiuto", () => {
  // ?v=admin con un profilo agent → activeView resta dashboard, un toast error.
});
```

**Cosa non va fatto.** Mettere in URL lo stato *effimero* — filtri, ricerca,
tab aperta, finestra di `useFinestra`. Sono valori che cambiano a ogni tasto
premuto: finirebbero nella cronologia e renderebbero il tasto Indietro
inutilizzabile, che è il difetto opposto a quello che stiamo chiudendo.

---

### M-1 · La PWA gestisce «va offline», non «è offline»

**Dove.** `public/sw.js:2`, `src/main.jsx:22-28`.

**Cosa c'è, e cosa manca.** Il service worker dichiara la propria scelta in
riga 2: *«Nessun handler fetch: niente caching»*. È registrato solo per le Web
Push. Il risultato sono due comportamenti molto diversi:

| Situazione | Cosa vede l'utente oggi |
|---|---|
| L'app è aperta e la rete cade | ✅ Striscia rossa persistente, non chiudibile, che spiega che le scritture falliranno. **Fatto benissimo** |
| L'app è chiusa e la rete è giù, l'utente tocca l'icona sulla home | ❌ La schermata d'errore del browser |

La seconda è la situazione normale di un agente in mobilità: metropolitana,
ascensore, aeroporto, roaming. E l'app è *installabile* — `display: standalone`,
icone maskable, `apple-mobile-web-app-capable` — cioè si presenta come
un'applicazione, e un'applicazione che non si apre senza rete non è quello che
l'icona sulla home promette.

**La soluzione minima che risolve il caso vero.** Non serve la sincronizzazione
offline (sarebbe un progetto a sé, con conflitti da risolvere e nessuna
richiesta di prodotto dietro). Serve che **il guscio si apra**, così la
striscia rossa già esistente possa fare il suo lavoro.

```js
// public/sw.js — in coda a quello che c'è
//
// ─── M-1 dell'audit del 5 settembre · IL GUSCIO SI APRE ANCHE DA OFFLINE ───
//
// ⛔ NON è caching dei DATI, e la distinzione è tutto il rilievo. Mettere in
// cache le risposte di Supabase significherebbe mostrare task e saldi vecchi
// senza poter dire quanto: l'app ha costruito due strisce persistenti proprio
// per non farlo mai. Qui si mette in cache SOLO il guscio — HTML, JS, CSS,
// font, icone — cioè le cose che non parlano dei dati di nessuno.
//
// Il risultato è che da offline si apre l'app CON la sua striscia rossa,
// invece della schermata d'errore del browser. È lo stesso messaggio che
// l'app dà già quando la rete cade mentre è aperta: qui smette di dipendere
// dall'essere già aperta.
const GUSCIO = 'vd-guscio-v1';

// Precache del solo `/`: gli asset con hash entrano in cache alla prima
// visita (stale-while-revalidate qui sotto) e cambiano nome a ogni deploy,
// quindi elencarli qui li farebbe scadere a ogni build.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(GUSCIO).then((c) => c.add('/')).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((k) => Promise.all(k.filter((n) => n !== GUSCIO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  // ⛔ Supabase NON passa di qui, mai. È la riga che tiene separato "il guscio
  // si apre" da "i dati sono vecchi e non te lo dico".
  if (url.origin !== self.location.origin) return;

  // La navigazione: rete prima (un deploy nuovo deve arrivare subito), guscio
  // in cache come rete di sicurezza. `vercel.json` riscrive già ogni path su
  // `/`, quindi `/` è la risposta giusta per qualunque navigazione.
  if (request.mode === 'navigate') {
    e.respondWith(fetch(request).catch(() => caches.match('/')));
    return;
  }

  // Gli asset con hash nel nome: cache prima, aggiornamento in sottofondo.
  // Il nome cambia a ogni build, quindi non c'è versione vecchia da servire
  // per sbaglio — è il contratto del filename hashing di Vite.
  e.respondWith(
    caches.match(request).then((hit) => {
      const rete = fetch(request).then((res) => {
        if (res.ok) caches.open(GUSCIO).then((c) => c.put(request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || rete;
    })
  );
});
```

> ⚠️ **Da verificare con la scheda aperta durante un deploy**, che è il caso in
> cui questo codice può fare danni: `skipWaiting()` + `clients.claim()`
> attivano subito il worker nuovo, e un chunk lazy servito dalla cache vecchia
> insieme a un `index.html` nuovo produce un 404 su `import()`. La rete di
> sicurezza **esiste già** (`OverlayErrorBoundary` intorno a ogni `lazy()`,
> A-1 del 16 agosto), quindi il guasto è recuperabile — ma va provato, non
> dedotto: `npm run build`, `npm run preview`, DevTools → Network → Offline,
> ricarica, e poi un secondo build con la scheda aperta.

---

### M-2 · Il registro di audit non copre le modifiche ai dati delle persone, e nessuno se ne accorgerebbe

**Dove.** DB: `audit_clients_insert`, `pg_trigger` su `public.clients`;
`supabase/migrations/20260826214000_audit_log.sql`.

**Cosa ho misurato in produzione.**

```sql
select count(*) from public.audit_log;                    -- 0
select count(*) from public.clients;                      -- 885
select count(*) from public.clients where created_at > '2026-08-26';  -- 5
```

Cinque clienti creati **dopo** l'installazione dei trigger, e il registro è
vuoto. Non è un guasto: il trigger dice

```sql
select count(*) into v_n from nuove;
if v_n > 1 then perform private.audit('clienti.import', 'clients', null, …); end if;
```

cioè registra **solo gli import multi-riga**. Cinque inserimenti singoli non
lasciano traccia perché è così che è scritto.

**I due problemi, che sono distinti.**

**(1) La copertura.** Su `clients` ci sono due trigger — `INSERT` (solo bulk) e
`DELETE`. **Non c'è `UPDATE`.** Quella tabella contiene `name, email, phone,
address, city, notes` di **885 persone che non sono utenti dell'applicazione**:
sono i clienti dell'agenzia. Chi cambia l'email di un cliente, chi riscrive le
note, chi corregge un indirizzo non lascia altro che `updated_at`, che dice
*quando* e non *chi* né *cosa prima*. Per un dato personale di terzi è la
domanda che si finisce per dover rispondere — a un cliente che chiede, o dopo
un errore da ricostruire — e oggi non ha risposta.

Che sia una lacuna e non una scelta lo dice il progetto stesso: `tasks` ha
`log_task_history` su ogni `UPDATE` con il valore prima e dopo, e `liste_viaggio`
ha `lista_history` scritta nella **stessa transazione** della modifica. La
tabella con i dati personali è l'unica delle tre senza.

**(2) Non si può distinguere il silenzio dal guasto.** `audit_log` a zero righe
è compatibile con «nessuno ha fatto niente di registrabile» e con «i trigger
non scrivono più». Il progetto ha sette script di verifica e nessuno guarda
questo. È la stessa forma di `M-3` del 4 settembre — cinque WARN permanenti sono
il modo in cui il sesto passa inosservato — con lo zero al posto del WARN.

**La correzione, in due migrazioni separate perché sono due decisioni.**

```sql
-- supabase/migrations/2026090?######_audit_clients_update.sql
--
-- M-2 dell'audit del 5 settembre. `clients` è l'unica delle tre entità
-- storicizzate senza traccia sulle MODIFICHE, ed è quella con i dati personali
-- di 885 persone esterne al team.
--
-- ⚠️ IL REGISTRO NON PORTA PII, e questa è la regola che tiene il rimedio dal
-- diventare il problema. `audit_log.details` registra QUALI CAMPI sono
-- cambiati, mai i valori: un registro che copiasse la vecchia email accanto
-- alla nuova duplicherebbe il dato personale in una tabella con una
-- retention diversa e una policy diversa — cioè peggiorerebbe esattamente la
-- cosa che vuole proteggere. Chi ha bisogno del valore precedente ha
-- `updated_at` e un backup; chi indaga ha bisogno di sapere chi e quando.
create or replace function public.audit_clients_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_campi text[] := '{}';
begin
  if new.name    is distinct from old.name    then v_campi := v_campi || 'name';    end if;
  if new.email   is distinct from old.email   then v_campi := v_campi || 'email';   end if;
  if new.phone   is distinct from old.phone   then v_campi := v_campi || 'phone';   end if;
  if new.address is distinct from old.address then v_campi := v_campi || 'address'; end if;
  if new.city    is distinct from old.city    then v_campi := v_campi || 'city';    end if;
  if new.notes   is distinct from old.notes   then v_campi := v_campi || 'notes';   end if;
  if array_length(v_campi, 1) is not null then
    perform private.audit('cliente.modificato', 'client', new.id::text,
                          jsonb_build_object('campi', to_jsonb(v_campi)));
  end if;
  return null;
end $$;

-- La revoca è parte della migrazione, non un passo successivo: M-3 del 4
-- settembre è nato dalle cinque funzioni trigger create senza.
revoke execute on function public.audit_clients_update() from public, anon, authenticated;

create trigger trg_audit_clients_update
  after update on public.clients
  for each row execute function public.audit_clients_update();
```

E il presidio che rende il silenzio interpretabile — una **sonda**, non un
conteggio, perché contare le righe direbbe solo che finora è successo qualcosa:

```js
// scripts/verifica-audit-vivo/index.js — NUOVO
//
// M-2 dell'audit del 5 settembre. `audit_log` a zero righe è compatibile con
// «non è successo niente di registrabile» e con «i trigger hanno smesso di
// scrivere», e il progetto non ha modo di distinguerle. Questa sonda le
// distingue: scrive davvero e annulla, come fa già verifica-rpc/sonda.js.
//
// ⚠️ IN TRANSAZIONE, SEMPRE. Il punto non è il cliente di prova — è che una
// verifica che lascia residui in una tabella di audit ha inquinato la cosa
// che stava verificando. La transazione è il controllo, non una cortesia.
//
//   begin;
//     insert into clients (name) values ('__sonda_audit__') returning id;
//     update clients set notes = '__sonda__' where id = <id>;
//     select count(*) from audit_log where action = 'cliente.modificato'
//                                      and target_id = <id>::text;  -- deve essere 1
//   rollback;
//
// Esce 1 se il conteggio non è 1: significa che il trigger non ha scritto, e
// da quel momento lo zero di audit_log ha una spiegazione sola.
```

Da agganciare in `.github/workflows/rls.yml`, che ha già le credenziali e il
database di staging.

---

### M-3 · I font arrivano da un terzo, sul percorso critico

**Dove.** `index.html:26-31`, `vercel.json:16`.

**Cosa succede oggi.** Un `<link rel="stylesheet">` bloccante verso
`fonts.googleapis.com`, più i file da `fonts.gstatic.com`. La CSP li ammette
esplicitamente, e il commento in `index.html` spiega — correttamente — perché
un `<link>` batte un `@import`: è ottimizzazione riuscita del percorso
*sbagliato*.

**Tre conseguenze, di peso diverso.**

1. **Trasferimento verso un terzo.** L'IP di ogni visitatore raggiunge Google
   prima che l'utente abbia fatto qualunque cosa. Per un gestionale italiano
   che tratta dati personali di 885 clienti non è una questione teorica: il
   caso più noto (LG München I, 20.01.2022, 3 O 17493/20) riguarda esattamente
   questo — font di Google caricati dal CDN invece che dal server. Non sono un
   legale e questo documento non è un parere legale; è però una situazione
   nota, e ha una correzione tecnica di quindici minuti.
2. **Offline.** Con `M-1` chiuso, l'app si aprirebbe senza rete **con i font
   di sistema**, cioè con un aspetto diverso da quello che ha sempre. I font
   ospitati in proprio entrano nella cache del guscio come tutto il resto.
3. **Percorso critico.** Un dominio esterno in più significa un DNS + TLS in
   più prima del primo testo disegnato. I `preconnect` lo attenuano; toglierlo
   lo elimina.

**La correzione.**

```bash
# I tre famiglie usate: Playfair Display, DM Sans, Inter.
npx google-webfonts-helper …   # oppure scaricare i woff2 a mano
# → public/fonts/*.woff2  (solo woff2: ogni browser che l'app supporta lo legge)
```

```diff
--- index.html
-    <link rel="preconnect" href="https://fonts.googleapis.com" />
-    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
-    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=…" />
+    <!-- M-3 dell'audit del 5 settembre: i font sono ospitati con l'app.
+         Il <link> a fonts.googleapis.com era un'ottimizzazione riuscita (il
+         preload scanner lo vede prima di <body>, a differenza di un @import)
+         su una scelta da rivedere: mandava l'IP di ogni visitatore a un
+         terzo prima di qualunque interazione, teneva un dominio esterno sul
+         percorso critico e — da quando il service worker mette in cache il
+         guscio (M-1) — sarebbe stata l'unica risorsa a mancare da offline.
+         `preload` sulle due sole facce del primo paint: le altre arrivano
+         quando servono. -->
+    <link rel="preload" href="/fonts/dm-sans-400.woff2" as="font" type="font/woff2" crossorigin />
+    <link rel="preload" href="/fonts/playfair-display-600.woff2" as="font" type="font/woff2" crossorigin />
```

```css
/* src/styles/global.css, in testa */
@font-face {
  font-family: 'DM Sans';
  src: url('/fonts/dm-sans-400.woff2') format('woff2');
  font-weight: 400; font-style: normal;
  /* `swap`: il testo si legge con il fallback e cambia faccia quando il font
     arriva. È la stessa scelta del `&display=swap` che c'era nella URL di
     Google — va riportata a mano, altrimenti si perde nel trasloco. */
  font-display: swap;
}
/* …una regola per faccia effettivamente usata, non per ogni peso disponibile */
```

E la CSP si **restringe**, che è il segno che la correzione è strutturale e non
un trasloco:

```diff
- "style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; …"
+ "style-src 'self'; font-src 'self'; …"
```

> ⚠️ **Le licenze vanno con i file.** Playfair Display, DM Sans e Inter sono
> tutti sotto SIL Open Font License 1.1, che permette l'hosting proprio e
> **richiede** che la licenza accompagni i file: `public/fonts/OFL.txt`, una
> volta, per tutti e tre.

---

### M-4 · `checkJs` non copre `src/components` — 184 file

**Riportato dal 4 settembre (`M-5`), avanzato di un passo su tre.**

`jsconfig.json` include `src/lib`, `src/state` e — da ieri — `src/hooks`.
Restano fuori `src/components`: **184 file**, la maggioranza del sorgente e
l'unica parte che nessuno dei due controlli automatici raggiunge (`checkJs`
non la guarda, e i test la coprono per comportamento, non per forma).

La regola del progetto è giusta e va tenuta: si allarga quando la cartella
nuova è a zero, non prima. Il passo successivo non è però `src/components`
intero — è un salto di scala, e allargare tutto insieme produce un elenco di
errori che nessuno chiude in una sessione. La strada è per **sottocartella**,
partendo da quelle che il resto dell'app importa di più:

```jsonc
"include": [
  "src/lib/**/*.js",
  "src/state/**/*.js",
  "src/hooks/**/*.js",
  // M-4 dell'audit del 5 settembre, passo 1 di N. `ui/` per prima e non per
  // dimensione: è la cartella che TUTTE le altre importano, quindi un tipo
  // sbagliato lì si propaga ovunque, e i suoi componenti hanno le firme più
  // stabili del progetto — cioè il rapporto migliore fra errori trovati e
  // JSDoc da scrivere.
  "src/components/ui/**/*.jsx"
]
```

`strict: true` resta l'ultimo passo, dopo l'ultima cartella: attivarlo prima
significherebbe pagare `strictNullChecks` su codice che non è ancora annotato.

---

### M-5 · Il sistema di stili

**Riportato dal 4 settembre (`M-8`), invariato.**

335 `style={{…}}` inline dinamici, ~344 costanti a nomi meccanici
(`boxF125Warning`, `rowCenterBetween4`), nessun design system, nessun tema
scuro. Il progetto ha già una regola di lint che vieta i nomi con suffisso di
collisione e una che confronta le forme per valore, quindi il debito non
cresce in silenzio.

**Resta la stessa raccomandazione del 4 settembre, e vale la pena ribadirla
invece di riaprire il rilievo: non va aggredito senza una ragione di
prodotto.** Un refactoring di 344 costanti tocca ogni file dell'interfaccia
senza cambiare una riga di comportamento — cioè massimo rischio di
regressione visiva e zero valore osservabile — a meno che non lo si faccia
*per* qualcosa: il tema scuro, o un cambio di identità visiva. Quando quella
ragione esiste, il tema scuro è il vettore giusto, perché costringe a
separare il colore dalla forma, che è la metà utile del lavoro.

---

### Rilievi di bassa priorità

#### B-1 · Le due `can_clienti_*` sono le uniche a non dire tutto

`private.can_clienti_scrittura()` e `can_clienti_eliminazione()`, introdotte
**ieri** da `B-1` del 4 settembre, guardano solo il ruolo:

```sql
select exists (select 1 from public.users
               where id = (select auth.uid()) and role = any (array['admin','manager','agent']));
```

Le altre tre `private.can_*` dello stesso schema hanno tutte
`active AND coalesce(pending,false) = false` nel corpo — `can_liste()`,
`can_use_task_category()`, `can_view_global_queue()` — e così `is_admin()` e
`is_active_user()`.

**Non è sfruttabile oggi**, e l'ho verificato invece di dedurlo: su `clients`
c'è `rls_active_only`, RESTRICTIVE, `ALL`, con `private.is_active_user()` su
USING **e** WITH CHECK. Un utente disattivato o `pending` non passa.

Ma il rilievo che ha creato queste funzioni diceva che «rispecchiano
`canEditClient`/`canDeleteClient` già in `permissions.js`», e quelle due
controllano `active`/`pending` in linea (`permissions.js:274`). Le due metà
non si rispecchiano: coincidono solo grazie a una **terza** policy. Il nome
`can_clienti_scrittura` promette una risposta completa, e il primo riuso fuori
da `clients` — una RPC, una Edge Function, una tabella nuova — la otterebbe
incompleta credendo di avere il gate standard del progetto. È la stessa forma
di `requireActiveAdmin`, nata perché «il controllo precedente guardava il solo
`role`».

```sql
create or replace function private.can_clienti_scrittura()
returns boolean language sql stable security definer set search_path = public as $$
  -- B-1 dell'audit del 5 settembre. `active AND NOT pending` era delegato a
  -- `rls_active_only`, ed è vero che su `clients` quella policy c'è. Ma
  -- questa funzione ha un NOME che promette il verdetto intero, ed è l'unica
  -- `can_*` del progetto a non darlo: il primo call site fuori da `clients`
  -- avrebbe un gate di solo ruolo credendo di avere quello standard.
  -- Ridondante con la policy restrittiva, di proposito: la difesa in
  -- profondità è ridondanza che si dichiara.
  select exists (
    select 1 from public.users
    where id = (select auth.uid())
      and active and coalesce(pending, false) = false
      and role = any (array['admin','manager','agent'])
  );
$$;
-- idem per can_clienti_eliminazione(), con array['admin','manager']
```

Da verificare come il 5 settembre ha verificato le sue: **scrivendo davvero**,
impersonando un agent attivo (deve passare) e un agent `pending` (non deve),
non rileggendo la policy.

#### B-2 · `payload.old` su `DELETE` porta solo la chiave primaria

Documentazione Supabase, alla lettera:

> *«RLS policies are not applied to `DELETE` statements… When RLS is enabled
> and `replica identity` is set to `full` on a table, the `old` record contains
> only the primary key(s).»*

Due punti del codice sono scritti — e commentati — come se non fosse così:

* `TaskHistoryPanel.jsx:82`
  `filterEvent: (payload) => payload?.new?.task_id === taskId || payload?.old?.task_id === taskId`
  con sopra *«Il pre-image `payload.old` serve alle DELETE (purge di un task),
  dove `payload.new` è vuoto»*. `payload.old.task_id` è **sempre** `undefined`:
  il ramo che il commento descrive non si esegue mai.
* `useAppHydration.js:492`
  `const tid = payload.new?.task_id ?? payload.old?.task_id;` per gli eventi
  `comments`, con *«`old` oltre a `new` perché su una DELETE la riga arriva
  solo lì»*.

**Nessuno dei due produce un guasto oggi**, ed è giusto dirlo con la stessa
precisione con cui si dice il difetto: il secondo ha un fallback dichiarato sul
corpus, e `Comments.remove` non ha chiamanti (le `comments` spariscono solo per
cascata da un purge, che porta con sé gli eventi su `tasks` e quindi il reload
completo comunque). Il primo riguarda un pannello aperto su una task che
qualcun altro sta purgando.

Il valore della correzione è che **il meccanismo è scritto come funzionante in
due punti e verrà ricopiato**. Va sostituito con ciò che il pre-image porta
davvero — la chiave primaria — o tolto dicendo perché:

```js
// TaskHistoryPanel.jsx
filterEvent: (payload) => {
  // B-2 dell'audit del 5 settembre. `payload.old.task_id` NON esiste: su una
  // DELETE Supabase riduce il pre-image alla sola chiave primaria quando la
  // RLS è attiva (lo è su task_history), a prescindere da REPLICA IDENTITY.
  // Il ramo che questo filtro aveva per le DELETE non si è mai eseguito.
  //
  // Sulle DELETE si ricarica quindi SEMPRE: sono rare (solo il purge di un
  // task) e una rilettura in più è la risposta corretta a «non so se mi
  // riguarda», che è la stessa regola del fallback sul corpus in
  // useAppHydration.
  if (payload?.eventType === "DELETE") return true;
  return payload?.new?.task_id === taskId;
},
```

E in `useAppHydration.js:492` il commento va corretto, non il codice — il
fallback è già quello giusto:

```js
// `old` NON porta task_id su una DELETE (solo la chiave primaria: la RLS è
// attiva su comments). Resta letto perché costa nulla e perché la regola
// potrebbe cambiare; quando è assente si ricade sul corpus, che è la risposta
// corretta a «non so quali task sono cambiati».
const tid = payload.new?.task_id ?? payload.old?.task_id;
```

#### B-3 · `ProfileEditor` riscrive a mano il contratto che `useSalvataggio` esiste per non far riscrivere

`useSalvataggio` è usata in 29 file. `ProfileEditor.jsx` no: rifà a mano
`inVolo`, `montato()`, il ramo d'errore che non chiude, il freno al doppio
invio e il testo inline — cioè le cinque cose che il preambolo dell'hook
elenca come sue.

E su una delle cinque le due versioni **si contraddicono**. L'hook, riga 71:

> *«Il freno al doppio invio è un REF, non lo stato `inVolo`: fra due click
> ravvicinati React può non aver ancora ri-renderizzato, quindi entrambi i
> gestori leggerebbero `inVolo === false`»*

`ProfileEditor.jsx:110` usa `useState`, e `:142` ci si guarda:
`if (salvaInVolo) return;`.

Chi ha ragione è meno interessante di quanto sembri — in React 18 gli eventi
discreti fanno flush fra un click e l'altro, quindi la finestra è stretta e il
bottone è comunque `disabled` — ed è proprio il motivo per cui vale la pena
chiuderlo: **il repository afferma due cose diverse sulla stessa regola**, e la
prossima persona che apre uno dei due file ne copierà una delle due a caso. È
la classe di difetto che questo progetto tratta meglio di chiunque altro, su un
caso che gli è sfuggito.

`ProfileEditor` non è però un form come gli altri — ha un upload di avatar
*prima* della scrittura, con un ramo d'errore proprio — quindi la conversione
va fatta con `esegui` che copre entrambi i passi, non a metà:

```jsx
const { salva, inVolo, errore } = useSalvataggio(
  async () => {
    let finalPhotoUrl = draft.photoUrl || null;
    if (session && typeof draft.photoUrl === "string" && draft.photoUrl.startsWith("data:")) {
      const { url, error: upErr } = await UsersAPI.uploadAvatar(member.id, dataUrlToBlob(draft.photoUrl));
      // L'upload fallito è un errore di SALVATAGGIO, non un avviso: riprovare
      // è la cosa giusta da fare e non crea doppioni (nessuna riga scritta
      // ancora). È il ramo `{ error }` del contratto, non `{ avviso }`.
      if (upErr || !url) return { error: upErr ?? new Error("Foto non caricata") };
      finalPhotoUrl = url;
    }
    return dispatch({ type: "UPDATE_OWN_PROFILE", payload: { …, photoUrl: finalPhotoUrl } });
  },
  { alSuccesso: onClose,
    messaggioErrore: "Profilo non salvato. Quello che hai scritto è ancora qui, riprova." },
);
```

La validazione dei campi resta **fuori** da `esegui` e prima di `salva()`: non è
un esito di scrittura, è un verdetto sul form, e ha già il proprio stato
(`errori` + focus sul primo campo invalido) — che è fatto bene e non va toccato.

#### B-4 · Le cache di signed URL sopravvivono al logout

`avatarUrlCache` e `signedUrlCache` sono due `Map` di modulo
(`src/lib/api/storage.js:18,22`). L'unica cancellazione è puntuale
(`utenti.js:62`, dopo un upload di avatar). `signOut()` non ricarica la
pagina — l'SPA torna alla `LoginScreen` — quindi con due utenti che si
alternano sulla stessa scheda le URL firmate del primo restano in memoria fino
a un'ora.

**Lo sfruttamento diretto non c'è**: le chiavi sono i path, e per chiedere un
path bisogna averlo letto da una riga che la RLS ha lasciato passare. È igiene,
non un buco — e va chiusa per la stessa ragione per cui `SET_CURRENT_USER` è
stato tolto dal bundle di produzione invece di lasciarlo irraggiungibile: un
privilegio non sfruttabile resta un privilegio da non concedere.

```js
// src/lib/api/storage.js
/**
 * Svuota le cache di signed URL. Da chiamare al sign-out: `signOut()` non
 * ricarica la pagina, quindi senza questo le URL firmate di chi esce
 * sopravvivono a chi entra nella stessa scheda, per il resto del loro TTL.
 */
export const svuotaCacheUrl = () => { avatarUrlCache.clear(); signedUrlCache.clear(); };
```

```js
// src/auth/AuthContext.jsx — nei DUE signOut, e nel deleteAccount
const signOut = useCallback(async () => {
  const res = await supabaseAuth.signOut({ scope: 'local' });
  // Import dinamico per lo stesso motivo di caricaProfilo: questo file non
  // deve trascinare il data layer nel grafo eager (B-2 del 30 agosto). A
  // questo punto il chunk è già in cache — costa un await, non un download.
  const { svuotaCacheUrl } = await import('../lib/api/storage.js');
  svuotaCacheUrl();
  return res;
}, []);
```

> ⚠️ `storage.js` è un modulo **privato** di `lib/api/`
> (`VIETATI_MODULI_API_INTERNI` in `eslint.config.js` ammette come importatore
> solo `lib/api.js`). L'import qui sopra va quindi fatto passare dalla porta —
> `export { svuotaCacheUrl } from './api/storage.js'` in `lib/api.js` — oppure
> il confine va allargato **esplicitamente** con il perché accanto. Non
> aggirato: quel divieto esiste perché un import diretto apre in silenzio il
> confine che protegge le entità dello stato.

#### B-5 · `send_test_push()` è l'unica porta privilegiata senza rate limit

Le quattro Edge Function passano tutte da `entroLimite` con una chiave per
chiamante — `invite-user` a venti l'ora, e il commento spiega perché è quella
il moltiplicatore di danno più alto. `public.send_test_push()` no:

```sql
send_test_push()  →  authenticated=X/postgres     -- eseguibile da ogni utente attivo
```

Il corpo controlla `auth.uid()` e `private.is_active_user()`, poi inserisce in
`notifications`, e da lì il trigger `notify_push` chiama via `pg_net` la Edge
Function `send-push`, che invia un Web Push **reale** a ogni dispositivo
registrato dell'utente. Nessun tetto, nessuna finestra.

Il danno è contenuto — un utente può solo spammare i propri dispositivi — ma
consuma il servizio push, il budget delle Edge Function e le righe di
`notifications` per tutti. E l'infrastruttura per chiuderlo **esiste già**:

```sql
create or replace function public.send_test_push()
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_id uuid;
begin
  if v_uid is null then raise exception 'non autenticato'; end if;
  if not private.is_active_user() then raise exception 'utente non attivo'; end if;

  -- B-5 dell'audit del 5 settembre. Era l'unica porta privilegiata del
  -- progetto senza tetto: le quattro Edge Function passano tutte da
  -- rate_limit_incrementa con una chiave per chiamante, questa no — e ogni
  -- chiamata fa partire un Web Push vero via notify_push → pg_net → send-push.
  -- Cinque per ora: è un pulsante «prova la notifica», nessun uso reale ne
  -- chiede sei.
  if not public.rate_limit_incrementa('send-test-push:' || v_uid::text, 60, 5) then
    raise exception 'Troppe notifiche di prova: riprova fra un po''';
  end if;

  delete from public.notifications where user_id = v_uid and type = 'push_test';
  insert into public.notifications (user_id, type, payload)
  values (v_uid, 'push_test', jsonb_build_object('sent_at', now()))
  returning id into v_id;
  return v_id;
end $$;
```

> ⚠️ `rate_limit_incrementa` è oggi `service_role` soltanto. Chiamandola da
> dentro una `SECURITY DEFINER` di proprietà di `postgres` il permesso non
> serve — l'esecutore è il proprietario — ma **va verificato eseguendo**, non
> dedotto: è la stessa forma di verifica che il 4 settembre ha usato per i
> cinque trigger di audit dopo la revoca.

---

## Ordine di esecuzione consigliato

| # | Cosa | Perché in questa posizione |
|---|---|---|
| ~~1~~ | **A-1** — metà `ALLOWLIST` ✔ | **Fatta il 5 settembre**: le due voci morte sono state tolte e il gate è verificato per mutazione. La metà «vendorare il tarball» resta, ma **non è più in testa**: con la seconda metà del rilievo smentita, non c'è niente che blocchi il resto, e serve comunque un ambiente che raggiunga il CDN una volta sola |
| ~~1~~ | **A-2** (URL e history) ✔ | **Fatto il 5 settembre**: `src/hooks/useUrlStato.js`, montato dopo `usePushNavigation`. Nessuna dipendenza nuova, 20 casi di test, sei mutazioni verificate |
| 2 | **B-1**, **B-5** (due migrazioni SQL piccole) | Indipendenti da tutto, verificabili scrivendo davvero su staging, nessun impatto sul client. Si chiudono in un blocco solo, come i «quattro rimedi piccoli e indipendenti» del 4 settembre |
| 3 | **M-2** (audit su `clients` + sonda) | Terza migrazione dello stesso blocco, ma separata perché è una decisione di prodotto (cosa si registra) e non un rimedio |
| 4 | **A-1** — metà «vendorare il tarball» | Da fare da un ambiente che raggiunge `cdn.sheetjs.com`: nessuna urgenza (CI e Vercel verdi), nessun blocco a valle |
| 5 | **M-1** (guscio offline) | Dopo A-2: con gli URL, il service worker ha una forma canonica da servire e il caso «riapri sull'ultima vista da offline» diventa provabile |
| 6 | **M-3** (font in proprio) | Subito dopo M-1, perché è la risorsa che altrimenti manca da offline — e perché restringe la CSP, cosa che si vuole fare quando il resto è stabile |
| 7 | **B-2**, **B-3**, **B-4** | Tre correzioni di coerenza, nessuna urgente, tutte piccole. B-4 va fatta con l'attenzione al confine `VIETATI_MODULI_API_INTERNI` |
| 8 | **M-4** (`checkJs` su `components/ui`) | Un passo alla volta, quando c'è una sessione da dedicargli: si allarga quando la cartella nuova è a zero, non prima |
| — | **M-5** (stili) | ⛔ **Non aggredire senza una ragione di prodotto.** Vedi il rilievo |

**Dopo ogni passo, e non alla fine:**

```bash
npm ci && npm run lint && npm run verifica:tipi && npm test \
  && npm run build && npm run verifica:bundle && npm run verifica:audit \
  && npm run verifica:convenzioni
```

---

## Una nota su come leggere il 9

Nove non è «buono con riserva»: è quasi il massimo che una scala del genere
può dare a un sistema che gira in produzione con dati veri. I due punti alti
non descrivono codice scritto male — descrivono **il bordo del perimetro che
ventuno audit hanno battuto**: la catena che installa il progetto e la
funzione che non è mai stata scritta.

⚠️ **Il voto non si è mosso dopo il ridimensionamento di `A-1`**, e vale la
pena dire perché invece di limarlo di mezzo punto in una direzione o
nell'altra. La metà smentita di `A-1` non lo reggeva: nove veniva dal quadro
complessivo — 2.121 test, lint e tipi a zero, RLS verificata riga per riga in
produzione, zero sink XSS — contro dodici rilievi di cui nessuno critico. Quel
quadro è identico a prima. Muovere il numero perché *io* ho misurato meglio,
e non perché *il progetto* sia cambiato, sarebbe far dire al voto qualcosa che
non riguarda ciò che misura.

Vale la pena dirlo perché la differenza è operativa. Un progetto con debito
*dentro* migliora rileggendo ciò che ha; questo migliora **guardando dove non
ha ancora guardato** — ed è la ragione per cui questo audit ha speso il proprio
tempo a eseguire `npm ci`, a interrogare `pg_class.relreplident` e a contare le
righe di `audit_log`, invece di rileggere `useSyncedDispatch` per la
ventiduesima volta.

La cosa più utile che questo documento può lasciare non è l'elenco dei dodici
rilievi: è la domanda che li ha prodotti tutti — *«qual è il livello che
nessuno ha ancora interrogato?»* — che al ventitreesimo giro andrà posta di
nuovo, su un livello che oggi non so nominare.

---

## Come è stato chiuso (A-2)

`src/hooks/useUrlStato.js`, montato in `VoyageDeskInner` **subito dopo**
`usePushNavigation`. Nessuna dipendenza nuova: la History API e basta, come il
rilievo prescriveva.

### Cosa sta in URL, e cosa no

`?v=<vista>` e `?task=<id>`. La dashboard non si scrive, così `/` resta `/`.
Non ci va lo stato effimero — filtri, ricerca, tab, finestra di `useFinestra`:
sono valori che cambiano a ogni tasto premuto e riempirebbero la cronologia,
che è il difetto opposto a quello chiuso qui.

⚠️ **`?lista=` è letto e non è scritto, ed è un limite dichiarato.** Un link a
una lista funziona — l'intent arriva a `SET_VIEW` come `action.lista`, che è il
meccanismo che `listeTarget` ha già — ma aprire una lista **cliccandola** dentro
il modulo non aggiorna la barra degli indirizzi: `listaApertaId` è `useState`
dentro `ListeViaggio.jsx`, e il modulo Liste tiene il proprio stato fuori dal
reducer **per scelta dichiarata** (`docs/CLAUDE.md`). Sollevarlo qui sarebbe un
cambio all'architettura di quel modulo travestito da correzione di questo
rilievo. Il parametro viene quindi CONSUMATO come `?task=`/`?chat=` in
`usePushNavigation`: la prima normalizzazione lo toglie, così nessuna voce di
cronologia lo porta e nessun «indietro» lo riesegue.

### I permessi non sono stati toccati, ed è il punto

`SET_VIEW` e `SET_SELECTED_TASK` passano già da `canAccessAdmin`,
`canAccessListe` e `canViewTask`: un URL scritto a mano verso una vista vietata
produce il toast di rifiuto e non la vista, **senza un solo controllo nuovo**.
È anche il motivo per cui la vista iniziale si applica con un `dispatch` invece
di essere seminata in `makeInitialState`: quella strada salterebbe entrambi i
guard, e `liste` — a differenza di `admin` — non ha una seconda difesa al
montaggio. Il commento che in `renderView` avverte di non scrivere «un terzo
modo di impostare `activeView`» è stato letto prima di scegliere, non dopo.

### Il difetto che i test hanno trovato, e che il rilievo non prevedeva

Lo schema del rilievo aveva il riflesso `stato → URL` con dipendenze
`[vista, taskId]`. È sbagliato su un caso: un `popstate` **rifiutato dai
permessi** non muove né `vista` né `taskId`, quindi il riflesso non riparte e
**la barra degli indirizzi resta a dichiarare una vista che non è montata**.
Non è teorico — è la stessa classe del rilievo, l'URL che afferma qualcosa di
falso — ed è emerso scrivendo il caso di test per quel ramo, non leggendo il
codice. La correzione è un contatore (`passoPop`) fra le dipendenze del
riflesso: fa ripartire il confronto dopo ogni `popstate`, anche quando lo stato
non è cambiato.

### Verifica

20 casi in `src/test/hooks/useUrlStato.test.jsx`, e — come per `A-1` del 4
settembre — **verificati per mutazione**, perché un test che non cattura la
regressione che dichiara di coprire non protegge niente:

| Mutazione | Esito |
|---|---|
| Tolto il gate `pronto` dal riflesso | 2 falliti |
| `pushState` sempre, mai `replaceState` | 3 falliti |
| `ultimo` aggiornato DOPO i dispatch di `popstate` | 1 fallito |
| `daRicerca` non filtra su `VISTE` | 2 falliti |
| `sostituisci` non alzato nel gestore di `popstate` | 1 fallito |
| Tolto `passoPop` dalle dipendenze del riflesso | 1 fallito |

⚠️ **Due di quelle righe non erano lì alla prima stesura.** «`ultimo` dopo i
dispatch» e «`sostituisci` non alzato» passavano entrambe: la prima perché
l'asserzione era su `history.length`, che non distingue «non ha impilato» da
«non ha scritto» (la scrittura di troppo era un `replaceState`); la seconda
perché il ramo che protegge non era raggiungibile finché mancava `passoPop`.
Contare le CHIAMATE a `pushState`/`replaceState` chiude la prima; il caso del
`popstate` rifiutato chiude la seconda ed è ciò che ha fatto emergere il
difetto qui sopra.

⚠️ **E l'armatura di test ha uno stato, non un `vi.fn()`.** La prima stesura
usava un dispatch spia e falliva su un caso che nell'app funziona: senza uno
stato che SEGUE il dispatch, il render dopo il mount ha `pronto` già vero e la
vista ancora vecchia, cioè una combinazione che React non produce mai —
`impostaPronto` e il `SET_VIEW` iniziale partono dallo stesso effetto e
finiscono nello stesso render. Una spia avrebbe misurato una proprietà
dell'armatura, non dell'hook.

Il collegamento fra `VISTE` (nell'hook) e i `case` di `renderView` è a sua
volta un test: legge lo switch dal sorgente di `VoyageDeskInner.jsx` e lo
confronta, come `persistenceGuards.test.js` fa con i case del reducer — così
una vista aggiunta domani non può restare senza link senza che nulla lo dica.

Suite completa: **2.141 test passati** (erano 2.121), lint e `verifica:tipi` a
zero, `verifica:convenzioni` a 65 controlli, `verifica:bundle` sotto soglia (il
chunk dell'app sale di 0,56 kB gzip).

### Cosa NON è stato verificato

Non c'è una prova nel BROWSER. L'app senza credenziali Supabase si ferma alla
schermata di login e `VoyageDeskInner` non monta, quindi la verifica end-to-end
con Playwright — quella che il 4 settembre ha corretto due errori nel CSS
proposto per `M-1` — qui non era eseguibile. Le venti prove sono di
integrazione fra l'hook e un reducer simulato, non fra l'app e un browser: la
distinzione conta, e la prima cosa da fare su una preview con credenziali è
premere Indietro.
