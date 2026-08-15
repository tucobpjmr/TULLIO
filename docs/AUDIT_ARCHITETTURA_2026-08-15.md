# Audit architettura e sicurezza — 15 agosto 2026

Ambito di questo passaggio: **punti 1 e 2** (architettura/struttura del codice,
sicurezza/gestione dei dati). Stato/flusso dati, performance e UX seguono in un
secondo documento.

Metodo: lettura del codice + interrogazione del **database di produzione**
(`vmxvnxsqfisucugcpqlc`) in sola lettura — advisor di sicurezza, definizioni
correnti di funzioni/trigger/policy, ledger delle migrazioni — e riesecuzione
degli strumenti di verifica già presenti nel repository contro i dati reali.

Verifiche eseguite in ambiente: `npm run lint` → **0 errori**; `npm test` →
**1316 passati, 7 skip, 0 falliti**; `npm audit` → 6 high (dettaglio in B-3/B-4);
`confrontaMigrazioni`/`trovaNonVersionate` di `scripts/verifica-rpc/migrazioni.js`
eseguiti sui 109 file locali contro le 113 righe applicate → **zero scarti in
entrambe le direzioni**.

> **Due rilievi sono stati ritirati durante la stesura**, ed è giusto che
> restino scritti. Il primo — «il rilevamento di scarto delle migrazioni non
> funziona» — nasceva da un confronto per solo nome che produceva 14 divergenze:
> è esattamente il falso positivo che `migrazioni.js` documenta ed evita con il
> confronto a due vie più eccezioni e alias. Eseguito il loro comparatore vero,
> il risultato è pulito. Il secondo — `auth_leaked_password_protection` — è una
> decisione già presa e motivata il 12 agosto (richiede il piano Pro), non un
> interruttore dimenticato. Quel che resta di entrambi è in M-2 e in §Controlli
> verificati, ridimensionato a ciò che ho potuto dimostrare.

---

## Executive Summary

Il progetto è in **ottimo stato di salute strutturale**, sensibilmente sopra la
media per un gestionale di questa età e dimensione (47.605 righe, 333 moduli,
1316 test, ESLint pulito con `max-lines` e `no-restricted-imports` a presidio
dei confini). Le difese di sicurezza non sono dichiarative: sono a **tre livelli
davvero distinti e davvero testati** — UI (`lib/permissions.js`), registry di
persistenza (`state/persistence.js`), database (RLS + helper `private.*`) — più
un quarto sulle Edge Function (`_shared/adminPredicate.ts`). Tutte e 19 le
tabelle di `public` hanno RLS attiva con almeno due policy. I tre bucket sono
privati, con limiti di dimensione e allowlist MIME che esclude deliberatamente
HTML e SVG. Nessun `dangerouslySetInnerHTML`, `eval` o `innerHTML` in tutto
`src/`: la superficie XSS applicativa è chiusa.

Sei audit successivi hanno chiuso 68 rilievi. Questo è il motivo per cui quel
che resta è concentrato in **giunzioni fra sistemi**, non dentro i moduli:

1. **Un percorso di escalation a `admin` che attraversa tre componenti ciascuno
   corretto da solo** (C-1). Il trigger di creazione profilo accetta il ruolo
   dai metadata di registrazione — che il client controlla; il gate `pending`
   lo rende inerte; l'approvazione admin lo riattiva senza toccarlo; e la UI
   **impedisce** di correggere il ruolo prima di approvare. Nessuno dei tre
   pezzi è sbagliato in isolamento, ed è per questo che è sopravvissuto a sei
   audit e non compare in `docs/SICUREZZA.md`.

2. **La coesistenza di due architetture dati parallele** (A-1): il core
   (reducer + registry + idratazione) e il modulo Liste, che ne è una seconda
   implementazione con file omologhi. Ogni invariante del sistema va oggi
   mantenuta in due posti che non condividono codice — e il progetto ha già
   pagato quel prezzo tre volte sulla stessa invariante (`esitoScrittura`).

Il resto sono rifiniture su decisioni per lo più già consapevoli.

Valutazione complessiva: **8/10**, con un singolo rilievo critico da chiudere
prima di qualsiasi altra cosa.

---

## Tabella delle priorità

