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

### Le 14 funzioni SECURITY DEFINER raggiungibili da `authenticated` (sei anche da `anon`): perché il warning non è un buco

L'advisor segnala che un utente autenticato può invocarle via
`/rest/v1/rpc/<nome>`. Non può però guardare *dentro* il corpo della funzione,
dove sta il controllo di ruolo. Verificato uno per uno, **rileggendo
`pg_get_functiondef` in produzione** e non il contenuto delle migrazioni (✅,
27 agosto):

| Funzione | Guardia interna | Esito |
|----------|-----------------|-------|
| `reset_completo(text)` | `private.is_admin()` + conferma testuale `RESET TOTALE` | ok |
| `elimina_lista_definitivamente(uuid)` | `private.can_liste()` — cioè **admin, manager e agent**; richiede che la lista sia già nel cestino (`deleted_at` non nullo) | ok, ma vedi la nota in coda |
| `importa_backup(jsonb, uuid)` | `private.is_admin()`, dal 15 agosto (migrazione `20260815231000`) | ok |
| `rimuovi_beneficiario_lista(uuid, uuid)` | `private.can_liste()` | ok |
| `sposta_titolare_lista(uuid, uuid, uuid)` | `private.can_liste()` | ok |
| `send_test_push()` | `private.is_active_user()`, scrive solo sulla propria riga, `rate_limit_incrementa` a 5/ora per chiamante (B-5 dell'audit del 5 settembre) | ok |
| `sonda_audit_clients_update()` | nessuna — voluto: scrive un cliente di prova fisso e lo annulla con un rollback interno prima di ritornare, nessun dato restituito oltre un conteggio. M-2 dell'audit del 5 settembre, usata da `.github/workflows/rls.yml` per verificare che `trg_audit_clients_update` scriva davvero | ok, dal 5 settembre |
| ~~`registra_audit(text, text, text, jsonb)`~~ | **non più esposta**: riservata a `service_role` dal 4 settembre (migrazione `20260904143756`, A-2 dell'audit del 4 settembre). La riga che stava qui — «nessun parametro attore, lo ricava da `auth.uid()`, quindi non è firmabile per conto d'altri» — era vera e non bastava: `action`, `target_type`, `target_id` e `details` li sceglieva il chiamante, la funzione non aveva né tetti di lunghezza né limite di frequenza, e passavano anche un utente **disattivato** e un invitato **pending** (una `SECURITY DEFINER` non attraversa la RLS, quindi `rls_active_only` non si applica). Non poter firmare per conto d'altri conta poco su un registro che chiunque può riempire. Revocata invece che messa dietro un gate perché **non aveva un chiamante legittimo**: nessun percorso dell'app la usa (i trigger di riga girano come proprietario, le Edge Function inseriscono direttamente via `_shared/audit.ts`). Tolta anche da `FUNZIONI_SECURITY_DEFINER_VERIFICATE`, così un eventuale nuovo `GRANT` fa fallire `verifica:advisor` | ✔ chiusa il 4 settembre |
| `get_vapid_public_key()` | nessuna — **ed è corretto**: restituisce la metà *pubblica* della coppia VAPID, che il browser deve avere per sottoscriversi | ok |
| `get_migrazioni_applicate()` | nessuna — voluto, vedi sopra: non espone nulla che non sia già nel repo. Raggiungibile anche da `anon` | ok |
| ~~`audit_clients_insert()` · `audit_clients_delete()` · `audit_liste_truncate()` · `audit_users_delete()` · `audit_users_privilegi()`~~ | nessuna, e non serviva: `RETURNS trigger`, quindi la rotta `/rest/v1/rpc/<nome>` che l'advisor nomina non era comunque chiamabile — l'attore che scrivono lo prendono da `auth.uid()` attraverso `private.audit()`. Erano però le uniche cinque `SECURITY DEFINER` del progetto rimaste con `EXECUTE` a `PUBLIC`/`anon`/`authenticated`, invece della revoca esplicita che ha ogni altra: la stessa falla di disciplina di `registra_audit`, qui senza nemmeno un chiamante teorico (l'esecutore di una trigger function è il proprietario della tabella, non il ruolo che ha innescato l'evento). Revocato con la 4 settembre (M-3, migrazione `20260904160804`); tolte anche da `FUNZIONI_SECURITY_DEFINER_VERIFICATE`, così un eventuale nuovo `GRANT` su una delle cinque fa fallire `verifica:advisor` | ✔ chiusa il 4 settembre |
| `audit_clients_update()` | nessuna, e non serve per lo stesso motivo delle cinque sopra: `RETURNS trigger`, `EXECUTE` revocato da `public`/`anon`/`authenticated` nella STESSA migrazione che la crea (M-2 dell'audit del 5 settembre, `20260905130000`) — a differenza delle cinque, qui la revoca non è arrivata dopo | ok, dal 5 settembre |
| `segnala_errore_client(text, text, text, text, text, text)` | **limiti nel corpo**, non un gate di ruolo: è raggiungibile da `anon` di proposito (un crash può avvenire prima del login, e un errore che non riesce a segnalare sé stesso perché richiederebbe una sessione sarebbe un controsenso). Tetti di lunghezza su ogni campo, 60 righe/minuto per utente autenticato e 10/minuto per **tutti gli anonimi insieme**, potatura opportunistica a 90 giorni con tetto di 5.000 righe (migrazione `20260903094500`) | ok, dal 3 settembre |

> ⚠️ **Non "risolvere" questi warning revocando EXECUTE.** Le RPC sono il modo
> in cui l'app chiama queste operazioni: revocare romperebbe il modulo Liste,
> il push, il registro di audit e il controllo di scarto delle migrazioni. Il
> warning è informativo; la difesa è nel corpo della funzione (o, per
> `get_vapid_public_key`/`get_migrazioni_applicate`, nell'assenza di qualunque
> dato sensibile da difendere).
> `get_push_secrets()` — quella che espone la chiave *privata* — è già ristretta
> a `service_role` e infatti non compare nell'elenco.

> **Nota sull'ampiezza di `can_liste()`.** Tre delle funzioni qui sopra sono
> aperte a `admin + manager + agent`. Per le operazioni di movimento
> (`rimuovi_beneficiario_lista`, `sposta_titolare_lista`) è corretto: è il
> lavoro quotidiano del modulo. Per `elimina_lista_definitivamente`, che
> cancella in modo **irreversibile** una lista con tutti i suoi movimenti, la
> sua storia e i suoi beneficiari, è una decisione da **riconfermare
> esplicitamente** e non da ereditare dal predicato più comodo. Il passaggio
> obbligato dal cestino la attenua — serve un secondo gesto, e in mezzo c'è il
> tempo di accorgersene — ma non la sostituisce. Finché resta così, resta così
> per scelta: è questa riga a renderla una scelta.

> ✅ **Come si rilegge dal database, invece di fidarsi di questa tabella**
> (M-5 dell'audit del 26 agosto: la riga di `importa_backup` dichiarava
> `private.can_liste()` mentre il database applicava `private.is_admin()` dal
> 15 agosto, e mancavano del tutto le sei funzioni del registro di audit
> aggiunte il 26 — la deriva era benigna nel verso, ma era sul documento che
> il progetto usa come riferimento di sicurezza):
>
> ```sql
> select p.proname,
>        pg_get_function_identity_arguments(p.oid) as argomenti,
>        pg_get_function_result(p.oid)             as ritorna,
>        has_function_privilege('anon',          p.oid, 'execute') as anon,
>        has_function_privilege('authenticated', p.oid, 'execute') as auth
>   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
>  where n.nspname = 'public' and p.prosecdef
>    and (has_function_privilege('anon', p.oid, 'execute')
>      or has_function_privilege('authenticated', p.oid, 'execute'))
>  order by 1;
> ```
>
> L'elenco che ne esce va tenuto uguale a due cose: questa tabella e
> `FUNZIONI_SECURITY_DEFINER_VERIFICATE` in
> `scripts/verifica-advisor/advisor.js`. Non è un doppione per distrazione: il
> controllo automatico accetta i due lint `*_security_definer_function_executable`
> **per funzione** e non per nome del lint, quindi una SECURITY DEFINER nuova e
> mai esaminata fa fallire `npm run verifica:advisor` finché qualcuno non la
> guarda e la scrive in entrambi i posti. Il giorno in cui i due elenchi
> divergono, quello sbagliato è quello che non viene dal `select` qui sopra.

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

**B-1 dell'audit del 4 settembre** ha aggiunto due helper della stessa
famiglia, dedicati a `clients` (che prima ripeteva in linea, in quattro
policy, la stessa `EXISTS (SELECT 1 FROM users WHERE …)`). Fino al 5 settembre
guardavano solo il ruolo; **B-1 dell'audit del 5 settembre** ha aggiunto
`active AND NOT pending` al corpo di entrambe — non sfruttabile nel frattempo
perché la RESTRICTIVE `rls_active_only` lo imponeva comunque su `clients`, ma
il nome delle funzioni prometteva un verdetto che il corpo non dava:

```
private.can_clienti_scrittura()    role IN (admin, manager, agent) AND active AND NOT pending
private.can_clienti_eliminazione() role IN (admin, manager)        AND active AND NOT pending
```

Rispecchiano `canEditClient`/`canDeleteClient` in `src/lib/permissions.js`,
sono in `private` (non raggiungibili da PostgREST) e non compaiono
nell'elenco dei 14 sopra per lo stesso motivo di `is_admin()`/`can_liste()`.

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

> ⚠️ **La riga «urgenti» è stata falsa fino al 23 agosto**, ed è il rilievo A-1
> di quell'audit. `canViewTask` (`src/lib/permissions.js:131`) concedeva le
> task urgenti altrui, ma `tasks_select` non aveva quel ramo: letta dal
> database di produzione era `is_manager_or_admin() OR uid = ANY(assignees) OR
> created_by = uid OR (cardinality(assignees)=0 AND can_view_global_queue())`.
> Per admin e manager il ramo è ininfluente (ricevono tutto comunque) e il
> driver non lo raggiunge: l'unico ruolo in cui decideva qualcosa era
> l'**agent**, ed era l'unico a cui la riga non arrivava mai. La scorciatoia
> «contatta l'assegnatario» di `UrgentQueue.jsx` non è mai comparsa a nessuno.
>
> Il database era il livello più STRETTO, quindi non è mai stato un buco di
> sicurezza — ma questa tabella affermava una capacità che non esisteva, su tre
> colonne su cinque. È la stessa classe di difetto di M-4 dell'audit del 15
> agosto («il commento è diventato la specifica e ha già divergito dal database
> su una policy di sicurezza»), sopravvissuta alla propria chiusura nella
> tabella normativa invece che in un commento.
>
> ✅ **ALLINEATO E VERIFICATO IN PRODUZIONE il 22 agosto 2026** dalle migrazioni
> `20260822215237_tasks_select_urgenti_altrui` e `20260822215520_is_urgent_task_search_path`,
> che aggiunge alla sola `tasks_select` il ramo `private.is_urgent_task(due_date,
> status) AND can_view_global_queue()`, con `deleted_at is null`. ⛔ `tasks_update`
> NON è stata toccata: «urgente ≠ modificabile» resta, ed è asserito per nome in
> `src/test/permissions.test.js`.
>
> **Misurato impersonando utenti reali** (`set local role authenticated` +
> `request.jwt.claims`, la procedura di `MIGRAZIONI_SUPABASE.md`), prima e dopo:
>
> | | prima | dopo |
> |---|---:|---:|
> | agent — task viste | 227 | **228** |
> | agent — urgenti altrui ricevute | **0** | **1** |
> | agent — righe modificabili su quella task | 0 | **0** |
> | driver — task viste | 13 | 13 |
>
> La terza riga è quella che conta: la vede e non la tocca. La quarta è il
> controllo positivo del confine — il driver resta fuori, come dice il client.
>
> Che la divergenza sia arrivata fin qui è A-2 dello stesso audit:
> `src/test/integration/rls.test.js` esiste per accorgersene e non lo eseguiva
> nessun workflow. Ora c'è `.github/workflows/rls.yml`, e il caso «l'agent
> riceve la task urgente di un collega» è dentro quel file.
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
| `Cross-Origin-Embedder-Policy` | `credentialless` |
| `Content-Security-Policy` | vedi §8 |

La CSP è **bloccante** dal 6 agosto (§8): non solo segnala le violazioni, le
impedisce. Ogni nuova origine — script, font, endpoint, CDN — va aggiunta a
`vercel.json` **prima** di essere usata: senza, la richiesta viene bloccata in
produzione, senza il periodo di osservazione che una fase Report-Only avrebbe
dato.

**`Cross-Origin-Embedder-Policy`** aggiunto il 23 agosto (B-4 dell'audit di
quel giorno): senza COEP, `COOP: same-origin` da solo non basta a isolare
completamente l'origine da attacchi a canale laterale (Spectre e simili). Il
valore è `credentialless` e non `require-corp`: quest'ultimo pretenderebbe un
header `Cross-Origin-Resource-Policy` su OGNI risorsa cross-origin caricata
dalla pagina. ⚠️ **Il caso concreto che aveva deciso fra i due non esiste
più dal 5 settembre (M-3)**: era il foglio di stile di Google Fonts
(`fonts.googleapis.com`, che scaricava i file da `fonts.gstatic.com`), che
non manda quell'header — con `require-corp` i font avrebbero smesso di
caricare. Da quando i font sono auto-ospitati (stessa origine, nessun CORP
da negoziare), la pagina non ha più **nessuna** risorsa cross-origin: la
scelta fra `credentialless` e `require-corp` non ha più un caso che la
decida in un verso o nell'altro. Resta `credentialless` — cambiarla senza un
motivo nuovo sarebbe un rischio di regressione per zero guadagno — ma se una
futura risorsa esterna tornasse ad avere bisogno di COEP, `require-corp` è
di nuovo un'opzione aperta, non preclusa come lo era prima del 5 settembre.

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
5. ⚠️ **Impostare `Minimum password length` in GoTrue** (dashboard → Auth →
   Password) — **aperto, ed è l'unica leva a costo zero su questo asse.**
   M-4 dell'audit del 26 agosto. Il minimo di 8 caratteri era scritto solo nel
   client, in due copie: ora è una sola definizione (`PASSWORD_MIN` in
   `src/lib/validators.js`, usata da `UpdatePasswordScreen`,
   `AccountSicurezza` e dal messaggio di `weak_password` in `LoginScreen`), ma
   **il client non è il livello che decide**. `supabase.auth.updateUser({
   password })` è raggiungibile su `/auth/v1/user` con il solo token di
   sessione: chi chiama l'API direttamente incontra il minimo di GoTrue, non
   quello di `validators.js`. Finché i due numeri non sono allineati a mano
   nella dashboard, l'unica barriera vera sulla robustezza delle password è
   quella di GoTrue, e questo documento non può dire quale sia — non è
   leggibile dal repository né dal database, sta nella configurazione del
   progetto Auth. Il punto 1 qui sopra spiega perché la verifica contro
   HaveIBeenPwned resta spenta (piano Free); **proprio perché quel controllo
   manca**, la lunghezza minima è ciò che rimane. Quando è impostata, questa
   riga va chiusa dicendo su quale valore.

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

### ✅ La coerenza fra i due livelli è ora verificata automaticamente (chiuso il 23 agosto 2026)

**Fino al 23 agosto 2026 questa era la lacuna dichiarata più importante del
documento.** È rimasta la storia di com'è stata trovata, perché la lezione di
fondo — un test che non gira non è un test — non smette di valere solo perché
oggi gira.

Il paragrafo che stava qui diceva: «Non è più vero che la conformità fra i due
livelli è garantita dalla lettura, non da un test: il test esiste ed è pronto a
intercettare la divergenza il giorno in cui c'è un progetto di staging.» Era
vero alla lettera e fuorviante nella sostanza, e **A-1 dell'audit del 23 agosto
2026 lo ha dimostrato**: `canViewTask` concedeva a un agent le task urgenti dei
colleghi, `tasks_select` non aveva quel ramo, e le due copie sono rimaste
divergenti finché qualcuno non ha letto tre file a mano confrontandoli con
`pg_policy`. Il test che esisteva «pronto a intercettarla» non l'ha
intercettata, perché **un test che non gira non è un test** — e in una suite da
132 file un solo `skipped` non lo nota nessuno.

Il 22 agosto 2026 era stata presa una decisione esplicita di non mantenere un
progetto Supabase di staging, per il suo costo ricorrente non approvato. **La
decisione è stata rivista lo stesso giorno 23**: è stato creato un progetto
dedicato (`tullio-staging`, piano Free — costo €0/mese, stesso ragionamento già
fatto per la produzione), con lo schema applicato per intero e i tre utenti di
test provisionati (driver, agent `seniority='junior'`, un utente lasciato
`pending=true`) come richiesto dal preambolo di
`src/test/integration/rls.test.js`. Gli otto segreti sono configurati nel
repository e `.github/workflows/rls.yml` è tornato a girare su push (sui path
che toccano permessi, policy o il test stesso) e ogni notte, oltre che a
richiesta.

> ⚠️ **Nota emersa creando lo staging**: `supabase/migrations/20260610_notifications_extra.sql`
> contiene un literal regex mal escapato (`'''` invece di `''`) nella funzione
> `notify_task_comment()`, che non può essere applicato come SQL letterale —
> il file stesso lo dichiara in testa («applicato via execute_sql MCP, non
> tracciato in supabase_migrations»), cioè non è mai girato in produzione così
> com'è scritto nel repo. È esattamente il caso che `docs/CLAUDE.md` descrive
> alla nota ⛔ sulle migrazioni (repo ≠ prodotto): non corretto nel file
> sorgente per non riscrivere una migrazione storica, ma vale la pena saperlo
> se un giorno lo staging va ricostruito da zero con `db push` invece che con
> l'applicazione a batch usata questa volta.

Quindi, oggi:

> La matrice dei permessi è scritta **due volte** — in `src/lib/permissions.js`
> e nelle policy/funzioni `private.*` — ma da oggi **un controllo automatico
> verifica che le due copie dicano la stessa cosa**, su push e ogni notte. I
> 137 test di questo paragrafo restano un test del client contro se stesso;
> `src/test/integration/rls.test.js` è quello che attraversa il confine di
> rete verso il database vero.

⚠️ **In che direzione era pericoloso, e perché contava chiuderlo in fretta.**
In A-1 il database era il livello più STRETTO: si perdeva una funzione, non si
apriva un accesso. È il verso fortunato, e non era garantito. Il verso
opposto — il client più stretto del database — non produce alcun sintomo
visibile: la UI non mostra il pulsante, nessuno si lamenta, e il permesso resta
concesso a chi chiama PostgREST direttamente. **Quello non lo troverebbe
nessuna lettura casuale**, perché non si manifesta — è esattamente la classe di
difetto che il workflow ora presidia.

#### Cosa resta a carico di chi tocca i permessi

Il workflow copre i casi scritti in `rls.test.js`, non ogni policy futura. Chi
modifica una regola di autorizzazione da un lato deve continuare a controllare
l'altro nello stesso commit, e ad aggiungere un caso nuovo in `rls.test.js` se
la regola non era ancora coperta:

1. leggere la policy **dal database**, non dal file di migrazione — i file più
   vecchi dichiarano gli helper in `public` mentre in produzione vivono in
   `private`, e questo è stato constatato, non supposto:

   ```sql
   select polname, pg_get_expr(polqual, polrelid)
   from pg_policy where polrelid = 'public.tasks'::regclass;
   ```

2. misurare l'effetto impersonando un utente reale per ruolo, dentro una
   transazione con `rollback` (procedura in `MIGRAZIONI_SUPABASE.md`, §Dry-run).
   È così che A-1 è stato quantificato: un agent passa da 227 a 228 task viste
   e da 0 a 1 urgenti altrui;

3. aggiornare la matrice del §4 di questo documento **nello stesso commit**.
   Quella tabella ha affermato il falso su tre colonne su cinque per settimane:
   è normativa, quindi quando mente viene creduta.

4. lanciare `npm run test:rls` in locale contro lo staging (o aspettare il
   workflow su push) prima di considerare chiusa una modifica ai permessi.

---

## 8. Content-Security-Policy (bloccante dal 6 agosto 2026)

Aggiunta in `vercel.json`, prima in modalità Report-Only, poi **promossa a
bloccante** il 6 agosto dopo il periodo di osservazione descritto più sotto:
il browser rifiuta ogni richiesta o esecuzione che violi la policy, non si
limita più a segnalarla in console.

```
default-src 'self';
script-src  'self';
style-src   'self';
font-src    'self';
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

✅ **`style-src`/`font-src` ristretti a `'self'` il 5 settembre (M-3).** I
font (Playfair Display, DM Sans, Inter) sono ora ospitati con l'app
(`public/fonts/`, `@font-face` in `src/styles/global.css`): nessuna richiesta
della pagina esce più verso `fonts.googleapis.com`/`fonts.gstatic.com`. I
paragrafi qui sotto che spiegano perché quei due domini c'erano restano per
il contesto storico — la CSP che conta è quella appena sopra.

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
  solo che pagasse sulla sicurezza. ✅ **L'origine `fonts.googleapis.com`,
  che restava per il foglio dei font caricato da lì, è sparita anche lei il
  5 settembre (M-3)**: i font sono auto-ospitati, `style-src 'self'` non ha
  più eccezioni.

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

⚠️ **«0» qui sopra era una misura fatta a mano una volta, non un presidio
continuo** (M-6 dell'audit del 4 settembre). Una regressione — un `<style>`
reintrodotto, una CDN aggiunta, un `worker-src` che smette di bastare — non
produce un errore JS: l'elemento bloccato semplicemente non si carica, ed è
silenziosa per l'utente e invisibile a chi mantiene finché qualcuno non
riesegue questa prova a mano. Dal 5 settembre l'evento
`securitypolicyviolation` è agganciato in `installaHandlerGlobali()`
(`src/lib/errorReporting.js`) come terzo canale accanto ai due esistenti
(`unhandledrejection`, `error`): passa dallo stesso `codiceSegnalazione()` e
dalla stessa tabella `error_reports` che gli admin già leggono, non da un
canale nuovo. ⛔ **Non è stato aggiunto `report-uri`/`report-to` alla CSP**:
l'evento `securitypolicyviolation` non ne ha bisogno per scattare (è un
meccanismo indipendente), e il progetto è statico — un `report-uri` senza un
endpoint reale a riceverlo produrrebbe solo richieste `POST` silenziosamente
inutili verso un percorso che i `rewrites` di `vercel.json` fanno comunque
atterrare su `/`.

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
>
> ✅ **Il limite (2) — `fonts.gstatic.com` non osservabile da questo
> ambiente — è chiuso dal 5 settembre (M-3), e non perché sia diventato
> osservabile**: i font non arrivano più da lì. `font-src 'self'` serve gli
> stessi file dell'app, quindi non c'è più un anello esterno da provare.

### Cosa monitorare, ora che è bloccante

Le violazioni compaiono nella **console del browser** — non c'è endpoint di
raccolta, quindi niente `report-uri`/`report-to`: aggiungerne uno significa
scegliere (e pagare) un servizio, decisione ancora aperta e separata da questo
documento. Senza quell'endpoint, una direttiva troppo stretta su un percorso
poco battuto **fallisce in silenzio per chiunque non abbia i DevTools aperti**:
una richiesta bloccata dalla CSP non produce un errore di rete distinguibile
per l'utente, produce una funzionalità che "non fa niente".

**Riconfermata il 23 agosto** (B-4 dell'audit di quel giorno, che l'aveva
segnalata insieme all'assenza di COEP sopra): un endpoint di report richiede
un servizio terzo a pagamento o un'Edge Function propria che raccolga e
conservi i report — infrastruttura nuova, non una riga di configurazione — ed
è stato deciso di non aggiungerlo senza una scelta esplicita su dove far
atterrare quei dati. Resta un rilievo aperto e dichiarato, non un oversight.

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

---

## 10. Dipendenze: allow-list di `npm audit` (S-1, audit del 30 agosto)

`xlsx@0.18.5` (§«Dipendenza esterna unica» in `docs/CLAUDE.md`) porta due CVE
**high**: Prototype Pollution (`GHSA-4r6h-8v6p-xvw6`) e ReDoS
(`GHSA-5pgg-2g8v-p4x9`). `npm audit` non ha **fix disponibile**: SheetJS ha
lasciato il registry npm, e le versioni corrette (0.19.3, 0.20.2+) esistono
solo sul CDN del progetto (`cdn.sheetjs.com`), non su npm. `npm audit` è
quindi rosso **in permanenza** su questa dipendenza, con o senza questa
sezione.

**Il rischio è mitigato architetturalmente, non ignorato.** Il parse gira in
un Web Worker terminato subito dopo (`src/lib/xlsxWorker.js`), e
`src/lib/prototypeGuard.js` sorveglia il passaggio di confine confrontando i
descrittori di `Object`/`Array`/`Function`. Nessuna delle due CVE ha un
percorso verso il realm principale.

**Il problema residuo era di processo**: un `npm audit` sempre rosso è un
allarme che si impara a ignorare, e il giorno in cui comparisse una
*seconda* CVE — in una dipendenza senza mitigazione — sarebbe indistinguibile
dal rumore di fondo. `npm run verifica:audit`
(`scripts/verifica-audit/index.js`, in CI accanto a lint/test/bundle) legge
`npm audit --json` e confronta ogni advisory high/critical con un'allow-list
ESPLICITA — le due CVE di xlsx qui sopra, ciascuna col motivo e il file che la
mitiga — e fallisce su qualunque advisory che non vi compaia, xlsx compresa
se un giorno ne comparisse una terza senza mitigazione dichiarata. Un audit
che non può che essere rosso non protegge niente; uno verde finché non arriva
qualcosa di nuovo protegge esattamente ciò per cui esiste.

⛔ **Aggiungere una CVE all'allow-list senza una mitigazione verificata nel
codice** annullerebbe questa sezione: l'elenco esiste per dichiarare un
rischio già chiuso altrove, non per silenziare `npm audit`.
