# Sicurezza & gestione dei dati

Stato al 7 agosto 2026. Progetto Supabase `vmxvnxsqfisucugcpqlc` (tullio), 103
migrazioni nel repo.

> **Revisione del 7 agosto 2026 (A-3 di `docs/AUDIT_ARCHITETTURA_2026-08.md`).**
> La stesura precedente di questo documento (4 agosto) affermava due cose non
> più vere: che la CSP fosse Report-Only (§5, §8 — **blocca** dal 6 agosto) e
> che il vincolo del Junior Agent non fosse applicato dal database (§4 — **lo
> è**, dallo stesso giorno). Non sono imprecisioni di stile: sono le premesse
> su cui §6 costruiva le sue raccomandazioni, ed entrambe rendevano il
> documento più ottimista di quanto la realtà giustificasse in un verso
> (autorizzava a trattare la CSP come non vincolante) e più pessimista
> nell'altro (dava il Junior come vincolo di sola UI). Le sezioni corrette
> portano questa marcatura.

**Come leggere questo documento.** Ogni affermazione è marcata con la sua fonte:

- ✅ **verificato sul database live** — via `get_advisors` / lettura diretta
- 📄 **verificato nel repo** — letto nei file di migrazione o nel sorgente
- ⚠️ **da verificare** — non controllabile da qui, richiede la dashboard

La distinzione non è pedanteria: `docs/CLAUDE.md` (nota ⛔ sulle migrazioni)
avverte che la storia delle migrazioni nel repo **non coincide** con
`schema_migrations` sul database. Un'affermazione basata solo sui file `.sql`
descrive l'intento, non necessariamente ciò che è deployato.

---

## 1. Esito del security advisor (✅ live)

`get_advisors(type: security)` sul progetto di produzione: **0 errori, 10
warning**. Nessun warning di RLS mancante o disabilitata. Il warning
`function_search_path_mutable` della stesura precedente **non compare più**
(vedi §6 punto 2: la correzione è applicata, sotto una versione diversa da
quella che il file in repo dichiara).

| # | Warning | Conta | Valutazione |
|---|---------|-------|-------------|
| 1 | `anon_security_definer_function_executable` su `get_migrazioni_applicate()` | 1 | **Atteso e voluto** — vedi sotto |
| 2 | `authenticated_security_definer_function_executable` | 8 | **Atteso e mitigato** — vedi sotto |
| 3 | `auth_leaked_password_protection` disabilitata | 1 | **Accettata** (12 agosto): richiede il piano Supabase Pro, il progetto resta sul Free per scelta — vedi §6 |

### `get_migrazioni_applicate()` è raggiungibile da `anon`, ed è intenzionale

Nuovo dal 6 agosto (migrazione `get_migrazioni_applicate`), e va spiegato
perché altrimenti sembra una regressione rispetto a `revoke_anon_table_grants`,
che nella stessa sessione toglie ad `anon` ogni privilegio sulle tabelle.

La funzione espone `version`/`name` di `supabase_migrations.schema_migrations`,
non il testo SQL applicato (colonna `statements`, mai selezionata). Serve al
controllo di scarto repo↔produzione (`npm run verifica:migrazioni`), che gira
anche da CI dove non c'è un token utente, **e** al ping di
`keep-supabase-warm.yml`, che dalla revoca dei GRANT ad `anon` (S-16) non ha
più una tabella da interrogare: è l'unico endpoint anon rimasto che tocchi
davvero Postgres, ed è la ragione per cui il grant esiste in questa forma. È
concessa ad `anon` con lo stesso ragionamento già applicato alla chiave anon
stessa: protetta dal non essere un segreto, non dalla segretezza.