| ID | Priorità | Area | Rilievo | Verificato su |
|----|----------|------|---------|---------------|
| **C-1** | 🔴 **Critica** | Sicurezza | Escalation a `admin` via metadata di signup: il ruolo arriva dal client, sopravvive fino all'approvazione, e la UI non consente di correggerlo prima di concederlo | Trigger live in produzione + `AdminTeamTab.jsx` |
| **A-1** | 🟠 Alta | Architettura | Due architetture dati parallele (core vs modulo Liste): stesse invarianti mantenute in due implementazioni separate | `src/state/` vs `src/components/liste/` |
| **M-1** | 🟡 Media | Sicurezza | `importa_backup` è più permissiva al DB (`can_liste()` = admin/manager/agent) di ogni percorso UI che la raggiunge (solo pannello Admin) | DB produzione |
| **M-2** | 🟡 Media | Sicurezza / Ops | Il ledger prova che una migrazione è stata *registrata*, non che il corpo applicato sia quello del file; 3 migrazioni risultano applicate due volte e i controlli non possono vederlo (usano `Set`) | `schema_migrations` + `migrazioni.js` |
| **M-3** | 🟡 Media | Architettura | `VoyageDeskInner.jsx`: 518 righe, 6 hook di dominio + 8 stati UI + provider annidati in un solo componente | `src/VoyageDeskInner.jsx` |
| **M-4** | 🟡 Media | Architettura | Densità di commento molto alta: il commento è diventato la specifica, e ha già divergito dal database su una policy di sicurezza | `src/lib/api.js`, `AuthContext.jsx` |
| **B-1** | 🟢 Bassa | Sicurezza | `notify_user_pending` usa `lower(role) = 'admin'`: unico gate del sistema non allineato al confronto esatto | DB produzione |
| **B-2** | 🟢 Bassa | Sicurezza | La motivazione dell'esposizione di `get_migrazioni_applicate()` ad `anon` poggia su una premessa non più vera (il repository è privato) | `SICUREZZA.md:50` vs `README.md` |
| **B-3** | 🟢 Bassa | Architettura | 4 componenti oltre 400 righe con 9–10 `useState` | `src/components/` |
| **B-4** | 🟢 Bassa | Sicurezza | CVE `xlsx` 0.18.5 residue — già note, documentate e mitigate; blocco CDN riconfermato | `src/lib/xlsx.js` |
| **B-5** | 🟢 Bassa | Sicurezza | 5 vulnerabilità high transitive **solo dev** con fix disponibile | `npm audit` |
| **B-6** | 🟢 Bassa | Architettura | Assenza di TypeScript su 47k righe con dominio a forte tipizzazione implicita | progetto |

---

## Action Plan dettagliato

### 🔴 C-1 · Escalation a `admin` attraverso la registrazione — ✅ chiuso lo stesso 15 agosto

> **Chiuso.** Le tre modifiche proposte sotto sono state applicate: (a) il
> trigger `handle_new_auth_user` non legge più `role` dai metadata (migrazione
> `20260815230000_handle_new_auth_user_stop_trusting_role_metadata`, **applicata
> in produzione e verificata** — `pg_get_functiondef` non contiene più `urole`,
> inserisce sempre `'agent'`); (b) `Users.approve(id, role)` scrive il ruolo
> passato dal chiamante, non più solo `pending`/`active`; (c)
> `APPROVE_TEAM_MEMBER` porta ora `{ id, role }` end-to-end (reducer,
> `persistence.js`, `activityLog.js`) e `AdminTeamTab.jsx` mostra un selettore
> di ruolo accanto a "✓ Approva" sulle card pending, di default sul ruolo già
> sulla riga ma sempre modificabile prima di concedere l'accesso. Nuovo test
> (`persistenceGuards.test.js`): il ruolo scritto è quello dell'azione, non
> quello nello state — la regressione che riaprirebbe il difetto rompe questo
> caso. Punto (d), la verifica di *Enable sign-ups* sulla dashboard, resta
> **da fare a mano** (fuori dalla portata di questo ambiente): la correzione
> qui sopra non ne dipende, per costruzione.
>
> Test: 1317 verdi (era 1316). Lint: 0 errori.

**File**
- `supabase/migrations/20260619214725_security_dedupe_signup_trigger.sql:27-35`
  (definizione corrente **verificata in produzione**)
- `src/lib/api.js:195` (`Users.approve`)
- `src/state/persistence.js:596` (`APPROVE_TEAM_MEMBER`)
- `src/components/admin/tabs/AdminTeamTab.jsx:207-213`

**Il difetto.** Il trigger `handle_new_auth_user` prende il ruolo dai metadata
della registrazione:

```sql
urole := CASE WHEN meta->>'role' IN ('admin','manager','agent','driver')
              THEN meta->>'role' ELSE 'agent' END;
INSERT INTO public.users (id, name, role, avatar, color, capacity, pending, active)
VALUES (NEW.id, uname, urole, uavat, ucol, ucap, true, false);
```

`raw_user_meta_data` è **scritto dal client**: è `options.data` di
`/auth/v1/signup`. Chiunque possa chiamare quell'endpoint sceglie il proprio
ruolo. L'allowlist filtra i valori fuori enum, non l'intenzione: `'admin'` è
nell'enum.

Vale la pena seguire il percorso per intero, perché è il motivo per cui il
difetto è sopravvissuto a sei audit:

1. `pending = true, active = false` rende il ruolo **inerte**:
   `private.is_admin()` richiede `active AND NOT pending`, verificato vivo in
   produzione. Fin qui la difesa tiene — e questo è ciò che rende il difetto
   non sfruttabile in un colpo solo.
2. Ma l'account compare nella lista "in attesa" del pannello Team, e
   `APPROVE_TEAM_MEMBER` esegue `update users set pending = false, active = true`
   — **senza toccare `role`**. L'approvazione non concede l'accesso: concede *il
   ruolo che la riga si porta dietro*, e quel ruolo l'ha scelto il registrante.
3. In `AdminTeamTab.jsx:211` il pulsante di modifica è dietro `{!m.pending && …}`:
   su un utente pending **l'admin non può cambiare il ruolo**. Può solo
   approvare — e correggere dopo, a privilegi già concessi. La UI rende
   impossibile l'unica azione che neutralizzerebbe il problema al momento
   giusto.

Il ruolo è mostrato nella card (`roleLabel(m)`), quindi un admin attento
*potrebbe* accorgersene: è testo grigio da 12px accanto al conteggio task, di
fronte a un pulsante "✓ Approva" senza conferma. Non è un controllo, è una
speranza.

**Perché non è già coperto.** `docs/SICUREZZA.md` non nomina `signup`,
`raw_user_meta_data`, `handle_new_auth_user` né l'approvazione: il percorso di
*creazione* dell'account è l'unico ingresso che i sei audit precedenti non
hanno attraversato. Tutti si sono concentrati — a ragione — su cosa un account
già esistente può fare.

