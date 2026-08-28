# Audit sicurezza & gestione dei dati — 26 agosto 2026

> **Metodo.** Ogni rilievo qui sotto è stato verificato **leggendo lo stato del
> database di produzione** (`pg_policies`, `pg_proc`, `pg_trigger`,
> `storage.buckets`, `supabase_migrations.schema_migrations`, advisor di
> sicurezza) e non dedotto dal contenuto delle migrazioni nel repository. È la
> distinzione che `docs/MIGRAZIONI_SUPABASE.md` impone dopo tre incidenti:
> **committare non è applicare**. Dove un rilievo riguarda solo il repo (CI,
> dipendenze, documentazione) è detto esplicitamente.
>
> **Riconciliazione migrazioni:** tutte le 119 migrazioni presenti in
> `supabase/migrations/` risultano applicate (confronto per nome). Nessuna
> migrazione fantasma.

---

## Executive Summary

**Stato di salute: buono, con margini stretti e ben delimitati.**

Questo non è un progetto con falle da tappare: è un progetto che ha già
attraversato una decina di audit e in cui i tre livelli di autorizzazione —
client (`lib/permissions.js`), registry di persistenza (`state/persistence.js`),
database (RLS + helper `private.*`) — sono espliciti, allineati e coperti da
test. Le verifiche che di solito producono i rilievi gravi qui non producono
nulla:

- **Nessun segreto nel client.** Solo `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.js:5-6`), che sono pubbliche per
  disegno. Nessuna `service_role`, nessuna chiave VAPID privata, nessun file
  `.env` versionato.
- **Nessun XSS.** Zero occorrenze di `dangerouslySetInnerHTML`, `innerHTML`,
  `eval`, `new Function`. Nessuna linkificazione automatica del testo utente:
  chat, commenti e menzioni passano da `MentionText`/`MessageTextContent`, che
  emettono nodi React (escaping automatico). I numeri di telefono, unico dato
  utente che diventa `href`, passano da `sanitizePhone()` che tiene solo cifre
  e un `+`. CSP bloccante senza `unsafe-inline`.
- **RLS su tutte e 19 le tabelle di `public`**, con gate RESTRICTIVE "utente
  attivo" su 14 di esse e helper `private.*` che includono già
  `active = true AND coalesce(pending,false) = false`.
- **Escalation di privilegi bloccata a livello database**, non solo in UI: il
  trigger `users_block_privileged_self_update` riscrive `role`, `active`,
  `pending`, `capacity`, `seniority`, `id` ai valori vecchi per chiunque non sia
  admin. Le tre Edge Function distruttive condividono un unico predicato
  (`requireActiveAdmin` → `puoAgireComeAdmin`), puro e testato.
- **Tutte le 8 RPC `SECURITY DEFINER` raggiungibili da `authenticated`** hanno
  una guardia interna verificata riga per riga sul database.

I rilievi che restano sono di tre tipi, e nessuno è sfruttabile oggi da un
estraneo:

1. **una dipendenza vulnerabile** (`xlsx@0.18.5`) mitigata a livello
   applicativo ma non risolta, e il blocco che impedisce di risolverla è stato
   **ri-verificato oggi** (egress verso `cdn.sheetjs.com`: ancora 403);
2. **l'assenza di una traccia di audit durevole** sulle operazioni privilegiate
   — il pannello Admin mostra un "Log attività" che non sopravvive a un reload;
3. **tre asimmetrie residue** nelle policy (una tabella e un bucket fuori dal
   gate "utente attivo", una clausola di DELETE più larga del necessario), tutte
   della stessa famiglia che le migrazioni del 22 agosto avevano dichiarato
   chiusa.

Il rischio dominante di questo sistema non è un difetto di codice: è che
l'unica traccia di "chi ha fatto cosa" su dati che includono PII di persone
esterne al team viva in memoria e sparisca a ogni refresh (rilievo **A-2**).

---

## Tabella delle priorità

| # | Priorità | Rilievo | Dove | Sfruttabile da |
|---|----------|---------|------|----------------|
| — | **Critici** | *Nessun rilievo critico.* Nessuna falla che consenta a un non autenticato, o a un utente autenticato di ruolo basso, di leggere o scrivere dati fuori dal proprio perimetro. | — | — |
| **A-1** ✔ | **Alta** | `xlsx@0.18.5`: prototype pollution (CVE-2023-30533, CVSS 7.8) + ReDoS (CVE-2024-22363, 7.5). Nessun fix su npm. Mitigato in app, non risolto. | `package.json:24`, `src/lib/xlsx.js` | membro del team che importa un file ostile |
| **A-2** ✔ | **Alta** | Nessun audit trail durevole. Il "Log attività" è stato React in memoria, tetto 100 voci, azzerato a ogni reload, mai scritto a database. Le operazioni più distruttive (hard-delete utente, ban, cambio ruolo, `reset_completo`, `importa_backup`, delete cliente) non lasciano traccia. | `src/state/reducer.js:735-736,776`, `src/components/admin/tabs/AdminLogTab.jsx` | — (rischio di accountability/GDPR, non di accesso) |
| **A-3** ✔ | **Alta** | `public.users` è l'unica tabella sensibile senza il gate RESTRICTIVE `rls_active_only`. Un account **pending** o **appena disattivato** conserva la lettura dell'intera rubrica interna e la scrittura sulla propria riga di profilo. | policy `users_select_all`, `users_update` (live DB) | utente invitato e non ancora approvato; utente disattivato, fino alla scadenza dell'access token |
| **M-1** ✔ | **Media** | Il bucket `avatars` è escluso dalla policy RESTRICTIVE `storage_active_only`: `insert`/`update`/`delete` sugli avatar non controllano `is_active_user()`. | policy `storage_active_only` (live DB) | utente pending o disattivato |
| **M-2** ✔ | **Media** | `chat_files_delete` contiene una clausola "orfani" che consente a **qualunque** utente attivo di cancellare qualunque oggetto di `chat-files` la cui cartella non corrisponda a una conversazione esistente. | policy `chat_files_delete` (live DB) | qualunque utente attivo |
| **M-3** ✔ | **Media** | `messages_update` lascia passare in RLS **ogni partecipante** su **ogni** messaggio; la restrizione per colonna è affidata al solo trigger `messages_blocca_modifiche_altrui`. Punto singolo di rottura, su una tabella da cui un trigger analogo è già stato rimosso in passato (`20260814210100`). | policy `messages_update` + trigger omonimo (live DB) | partecipante alla conversazione, **solo** se il trigger salta |
| **M-4** ✔ | **Media** | Politica password minima (8 caratteri) applicata **solo lato client**, e duplicata in due file. GoTrue accetta il proprio minimo su chiamata diretta all'API. | `src/auth/UpdatePasswordScreen.jsx:27`, `src/components/shell/AccountSicurezza.jsx:45` | chi chiama `/auth/v1/user` direttamente |
| **M-5** ✔ | **Media** | Deriva documentale in `docs/SICUREZZA.md`: la tabella §1 dichiara `importa_backup` protetta da `private.can_liste()`; il database applica `private.is_admin()` dal 15 agosto. Il documento di riferimento sulla sicurezza descrive una guardia più debole di quella reale. | `docs/SICUREZZA.md:87` | — |
| **B-1** ✔ | **Bassa** | `get_migrazioni_applicate()` eseguibile da `anon`: espone a un non autenticato l'elenco completo delle migrazioni, cioè la cronologia dell'evoluzione dello schema. | live DB + `.github/workflows/keep-supabase-warm.yml` | chiunque, senza autenticazione |
| B-2 | **Bassa** | Rubrica interna piatta: `users_select_all USING true` e `user_contacts_select USING true` danno email e telefono di **tutto** il team anche al ruolo `driver`, che è escluso da ogni altro dato commerciale. **Decisione di prodotto confermata il 28 agosto**: resta com'è, non è un difetto — vedi la nota nella sezione dedicata più sotto. | live DB | qualunque utente attivo |
| **B-3** ✔ | **Bassa** | La stessa allow-list di host vive in **tre** posti indipendenti (`_shared/originConsentite.ts`, la CSP in `vercel.json`, i Redirect URL nella dashboard Supabase). Nessun controllo automatico che le tenga allineate; solo la terza ha una sonda. | `supabase/functions/_shared/originConsentite.ts`, `vercel.json` | — |
| **B-4** ✔ | **Bassa** | Anon key ripetuta in chiaro in 3 punti di 2 workflow invece che in una repository variable. Non è un segreto, ma una rotazione diventa una modifica a più file. | `.github/workflows/keep-supabase-warm.yml:28,46`, `verifica-rpc.yml:76,86,100` | — |