> **Correzione del 18 agosto (B-1/B-2 dell'audit del 15 agosto).** Questo
> paragrafo motivava il grant dicendo che i nomi delle migrazioni sono «gli
> stessi nomi dei file **già pubblici nel repository Git**». **Non è vero**: il
> repository è privato (`README.md` chiude con «Progetto privato»), quindi quei
> nomi — `revoke_anon_table_grants`, `rls_task_category_and_pending_gate`,
> `fix_users_privilege_escalation`, `messages_solo_mittente_modifica_contenuto`
> — sono pubblici **solo** attraverso questa funzione, e insieme compongono una
> cronologia aggiornata di dove il sistema è stato irrobustito e quando.
>
> **La decisione resta**, e senza quella premessa regge meglio di prima:
> revocare il grant romperebbe il ping di keep-warm — che esiste proprio perché
> `anon` non ha più GRANT sulle tabelle — per un guadagno che è la sola
> riservatezza di un elenco di nomi, in un progetto il cui modello di minaccia
> non include chi conosce l'URL e la chiave anon. Ciò che era sbagliato era
> l'ARGOMENTO, non la conclusione, ed è il tipo di premessa che va corretta
> subito: chi la legge la usa per decidere il caso successivo.

### Le 8 funzioni SECURITY DEFINER raggiungibili da `authenticated`: perché il warning non è un buco

L'advisor segnala che un utente autenticato può invocarle via
`/rest/v1/rpc/<nome>`. Non può però guardare *dentro* il corpo della funzione,
dove sta il controllo di ruolo. Verificato uno per uno (📄):

| Funzione | Guardia interna | Esito |
|----------|-----------------|-------|
| `reset_completo(text)` | `private.is_admin()` + conferma testuale `RESET TOTALE` | ok |
| `elimina_lista_definitivamente(uuid)` | `private.can_liste()` | ok |
| `importa_backup(jsonb)` | `private.can_liste()` | ok |
| `rimuovi_beneficiario_lista(uuid,uuid)` | `private.can_liste()` | ok |
| `sposta_titolare_lista(uuid,uuid)` | `private.can_liste()` | ok |
| `send_test_push()` | `private.is_active_user()`, scrive solo sulla propria riga | ok |
| `get_vapid_public_key()` | nessuna — **ed è corretto**: restituisce la metà *pubblica* della coppia VAPID, che il browser deve avere per sottoscriversi | ok |
| `get_migrazioni_applicate()` | nessuna — voluto, vedi sopra: non espone nulla che non sia già nel repo | ok |

> ⚠️ **Non "risolvere" questi warning revocando EXECUTE.** Le RPC sono il modo
> in cui l'app chiama queste operazioni: revocare romperebbe il modulo Liste,
> il push e il controllo di scarto delle migrazioni. Il warning è informativo;
> la difesa è nel corpo della funzione (o, per `get_migrazioni_applicate`,
> nell'assenza di qualunque dato sensibile da difendere).
> `get_push_secrets()` — quella che espone la chiave *privata* — è già ristretta
> a `service_role` e infatti non compare nell'elenco.

---

## 2. Copertura RLS

**✅ Live:** nessun lint di RLS mancante o disabilitata sull'intero schema `public`.

**📄 Repo:** 21 tabelle con `ENABLE ROW LEVEL SECURITY` esplicito, e ogni
`CREATE TABLE` presente nelle migrazioni ha la sua `ALTER TABLE … ENABLE RLS`
(verificato per differenza fra i due insiemi: risultato vuoto).

```
categories · clients · comments · conversations · dossier_suppliers · dossiers
lista_beneficiari · lista_history · liste_viaggio · messages · movimenti_lista
notices · notifications · push_subscriptions · suppliers · task_files
task_history · tasks · user_app_preferences · user_contacts · users
```

(`dossiers`, `dossier_suppliers`, `suppliers` appartengono a moduli rimossi
nella sessione 24: le tabelle restano, protette, ma nessun codice le usa.)

### Gerarchia degli helper (📄)

```
private.is_admin()            role = 'admin'            AND active
private.is_manager_or_admin() role IN (admin, manager)  AND active
private.is_active_user()      active
private.can_liste()           role IN (admin, manager, agent) AND active
```

Tutti e quattro hanno vissuto in `public` fino alla migrazione `20260706181011`
(`is_active_user()` era già in `private`): spostati per l'advisor
`function_search_path_mutable`, restando raggiungibili da `authenticated` (le
policy RLS li valutano comunque, `private` non è esposto da PostgREST). Una
`ALTER FUNCTION … SET SCHEMA` sposta l'oggetto, non lo ricrea: le policy già
scritte con `public.is_admin()` continuano a funzionare (referenziano la
funzione per OID), ma un SQL scritto **oggi** deve usare `private.*` — è lo
scarto che ha fatto fallire il primo tentativo della migrazione `A-1`
(`message_templates`, 11 agosto): copiata da `20260630_categories_table`, che
è precedente allo spostamento e quindi ancora scritta con `public.*`.

Tutti `SECURITY DEFINER` + `SET search_path`. Il controllo `active` è stato
aggiunto in `20260621_rls_hardening_active_users`: prima un utente invitato ma
non ancora attivato, con il ruolo già scritto, superava i controlli di ruolo.

### Escalation di privilegi bloccata da trigger (📄)

`20260613080033_fix_users_privilege_escalation` — la policy `users_update_self`
permette a ciascuno di aggiornare la propria riga, il che da solo consentirebbe
di riscriversi `role = 'admin'`. Il trigger `BEFORE UPDATE` ripristina i campi
sensibili per chiunque non sia già admin:

```sql
new.role := old.role;  new.active := old.active;
new.pending := old.pending;  new.capacity := old.capacity;  new.id := old.id;
```

---

## 3. Chiavi esposte nel frontend

📄 Verificato con `grep -r "VITE_" src/`: il bundle contiene **solo**
`VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (`src/lib/supabase.js`).
Nessuna `service_role` key, nessun segreto di Edge Function, nessuna chiave
VAPID privata nel sorgente client.

L'anon key **è pensata per essere pubblica**: è il ruolo `anon` di PostgREST, e
l'unica cosa che le impedisce di leggere il database è la RLS. Che la RLS ci sia
su tutto è quindi il presupposto del punto §2, non un dettaglio.

### Dove vive il token di sessione

```js
createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, … } })
```

📄 Con `persistSession: true` e nessuno `storage` custom, `@supabase/auth-js`
usa **`globalThis.localStorage`** (`GoTrueClient.js:213`).

> ⚠️ Correzione rispetto alla stesura precedente di questo documento, che
> diceva `sessionStorage`. La differenza conta: `localStorage` **sopravvive
> alla chiusura della scheda e del browser**, quindi la finestra di esposizione
> di un token in caso di XSS è molto più ampia di quella descritta prima.
> Resta la scelta corretta per una PWA che deve restare loggata, ma il rischio
> va contabilizzato per quello che è (§5).

---

## 4. Matrice dei permessi

Le regole client sono funzioni pure in `src/lib/permissions.js`; i guard di
scrittura in `src/state/persistence.js` chiamano **le stesse funzioni**, e
`src/test/persistenceGuards.test.js` verifica che i due verdetti coincidano.

| Operazione | Admin | Manager | Senior Agent | Junior Agent | Driver |
|------------|:-----:|:-------:|:------------:|:------------:|:------:|
| Vede task | tutti | propri + coda globale + urgenti | propri + coda globale + urgenti | propri + coda globale + urgenti | solo propri |
| Modifica task | tutti | propri + coda globale | propri + coda globale | **solo assegnati** | solo transfer (propri o in coda) |
| Crea categoria task | tutte | tutte | tutte | tutte **tranne** payment e admin | solo transfer |
| Vista Admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Modulo Liste viaggio | ✅ | ✅ | ✅ | ✅ | ❌ |

Due regole che è facile leggere male:

- **Manager e Senior Agent hanno gli stessi permessi sui task.** La differenza
  fra i due ruoli non passa da `permissions.js`.
- **Junior Agent vede la coda globale ma non può prenderla.** `canViewTask`
  concede, `canEditTask` nega. In UI il bottone "Prendi in carico" è sostituito
  da "Chiedi a un Senior".

### Lato database (📄 + ✅, corretto il 7 agosto — vedi nota di revisione in testa al documento)

Il DB conosce quattro ruoli — `admin`, `manager`, `agent`, `driver` — e il
sotto-ruolo Junior/Senior **ha un posto proprio**, separato da `role` per non
sovraccaricare la colonna su cui poggiano gli helper di ruolo:
`public.users.seniority` (`'senior' | 'junior'`, default `'senior'` —
migrazione `users_seniority`, 6 agosto).

La restrizione del Junior Agent (niente categorie `payment`/`admin`) e quella
del Driver (solo `transfer`) sono cablate in `private.can_use_task_category(text)`
e applicate dal `WITH CHECK` di `tasks_insert` e `tasks_update` (migrazione
`rls_task_category_and_pending_gate`, stesso giorno):

```sql
create or replace function private.can_use_task_category(p_category text)
returns boolean language sql stable security definer set search_path = public as $$
  select case
    when p_category is null then true
    else exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.active and coalesce(u.pending, false) = false
        and case
          when u.role = 'driver' then p_category = 'transfer'
          when u.role = 'agent' and coalesce(u.seniority, 'senior') = 'junior'
            then p_category not in ('payment', 'admin')
          else true
        end
    )
  end;