**Esposizione.** Dipende dal fatto che il signup self-service sia disattivato
nella dashboard Supabase (Auth → Providers → Email → *Enable sign-ups*).
`AuthContext.jsx:229-233` documenta che il percorso UI è stato rimosso (S-13) ma
che il trigger resta «la rete di sicurezza se un account nascesse comunque, per
esempio da una chiamata diretta a /auth/v1/signup **finché il signup non è
disattivato anche nella dashboard**». **Non ho potuto verificarlo**: la policy di
rete di questo ambiente blocca l'egress verso `*.supabase.co`
(`CONNECT tunnel failed, response 403` — lo stesso blocco già documentato per
`cdn.sheetjs.com`). Va verificato a mano, ed è la prima cosa da fare.

La correzione però non deve dipendere da quella verifica. Un'impostazione di
dashboard è uno stato che nessun test copre, che nessuna migrazione versiona e
che una riattivazione accidentale ribalta in silenzio — precisamente il tipo di
garanzia che questo progetto ha già deciso, altrove, di non accettare (vedi il
ragionamento in `_shared/adminPredicate.ts`, che esiste perché due Edge Function
si fidavano di un controllo più debole di quello del database).

**Soluzione — tre modifiche indipendenti, nessuna grande.**

*(a) Il trigger smette di fidarsi dei metadata.* Nuova migrazione:

```sql
-- Il ruolo NON arriva più da raw_user_meta_data.
--
-- PERCHÉ È SICURO PER GLI INVITI. Il percorso d'invito non dipende da questa
-- riga: invite-user chiama inviteUserByEmail (che fa scattare questo trigger)
-- e SUBITO DOPO fa upsert su public.users con il ruolo già validato lato
-- server contro VALID_ROLES. Il trigger crea la riga, l'upsert le dà il ruolo
-- un istante dopo, e nel frattempo è pending=true/active=false, cioè inerte.
--
-- L'unico caso in cui il ramo `meta->>'role'` era davvero l'ultima parola è
-- quindi l'account NON pre-creato — la registrazione diretta su
-- /auth/v1/signup, cioè l'unico chiamante che quei metadata li controlla.
create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = 'public'
as $$
declare
  meta     jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  uname    text;
  ucap     int;
  ucol     text;
  uavat    text;
  uinviter uuid;
  parts    text[];
begin
  uname := coalesce(meta->>'name', split_part(NEW.email, '@', 1));
  ucap  := coalesce((meta->>'capacity')::int, 8);
  ucol  := coalesce(meta->>'color', '#3B82F6');
  uinviter := nullif(meta->>'invited_by', '')::uuid;
  select array_agg(word) into parts from unnest(string_to_array(uname, ' ')) as word;
  uavat := upper(left(coalesce(parts[1], ''), 1) ||
                 left(coalesce(parts[2], right(coalesce(parts[1], '  '), 1)), 1));

  insert into public.users (id, name, role, avatar, color, capacity, pending, active, invited_by)
  values (NEW.id, uname, 'agent', uavat, ucol, ucap, true, false, uinviter)
  on conflict (id) do nothing;

  insert into public.user_contacts (user_id, email)
  values (NEW.id, NEW.email)
  on conflict (user_id) do nothing;
  return NEW;
end $$;
```

*(b) L'approvazione dichiara il ruolo che concede.* `src/lib/api.js:195`:

```js
  // Il ruolo viaggia CON l'approvazione invece di essere ereditato dalla riga.
  // Approvare non è "sbloccare un account": è concedere un ruolo, e chi lo
  // concede deve dirlo — non ereditarlo da una riga che, per un account
  // auto-registrato, è scritta dal registrante stesso.
  approve: (id, role = 'agent') =>
    supabase.from('users')
      .update(withOrigin({ pending: false, active: true, role }), CONTA_RIGHE)
      .eq('id', id),
```

con `state/persistence.js:596` che inoltra il ruolo scelto (l'azione porta ora
un oggetto invece di un id nudo; il `rollback` esistente resta valido perché
rimanda comunque il membro intero pre-dispatch):

```js
  APPROVE_TEAM_MEMBER: {
    persist: (s, a) => UsersAPI.approve(a.payload?.id ?? a.payload,
                                        a.payload?.role ?? 'agent'),
    rollback: (s, a) => {
      const id = a.payload?.id ?? a.payload;
      const prev = (s.team || []).find(m => m.id === id);
      return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;
    },
    mapError: (err) => err?.message || "utente non approvato",
  },
```

*(c) La UI fa scegliere il ruolo al momento dell'approvazione.* In
`AdminTeamTab.jsx`, sulle card pending, il selettore di ruolo va accanto a
"✓ Approva" — è la modifica che rende (b) *usabile* e non solo più sicura per
default. Variante minima, se si vuole toccare meno: togliere `!m.pending` dalla
condizione del pulsante ✏️, così l'admin può correggere il ruolo prima di
approvare.

*(d) Verificare e documentare* lo stato di *Enable sign-ups* nella dashboard, e
registrarlo in `docs/SICUREZZA.md` accanto agli altri stati di piattaforma. Se è
attivo e non serve, disattivarlo — ma (a) resta necessaria comunque.

