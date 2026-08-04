# Sicurezza & gestione dei dati

Stato al 4 agosto 2026. Progetto Supabase `vmxvnxsqfisucugcpqlc` (tullio), 93 migrazioni nel repo.

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

`get_advisors(type: security)` sul progetto di produzione: **0 errori, 9 warning**.
Nessun warning di RLS mancante o disabilitata.

| # | Warning | Conta | Valutazione |
|---|---------|-------|-------------|
| 1 | `function_search_path_mutable` su `public.set_updated_at` | 1 | **Da correggere** — vedi §6 |
| 2 | `authenticated_security_definer_function_executable` | 7 | **Atteso e mitigato** — vedi sotto |
| 3 | `auth_leaked_password_protection` disabilitata | 1 | **Da attivare** — vedi §6 |

### Le 7 funzioni SECURITY DEFINER: perché il warning non è un buco

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

> ⚠️ **Non "risolvere" questo warning revocando EXECUTE.** Le RPC sono il modo in
> cui l'app chiama queste operazioni: revocare romperebbe il modulo Liste e il
> push. Il warning è informativo; la difesa è nel corpo della funzione.
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
public.is_admin()            role = 'admin'            AND active
public.is_manager_or_admin() role IN (admin, manager)  AND active
public.is_active_user()      active
private.is_admin()           idem, fuori dallo schema esposto
private.can_liste()          role IN (admin, manager, agent) AND active
```

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

### Lato database (📄)

Il DB conosce quattro ruoli — `admin`, `manager`, `agent`, `driver` — e
**non ha il sotto-ruolo Junior/Senior**: nello schema sono entrambi `agent`.

> ⚠️ **Asimmetria da conoscere.** La restrizione del Junior Agent (niente task
> dalla coda globale, niente categorie payment/admin) è applicata dal client e
> dal guard di persistenza, **non dalla RLS**. Un Junior che chiamasse l'API
> Supabase direttamente, con il proprio token, passerebbe: per il database è un
> `agent`. Non è un buco di riservatezza (i dati sono comunque quelli del suo
> team) ma è un limite reale del modello, e va tenuto presente prima di
> descrivere il vincolo Junior come una garanzia di sicurezza. Renderlo tale
> richiede una colonna sotto-ruolo in `public.users` e un predicato RLS che la
> legga.

### Edge Function (📄)

| Funzione | Controllo |
|----------|-----------|
| `invite-user` | token valido + `caller.role === 'admin'`, altrimenti 403; ruolo richiesto filtrato su whitelist |
| `delete-user` | token valido + `caller.role === 'admin'`, altrimenti 403 |
| `delete-account` | solo token valido — corretto: è self-service sul proprio account |
| `send-push` | 401 senza autorizzazione; i segreti via `get_push_secrets()`, solo `service_role` |

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
in esecuzione sull'origin. Con zero sink HTML l'esposizione è teorica, ma la
mitigazione strutturale — una CSP — **non c'è**.

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
| `Content-Security-Policy-Report-Only` | vedi §8 |

La CSP è stata aggiunta **in modalità Report-Only** (§8): oggi non blocca nulla,
segnala soltanto. Fino a quando non viene promossa a header bloccante, la
mitigazione strutturale contro l'esfiltrazione del token resta assente.

---

## 6. Cosa fare, in ordine di rapporto valore/costo

1. **Attivare la leaked password protection** (⚠️ dashboard → Auth → Password).
   Un interruttore. Supabase confronta le password con HaveIBeenPwned.
   **Non fattibile da qui**: è impostazione di progetto, non DDL.
2. ~~**`SET search_path` su `public.set_updated_at`**~~ → migrazione **scritta**
   in `20260804230000_set_updated_at_search_path.sql`, **non applicata**: vedi
   la nota sotto.
3. ~~**Aggiungere una CSP**~~ → **fatta in Report-Only**, vedi §8. Resta da
   **promuoverla a bloccante** dopo qualche giorno di osservazione.
4. **Decidere sul sotto-ruolo Junior.** O si porta a schema (colonna + RLS), o
   si documenta esplicitamente come vincolo di UI e non di sicurezza. Oggi non
   è né l'una né l'altra cosa.

> ⚠️ **La migrazione del punto 2 non è stata applicata al database.** Il file è
> nel repo e la PR lo porta con sé, ma scrivere DDL sulla produzione è una
> decisione di chi possiede il progetto, non un effetto collaterale di un
> refactor. Va applicata a mano dalla dashboard (SQL Editor) o con
> `apply_migration`. **Non** con `supabase db push`, per la ragione ⛔ già
> documentata in `docs/CLAUDE.md`: la storia nel repo non coincide con
> `schema_migrations` e il push rigiocherebbe decine di migrazioni.

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

Questi test coprono il livello client. **Non c'è copertura automatica delle
policy RLS**: nessun test apre una connessione con il token di un `driver` per
verificare che il database rifiuti davvero. È il buco di copertura più
significativo dell'area sicurezza — la conformità fra i due livelli oggi è
garantita dalla lettura, non da un test.

---

## 8. Content-Security-Policy (Report-Only)

Aggiunta in `vercel.json`. **`Content-Security-Policy-Report-Only` non blocca
nulla**: il browser valuta la policy e segnala le violazioni in console, la
pagina continua a funzionare esattamente come prima. È il modo di scoprire cosa
si romperebbe senza romperlo.

```
default-src 'self';
script-src  'self';
style-src   'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src    'self' https://fonts.gstatic.com;
img-src     'self' data: blob: https://vmxvnxsqfisucugcpqlc.supabase.co;
media-src   'self' blob:;
connect-src 'self' https://vmxvnxsqfisucugcpqlc.supabase.co
                   wss://vmxvnxsqfisucugcpqlc.supabase.co;
