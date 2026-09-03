# Audit — architettura e sicurezza · 2 settembre 2026

Perimetro: i cinque assi richiesti — architettura e struttura del codice,
sicurezza e gestione dei dati, stato e flusso dati, performance e scalabilità,
UX/UI e gestione errori.

Dodici rilievi: **uno critico, quattro di alta priorità.**

⚠️ Il dodicesimo (`A-4`) non nasce dall'analisi ma dalla CORREZIONE: è stato
trovato il 3 settembre applicando la migrazione di `C-1`, ed è il più grave
dei quattro di alta priorità — il controllo che avrebbe dovuto vedere lo
scarto fra repository e database non stava girando.

✅ **C-1 e A-3 sono stati chiusi il 3 settembre**, insieme e nello stesso
commit: non è un accorpamento di comodo, è ciò che il rilievo A-3 dichiarava
già di essere — «la soluzione è interamente contenuta nella migrazione di C-1».
Sono lo stesso difetto visto da due distanze: la porta aperta a chiunque (C-1) e
la crescita che non ha un limite superiore nemmeno senza un attaccante (A-3).
Vedi «Come sono stati chiusi (C-1 e A-3)» in fondo al documento.
✅ **B-1, B-2 e B-3 sono stati chiusi il 3 settembre.** Vedi «Come sono stati
chiusi (B-1, B-2 e B-3)» in fondo al documento.
**Undici rilievi su dodici chiusi.**

Base di partenza misurata su questo commit (`f173aa4`): `npm ci` pulito,
`npm test` verde (**2028 passati, 23 saltati su 167 file**), `npm run lint`
senza segnalazioni, `npm run verifica:tipi` senza errori, `npm run build` +
`npm run verifica:bundle` verdi (80,88 kB gzip anonimo su 86 di soglia,
129,12 kB autenticato su 131), `npm run verifica:convenzioni` verde
(57 controlli), tredici audit precedenti a registro.

⟦stato: 11/12 chiusi⟧

> **Sulla numerazione.** `C-` = critico, `A-` = alta priorità, `M-` = media,
> `B-` = bassa, come negli audit dal 12 agosto in poi.

> **Sui rilievi che erano già a registro.** Quattro dei rilievi qui sotto
> (`M-4`, `B-1`, `B-2`, e la metà accessibile di `A-2`) sono già scritti in
> `AUDIT_CODEBASE_2026-08-31.md` e sono ancora aperti. Non li riscrivo per
> gonfiare l'elenco: li riporto perché due di essi sono cambiati di forma da
> allora — `A-2` e `A-3` di quell'audit sono stati chiusi **in parte**, e la
> parte rimasta non è quella che il documento descrive — e perché la loro
> presenza qui è ciò che rende leggibile `M-3`, che riguarda proprio il
> disallineamento fra il registro e il codice. Ogni riga dice esplicitamente
> se è nuova o se prosegue un rilievo esistente.

---

## Executive summary

**Questa è una delle codebase meglio tenute che mi sia capitato di leggere, e
il suo rischio principale non è più il codice: è la velocità con cui viene
corretto.**

Va detto con precisione, perché decide come vanno letti gli undici rilievi.

Il progetto ha, misurato e non dichiarato: RLS su diciannove tabelle con un
gate `RESTRICTIVE` «utente attivo», un predicato di amministrazione scritto una
volta sola e condiviso fra database ed Edge Function (`adminPredicate.ts`), una
allow-list di origini enumerata host per host con scritto accanto *perché* un
pattern non basterebbe, un registro append-only delle operazioni privilegiate,
2.028 test, `checkJs` sul data layer, sette script di verifica eseguibili, una
CSP senza `unsafe-inline`, code-splitting con soglie di bundle sorvegliate, e —
la cosa più rara — un commento accanto a ogni decisione che spiega quale
alternativa è stata scartata e perché. Le tre aree su cui di solito un
gestionale React+Supabase si rompe (autorizzazione lato client scambiata per
sicurezza, stato ottimistico senza compensazione, bundle monolitico) sono qui
tutte e tre affrontate, non aggirate.

Il difetto strutturale è un altro, e i rilievi lo mostrano da tre lati diversi.

**Il progetto corregge più in fretta di quanto registri.** `A-1` e `A-4`
dell'audit del 31 agosto sono *implementati nel codice* — il dominio task ha
oggi il `rollback` su otto entry su otto, e il codice di segnalazione finisce in
una tabella che gli admin possono leggere — e sono *dichiarati aperti* sia nel
documento sia in `docs/INDEX.md`. `verifica:convenzioni` passa, perché confronta
la prosa dell'audit con la prosa dell'indice: due testi scritti dalla stessa
mano nello stesso momento, che non possono smentirsi a vicenda (`M-3`). È lo
stesso difetto che il progetto ha già riconosciuto due volte — la soglia che
vive in un commento (`B-4` del 16 agosto), la regola che certifica un perimetro
più piccolo del codice (`A-1` del 26 agosto) — applicato questa volta al
registro stesso.

**E la correzione più recente ha aperto la superficie più larga del progetto.**
Il 28 agosto `get_migrazioni_applicate()` ha perso il grant ad `anon` con una
motivazione esatta: una funzione raggiungibile con la chiave pubblica «non è
una falla, è ricognizione gratuita». Il 1 settembre è nata
`segnala_errore_client()`, `SECURITY DEFINER`, concessa ad `anon`, che
**scrive** righe di testo senza tetto di lunghezza e senza limite di frequenza
(`C-1`). Non è una svista di attenzione — il file della migrazione è
argomentato meglio della media del settore — è che il ragionamento sul rischio
è stato fatto sul *contenuto* (nessuna PII in più di quella già in `users`) e
non sul *volume*, che su un piano Free da 500 MB è la variabile che rompe
l'applicazione intera.

**Terzo lato: quando un controllo automatico non vede qualcosa, quel qualcosa
smette di esistere.** `A-2` del 31 agosto («quattordici elementi non
raggiungibili da tastiera») è stato chiuso installando `eslint-plugin-jsx-a11y`
e correggendo ciò che segnalava. Ma `no-static-element-interactions` non guarda
`<tr>` e `<td>`, che portano un ruolo ARIA implicito e per la regola non sono
«statici». Restano fuori quattro gesti, e non sono marginali: aprire una lista
archiviata, aprire una task archiviata e **modificare un movimento del registro
contabile dei buoni viaggio**, che è il dato più sensibile dell'applicazione
(`A-2`). Il lint è verde, e il verde è l'informazione sbagliata.

Il resto è manutenzione ordinaria: due entry del registry di persistenza rimaste
senza compensazione mentre le altre diciassette ce l'hanno (`A-1`), una tabella
nuova senza retention né lettore (`A-3`, `M-1`), PII che può entrare in un
registro che dichiara di non contenerne (`M-2`), e i tre rilievi bassi già noti.

**Nessuno di questi undici rilievi mette in discussione l'impianto.** Il piano
d'azione qui sotto è, nell'ordine: chiudere `C-1` (una migrazione), poi `A-1`,
`A-2`, `A-3`, poi il resto.

---

## Tabella delle priorità

| Rilievo | Gravità | Cosa | Dove |
|---|---|---|---|
| **C-1** ✔ | ~~**Critico**~~ **risolto** | `segnala_errore_client()` è una porta di scrittura concessa ad `anon`, senza tetto di lunghezza né limite di frequenza: chiunque abbia la chiave pubblica può riempire il database | `supabase/migrations/20260901120000_error_reports.sql:99` |
| **A-1** ✔ | ~~Alta~~ **risolto** | `ADD_NOTICE` e `ADD_COMMENT` sono le due sole mutazioni ottimistiche rimaste senza `rollback`: avviso e commento fantasma restano a schermo dopo una scrittura fallita | `src/state/persistence.js:298`, `:281` |
| **A-2** ✔ | ~~Alta~~ **risolto** | La regola di lint che certifica la tastiera non vede `<tr>`/`<td>` cliccabili: quattro gesti restano irraggiungibili, fra cui **modificare un movimento contabile**, e il controllo riporta zero | `eslint.config.js:395`, `liste/ListaDetail.jsx:174` |
| **A-3** ✔ | ~~Alta~~ **risolto** | `public.error_reports` cresce senza retention e senza tetto sui campi: anche il solo traffico legittimo non ha un limite superiore | `supabase/migrations/20260901120000_error_reports.sql` |
| **M-1** ✔ | ~~Media~~ **risolto** | `error_reports` non ha ancora un lettore: la segnalazione ha un posto dove essere scritta, non uno dove essere cercata | `src/lib/api/configurazione.js:110` |
| **M-2** ✔ | ~~Media~~ **risolto** | Il `message` salvato può contenere PII di clienti (vincolo Postgres che cita il valore), contro il contratto scritto sulla tabella stessa | `src/lib/errorReporting.js:221` |
| **M-3** ✔ | ~~Media~~ **risolto** | Il registro degli audit è disallineato dal codice (`A-1` e `A-4` del 31 agosto risolti, dichiarati aperti) e `verifica:convenzioni` non può accorgersene | `docs/INDEX.md:52`, `scripts/verifica-convenzioni/index.js:131` |
| **M-4** ✔ | ~~Media~~ **risolto** | 21 `<label>` su 85 ancora senza `htmlFor` — prosegue `A-3` del 31 agosto (era 51 su 75), su un insieme diverso da quello descritto lì | 15 file in `src/components/` |
| **B-1** ✔ | ~~Bassa~~ **risolto** | `Clients.cerca`: `%` e `_` digitati dall'utente sono wildcard — `B-2` del 31 agosto | `src/lib/api/clienti.js:92` |
| **B-2** ✔ | ~~Bassa~~ **risolto** | Nessun rate limiting sulle Edge Function esposte al browser — `M-3` del 31 agosto | `supabase/functions/` |
| A-4 | Alta | `verifica:rpc` e `verifica:migrazioni` escono con codice 2 per due secret vuoti: il rilevatore di scarto fra repo e database non gira, e il suo workflow è rosso a ogni esecuzione dal 27 agosto | `.github/workflows/verifica-rpc.yml` |
| **B-3** ✔ | ~~Bassa~~ **risolto** | Categorie e template messaggi: cinque mutazioni senza `rollback` né `mapError` | `src/state/persistence.js:507` |