$$;
```

Un Junior che chiamasse l'API Supabase direttamente, con il proprio token, **non
passa più**: il vincolo era di sola UI, ora è anche di RLS. `seniority` è
protetto dal self-update esattamente come `role`/`active`/`pending`/`capacity`
— stesso trigger `BEFORE UPDATE` che già li ripristinava (§2), esteso nella
stessa migrazione — altrimenti un Junior si sarebbe promosso Senior con un
`PATCH` sulla propria riga.

> Il vincolo va SOLO nel `WITH CHECK` di `tasks_update`, non nello `USING`:
> nello `USING` impedirebbe a un Driver di chiudere un task che ha già in
> carico se nel frattempo un manager ne ha cambiato la categoria — bloccandolo
> fuori dal proprio lavoro invece di limitarsi a impedirgli di assegnarsene di
> nuove categorie non sue.

### Edge Function (📄)

| Funzione | Controllo |
|----------|-----------|
| `invite-user` | token valido + `requireActiveAdmin`, altrimenti 401/403; ruolo richiesto filtrato su whitelist |
| `delete-user` | token valido + `requireActiveAdmin`, altrimenti 401/403 |
| `delete-account` | solo token valido — corretto: è self-service sul proprio account |
| `send-push` | 401 senza autorizzazione; i segreti via `get_push_secrets()`, solo `service_role` |

> 🔴 **Revisione dell'11 agosto 2026 (C-1 di `docs/AUDIT_ARCHITETTURA_2026-08-11.md`).**
> Le prime due righe dicevano «token valido + `caller.role === 'admin'`». La
> descrizione era **esatta**, ed è per questo che questo documento non si è mai
> accorto del problema: il difetto non era uno scarto fra documento e codice —
> di quelli il repo ha già imparato a difendersi — ma fra **la stessa regola
> scritta in due linguaggi**. `private.is_admin()`, dopo la migrazione
> `20260806130000`, è `role = 'admin' AND active = true AND coalesce(pending,
> false) = false`; le due Edge Function guardavano il solo `role`. E siccome
> girano con la `service_role`, che bypassa integralmente la RLS, quel
> controllo non era una difesa in profondità: era l'unica difesa.
>
> Ne passavano due categorie di chiamante che **ogni altro strato del sistema
> respinge**:
>
> 1. **l'admin disattivato** — `active = false` è il modo con cui il pannello
>    Team revoca i privilegi (`TOGGLE_TEAM_MEMBER_ACTIVE`), ma è una colonna
>    applicativa e non tocca la sessione di autenticazione. Poteva ancora
>    invitare chiunque e **hard-eliminare qualunque utente**, compresi gli
>    admin che lo avevano appena revocato;
> 2. **l'admin invitato e mai approvato** — `invite-user` pre-crea la riga con
>    `pending: true` e l'invitato ottiene una sessione valida dal link. L'app lo
>    ferma (`PendingScreen`), il database lo ferma, le due funzioni no: il gate
>    di approvazione non copriva le due operazioni più distruttive del sistema.
>
> Il predicato ora è uno solo, puro e testato
> (`supabase/functions/_shared/adminPredicate.ts`), applicato da
> `requireActiveAdmin`. **Committare non è applicare** (§6): finché le due
> funzioni non sono ridistribuite con `supabase functions deploy invite-user
> delete-user`, in produzione vale ancora la versione vecchia.
>
> Resta aperto il difetto di fondo che rendeva sfruttabile il punto 1, e che è
> più largo di C-1: **disattivare un utente non revoca la sua sessione.**
> `active` è una colonna, non un ban. La RLS lo copre su ogni tabella (policy
> RESTRICTIVE `rls_active_only`), quindi oggi non c'è un secondo percorso noto
> — ma ogni futuro percorso server-side che non attraversi la RLS ricadrà nella
> stessa trappola, e dipenderà da chi si ricorda di controllare `active` al suo
> interno. La correzione strutturale è accompagnare la disattivazione a un
> `auth.admin.updateUserById(id, { ban_duration })`, com'è già per
> `delete-account`: suggerimento strategico n. 3 dell'audit dell'11 agosto.

---

## 5. XSS / CSRF

### XSS

📄 `grep -r "dangerouslySetInnerHTML\|innerHTML" src/` → **0 occorrenze**.
📄 Nessuna libreria markdown in `package.json`: il testo utente non passa mai
per un renderer HTML, viene sempre interpolato da React (che fa escaping).

> ⚠️ Correzione rispetto alla stesura precedente, che attribuiva la protezione a
> "un parser markdown sicuro". Non esiste un parser markdown nel progetto —
> il che è meglio, ma la ragione dichiarata era sbagliata.

Superficie residua: il token in `localStorage` (§3) è leggibile da qualunque JS
in esecuzione sull'origin. Con zero sink HTML l'esposizione è teorica, e dal 6
agosto è coperta anche dalla mitigazione strutturale — la CSP **blocca**
(§8), non solo segnala.

### CSRF

Il token viaggia come header `Authorization: Bearer`, mai come cookie: il
browser non lo allega automaticamente a richieste cross-site, quindi la classe
CSRF classica non si applica.

### Header HTTP (📄 `vercel.json`)

| Header | Valore |
|--------|--------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Permissions-Policy` | `camera=(), microphone=(self), geolocation=(), payment=(), usb=(), interest-cohort=()` |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Content-Security-Policy` | vedi §8 |

La CSP è **bloccante** dal 6 agosto (§8): non solo segnala le violazioni, le
impedisce. Ogni nuova origine — script, font, endpoint, CDN — va aggiunta a
`vercel.json` **prima** di essere usata: senza, la richiesta viene bloccata in
produzione, senza il periodo di osservazione che una fase Report-Only avrebbe
dato.

---

## 6. Cosa fare, in ordine di rapporto valore/costo

1. ~~**Attivare la leaked password protection**~~ → **accettata così com'è
   (12 agosto)**: dashboard → Auth → Password, un interruttore che confronta
   le password con HaveIBeenPwned — ma è una funzione del piano Supabase
   **Pro**, e chi amministra il progetto ha deciso di restare sul piano
   **Free**. Non è un interruttore dimenticato: è un costo ricorrente non
   approvato, deciso esplicitamente dopo tre audit di fila che lo avevano
   riconfermato `WARN` (ST-14 del 10 agosto, B-2 dell'8, B-3 dell'11).
   `auth_leaked_password_protection` è ora nominato in `AVVISI_ACCETTATI` di
   `scripts/verifica-advisor/advisor.js`, con lo stesso motivo. Se il piano
   cambiasse, questo è il punto da riaprire: riattivare dalla dashboard e
   togliere il nome da quell'elenco.
2. ~~**`SET search_path` su `public.set_updated_at`**~~ → **✅ applicata**, ma
   sotto una versione diversa da quella che il file nel repo dichiara: vedi la
   nota sotto. `function_search_path_mutable` infatti non compare più
   nell'advisor (§1).
3. ~~**Aggiungere una CSP**~~ → **fatta, e promossa a bloccante il 6 agosto**
   (§8). Non c'è più un passo successivo su questo punto.
4. ~~**Decidere sul sotto-ruolo Junior**~~ → **fatto**: colonna
   `users.seniority` + predicato RLS `private.can_use_task_category` cablato
   nel `WITH CHECK` di `tasks_insert`/`tasks_update` (§4).

> ✅ **Nota sulla migrazione del punto 2 — riconciliata, non fantasma.** Il
> file resta `20260804230000_set_updated_at_search_path.sql`, ma la versione
> **effettivamente applicata e registrata** in
> `supabase_migrations.schema_migrations` è `20260806090457`, stesso nome. È
> lo scarto fra nomi di file e versioni registrate di cui avvisa
> `docs/CLAUDE.md` (nota ⛔ sulle migrazioni): non un file mai eseguito, ma
> eseguito sotto un'altra versione — probabilmente riscritto e riapplicato in
> un secondo passaggio senza rinominare il file nel repo. `verifica:migrazioni`
> confronta per **nome**, non per versione, ed è per questo che non lo segnala
> come mancante.
>
> Resta vera la lezione di fondo, che vale la pena ripetere perché su questo
> progetto è già costata tre incidenti — il peggiore lasciò il modulo Liste in
> produzione senza controlli di ruolo per giorni, con `reset_completo`
> chiamabile da chiunque (vedi `docs/MIGRAZIONI_SUPABASE.md`): **committare
> non è applicare**, e la verifica va fatta leggendo lo stato del database, non
> supponendolo dal contenuto del repo. Procedura completa in
> `docs/MIGRAZIONI_SUPABASE.md`.

Non urgenti, ma da mettere a piano: audit log sulle operazioni sensibili
(cambio ruolo, eliminazione categorie), e una rilettura periodica delle policy
RLS — `get_advisors` è gratis e va rilanciato dopo ogni DDL.

---

## 7. Copertura di test sui permessi

`vitest run` sui quattro file rilevanti → **137 test verdi**:

| File | Cosa blinda |
|------|-------------|
| `permissions.test.js` | matrice ruoli sulle funzioni pure |
| `persistenceGuards.test.js` | guard di persistenza ≡ verdetto del reducer |
| `reducerPurity.test.js` | il reducer non decide sui globali mutabili |
| `syncedDispatch.test.jsx` | un'azione negata non raggiunge il server |

> ⚠️ Correzione rispetto alla stesura precedente, che dichiarava "269 test
> case": quel numero era ottenuto sommando le **righe** dei file di test, non i
> test. Il valore reale, misurato, è 137.

Questi test coprono il livello client, e dal 6 agosto le regole che
verificano sono scritte **due volte** — anche in `private.can_use_task_category`
e nelle policy RLS (§4). È esattamente la configurazione a rischio di
divergenza silenziosa che il registry di persistenza (`persistence.js`) esiste
per evitare in un altro strato.

**M-4 (`docs/AUDIT_ARCHITETTURA_2026-08.md`), risolto il 7 agosto:**
`src/test/integration/rls.test.js` attraversa il confine che gli altri quattro
file non attraversano — apre una connessione autenticata con il token di un
`driver`, di un `agent` con `seniority='junior'` e di un utente `pending`, e
verifica che **il database** rifiuti davvero (codice `42501`), oltre a un
tentativo di auto-escalation di `role` che il trigger deve neutralizzare senza
errore. Richiede un progetto di **staging** con tre utenti provisionati, mai
produzione: senza `RLS_TEST_URL`/`RLS_TEST_ANON_KEY` il file resta `describe.skip`
— zero rete, zero side effect — sia in `vitest run` di default sia in CI.
Lanciarlo davvero con `npm run test:rls`; setup dettagliato nell'intestazione
del file.

Non è più vero, quindi, che «la conformità fra i due livelli è garantita dalla
lettura, non da un test»: lo è ancora per chi non ha ancora configurato un
progetto di staging, ma il test esiste ed è pronto a intercettare la
divergenza il giorno in cui quel progetto c'è.

---

## 8. Content-Security-Policy (bloccante dal 6 agosto 2026)

Aggiunta in `vercel.json`, prima in modalità Report-Only, poi **promossa a
bloccante** il 6 agosto dopo il periodo di osservazione descritto più sotto:
il browser rifiuta ogni richiesta o esecuzione che violi la policy, non si
limita più a segnalarla in console.

```
default-src 'self';
script-src  'self';
style-src   'self' https://fonts.googleapis.com;
font-src    'self' https://fonts.gstatic.com;
img-src     'self' data: blob: https://vmxvnxsqfisucugcpqlc.supabase.co;
media-src   'self' blob: https://vmxvnxsqfisucugcpqlc.supabase.co;
connect-src 'self' https://vmxvnxsqfisucugcpqlc.supabase.co
                   wss://vmxvnxsqfisucugcpqlc.supabase.co;