> ### Stato dei tre rilievi di alta priorità (aggiornato il 26 agosto)
>
> **A-1 ✔ risolto.** SheetJS non gira più nel realm che tiene la sessione:
> `src/lib/xlsxWorker.js` è l'unico modulo che lo importa, creato e terminato
> per ogni file. Il presidio è `VIETATO_XLSX_FUORI_DAL_WORKER` in
> `eslint.config.js`, non una convenzione scritta. Aggiunto un tetto di tempo
> (30 s) che *termina* il worker: è la prima risposta effettiva alla ReDoS, che
> prima poteva congelare il thread della UI a tempo indeterminato. Al confine,
> le chiavi `__proto__`/`constructor`/`prototype` vengono scartate.
> Nel bundle esiste **una sola** copia della libreria (426 kB nel chunk del
> worker), e l'export Excel del pannello Admin passa di lì invece di
> `XLSX.writeFile`. Il fix definitivo — il tarball 0.20.3 dal CDN — resta la
> cosa giusta da fare e non è più urgente; l'egress è ancora 403.
>
> **A-2 ✔ risolto e in produzione.** Tabella `audit_log` append-only,
> RPC `registra_audit()` che ricava l'attore da `auth.uid()`, trigger su
> `users` (privilegi e cancellazioni), trigger di statement su `clients`
> (import e eliminazioni massive), trigger di TRUNCATE sul modulo Liste, e le
> tre Edge Function privilegiate che scrivono con la `service_role`. La tab
> Admin ha ora due metà distinte: il registro durevole di tutto il team, e la
> cronologia di sessione — che resta, ma smette di essere l'unica cosa
> presente.
>
> **A-2, secondo passaggio — trovato ESEGUENDO la migrazione, non rileggendola.**
> Sullo staging, una UPDATE su una colonna privilegiata non produceva alcuna
> voce. Non era un difetto del trigger nuovo, era l'ordine dei trigger che
> funzionava come deve: `users_block_privileged_self_update` è BEFORE e
> riporta i sei campi a OLD, quindi l'AFTER non vede più differenze e non
> registra — verdetto giusto, non è cambiato niente.
>
> Ma il TENTATIVO è l'evento più significativo per la sicurezza che questo
> sistema possa produrre, e veniva neutralizzato in silenzio assoluto: 200 in
> risposta, riga corretta, nessuna traccia. Il test di integrazione che copre
> quel caso lo diceva da mesi senza accorgersene — `expect(error).toBeNull()`.
> Il delta si può leggere solo da DENTRO la guardia, prima che sovrascriva:
> dopo, l'informazione non esiste più in nessun punto del sistema. La
> migrazione `20260826220000` estende quella funzione lasciandone invariato il
> comportamento di guardia (stessi sei campi, stessi valori, stesso ordine) e
> aggiungendo `user.modifica_privilegi_negata`.
>
> Verificato sullo staging: il tentativo `role → admin, capacity → 999` viene
> annullato (la riga resta `agent`, capacity 8) e lascia **una** voce con il
> delta completo; una modifica non privilegiata non ne lascia nessuna.
>
> **A-3 ✔ risolto e in produzione.** `public.users` entra nel gate
> "utente attivo" nella forma che NON rompe `PendingScreen`: la riga propria
> resta sempre leggibile, la rubrica no. In scrittura il gate si applica pieno.
>
> ### Stato di applicazione — verificato, non dedotto
>
> Le tre migrazioni (`20260826213000`, `20260826214000`, `20260826220000`) sono
> applicate **allo staging** e **alla produzione**, e le tre Edge Function
> privilegiate sono ridistribuite: `invite-user` v10, `delete-user` v5,
> `set-user-active` v2, tutte `ACTIVE` con `verify_jwt: true`. Le altre quattro
> funzioni del progetto non sono state toccate (stesse versioni, stessi hash).
>
> La verifica è stata fatta **leggendo lo stato**, come impone
> `docs/MIGRAZIONI_SUPABASE.md` — *committare non è applicare*: `pg_policies`
> per le due policy di `users`, `pg_class.relacl` per i grant su `audit_log`
> (`authenticated=r`, sola lettura), `pg_trigger` per i cinque trigger, e
> `pg_get_functiondef` per confermare che la guardia estesa conserva intatte le
> sei righe che annullano il delta. Un controllo trasversale conferma inoltre
> che **non resta alcuna tabella fuori dal gate "utente attivo"**, escluse le
> quattro `liste_*` che lo hanno dentro `can_liste()`.
>
> Sullo staging i trigger sono stati anche **fatti scattare**: il tentativo
> `role → admin, capacity → 999` viene annullato (la riga resta `agent`,
> capacity 8) e lascia una sola voce con il delta completo; una modifica non
> privilegiata non ne lascia nessuna.
>
> ⚠️ **Limite dichiarato sul deploy delle Edge Function.** Sono state
> distribuite via MCP, che richiede di ritrasmettere anche i file `_shared/`
> non modificati. Per `set-user-active` il contenuto è stato **riletto dal
> deployato e confrontato** con il repo (predicato admin completo, allow-list
> dei tre host, ramo `profiloErr`); per le altre due sono state riusate le
> **identiche stringhe** già verificate, quindi il codice condiviso è lo stesso
> in tutte e tre. Resta preferibile, alla prima occasione utile, un
> `supabase functions deploy` dal repository: legge i file dal disco e rende la
> corrispondenza vera per costruzione invece che per verifica.
>
> ✅ **Workflow `rls.yml`**: gira su `main` quando cambia
> `supabase/migrations/**`, contro il progetto di **staging** — dove le tre
> migrazioni sono già applicate. I sette test aggiunti per A-2 e A-3 hanno
> quindi lo schema che si aspettano: al merge il job parte allineato.