**Test da aggiungere.** I tre livelli sono già coperti; manca il caso "riga
creata con ruolo scelto dal registrante". Basta un caso su `APPROVE_TEAM_MEMBER`
che verifichi che il ruolo scritto è quello **passato dall'azione** e non quello
presente nello state — la regressione si chiude lì.

---

### 🟠 A-1 · Due architetture dati parallele

**Dove**: `src/state/` (12 file, 2419 righe) + `src/hooks/` (9 file, 1223)
contro `src/components/liste/` (28 file, 3606 righe).

**Il difetto.** Il modulo Liste ha una seconda implementazione, file per file,
dell'architettura del core:

| Core | Modulo Liste |
|---|---|
| `src/lib/api.js` | `src/components/liste/listeApi.js` |
| `src/state/persistence.js` | `src/components/liste/listePersistence.js` |
| `src/state/reducer.js` | `src/components/liste/listeReducers.js` |
| `src/hooks/useAppHydration.js` | `src/components/liste/useListeData.js` |

`useListeData.js` lo dice apertamente: il modulo «è nato come SPA a sé e aveva
un'architettura dati tutta sua». La convergenza è cominciata — entrambi usano
`useDebouncedTableSubscription`, entrambi `lib/pagination.js` — ma si è fermata
agli **hook condivisi** senza raggiungere il **registry**.

La conseguenza è concreta e documentata dal codice stesso. `lib/esitoScrittura.js`
esiste perché «la chat e il modulo Liste scrivono senza passare da
[useSyncedDispatch] e avevano ciascuno la propria copia cieca del controllo».
Cioè: l'invariante «zero righe toccate = rifiuto della RLS» — un rilievo
*critico*, C-1 del 14 agosto secondo passaggio — è stata scoperta una volta e
poi ri-scoperta due volte, in due copie che non condividevano codice. Ogni
invariante futura pagherà lo stesso prezzo, compresa la C-1 di questo documento
se un domani toccasse anche le liste.

C'è anche una violazione di layering: `listeApi.js` è un **data layer dentro
`src/components/`**. È presidiata da `no-restricted-imports`
(`VIETATO_LISTEAPI_DA_FUORI`), che impedisce la propagazione ma ratifica la
posizione — la regola esiste per tollerare la collocazione sbagliata.

**Soluzione — incrementale, tre passi indipendenti, ciascuno utile da solo.**

1. **Data layer al suo piano**: `src/components/liste/listeApi.js` →
   `src/lib/listeApi.js`. Modifica meccanica; permette di eliminare la regola
   ESLint che oggi serve solo a contenere l'anomalia.
2. **Scritture nel registry.** `listePersistence.js` descrive già le stesse cose
   (`guard`/`persist`/`rollback`) in una forma diversa: trasformarne le voci in
   entry di `PERSISTENCE` fa ereditare al modulo `entityId`, il registro delle
   scritture in volo e `esitoScrittura` **senza riscriverli**.
3. **Idratazione unificata.** `useListeData` e `useAppHydration` hanno già lo
   stesso schema (il ricalcolo selettivo per tabella emittente: `soloSaldi` di
   qua, `soloThread` di là). È un concetto solo, scritto due volte.

Il valore non è la riga risparmiata: è che un rilievo chiuso nel core smetta di
dover essere richiuso a mano nel modulo.

---

### 🟡 M-1 · `importa_backup`: il DB è più permissivo di ogni percorso che lo raggiunge

**Dove**: `public.importa_backup(jsonb)` in produzione;
`supabase/migrations/20260728190100_hardening_liste_viaggio_ruoli.sql:158`;
UI in `src/components/admin/tabs/AdminIOTab.jsx`.

**Il difetto.** La funzione è `SECURITY DEFINER` (bypassa la RLS), è `GRANT`-ata
a `authenticated` ed è protetta da `private.can_liste()` — cioè **admin, manager
e agent**. Ma l'unico punto d'ingresso in UI è il pannello Admin, che
`canAccessAdmin` riserva ai soli admin. Un agent non vede il pulsante e può
comunque chiamare `/rest/v1/rpc/importa_backup` con un payload costruito a mano,
scrivendo in `clients` (**835 righe di PII di persone esterne al team**),
`liste_viaggio`, `lista_beneficiari`, `movimenti_lista`.

Il danno è contenuto e va detto: gli insert sono tutti `ON CONFLICT DO NOTHING`
— si possono **aggiungere** righe, non sovrascriverne — e un agent può già
inserire clienti tramite la RLS ordinaria. Non è quindi un'escalation di
privilegio. È lo scarto UI↔DB che `lib/permissions.js` esiste per eliminare,
nella direzione permissiva, su un'operazione che non è una scrittura di dominio
ma una **fusione di archivio**. La migrazione che l'ha introdotta lo dichiara
come scelta consapevole («stesso perimetro del punto 1»): il punto è che quel
perimetro è più largo di ogni percorso reale.

**Soluzione.** Stringere il gate nel corpo della funzione:

```sql
-- importa_backup fonde un archivio esterno in quattro tabelle, clients
-- inclusa. Non è una scrittura di dominio: è amministrazione, e l'unico
-- ingresso in UI (AdminIOTab) è già riservato agli admin. can_liste() la
-- lasciava a tre ruoli su quattro — più larga di qualunque percorso che la
-- raggiunga davvero.
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Operazione riservata agli amministratori.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
```

più la funzione corrispondente in `lib/permissions.js` (`canImportBackup`), così
i due livelli continuano a rispondere insieme — che è la convenzione del file.

---

### 🟡 M-2 · Il ledger prova la riga, non il corpo applicato