worker-src 'self'; manifest-src 'self';
base-uri 'self'; form-action 'self'; frame-ancestors 'none'; object-src 'none'
```

### Perché ogni direttiva è così

- **`script-src 'self'`, senza `'unsafe-inline'` né `'unsafe-eval'`.** È la
  direttiva che porta quasi tutto il valore della policy. Regge perché il build
  Vite non emette script inline (📄 `dist/index.html`: zero tag `<script>`
  inline, solo `<script type="module" src="/assets/…">`) e perché **nessun
  bundle usa `eval` o `new Function`** — verificato su tutti i chunk prodotti,
  SheetJS compreso, che era il candidato più probabile.
- **`style-src` con `'unsafe-inline'`.** Non è evitabile oggi: `FontLoader`
  (`VoyageDesk.jsx`) e `ListeStyles` (`liste/listeStyles.jsx`) inseriscono
  blocchi `<style>` nel documento. L'origine `fonts.googleapis.com` serve
  perché quei blocchi contengono `@import url(https://fonts.googleapis.com/…)`.
  Va detto che `'unsafe-inline'` sugli stili è una concessione molto meno grave
  di quella sugli script — non permette esecuzione di codice.
  *(Gli `style={{…}}` di React non c'entrano: React scrive via CSSOM, che la
  CSP non intercetta.)*
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

> ⚠️ **Limiti della verifica, dichiarati.** (1) La sessione di prova non era
> autenticata — l'app oltre il login non è stata percorsa, quindi restano non
> esercitati il realtime WebSocket, gli upload su Storage e le immagini
> profilo. (2) Il recupero dei file di font da `fonts.gstatic.com` non è
> osservabile da questo ambiente, che non raggiunge Google Fonts dal browser:
> so che la CSP **non blocca** l'`@import` (nessuna violazione sollevata), non
> che i font arrivino. La direttiva `font-src` è quella canonica per Google
> Fonts, ma è l'anello non provato.
>
> È esattamente il motivo per cui la policy parte in **Report-Only**: se una di
> queste direttive è troppo stretta, lo si scopre da un report e non da
> un'applicazione rotta.

### Come promuoverla a bloccante

Le violazioni compaiono nella **console del browser** — non c'è endpoint di
raccolta, quindi niente `report-uri`/`report-to`: aggiungerne uno significa
scegliere (e pagare) un servizio, decisione separata. Dopo qualche giorno d'uso
reale, se la console resta pulita anche nelle aree non coperte dalla prova
(chat con vocali, upload allegati, modulo Liste, foto profilo), basta
rinominare la chiave in `vercel.json` da `Content-Security-Policy-Report-Only`
a `Content-Security-Policy`.