---

## 1. Sicurezza e gestione dei dati

### C-1 · Una porta di scrittura aperta a chiunque abbia la chiave pubblica — ~~**Critico**~~ ✔ **risolto**

**Dove.** `supabase/migrations/20260901120000_error_reports.sql:99`, con il
chiamante in `src/lib/api/configurazione.js:98`.

```sql
revoke execute on function public.segnala_errore_client(text,text,text,text,text,text) from public;
grant   execute on function public.segnala_errore_client(text,text,text,text,text,text) to anon, authenticated;
```

**Perché è critico.** La funzione è `SECURITY DEFINER`, quindi la RLS che
protegge `error_reports` — «nessuna policy di insert, e con la RLS attiva
l'assenza di policy è già il divieto» — non si applica a chi passa da qui. È
concessa ad `anon`, cioè al ruolo della chiave pubblicabile, che vive nel
bundle di produzione ed è per costruzione nota a chiunque apra l'applicazione.
E il corpo non pone alcun limite:

```sql
  insert into public.error_reports (code, user_id, user_name, origin, message, stack, url, user_agent)
  values (p_code, v_me, v_nome, coalesce(p_origin, 'sconosciuto'), p_message, p_stack, p_url, p_user_agent)
  on conflict (code) do nothing;
```

Nessun tetto di lunghezza su `p_message`, `p_stack`, `p_url`, `p_user_agent` —
sono `text`, cioè illimitati. Nessun limite di frequenza. Nessuna
autenticazione richiesta. Un ciclo di richieste `POST
/rest/v1/rpc/segnala_errore_client` con `apikey` la chiave anon e un `p_stack`
da qualche centinaio di kB per chiamata riempie il database.

Le due conseguenze sono di gravità diversa e vanno tenute distinte:

1. **Esaurimento dello storage.** Il progetto sta sul piano Free per scelta
   dichiarata (`B-2`/`ST-14` dell'audit del 7 agosto, accettati il 12: il
   `leaked_password_protection` richiederebbe Pro e non lo si prende). Il Free
   ha 500 MB di database. Quando finiscono, non smette di funzionare
   `error_reports`: smettono **tutte le scritture dell'applicazione** — un
   task, un movimento contabile, un messaggio. È l'unico rilievo di questo
   audit che può fermare l'operatività dell'agenzia da fuori, senza credenziali.
2. **Avvelenamento del registro.** `error_reports` esiste per una ragione sola:
   che il codice `VD-…` dettato al telefono possa essere *cercato*. Diecimila
   righe inventate lo rendono incercabile, il che chiude `A-4` del 31 agosto e
   lo riapre nello stesso gesto.

**Un terzo effetto, minore ma da nominare:** `code` è `unique` con `on conflict
do nothing`, e il formato è `VD-<Date.now() in base36>-<4 caratteri>`
(`errorReporting.js:60`). Precompilare i codici di un istante futuro costa
36⁴ = 1.679.616 righe per millisecondo: non è praticabile, e lo scrivo solo
perché la difesa non sia «nessuno ci ha pensato» ma «è stato contato».

**Perché il ragionamento della migrazione non copre questo caso.** Il file
argomenta a lungo sul *contenuto* — «non deve contenere PII oltre a quella già
presente in users» — e sulla *lettura* — «lettura: soli admin». Sono entrambe
corrette. La variabile mancante è il *volume*, ed è quella che il 28 agosto
`20260828100000_ping_revoca_anon_migrazioni.sql` ha considerato per una
funzione di sola **lettura**, togliendole il grant ad `anon` per non offrire
«ricognizione gratuita». Qui la funzione **scrive**, e ha tenuto il grant.

**Soluzione.** Una migrazione che aggiunge le tre cose che mancano — tetti,
limite di frequenza, potatura — senza togliere il grant ad `anon`, che ha una
ragione vera: un crash può avvenire prima del login, ed è la finestra che
l'`ErrorBoundary` di `main.jsx` copre da solo.

```sql
-- supabase/migrations/20260902xxxxxx_segnala_errore_client_limiti.sql
--
-- C-1 dell'audit del 2 settembre. `segnala_errore_client()` è concessa ad
-- `anon` — il ruolo della chiave pubblica — e non pone alcun limite: né di
-- lunghezza sui campi (`text`, illimitati) né di frequenza. Su un piano Free
-- da 500 MB, riempire il database non ferma la tabella delle segnalazioni:
-- ferma OGNI scrittura dell'applicazione.
--
-- Il grant ad `anon` RESTA, ed è deliberato: un crash può avvenire prima del
-- login, e un errore che non riesce a segnalare se stesso perché richiederebbe
-- un login sarebbe un controsenso (è il ragionamento della 20260901120000, che
-- questa migrazione non contraddice ma delimita).
--
-- I due secchi non sono simmetrici e la differenza è il punto: un utente
-- autenticato è identificabile e risponde del proprio traffico, quindi il
-- limite è PER UTENTE; un anonimo non lo è, quindi il secchio è UNO SOLO per
-- tutti — è quello che limita ciò che chiunque abbia la chiave pubblica può
-- fare, ed è per questo che è il più stretto dei due.

-- Il conteggio del rate limit filtra per (user_id, at): l'indice esistente è
-- su (at desc) e non copre il ramo autenticato.
create index if not exists error_reports_user_at
  on public.error_reports (user_id, at desc);

create or replace function public.segnala_errore_client(
  p_code       text,
  p_origin     text,
  p_message    text,
  p_stack      text default null,
  p_url        text default null,
  p_user_agent text default null
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_me      uuid := (select auth.uid());
  v_nome    text;
  v_recenti int;
begin
  if p_code is null or p_message is null then
    return;
  end if;

  -- Rate limit. `return` e non `raise`: siamo già dentro il percorso che
  -- gestisce un errore non gestito (vedi il preambolo di
  -- src/lib/errorReporting.js), e un rifiuto rumoroso genererebbe il secondo
  -- errore che quel file esiste per non produrre.
  if v_me is null then
    select count(*) into v_recenti
      from public.error_reports
     where user_id is null and at > now() - interval '1 minute';
    if v_recenti >= 20 then return; end if;
  else
    select count(*) into v_recenti
      from public.error_reports
     where user_id = v_me and at > now() - interval '1 minute';
    if v_recenti >= 60 then return; end if;
  end if;

  if v_me is not null then
    select name into v_nome from public.users where id = v_me;
  end if;

  -- Tetti di lunghezza. `left()` e non un rifiuto: una segnalazione TRONCATA
  -- resta utile (il codice, l'origine e la prima riga dello stack sono ciò
  -- con cui la si cerca), una segnalazione RIFIUTATA non lo è.
  insert into public.error_reports (code, user_id, user_name, origin, message, stack, url, user_agent)
  values (
    left(p_code, 64),
    v_me,
    v_nome,
    left(coalesce(p_origin, 'sconosciuto'), 64),
    left(p_message, 500),
    left(p_stack, 4000),
    left(p_url, 500),
    left(p_user_agent, 300)
  )
  on conflict (code) do nothing;

  -- A-3 · potatura opportunistica: una chiamata su cento paga la
  -- cancellazione di ciò che ha più di novanta giorni. È la stessa forma che
  -- `giaSegnalato` usa in src/lib/errorReporting.js per la sua Map — e come
  -- lì, la ragione di farla QUI è che non richiede né pg_cron (non
  -- disponibile sul piano Free) né che qualcuno se ne ricordi.
  if random() < 0.01 then
    delete from public.error_reports where at < now() - interval '90 days';
  end if;
end $$;

revoke execute on function public.segnala_errore_client(text,text,text,text,text,text) from public;
grant   execute on function public.segnala_errore_client(text,text,text,text,text,text) to anon, authenticated;
```

**Il tetto va messo anche lato client**, non al posto di quello del database ma
insieme: tronca prima di mandare, così non si trasferiscono megabyte per
scartarli all'arrivo.

```js
// src/lib/api/configurazione.js
// I tetti rispecchiano quelli di public.segnala_errore_client (C-1): qui si
// evita di TRASFERIRE ciò che il database scarterebbe comunque, non si
// sostituisce il suo controllo — questa è la porta che il client attraversa,
// non l'unica che esista.
const tronca = (v, n) => (typeof v === 'string' ? v.slice(0, n) : null);

export const ErrorReports = {
  create: async ({ code, origin, message, stack, url, userAgent }) => {
    const supabase = await getSupabase();
    return supabase.rpc('segnala_errore_client', {
      p_code: tronca(code, 64),
      p_origin: tronca(origin, 64),
      p_message: tronca(message, 500),
      p_stack: tronca(stack, 4000),
      p_url: tronca(url, 500),
      p_user_agent: tronca(userAgent, 300),
    });
  },
  // …
};
```

---

### A-3 · `error_reports` cresce senza retention e senza tetto — ~~**Alta**~~ ✔ **risolto**

**Dove.** `supabase/migrations/20260901120000_error_reports.sql`, tutta.

È il gemello legittimo di `C-1`, e va tenuto separato perché **non richiede un
attaccante**. `registraSegnalazione` è chiamata da `segnala()` **fuori dal
dedup**, con una motivazione esplicita e giusta:

```js
// src/lib/errorReporting.js:245
// A-4: la segnalazione, a differenza del toast qui sotto, NON passa dal
// dedup — un `error_reports` con meno righe di quante ne servano a capire
// "succede in continuazione" sarebbe un difetto peggiore di qualche riga
// ripetuta in più.
registraSegnalazione(codice, origine, motivo);
```

La conseguenza è che il caso peggiore *ordinario* è una `setInterval` che
rigetta, o una subscription che riaggancia in loop in una scheda lasciata
aperta la notte: qualche decina di righe al secondo, ciascuna con lo stack
completo, per ore. Il commento sopra dice che le ripetizioni sono l'informazione
che serve — ed è vero — ma «tutte le ripetizioni, per sempre» non è la stessa
affermazione.