**Dove**: `supabase_migrations.schema_migrations` (113 righe) vs
`supabase/migrations/` (109 file) vs `scripts/verifica-rpc/migrazioni.js`.

**Partiamo da ciò che funziona**, perché è la parte più grande. Ho eseguito
`confrontaMigrazioni` e `trovaNonVersionate` — le funzioni vere del repository,
non un confronto mio — sui 109 file locali contro le 113 righe lette dal
database di produzione:

```
MANCANTI (repo → non applicate):        []
NON VERSIONATE (prod → non nel repo):   []
```

**Zero scarti in entrambe le direzioni.** Il confronto a due vie (versione *o*
nome), le tre `ECCEZIONI_STORICHE` e i cinque `ALIAS_APPLICATE` fanno
esattamente il lavoro per cui sono stati scritti. Un audit che qui riportasse un
allarme starebbe rifacendo il confronto ingenuo che quel file documenta ed
evita.

**Restano due cose che quel controllo non può, per costruzione, vedere.**

*(1) Le riapplicazioni.* Tre nomi compaiono due volte nel ledger:

| Nome | Versioni |
|---|---|
| `20260702_notifications_origin_client` | `20260702084658`, `20260702084720` |
| `queue_stale_notif_direct_task` | `20260730120000`, `20260730194136` |
| `chat_files_delete_orfani` | `20260814220000`, `20260815155307` |

Entrambe le funzioni di confronto costruiscono `Set` di versioni e nomi, quindi
un nome applicato due volte è indistinguibile da uno applicato una volta.
L'ultima coppia è di ieri e oggi: la migrazione di C-1 del terzo passaggio del
14 agosto, applicata il 15 con una versione nuova. Se il file è cambiato fra le
due applicazioni, in produzione ha girato una versione del SQL che il repository
non ha più — e nessun controllo lo direbbe.

*(2) Il corpo.* Corrispondenza per versione o nome prova che **una riga con
quell'etichetta esiste**, non che il SQL eseguito sia quello del file. Il
repository lo sa già, e in un caso lo ha risolto a mano: l'alias
`messages_blocca_modifiche_altrui_fix_sender_anchor` porta il commento
«verificato il 14 agosto che il corpo in produzione corrisponde a quello del
file». Una verifica manuale, una volta, su una migrazione su cinque aliasate.