worker-src 'self'; manifest-src 'self';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
```

📄 Trascritta da `vercel.json`, non riscritta a mano: `media-src` include
l'origine Supabase (i messaggi vocali della chat sono file firmati serviti da
lì, non `blob:` puro) — un dettaglio che la stesura precedente di questo
documento ometteva.

### Perché ogni direttiva è così

- **`script-src 'self'`, senza `'unsafe-inline'` né `'unsafe-eval'`.** È la
  direttiva che porta quasi tutto il valore della policy. Regge perché il build
  Vite non emette script inline (📄 `dist/index.html`: zero tag `<script>`
  inline, solo `<script type="module" src="/assets/…">`) e perché **nessun
  bundle usa `eval` o `new Function`** — verificato su tutti i chunk prodotti,
  SheetJS compreso, che era il candidato più probabile.
- **`style-src 'self'`, senza `'unsafe-inline'` — dal 13 agosto.** Era
  l'**unica direttiva permissiva rimasta** in questa policy, e non lo è più:
  i due componenti che iniettavano un `<style>` nel documento (`GlobalStyles`
  e `ListeStyles`) sono diventati `src/styles/global.css` e
  `src/components/liste/liste.css`, importati da Vite ed emessi come `<link>`
  serviti da `self`. Era il terzo effetto di M-1 (audit del 12 agosto) e il
  solo che pagasse sulla sicurezza. L'origine `fonts.googleapis.com` resta
  perché il foglio dei font è caricato da lì con un `<link>` in `index.html`.

  *Gli `style={{…}}` di React non c'entrano, e questa volta è stato
  verificato invece che dedotto*: React scrive le proprietà via CSSOM
  (`node.style.setProperty`), che la CSP non intercetta — solo l'**attributo**
  `style` scritto nel markup o via `setAttribute` lo sarebbe. Il build reale,
  servito con la policy qui sopra e caricato in Chromium, rende la schermata di
  login con 13 elementi che portano un attributo `style` non vuoto e solleva
  **zero violazioni**. È una correzione a quanto §4-bis dell'audit del 12
  agosto aveva scritto («il risultato passa comunque dall'attributo style»):
  era sbagliato, e sarebbe costato il fix se nessuno l'avesse riprovato.

  Resta vero che `'unsafe-inline'` sugli stili sarebbe stata una concessione
  meno grave di quella sugli script — non permette esecuzione di codice — ma
  un `<style>` iniettato basta a coprire la pagina con un falso login o a
  esfiltrare per selettore d'attributo: questa direttiva ora lo nega.
- **`connect-src` con l'origine Supabase esatta**, non `https://*.supabase.co`.
  Il wildcard lascerebbe esfiltrare dati verso un progetto Supabase
  dell'attaccante. ⚠️ **Va aggiornata se il progetto cambia ref.**