Non c'è alcuna retention: la tabella non viene potata da nessuno, e il progetto
non ha `pg_cron`. Non c'è alcun tetto sui campi. `error_reports_at_desc` è
l'unico indice, e cresce insieme.

**Soluzione.** È interamente contenuta nella migrazione di `C-1` qui sopra —
i `left()` e la potatura opportunistica — più il tetto lato client. La ragione
per cui è un rilievo a sé e non un paragrafo di `C-1` è che ha una priorità
diversa: `C-1` va chiuso perché qualcuno *potrebbe*, `A-3` perché prima o poi
*succederà da solo*.

---

### M-2 · Il `message` salvato può contenere PII di clienti — ~~**Media**~~ ✔ **risolto**

✅ **Chiuso il 3 settembre.** `redigiPii()` in `src/lib/errorReporting.js` sostituisce
email e telefono nel `message` e nello `stack` prima della scrittura, con lo
stesso codice proposto in questo rilievo — solo sulla scrittura in tabella, non
in console. Cinque test in `src/test/lib/errorReportingPii.test.js`.

**Dove.** `src/lib/errorReporting.js:221`, letto contro il commento della
tabella in `20260901120000_error_reports.sql`.

Il `comment on table` dichiara:

> `Non deve contenere PII oltre a quella già presente in users (nome/id di chi
> era loggato quando è successo).`

È lo stesso contratto che `audit_log` scrive su `details`, e per la stessa
ragione: «chi ci mette un'email trasforma il registro di controllo in una
seconda copia dei dati da proteggere». Ma su `error_reports` il contratto non è
applicato da nulla, e il campo che lo viola non è opzionale — è `message`, che
arriva da `testoLeggibile(motivo)`, cioè dal messaggio dell'eccezione così
com'è.

Un errore del data layer porta con sé il valore che ha causato il rifiuto. Un
`23505` su un vincolo di unicità è, testualmente:

```
duplicate key value violates unique constraint "clients_email_key"
DETAIL:  Key (email)=(mario.rossi@example.it) already exists.
```

Quello è l'indirizzo di un cliente — una persona esterna al team — che finisce
in una tabella la cui policy di lettura (`private.is_admin()`) è **più larga**
di quella dell'originale, che passa da `rls_active_only` e da un elenco di
ruoli. È lo scenario esatto che il commento di `audit_log` descrive.

La stessa via è aperta ai messaggi che citano un nome cliente o un numero di
telefono da un vincolo `check`, e a `p_url` se un giorno l'app usasse query
string.

**Soluzione.** Non censurare — un messaggio d'errore ripulito non serve più a
niente — ma **redigere le forme note di PII prima di inviare**, nello stesso
punto in cui il messaggio viene composto, così la regola sta accanto al
contratto che deve rispettare.

```js
// src/lib/errorReporting.js
// ─── M-2 · IL CONTRATTO DELLA TABELLA VALE ANCHE PER CHI CI SCRIVE ────────
// `public.error_reports` dichiara di non contenere PII oltre a quella già in
// `users`, esattamente come `audit_log.details`. Ma `message` arriva dal
// messaggio dell'eccezione così com'è, e un rifiuto di Postgres CITA il valore
// che l'ha causato: «Key (email)=(mario.rossi@example.it) already exists» è
// l'indirizzo di un cliente in una tabella la cui lettura è più larga di
// quella dell'anagrafica. Si redige qui, dove il testo si compone, e non a
// valle: a valle sarebbe una seconda regola da ricordare.
//
// Le due forme coperte sono quelle che i vincoli del database citano davvero
// (email e telefono). Non è un filtro esaustivo, ed è meglio dirlo che
// lasciarlo credere: è la rimozione delle forme NOTE, non una garanzia.
const redigiPii = (testo) =>
  String(testo ?? "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "«email»")
    .replace(/(?<!\d)(?:\+\d{1,3}[ .-]?)?(?:\d[ .-]?){8,14}\d(?!\d)/g, "«telefono»");

export function registraSegnalazione(codice, origine, motivo, dettaglioAggiuntivo) {
  import('./api.js').then(({ ErrorReports }) => ErrorReports.create({
    code: codice,
    origin: origine,
    message: redigiPii(testoLeggibile(motivo)),
    stack: redigiPii(motivo?.stack || dettaglioAggiuntivo || ""),
    url: typeof window !== "undefined" ? window.location?.href : null,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : null,
  })).catch(() => {});
}
```

⚠️ **La redazione va solo sulla scrittura in tabella, non sulla console.**
`console.error` in `segnala()` deve continuare a stampare il messaggio intero:
è il canale della diagnosi, vive nel browser di chi ha avuto l'errore e non
attraversa alcun confine di autorizzazione.

---

### B-2 · Nessun rate limiting sulle Edge Function — ~~**Bassa**~~ ✔ **risolto** *(prosegue `M-3` del 31 agosto)*

✅ **Chiuso il 3 settembre.** `public.rate_limit` + la RPC
`rate_limit_incrementa()` (migrazione `20260904000000_rate_limit_edge_functions.sql`,
stessa forma proposta da `M-3`) contano per `(chiave, finestra)`, con la
chiave che porta l'id di CHI chiama — `invite-user:<uid>`,
`delete-user:<uid>`, `set-user-active:<uid>`, `delete-account:<uid>` — così un
secchio pieno per un admin non tocca gli altri. `_shared/rateLimit.ts` è
fail-open: un errore della RPC lascia passare la richiesta invece di bloccare
un'operazione legittima, con lo stesso principio di `segnala_errore_client`
(`C-1`). `send-push` resta fuori: non è raggiungibile dal browser (la chiama
solo il trigger DB), e il suo `user_id` è il destinatario della notifica, non
CHI chiama — un tetto lì sarebbe una feature diversa. Verificato con
`src/test/edge/rateLimit.test.js`, che controlla sia il comportamento
dell'helper sia il cablaggio nelle quattro funzioni.

Verificato ancora aperto su tutte e cinque le funzioni prima della correzione:
`invite-user`, `delete-user`, `set-user-active` e `delete-account` non
contavano nulla, e `send-push` è protetta da `x-push-secret` ma anch'essa
senza limite di frequenza. Il rilievo restava a bassa priorità per la ragione
già scritta lì — tre delle quattro richiedono `requireActiveAdmin` — con una
nota che `C-1` rende attuale: `delete-account` è raggiungibile da qualunque
utente autenticato, e `invite-user` può far partire email a raffica verso
indirizzi arbitrari, che è il modo in cui si brucia la reputazione di un
mittente SMTP.

---

## 2. Stato e flusso dati

### A-1 · Due mutazioni ottimistiche senza compensazione — ~~**Alta**~~ ✔ **risolto**

**Dove.** `src/state/persistence.js:298` (`ADD_NOTICE`) e `:281`
(`ADD_COMMENT`).

Il preambolo del registry dichiara la regola, e `A-1` dell'audit del 31 agosto
l'ha portata a compimento sul dominio task: oggi le otto entry dei task hanno
tutte `rollback`. La mappa completa, misurata sul commit corrente:

| Dominio | Entry con `rollback` |
|---|---|
| Task | 9 su 9 ✓ |
| Clienti | 5 su 5 ✓ |
| Team / profilo / backup | 6 su 6 ✓ |
| Avvisi | **3 su 4** — manca `ADD_NOTICE` |
| Commenti | **0 su 1** — manca `ADD_COMMENT` |
| Categorie / template | 0 su 5 (vedi `B-3`) |

Le due mancanti non sono una svista simmetrica alle altre: sono le due
mutazioni **sociali** dell'applicazione, quelle il cui esito viene letto da
qualcun altro.

**`ADD_NOTICE`.** Il reducer applica e accoda il toast:

```js
// src/state/noticesReducer.js:57
case "ADD_NOTICE": {
  const notices = [action.payload, ...state.notices];
  return { ...state, notices, toasts: pushToast(state.toasts, { message: "Avviso pubblicato in bacheca", type: "success" }) };
}
```

Se l'INSERT fallisce, `RETRACT_TOASTS` ritira il messaggio di successo — quel
pezzo funziona — ma l'avviso **resta in bacheca**. E nulla verrà a toglierlo:
una INSERT fallita non produce alcun evento realtime, quindi nessun refetch
correttivo parte. Chi ha scritto l'avviso lo vede pubblicato; il resto del team
non lo vedrà mai. È esattamente la divergenza fra schermo e database che `A-1`
del 14 agosto ha chiuso su `UPDATE_NOTICE`/`DELETE_NOTICE`/`TOGGLE_PIN_NOTICE`,
rimasta aperta sull'unica delle quattro che *crea*.

**`ADD_COMMENT`** è peggio, perché qui l'utente riceve **due affermazioni
contraddittorie insieme**. `TaskCommenti` usa `useSalvataggio` e mostra
«Commento non inviato. Il testo è ancora qui, riprova.», ripopolando la bozza —
mentre il commento ottimistico resta nel thread. L'utente legge il proprio
commento sopra il messaggio che dice che non è stato inviato; se rilegge
l'avviso e preme di nuovo Invia, ne ottiene due a schermo e uno solo sul server.

**Soluzione — `ADD_NOTICE`.** Riusa `DELETE_NOTICE`, come `ADD_CLIENT` riusa
`ROLLBACK_CLIENTS_BULK`: il case esiste già, il suo `canEditNotice` passa
sempre (`normalize` ha appena impostato `author = uid`), e `meta.compensazione`
— che l'orchestratore aggiunge da sé — ne sopprime il toast e la voce di log.