Perché conta: in questo progetto le migrazioni si applicano **a mano** e la RLS
**è** il controllo di sicurezza sostanziale — `adminPredicate.ts` lo dice
esplicitamente («sulle Edge Function con service_role il controllo nel corpo non
è difesa in profondità, è l'UNICA difesa»). Un'etichetta non è una prova.

**Soluzione.** Aggiungere al controllo esistente una verifica **per contenuto**,
limitata alle migrazioni che toccano sicurezza — la minoranza che vale la pena
presidiare:

```js
// scripts/verifica-rpc/migrazioni.js — terzo controllo, accanto ai due esistenti.
//
// confrontaMigrazioni risponde "la riga c'è". Questa risponde alla domanda che
// conta davvero per le migrazioni di sicurezza: "l'oggetto che quel file crea
// esiste OGGI nella forma che il file descrive?". Sono domande diverse, e solo
// la seconda sopravvive a una riapplicazione con un corpo diverso.
export const INVARIANTI_SICUREZZA = [
  { migrazione: '20260806130000_rls_task_category_and_pending_gate',
    sql: `select pg_get_functiondef('private.is_admin()'::regprocedure)
            ilike '%coalesce(pending, false) = false%'` },
  { migrazione: '20260728190100_hardening_liste_viaggio_ruoli',
    sql: `select pg_get_functiondef('public.reset_completo(text)'::regprocedure)
            ilike '%private.is_admin()%'` },
  { migrazione: '20260613080033_fix_users_privilege_escalation',
    sql: `select exists (select 1 from pg_trigger
                          where tgname = 'trg_users_block_privileged_self_update'
                            and tgenabled = 'O')` },
  // …una riga per ogni migrazione che tocca RLS, grant o helper di ruolo.
];

/** Nomi applicati più di una volta: una riapplicazione è un fatto da nominare,
 *  non da assorbire in un Set. Non fa fallire — informa. */
export function trovaRiapplicate(applicate) {
  const per = new Map();
  for (const a of applicate) per.set(a.name, [...(per.get(a.name) ?? []), a.version]);
  return [...per].filter(([, v]) => v.length > 1);
}
```

Nell'immediato, a costo quasi nullo: verificare che il corpo di
`chat_files_delete_orfani` in produzione sia quello del file corrente (è la
riapplicazione più recente e riguarda una policy di storage), e deduplicare le
tre voci ripetute.

---

### 🟡 M-3 · `VoyageDeskInner.jsx` concentra troppe responsabilità

**Dove**: `src/VoyageDeskInner.jsx` (518 righe).

Il componente monta il reducer, 6 hook di dominio (`useSyncedDispatch`,
`useAppHydration`, `useNotifications`, `usePresence`, `useChatData`,
`usePushNavigation`), 8 `useState` di UI effimera, i callback di navigazione e
l'annidamento dei provider. Passa `max-lines` perché la regola scarta commenti e
righe vuote — corretto come metrica di leggibilità, ma la responsabilità resta
concentrata.

Il file **dichiara** correttamente il proprio ruolo di guscio, e la scelta di
tenere lì lo stato UI cross-view è motivata nel codice (è candidato a diventare
filtro trasversale). Il punto non è spezzarlo per numero di righe: è che oggi
*ogni* funzionalità trasversale nuova atterra qui, perché è l'unico posto che
vede tutto.

**Soluzione.** Estrarre i due gruppi già coesi:

```jsx
// src/hooks/useShellUi.js — lo stato di UI effimera del guscio.
// Otto useState che non appartengono al reducer di dominio (non persistiti,
// non sincronizzati) ma che oggi convivono con i sei hook di dominio nello
// stesso componente: sono due lavori diversi nello stesso file.
export function useShellUi() {
  const [searchQuery, setSearchQuery] = useState("");
  const [showFABModal, setShowFABModal] = useState(false);
  const [showKeyHelp, setShowKeyHelp] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatIntent, setChatIntent] = useState(null);
  const [showBulkModal, setShowBulkModal] = useState(false);

  // Identità stabile: la prop arriva a <Dashboard>, che è `memo` — vedi il
  // commento su openChatTo in VoyageDeskInner, che documenta il render per
  // carattere digitato che questa memoizzazione ha eliminato.
  const openChatTo = useCallback((intent) => {
    if (intent?.toUser) setChatIntent(intent);
    setShowChat(true);
  }, []);

  return { searchQuery, setSearchQuery, showFABModal, setShowFABModal,
           showKeyHelp, setShowKeyHelp, showChat, setShowChat,
           chatIntent, setChatIntent, showBulkModal, setShowBulkModal,
           openChatTo };
}
```

più un `<AppProviders>` che raccolga l'annidamento. Il guscio torna a fare una
cosa sola: comporre.

---

### 🟡 M-4 · Il commento è diventato la specifica

**Dove**: trasversale. `src/lib/api.js` è 914 righe fisiche ma sta sotto il tetto
di 500 al netto di commenti e righe vuote: **oltre il 45% del file è prosa**.
Stessa proporzione in `state/persistence.js` (805), `AuthContext.jsx` (340) e
nelle migrazioni SQL.

In larga parte è una **forza**, e non va smontata: le motivazioni sono
tracciabili, i caveat non si perdono fra sessioni, e diversi rilievi di questo
audit sono stati più rapidi da verificare proprio grazie a quei commenti.

Il rischio è documentato dal progetto stesso. In `AuthContext.jsx:139-152` c'è
il resoconto di un commento che affermava che i contatti PII erano visibili solo
all'utente e agli admin «by-design privacy hardening» — molto dopo che la
migrazione `20260629222802` aveva cambiato la policy in `using (true)`. Il
commento diceva il contrario del database, **su una policy di sicurezza**, e
«chi lo leggeva credeva di avere una garanzia che il database non dà».

Un commento che descrive uno stato del *sistema* — non del codice che lo
circonda — è un'asserzione senza test: invecchia in silenzio e viene creduta.
È la stessa classe di problema di M-2, su un altro asse.

**Soluzione — non tagliare i commenti: vincolare quelli che asseriscono.**

```js
// src/test/integration/rls.test.js — accanto ai casi già presenti.
//
// Il commento in api.js:260 afferma che user_contacts è leggibile da tutto il
// team. È un'affermazione sul DATABASE, non sul codice che lo circonda: se la
// policy cambia, il commento resta ed è l'unica cosa che qualcuno leggerà.
// Questo test lo lega alla realtà — se la policy tornasse a own+admin, il test
// fallisce e il commento va riscritto insieme al codice.
test('user_contacts: SELECT consentito a tutto il team autenticato', async () => {
  const { data, error } = await clientAgent.from('user_contacts').select('user_id, email');
  expect(error).toBeNull();
  expect(data.length).toBeGreaterThan(1); // non solo la propria riga
});
```

Regola operativa proposta per `docs/CLAUDE.md`: **un commento che asserisce una
policy RLS, un grant o un predicato del database va accompagnato da un caso in
`src/test/integration/rls.test.js`.** Gli altri — quelli che spiegano *perché* il
codice è così — restano esattamente come sono.

---

### 🟢 B-1 · `notify_user_pending` confronta il ruolo diversamente da ogni altro gate

**Dove**: `public.notify_user_pending()` (verificata in produzione).

```sql
where active = true and pending = false and lower(role) = 'admin'
```

Ogni altro gate del sistema usa il confronto **esatto**: `private.is_admin()`,
`permissions.js`, `adminPredicate.ts`. Qui `lower()` è un residuo dell'epoca dei
ruoli scritti a mano, superata dalla migrazione dell'enum. Non è sfruttabile —
l'enum non ammette `'Admin'` — ma è l'ultimo punto in cui "chi è admin" ha una
seconda definizione, e il progetto ha già pagato quella divergenza almeno due
volte (vedi il commento in testa a `permissions.js`).

Ironia utile: questa funzione è proprio quella che notifica agli admin l'arrivo
di un utente pending, cioè l'unico avviso che oggi mette un umano davanti al
percorso di C-1.

```sql
  for uid in
    select id from public.users
    where role = 'admin' and active = true and coalesce(pending, false) = false
      and id <> NEW.id and id is distinct from NEW.invited_by
  loop
```

---

### 🟢 B-2 · La motivazione dell'esposizione ad `anon` poggia su una premessa non più vera

**Dove**: `docs/SICUREZZA.md:50-52` e
`supabase/migrations/20260806140000_get_migrazioni_applicate.sql:17-24`.

L'esposizione di `get_migrazioni_applicate()` ad `anon` è **una decisione presa
e documentata**, e il grosso dell'argomento regge (la colonna `statements` non è
mai selezionata, non c'è nulla di sensibile nei nomi in sé). Segnalo solo la
premessa:

> «gli stessi nomi dei file **già pubblici nel repository Git**»

Il repository non è pubblico: `README.md` chiude con «Progetto privato», e
l'accesso a `tucobpjmr/tullio` è ristretto. Quei nomi — `revoke_anon_table_grants`,
`rls_task_category_and_pending_gate`, `fix_users_privilege_escalation`,
`messages_solo_mittente_modifica_contenuto` — sono quindi pubblici **solo
attraverso questa funzione**, e insieme compongono una cronologia aggiornata di
dove il sistema è stato irrobustito e quando.

Non è una vulnerabilità: è una premessa da correggere, e con essa forse la
conclusione. Il consumatore è la CI, che può autenticarsi:

```sql
revoke execute on function public.get_migrazioni_applicate() from anon;
-- La CI la chiama con la service_role key, già in uso per verifica:advisor:
-- l'accesso non autenticato non serviva a nessun chiamante reale.
```

Se si preferisce lasciarla ad `anon`, va bene — ma allora `SICUREZZA.md` va
corretto, perché oggi motiva la scelta con un fatto che non è vero.

---

### 🟢 B-3 · Componenti oltre 400 righe con 9–10 `useState`

**Dove**: `ProfileEditor.jsx` (469 righe, 10 `useState`), `ClientiView.jsx`
(400/10), `AdvancedSearchPanel.jsx` (411/9), `ClientImportModal.jsx` (429/9).

Dieci stati indipendenti in un componente significano che le transizioni valide
non sono descritte da nessuna parte: sono l'intersezione implicita di dieci
`setX` sparsi negli handler. È il punto in cui `useReducer` smette di essere
sovra-ingegneria — e il progetto lo usa già ovunque altro.

```jsx
// Esempio su ProfileEditor: uno stato solo, transizioni nominate. "Sto
// salvando" e "ho un errore di campo" smettono di essere due booleani che
// qualcuno deve ricordarsi di azzerare insieme.
const initial = { nome: '', email: '', telefono: '', avatar: null,
                  fase: 'idle', errori: {} };

function editorReducer(s, a) {
  switch (a.type) {
    case 'CAMPO':   return { ...s, [a.campo]: a.valore,
                             errori: { ...s.errori, [a.campo]: null } };
    case 'SALVA':   return { ...s, fase: 'saving', errori: {} };
    case 'SALVATO': return { ...s, fase: 'idle' };
    case 'ERRORE':  return { ...s, fase: 'idle', errori: a.errori };
    default:        return s;
  }
}
```

Priorità bassa: sono componenti foglia, il rischio è di manutenzione, non di
correttezza.

---

### 🟢 B-4 · CVE `xlsx` residue

**Dove**: `src/lib/xlsx.js:1-40`.

`xlsx@0.18.5` porta GHSA-4r6h-8v6p-xvw6 (prototype pollution) e
GHSA-5pgg-2g8v-p4x9 (ReDoS), senza fix sul registry npm. **Già noto, già
documentato in testa al file, già mitigato** con `withPrototypePollutionGuard` e
`MAX_IMPORT_BYTES` applicati a entrambi i punti d'ingresso.

Confermo per la quarta volta che il CDN SheetJS è irraggiungibile anche da
questo ambiente (`CONNECT tunnel failed, response 403`). Nessuna azione nuova:
resta corretto che il fix definitivo
(`npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`) vada
applicato dal primo ambiente con accesso a `cdn.sheetjs.com`. Lo elenco solo
perché un audit di sicurezza che non lo nomina sembra non averlo guardato.

---

### 🟢 B-5 · Vulnerabilità npm transitive (solo dev)

`npm audit`: 6 high, di cui 5 in `postcss`, `undici` e `brace-expansion` — tutte
**dipendenze di sviluppo** (catena Vite/ESLint), nessuna nel bundle di
produzione. La sesta è `xlsx` (B-4). `npm audit fix` risolve le cinque senza
cambi di major.

```bash
npm audit fix && npm test && npm run build
```

---

### 🟢 B-6 · Assenza di TypeScript

47.605 righe, un dominio con enum (`admin|manager|agent|driver`, 10 categorie, 4
priorità, 5 stati) e un mapping DB↔UI (`snake_case`↔`camelCase`) mantenuto a
mano in `lib/mappers.js`. Le Edge Function sono già in TypeScript; il frontend
no.

I difetti che TS avrebbe intercettato sono documentati nel repo stesso: il
caveat #25 (`photo_url` → `photoUrl`) è un errore di forma dei dati — esattamente
ciò che un tipo cattura a costo zero.

Non raccomando una migrazione, ma **`checkJs` incrementale**: un `jsconfig.json`
con `checkJs: true` su `src/lib/` e `src/state/`, dove il JSDoc già esiste, per
poi allargare. Priorità bassa, ma è il debito che cresce da solo.

---

## Controlli verificati e risultati corretti

Registrati perché un audit vale anche per ciò che non ha trovato, e perché la
prossima sessione non li rifaccia da capo:

- **RLS**: tutte e 19 le tabelle di `public` hanno `relrowsecurity = true` e da 2
  a 5 policy. Nessuna tabella scoperta.
- **Rilevamento scarto migrazioni**: gli strumenti del repository eseguiti sui
  dati reali danno **zero mancanti e zero non versionate**. Funziona.
- **XSS**: zero occorrenze di `dangerouslySetInnerHTML`, `innerHTML`, `eval`,
  `new Function` in tutto `src/`. `MentionText` costruisce nodi React da slice di
  stringa; nessun autolinking del testo utente, quindi nessun percorso
  `javascript:`.
- **Escalation via UPDATE su `users`**: il trigger
  `trg_users_block_privileged_self_update` è **attivo** in produzione e
  ripristina `role/active/pending/capacity/seniority/id` per i non-admin.
- **`reset_completo`**: verificato **in produzione** il gate `private.is_admin()`
  nel corpo. L'advisor la segnala come eseguibile da `authenticated`, ma il
  `GRANT` riguarda chi può *tentare*, non chi riesce.
- **Storage**: 3 bucket privati, limiti 5/25/50 MB, allowlist MIME senza
  `text/html` né `image/svg+xml`. L'ammissione di `application/octet-stream` è
  argomentata nella migrazione e il ragionamento regge: il browser lo scarica,
  non lo interpreta.
- **Segreti**: nessuna chiave nel repository; `.env`/`.env.local` in
  `.gitignore`; nel bundle solo `VITE_SUPABASE_URL`/`ANON_KEY`, che è il loro
  posto.
- **CSP** (`vercel.json`): niente `unsafe-inline` né `unsafe-eval`,
  `frame-ancestors 'none'`, `object-src 'none'`, `connect-src` ristretto al
  progetto. Fra le migliori viste su un'app di questa categoria.
- **Edge Function**: CORS con allowlist di origin, `safeRedirect` ristretto alla
  famiglia di host del progetto, confronto del push secret a tempo costante,
  `requireActiveAdmin` allineato a `private.is_admin()`.
- **`auth_leaked_password_protection`**: **non è un rilievo aperto.** Decisione
  presa il 12 agosto e registrata in `scripts/verifica-advisor/advisor.js:37-47`
  — la verifica HIBP richiede il piano Supabase Pro e il progetto resta sul Free
  per scelta di chi lo amministra. L'advisor continuerà a segnalarla: è atteso.

---

## Top 3 Suggerimenti Strategici

### 1. Chiudere C-1 — e chiuderlo nel trigger, non nella dashboard

È l'unico rilievo che porta a un account `admin` completo, ed è l'unico che i
sei audit precedenti non hanno attraversato perché guardavano tutti a cosa un
account *esistente* può fare, non a come un account *nasce*. Il suo unico argine
oggi è un'impostazione della dashboard Supabase che non è versionata, non è
testata e non è nemmeno verificabile da questo ambiente. Le tre modifiche
(trigger che ignora il ruolo dai metadata, `approve` che dichiara il ruolo che
concede, UI che lo fa scegliere) stanno in poche decine di righe e nessuna rompe
il percorso d'invito, perché quel percorso il ruolo se lo riscrive da sé un
istante dopo. **Impatto: elimina l'unico percorso noto verso un amministratore
non autorizzato.**

### 2. Portare la verifica dal nome al contenuto

Questo progetto ha investito molto — e bene — nel far coincidere i verdetti dei
suoi livelli di autorizzazione, e gli strumenti di verifica che ha costruito
funzionano: eseguiti sui dati reali, il confronto delle migrazioni è pulito. Il
limite non è la loro correttezza, è la domanda che pongono: entrambi i rilievi
M-2 e M-4 dicono la stessa cosa su due assi diversi — **un'etichetta e un
commento affermano, non dimostrano**. Un ledger prova che una riga esiste, non
che il SQL applicato sia quello del file; un commento su una policy RLS è
un'asserzione che nessun test contraddice quando invecchia (ed è già successo).
Le due correzioni convergono: interrogare il **catalogo** per gli oggetti che le
migrazioni di sicurezza creano, ed estendere `src/test/integration/rls.test.js` a
ogni policy che un commento asserisce. **Impatto: il livello che il progetto
stesso definisce "l'UNICA difesa" smette di essere l'unico non misurato.**

### 3. Completare la convergenza del modulo Liste sul registry

Il modulo è già a metà strada: condivide gli hook, non condivide il registry.
Quella metà mancante è ciò che ha costretto a scoprire **tre volte** la stessa
invariante (`esitoScrittura`, nata da un rilievo critico) e che raddoppierà il
costo di ogni rilievo futuro — inclusi quelli di questo documento. I tre passi
(data layer al suo piano, scritture nel registry, idratazione unificata) sono
indipendenti e ognuno paga da solo. **Impatto: un difetto chiuso nel core resta
chiuso, invece di dover essere richiuso a mano nella seconda implementazione.**

---

## Punti 3, 4 e 5

Stato/flusso dati, performance/scalabilità e UX/gestione errori seguono in un
documento separato. Anticipo le due direzioni già emerse, per non perderle:

- **Refetch a tabella intera su ogni evento realtime** (`useAppHydration`):
  scelta esplicita, documentata e oggi sostenibile (290 task, 7 commenti, 649
  righe di cronologia), già mitigata dal ricalcolo selettivo per tabella
  emittente. `movimenti_lista` è però a **5.573 righe** e `clients` a **835**: la
  paginazione c'è, ma la traiettoria del costo per evento va misurata prima che
  diventi un problema, non dopo.
- **Nessun error boundary sull'albero dei provider**: `ErrorBoundary`,
  `ViewErrorBoundary` e `OverlayErrorBoundary` coprono viste e overlay, non la
  composizione in `VoyageDeskInner`. Un errore in un provider di dominio porta
  giù l'app intera.
