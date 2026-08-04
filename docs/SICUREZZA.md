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

> ⚠️ **Nessun `Content-Security-Policy`.** La stesura precedente lo descriveva
> come "incompleto (manca report-uri)", il che lasciava intendere che ci fosse.
> Non c'è affatto. È la lacuna più concreta del capitolo (§6).

---

## 6. Cosa fare, in ordine di rapporto valore/costo

1. **Attivare la leaked password protection** (⚠️ dashboard → Auth → Password).
   Un interruttore. Supabase confronta le password con HaveIBeenPwned.
2. **`SET search_path` su `public.set_updated_at`.** Una riga di migrazione;
   chiude l'unico avanzo del giro di hardening `20260707`.
3. **Aggiungere una CSP.** È la mitigazione che manca alla scelta di tenere il
   token in `localStorage`. Partire in `Content-Security-Policy-Report-Only`
   per non rompere il caricamento dei font, poi promuoverla.
4. **Decidere sul sotto-ruolo Junior.** O si porta a schema (colonna + RLS), o
   si documenta esplicitamente come vincolo di UI e non di sicurezza. Oggi non
   è né l'una né l'altra cosa.

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