```js
// src/state/persistence.js
ADD_NOTICE: {
  normalize: (a, s, uid) => ({
    ...a,
    payload: {
      ...a.payload,
      id: isUuid(a.payload?.id) ? a.payload.id : newId(),
      author: a.payload.author ?? uid,
    },
  }),
  entityId: (a) => a.payload?.id,
  persist: (s, a) => NoticesAPI.create(toDbNotice(a.payload)),
  // A-1 dell'audit del 2 settembre. Era l'unica delle quattro entry degli
  // avvisi senza compensazione, ed è quella che CREA: un'INSERT respinta non
  // emette alcun evento realtime, quindi nessun refetch viene a togliere
  // l'avviso dalla bacheca di chi l'ha scritto — che lo vede pubblicato
  // mentre il resto del team non lo vedrà mai. Riusa DELETE_NOTICE (il case
  // esiste e il suo canEditNotice passa: `normalize` ha appena messo
  // `author = uid`) invece di un case nuovo, come ADD_CLIENT riusa
  // ROLLBACK_CLIENTS_BULK.
  rollback: (s, a) => ({ type: "DELETE_NOTICE", payload: a.payload.id }),
  mapError: (err) => err?.message || "avviso non pubblicato",
},
```

**Soluzione — `ADD_COMMENT`.** Qui serve un case nuovo, perché non esiste
un'azione inversa: `Comments.create` costruisce la riga da
`{ task_id, user_id, text }` e **ignora** l'id del payload, che è quindi
un'identità puramente locale — ed è proprio ciò che permette di riconoscere la
riga da togliere (`B-4` del 26 agosto lo aveva introdotto per la `key` di React;
serve la stessa cosa, per la stessa ragione).

```js
// src/state/reducer.js — accanto a ROLLBACK_TASKS_BULK
// Compensazione di ADD_COMMENT (A-1 dell'audit del 2 settembre). Toglie dal
// thread il commento ottimistico la cui INSERT non è arrivata.
//
// Si identifica per l'id LOCALE, e non è un ripiego: `Comments.create` non lo
// manda al server (costruisce la riga da task_id/user_id/text), quindi questo
// valore è per definizione l'identità di ciò che sul database non esiste — la
// stessa proprietà per cui B-4 del 26 agosto lo ha introdotto come `key`.
//
// Nessun toast: quello d'errore lo mostra già `fail()` in useSyncedDispatch,
// come per ROLLBACK_TASKS_BULK.
case "ROLLBACK_COMMENT": {
  const { taskId, commentId } = action.payload || {};
  if (!taskId || !commentId) return state;
  return {
    ...state,
    tasks: state.tasks.map(t =>
      t.id === taskId
        ? { ...t, comments: (t.comments || []).filter(c => c.id !== commentId) }
        : t),
  };
}
```

```js
// src/state/persistence.js
ADD_COMMENT: {
  guard: (s, a, uid) => {
    const prev = findTask(s, a.payload.taskId);
    return !!prev && canViewTask(s.team, prev, uid);
  },
  entityId: (a) => a.payload?.taskId,
  persist: (s, a, uid) => CommentsAPI.create({
    task_id: a.payload.taskId,
    user_id: uid,
    text: a.payload.comment?.text ?? "",
  }),
  // Senza, l'utente leggeva DUE affermazioni contraddittorie insieme: il
  // proprio commento nel thread e, sotto, «Commento non inviato. Il testo è
  // ancora qui, riprova.» — e riprovando ne otteneva due a schermo e uno solo
  // sul server.
  rollback: (s, a) => ({
    type: "ROLLBACK_COMMENT",
    payload: { taskId: a.payload?.taskId, commentId: a.payload?.comment?.id },
  }),
  mapError: (err) => err?.message || "commento non inviato",
},
```

⚠️ **Il test che tiene chiusa la regola.** `src/test/persistenceGuards.test.js`
verifica che il verdetto del `guard` coincida con quello del reducer, non che
esista una compensazione. Il modo per non riaprire questo rilievo una terza
volta è misurare l'invariante, come `scrittureInVoloContract.test.js` fa per
`entityId`:

```js
// src/test/state/rollbackContract.test.js (nuovo)
// A-1 dell'audit del 2 settembre. Il preambolo di state/persistence.js dice
// che una mutazione ottimistica senza compensazione lascia la UI divergente
// dal database — e nulla la riporta indietro, perché una scrittura RESPINTA
// non emette alcun evento realtime. Questo test rende quella frase misurabile
// invece che affidata a chi legge il file per intero.
//
// L'elenco delle eccezioni è ESPLICITO e non un `skip`: chi ne aggiunge una
// deve scrivere qui accanto perché quella mutazione può permettersi di non
// tornare indietro.
const SENZA_COMPENSAZIONE = new Set([
  // Tabelle di configurazione, scritte dai soli admin dal pannello e senza
  // refetch concorrente (le loro sottoscrizioni sono `senzaCanale`). Vedi B-3.
  "ADD_CATEGORY", "UPDATE_CATEGORY", "REMOVE_CATEGORY",
  "ADD_MESSAGE_TEMPLATE", "UPDATE_MESSAGE_TEMPLATE", "DELETE_MESSAGE_TEMPLATE",
]);

it("ogni entry che scrive ha una compensazione, o è dichiarata fra le eccezioni", () => {
  const senza = Object.entries(PERSISTENCE)
    .filter(([tipo, spec]) => spec.persist && !spec.rollback && !SENZA_COMPENSAZIONE.has(tipo))
    .map(([tipo]) => tipo);
  expect(senza).toEqual([]);
});
```

---

### B-3 · Categorie e template messaggi senza compensazione — ~~**Bassa**~~ ✔ **risolto**

✅ **Chiuso il 3 settembre**, con la soluzione consigliata qui sotto:
l'eccezione è dichiarata in `SENZA_COMPENSAZIONE`
(`src/test/state/rollbackContract.test.js`, nato per `A-1`), non le cinque
compensazioni.

**Dove.** `src/state/persistence.js:507-537`.

```js
ADD_CATEGORY: { persist: (s, a) => CategoriesAPI.create(toDbCategory(a.payload)) },
```

Cinque entry con `persist` e nient'altro: né `rollback`, né `mapError`, né
`entityId`. L'assenza di `entityId` è corretta e documentata (le loro
sottoscrizioni sono `senzaCanale`, quindi la finestra di refetch concorrente non
esiste); l'assenza di `rollback` no, ed è la stessa classe di `A-1` con un
impatto molto minore: sono tabelle di configurazione, scritte dai soli admin,
lette da tutti. Una categoria fantasma resta nel dizionario del solo admin che
l'ha creata finché non ricarica — e nel frattempo può assegnarla a un task, che
sul server finisce con una categoria che non esiste.

**Soluzione.** O si aggiungono le cinque compensazioni, o — ed è la scelta che
consiglio — si dichiara l'eccezione nel `SENZA_COMPENSAZIONE` del test di `A-1`,
che è il modo per trasformare «non ci abbiamo pensato» in «abbiamo deciso di
no, ed è scritto dove qualcuno lo legge».

---

## 3. Architettura e struttura del codice

### M-3 · Il registro degli audit è disallineato dal codice — ~~**Media**~~ ✔ **risolto**

✅ **Chiuso il 3 settembre, in due passi come proposto.** `A-1` e `A-4`
dell'audit del 31 agosto sono ora marcati `✔ risolto` nella loro tabella delle
priorità, con `INDEX.md` allineato a `⟦stato: 5/14 chiusi⟧`. E il secondo
passo — l'ancora — è in piedi: `verificaAncore()` in
`scripts/verifica-convenzioni/ancore.js`, con due ancore che legano proprio
`A-1` e `A-4` del 31 agosto a una condizione sul sorgente (ogni entry task/
commento nominata dal rilievo ha `rollback`; la migrazione di `error_reports`
esiste nel repo). Il controllo n. 7 esistente resta — confronta ancora due
prose fra loro — ma ora accanto ha due controlli che confrontano una prosa
con il codice, che è la metà che mancava.

**Dove.** `docs/INDEX.md:52`, `docs/AUDIT_CODEBASE_2026-08-31.md:88` e `:91`,
`scripts/verifica-convenzioni/convenzioni.js:109`.

`AUDIT_CODEBASE_2026-08-31.md` dichiara `⟦stato: 3/14 chiusi⟧` e la riga di
`INDEX.md` dice la stessa cosa in prosa: quattro rilievi di alta priorità
aperti, fra cui

> il rollback dichiarato dal registry e assente sui task (`A-1`) […] il codice
> di segnalazione mostrato all'utente e mai raccolto (`A-4`).

Il codice dice altro. `src/state/persistence.js:99` porta il commento «A-1
dell'audit del 1 settembre» e le otto entry dei task hanno oggi il `rollback`;
`supabase/migrations/20260901120000_error_reports.sql` e
`src/lib/errorReporting.js:217` chiudono `A-4`. Sono **cinque su quattordici**,
non tre.

**Perché `verifica:convenzioni` passa lo stesso.** Il controllo confronta
`leggiStatoAudit` (le righe della tabella delle priorità del documento) con
`leggiStatoIndex` (il marcatore `⟦stato: N/M chiusi⟧` in `INDEX.md`). Sono due
prose, scritte dalla stessa mano nello stesso commit: **non possono smentirsi a
vicenda**, e infatti non lo fanno. Il controllo verifica che l'indice sia
aggiornato quando lo è il documento; nessuno verifica che il documento sia
aggiornato quando lo è il *codice*.

È esattamente la forma di difetto che questo progetto ha già riconosciuto due
volte, e che il file dello script descrive meglio di come potrei io:

> *«un audit fuori dal registro ha un marcatore che nessuno verifica, e il
> momento in cui scade è esattamente quello in cui si comincia a chiudere i suoi
> rilievi — cioè quando nessuno sta più guardando questo file.»*

Il registro c'è; a scadere in silenzio è il gradino successivo.

**Perché conta più di quanto sembri.** Un audit resta normativo finché i suoi
rilievi sono aperti — lo dice `INDEX.md`. Chi entra oggi legge che il dominio
task non ha rollback, apre `persistence.js`, lo trova, e da quel momento non si
fida più di *nessuna* riga del registro. Il costo non è il rilievo sbagliato: è
la fiducia in tutti gli altri.

**Soluzione, in due passi.**

*Primo, immediato:* marcare `A-1` e `A-4` come chiusi nella tabella delle
priorità di `AUDIT_CODEBASE_2026-08-31.md` (`~~Alta~~ ✔ **risolto**`),
aggiornare la prosa e il marcatore di `INDEX.md` a `⟦stato: 5/14 chiusi⟧`, e
rilanciare `npm run verifica:convenzioni`.