- **`blob:` in `img-src` e `media-src`**: anteprime allegati e riproduzione dei
  messaggi vocali. `data:` per le icone inline.
- **`frame-ancestors 'none'`** duplica `X-Frame-Options: DENY` — l'header
  vecchio resta per i browser che ignorano la direttiva.

### Cosa è stato verificato davvero, e cosa no

La policy è stata provata **in modalità bloccante** (non Report-Only) contro il
build reale, servito in locale e caricato con Chromium:

| Esito | |
|---|---|
| Violazioni CSP | **0** |
| Request fallite | **0** |
| Errori console | **0** |
| Schermata di login | renderizzata correttamente |
| Origini contattate | solo `self`, `fonts.googleapis.com`, il progetto Supabase |

Esercitati esplicitamente: il caricamento del bundle e dei chunk, l'`@import`
verso Google Fonts (iniettando gli stessi identici blocchi `<style>` di
`FontLoader` e `ListeStyles`, che altrimenti non montano fuori dall'area
autenticata), una richiesta di login verso Supabase, e URL `blob:`/`data:` per
media e immagini.

**Ripetuta il 13 agosto** sulla policy senza `'unsafe-inline'`, con la stessa
procedura (build reale servito in locale con l'header, Chromium): 0 violazioni,
2 fogli di stile applicati (il `<link>` di Vite e quello di Google Fonts), 13
elementi con attributo `style` non vuoto correttamente resi, schermata di login
invariata. La riga «i blocchi `<style>` iniettati a mano» qui sopra descrive la
verifica del 6 agosto: quei blocchi **non esistono più**, e la nuova policy li
rifiuterebbe — che è esattamente il punto.

> ⚠️ **Limiti della verifica, dichiarati — e ancora validi dopo la promozione.**
> (1) La sessione di prova non era autenticata — l'app oltre il login non è
> stata percorsa, quindi restano non esercitati il realtime WebSocket, gli
> upload su Storage e le immagini profilo. (2) Il recupero dei file di font da
> `fonts.gstatic.com` non è osservabile da questo ambiente, che non raggiunge
> Google Fonts dal browser: si sa che la CSP **non blocca** l'`@import`
> (nessuna violazione sollevata), non che i font arrivino davvero. La
> direttiva `font-src` è quella canonica per Google Fonts, ma resta l'anello
> non provato.
>
> La promozione a bloccante (§6, 6 agosto) **non ha richiuso questi due
> limiti**: non c'è stata una seconda sessione di verifica sulle aree non
> coperte dalla prima, e restano il punto da guardare per primo se qualcosa
> smette di funzionare in una di quelle quattro aree (chat con vocali, upload
> allegati/foto profilo, modulo Liste dietro login, o più in generale il
> realtime).

### Cosa monitorare, ora che è bloccante

Le violazioni compaiono nella **console del browser** — non c'è endpoint di
raccolta, quindi niente `report-uri`/`report-to`: aggiungerne uno significa
scegliere (e pagare) un servizio, decisione ancora aperta e separata da questo
documento. Senza quell'endpoint, una direttiva troppo stretta su un percorso
poco battuto **fallisce in silenzio per chiunque non abbia i DevTools aperti**:
una richiesta bloccata dalla CSP non produce un errore di rete distinguibile
per l'utente, produce una funzionalità che "non fa niente".

Conseguenza pratica: se in produzione compare un problema che ricade in una
delle quattro aree del riquadro sopra — un vocale che non parte, un upload che
non completa, una foto profilo che non carica — **il primo sospetto va alla
CSP**, non al codice applicativo, proprio perché è l'unica parte del percorso
mai stata esercitata prima della promozione. Aprire la console e cercare righe
`Content-Security-Policy: … blocked` è la diagnosi di un minuto che evita ore
sul codice sbagliato.

---

## 9. Redirect URL di Auth: la superficie che vive fuori dal repository (⚠️ + 📄 sonda)

> **Aggiunta il 22 agosto 2026 — C-1 dell'audit di architettura e sicurezza di
> quel giorno.** Fino a questa sezione il documento descriveva otto superfici,
> tutte residenti nel repository (RLS, grant, RPC, CSP, header, Edge Function).
> La nona non c'era, ed è quella che aveva il buco. Non è un caso: tutto ciò
> che sta in `supabase/migrations/` aveva già uno script che lo confronta con
> la produzione, ciò che sta nella **dashboard** Supabase non aveva nessuno.

### Il difetto

`docs/ROADMAP_GO_LIVE.md` registrava come stato di go-live:

```
Redirect URLs: *.vercel.app/**
```

GoTrue valida il parametro `redirect_to` contro quella lista. Il jolly
autorizza **qualunque** host sotto `vercel.app` — un dominio in cui chiunque
può prendersi un sottodominio creando un progetto gratuito.

La catena non richiede alcun privilegio iniziale:

1. l'attaccante registra `<qualcosa>.vercel.app` e vi pubblica una pagina che
   legge `location.hash`;
2. chiama `POST /auth/v1/recover` con la chiave `anon` (pubblica per
   costruzione: sta nel bundle e, in chiaro, in `keep-supabase-warm.yml`),
   l'email della vittima e `redirect_to` verso il proprio host;
3. la vittima riceve un'email **autentica**, dal progetto vero, e clicca;
4. GoTrue verifica il token e redirige all'host dell'attaccante con
   `#access_token=…&refresh_token=…` nel fragment.

A quel punto l'attaccante ha una sessione **legittima**. Nessuno degli strati
descritti nelle sezioni precedenti interviene, e non per una loro lacuna: la
CSP (§8) protegge l'origin del sito, non il browser della vittima su un altro
dominio; le policy RLS (§2) filtrano per `auth.uid()`, che qui è quello vero;
`requireActiveAdmin` (§4) verifica un token che è valido davvero. Se la vittima
è admin seguono `invite-user`, `delete-user`, `reset_completo` e l'intera
anagrafica clienti.

### Lo stato atteso (⚠️ da tenere allineato a mano nella dashboard)

Supabase → Authentication → URL Configuration:

| Campo | Valore atteso |
|---|---|
| Site URL | `https://tullio-seven.vercel.app` |
| Redirect URLs | `https://tullio-seven.vercel.app/**` |
| | `https://tullio-tooco-s-projects.vercel.app/**` |
| | `https://tullio-git-main-tooco-s-projects.vercel.app/**` |
| | `http://localhost:5173/**` — solo se serve in sviluppo |

Sono i tre domini che il progetto Vercel possiede davvero (verificati il 22
agosto 2026 sull'account `tooco-s-projects`, progetto `tullio`), più
l'ambiente locale. **Nessuna voce con un jolly su `vercel.app`.**

### Perché niente jolly per le preview, nemmeno con lo scope del team

La tentazione è `https://tullio-*-tooco-s-projects.vercel.app/**`, che sembra
sicuro perché lo scope del team non è replicabile. Non lo è: un hostname
`.vercel.app` che **nessun deployment ha ancora rivendicato** può essere
occupato da chi crea un progetto con quel nome. Un jolly su quel pattern
riapre la stessa classe di C-1, solo più stretta.

E gli hostname da coprire non sono nemmeno enumerabili in anticipo. Il branch
di questa stessa correzione ha prodotto:

```
tullio-git-claude-app-architecture-secu-cfc668-tooco-s-projects.vercel.app
```

cioè `tullio-git-<slug troncato>-<hash>-<scope>`: Vercel accorcia i nomi di
branch lunghi e ci appende un hash, quindi la forma pulita
`tullio-git-<branch>-<scope>.vercel.app` vale solo per i branch dal nome
corto — `main` fra questi. Qualsiasi allow-list che voglia coprire le preview
è perciò costretta a un jolly, ed è il jolly il problema.

E soprattutto: **non serve**. `redirect_to` conta unicamente per i link di
invito e di reset password, che arrivano per email e puntano alla produzione.
Il login con password su una preview non usa `redirect_to` e continua a
funzionare senza alcuna voce in lista. Ciò che si perde togliendo le preview
dalla allow-list è solo «cliccare un link di reset e atterrare su una
preview», che non è un flusso che qualcuno usa. Se un giorno servisse davvero,
la risposta è un **dominio proprio** (`*.dominio-agenzia.it` non è
rivendicabile da terzi), non un jolly su `vercel.app`.

### Come si verifica che sia ancora così (📄 `scripts/verifica-redirect/`)

`npm run verifica:redirect` — eseguito a ogni push su `main` e ogni notte da
`.github/workflows/verifica-rpc.yml`.

La sonda chiama `GET /auth/v1/verify` con un token **deliberatamente invalido**
e un `redirect_to` verso un hostname canarino che il progetto non possiede
(`tullio-canarino-allowlist.vercel.app`). Nessuna email parte, nessuna sessione
viene emessa, e la risposta non viene mai seguita: si legge il solo header
`Location`, che è dove GoTrue dichiara quale `redirect_to` ha accettato.

Due dettagli che rendono il controllo affidabile, entrambi documentati in
`scripts/verifica-redirect/redirect.js`:

- **GoTrue non risponde con un errore** a un `redirect_to` non consentito:
  ripiega in silenzio sul Site URL. «Nessun errore» non prova quindi nulla, e
  il verdetto si legge esclusivamente dall'host del `Location`.
- **Le sonde sono due.** Con la sola sonda negativa il controllo passerebbe
  anche se GoTrue smettesse del tutto di onorare `redirect_to` — verde per il
  motivo sbagliato, la stessa classe di guasto dell'header `apikey` mancante
  in `keep-supabase-warm.yml` e dell'exit 0 silenzioso di `verifica-advisor`
  prima di ST-14. La sonda positiva chiede un redirect verso la produzione, che
  **deve** essere consentito: se non lo è, l'esito è *inconcludente*, che è uno
  stato distinto sia da «passato» sia da «fallito».

Il canarino inizia per `tullio-` di proposito: così la stessa sonda copre anche
**A-4**, cioè il fatto che `supabase/functions/_shared/cors.ts` e
`safeRedirect` in `invite-user` trattassero come fidato qualunque
`tullio-*.vercel.app` — un insieme che chiunque può ampliare.

✅ **A-4 è chiuso** (22 agosto). La regola non è più un prefisso scritto in due
copie: sta in `supabase/functions/_shared/originConsentite.ts`, in un ELENCO
esatto dei tre host che il progetto possiede, importato da `cors.ts` (per
l'header CORS) e da `invite-user` (per `redirectTo`). Il modulo è puro e senza
import — come `adminPredicate.ts` e per la stessa ragione — quindi la regola è
verificata da `src/test/originConsentite.test.js` senza deployare nulla, con
un caso per ciascun hostname *registrabile da terzi* che la vecchia regola
accettava (`tullio-qualsiasi-cosa`, `tullio-git-main`,
`tullio-git-x-y-tooco-s-projects`, un sottodominio di un host consentito).

⚠️ Il prezzo, dichiarato: dalle URL di deployment **effimere** le Edge Function
non sono più utilizzabili, perché quegli hostname cambiano a ogni push e non
possono stare in un elenco. L'alias di branch `tullio-git-main-…` è stabile ed
è in lista; per una preview diversa si aggiunge il suo host a `ORIGIN_PROPRIE`
per la durata della prova. È la stessa scelta fatta qui sopra per la allow-list
di Auth, e le due devono restare d'accordo: una regola più larga da una parte è
la scorciatoia che riapre l'altra.

### ✅ Verificato in produzione — 22 agosto 2026

La allow-list è stata ristretta nella dashboard e il controllo è stato eseguito
sul progetto reale ([run 32567591252](https://github.com/tucobpjmr/TULLIO/actions/runs/32567591252)):

```
sonda positiva  → HTTP 303  Location: https://tullio-seven.vercel.app/#error=access_denied&…
sonda canarino  → HTTP 303  Location: https://tullio-seven.vercel.app#error=access_denied&…

✓ il canarino tullio-canarino-allowlist.vercel.app è stato rifiutato e GoTrue
  è ripiegato sul Site URL. La allow-list non ammette domini estranei.
```

Due cose che questa esecuzione ha stabilito, e che prima erano assunzioni:

1. **GoTrue risponde `303` e ripiega in silenzio sul Site URL**, senza alcun
   errore. La sonda era stata scritta su questa ipotesi, dedotta dal
   comportamento documentato e provata solo contro un finto GoTrue locale: ora
   è confermata sul servizio vero.
2. **La sonda positiva è stata davvero onorata, non è ripiegata anche lei.** Lo
   prova una differenza di un carattere: la positiva torna **con** lo slash
   finale (`…vercel.app/`), cioè esattamente il `redirect_to` inviato, mentre
   il canarino torna **senza** (`…vercel.app`), cioè il Site URL configurato.
   Se fossero ripiegate entrambe, le due Location sarebbero identiche. Non è
   una prova che era stata progettata — è un dettaglio emerso dall'esecuzione
   reale — ma rafforza il controllo di controllo descritto sopra, e vale la
   pena saperlo se un domani quelle due righe dovessero coincidere: quello
   sarebbe il segnale che la sonda ha smesso di distinguere i due casi.