> ### Stato dei cinque rilievi di media priorità (aggiornato il 27 agosto)
>
> **M-1 ✔ risolto e in produzione.** `storage_active_only` non è più una lista
> di ESCLUSIONI (`bucket_id <> all(['task-files','chat-files'])`) ma una lista
> di INCLUSIONI che nomina tutti e tre i bucket dell'app. Il cambio di forma è
> il rimedio vero: prima dimenticare un bucket lo lasciava FUORI dal gate, ora
> lo lascia DENTRO — l'errore per omissione diventa quello restrittivo.
> Verificato che il percorso di attivazione non regredisce: l'unico punto che
> carica un avatar (`ProfileEditor` → `src/lib/api/utenti.js`) vive oltre
> `AuthGate`, che per `pending = true` mostra `PendingScreen`, e `PendingScreen`
> non monta nemmeno `Avatar`. Migrazione `20260827075128`.
>
> **M-2 ✔ risolto e in produzione, in una forma diversa da quella proposta.**
> Mettendo la policy accanto al codice che la usa è emerso un secondo difetto,
> che l'audit non aveva visto: la clausola "orfani" era insieme troppo larga
> *e* **irraggiungibile**. `MessagesAPI.removeConversationFiles` fa
> `storage.list(convId)` prima di `remove(paths)`, e la list passa da
> `chat_files_select`, che richiede una conversazione ESISTENTE — sparita la
> riga, torna vuota per tutti, admin compresi (là `is_admin()` stava DENTRO
> l'`exists`). La bonifica che `20260814220000` voleva abilitare non è quindi
> mai avvenuta.
>
> Per questo la correzione proposta — restringere il ramo a
> `owner_id or is_admin()` — **non è stata applicata così**: i primi due rami
> già coprono owner e admin, quindi il quarto sarebbe diventato un no-op, il
> buco si sarebbe chiuso e la pulizia cross-partecipante sarebbe rimasta
> impossibile per sempre, contro l'intento esplicito di C-1 del 14 agosto
> (l'inversione dell'ordine di `removeConversation` è ciò che rende gli orfani
> possibili). La clausola ha ora un SOGGETTO, ricavato dall'unico dato che dopo
> la cancellazione non esiste più: chi ne era partecipante. Un trigger
> `after delete` su `conversations` lascia una lapide in
> `private.conversazioni_eliminate` (id + participants, nessun contenuto,
> schema non esposto da PostgREST, nessun GRANT per `authenticated`), e le due
> policy di `chat-files` la consultano via `private.era_partecipante()`. La
> SELECT sugli orfani si apre agli stessi ex partecipanti, senza la quale il
> ramo di DELETE resterebbe irraggiungibile. Migrazione `20260827075157`.
>
> ⚠️ **Limite dichiarato.** La lapide esiste solo per le conversazioni
> cancellate **da qui in avanti**: per gli orfani nati prima non c'è alcun
> record di chi ne fosse partecipante, e restano ripulibili dal solo admin —
> che ora però può almeno elencarli, perché `is_admin()` è uscito dall'`exists`
> ed è un ramo suo. In produzione il bucket `chat-files` contiene **0 oggetti**,
> quindi oggi l'insieme degli orfani pregressi è vuoto.
>
> **M-3 ✔ chiuso con cinque test, non con una modifica.** La policy e il
> trigger restano come sono — in RLS il confronto per colonna non si esprime
> bene, e il trigger è scritto nella forma giusta (sottrae le colonne
> collaborative invece di elencare quelle vietate, così una colonna nuova nasce
> protetta). Quello che mancava era la RUMOROSITÀ della sua eventuale rimozione,
> su una tabella da cui un trigger di guardia analogo è già stato droppato una
> volta. `src/test/integration/rls.test.js` ha ora cinque casi: il testo altrui
> non si riscrive (42501, ed è un'eccezione SOLLEVATA, non una riga filtrata),
> `sender_id` non si riscrive, la reazione e il pin su un messaggio altrui
> **devono** continuare a passare, e una colonna non collaborativa qualsiasi
> (`type`) è protetta quanto il testo — quest'ultimo è ciò che distingue «il
> trigger c'è» da «il trigger sottrae invece di elencare». Tutti e cinque
> verificati a mano sullo staging impersonando i due utenti.
>
> **M-4 ✔ risolto per la metà che è codice; la metà che conta è una riga
> aperta.** Il minimo di password ha ora una definizione sola — `PASSWORD_MIN`
> in `src/lib/validators.js`, con `passwordValida()` — usata dai due punti che
> la duplicavano (`UpdatePasswordScreen`, `AccountSicurezza`) e anche dai due
> che ripetevano il numero 8 in una stringa (il placeholder del campo e il
> messaggio `weak_password` di `LoginScreen`). Ma il client non è il livello che
> decide: `supabase.auth.updateUser({ password })` è raggiungibile su
> `/auth/v1/user` col solo token di sessione, e lì vale il minimo di GoTrue.
> Quel valore **non è leggibile né dal repository né dal database** — sta nella
> configurazione del progetto Auth — e va impostato a mano in dashboard → Auth →
> Password. È il punto 5 di `docs/SICUREZZA.md` §6, ⚠️ **aperto**: finché non è
> fatto, la deduplicazione ha reso la regola più leggibile senza renderla più
> forte.
>
> **M-5 ✔ risolto, e la deriva era più larga del rilievo.** Rileggendo
> `pg_proc` in produzione, la tabella §1 di `docs/SICUREZZA.md` sbagliava su tre
> assi, non uno: la guardia di `importa_backup` (`can_liste()` dichiarata,
> `is_admin()` applicata dal 15 agosto), le FIRME di `importa_backup` e
> `sposta_titolare_lista` (entrambe hanno un parametro in più), e il CONTEGGIO —
> le funzioni `SECURITY DEFINER` esposte non sono 8 ma **14**, perché il
> registro di audit del 26 agosto ne ha aggiunte sei che la tabella non
> nominava. La tabella è stata riscritta dal `select` su `pg_proc`, che ora è
> stampato accanto ad essa perché la prossima rilettura non debba inventarselo;
> è stata aggiunta la nota sull'ampiezza di `can_liste()` per
> `elimina_lista_definitivamente` (irreversibile, aperta a admin+manager+agent,
> mitigata solo dal passaggio obbligato dal cestino); e
> `FUNZIONI_SECURITY_DEFINER_VERIFICATE` in
> `scripts/verifica-advisor/advisor.js` è stato allineato alle stesse 14 —
> senza, `npm run verifica:advisor` sarebbe rimasto rosso sulle sei nuove, che
> è il comportamento voluto di quel controllo e la prova che serviva a
> qualcosa.
>
> ### Stato di applicazione — verificato, non dedotto
>
> Le due migrazioni (`20260827075128`, `20260827075157`) sono applicate **allo
> staging** e **alla produzione**, sotto lo stesso nome e con lo stesso testo.
> La verifica è stata fatta rileggendo `pg_policies` dopo l'applicazione, e
> facendo scattare quel che si poteva far scattare: su produzione, i tre rami
> della nuova `chat_files_select`/`chat_files_delete` valutati impersonando un
> partecipante, un estraneo e un ex partecipante (lapide sintetica, poi
> rimossa), più un `delete` su una conversazione di sonda per vedere il trigger
> scrivere la lapide; su staging, i cinque casi di M-3 con i due utenti veri del
> workflow `rls.yml`. Tutte le righe di sonda sono state rimosse: entrambe le
> tabelle tornano a zero.

---

## Action plan dettagliato

### A-1 · `xlsx@0.18.5` — due CVE High, nessun fix su npm

**File.** `package.json:24` · `src/lib/xlsx.js` (loader e mitigazioni) ·
consumatori: `src/components/tasks/bulk/ImportTab.jsx`,
`src/components/clients/ClientImportModal.jsx`, `src/components/admin/tabs/AdminIOTab.jsx`

**Perché è critico.** `npm audit` riporta 1 vulnerabilità *high*, con due
advisory: `GHSA-4r6h-8v6p-xvw6` (prototype pollution, CVSS 7.8, fix in 0.19.3+)
e `GHSA-5pgg-2g8v-p4x9` (ReDoS, 7.5, fix in 0.20.2+). SheetJS ha smesso di
pubblicare su npm: **0.18.5 è l'ultima versione del registry e non riceverà mai
il fix**. Il parsing è client-side, quindi il raggio d'azione è il browser di
chi importa — ma quel browser contiene il token di sessione in `localStorage`.

**Cosa c'è già, e cosa non copre.** Il repo non ignora il problema:
`withPrototypePollutionGuard` (`src/lib/xlsx.js:79`) confronta i *descrittori*
di `Object`/`Array`/`Function.prototype` prima e dopo il parse, e
`MAX_IMPORT_BYTES` (`:44`) limita l'input a 15 MB per ridurre la superficie
ReDoS. È una buona mitigazione, ma va contabilizzata per ciò che è: **una
rilevazione a posteriori**. Se un gadget si innesca *durante* il parse, il
guard lo scopre dopo che è già stato eseguito — può rifiutare il file e chiedere
un reload, non impedire l'esecuzione.

**Ri-verifica di oggi.** Il commento in testa a `src/lib/xlsx.js` dice che il
fix definitivo è bloccato dall'egress verso `cdn.sheetjs.com`. **Riconfermato il
26 agosto 2026**, quarta verifica consecutiva:

```
$ curl -sSI https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
curl: (56) CONNECT tunnel failed, response 403
```

Il blocco non è un residuo di un ambiente passato: persiste.

**Soluzione — in ordine di preferenza.**

*(a) Il fix definitivo*, da eseguire su una macchina con accesso al CDN:

```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm test && npm run build     # API invariata: XLSX.read / utils.sheet_to_json / writeFile
```

*(b) Se l'egress resta bloccato*, la via che non dipende dalla rete della CI è
**vendorizzare il tarball**: scaricarlo una volta da una macchina con accesso,
committarlo in `vendor/xlsx-0.20.3.tgz` e puntarci `package.json`. `npm ci`
torna riproducibile e offline.

```diff
  "dependencies": {
-   "xlsx": "^0.18.5",
+   "xlsx": "file:vendor/xlsx-0.20.3.tgz",
```

*(c) Difesa strutturale, indipendente da (a)/(b) e complementare a entrambe.*
Il guard attuale sorveglia i prototipi **del contesto che poi userà la
sessione**. Spostare il parse in un Web Worker rende la pollution inerte per
costruzione: il prototipo inquinato è quello del worker, che viene distrutto
subito dopo. È la differenza fra rilevare e contenere.

`src/lib/xlsxWorker.js` (nuovo):

```js
// Parse SheetJS isolato. Il realm del worker è usa-e-getta: una prototype
// pollution innescata qui non raggiunge il contesto che tiene la sessione.
import { read, utils } from "xlsx";

self.onmessage = ({ data: { buffer, mode, opts, hints } }) => {
  try {
    const wb = read(new Uint8Array(buffer), { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) { self.postMessage({ ok: true, rows: [], columns: [] }); return; }
    const payload = mode === "autoHeader"
      ? costruisciConHeaderAuto(utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false }), hints)
      : { rows: utils.sheet_to_json(sheet, opts), columns: [] };
    self.postMessage({ ok: true, ...payload });
  } catch (e) {
    self.postMessage({ ok: false, error: e?.message ?? "parse fallito" });
  }
};
```

`src/lib/xlsx.js` — il punto d'ingresso resta lo stesso, cambia chi esegue:

```js
// Il worker è creato per OGNI import e terminato subito dopo: è quello che
// rende il realm usa-e-getta, e senza cui l'isolamento non varrebbe nulla.
const parseInWorker = (arrayBuffer, mode, opts, hints) =>
  new Promise((resolve, reject) => {
    const w = new Worker(new URL("./xlsxWorker.js", import.meta.url), { type: "module" });
    const chiudi = () => w.terminate();
    w.onmessage = ({ data }) => {
      chiudi();
      data.ok ? resolve(data) : reject(new Error(data.error));
    };
    w.onerror = (e) => { chiudi(); reject(new Error(e.message || "worker xlsx fallito")); };
    // `buffer` trasferito, non copiato: evita di duplicare 15 MB in memoria.
    w.postMessage({ buffer: arrayBuffer, mode, opts, hints }, [arrayBuffer]);
  });

export const readFirstSheetRows = async (arrayBuffer, { sheetToJsonOpts = { defval: "", raw: false } } = {}) => {
  if (arrayBuffer.byteLength > MAX_IMPORT_BYTES) throw erroreTroppoGrande(arrayBuffer);
  const { rows } = await parseInWorker(arrayBuffer, "rows", sheetToJsonOpts);
  return rows;
};
```

⚠️ **Nota CSP.** `vercel.json` ha già `worker-src 'self'`: il worker gira senza
modifiche all'header. `withPrototypePollutionGuard` va **mantenuto** come rete
di sicurezza sui percorsi che non passassero dal worker, non rimosso.

---

### A-2 · Nessun audit trail durevole sulle operazioni privilegiate

**File.** `src/state/reducer.js:735-736` (accumulo), `:776` (stato iniziale
`activityLog: []`), `:512` (svuotamento) · `src/state/activityLog.js`
(`LOGGED_ACTIONS`) · `src/components/admin/tabs/AdminLogTab.jsx` (presentazione)

**Perché è critico.** Il pannello Admin espone una tab **"Log attività"** con
filtri ed export CSV. Chi la guarda ne deduce ragionevolmente che esista un
registro. Non esiste:

```js
// src/state/reducer.js:735
const activityLog = [entry, ...(next.activityLog || [])].slice(0, 100);
```

È una fetta di stato React. Vive in memoria, ha un tetto di 100 voci, si azzera
a ogni reload della pagina, **e non viene mai scritta a database** — non esiste
alcuna tabella `activity_log` nelle 119 migrazioni. Inoltre è *locale alla
sessione*: registra ciò che ha fatto **questo** browser, non ciò che ha fatto il
team. Un admin che apre la tab per capire chi ha disattivato un collega vede una
lista vuota.

Non è un problema di controllo d'accesso, ma il gestionale tratta PII di persone
esterne al team (`clients`: nome, email, telefono, indirizzo) e movimenti di
denaro (`movimenti_lista`). Le operazioni senza traccia includono:

| Operazione | Dove | Traccia oggi |
|---|---|---|
| Hard-delete di un utente | Edge `delete-user` | solo `console.error` in caso di errore |
| Ban / revoca sessione | Edge `set-user-active` | nessuna |
| Cambio ruolo di un membro | `UPDATE_TEAM_MEMBER` → `users` | in memoria, volatile |
| `reset_completo` — TRUNCATE di 4 tabelle | RPC | nessuna |
| `importa_backup` — scrittura massiva su `clients` | RPC | nessuna |
| Eliminazione cliente (PII) | `DELETE_CLIENT` → `clients` | in memoria, volatile |

Da notare che il modulo Liste ha già la forma giusta: `lista_history` è
append-only, protetta dal trigger `private.history_append_only()`. Il problema è
che quella disciplina non è stata estesa alle operazioni amministrative — che
sono le più distruttive del sistema.

**Soluzione.** Una tabella append-only, scritta dove le decisioni vengono prese
davvero: il database e le Edge Function, non il reducer.

*Migrazione* `supabase/migrations/<ts>_audit_log.sql`:

```sql
-- Traccia durevole delle operazioni privilegiate. Append-only per costruzione:
-- nessuna policy di UPDATE/DELETE è definita, quindi la RLS le nega entrambe
-- a `authenticated` senza bisogno di un trigger. La scrittura passa da una
-- SECURITY DEFINER, così nemmeno chi INSERISCE può scegliere l'attore.
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  -- `details` NON deve contenere PII: solo ciò che serve a ricostruire la
  -- decisione (ruolo prima/dopo, conteggi). Chi ci mette un'email trasforma
  -- il registro di controllo in una seconda copia dei dati da proteggere.
  details     jsonb not null default '{}'::jsonb
);

create index audit_log_at_desc  on public.audit_log (at desc);
create index audit_log_actor_at on public.audit_log (actor_id, at desc);

alter table public.audit_log enable row level security;

-- Lettura: soli admin attivi e approvati. Stesso predicato del resto del
-- sistema, non un confronto scritto a mano su `role`.
create policy audit_log_select on public.audit_log
  for select to authenticated
  using ((select private.is_admin()));

-- Nessuna policy di INSERT/UPDATE/DELETE per `authenticated`: si scrive solo
-- attraverso la funzione qui sotto (o con la service_role dalle Edge Function).
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

create or replace function public.registra_audit(
  p_action text, p_target_type text default null,
  p_target_id text default null, p_details jsonb default '{}'::jsonb
) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Non autenticato.';
  end if;
  -- L'attore è auth.uid(), MAI un parametro: è l'unica riga che impedisce a
  -- un chiamante di firmare una voce col nome di qualcun altro.
  insert into public.audit_log (actor_id, action, target_type, target_id, details)
  values ((select auth.uid()), p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.registra_audit(text,text,text,jsonb) from anon, public;
grant   execute on function public.registra_audit(text,text,text,jsonb) to authenticated;
```

*Edge Function* — le tre privilegiate girano con `service_role` e sono
esattamente il punto in cui la RLS non arriva, quindi devono scrivere da sole.
In `supabase/functions/_shared/audit.ts`:

```ts
// Best-effort e mai bloccante: un'operazione distruttiva già andata a buon fine
// non deve fallire perché il registro non ha risposto. Il fallimento va però
// detto a log — un audit silenziosamente rotto è peggio di uno assente.
export async function registraAudit(
  admin: SupabaseClient,
  actorId: string,
  action: string,
  target: { type?: string; id?: string } = {},
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await admin.from("audit_log").insert({
    actor_id: actorId, action,
    target_type: target.type ?? null, target_id: target.id ?? null,
    details,
  });
  if (error) console.error(`[audit] ${action} non registrata:`, error.message);
}
```

e nei tre call site, **dopo** l'operazione riuscita — in `delete-user/index.ts`,
subito prima del `return json({ success: true })` finale:

```ts
  await rimuoviAvatar(targetId);
+ await registraAudit(supabaseAdmin, callerId, "user.hard_delete", { type: "user", id: targetId });
  return json({ success: true });
```

Analogamente `set-user-active` (`user.ban` / `user.unban`, con `{ active }` nei
details) e `invite-user` (`user.invite`, con `{ role }`).

*UI.* `AdminLogTab` legge la tabella invece della prop volatile. Il tetto di 100
voci in memoria può restare: è una cache di sessione per l'attività locale, non
più l'unica fonte.

---

### A-3 · `public.users` fuori dal gate RESTRICTIVE "utente attivo"

**Dove.** Stato **live** del database. `public.users` ha esattamente quattro
policy — `users_select_all`, `users_insert_admin`, `users_update`,
`users_delete_admin` — e **nessuna** policy RESTRICTIVE.

**Perché è critico.** La migrazione `20260822190100_rls_active_only_residue.sql`
si apre dichiarando di chiudere *«le due tabelle rimaste fuori dal gate
RESTRICTIVE»*. Il conteggio live dice altro: 14 tabelle hanno `rls_active_only`,
19 esistono. Le cinque scoperte sono `liste_viaggio`, `movimenti_lista`,
`lista_beneficiari`, `lista_history` e **`users`**.

Le quattro tabelle `liste_*` **non sono un problema**: ogni loro policy chiama
`private.can_liste()`, che contiene già `u.active AND coalesce(u.pending,false) =
false`. Il gate c'è, espresso in un'altra forma. Vale la pena annotarlo, perché
oggi la lettura delle policy non lo rende evidente.

`users` è invece scoperta davvero:

```
users_select_all | SELECT | USING true
users_update     | UPDATE | USING (id = auth.uid() OR is_admin())
                           CHECK (id = auth.uid() OR is_admin())
```

Due conseguenze concrete:

1. **Utente invitato e non ancora approvato** (`pending = true`). Ha una
   sessione valida dal momento in cui clicca il link d'invito. L'app lo ferma
   (`PendingScreen`), ogni altra tabella lo ferma (`rls_active_only` →
   `is_active_user()` è falsa per un pending). `public.users` no: può leggere
   l'intera rubrica interna — nomi, ruoli, `seniority`, `capacity`, `invited_by`
   di tutto il team — con una singola GET su `/rest/v1/users`. È esattamente il
   gate di approvazione che la colonna `pending` esiste per applicare.
2. **Utente appena disattivato.** `set-user-active` ora banna la sessione, ed è
   la correzione giusta — ma il ban agisce al **refresh** del token: l'access
   token già emesso resta formalmente valido fino a scadenza (default 1h).
   In quella finestra ogni altra tabella lo respinge; `users` continua a
   servirlo in lettura e ad accettare scritture sulla sua riga di profilo.

L'impatto non è enorme (il trigger `users_block_privileged_self_update` impedisce
comunque di toccare `role`/`active`/`pending`), ma è **il gate di approvazione
che non gatta**, ed è la stessa classe di difetto che
`_shared/adminPredicate.ts` è stato scritto per chiudere sulle Edge Function.

**Soluzione — e perché NON è una `rls_active_only` copiata dalle altre.** Una
policy RESTRICTIVE `using (private.is_active_user())` su `users` **romperebbe il
flusso pending**: `AuthContext.caricaProfilo` legge la propria riga
(`select('*').eq('id', userId).single()`, `src/auth/AuthContext.jsx:117`) e senza
quella riga `AuthGate` non mostrerebbe `PendingScreen` ma `ProfileErrorScreen`.
La riga propria deve restare leggibile sempre. Il gate va quindi messo **sulla
rubrica, non sul profilo**:

```sql
-- La lettura della PROPRIA riga resta incondizionata: è ciò che permette a
-- AuthGate di distinguere "in attesa di approvazione" da "profilo mancante".
-- La rubrica del team, invece, è un dato del team, e si vede solo da dentro.
drop policy if exists "users_select_all" on public.users;
create policy "users_select_self_o_attivo" on public.users
  for select to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_active_user())
  );

-- In scrittura non esiste un caso legittimo simmetrico: un utente pending o
-- disattivato non ha nulla da aggiornare sul proprio profilo. L'admin passa
-- dal proprio ramo, come prima.
drop policy if exists "users_update" on public.users;
create policy "users_update" on public.users
  for update to authenticated
  using (
    (id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  )
  with check (
    (id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  );
```

⚠️ **Prima di applicare, verificare due percorsi**: che `AuthGate` mostri ancora
`PendingScreen` a un invitato non approvato, e che `AdminTeamTab` continui a
vedere pending e disattivati (lo fa: `private.is_active_user()` è
`SECURITY DEFINER` e scavalca la RLS, quindi un admin attivo passa dal secondo
ramo e legge tutto). Il test `src/test/integration/rls.test.js` è il posto in cui
inchiodare entrambi.

E una riga di commento nella migrazione delle `liste_*`, perché la prossima
lettura non ripeta la domanda:

```sql
-- Le quattro tabelle liste_* NON hanno rls_active_only ed è corretto: ogni loro
-- policy passa da private.can_liste(), che contiene già
-- `active AND coalesce(pending,false) = false`. Il gate c'è, in un'altra forma.
```

---

### M-1 · Il bucket `avatars` è escluso dal gate "utente attivo"

**Dove.** Policy `storage_active_only` su `storage.objects` (live DB):

```
USING  ((bucket_id <> ALL (ARRAY['task-files','chat-files'])) OR private.is_active_user())
CHECK  (idem)
```

**Perché.** Per `bucket_id = 'avatars'` la prima disgiunzione è vera, quindi la
policy RESTRICTIVE è **sempre soddisfatta**: non vincola nulla. Il controllo
"utente attivo" sopravvive solo in `avatars_select_team`; `avatars_insert_own`,
`avatars_update_own` e `avatars_delete_own` guardano unicamente che la cartella
sia `auth.uid()`. Un utente pending o disattivato può quindi ancora scrivere e
sovrascrivere il proprio avatar. Impatto contenuto (5 MB, MIME ristretto a
jpeg/png/webp, path proprio), ma è la stessa asimmetria — *«chi legge le policy
non può dedurre la regola, e la prossima verrà scritta copiando quella
sbagliata»* — che la migrazione del 22 agosto cita come il difetto vero.

**Soluzione.** Rendere il gate uniforme sui tre bucket, mantenendo l'unica
eccezione che serve davvero (la lettura del proprio avatar da parte di chi non è
ancora attivo, se l'UI la usa — altrimenti eliminare anche quella):

```sql
drop policy if exists "storage_active_only" on storage.objects;
create policy "storage_active_only" on storage.objects
  as restrictive for all to authenticated
  using (
    -- Scrittura e lettura sui tre bucket dell'app richiedono un utente attivo.
    -- L'elenco è ora chiuso e non più "tutto tranne due": un bucket nuovo entra
    -- nel gate per difetto, invece di uscirne per omissione.
    bucket_id not in ('task-files', 'chat-files', 'avatars')
    or private.is_active_user()
  )
  with check (
    bucket_id not in ('task-files', 'chat-files', 'avatars')
    or private.is_active_user()
  );
```

Il cambio di forma è il punto: da *lista di esclusioni* (dove dimenticare un
bucket lo lascia fuori dal gate) a *lista di inclusioni* (dove dimenticarlo lo
lascia dentro). L'errore per omissione diventa quello restrittivo.

---

### M-2 · `chat_files_delete`: la clausola "orfani" è più larga del necessario

**Dove.** Policy `chat_files_delete` (live DB), introdotta da
`20260814220000_chat_files_delete_orfani.sql`. Ultima disgiunzione:

```sql
OR NOT EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.id::text = (storage.foldername(objects.name))[1]
)
```

**Perché.** Letta com'è scritta: *qualunque* utente attivo può cancellare
*qualunque* oggetto di `chat-files` la cui prima cartella non corrisponda a una
conversazione esistente. L'intento — ripulire i file rimasti orfani dopo
l'eliminazione di una conversazione — è legittimo, ma il permesso concesso non è
"pulisci i tuoi orfani": è "cancella qualsiasi orfano di chiunque". Il rischio
reale è basso (un orfano nasce solo da una conversazione cancellata, e i file
non sono più raggiungibili dalla UI), ma è una cancellazione irreversibile
concessa a tutti per un'operazione di manutenzione.

**Soluzione.** Restringere l'ultimo ramo a chi ha caricato il file o a un admin:

```sql
drop policy if exists "chat_files_delete" on storage.objects;
create policy "chat_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'chat-files'
    and (
      owner_id = ((select auth.uid()))::text
      or (select private.is_admin())
      or exists (
        select 1 from conversations c
        where c.id::text = (storage.foldername(objects.name))[1]
          and (select auth.uid()) = any (c.participants)
      )
      -- Orfani: la pulizia resta possibile, ma solo a chi ha caricato il file
      -- o a un admin. Prima questo ramo non aveva soggetto, e valeva per tutti.
      or (
        (owner_id = ((select auth.uid()))::text or (select private.is_admin()))
        and not exists (
          select 1 from conversations c
          where c.id::text = (storage.foldername(objects.name))[1]
        )
      )
    )
  );
```

Nota: i primi due rami già coprono owner e admin, quindi il quarto è ridondante
*oggi* — va tenuto esplicito perché documenta l'intento "pulizia orfani" e
sopravvive a una futura restrizione dei primi due.

---

### M-3 · `messages_update`: la RLS delega tutto a un trigger

**Dove.** Policy `messages_update` + trigger `trg_messages_blocca_modifiche_altrui`
(live DB).

**Perché.** La policy lascia passare **ogni partecipante** su **ogni** messaggio
della conversazione, in USING e in CHECK. La ragione è buona: reazioni, read
receipt e pin sono UPDATE fatti da chi non è il mittente. La restrizione vera —
"solo il mittente può cambiare il *contenuto*" — vive interamente nel trigger
`messages_blocca_modifiche_altrui`, che confronta `to_jsonb(new)` e
`to_jsonb(old)` meno le colonne collaborative.

Il trigger è scritto bene (la sottrazione di colonne è la forma giusta: una
colonna nuova ricade per difetto nel ramo protetto). Il rilievo è
**architetturale**: una regola di autorizzazione con **un solo punto di
applicazione**, su una tabella da cui un trigger di guardia analogo è **già
stato rimosso** in passato — `20260814210100_drop_trigger_messages_guard_participant_update.sql`.
Se quel trigger sparisce, la RLS da sola consente a ogni partecipante di
riscrivere il testo di qualsiasi messaggio altrui, senza che nulla lo segnali.

**Soluzione.** Non spostare la logica (in RLS non si esprime bene il confronto
per colonna), ma **rendere impossibile che l'assenza passi inosservata**. Un
test di integrazione accanto agli altri, in `src/test/integration/rls.test.js`:

```js
// La regola "solo il mittente modifica il contenuto" ha un solo punto di
// applicazione: il trigger. Questo test è ciò che rende rumorosa la sua
// rimozione — un trigger omonimo è già stato droppato una volta (20260814210100).
it("un partecipante non mittente non può riscrivere il testo altrui", async () => {
  const { data: msg } = await clientAlice.from("messages")
    .insert({ conversation_id: conv.id, sender_id: alice.id, content: "originale" })
    .select().single();

  const { error } = await clientBob.from("messages")
    .update({ content: "riscritto da Bob" }).eq("id", msg.id);

  expect(error).toBeTruthy();
  expect(error.code).toBe("42501");
  const { data: dopo } = await clientAlice.from("messages")
    .select("content").eq("id", msg.id).single();
  expect(dopo.content).toBe("originale");
});

it("un partecipante non mittente PUÒ reagire e marcare come letto", async () => {
  const { error } = await clientBob.rpc("messages_toggle_reaction", { msg_id: msg.id, emoji: "👍" });
  expect(error).toBeNull();   // il ramo collaborativo deve restare aperto
});
```

Il secondo test è importante quanto il primo: senza, una futura stretta della
policy che rompesse reazioni e read receipt passerebbe verde.

---

### M-4 · Politica password applicata solo lato client, e in due copie

**File.** `src/auth/UpdatePasswordScreen.jsx:27` ·
`src/components/shell/AccountSicurezza.jsx:45`

```js
if (password.length < 8) { setErr('La password deve avere almeno 8 caratteri.'); return; }
```

**Perché.** È la stessa regola scritta due volte, e **in nessuno dei due casi è
il livello che decide**. `supabase.auth.updateUser({ password })` è raggiungibile
direttamente su `/auth/v1/user` con il token di sessione: il minimo effettivo è
quello configurato in GoTrue, non questo. Il progetto ha una posizione esplicita
su questo schema — *«il client decide cosa mostrare, il database cosa è
permesso»* — e qui la si sta violando su un controllo di autenticazione, con in
più il difetto che `_shared/requireActiveAdmin.ts` documenta: due copie non
divergono, restano uguali e sbagliate insieme.

Il contesto attenua ma non annulla: la registrazione self-service è disattivata
(S-13), quindi si entra solo su invito, e la leaked-password protection è
un'accettazione consapevole (piano Free, §6 di `SICUREZZA.md`). Ma proprio perché
quel controllo *manca*, il minimo di lunghezza è l'unica barriera rimasta.

**Soluzione — due mosse, la seconda è quella che conta.**

*(1) Una sola definizione lato client*, in `src/lib/validators.js`:

```js
// Minimo allineato a Auth → Password → "Minimum password length" nella
// dashboard Supabase. Se i due numeri divergono, quello che vale è il DB:
// questo serve solo a dare all'utente il messaggio giusto prima del viaggio.
export const PASSWORD_MIN = 8;

export const passwordValida = (messaggio = `La password deve avere almeno ${PASSWORD_MIN} caratteri.`) =>
  (v) => (typeof v === "string" && v.length >= PASSWORD_MIN ? null : messaggio);
```

e nei due componenti:

```diff
- if (password.length < 8) { setErr('La password deve avere almeno 8 caratteri.'); return; }
+ const errPwd = passwordValida()(password);
+ if (errPwd) { setErr(errPwd); return; }
```

*(2) Allineare il livello che decide davvero.* Dashboard Supabase → **Auth →
Password** → `Minimum password length: 8` (e, se disponibile sul piano, i
requisiti di carattere). È gratuito e non richiede il piano Pro — a differenza
della leaked-password protection. Va poi annotato in `docs/SICUREZZA.md §6`
accanto alla riga 1, perché quel paragrafo oggi lascia intendere che sulla
robustezza delle password non ci sia nessuna leva a costo zero.

---

### M-5 · Deriva documentale in `docs/SICUREZZA.md`

**File.** `docs/SICUREZZA.md:87`

```
| `importa_backup(jsonb)` | `private.can_liste()` | ok |
```

**Perché.** Il database applica `private.is_admin()`, non `can_liste()`
(verificato leggendo `pg_get_functiondef` in produzione; il cambio risale a
`20260815231000_importa_backup_solo_admin.sql`, applicata come
`20260815233351`). La deriva è nella direzione *benigna* — il documento
sottostima la protezione reale — ma è comunque una deriva sul documento che
questo progetto usa come riferimento di sicurezza, e che altrove insiste
giustamente sul fatto che va riletto dal database.

Un secondo punto della stessa tabella merita una riga: `elimina_lista_definitivamente`
e `rimuovi_beneficiario_lista` sono protette da `can_liste()`, cioè **admin,
manager e agent**. La prima cancella in modo irreversibile una lista con tutti
i suoi movimenti. È una scelta legittima, ma non è quella che un lettore deduce
da "ok".

**Soluzione.**

```diff
- | `importa_backup(jsonb)` | `private.can_liste()` | ok |
+ | `importa_backup(jsonb,uuid)` | `private.is_admin()` (dal 15 agosto, migrazione `20260815231000`) | ok |
- | `elimina_lista_definitivamente(uuid)` | `private.can_liste()` | ok |
+ | `elimina_lista_definitivamente(uuid)` | `private.can_liste()` — cioè **admin, manager e agent**; richiede che la lista sia già nel cestino | ok, ma vedi nota |
```

E, in coda alla tabella:

> **Nota sull'ampiezza di `can_liste()`.** Cinque delle otto RPC sono aperte a
> `admin + manager + agent`. Per le operazioni di movimento è corretto (è il
> lavoro quotidiano del modulo). Per `elimina_lista_definitivamente`, che è
> irreversibile, è una decisione da riconfermare esplicitamente e non da
> ereditare dal predicato più comodo.

---

### B-1 · `get_migrazioni_applicate()` raggiungibile da `anon` ✔ chiuso il 28 agosto

**Fatto**, con una variazione sul caveat qui sotto. `ping()` (migrazione
`20260828100000_ping_revoca_anon_migrazioni.sql`) è la nuova funzione di
keep-alive, concessa ad `anon`; `get_migrazioni_applicate()` ha perso il grant
`anon` e resta concessa solo ad `authenticated`. Il caveat era fondato:
`scripts/verifica-rpc/verifica-migrazioni.js` non si autenticava — chiamava la
RPC con la sola chiave anon, mai una sessione utente vera — quindi la revoca
LO ROMPE, nel senso che quel controllo non può più leggere le migrazioni
applicate senza un accesso `authenticated` vero.

**28 agosto, seguito**: interpellato su come provisionare quell'accesso,
l'amministratore ha scelto di riusare un proprio account già esistente
piuttosto che farne creare uno dedicato alla CI (la funzione non applica RLS
né richiede `is_active_user()`, quindi qualunque account va bene). Lo script
ora accetta `VERIFICA_MIGRAZIONI_EMAIL`/`VERIFICA_MIGRAZIONI_PASSWORD`: se
presenti fa il login su GoTrue (`accediPerVerificaMigrazioni` in
`scripts/verifica-rpc/migrazioni.js`) e chiama la RPC con quel JWT; se assenti
resta sospeso come prima, con lo stesso avviso. **Restano da fare, fuori dalla
portata di questa sessione**: creare i due *secret* (non variable: una
password è un segreto per davvero) in Settings → Secrets and variables →
Actions → Secrets del repository, con le credenziali scelte dall'amministratore.

**Dove.** Live DB (`acl: anon=X`), advisor `anon_security_definer_function_executable`.
Chiamata da `.github/workflows/keep-supabase-warm.yml:46`.

**Perché.** `docs/SICUREZZA.md §1` argomenta che non espone nulla che non sia
già nel repository. L'argomento regge **finché il repository è pubblico** — e
`package.json` dichiara `"private": true`. Per un osservatore non autenticato,
l'elenco dei 119 nomi di migrazione è una mappa dell'evoluzione dello schema e,
letta di fila, un riassunto della storia di sicurezza del progetto:
`fix_users_privilege_escalation`, `revoke_anon_table_grants`,
`importa_backup_solo_admin`. Non è una falla; è ricognizione gratuita.

**Soluzione.** Lo scopo della funzione nel workflow è solo *toccare Postgres*.
Una funzione che non dice nulla lo fa altrettanto bene:

```sql
-- Ping di keep-alive: attraversa PostgREST e Postgres senza rivelare nulla.
-- STABLE per restare interrogabile in GET, come get_migrazioni_applicate.
create or replace function public.ping()
returns text language sql stable set search_path to '' as $$ select 'ok'::text $$;

revoke execute on function public.ping() from public;
grant   execute on function public.ping() to anon, authenticated;

-- get_migrazioni_applicate resta, ma solo per chi è dentro: la usa
-- scripts/verifica-migrazioni, che gira autenticato.
revoke execute on function public.get_migrazioni_applicate() from anon;
```

```diff
# .github/workflows/keep-supabase-warm.yml
- curl -sS -f -o /dev/null ".../rest/v1/rpc/get_migrazioni_applicate" \
+ curl -sS -f -o /dev/null ".../rest/v1/rpc/ping" \
```

⚠️ Verificare prima che `scripts/verifica-rpc/verifica-migrazioni.js` si
autentichi (non usi la sola anon key): altrimenti la revoca lo rompe.

---

### B-2 · Rubrica interna piatta: il `driver` vede email e telefoni di tutti — decisione confermata il 28 agosto: resta com'è

**Non applicato, di proposito.** Rivisto insieme a chi decide il prodotto il
28 agosto 2026: la rubrica condivisa resta `using (true)` per tutto il team,
`driver` incluso. Non è un difetto tecnico dimenticato — è la stessa
conclusione a cui era già arrivata la migrazione `20260629222802` — quindi
resta fuori dal conteggio dei rilievi chiusi di questo documento, non dentro.
Se la decisione dovesse cambiare in futuro, la soluzione proposta più sotto è
già pronta, ed è accompagnata da un test (`src/test/integration/rls.test.js`,
descrizione «user_contacts — la rubrica è del team, non solo del
proprietario») scritto apposta per bloccarsi finché nessuno la applica
consapevolmente.

**Dove.** `users_select_all USING true`, `user_contacts_select USING true` (live).

**Perché.** È una scelta di prodotto esplicita e documentata (migrazione
`20260629222802`, e il commento in `src/auth/AuthContext.jsx:127-140` è
notevolmente onesto nel correggere una precedente affermazione contraria). Il
rilievo non è che la rubrica sia condivisa, ma che sia **l'unico dato per cui il
ruolo `driver` non ha alcuna restrizione**: è escluso da `clients` (nessuna
policy lo include), dal modulo Liste (`can_liste()` non lo elenca), dalla coda
globale, dalle categorie diverse da `transfer`. Il disegno lo tiene fuori dai
dati commerciali; sui contatti del personale no.

**Soluzione — solo se la si vuole**, perché è una decisione di prodotto e non un
difetto:

```sql
drop policy if exists "user_contacts_select" on public.user_contacts;
create policy "user_contacts_select" on public.user_contacts
  for select to authenticated
  using (
    user_id = (select auth.uid())            -- i propri, sempre
    or (select private.can_view_global_queue())  -- admin, manager, agent
    or (select private.is_admin())
  );
```

`can_view_global_queue()` è già `admin|manager|agent` + attivo + approvato: è il
predicato che descrive "chi lavora sulle pratiche", che è la stessa popolazione
che ha bisogno della rubrica. Se si applica, va aggiornata la matrice §4 di
`SICUREZZA.md`, che oggi non ha una riga per i contatti.

---

### B-3 · La stessa allow-list di host in tre posti scollegati ✔ chiuso il 28 agosto

**Fatto**, sulla forma proposta sotto ma senza importare `originConsentite.ts`
com'era scritto: quel file è TypeScript per una Edge Function Deno, non
eseguibile da uno script Node del repository senza un loader dedicato.
`scripts/verifica-redirect/csp.js` estrae l'elenco di `ORIGIN_PROPRIE` e la
direttiva CSP di `vercel.json` come TESTO (stessa scelta di
`verifica-convenzioni`, che legge il codice invece di eseguirlo) e confronta i
due; `index.js` lo esegue per primo, senza rete né chiave anon, così gira
anche quando il resto dello script è saltato. Ancora due posti su tre: i
Redirect URL della dashboard restano fuori dal repository per definizione, ma
la sonda esistente li copre già dal 22 agosto (C-1). Test in
`src/test/scripts/verificaRedirect.test.js`.

**File.** `supabase/functions/_shared/originConsentite.ts:ORIGIN_PROPRIE` ·
`vercel.json` (direttive `connect-src`/`img-src`/`media-src`, con il ref del
progetto Supabase in chiaro) · dashboard Supabase → Auth → Redirect URLs
(fuori dal repository).

**Perché.** `originConsentite.ts` documenta magnificamente *perché* l'elenco è
esatto e non un pattern. Ma lo stesso insieme di verità vive in altri due posti
che non lo importano e non lo verificano: aggiungere un dominio significa
ricordarsi di tre modifiche, e solo la terza ha una sonda
(`scripts/verifica-redirect/`). Non è una vulnerabilità; è la condizione da cui
nascono le vulnerabilità di configurazione — la stessa che l'A-4 del 22 agosto
ha corretto *dentro* le Edge Function.

**Soluzione.** Estendere `scripts/verifica-redirect/` a controllare tutti e tre,
non solo la dashboard:

```js
// scripts/verifica-redirect/index.js — aggiunta
import { ORIGIN_PROPRIE } from "../../supabase/functions/_shared/originConsentite.ts";
import vercel from "../../vercel.json" with { type: "json" };

// La CSP deve nominare esattamente gli host che le Edge Function riconoscono,
// più il progetto Supabase. Un host aggiunto in un solo posto è la forma in cui
// questa configurazione si rompe: silenziosamente, e solo in produzione.
const csp = vercel.headers[0].headers.find(h => h.key === "Content-Security-Policy").value;
const mancanti = [...ORIGIN_PROPRIE].filter(h => !csp.includes(h) && !csp.includes("'self'"));
if (mancanti.length) {
  console.error(`CSP e ORIGIN_PROPRIE divergono. Host non coperti: ${mancanti.join(", ")}`);
  process.exitCode = 1;
}
```

e aggiungere `npm run verifica:redirect` al workflow che ha già le credenziali
(`verifica-rpc.yml`), non a `ci.yml` che gira senza rete.

---

### B-4 · Anon key ripetuta in chiaro nei workflow ✔ chiuso il 28 agosto

**Fatto**, esattamente sulla forma proposta sotto: `SUPABASE_URL` e
`SUPABASE_ANON_KEY` sono ora `env:` a livello di JOB in entrambi i workflow
(letti da `${{ vars.SUPABASE_URL }}`/`${{ vars.SUPABASE_ANON_KEY }}`), non più
ripetuti a ogni step. ⚠️ Le due repository variable vanno create a mano da chi
amministra il repository — Settings → Secrets and variables → Actions →
Variables — questa sessione non ha accesso alle impostazioni di GitHub per
farlo. Finché non esistono, `vars.SUPABASE_URL`/`vars.SUPABASE_ANON_KEY` sono
stringhe vuote e i tre controlli di `verifica-rpc.yml` degradano come già
fanno quando manca la chiave (avviso, non fallimento) — solo il ping di
`keep-supabase-warm.yml` risulterebbe rosso finché non sono impostate, perché
lì la chiave era finora indispensabile e non facoltativa.

**File.** `.github/workflows/keep-supabase-warm.yml:28,46` ·
`.github/workflows/verifica-rpc.yml:76,86,100`

**Perché.** La chiave è pubblica per disegno e il commento nel workflow lo
argomenta correttamente — non va messa in un *secret*. Il rilievo è di
manutenzione: cinque copie della stessa stringa in due file significano che una
rotazione (dopo un incidente, o alla scadenza `exp: 2096`) è un'operazione a
cinque punti, in cui dimenticarne uno lascia un workflow rosso senza che nessuno
colleghi la causa all'effetto — lo stesso guasto silenzioso che il commento in
`keep-supabase-warm.yml` racconta a proposito dell'header `apikey` mancante.

**Soluzione.** Una *repository variable* (non un secret: le variabili sono
leggibili, ed è corretto che lo siano):

```
Settings → Secrets and variables → Actions → Variables → New
  SUPABASE_URL      = https://vmxvnxsqfisucugcpqlc.supabase.co
  SUPABASE_ANON_KEY = eyJhbGciOi...
```

```diff
+ env:
+   # Variable e non secret: la anon key è pubblica per disegno (vedi
+   # docs/SICUREZZA.md §3). Qui è centralizzata solo perché la rotazione sia
+   # una modifica sola invece di cinque.
+   SUPABASE_URL: ${{ vars.SUPABASE_URL }}
+   SUPABASE_ANON_KEY: ${{ vars.SUPABASE_ANON_KEY }}
  steps:
    - name: Ping Auth (GoTrue)
      run: |
-       curl -sS -f -o /dev/null "https://vmxvnxsqfisucugcpqlc.supabase.co/auth/v1/health" \
-         -H "apikey: eyJhbGciOi..."
+       curl -sS -f -o /dev/null "$SUPABASE_URL/auth/v1/health" -H "apikey: $SUPABASE_ANON_KEY"
```

---

## Cosa è stato verificato e non ha prodotto rilievi

Vale la pena elencarlo: in un audit, ciò che è stato guardato e trovato sano è
un'informazione, e la sua assenza è ciò che fa ripetere lo stesso lavoro.

| Area | Verifica | Esito |
|---|---|---|
| Segreti nel client | `grep` su `src/`, `git ls-files` per `.env` | ✅ solo URL + anon key |
| XSS | `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, `document.write` | ✅ zero occorrenze |
| XSS via `href`/`src` | `ContactActions`, `ContactText`, `AvatarImg`, `TaskAttachments` | ✅ telefoni sanificati a sole cifre; `window.open` sempre con `noopener` |
| CSRF | Bearer token in header, non cookie | ✅ non applicabile per costruzione |
| RLS | 19/19 tabelle di `public` con RLS attiva | ✅ |
| Escalation privilegi | trigger `users_block_privileged_self_update` | ✅ neutralizza `role`/`active`/`pending`/`capacity`/`seniority`/`id` |
| RPC `SECURITY DEFINER` | guardia interna di tutte e 8 quelle esposte a `authenticated` | ✅ tutte protette; `importa_backup` e `reset_completo` admin-only |
| Edge Function | predicato admin unico e testato, CORS con allow-list esatta, `redirectTo` in allow-list | ✅ |
| `send-push` | confronto del secret a tempo costante, segreti dal Vault | ✅ |
| Bucket storage | tutti e tre `public = false`, MIME e dimensioni limitate | ✅ |
| Deriva migrazioni | 119/119 nomi del repo presenti in `schema_migrations` | ✅ nessuna fantasma |
| Header HTTP | CSP bloccante senza `unsafe-inline`, HSTS, `frame-ancestors 'none'` | ✅ |
| `npm audit` | 1 high (`xlsx`), 0 critical/moderate/low | ⚠️ vedi A-1 |

---

## Ordine di esecuzione consigliato

1. **A-3** e **M-1** — due migrazioni piccole, verificabili, che chiudono una
   invarianza che il progetto ha già dichiarato propria. Mezza giornata.
2. **M-5** — correzione documentale, quindici minuti, e riguarda il documento
   che tutti gli altri interventi useranno come riferimento.
3. **A-2** — l'intervento più grande e quello con il valore più alto. Va
   pianificato, non improvvisato: tabella, RPC, tre call site Edge, una tab UI.
4. **M-3** e **M-2** — un test e una policy. Un'ora.
5. **A-1** — il fix definitivo dipende da una decisione infrastrutturale
   (egress verso il CDN, oppure vendorizzazione). La variante Web Worker (c) è
   però indipendente da quella decisione e si può fare subito.
6. **M-4**, **B-1**…**B-4** — igiene, a valle.

> **Un'ultima nota, che vale più di ogni singolo rilievo.** Questo audit ha
> trovato poco perché i precedenti hanno trovato molto e sono stati eseguiti.
> Il rischio che corre oggi il progetto non è una falla non vista: è che
> `docs/SICUREZZA.md` — 875 righe, il documento più prezioso del repository —
> continui a descrivere uno stato che il database ha nel frattempo superato.
> M-5 è un caso piccolo di esattamente questo. Il rimedio non è rileggere il
> documento più spesso: è che i pochi fatti che contano (guardie delle RPC,
> tabelle nel gate RESTRICTIVE, bucket nel gate storage) siano **verificati da
> uno script** contro il database vivo, come già fanno `verifica:advisor` e
> `verifica:redirect`. È l'unico modo perché la documentazione invecchi in
> modo rumoroso invece che silenzioso.