*Secondo, perché non si ripeta:* un audit dovrebbe poter **ancorare un rilievo a
una condizione verificabile sul codice**, non solo a una riga di tabella. La
forma minima, che riusa il meccanismo già in piedi:

```js
// scripts/verifica-convenzioni/index.js
// M-3 dell'audit del 2 settembre. Il controllo n. 1 confronta la tabella di un
// audit con il marcatore in INDEX.md: due PROSE, scritte dalla stessa mano
// nello stesso commit, che per costruzione non possono smentirsi. È il motivo
// per cui A-1 e A-4 del 31 agosto sono stati corretti nel codice il giorno dopo
// e sono rimasti dichiarati aperti per due giorni con la verifica verde.
//
// Un'ANCORA lega un rilievo a una condizione misurabile sul sorgente. Non
// sostituisce il giudizio di chi chiude un rilievo — dice soltanto che il
// documento e il codice non stanno più raccontando due storie diverse.
const ANCORE = [
  {
    audit: 'AUDIT_CODEBASE_2026-08-31.md', rilievo: 'A-1',
    descrizione: 'ogni entry task del registry ha un rollback',
    chiuso: () => entryTaskSenzaRollback().length === 0,
  },
  {
    audit: 'AUDIT_CODEBASE_2026-08-31.md', rilievo: 'A-4',
    descrizione: 'la segnalazione raggiunge una tabella',
    chiuso: () => esiste('supabase/migrations/20260901120000_error_reports.sql'),
  },
];
// Per ogni ancora: se `chiuso()` è vero ma la riga del documento non porta ✔
// (o viceversa), il controllo fallisce nominando ENTRAMBE le letture.
```

---

### A-4 · Il rilevatore di scarto fra repository e database non gira — **Alta**

*(Trovato il 3 settembre applicando la correzione di `C-1`, non durante
l'analisi. È il rilievo che spiega gli altri di questa famiglia.)*

**Dove.** `.github/workflows/verifica-rpc.yml`, e i secret del repository.

`verifica:rpc` esiste per una ragione precisa, scritta in
`docs/MIGRAZIONI_SUPABASE.md`: «lo scarto non era dentro il repository, ma fra
repository e database». È il terzo episodio di quella famiglia ad averlo fatto
nascere. Il 1 settembre è arrivato il quarto — `20260901120000` in `main` e mai
applicata — e il controllo non ha detto niente.

**Non perché abbia mancato lo scarto: perché non è mai arrivato a cercarlo.**

```
> node scripts/verifica-rpc/index.js
Mancano SUPABASE_URL e/o SUPABASE_ANON_KEY (o le equivalenti VITE_).
##[error]Process completed with exit code 2.
```

I due secret sono vuoti nell'ambiente del workflow. `verifica:rpc` e
`verifica:migrazioni` escono con codice 2 prima della prima richiesta;
`verifica:redirect` salta il proprio controllo con un `⚠`. Restano in piedi i
soli due che usano `SUPABASE_ACCESS_TOKEN`, che invece è configurato:
`verifica:advisor` e `verifica:volumi`.

⚠️ **Lo script non ha colpa, ed è importante dirlo**: si dichiara
INCONCLUDENTE invece di stampare un verde falso — è esattamente la regola che
il suo stesso preambolo enuncia («un controllo che non può fallire non protegge
da nulla, ma sembra di sì»). Il difetto è che nessuno legge la differenza fra
«inconcludente» e «passato», perché entrambe arrivano dentro un workflow che è
rosso comunque.

**E questa è la seconda metà, quella che ha reso il difetto invisibile.** Il
workflow fallisce **a ogni esecuzione dal 27 agosto**: ultimo successo il 27
alle 17:43, poi ventuno run consecutive fallite in sette giorni, fra push e
schedulazione giornaliera. Un allarme sempre acceso smette di essere un
allarme — che è, parola per parola, il ragionamento con cui
`scripts/verifica-audit/index.js` motiva la propria allow-list:

> *«un allarme sempre acceso smette di essere un allarme: chiunque lo lanci
> impara a ignorarlo, e il giorno in cui comparirà una SECONDA vulnerabilità
> sarà indistinguibile dal rumore di fondo.»*

Il progetto ha applicato quel ragionamento a `npm audit` e ha lasciato rosso
per una settimana il workflow che avrebbe dovuto trovare questo. È `M-3` allo
stadio successivo: là il registro non sapeva del codice, qui la CI non sapeva
del database — e lo diceva a un pubblico che aveva smesso di ascoltare.

**Soluzione.** Il rimedio principale non è nel repository: sono due secret da
configurare, `SUPABASE_URL` e `SUPABASE_ANON_KEY`, entrambi **pubblici** (la
chiave anon sta già nel bundle di produzione, quindi non c'è nulla da
proteggere e nessuna ragione per cui manchino).

Nel repository va chiuso il modo in cui l'assenza è passata inosservata: un
`exit 2` per credenziali mancanti non deve assomigliare a un fallimento di
verifica. Va nominato come errore di CONFIGURAZIONE e detto dove si guarda,
cioè nel sommario del run e non in un log che nessuno apre.

```yaml
# .github/workflows/verifica-rpc.yml — primo step del job
      - name: Secret presenti
        run: |
          if [ -z "${{ secrets.SUPABASE_URL }}" ] || [ -z "${{ secrets.SUPABASE_ANON_KEY }}" ]; then
            {
              echo "### CONFIGURAZIONE MANCANTE — verifica:rpc non ha potuto girare"
              echo
              echo "Mancano i secret SUPABASE_URL e/o SUPABASE_ANON_KEY."
              echo "Sono entrambi PUBBLICI (l'anon key sta nel bundle di produzione)."
              echo
              echo "Finche' mancano, NULLA verifica che le migrazioni committate"
              echo "siano state applicate: e' il difetto che questo workflow esiste"
              echo "per trovare. Vedi docs/MIGRAZIONI_SUPABASE.md, quarto episodio."
            } >> "$GITHUB_STEP_SUMMARY"
            exit 1
          fi
```

⚠️ **Configurare i secret non chiude il rilievo da solo.** Il controllo copre
le FUNZIONI, non le tabelle, le colonne o le policy — lo dice già
`MIGRAZIONI_SUPABASE.md`. `20260901120000` creava una tabella *e* una funzione,
quindi sarebbe stata vista; una migrazione che aggiunge solo una policy no. Il
passo 4 a mano resta, ed è la sola copertura per quel caso.

---

## 4. UX/UI e gestione errori

### A-2 · La regola che certifica la tastiera non vede le tabelle — ~~**Alta**~~ ✔ **risolto**

**Dove.** `eslint.config.js:395-397`, con i quattro gesti scoperti in
`src/components/liste/ListaDetail.jsx:174` e `:274`,
`src/components/liste/ArchivedListe.jsx:245`,
`src/components/tasks/Archive.jsx:300`.

`A-2` e `A-3` dell'audit del 31 agosto sono stati chiusi installando
`eslint-plugin-jsx-a11y` e accendendo tre regole a `error`:

```js
'jsx-a11y/click-events-have-key-events': 'error',
'jsx-a11y/no-static-element-interactions': 'error',
'jsx-a11y/label-has-associated-control': 'error',
```

`npm run lint` è verde. **E quattro gesti restano irraggiungibili da tastiera**,
perché `no-static-element-interactions` guarda gli elementi *statici*: `<tr>`
porta il ruolo ARIA implicito `row` e `<td>` porta `cell`, quindi per la regola
non sono statici e non vengono esaminati. È una scelta ragionevole della
libreria — non è una configurazione sbagliata di questo progetto — ma il suo
effetto qui è che il perimetro certificato è più piccolo del codice.

Cosa resta fuori, in ordine di gravità:

| File:riga | Cosa non si può fare da tastiera |
|---|---|
| `liste/ListaDetail.jsx:174` (`cell()`) | **modificare un movimento del registro contabile** — data, descrizione, importo: la funzione `cell()` è usata per tutte le colonne editabili |
| `liste/ListaDetail.jsx:274` | modificare la descrizione di un movimento |
| `liste/ArchivedListe.jsx:245` | aprire una lista viaggio archiviata |
| `tasks/Archive.jsx:300` | aprire una task archiviata |

Il primo è il caso che alza questo rilievo ad Alta: il modulo Liste è dove si
registrano movimenti di denaro, e il gesto per correggere una cifra sbagliata è
raggiungibile solo con un puntatore.

*Non sono in elenco*, e vanno esclusi esplicitamente perché una ricerca testuale
li trova insieme agli altri, i wrapper `onClick={e => e.stopPropagation()}` di
`Archive.jsx:275`, `ContactActions.jsx:52`, `DuplicateTab.jsx:177` e
`ArchivedListe.jsx:260`: non sono controlli, portano già un
`eslint-disable-next-line` con la motivazione accanto, e i loro figli sono
`<button>` nativi.

**Soluzione, in due metà — e sono inseparabili.**

*La prima: rendere navigabili i quattro gesti.* Per una riga di tabella la forma
corretta **non** è `role="button"` (distruggerebbe la semantica della griglia
per uno screen reader): si tiene il ruolo implicito e si aggiungono
`tabIndex` e la gestione dei tasti.

```jsx
// src/lib/a11y.js — accanto agli helper già presenti
/**
 * Le props che rendono una CELLA o una RIGA di tabella azionabile da tastiera.
 *
 * A-2 dell'audit del 2 settembre. Non mette `role="button"`: `<tr>` e `<td>`
 * hanno i ruoli impliciti `row` e `cell`, che sono ciò con cui uno screen
 * reader naviga una griglia — sovrascriverli renderebbe accessibile il gesto e
 * illeggibile la tabella. Si tiene la semantica e si aggiunge la tastiera.
 *
 * Spazio va intercettato con `preventDefault`, altrimenti la pagina scorre
 * mentre l'azione parte.
 */
export const cellaAzionabile = (onAziona, etichetta) => ({
  tabIndex: 0,
  'aria-label': etichetta,
  onClick: onAziona,
  onKeyDown: (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onAziona(e);
  },
});
```

```jsx
// src/components/liste/ListaDetail.jsx
const cell = (m, campo, className, content) => (
  <td
    className={`${className} editable`}
    title="Tocca per modificare"
    {...cellaAzionabile(() => setEditCell({ id: m.id, campo }), `Modifica ${campo}`)}
  >
    {content}
  </td>
);
```

```jsx
// src/components/tasks/Archive.jsx — stessa forma su <tr>
<tr key={task.id} style={borderBottom2}
  onMouseEnter={e => e.currentTarget.style.background = "var(--surface2)"}
  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
  {...cellaAzionabile(() => dispatch({ type: "SET_SELECTED_TASK", payload: task }),
                      `Apri ${task.title}`)}
>
```

*La seconda: far vedere alla verifica ciò che oggi non vede.* `jsx-a11y` non
coprirà mai questo caso, quindi la regola va scritta qui — e il posto giusto è
`no-restricted-syntax`, che il progetto già usa per le proprie invarianti.

```js
// eslint.config.js — dentro il no-restricted-syntax esistente
{
  // A-2 dell'audit del 2 settembre. `jsx-a11y/no-static-element-interactions`
  // esamina i soli elementi STATICI: <tr> e <td> portano i ruoli impliciti
  // `row` e `cell`, quindi non lo sono e la regola non li guarda. Il risultato
  // è che quattro gesti — fra cui MODIFICARE UN MOVIMENTO CONTABILE — sono
  // rimasti irraggiungibili da tastiera con il lint verde. Questa regola
  // guarda dove quella non arriva; `cellaAzionabile()` in lib/a11y.js è la
  // forma che la soddisfa.
  selector:
    'JSXOpeningElement[name.name=/^(tr|td|th|li)$/]' +
    ':has(JSXAttribute[name.name="onClick"])' +
    ':not(:has(JSXAttribute[name.name="onKeyDown"]))',
  message:
    'Riga o cella di tabella cliccabile senza gestione tastiera. Usa ' +
    'cellaAzionabile() da lib/a11y.js, oppure metti un <button> dentro la ' +
    'cella. Se è solo un stopPropagation, disattiva la regola con il perché ' +
    'accanto, come in Archive.jsx:275.',
},
```

---

### M-4 · 21 `<label>` senza `htmlFor` — ~~**Media**~~ ✔ **risolto** *(prosegue `A-3` del 31 agosto)*

✅ **Chiuso il 3 settembre.** Misurato di nuovo sul commit corrente: i 21
erano scesi a 9 (in 8 file, non più 15) nel tempo fra l'audit e questa
chiusura — la stessa correzione incrementale, «un file alla volta quando lo
si tocca», descritta in `docs/CLAUDE.md`. I nove residui erano tutti
checkbox/select con la forma annidata: ognuno ha ora un `useId()` (o un id
statico, dove il file già usava quella forma) e `htmlFor`/`id` espliciti.
**0 `<label>` su 82 senza `htmlFor`** in `src/components/`, misurato con lo
stesso metodo (non un campione).

Misurato sul commit corrente: **21 su 85** (era 51 su 75). Il rilievo prosegue
ma su un insieme diverso, e i venti file dell'audit precedente non sono più i
venti di oggi:

| File | `<label>` senza `htmlFor` |
|---|---|
| `tasks/RipristinaTaskModal.jsx` | 3 |
| `liste/AddMovBox.jsx`, `liste/modals/EditMovimentoModal.jsx`, `shell/ProfileEditor.jsx`, `tasks/QuickAddTask.jsx` | 2 ciascuno |
| `admin/AddTeamMemberModal.jsx`, `admin/tabs/AdminIOTab.jsx`, `clients/ClientImportModal.jsx`, `clients/ClienteModal.jsx`, `dashboard/NoticeEditorModal.jsx`, `liste/ListeViaggio.jsx`, `liste/modals/EditListaModal.jsx`, `search/AdvancedSearchPanel.jsx`, `search/FilterDropdown.jsx`, `ui/DateTimePicker.jsx` | 1 ciascuno |

`jsx-a11y/label-has-associated-control` è a `error` e il lint è verde: significa
che questi ventuno soddisfano la regola per **annidamento** (il campo è dentro
la `<label>`), che è una forma valida. Il rilievo resta perché la forma
annidata si rompe in silenzio alla prima ristrutturazione del markup, mentre
`htmlFor`/`id` no — ed è per questo che è **Media** e non Alta: non è un difetto
di oggi, è la sua fragilità.

---

### M-1 · La segnalazione ha un posto dove essere scritta, non uno dove essere cercata — ~~**Media**~~ ✔ **risolto**

✅ **Chiuso il 3 settembre**, dopo `C-1`/`A-3` come questo rilievo stesso
prescriveva. `admin/tabs/ErrorReportsSection.jsx` affianca `AuditLogSection.jsx`
dentro la tab «Log attività» — stesso `useCaricamento`, stesso export CSV,
stesso trattamento dei tre stati (caricamento/vuoto/errore).

**Dove.** `src/lib/api/configurazione.js:110`.

```js
// Non ancora letta da nessuna vista: la tab «Log attività» esiste già per
// audit_log (AdminActivityTab) e questo elenco può affiancarla allo stesso
// modo, quando servirà una UI invece della sola query su Supabase.
list: async ({ limit = 200 } = {}) => { /* … */ },
```

Il commento è onesto, e il rilievo è che descrive un lavoro fermo a metà del
guado. `A-4` del 31 agosto è: *«il codice di segnalazione mostrato all'utente in
produzione non arriva a nessuno»*. Oggi arriva in una tabella. Ma chi riceve la
telefonata — un admin, che per definizione non ha una console Supabase aperta
davanti — continua a non avere «un posto in cui cercarla»: ne ha uno in cui
qualcun altro può cercarla per lui.

**Soluzione.** Una tab accanto ad `AdminActivityTab`, che è già la forma giusta
e già scritta: stesso filtro per data, stessa tabella, stesso export. Il lavoro
è di poche decine di righe perché `ErrorReports.list` esiste già e la policy di
lettura è già quella degli admin.

⚠️ **Va fatta dopo `C-1` e `A-3`, non prima.** Una vista che elenca le duecento
segnalazioni più recenti su una tabella senza rate limit né retention mostra il
rumore, non i guasti — e la prima volta che lo fa insegna a non aprirla più.

---

## 5. Performance e scalabilità

**Nessun rilievo nuovo.** Verificato su questo commit:

- `verifica:bundle` verde con margine su entrambe le soglie (80,88 kB gzip
  anonimo su 86; 129,12 kB autenticato su 131). Le viste pesanti sono tutte
  dietro `lazy()` con la rete di sicurezza di `LazyPanel`, e il chunk d'ingresso
  non porta con sé `@supabase/supabase-js`.
- Il prefetch di `VoyageDesk` parte alla valutazione del modulo `AuthGate`, in
  parallelo a `getSession()`: chi ha una sessione — cioè quasi tutti, in un
  gestionale — non paga cascata.
- La finestra di 60 giorni sulle task completate (`A-3` del 28 agosto) e la
  soglia `SOGLIA_MESSAGGI_CORPUS = 1500` con avviso a runtime sono due esempi di
  una scelta che il progetto fa bene e che quasi nessuno fa: **far scadere una
  decisione in modo rumoroso**.
- `B-3` del 31 agosto (`fetchAllRows` senza tetto su clienti e liste) resta
  aperto e resta Bassa: `cerca_clienti` con `pg_trgm` ha spostato la ricerca sul
  server, che era il consumatore che sarebbe cresciuto per primo.

L'unica scalabilità da tenere d'occhio non è nel codice ma nel piano: 500 MB di
database, con `error_reports` che oggi può crescere senza limite (`C-1`, `A-3`)
e `lista_history`/`task_history` che crescono per costruzione.

---

## 6. Cosa NON è un rilievo, e perché

Scritto perché la prossima lettura non riapra domande già chiuse.

- **`xlsx@0.18.5` con due CVE `high`.** `npm audit --omit=dev` è rosso e resta
  rosso: SheetJS ha lasciato il registry npm. Il rischio è mitigato per
  costruzione (parse in un Web Worker terminato subito dopo, `prototypeGuard.js`
  a sorvegliare il confine) e l'eccezione è **dichiarata** in
  `scripts/verifica-audit/index.js` con la mitigazione scritta accanto. È il
  modo giusto di gestirla.
- **CORS `*` sulle Edge Function.** Non c'è: `originConsentite.ts` enumera i tre
  host uno per uno, con scritto perché un pattern su `vercel.app` non
  descriverebbe un insieme che il progetto possiede.
- **XSS.** Zero occorrenze di `dangerouslySetInnerHTML`, `innerHTML`, `eval` o
  `new Function` in tutto `src/`. La CSP di `vercel.json` non ha
  `'unsafe-inline'` sugli script, i bucket escludono `text/html` e
  `image/svg+xml` con la motivazione scritta.
- **Escalation di privilegi via `public.users`.** Coperta due volte: il trigger
  `users_block_privileged_self_update` e la policy `users_update` della
  `20260826213000`, che il documento argomenta anche nel caso limite del
  `pending`.
- **Ruoli fra client e database che divergono.** `lib/permissions.js` rispecchia
  `private.is_admin()`/`can_liste()` per uguaglianza esatta su `toDbRole`, ed è
  la stessa domanda posta allo stesso modo ai tre livelli
  (client / DB / Edge Function, quest'ultimo via `adminPredicate.ts`).
- **Re-render inutili e context instabili.** La regola
  `VIETATO_CONTEXT_VALUE_LETTERALE` è in `eslint.config.js` e il lint è verde;
  `useSyncedDispatch` ha identità stabile per costruzione.

---

## Top 3 suggerimenti strategici

**1 · Chiudere `C-1` oggi, con la migrazione già scritta qui sopra.** ✔ **Fatto
il 3 settembre** (`20260903094500`, insieme ad `A-3`). Il ragionamento che
mancava alla `20260901120000` non era complicato — è la stessa domanda che il
progetto si era già posto il 28 agosto su `get_migrazioni_applicate()` — ed è
scritto per esteso nel file, perché la prossima funzione concessa ad `anon` lo
trovi già fatto: *una porta di scrittura pubblica va dimensionata sul volume,
non solo sul contenuto.* Vedi «Come sono stati chiusi» qui sotto, e in
particolare la difesa che il rilievo **non** aveva.

**2 · Trasformare «rollback» e «tastiera» da abitudini in invarianti misurate.**
✔ **Fatto il 3 settembre.** `A-1` e `A-2` erano lo stesso difetto a due strati
diversi: una regola che il progetto conosce, applica quasi ovunque, e che
rientrava dalla finestra nei punti che nessun controllo automatico guardava.
I due controlli proposti sono entrambi in piedi — `rollbackContract.test.js`
(la stessa forma di `scrittureInVoloContract.test.js`, applicata al rollback
invece che a `entityId`) e il selettore `no-restricted-syntax` su
`tr`/`td`/`th`/`li` in `eslint.config.js` — e costano insieme meno di
cinquanta righe. Il guadagno vero non era chiudere i due rilievi: è che il
**quinto** non si riapra. Vedi «Come sono stati chiusi (A-1 e A-2)» in fondo
al documento.

**3 · Legare i rilievi degli audit a condizioni verificabili sul codice
(`M-3`).** ✔ **Fatto il 3 settembre.** Questo repository ha tredici audit a
registro, e la disciplina con cui li tiene è la cosa che lo distingue davvero.
Ma il registro verificava solo la coerenza fra due prose, e la prima volta che
è divergiato dal codice — `A-1` e `A-4` corretti il 1 settembre, dichiarati
aperti il 2 — la verifica è rimasta verde. Due ancore in
`scripts/verifica-convenzioni/ancore.js` legano ora proprio quei due rilievi a
un predicato eseguibile («ogni entry task/commento nominata dal rilievo ha
`rollback`», «esiste la migrazione di `error_reports`»), così a scadere è il
*controllo*, non la *fiducia* — lo stesso principio del
`SOGLIA_MESSAGGI_CORPUS`, applicato al documento invece che al dato.

---

## Come sono stati chiusi (C-1 e A-3) — 3 settembre

Insieme, e non per comodità: `A-3` dichiarava già che «la soluzione è
interamente contenuta nella migrazione di `C-1`». Sono lo stesso difetto a due
distanze — la porta aperta a chiunque, e la crescita che non ha un limite
superiore nemmeno senza un attaccante — e chiuderne uno solo avrebbe lasciato
l'altro dichiarato aperto con la sua correzione già in produzione, cioè `M-3`
rifatto sul documento che `M-3` lo segnala.

### Il file

`supabase/migrations/20260903094500_segnala_errore_client_limiti.sql`.

### Le tre difese, e perché il piano d'azione ne aveva due

Il rilievo proponeva tetti di lunghezza, limite di frequenza e potatura a 90
giorni. **Non bastavano**, e la verifica è aritmetica: con i tetti di lunghezza
una riga pesa al massimo ~5,5 kB, e un limite di dieci righe al minuto lascia
passare ~14.400 righe al giorno, cioè **~80 MB al giorno**. Il piano Free è
saturo in meno di una settimana, e una potatura a 90 giorni non taglia nulla di
ciò che è stato scritto oggi. Il rilievo aveva dimensionato il ritmo e la
riga, non la **tabella**.

La terza difesa è quindi un **tetto sul numero di righe** (5.000), applicato
nella stessa potatura opportunistica:

```sql
select at into v_soglia
  from public.error_reports
 order by at desc
 offset c_max_righe limit 1;
if v_soglia is not null then
  delete from public.error_reports where at < v_soglia;
end if;
```

La sottoquery sfrutta `error_reports_at_desc`; con meno di 5.000 righe torna
`NULL` e `at < null` non seleziona nulla, che è il comportamento voluto senza
un ramo esplicito. Il caso peggiore diventa **calcolabile**: 5.000 × ~5,5 kB
≈ 28 MB, e il numero non dipende da quanto a lungo qualcuno insiste.

⚠️ Le altre due restano necessarie, e vale la pena dirlo perché il tetto sulle
righe da solo sembra sufficiente: senza i tetti di lunghezza 5.000 righe non
sono 28 MB ma qualunque cosa; senza il limite di frequenza il tetto verrebbe
raggiunto in pochi secondi e la tabella conserverebbe solo il rumore
dell'ultimo minuto — il registro resterebbe inutilizzabile pur restando
piccolo, che è il modo in cui il secondo effetto di `C-1` (l'avvelenamento)
sopravviverebbe alla correzione del primo.

### Le tre scelte da non rimangiarsi

**Il grant ad `anon` resta.** La ragione della `20260901120000` è vera: un
crash può avvenire prima del login, ed è la finestra che l'`ErrorBoundary` di
`main.jsx` copre da solo. Si è delimitato ciò che quel grant permette, non lo
si è tolto.

**I due secchi di frequenza non sono simmetrici**, ed è il punto: 60/minuto
**per utente** autenticato, 10/minuto per **tutti gli anonimi insieme**. Un
utente autenticato è identificabile e risponde del proprio traffico; un anonimo
non lo è, quindi non può avere un secchio proprio — e il suo è il più stretto
dei due perché il traffico legittimo lì è di qualche riga al giorno, non al
minuto.

⚠️ Il 60/minuto per utente è alto **di proposito**, e contraddirlo sarebbe
rimangiarsi `A-4` del 31 agosto: `registraSegnalazione` non passa dal dedup dei
toast perché «un `error_reports` con meno righe di quante ne servano a capire
*succede in continuazione* sarebbe un difetto peggiore di qualche riga ripetuta
in più». Un errore al secondo racconta ampiamente la ripetizione.

**Oltre il limite si esce in silenzio** (`return`, non `raise`). Siamo dentro
il percorso che gestisce un errore non gestito: un rifiuto rumoroso genererebbe
il secondo errore che `lib/errorReporting.js` esiste per non produrre,
richiudendo il cerchio su sé stesso. Il chiamante è fire-and-forget per
costruzione e non guarda l'esito.

### I tetti sono due, e il secondo non è di troppo

Quello che **conta** sta nel database: è l'unico che valga per chi chiama la
RPC senza passare dal data layer, e chiunque può — la chiave anon sta nel
bundle. Quello in `src/lib/api/configurazione.js` evita di **trasferire** ciò
che il database scarterebbe comunque: uno `stack` da mezzo megabyte partirebbe
dal dispositivo dell'utente, spesso in mobilità e spesso proprio mentre
qualcosa non funziona.

`src/test/lib/errorReportsLimiti.test.js` copre sei casi, verificati per
mutazione (togliendo la `slice` il caso dei tetti fallisce). Uno merita di
essere nominato: **il troncamento è dall'inizio**, e non è un dettaglio di
implementazione — lo stack porta in cima il punto in cui l'errore è nato, il
messaggio porta in cima ciò che l'utente ha letto a schermo. Troncare dalla
coda perderebbe esattamente la parte con cui si cerca il codice dettato al
telefono.

### ⚠️ Trovato chiudendo il rilievo

`segnala_errore_client` non era in **nessuno** dei due registri delle
`SECURITY DEFINER` esposte: né `FUNZIONI_SECURITY_DEFINER_VERIFICATE`
(`scripts/verifica-advisor/advisor.js`) né la tabella §1 di `SICUREZZA.md`. Il
commento di quel `Set` dice che «il punto è che ogni funzione sia stata
GUARDATA da qualcuno» — e per due giorni l'unica che nessuno avesse dichiarato
di aver guardato è stata proprio quella a cui serviva. È lo stesso `M-3` visto
da un terzo lato: la correzione è arrivata prima della registrazione.

Ora è in entrambi, con la sua guardia descritta per quello che è — non un gate
di ruolo, ma i limiti nel corpo. Le funzioni dichiarate passano da 14 a **15**,
e `docs/CLAUDE.md` porta il numero nuovo.

### ✅ Applicata — 3 settembre, 11:25-11:26 UTC

Su `tullio-staging` prima, su `vmxvnxsqfisucugcpqlc` poi, con le due
migrazioni **di fila** a ventun secondi di distanza: la finestra in cui la
funzione è esistita senza limiti è quella, e non è mai stata raggiungibile da
un client (nessun deploy in mezzo).

Registrate come `20260903112544 error_reports` e
`20260903112605 segnala_errore_client_limiti`, più le versioni con cui i due
file vivono nel repository (`20260901120000`, `20260903094500`) inserite a mano
in `schema_migrations`, così non ingrossano lo scarto di §1 di
`MIGRAZIONI_SUPABASE.md`.

**Verificato sul database, non dedotto.** Su staging il difetto è stato prima
RIPRODOTTO — 30 chiamate consecutive, tutte accettate, `stack` da 200.000
caratteri conservato intatto — e poi richiuso sugli stessi input:

| | Prima | Dopo |
|---|---|---|
| Chiamate anonime accettate su 30 | **30** | **10** (tetto 10/min) |
| Chiamate autenticate accettate su 70 | — | **60** (tetto 60/min) |
| `stack` | 200.000 caratteri | 4.000 |
| `message` / `url` / `user_agent` | 5.000 / 3.000 / 3.000 | 500 / 500 / 300 |
| INSERT diretta come `authenticated` | — | negata (nessuna policy) |
| Potatura con tetto righe | — | 50 righe → 16 con tetto 15 |

Le stesse prove su produzione: 10 accettate su 15, tutti i campi troncati ai
loro tetti, RLS attiva, `SELECT` alla sola `authenticated`, indice
`error_reports_user_at` presente. Righe di prova rimosse da entrambi i
database. Advisor di sicurezza rieseguito: `segnala_errore_client` compare nei
due lint `SECURITY DEFINER` — atteso, ed è la ragione per cui è stata aggiunta
all'allow-list — e **nessuna classe di avviso nuova**.

⚠️ **Il tetto sulle righe ha un'inesattezza da conoscere**, emersa provandolo:
il confronto è `at < soglia`, quindi righe che condividono ESATTAMENTE quel
timestamp restano tutte. Nel test 50 righe con tetto 15 ne hanno lasciate 16.
È un eccesso di una riga, dalla parte giusta, e si presenta solo quando più
segnalazioni cadono nello stesso microsecondo — cioè praticamente mai fuori da
un `generate_series`.

---

## Come sono stati chiusi (A-1 e A-2) — 3 settembre

Insieme, come `C-1`/`A-3` qui sopra: sono lo stesso difetto — una regola che il
progetto conosce e applica quasi ovunque, rientrata dalla finestra nei punti
che nessun controllo automatico guarda — visto da due strati diversi (stato
ottimistico, tastiera).

### `A-1` · Le due compensazioni mancanti

`state/persistence.js`: `ADD_NOTICE` riusa `DELETE_NOTICE` come rollback
(`canEditNotice` passa sempre: `normalize` ha appena messo `author = uid`),
esattamente come proposto. `ADD_COMMENT` ha un case nuovo, `ROLLBACK_COMMENT`
in `state/reducer.js`, che toglie dal thread il commento ottimistico
identificato per **id locale** — `CommentsAPI.create` non lo manda al server,
quindi quel valore è per definizione l'identità di ciò che sul database non
esiste (la stessa proprietà per cui `B-4` del 26 agosto lo aveva introdotto
come `key` di React). Entrambe passano da `meta.compensazione`, applicato
dall'orchestratore e non dalle entry: nessun toast di successo accanto a un
rollback, nessuna voce nel log attività.

⚠️ **Il test che tiene chiusa la regola.** `src/test/state/rollbackContract.test.js`
misura l'invariante direttamente sul registry — ogni entry con `persist` ha un
`rollback`, o è nell'elenco esplicito e motivato delle eccezioni (le sei entry
di categorie/template, `B-3` di questo stesso audit) — invece di lasciarla
affidata a chi rilegge il file per intero. `src/test/state/persistenceGuards.test.js`
dichiara `ROLLBACK_COMMENT` fra le compensazioni note al registro di
completezza esistente.

### `A-2` · La tastiera sulle tabelle

`src/lib/a11y.js` ha ora `cellaAzionabile(onAziona, etichetta)`, che riusa
`attivaConTastiera` (stesso guard `e.target !== e.currentTarget`, quindi un
bottone nativo dentro la riga — "Riapri"/"Cestina" — non fa scattare anche
l'azione della riga quando riceve Invio) e non mette `role="button"`: `<tr>` e
`<td>` restano `row`/`cell` per chi naviga con uno screen reader. Applicata ai
quattro gesti: `liste/ListaDetail.jsx` (`cell()` e la cella descrizione — il
caso che alzava il rilievo ad Alta, modificare un movimento del registro
contabile), `liste/ArchivedListe.jsx` e `tasks/Archive.jsx` (le righe della
vista desktop). I due `<td onClick={stopPropagation}>` che ospitano i bottoni
di azione non sono un gesto da rendere raggiungibile — fermano solo la
propagazione, gli stessi bottoni sono nativi — e portano un
`eslint-disable-next-line` con il perché accanto, come già in `Archive.jsx`
per il caso gemello mobile.

Il selettore `no-restricted-syntax` (`CELLA_TABELLA_CLICCABILE_SENZA_TASTIERA`
in `eslint.config.js`) guarda dove `jsx-a11y/no-static-element-interactions`
non arriva: un `<tr>`/`<td>`/`<th>`/`<li>` con `onClick` e senza `onKeyDown` è
un errore di lint, non più un lint verde su un gesto irraggiungibile.
`src/test/lib/a11y.test.js` copre `cellaAzionabile` con gli stessi casi già
in piedi per `attivaConTastiera`.

---

## Come sono stati chiusi (B-1, B-2 e B-3) — 3 settembre

I tre bassi rimasti: uno di igiene della query, uno di superficie
amministrativa, uno di scelta esplicita invece che di svista.

### `B-1` · L'escape dei caratteri jolly

`src/lib/api/clienti.js`: `escapeIlike()` sfugge `\`, `%` e `_` — il
backslash per primo, così non intercetta l'escape degli altri due — prima di
comporre `%${termine}%`. La correzione tocca solo la tendina di suggerimento
(`Clients.cerca`): `cercaAnagrafica()` passa dalla RPC `cerca_clienti` (`A-1`
del 30 agosto) e non compone `ilike` lato client, quindi non ne aveva
bisogno. `src/test/lib/clientiCerca.test.js` verifica il pattern passato a
`ilike` con il client Supabase mockato.

### `B-2` · Il rate limiting

Una tabella e una funzione, come proposto da `M-3` del 31 agosto: `public.rate_limit`
(`chiave`, `finestra`, `conteggio`) e `rate_limit_incrementa()` — insert +
`on conflict do update set conteggio = conteggio + 1 returning conteggio` in
un solo giro di rete, con la stessa potatura opportunistica di
`segnala_errore_client` (`C-1`). L'helper condiviso `_shared/rateLimit.ts`
(`entroLimite()`) lo chiama dalle quattro Edge Function: `invite-user`
(20/ora per admin — il valore che `M-3` aveva già scritto), `delete-user` e
`set-user-active` (30/ora per admin), `delete-account` (5/ora per l'utente
che chiama, self-service). La chiave è sempre `"<funzione>:<id chiamante>"`,
non solo il nome della funzione: un secchio condiviso fra tutti i chiamanti
limiterebbe l'agenzia intera al primo admin che invita, che è il difetto
opposto. `send-push` resta fuori — non è raggiungibile dal browser, e il suo
`user_id` è il destinatario della notifica e non chi chiama.

⚠️ **`entroLimite` è fail-open**: un errore della RPC (rete, un database non
ancora migrato) lascia passare la richiesta invece di bloccarla — un rate
limit che si guasta e blocca tutta l'amministrazione sarebbe un rilievo
peggiore di quello che chiude. `src/test/edge/rateLimit.test.js` verifica sia
questo comportamento sia il cablaggio: che le quattro funzioni importino e
chiamino davvero `entroLimite` (non solo che l'helper esista) e che un
verdetto negativo produca un 429.

### `B-3` · Categorie e template: la scelta dichiarata

Nessuna delle cinque compensazioni aggiunta: `SENZA_COMPENSAZIONE` in
`src/test/state/rollbackContract.test.js` (nato per `A-1` di questo stesso
audit) nomina le sei entry — categorie e template messaggi — con il motivo
scritto accanto, esattamente la soluzione che il rilievo consigliava. Non è
un rilievo aperto lasciato cadere: è "non ci abbiamo pensato" diventato
"abbiamo deciso di no, ed è scritto dove qualcuno lo legge".

---

## ⚠️ Correzione a `C-1`: la falla non era in produzione

Questo va scritto in cima a qualunque rilettura del rilievo, perché il rilievo
originale afferma il contrario.

**`segnala_errore_client` non esisteva sul database.** Nemmeno la tabella
`error_reports`. La migrazione `20260901120000` era in `main` dal 1 settembre e
non era **mai stata applicata**: l'ultima versione registrata prima di oggi era
`20260830214841`. Il controllo l'ha fatto il tentativo di applicare la
correzione, che è fallito perché `create index … on public.error_reports`
non aveva una tabella su cui posarsi.

Quindi: nelle ventiquattro ore in cui questo audit ha descritto una porta di
scrittura aperta a chiunque avesse la chiave pubblica, quella porta **non era
raggiungibile**. `C-1` era esatto sul codice e sbagliato sull'esposizione, e la
differenza non è di lana caprina: «chiunque può riempire il vostro database
adesso» e «chiunque potrà, dal primo deploy che applica questa migrazione» si
leggono in modo molto diverso.

Resta un rilievo, e resta critico, per una ragione che non cambia: la
migrazione era in `main`, cioè in ciò che il progetto considera pronto. Sarebbe
diventata vera nel momento esatto in cui qualcuno avesse fatto quello che io ho
fatto oggi — applicarla — e chi l'avesse applicata non avrebbe avuto modo di
sapere che stava aprendo qualcosa.

### E `A-4` del 31 agosto non era chiuso, in nessun senso

`M-3` dice che il registro degli audit è disallineato dal **codice**. La verità
è peggiore di così, e l'ha detta il database: `A-4` («il codice di segnalazione
mostrato all'utente non arriva a nessuno») era dichiarato aperto nel documento,
implementato nel repository e **non funzionante in produzione**. Ogni chiamata
di `registraSegnalazione` finiva in `PGRST202` — funzione inesistente —
ingoiata dal `.catch(() => {})` che quella funzione ha per non produrre un
secondo errore.

Il codice `VD-…` che un utente detta al telefono non ha raggiunto nessuno per
tutto il tempo in cui `A-4` risultava risolto nel codice. Sono **tre stati
diversi** della stessa correzione — aperta nel registro, chiusa nel repository,
assente in produzione — e i controlli del progetto ne confrontano solo due.

⚠️ Verificato che sia l'unico caso: delle 22 RPC chiamate dal frontend,
`segnala_errore_client` era **la sola** assente dal database. È il controllo che
`npm run verifica:rpc` esiste per fare, e che non ha potuto fare — gira su
`main` e sulla schedulazione giornaliera, e questa migrazione non è mai
arrivata in `main`.

### Cosa cambia per `M-3`

Il rilievo resta aperto e si allarga: il presidio proposto — ancorare i rilievi
a un predicato eseguibile sul sorgente — non avrebbe intercettato **niente** di
tutto questo, perché il sorgente era giusto. Serve che l'ancora di un rilievo
che tocca il database sia interrogata **sul database**, come fa già
`verifica:rpc` per le funzioni. La versione minima è gratis: `verifica:rpc`
gira già ogni giorno, e oggi avrebbe dovuto stampare `segnala_errore_client`
fra le assenti — non l'ha fatto perché il ramo `main` non contiene la
chiamata, che vive solo su questo branch.
