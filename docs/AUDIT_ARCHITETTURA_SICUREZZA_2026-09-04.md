# Audit — architettura e sicurezza · 4 settembre 2026

Perimetro: i cinque assi richiesti — architettura e struttura del codice,
sicurezza e gestione dei dati, stato e flusso dati, performance e scalabilità,
UX/UI e gestione errori.

Diciannove rilievi: **nessuno critico, tre di alta priorità** (erano quattro:
`A-3` è stato ridimensionato a media il 4 settembre — vedi la correzione nel suo
paragrafo, e leggila prima del rilievo).

✅ **`A-1` e `A-2` sono stati chiusi il 4 settembre**, in quest'ordine inverso
rispetto alla priorità: `A-2` era una migrazione sola, `A-1` tocca due hook e
il contratto fra loro. Vedi le due sezioni «Come è stato chiuso» in fondo al
documento.

⚠️ Questo è il primo audit del progetto condotto anche **contro il database di
produzione** (`vmxvnxsqfisucugcpqlc`) e non solo contro il repository: `pg_proc`,
`pg_policies`, `pg_trigger` e gli advisor Supabase. Tre dei quattro rilievi di
alta priorità non sono visibili leggendo le migrazioni — è la lezione che
`A-4` dell'audit del 2 settembre aveva già scritto («l'ancora di un rilievo che
tocca il database va interrogata SUL database») applicata all'analisi invece
che al controllo.

Base di partenza misurata su questo commit: `npm ci` pulito, `npm test` verde
(**2064 passati su 172 file**), `npm run lint` senza segnalazioni,
`npm run verifica:tipi` senza errori, `npm run build` + `npm run verifica:bundle`
verdi (81,09 kB gzip anonimo su 86 di soglia, 129,56 kB autenticato su 131),
`npm run verifica:convenzioni` verde (61 controlli), quattordici audit
precedenti a registro.

⟦stato: 7/19 chiusi⟧

> **Sulla numerazione.** `A-` = alta priorità, `M-` = media, `B-` = bassa, come
> negli audit dal 12 agosto in poi. Non ci sono `C-`: nessun rilievo critico.

---

## Executive summary

### Valutazione: **8,5 / 10**

Il progetto è in salute. Non è una formula di cortesia: ho cercato le classi di
difetto che di solito pagano — XSS, secret nel bundle, RLS assente, race
condition sulle scritture ottimistiche, bundle fuori controllo — e sono
**tutte già chiuse, e chiuse bene**. Zero `dangerouslySetInnerHTML`, zero
`innerHTML`, zero `eval`; CSP bloccante senza `unsafe-inline` (con la verifica
non ovvia che React scrive gli stili via CSSOM e non tocca `style-src-attr`);
allow-list di origini elencate host per host invece che per prefisso, con il
ragionamento sul perché un prefisso su `vercel.app` non descriva un insieme che
il progetto possiede; un contatore di generazione (`prendiTurno`/`vinceIlTurno`)
su ogni entità con più di uno scrittore; 2.064 test, `checkJs` a zero errori,
sette script di verifica in CI. Il preambolo di `lib/supabase.js` sul doppio
`GoTrueClient` e sul commit guard di `auth-js` è la migliore analisi post-mortem
che abbia letto in un repository applicativo.

**Il rischio principale non è più il codice: è lo scarto fra i tre livelli su
cui il codice vive.** I quattro rilievi di alta priorità hanno tutti la stessa
forma, ed è la stessa che gli audit del 31 agosto e del 2 settembre stavano già
descrivendo:

* `A-1` — il livello **applicativo** dice «negato» al reducer e «riuscito» a chi
  chiama: la stessa domanda, due risposte, e il chiamante è il form che decide
  se chiudersi.
* `A-2` — il livello **database** espone una porta di scrittura sul registro di
  controllo che nessun percorso dell'app usa, e che nessuna delle tre difese
  costruite tre giorni fa per la porta gemella (`segnala_errore_client`) copre.
* `A-3` — il livello **piattaforma** (impostazioni Supabase Auth) ha una difesa
  spenta che nessun file del repository può accendere, e che nessuno script
  guarda.
* `A-4` — il livello **dipendenze** porta due CVE note e senza fix su npm, con
  una mitigazione strutturale ottima e un fix definitivo fermo da un mese
  perché la rete lo blocca.

Nessuno dei quattro è un errore di scrittura. Tutti e quattro sono punti in cui
un controllo esiste, funziona, e **guarda un livello solo**.

### Cosa ho verificato senza trovare rilievi

| Area | Esito |
|---|---|
| XSS | 0 `dangerouslySetInnerHTML` / `innerHTML` / `eval` / `new Function` in `src/` |
| Secret nel frontend | solo `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`, entrambi pubblici per disegno |
| `console.log` residui | 1, dietro `import.meta.env.DEV && VITE_PROFILE_VIEWS` (esce dal bundle di produzione) |
| Header HTTP | CSP bloccante, HSTS 2 anni, `frame-ancestors 'none'`, COOP/COEP, `object-src 'none'` |
| `target="_blank"` | 1 occorrenza, con `rel="noopener noreferrer"`; 2 `window.open` con `"noopener"` |
| RLS su `tasks`/`messages`/`notifications`/`push_subscriptions` | policy corrette, `rls_active_only` RESTRICTIVE ovunque |
| Escalation su `public.users` | `users_update` richiede `is_active_user()` su sé stessi o `is_admin()`; trigger `audit_users_privilegi` in piedi |
| Gate admin nelle Edge Function | `requireActiveAdmin` + `puoAgireComeAdmin` ricalcano `is_admin()` incluso `coalesce(pending,false)` |
| RPC distruttive | `reset_completo` ha `private.is_admin()`, `importa_backup` idem, le RPC liste hanno `can_liste()` — **verificato su `pg_proc` in produzione, non dedotto dalle migrazioni** |
| Modifica messaggi altrui | `messages_update` è larga in RLS, ma il trigger `messages_blocca_modifiche_altrui` confronta `to_jsonb(new) - reactions - read_by - pinned…` e chiude il caso |
| Race condition sulle scritture | contatore di generazione + `isCurrent()` + `MARK_PENDING_WRITE`, con l'ordine delle azioni fissato da un test |
| Bundle e code-splitting | 81 kB gzip anonimo, 130 kB autenticato, soglie in CI, 17 chunk lazy |
| Rate limiting Edge Function | `rate_limit_incrementa` cablato in tutte e quattro, chiave per chiamante |
| Error boundary | tre livelli (app, vista, overlay) + handler globali + codice `VD-…` che raggiunge `error_reports` |

---

## Tabella delle priorità

| ID | Priorità | Rilievo | File / punto |
|---|---|---|---|
| **A-1** ✔ | ~~🔴 Alta~~ **chiuso il 4 settembre** | Un'azione **negata dai permessi** ritorna `{ error: null }`: `useSalvataggio` la legge come successo e chiama `alSuccesso()` — la modale si chiude e i dati vengono buttati, con solo un toast rosso a dirlo | `src/hooks/useSyncedDispatch.js:20-24` |
| **A-2** ✔ | ~~🔴 Alta~~ **chiuso il 4 settembre** | `public.registra_audit()` è eseguibile da **ogni utente autenticato**, senza gate di ruolo né di attività, senza tetti né limite di frequenza — e **nessun percorso dell'app la chiama**. Revocata: migrazione `20260904143756` | DB (`proacl`), `supabase/migrations/20260826214000_audit_log.sql` |
| **A-3** | 🟡 Media ⚠️ *ridimensionato* | Policy password a soli 8 caratteri, senza requisiti di composizione. La metà «leaked password protection» **non è un rilievo**: è una funzione del piano Supabase **Pro** e una scelta di costo già presa e documentata — vedi la correzione qui sotto | `src/lib/validators.js:44` |
| **A-4** | 🔴 Alta | `xlsx@0.18.5`: due CVE (`CVE-2023-30533`, `CVE-2024-22363`) **ancora aperte**, mitigate ma non risolte, con il fix fermo da un mese | `package.json:14`, `src/lib/xlsxWorker.js` |
| **M-1** ✔ | ~~🟡 Media~~ **chiuso il 4 settembre** | 21 `outline: "none"` e **nessuna regola `:focus-visible` globale**: fuori dal modulo Liste il focus da tastiera non ha un indicatore proprio | `src/styles/global.css`, 18 file |
| **M-2** | 🟡 Media | 40 `onMouseEnter` contro 15 `onFocus`: le affordance costruite sull'hover non hanno la controparte da tastiera | `src/components/**` (20 file) |
| **M-3** ✔ | ~~🟡 Media~~ **chiuso il 4 settembre** | Cinque funzioni trigger (`audit_clients_*`, `audit_users_*`, `audit_liste_truncate`) hanno `EXECUTE` a **`PUBLIC`, `anon` e `authenticated`** — le uniche del progetto rimaste così | DB (`proacl`) |
| **M-4** ✔ | ~~🟡 Media~~ **chiuso il 4 settembre** | Le Edge Function restituiscono al client il **messaggio d'errore interno grezzo** (`err.message`, `banErr.message`, `authErr.message`) nel ramo `catch` e su tre 500 | 4 × `supabase/functions/*/index.ts` |
| **M-5** | 🟡 Media | `checkJs` copre `src/lib` + `src/state` (≈40% del codice non-test) e `strict` è `false`: `src/components` e `src/hooks` — 174 file — non sono controllati | `jsconfig.json:47-50` |
| **M-6** | 🟡 Media | La CSP non ha `report-to`/`report-uri`: «0 violazioni CSP» è una misura fatta a mano una volta, non un presidio continuo | `vercel.json:16` |
| **M-7** | 🟡 Media | `user_contacts_select` è `using (true)`: **anche un driver** legge email e telefono di tutto il team, benché il ruolo sia escluso per disegno da ogni altro dato | DB, `supabase/migrations/20260629222802_user_contacts_select_team.sql` |
| **M-8** | 🟡 Media | 344 costanti di stile a nomi meccanici (`boxF125Warning`, `rowCenterBetween4`) + 335 stili inline dinamici, nessun design system, nessun tema scuro | `src/styles/`, 15 × `*Styles.js` |
| **B-1** | 🟢 Bassa | Le quattro policy di `clients` ripetono `users.role = ANY(ARRAY[...])` in linea invece di usare un helper `private.can_clienti()`, contro il principio che il progetto applica ovunque | DB (`pg_policies`) |
| **B-2** | 🟢 Bassa | `useEffect(..., [enabled, delay, ...deps])`: uno spread in un array di dipendenze — React solleva se la lunghezza cambia, e nessun lint può verificarlo | `src/hooks/useDebouncedTableSubscription.js:97` |
| **B-3** ✔ | ~~🟢 Bassa~~ **chiuso il 4 settembre** | `redigiPii()` redige `message` e `stack` ma **non** `url` e `user_agent`, che finiscono grezzi in `error_reports` | `src/lib/errorReporting.js:55-59` |
| **B-4** | 🟢 Bassa | `task_history.actor_id` è una FK senza indice di copertura; sette indici non sono mai stati usati | advisor prod |
| **B-5** | 🟢 Bassa | `delete-account` banna l'utente (irreversibile) e poi ripulisce la PII in `allSettled`: se la pulizia fallisce, l'utente è bloccato fuori e i suoi dati restano | `supabase/functions/delete-account/index.ts` |
| **B-6** ✔ | ~~🟢 Bassa~~ **chiuso il 4 settembre** | `invite-user` non valida il formato dell'email prima di passarla a GoTrue, mentre valida ruolo, capacity e colore | `supabase/functions/invite-user/index.ts` |
| **B-7** | 🟢 Bassa | `docs/` ha 40 handoff + 21 audit: l'indice distingue vigente da storico, ma la ricerca di «qual è la regola oggi» costa | `docs/` |

---

## Action plan — da 8,5 a 10

### A-1 · Un'azione negata ritorna «riuscito» ✔ *chiuso il 4 settembre*

> ✅ Chiuso. La soluzione applicata differisce da quella proposta qui sotto
> su un punto — l'errore non è costruito in linea nell'orchestratore ma vive
> in `lib/esitoScrittura.js`, accanto a `RIFIUTO_RLS` — e il perché sta in
> «Come è stato chiuso (A-1)» in fondo al documento, insieme ai tre test che
> lo tengono chiuso.

**Dove.** `src/hooks/useSyncedDispatch.js:20-24`

```js
const denied = (ADMIN_ONLY_ACTIONS.has(action.type) && !isAdmin(s.team, uid))
  || (spec?.guard ? !spec.guard(s, action, uid) : false);
if (denied) {
  rawDispatch(action);
  return Promise.resolve({ error: null });   // ← qui
}
```

**Perché è grave.** Il reducer, ricevendo l'azione, produce il toast di rifiuto
(`_denied()` in `state/reducer.js:69`) e **non applica la mutazione**. Ma il
valore di ritorno dice successo, e chi lo legge è `useSalvataggio`:

```js
// src/hooks/useSalvataggio.js:39-49
if (esito?.error) { setErrore(...); return esito; }
if (esito?.avviso) { ... }
rif.current.alSuccesso?.();   // ← chiude la modale
```

Il percorso completo, verificato end-to-end su `ClientiView.jsx:195-214` →
`ClienteModal.jsx:51` (`useSalvataggio(onSave, { alSuccesso: onClose })`):

1. un agente disattivato mentre la scheda è aperta (o un driver, o un junior su
   categoria `payment`) compila la scheda cliente e preme **Salva**;
2. il guard nega, il reducer alza il toast «Non hai i permessi…»;
3. `dispatch` ritorna `{ error: null }`, `handleSave` supera `if (res?.error)`;
4. `useSalvataggio` chiama `alSuccesso` → **la modale si chiude, i dati inseriti
   spariscono**, e per di più `RENAME_CLIENT_IN_TASKS` parte su un nome che non
   è mai stato cambiato.

È lo stesso difetto che `M-1` («Compensazione») ha chiuso per il ramo *errore
di scrittura* — «un salvataggio RIFIUTATO dal server produceva "Profilo
aggiornato!" accanto a "Salvataggio fallito"» — mai applicato al ramo
*rifiutato dai permessi*. I quattro test del blocco «difesa in profondità sui
permessi» in `src/test/state/syncedDispatch.test.jsx:98-136` verificano che
**nessuna chiamata parta verso il server**; nessuno verifica cosa venga
restituito. Il comportamento non è deliberato: è non specificato.

**Soluzione.** Un errore tipizzato, così i call site non devono distinguere il
rifiuto dal guasto di rete — per loro sono la stessa cosa: «non è salvato».

```js
// src/hooks/useSyncedDispatch.js
// Il rifiuto di un permesso NON è un successo: chi attende l'esito (ogni form
// che passa da useSalvataggio) usa `error` per decidere se chiudersi. Il
// reducer alza già il toast — quello resta l'unico messaggio che l'utente
// legge — ma il pannello deve restare aperto con i dati dentro, esattamente
// come dopo una scrittura respinta dal server.
const erroreDiPermesso = () => {
  const e = new Error('non hai i permessi per questa azione');
  e.name = 'PermessoNegato';
  return e;
};

if (denied) {
  rawDispatch(action);
  return Promise.resolve({ error: erroreDiPermesso() });
}
```

E in `useSalvataggio`, perché il pannello non mostri **due** messaggi per lo
stesso rifiuto (il toast del reducer e il testo inline):

```js
// src/hooks/useSalvataggio.js — dentro salva(), al posto del ramo esistente
if (esito?.error) {
  // Un rifiuto di permesso ha già il suo toast, alzato dal reducer: qui basta
  // non chiudere. Un guasto di scrittura invece non ce l'ha, e il testo
  // inline è l'unico posto in cui l'utente lo legge.
  if (esito.error?.name !== 'PermessoNegato') {
    const m = rif.current.messaggioErrore;
    setErrore(typeof m === 'function' ? m(esito.error) : m);
  }
  return esito;
}
```

**Test da aggiungere** (`src/test/state/syncedDispatch.test.jsx`):

```js
it("un'azione negata ritorna un errore, non un successo", async () => {
  const { dispatch } = setup({ uid: 'junior1' });
  const esito = await dispatch({ type: 'ADD_TASK', payload: task({ category: 'payment' }) });
  expect(esito.error).toBeTruthy();
  expect(esito.error.name).toBe('PermessoNegato');
});
```

E un caso di contratto in `salvaEChiudi.test.jsx`, che è il file nato per
misurare esattamente questo: «il pannello non si è chiuso E i dati sono ancora
lì», con un utente a cui il guard nega.

---

### A-2 · `registra_audit()` aperta a chiunque sia autenticato ✔ *chiuso il 4 settembre*

> ✅ Chiuso dalla migrazione `20260904143756`. Il «come» — incluse le due
> verifiche fatte **prima** di scrivere la revoca, e la prova su staging e in
> produzione — sta in «Come è stato chiuso (A-2)» in fondo al documento. Il
> rilievo resta scritto qui com'era: serve a spiegare la migrazione, e una
> revoca senza il suo perché è la prima che qualcuno rimangia.

**Dove.** Database di produzione, `pg_proc.proacl`:

```
registra_audit → {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
```

**Corpo attuale** (letto da `pg_get_functiondef`, non dalla migrazione):

```sql
begin
  if v_me is null then raise exception 'Non autenticato.'; end if;
  select name into v_nome from public.users where id = v_me;
  insert into public.audit_log (actor_id, actor_name, action, target_type, target_id, details)
  values (v_me, v_nome, p_action, p_target_type, p_target_id, coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
```

**Perché è grave.** Quattro cose insieme:

1. **Nessun gate oltre «sei autenticato».** Un invitato ancora `pending`, o un
   utente disattivato con la sessione ancora valida, scrive nel registro: la
   RESTRICTIVE `rls_active_only` non lo ferma, perché una `SECURITY DEFINER`
   non attraversa la RLS. È esattamente la categoria di chiamante che
   `adminPredicate.ts` è stato scritto per respingere.
2. **`action`, `target_type`, `target_id` e `details` li sceglie il chiamante.**
   `audit_log` è la fonte di verità su chi ha fatto cosa, letta dagli admin in
   `AuditLogSection`. Chiunque può scriverci voci verosimili (`user.bannato`,
   `user.hard_delete` su un id a scelta) e — soprattutto — **annegare** le voci
   vere sotto migliaia di voci false. `actor_id` resta `auth.uid()`, quindi non
   c'è impersonificazione; c'è però contraffazione e rumore, che su un registro
   di controllo hanno lo stesso effetto pratico.
3. **Nessun tetto e nessun limite di frequenza.** È lo scenario che `C-1` del 2
   settembre ha chiuso su `segnala_errore_client` con tre difese — tetti di
   lunghezza, limite di frequenza, tetto sulle righe — dichiarando esplicitamente
   che «è il tetto sulle RIGHE a rendere calcolabile il caso peggiore». Qui non
   ce n'è nessuna delle tre, su una funzione che accetta un `jsonb` libero.
4. **Nessun percorso dell'app la chiama.** `grep -rn "registra_audit" src/` dà
   una sola occorrenza: `src/test/integration/rls.test.js:243`. Le scritture
   reali su `audit_log` arrivano dai trigger di riga e dalle Edge Function via
   `_shared/audit.ts`, che usa la `service_role` e **inserisce direttamente**,
   con il commento che spiega perché non passi di qui.

Cioè: è superficie d'attacco pura, senza un utente legittimo.

**Soluzione — revocare.** È la stessa mossa di
`20260729190431_revoke_reset_completo_execute_authenticated.sql`, e senza il
motivo che l'aveva fatta rimangiare: lì un admin doveva poter chiamare la RPC
dall'app, qui nessuno la chiama.

```sql
-- supabase/migrations/20260904143756_revoke_registra_audit_authenticated.sql
--
-- `public.registra_audit()` è concessa a `authenticated` dalla 20260826214000 e
-- NON è chiamata da nessun percorso dell'applicazione: l'unica occorrenza in
-- src/ è in test/integration/rls.test.js. Le scritture vere su audit_log
-- arrivano dai trigger di riga e da _shared/audit.ts, che gira con la
-- service_role e inserisce direttamente — per la ragione scritta in cima a
-- quel file (con la service_role `auth.uid()` è null, l'attore va passato).
--
-- Finché il GRANT resta, chiunque abbia una sessione — compreso un invitato
-- `pending` e un utente disattivato, che una SECURITY DEFINER non fa passare
-- dalla RLS — può scrivere nel registro di controllo voci con `action`,
-- `target_*` e `details` a sua scelta, senza tetto e senza limite di
-- frequenza. Non può falsificare `actor_id` (è auth.uid()), ma può
-- contraffare il resto e sommergere le voci vere: su un registro le due cose
-- si equivalgono.
--
-- Non è una restrizione nuova: è la stessa mossa della
-- 20260729190431 su reset_completo, senza la ragione che lì l'aveva fatta
-- rimangiare 24 ore dopo (un admin doveva poterla chiamare dall'app).
revoke execute on function public.registra_audit(text, text, text, jsonb) from authenticated, public;
grant  execute on function public.registra_audit(text, text, text, jsonb) to service_role;

comment on function public.registra_audit(text, text, text, jsonb) is
  'Scrittura sul registro di controllo per i percorsi che hanno una sessione '
  'utente. Riservata a service_role dalla 20260904143756: nessun percorso '
  'client la usa, e il GRANT ad authenticated era una porta di contraffazione '
  'del registro senza un chiamante legittimo. Se un domani servisse dal client, '
  'va riaperta CON il gate (private.is_active_user()), i tetti di lunghezza e '
  'il limite di frequenza di segnala_errore_client (20260903094500) — le tre '
  'difese servono tutte e tre, come C-1 del 2 settembre ha stabilito.';
```

**Se invece la si vuole tenere aperta** (per un uso client futuro), il minimo è
il gate + i tre limiti già scritti per la porta gemella:

```sql
  if not private.is_active_user() then
    raise exception 'Operazione riservata agli utenti attivi.'
      using errcode = 'insufficient_privilege';
  end if;
  if not (select public.rate_limit_incrementa('registra_audit:' || v_me::text, 1, 30)) then
    return null;
  end if;
  -- e i left() su p_action / p_target_type / p_target_id come in segnala_errore_client
```

**Da aggiornare insieme.** `FUNZIONI_SECURITY_DEFINER_VERIFICATE` in
`scripts/verifica-advisor/advisor.js` e la tabella §1 di `docs/SICUREZZA.md` —
è la lezione che `C-1` del 2 settembre ha già pagato una volta.

---

### A-3 · Policy password debole

> ⚠️ **CORREZIONE DEL 4 SETTEMBRE, e va letta prima del rilievo.** Questo
> rilievo nasceva **ad Alta priorità** e teneva insieme due cose che vanno
> separate:
>
> 1. **La leaked password protection (HaveIBeenPwned) spenta.** Non è un
>    rilievo: è una funzione del piano Supabase **Pro**, e il progetto resta
>    sul piano Free per scelta. Soprattutto, **era già una decisione presa e
>    scritta**: `auth_leaked_password_protection` è in `AVVISI_ACCETTATI` di
>    `scripts/verifica-advisor/advisor.js` da ST-14, con accanto il ragionamento
>    per esteso — «non è "da attivare quando qualcuno se ne ricorda": è un costo
>    ricorrente non approvato, non un interruttore dimenticato». L'audit ha
>    letto l'advisor di produzione e non quell'elenco, e ha riportato come
>    lacuna una scelta già motivata. È lo stesso errore di metodo, al contrario,
>    che il resto del documento evita: interrogare un livello solo.
>    ⛔ **Il presidio che il rilievo proponeva — «far fallire `verifica:advisor`
>    su questo lint» — sarebbe stato un peggioramento**: renderebbe rosso a ogni
>    esecuzione un allarme su una decisione già presa, cioè esattamente il
>    rumore che quell'elenco esiste per evitare.
> 2. **La policy password: 8 caratteri, nessun requisito di composizione.**
>    Questa resta, ed è la parte azionabile — «Minimum password length» e
>    «Password requirements» **sono disponibili sul piano Free**, a differenza
>    del punto 1. Il rilievo prosegue qui sotto con questo solo perimetro,
>    a **media** priorità.


**Dove.** `src/lib/validators.js:44`:

```js
export const PASSWORD_MIN = 8;
export const passwordValida = (messaggio = `…almeno ${PASSWORD_MIN} caratteri.`) =>
  (v) => (typeof v === 'string' && v.length >= PASSWORD_MIN ? null : messaggio);
```

**Perché conta.** Otto caratteri senza nessun requisito di composizione
significa che `password` e `12345678` passano. È l'unico fattore di
autenticazione dell'app — non c'è MFA — e protegge la PII di persone esterne al
team (`clients`) e il registro contabile dei buoni viaggio. Tutto il lavoro
fatto su RLS, gate admin e allow-list di origini presuppone che la sessione
appartenga a chi dice di essere.

**Perché media e non alta.** Senza il controllo contro le password già trapelate
— che il piano Free non offre — un tetto di lunghezza e qualche requisito di
composizione alzano il costo di un attacco a forza bruta ma non fermano il
riuso di una credenziale già compromessa altrove, che è lo scenario più
probabile. È un miglioramento reale e parziale, non la chiusura di un buco.

**Soluzione, in tre passi.**

1. **Piattaforma** — Supabase → Authentication → Policies:
   * *Leaked password protection* → **on**;
   * *Minimum password length* → **12** (allineare `PASSWORD_MIN`);
   * *Password requirements* → almeno `lower + upper + digits`.

2. **Client** — allineare il validatore, così l'utente legge il requisito prima
   di inviare invece di riceverlo come errore da GoTrue:

```js
// src/lib/validators.js
// I requisiti rispecchiano quelli configurati in Supabase → Auth → Policies.
// Sono DUE, e il secondo non è di troppo: quello della piattaforma è l'unico
// che valga anche per chi chiama /auth/v1 senza passare da qui; questo evita
// di far scoprire il requisito all'utente sotto forma di errore del server —
// la stessa asimmetria dei tetti di errorReporting (C-1 del 2 settembre).
export const PASSWORD_MIN = 12;

const REQUISITI = [
  [/.{12,}/,  'almeno 12 caratteri'],
  [/[a-z]/,   'una lettera minuscola'],
  [/[A-Z]/,   'una lettera maiuscola'],
  [/\d/,      'una cifra'],
];

export const passwordValida = () => (v) => {
  if (typeof v !== 'string') return 'La password deve avere ' + REQUISITI.map(r => r[1]).join(', ') + '.';
  const mancanti = REQUISITI.filter(([rx]) => !rx.test(v)).map(([, testo]) => testo);
  return mancanti.length ? `La password deve avere ${mancanti.join(', ')}.` : null;
};
```

I due call site (`auth/UpdatePasswordScreen.jsx:30`,
`components/shell/AccountSicurezza.jsx:49`) non cambiano: chiamano già
`passwordValida()`.

3. **Nessun presidio nuovo** — vedi la correzione in testa al rilievo: il
   lint `auth_leaked_password_protection` è già in `AVVISI_ACCETTATI` con la
   sua motivazione, e farlo fallire sarebbe un allarme permanente su una scelta
   già presa. Se un domani il progetto passasse al piano Pro, il passo è
   toglierlo da lì e riattivare la protezione dalla dashboard — ed è già
   scritto nel commento accanto alla voce.

---

### A-4 · `xlsx@0.18.5`: due CVE ancora aperte

**Dove.** `package.json:14` → `"xlsx": "^0.18.5"`, risolta a `0.18.5` in
`package-lock.json:6683`.

* `GHSA-4r6h-8v6p-xvw6` (CVE-2023-30533) Prototype Pollution — fix in 0.19.3+
* `GHSA-5pgg-2g8v-p4x9` (CVE-2024-22363) ReDoS — fix in 0.20.2+

**Stato reale.** La mitigazione in piedi è ottima e va detto: il parse gira in
un worker **usa-e-getta** (`src/lib/xlsxWorker.js`), terminato dopo ogni file,
con timeout a 30 s, tetto a 15 MB, opzioni di lettura fisse (`cellHTML: false`,
`cellFormula: false`), sanificazione delle chiavi al confine e
`withPrototypePollutionGuard` sul passaggio nel realm principale. Il
ragionamento — «cambiare la categoria della difesa da rilevare a contenere» — è
corretto e raro.

**Ma resta una mitigazione, non un fix**, e il commento in cima al worker lo
dichiara. Ho riverificato oggi: `https://cdn.sheetjs.com` risponde ancora 403
**da questo ambiente**. Il che è il punto: la ragione per cui il rilievo è
fermo da un mese non è tecnica, è di rete, e va rimossa in un ambiente diverso
da quello in cui è stata constatata.

**Soluzione, in ordine di preferenza.**

1. **Fix definitivo** — dalla propria macchina di sviluppo o da un runner GitHub
   Actions (dove l'egress non è filtrato):

```bash
npm install --save https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz
npm test && npm run build && npm run verifica:bundle
```

`package-lock.json` registra la URL del tarball: da lì `npm ci` funziona anche
in CI senza toccare `cdn.sheetjs.com` di nuovo, perché la risorsa è pinnata per
integrità. **Il worker non va rimosso**: resta la difesa in profondità, e il
suo commento va aggiornato da «fix da fare» a «fix fatto, il worker resta
perché il contenimento vale comunque».

2. **Se il CDN resta irraggiungibile ovunque** — sostituire la libreria per i
   due usi reali del progetto:
   * lettura CSV → un parser dedicato (`papaparse`, manutenuto, ~7 kB gzip);
   * scrittura `.xlsx` → `exceljs` o `write-excel-file`.

   Solo la lettura `.xls`/`.xlsx` legacy resterebbe scoperta, ed è la metà
   dell'import anagrafica: va misurato quanti file reali la usano prima di
   decidere.

3. **Nel frattempo**, un presidio che il repository non ha: il worker è
   costruito con `new Worker(new URL("./xlsxWorker.js", import.meta.url))`, cioè
   nello stesso origin. Aggiungere `sandbox` non è possibile per un worker, ma
   `MAX_IMPORT_BYTES` può scendere da 15 MB a 5 (nessun export anagrafica
   realistico lo supera) e `TIMEOUT_MS` da 30 s a 15: entrambi riducono la
   finestra della ReDoS senza costare nulla.

---

### M-1 e M-2 · Focus da tastiera e affordance solo-hover

> ⚠️ **CORREZIONE DEL 4 SETTEMBRE, alla chiusura di M-1 — va letta prima
> della soluzione qui sotto.** Il CSS proposto in questo rilievo aveva due
> errori verificati con Chromium via Playwright, non solo ipotizzati:
> 1. **`:focus-visible` senza `!important` non fa nulla sui 21 punti che
>    hanno motivato il rilievo.** Un inline `style={{outline:"none"}}` vince
>    SEMPRE sulla cascata per la stessa proprietà, qualunque sia la
>    specificità della regola esterna — non è, come scritto qui sotto, una
>    questione di *quando* la regola si applica.
> 2. **Il colore era invertito.** `var(--gold)` è stato scelto pensando a un
>    problema di contrasto sui fondi scuri; misurato (WCAG, sRGB), l'oro ha
>    7,24:1 su `--navy` (ottimo) ma 2,12–2,21:1 su `--surface`/`--card`
>    (sotto il minimo 3:1) — cioè il problema era sui fondi CHIARI, che sono
>    lo sfondo di default dell'app, non su quelli scuri.
>
> La soluzione effettivamente applicata — `outline` navy + `box-shadow`
> bianco, con `!important` su entrambi — è in «Come è stato chiuso (M-1)» in
> fondo al documento. Il testo originale resta qui sotto perché è quello che
> ha posto la domanda giusta (serve un indicatore ovunque); solo la risposta
> tecnica era da correggere.

**Dove.** 21 `outline: "none"` in 18 file; una sola regola `:focus-visible` in
tutto il progetto, e sta in `src/components/liste/liste.css:54`, scoped a
`.lv-root`. Fuori dal modulo Liste, il focus è segnalato — quando lo è — da un
handler:

```jsx
// src/components/shell/ProfileEditor.jsx:280 e altri 14 punti
onFocus={e => e.target.style.borderColor = "var(--gold)"}
```

Quindici `onFocus` contro **quaranta** `onMouseEnter`: venticinque elementi
cambiano aspetto col mouse e non con la tastiera.

**Perché conta.** WCAG 2.4.7 (*Focus Visible*, AA) e 2.4.11 (*Focus Not
Obscured*, AA in WCAG 2.2). Un gestionale si usa a tastiera — è il pattern
d'uso, non un caso limite — e il progetto ha già investito su questo asse
(`attivaConTastiera`, `cellaAzionabile`, `useTrappolaFocus`, `jsx-a11y` in CI,
la regola `no-restricted-syntax` su `<tr>`/`<td>`). Il pezzo mancante è quello
che nessuna delle due regole di lint può vedere, perché non è una prop mancante
ma un `outline` tolto.

**Soluzione.** Una regola globale, che costa quattro righe e vale ovunque —
compresi i 21 punti che hanno tolto l'outline, perché `:focus-visible` viene
dopo nella cascata:

```css
/* src/styles/global.css — dopo il blocco UTILITY
   ─── FOCUS DA TASTIERA (M-1) ───
   Ventuno `outline: "none"` sparsi negli stili inline hanno tolto l'anello di
   focus del browser, e quindici `onFocus` che cambiano borderColor l'hanno
   rimpiazzato solo su altrettanti input: venticinque elementi interattivi
   cambiano aspetto col mouse (`onMouseEnter`) e non con la tastiera.
   `:focus-visible` è la pseudo-classe giusta e non `:focus`: il browser la
   applica quando l'elemento ha ricevuto il focus in un modo per cui un
   indicatore è UTILE (Tab, frecce, tastiera virtuale), non dopo un click —
   che è il motivo per cui gli `outline: none` erano stati scritti.
   Vale anche sui punti che l'outline se lo tolgono in linea: uno stile inline
   vince sulla cascata per la stessa proprietà, ma `:focus-visible` la
   ridichiara solo mentre il focus c'è, ed è quello il momento che conta. */
:where(a, button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--gold);
  outline-offset: 2px;
  border-radius: 4px;
}
/* Sui fondi scuri (testate navy, toast, ErrorBoundary) l'oro non stacca:
   il bianco sì, e il contrasto resta sopra 3:1 in entrambi i versi. */
.vd-su-scuro :focus-visible { outline-color: #fff; }
```

Poi, per **M-2**, la regola meccanica: dove c'è `onMouseEnter` per un effetto
visivo, serve `onFocus` con lo stesso effetto (e `onBlur` con `onMouseLeave`).
Il modo di non doverselo ricordare è una utility, sulla falsariga di
`attivaConTastiera`:

```js
// src/lib/a11y.js
/**
 * Le quattro prop che fanno reagire un elemento al mouse E alla tastiera con
 * lo stesso effetto. Nasce dal rilievo M-2 del 4 settembre: quaranta
 * `onMouseEnter` contro quindici `onFocus`, cioè venticinque affordance che
 * esistono solo per chi usa il mouse.
 *
 * Si spreada sulle props, come `attivaConTastiera`:
 *   <div {...evidenziaConTastiera(attivo => setHover(attivo))}>
 */
export const evidenziaConTastiera = (imposta) => ({
  onMouseEnter: () => imposta(true),
  onMouseLeave: () => imposta(false),
  onFocus:      () => imposta(true),
  onBlur:       () => imposta(false),
});
```

E la regola che impedisce al numero di risalire, nella forma già usata per
`CELLA_TABELLA_CLICCABILE_SENZA_TASTIERA` in `eslint.config.js`:

```js
const HOVER_SENZA_TASTIERA = {
  selector: 'JSXOpeningElement'
    + ':has(JSXAttribute[name.name="onMouseEnter"])'
    + ':not(:has(JSXAttribute[name.name="onFocus"]))',
  message:
    'Effetto visivo legato al solo hover: chi naviga da tastiera non lo vede. '
    + 'Usa evidenziaConTastiera() da lib/a11y.js (spread sulle props). Se '
    + "l'effetto è puramente decorativo, disattiva la regola con il perché "
    + 'accanto.',
};
```

⚠️ Questa regola parte **con violazioni**, a differenza delle altre di questo
file: va introdotta come `warn`, portata a zero, e solo allora promossa a
`error` — la stessa disciplina del ratchet di `jsconfig.json`.

---

### M-3 · Cinque funzioni trigger eseguibili da `anon`

**Dove.** `pg_proc.proacl` in produzione:

```
audit_clients_delete   → {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
audit_clients_insert   → idem
audit_liste_truncate   → idem
audit_users_delete     → idem
audit_users_privilegi  → idem
```

`=X/postgres` è il GRANT a **PUBLIC**. Sono le uniche funzioni del progetto
rimaste così: ogni altra ha una `revoke ... from public` esplicita.

**Sfruttabilità: bassa.** Tutte e cinque hanno `RETURNS trigger`, e PostgREST
non espone le funzioni che ritornano `trigger`; Postgres stesso rifiuta di
chiamarle fuori da un contesto di trigger. L'advisor le segnala perché guarda i
privilegi, non la chiamabilità. **Ma va sistemato lo stesso**, per due ragioni
che non dipendono dallo sfruttamento:

* è l'unico punto in cui la disciplina «revoca esplicita su ogni definer» ha una
  falla, e una falla senza motivo è quella che il prossimo `create function`
  copia dal vicino — lo stesso argomento con cui `VIETATO_APPGLOBALS` esiste;
* tiene acceso un WARN nell'advisor. Cinque WARN permanenti su una dashboard
  sono il modo in cui il sesto, vero, passa inosservato — è l'argomento di
  `verifica:audit` sul rumore.

**Soluzione.**

```sql
-- supabase/migrations/20260905090100_revoke_trigger_functions_public.sql
--
-- Le cinque funzioni di audit sono TRIGGER function: `RETURNS trigger`, quindi
-- PostgREST non le espone su /rest/v1/rpc e Postgres rifiuta di chiamarle fuori
-- da un trigger. L'advisor le segnala guardando i privilegi, non la
-- chiamabilità, ed è il verso giusto in cui sbagliare per un advisor.
--
-- Si revoca comunque, per due ragioni che non dipendono dallo sfruttamento:
-- sono le uniche definer del progetto senza revoca esplicita — cioè la forma
-- che il prossimo `create function` copia dal vicino — e cinque WARN
-- permanenti sono il modo in cui il sesto passa inosservato (lo stesso
-- argomento di verifica:audit sul rumore).
--
-- Il trigger continua a funzionare: l'esecutore di una trigger function è il
-- proprietario della tabella, non il ruolo che ha fatto la INSERT.
do $$
declare f text;
begin
  foreach f in array array[
    'audit_clients_delete()', 'audit_clients_insert()', 'audit_liste_truncate()',
    'audit_users_delete()',   'audit_users_privilegi()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
end $$;
```

**Verifica dopo l'applicazione** — che i trigger scrivano ancora: una INSERT su
`clients` da un client autenticato deve continuare a produrre la riga in
`audit_log`. Il caso sta già in `src/test/integration/rls.test.js`.

---

### M-4 · Le Edge Function restituiscono l'errore interno grezzo

**Dove.** Tutte e quattro le funzioni con CORS, nel `catch` finale:

```ts
} catch (err: unknown) {
  const msg = err instanceof Error ? err.message : "Errore interno";
  console.error("[delete-user]", msg);
  return json({ error: msg }, 500);   // ← il messaggio interno va al client
}
```

più tre 500 espliciti che concatenano il messaggio di GoTrue o di PostgREST:

* `delete-account/index.ts` → `"Impossibile completare l'eliminazione: " + banErr.message`
* `set-user-active/index.ts` → `"Impossibile aggiornare l'accesso: " + authErr.message` e `"…il profilo non si è salvato: " + dbErr.message`

**Perché conta.** `delete-user` ha già fatto la scelta giusta sul ramo che
conta di più — «L'errore è stato registrato: riprova, e se persiste contatta
chi amministra il progetto» — con l'errore vero solo a log. Gli altri percorsi
non l'hanno seguita, e restituiscono a un chiamante (che è admin, ma è pur
sempre l'esterno) nomi di colonna, vincoli violati e messaggi interni di GoTrue.
È la stessa asimmetria che `MSG_NON_AUTORIZZATO` chiude sul rifiuto di
autorizzazione — un messaggio solo per tre casi diversi, perché distinguerli
dice quanto manca ad arrivarci — non applicata ai guasti.

**Soluzione.** Un helper condiviso, accanto agli altri di `_shared/`:

```ts
// supabase/functions/_shared/erroreInterno.ts
//
// La risposta a un guasto: dettagliata a log, opaca al chiamante.
//
// `delete-user` aveva già la forma giusta per la deleteUser fallita («L'errore
// è stato registrato: riprova, e se persiste contatta chi amministra il
// progetto»), e le altre tre funzioni non l'avevano seguita: restituivano
// `err.message` di GoTrue o di PostgREST, cioè nomi di colonna, vincoli
// violati e messaggi interni. È la stessa scelta di MSG_NON_AUTORIZZATO in
// adminPredicate.ts — un messaggio solo, perché distinguerli dice a chi
// riceve la risposta più di quanto gli serva — applicata ai guasti invece che
// ai rifiuti.
//
// Il `codice` è ciò che tiene insieme i due lati: chi riceve l'errore lo legge
// a schermo, chi guarda i log lo ritrova accanto al messaggio vero. Stessa
// forma di `codiceSegnalazione()` in src/lib/errorReporting.js.
export function erroreInterno(tag: string, err: unknown): { error: string; codice: string } {
  const codice = `VD-${Date.now().toString(36).toUpperCase()}`;
  const dettaglio = err instanceof Error ? err.message : String(err);
  console.error(`[${tag}] (${codice})`, dettaglio);
  return {
    codice,
    error:
      "Operazione non riuscita. L'errore è stato registrato: riprova, e se " +
      `persiste segnala il codice ${codice} a chi amministra il progetto.`,
  };
}
```

Uso, identico nelle quattro funzioni:

```ts
} catch (err: unknown) {
  return json(erroreInterno("delete-user", err), 500);
}
```

e sui tre 500 espliciti:

```ts
if (banErr) return json(erroreInterno("delete-account/ban", banErr), 500);
```

⚠️ **Non toccare i 4xx**: `409` su email già registrata e `502` sul servizio
email non configurato sono messaggi *azionabili*, scritti apposta per dire a
chi amministra cosa fare. Sono la ragione per cui questo non è un `catch` unico
per tutto.

---

### M-5 · `checkJs` copre meno della metà del codice

**Dove.** `jsconfig.json:47-50`:

```json
"include": ["src/lib/**/*.js", "src/state/**/*.js"]
```

`src/components` (140 `.jsx`) e `src/hooks` (19 `.js`) restano fuori: 174 file
su 286 non-test, cioè la maggioranza del codice e **tutta** la superficie in cui
i tipi del dominio (ruoli, categorie, priorità, stati) vengono consumati. Anche
`strict` è `false`, quindi `null`/`undefined` non sono distinti nemmeno dove
il controllo gira.

Il file lo dichiara già («lo scope è un ratchet… `src/components/` e
`src/hooks/` sono il prossimo passo»), e la regola d'ingaggio è scritta: si
allarga quando la cartella nuova è a zero.

**Soluzione, nell'ordine.**

1. `src/hooks` — 19 file, quasi tutti già con JSDoc:

```json
"include": ["src/lib/**/*.js", "src/state/**/*.js", "src/hooks/**/*.js"]
```

2. Poi `src/components/ui` (primitive, poche prop), poi le viste.

3. Infine `"strict": true`, che è il passo che dà di più e va fatto per
   ultimo — su un progetto senza `any` sparsi vale quasi solo per
   `strictNullChecks`, cioè per la classe di difetto che questo dominio
   produce davvero (un `task.client` assente, un `member` non trovato).

Il criterio da non rilassare: si allarga **quando la cartella nuova è a zero**,
e nello stesso commit. Diciassette errori chiusi all'attivazione, non
silenziati, è il precedente da tenere.

---

### M-6 · La CSP non riporta le violazioni

**Dove.** `vercel.json:16`. La policy è eccellente e non ha direttive
permissive, ma non ha nemmeno un endpoint di raccolta: `docs/SICUREZZA.md:713`
dichiara «Violazioni CSP: **0**», ed è una misura fatta a mano, in Chromium,
una volta. Una regressione — un `<style>` reintrodotto, una CDN aggiunta, un
`worker-src` che smette di bastare — è **silenziosa per l'utente** (l'elemento
semplicemente non si carica) e invisibile a chi mantiene.

**Soluzione.** L'endpoint esiste già: `error_reports` con la sua RPC concessa ad
`anon`, che è esattamente il canale giusto — una violazione CSP può avvenire
prima del login.

```jsonc
// vercel.json — aggiungere in coda al valore della CSP
"…; object-src 'none'; report-uri /csp-report; report-to csp"
```

e, dato che `report-uri` vuole un endpoint che accetti POST mentre il progetto
è statico, la via più corta è raccogliere lato client — l'evento `securitypolicyviolation`
è già disponibile e non richiede infrastruttura:

```js
// src/lib/errorReporting.js — dentro installaHandlerGlobali()
// Una violazione CSP non produce un errore JS: l'elemento semplicemente non si
// carica, e per l'utente è una schermata che manca un pezzo. Questo handler la
// fa arrivare dove arrivano gli altri errori, con lo stesso codice VD-… che
// l'utente può dettare. È il presidio che mancava a «Violazioni CSP: 0» di
// SICUREZZA.md §8, che finora era una misura fatta a mano una volta sola.
const onCsp = (ev) => {
  const codice = codiceSegnalazione();
  registraSegnalazione(codice, 'csp',
    new Error(`${ev.violatedDirective}: ${ev.blockedURI || '(inline)'}`),
    `${ev.sourceFile ?? ''}:${ev.lineNumber ?? ''}`);
};
document.addEventListener('securitypolicyviolation', onCsp);
```

(da deregistrare nel cleanup insieme agli altri due, e da coprire con un caso
in `src/test/lib/errorReporting.test.js`).

---

### M-7 · Un driver legge email e telefono di tutto il team

**Dove.** `pg_policies`: `user_contacts_select` è `using (true)` — introdotta
dalla `20260629222802_user_contacts_select_team.sql`, che è **esplicita e
deliberata**: «Su richiesta del prodotto i contatti diventano una rubrica
interna».

**Perché lo segnalo comunque.** La decisione è del 29 giugno. Il ruolo `driver`
è stato ristretto dopo: è fuori da tutte e quattro le policy di `clients` «per
disegno: non ha accesso ai dati commerciali» (`src/lib/permissions.js`), fuori
da `can_liste()`, e in `canViewTask` vede solo i propri task. Un driver è
tipicamente un collaboratore esterno o occasionale. La rubrica gli dà email e
telefono di tutto il personale interno — l'unico dato del sistema per cui il
suo ruolo non ha una restrizione, e non perché qualcuno l'abbia deciso, ma
perché la policy è più vecchia della restrizione.

Non è un difetto: è uno **scope che non corrisponde più al modello dei ruoli**.
La domanda da porre al prodotto è una sola: *un driver deve poter vedere la
rubrica?*

**Soluzione, se la risposta è no.** La forma rispecchia `can_liste()`:

```sql
-- supabase/migrations/20260905090200_user_contacts_rubrica_esclude_driver.sql
--
-- La 20260629222802 ha aperto la lettura di user_contacts a ogni utente
-- autenticato («rubrica interna», su richiesta del prodotto). È del 29 giugno:
-- il ruolo `driver` è stato ristretto DOPO — fuori da tutte e quattro le policy
-- di clients, fuori da can_liste(), e in canViewTask limitato ai propri task.
-- La rubrica è rimasta l'unico dato del sistema su cui il driver non ha una
-- restrizione, non per una decisione ma perché la policy è più vecchia della
-- restrizione.
--
-- Si mantiene la rubrica per i ruoli interni e la si chiude al driver, che
-- continua a leggere il PROPRIO contatto (ne ha bisogno: ProfileEditor).
drop policy if exists user_contacts_select on public.user_contacts;

create policy user_contacts_select on public.user_contacts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_liste())   -- admin, manager, agent: attivi e approvati
  );
```

e il verdetto corrispondente lato client, accanto agli altri di
`src/lib/permissions.js`:

```js
// ─── RUBRICA INTERNA ─────────────────────────────────────────────────────────
// Rispecchia user_contacts_select (20260905090200). Il driver vede solo il
// proprio contatto: è l'unico dato su cui il suo ruolo non aveva una
// restrizione, e non per scelta — vedi M-7 dell'audit del 4 settembre.
export const canViewContacts = (team, userId, targetId) =>
  targetId === userId || canAccessListe(team, userId);
```

**Da aggiornare insieme.** `ContactMenuItem.jsx` / `ContactActions.jsx`, che
oggi mostrano i pulsanti a chiunque, e un caso in
`src/test/integration/rls.test.js`.

---

### M-8 · Il sistema di stili

**Dove.** 344 costanti esportate fra `src/styles/common.js` e quindici file
`*Styles.js`, più 335 `style={{…}}` dinamici rimasti nei componenti. I nomi
sono meccanici per convenzione dichiarata: `boxF125Warning`,
`rowCenterBetween4`, `txtF10Bold2`, `mt2`.

**Va detto cosa questo NON è.** Non è disordine: è il risultato di M-1
dell'audit del 12 agosto, che ha sollevato 1.153 oggetti letterali a costanti di
modulo per rendere stabile la prop e permettere a `memo` di saltare il lavoro —
e che è ciò che ha permesso di togliere `'unsafe-inline'` da `style-src`. Il
commento in cima a `common.js` è chiaro sul fatto che sia «un registro delle
forme GIÀ IN USO, non un design system», e che il nome meccanico sia un
segnale: «dice che quella forma non ha ancora un significato nell'app».

**Il costo, oggi.** In `clientImportModalStyles.js` convivono
`rowCenterBetween`, `rowCenterBetween2`, `rowCenterBetween3`,
`rowCenterBetween4` e `rowCenterBetween5`: cinque varianti di «riga, centrata,
spaziata» che differiscono per un `flexWrap` e un `gap`. Nessuna è
riutilizzabile fuori dal file, nessun cambio di tema le tocca tutte, e — la
conseguenza visibile — **non c'è un tema scuro**: `global.css` dichiara
`color-scheme: light` e i colori vivono in 344 oggetti JS che nessuna media
query raggiunge. Per un gestionale usato tutto il giorno è una richiesta che
arriva, e oggi costerebbe un passaggio su tutti e 344.

**Soluzione, incrementale e senza big-bang.**

1. **Promuovere, non riscrivere.** `src/styles/tokens.js` esiste già ed è il
   posto dichiarato («ci si arriva promuovendo di qui, non scrivendo qui una
   forma nuova»). Il criterio operativo che manca: *una forma usata in ≥3 file
   sale in `tokens.js` con un nome semantico*. Le cinque `rowCenterBetween*`
   diventano una `rigaTestata({ wrap, gap })`.

2. **Portare i colori nelle variabili CSS**, che è il passo che sblocca il tema
   scuro. Sono già quasi tutti lì (`var(--navy)`, `var(--gold)`); i residui sono
   i letterali `#FEE2E2`, `#FEF3C7`, `rgba(255,255,255,0.1)` sparsi negli
   `*Styles.js`. Una volta che sono token, il tema scuro è un blocco solo:

```css
/* src/styles/global.css */
@media (prefers-color-scheme: dark) {
  :root:not([data-tema="chiaro"]) {
    --surface: #12141a;  --surface2: #1a1d26;  --card: #1f2430;
    --text: #e8e6e0;     --text-muted: #9a9aa8;  --border: #2c303c;
    color-scheme: dark;
  }
}
```

3. **Un test di non-regressione sul numero**, nella forma già usata da
   `verifica:convenzioni` per gli stili inline dinamici: il conteggio delle
   costanti non deve salire senza che qualcuna scenda in `tokens.js`. È il
   ratchet che impedisce al registro di crescere per inerzia.

⚠️ Questo è il rilievo con il rapporto valore/rischio peggiore dei diciannove:
tocca ogni schermata e non chiude nessun difetto funzionale. Va fatto **dopo**
gli altri, una cartella alla volta, e solo se il tema scuro o un restyle lo
rendono necessario. Lo segnalo perché è il debito che cresce da solo, non
perché vada aggredito adesso.

---

### Rilievi di bassa priorità

**B-1 · `clients` ripete la logica di ruolo in linea.** Le quattro policy
scrivono `EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role
= ANY(ARRAY['admin','manager','agent']))` invece di chiamare un helper, mentre
ogni altra tabella usa `private.is_admin()` / `is_active_user()` /
`can_liste()`. Funzionalmente sono equivalenti (la RESTRICTIVE `rls_active_only`
aggiunge attivo+approvato), ma è la stessa domanda scritta in cinque posti —
esattamente ciò che il preambolo di `canAccessListe` in `permissions.js` esiste
per evitare. Rimedio: `private.can_clienti_scrittura()` e
`private.can_clienti_eliminazione()`, che rispecchino le due funzioni già in
`permissions.js`, e riscrivere le policy come `using ((select private.can_clienti_scrittura()))`.

**B-2 · Spread in un array di dipendenze.**
`src/hooks/useDebouncedTableSubscription.js:97`:
`}, [enabled, delay, ...deps]);` — React solleva se la lunghezza cambia fra due
render, e `react-hooks/exhaustive-deps` non può verificare un array a lunghezza
variabile. Oggi tutti i chiamanti passano `deps` a lunghezza costante. Rimedio:
serializzare (`[enabled, delay, JSON.stringify(deps)]`) o documentare
l'invariante con un `if (import.meta.env.DEV)` che confronti la lunghezza con
quella del render precedente e sollevi con un messaggio chiaro.

**B-3 · `redigiPii` non copre `url` e `user_agent`.**
`src/lib/errorReporting.js:55-59` redige email e telefoni da `message` e
`stack`, ma `url` (`window.location.href`) e `userAgent` passano grezzi. Con
`rewrites` a `/` l'URL non porta oggi PII, ma è un'assunzione sul routing che
non è scritta da nessuna parte, e il commento sulla tabella dice «non deve
contenere PII oltre a quella già presente in users». Rimedio: passare anche
`url` da `redigiPii`, e troncare `userAgent` alla sola famiglia di browser.

**B-4 · Indici.** `task_history.actor_id` è una FK senza indice di copertura:
ogni `DELETE` su `users` fa una scansione. Sette indici non sono mai stati usati
(`idx_users_active`, `idx_tasks_assignees`, `idx_lista_history_actor_id`,
`rate_limit_finestra`, `audit_log_at_desc`, `audit_log_actor_at`,
`idx_users_invited_by`, `idx_lista_beneficiari_created_by`). ⚠️ «Mai usato» su
`audit_log` e `rate_limit` significa «tabella ancora giovane», non «indice
inutile»: da rivalutare fra qualche mese, non da rimuovere ora.

**B-5 · `delete-account`: ban prima, pulizia poi.** Il ban di dieci anni è
applicato e verificato; la pulizia della PII (`users`, `user_contacts`,
`push_subscriptions`, avatar) è in `Promise.allSettled` e i fallimenti finiscono
solo in `console.error`. L'utente resta bloccato fuori con i propri dati dentro,
e nessuno lo sa. Rimedio: restituire un `warning` nella risposta quando almeno
una pulizia fallisce — come già fa `invite-user` per l'upsert del profilo — e
scrivere una voce `user.autoeliminato` con l'elenco dei residui via
`registraAudit`, così chi amministra ha dove guardare.

**B-6 · `invite-user` non valida il formato dell'email.** Valida ruolo (contro
un `Set`), capacity (1–100), colore (regex esadecimale) e poi passa `email` a
GoTrue senza controllarla. GoTrue la respinge, quindi non è un buco: è
un'asimmetria che costa un giro di rete e restituisce un messaggio di GoTrue al
posto di uno del progetto. Rimedio: la stessa `EMAIL_RX` di
`src/lib/validators.js`, copiata (le Edge Function non importano da `src/`) con
il commento che dice da dove viene.

**B-7 · Navigabilità di `docs/`.** 40 handoff + 21 audit. `INDEX.md` distingue
già vigente da storico, ed è più di quanto facciano quasi tutti i progetti. Il
costo residuo è trovare *la regola di oggi* su un argomento: la risposta è
sparsa fra `CLAUDE.md`, l'audit che l'ha introdotta e quello che l'ha corretta.
Rimedio a costo basso: spostare gli handoff anteriori a settembre in
`docs/handoff/archivio/` e aggiungere in `INDEX.md` una tabella
«argomento → documento vigente» per i dieci temi ricorrenti (permessi, RLS,
realtime, bundle, stili, errori, push, liste, import, CI).

---

## Ordine di esecuzione consigliato

| # | Rilievo | Costo | Effetto |
|---|---|---|---|
| ~~1~~ | **A-3** (password) | — | ⚠️ **Saltato per decisione del 4 settembre**: la metà che contava (HaveIBeenPwned) richiede il piano Pro. Resta la metà gratuita — lunghezza minima e requisiti di composizione — ridimensionata a media |
| ~~2~~ | **A-2** (`registra_audit`) ✔ | — | **Fatto il 4 settembre**: migrazione `20260904143756`, applicata su staging e in produzione |
| ~~3~~ | **A-1** (`{error:null}`) ✔ | — | **Fatto il 4 settembre**: due hook, un contratto nuovo in `lib/esitoScrittura.js`, tre gruppi di test (38 casi) |
| ~~4~~ | **M-3**, **M-4**, **B-3**, **B-6** ✔ | — | **Fatto il 4 settembre**: migrazione `20260904160804` (M-3), `_shared/erroreInterno.ts` deployato su staging e produzione (M-4), `redigiPii`+`famigliaBrowser` (B-3), `EMAIL_RX` in `invite-user` (B-6) |
| ~~5~~ | **M-1** (`:focus-visible`) ✔ | — | **Fatto il 4 settembre**: la regola proposta non bastava da sola — vedi «Come è stato chiuso (M-1)» in fondo al documento |
| 6 | **A-4** (xlsx) | 1 h | Da fare **fuori** da un ambiente con egress filtrato |
| 7 | **M-2** (hover/focus) | 4 h | 25 punti + la regola di lint come `warn` |
| 8 | **M-5**, **M-6**, **M-7**, **B-1**, **B-2**, **B-4**, **B-5**, **B-7** | — | Un rilievo per sessione, nell'ordine che conviene |
| 9 | **M-8** (stili) | — | Solo se arriva il tema scuro o un restyle |

Chiusi 1–6 la valutazione è **9,5**. Con `A-1`, `A-2`, il punto 4 (`M-3`/`M-4`/`B-3`/`B-6`) e il punto 5 (`M-1`) fatti e `A-3` ridotto alla sua metà gratuita, resta il punto 6 (`A-4`). Il mezzo punto restante è `M-8`, ed è il
solo rilievo che chiederei di **non** affrontare finché non c'è una ragione di
prodotto: il sistema di stili attuale è brutto da leggere e corretto da
eseguire, e riscriverlo senza una richiesta è il tipo di lavoro che introduce
regressioni per guadagnare eleganza.


---

## Come è stato chiuso (A-1)

**4 settembre 2026.** Due hook, un contratto nuovo, tre gruppi di test.

### Dove è finito l'errore, e perché non in linea

Il rilievo proponeva di costruire l'errore dentro `useSyncedDispatch`. È finito
invece in **`lib/esitoScrittura.js`**, e la ragione è che lì c'era già il suo
gemello:

```js
export const RIFIUTO_RLS = { message: "operazione non consentita dal database…" };
```

`RIFIUTO_RLS` è «il database ha detto di no» — il rifiuto silenzioso della RLS,
che risponde 2xx e tocca zero righe. `erroreDiPermesso()` è «il client ha detto
di no, senza nemmeno chiedere». Sono la stessa domanda a due distanze, e
tenerle nello stesso file è ciò che rende difficile chiudere una e dimenticare
l'altra — che è esattamente come A-1 è nato: `RIFIUTO_RLS` fu creato per un
audit precedente, e il caso a monte non fu guardato.

Il modulo è anche l'unico posto da cui **entrambi** gli hook possono importarlo
senza che una primitiva di UI (`useSalvataggio`, in `src/hooks/`) debba
dipendere dal livello dello stato (`src/state/`).

### Le tre modifiche

| File | Cosa |
|---|---|
| `src/lib/esitoScrittura.js` | `NOME_PERMESSO_NEGATO`, `erroreDiPermesso()`, `isPermessoNegato()` |
| `src/hooks/useSyncedDispatch.js` | il ramo `denied` ritorna `{ error: erroreDiPermesso() }` invece di `{ error: null }` |
| `src/hooks/useSalvataggio.js` | su un errore di permesso non chiama `alSuccesso` **e** non scrive il testo inline |

⚠️ **Perché il testo inline viene soppresso, e non aggiunto.** I due rami
d'errore fanno la stessa cosa su ciò che conta — il pannello resta aperto con i
dati dentro — e differiscono solo sul messaggio. Il testo predefinito è
«Salvataggio non riuscito. I dati sono ancora qui, riprova.»: «riprova» è un
consiglio giusto per una scrittura fallita e sbagliato per un rifiuto di
permesso, dove riprovare fallirà identico. A parlare resta il toast che il
reducer ha già alzato. Due messaggi che si contraddicono sullo stesso gesto
sono il difetto che «Compensazione» (`M-1`) ha già chiuso una volta dentro il
reducer; qui si evita di riaprirlo da fuori.

### L'invariante che quel silenzio richiede — e il test che la tiene

Tacere è sicuro **solo se il toast del reducer c'è sempre**. Se domani qualcuno
aggiungesse un `guard` a una entry del registry senza il corrispondente
`_denied()` nel reducer, il rifiuto diventerebbe muto: pannello aperto, nessun
messaggio, nessuna idea di cosa sia successo — peggio del difetto che A-1
chiude.

I due livelli vivono in file diversi e nulla li legava. `state/reducer.js` lo
dice già a parole («il pre-check dell'orchestratore impedisce solo la richiesta
di rete, non il dispatch che arriva qui, ed è proprio questo reducer a dover
rifiutare per davvero») — ma una frase in un commento non fallisce quando
smette di essere vera.

`src/test/state/permessoNegatoContract.test.js` la rende misurabile, sulla
falsariga di `rollbackContract.test.js`: per ognuna delle **17 entry con
`guard`** dei due registry e delle **14 azioni di `ADMIN_ONLY_ACTIONS`**, con un
driver come utente corrente, verifica che il reducer alzi un toast d'errore
**e** non applichi nulla a `tasks`/`notices`/`clients`. Un primo caso controlla
che ogni entry con `guard` abbia un payload nel test: senza, una entry nuova
verrebbe saltata in silenzio e la copertura scenderebbe senza che nulla lo
dica.

> Il driver, e non un junior agent, perché è il solo ruolo che nega **tutto**:
> un junior sull'anagrafica i permessi ce li ha.

### Verifica per mutazione

Le tre modifiche sono state verificate rompendole una per una, e ogni rottura
fa fallire il test che le corrisponde — che è l'unico modo di sapere che un
test verde stia misurando qualcosa:

| Mutazione | Esito |
|---|---|
| `DELETE_TASK` nel reducer rifiuta in silenzio (`return state` invece di `_denied()`) | ✗ `permessoNegatoContract` — 1 fallito su 34 |
| `useSyncedDispatch` torna a `{ error: null }` sul rifiuto | ✗ `syncedDispatch` — 2 falliti su 28 |
| `useSalvataggio` scrive il testo inline anche sul rifiuto di permesso | ✗ `salvaEChiudi` — 2 falliti su 20 |

### Cosa è migliorato di conseguenza, senza essere il rilievo

Tre chiamanti diretti di `dispatch` controllavano già `res?.error` e ora si
comportano bene **senza essere stati toccati** — è il segno che il difetto era
nel contratto e non nei call site:

* `ClientiView.jsx:195` — su `UPDATE_CLIENT` negata non esegue più
  `RENAME_CLIENT_IN_TASKS`, che rinominava i task verso un nome che
  l'anagrafica non aveva mai preso;
* `RipristinaTaskModal.jsx:79` — la sequenza `UPDATE_TASK` → `RESTORE_TASK` si
  ferma alla prima invece di ripristinare un task con i valori vecchi;
* `ProfileEditor.jsx:192` — la modale resta aperta.

### Cosa NON è cambiato

`useListeWrite` (`components/liste/listePersistence.js`) non è stato toccato:
davanti a un guard che nega ritornava già `{ ok: false, data: null }`. Era la
versione giusta dello stesso contratto, scritta nell'altro registry — e A-1 è
il posto in cui aveva vinto quella sbagliata.

---

## Come è stato chiuso (A-2)

**4 settembre 2026 — migrazione `20260904143756_revoke_registra_audit_authenticated.sql`.**

### Le due verifiche fatte prima di scrivere la revoca

Una revoca è facile da scrivere e facile da sbagliare: toglie un privilegio, e
se qualcuno lo stava usando il guasto arriva più tardi, altrove, senza dire da
dove viene. Le due domande a cui rispondere prima erano quindi «chi la chiama
dal client?» e «chi la chiama dal database?», e vanno poste a due fonti
diverse:

1. **Nel repository** — `grep -rn "registra_audit"` su `src/`, `supabase/` e
   `scripts/`: una sola chiamata, in `src/test/integration/rls.test.js`, cioè
   una sonda. Nessun componente, nessun hook, nessun modulo di `lib/api/`.
2. **Nel database** — e questa è quella che il repository non poteva dare,
   perché una funzione può essere chiamata dal corpo di un'altra funzione che
   nel repo non compare più nella forma con cui vive in produzione:

   ```sql
   select n.nspname, p.proname from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prokind = 'f'
      and p.proname <> 'registra_audit'
      and p.prosrc ilike '%registra_audit%';
   -- → 0 righe
   ```

   Zero. Nessun trigger, nessuna RPC, nessun helper la usa. Le scritture vere
   su `audit_log` arrivano dai trigger di riga (che girano come proprietario
   della tabella, quindi non toccano questo GRANT) e da `_shared/audit.ts`, che
   inserisce direttamente con la service_role.

Da qui la scelta fra le due opzioni che il rilievo proponeva: non un gate più i
tre limiti, ma la revoca. **Codice di sicurezza che non va mantenuto è meglio
di codice di sicurezza in più da mantenere**, quando la porta non serve a
nessuno.

### Cosa è cambiato

| File | Cosa |
|---|---|
| `supabase/migrations/20260904143756_…sql` | `revoke execute … from authenticated, anon, public` + `grant … to service_role` + `comment on function` che dice cosa serve per riaprirla |
| `src/test/integration/rls.test.js` | il caso «e nemmeno passando dalla RPC può firmarla per conto d'altri» ora misura la proprietà **più forte**: la RPC non è chiamabile affatto (`42501`) |
| `scripts/verifica-advisor/advisor.js` | `registra_audit` **tolta** da `FUNZIONI_SECURITY_DEFINER_VERIFICATE` |
| `docs/SICUREZZA.md` §1 | la riga della funzione, con il perché la vecchia motivazione era vera e non bastava |

⚠️ **Il test cambiato merita una riga.** Il caso di prima chiamava la RPC da un
driver e si aspettava che **riuscisse**: verificava che l'attore fosse quello
giusto, il che era vero, ma nel farlo *certificava* che un utente qualunque
potesse scrivere nel registro di controllo. Un test che misura la metà giusta
di una proprietà sbagliata è più difficile da notare di un test assente, perché
è verde. Ora misura che la porta non c'è — che comprende la vecchia proprietà:
una funzione che non si può chiamare non si può nemmeno firmare male.

⚠️ **E la riga tolta dall'advisor non è pulizia.** `registra_audit` non compare
più fra le `SECURITY DEFINER` esposte, quindi lasciarla nel Set sarebbe stato
inerte — ma toglierla è ciò che rende `verifica:advisor` **rosso** se qualcuno
rifacesse il GRANT: il warning tornerebbe con un nome che non è più fra i
verificati. Il presidio è la sua assenza.

### Prova, su entrambi i database

Applicata su **staging** (`itanvnroxgjdxrplngam`) e poi in **produzione**
(`vmxvnxsqfisucugcpqlc`), verificando la stessa cosa sulle due:

```
prima  {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
dopo   {postgres=X/postgres,                           service_role=X/postgres}

has_function_privilege('authenticated', …, 'EXECUTE') → false
has_function_privilege('anon',          …, 'EXECUTE') → false
has_function_privilege('service_role',  …, 'EXECUTE') → true
```

Controlli di non-regressione in produzione:

* i **cinque trigger di audit** (`trg_audit_users_privilegi`,
  `trg_audit_users_delete`, `trg_audit_clients_insert`,
  `trg_audit_clients_delete`, `trg_audit_liste_truncate`) sono tutti ancora
  abilitati (`tgenabled = 'O'`);
* l'**advisor di sicurezza rieseguito** dopo la migrazione non nomina più
  `registra_audit` in nessuno dei due lint per-funzione, e non ha prodotto
  nessuna classe di avviso nuova.

### Una nota sul nome del file

Il file era nato `20260905090000_…`, un timestamp scelto a mano. Lo strumento
che ha applicato la migrazione ne genera però uno PROPRIO al momento
dell'esecuzione, e nel ledger (`supabase_migrations.schema_migrations`) è
finita la versione **`20260904143756`**. Il file è stato rinominato di
conseguenza, e ogni riferimento nel repository con lui.

`verifica:migrazioni` non se ne sarebbe accorto — confronta per versione **O**
per nome, e lo slug combaciava — ed è proprio per questo che vale rinominare:
lo scarto sarebbe stato invisibile al controllo e visibile solo a chi, fra sei
mesi, cercasse nel ledger la migrazione che il repository chiama in un altro
modo. È la stessa famiglia di difetti di `A-4` del 2 settembre, alla scala più
piccola in cui si presenta.

### Un rilievo diverso, chiuso lo stesso giorno

`M-3` — le cinque funzioni trigger con `EXECUTE` a `PUBLIC` — era un rilievo
diverso e allora restava aperto. Si somigliano (sono entrambi `EXECUTE` di
troppo su funzioni del registro di audit) ma non erano la stessa cosa: quelle
cinque `RETURNS trigger` non sono chiamabili, `registra_audit` lo era. Anche
`M-3` è stato chiuso il 4 settembre, più tardi nella stessa sessione — vedi
«Come è stato chiuso (M-3, M-4, B-3, B-6)» qui sotto.

---

## Come è stato chiuso (M-3, M-4, B-3, B-6)

**4 settembre 2026.** Il blocco che l'action plan raggruppava come «quattro
rimedi piccoli e indipendenti» (punto 4 dell'ordine di esecuzione), chiuso
insieme perché nessuno dei quattro tocca gli altri tre.

### M-3 · Revoca applicata e verificata, non solo scritta

La migrazione proposta nel rilievo è stata applicata pressoché testuale
(`revoke execute … from public, anon, authenticated`, sulle cinque funzioni),
con una differenza dal testo bozza: `revoke execute` invece di `revoke all`,
per coerenza con `20260904143756` (A-2) — le funzioni hanno solo `EXECUTE` come
privilegio ACL rilevante, quindi sono equivalenti nell'effetto, ma il progetto
ha ormai una convenzione ed è quella che vale.

**Il timestamp del file non era quello scelto a mano.** Come già per A-2:
applicata su staging (`itanvnroxgjdxrplngam`) prima e produzione
(`vmxvnxsqfisucugcpqlc`) dopo, lo strumento ha registrato versioni proprie
(`20260904160651` su staging, `20260904160804` su produzione) diverse da
quella scritta nel nome del file bozza. Il file è stato rinominato sulla
versione di **produzione** — la stessa scelta di A-2 — e ogni riferimento
interno (i cinque `comment on function`, che si autocitano) aggiornato di
conseguenza.

**Verifica, non assunzione.** L'audit stesso nota che l'esecutore di una
trigger function è il proprietario della tabella, non il chiamante — ma
«dovrebbe funzionare» non è lo standard di questo progetto. Prima e dopo la
revoca:

```
prima  {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}
dopo   {postgres=X/postgres, service_role=X/postgres}

has_function_privilege('authenticated', …, 'EXECUTE') → false (era true)
has_function_privilege('anon',          …, 'EXECUTE') → false (era true)
```

E poi il test che conta — non i privilegi dichiarati, ma il comportamento
reale — in una transazione su staging, **annullata alla fine** (nessun dato
persiste):

```sql
begin;
insert into public.clients (name) values ('__verifica_m3_trigger_1__'), ('__verifica_m3_trigger_2__');
-- due righe insieme: fa scattare il ramo "import" di audit_clients_insert,
-- che una riga sola non fa scattare (vedi 20260826214000)
delete from public.clients where name like '__verifica_m3_trigger_%';
rollback;
```

Risultato: `audit_log` ha ricevuto la voce `clienti.eliminati` con
`{"righe": 2}` — il trigger `DELETE`, `SECURITY DEFINER` di proprietà
`postgres`, ha scritto normalmente nonostante `authenticated` non avesse più
`EXECUTE` sulla funzione. Dopo il `rollback`: zero righe residue in `clients`,
zero voci residue in `audit_log`. La stessa cosa è stata verificata
sull'advisor di produzione: le cinque funzioni non compaiono più fra i WARN
`anon_security_definer_function_executable` /
`authenticated_security_definer_function_executable` (riverificato dopo la
migrazione).

**Coerenza con la propria disciplina.** `FUNZIONI_SECURITY_DEFINER_VERIFICATE`
in `scripts/verifica-advisor/advisor.js` e la tabella §1 di `docs/SICUREZZA.md`
sono state aggiornate nello stesso commit — non per pulizia, ma per la stessa
ragione scritta accanto a `registra_audit` in quell'elenco: lasciarcele
sarebbe stato inerte oggi e un buco domani, perché un `GRANT` rifatto per
errore su una di queste cinque non farebbe fallire `verifica:advisor` finché
il nome resta in quell'elenco.

### M-4 · Un helper, quattro funzioni, sette punti di ritorno

`supabase/functions/_shared/erroreInterno.ts` è stato scritto pressoché come
proposto — stessa firma, stesso formato di codice (`VD-<timestamp base36>`),
stesso messaggio. Applicato ai quattro `catch` finali (`delete-account`,
`delete-user`, `invite-user`, `set-user-active`) e ai tre 500 espliciti che
concatenavano un messaggio esterno (`delete-account` sul `banErr`,
`set-user-active` su `authErr` e su `dbErr`).

**Cosa non è stato toccato, e perché.** Il ramo generico di `delete-user` per
un `deleteUser` fallito («Impossibile eliminare l'utente. L'errore è stato
registrato…») aveva già la forma giusta — il messaggio era già opaco, solo
senza il codice di correlazione — e non compare fra i «tre 500 espliciti»
del rilievo: cambiarlo sarebbe stato oltre lo scope di M-4. Il ramo `404 not
found` e quello `409 foreign key` di `delete-user`, e i `409`/`429`/`502` delle
altre tre funzioni, restano scritti a mano: sono i 4xx azionabili che il
rilievo stesso escludeva esplicitamente («⚠️ Non toccare i 4xx»).

**Un dettaglio emerso solo applicandolo**: `set-user-active` aveva DUE 500
distinti — uno se il ban/sblocco su GoTrue falliva, uno se falliva solo la
scrittura su `public.users` DOPO che il ban era già passato (uno stato
parzialmente applicato: sessione già cambiata, flag applicativo no). Il testo
originale distingueva i due casi («Accesso aggiornato ma il profilo non si è
salvato»); ora entrambi rispondono con lo stesso messaggio generico. Non è una
perdita di sicurezza — il messaggio generico dice comunque «riprova», e
riprovare è l'azione corretta: il ban è idempotente (bannare un utente già
bannato, o sbloccarne uno già sbloccato, non cambia nulla) e la seconda
chiamata scriverebbe `users.active` di nuovo. La distinzione resta nel log,
via `tag` (`set-user-active/ban` contro `set-user-active/db`).

**Deploy, non solo commit.** Le quattro funzioni sono state distribuite via
`deploy_edge_function` su staging e poi su produzione, con lo stesso set di
file (`index.ts` + le dipendenze di `_shared/` che ciascuna importa
transitivamente — fino a sei file per `invite-user`/`delete-user`/
`set-user-active`, che passano da `requireActiveAdmin.ts` →
`adminPredicate.ts`). Non c'era un ambiente di test con credenziali admin
disponibile in questo ambiente per un'invocazione HTTP end-to-end (le
`RLS_TEST_*` di `rls.test.js` sono secret di CI, non presenti qui): la
verifica si è fermata al deploy riuscito senza errori di bundling/risoluzione
import — che per quattro funzioni con un albero di dipendenze condivise non
banale (`cors.ts` → `originConsentite.ts`, `requireActiveAdmin.ts` →
`adminPredicate.ts`) è comunque un segnale, non una controprova.

### B-3 · Redazione dell'URL, e una famiglia sola per lo user agent

`redigiPii()` non è cambiata: passa ora anche su `url`, che prima ne era
escluso. `userAgent` non passa da `redigiPii` (non ha forma di email o
telefono da cercare) ma da una nuova `famigliaBrowser()`, che riconosce
Edge/Opera/Firefox/Chrome/Safari e ricade su `"altro"`. L'ordine dei
confronti non è arbitrario ed è coperto da test: le UA di Edge e Opera
contengono anche `Chrome/`, e quelle di Chrome contengono anche `Safari/` —
controllare Chrome o Safari per primi le avrebbe classificate male. Sei nuovi
casi in `src/test/lib/errorReportingPii.test.js` fissano l'ordine (Edge non
scambiato per Chrome, Opera non scambiato per Chrome, un'UA sconosciuta
ricade su `"altro"` invece di passare grezza).

### B-6 · La stessa regex, con il perché di una seconda copia

`EMAIL_RX` è stata copiata da `src/lib/validators.js` in
`invite-user/index.ts` con un commento che dice da dove viene e perché è una
copia (le Edge Function Deno non importano da `src/`, che è codice del
bundle Vite). Il controllo si inserisce dopo la validazione esistente di
ruolo/capacity/colore e prima della chiamata a GoTrue, rispondendo `400 Email
non valida` invece di lasciare che sia GoTrue a respingerla con un messaggio
suo.

### Verifica complessiva

`npm ci` pulito, `npm test` verde (**2109 passati, 23 skip su 174 file** — la
crescita rispetto ai 2064/172 della base di partenza è delle sette prove
nuove di B-3 e dei file toccati), `npm run lint` e `npm run verifica:tipi`
senza segnalazioni. Le quattro correzioni sono state applicate a database ed
Edge Function su **staging e produzione**, non solo scritte nel repository —
la stessa disciplina di A-1/A-2, e la ragione è la stessa scritta in
`docs/MIGRAZIONI_SUPABASE.md`: «committare una migrazione non significa
averla applicata».

---

## Come è stato chiuso (M-1)

**4 settembre 2026.** Chiuso da solo, dopo il blocco M-3/M-4/B-3/B-6: non era
indipendente da loro nel senso dell'action plan («quattro rimedi piccoli»),
ma un quinto punto a sé nell'ordine di esecuzione — ed è quello che ha
richiesto la verifica più approfondita dei sette chiusi finora, perché la
soluzione scritta nel rilievo non era quella corretta.

### Le due verifiche fatte prima di scrivere la regola, non dopo

**1. L'inline batte l'esterno, a prescindere da `:focus-visible`.** Prima di
scrivere una riga di CSS: un caso minimo in Chromium via Playwright — un
`<button style="outline:none">` più una regola esterna
`:focus-visible { outline: 2px solid gold }` — per verificare se la
pseudo-classe bastasse. Non basta:

```
button #a (inline outline:none):  outlineStyle: "none"   ← la regola esterna non si applica
button #b (nessun inline):        outlineStyle: "solid"  ← qui sì
```

`el.matches(':focus-visible')` risultava `true` in ENTRAMBI i casi: la
pseudo-classe si applicava correttamente, il problema non era lì. Era nella
cascata — un inline non-`!important` batte qualunque selettore esterno
non-`!important`, indipendentemente da quando o come quel selettore
"scatta". Aggiungere `!important` a `outline`/`outline-offset` risolve
entrambi i casi (riverificato con lo stesso script).

**2. Il colore proposto (`--gold`) andava misurato contro le superfici REALI
dell'app, non ipotizzato.** Formula WCAG (luminanza relativa sRGB), sui
colori effettivi di `docs/CLAUDE.md`:

| Coppia | Contrasto | Soglia 3:1 |
|---|---|---|
| `--gold` su `--navy` | 7.24 | ok |
| `--gold` su `--surface` | 2.12 | **fallisce** |
| `--gold` su `--card` (bianco) | 2.21 | **fallisce** |
| `--gold` su `--sky` | 1.82 | **fallisce** |
| `--navy` su `--surface` | 15.33 | ok |
| bianco su `--navy` | 16.03 | ok |

Il rilievo aveva la diagnosi giusta e la prescrizione invertita: temeva per
i fondi scuri («l'oro non stacca sul navy») quando è l'opposto — l'oro
stacca benissimo sul navy, e fallisce sui fondi CHIARI che sono lo sfondo di
default dell'app (`color-scheme: light`). Un secondo controllo, perché la
prima intuizione («usare `--navy` invece dell'oro») rischiava lo stesso
errore all'incontrario: `grep` per `background: var(--navy)` trova **oltre
25 punti reali** — intestazioni di modali/pannelli e bottoni primari
(`tokens.js` → stile `primary`) — non i «testate navy, toast, ErrorBoundary»
generici che il rilievo nominava a mano. Un `outline` fisso, di qualunque
tinta, non può avere ≥3:1 sia sul chiaro (dominante) sia sullo scuro
(minoritario ma reale e diffuso): sono luminanze quasi opposte.

### La soluzione: due toni, non due regole

Invece di una classe `.vd-su-scuro` da applicare a mano sugli oltre 25 punti
con sfondo navy (rischio concreto di dimenticarne uno, e comunque non
sarebbe stata "quattro righe di CSS"), l'anello ha due componenti che si
completano a vicenda senza bisogno di sapere su quale sfondo si trovano:

```css
:where(a, button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])):focus-visible {
  outline: 2px solid var(--navy) !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px #fff !important;
}
```

`outline` navy risponde del caso comune (15,33:1 sui fondi chiari); il
`box-shadow` bianco resta invisibile lì (si confonde con lo sfondo) e
diventa l'indicatore visibile sui fondi navy (16,03:1). Nessun elenco di
eccezioni da scrivere né da tenere aggiornato.

### Verifica, non solo in isolamento

Oltre al caso minimo, la regola è stata verificata:
* **su un file HTML di controllo** con due bottoni (`outline:none` inline
  su sfondo chiaro e su sfondo navy) — screenshot alla mano, l'anello navy è
  visibile sul primo, l'alone bianco sul secondo, esattamente come previsto
  dai numeri;
* **nell'app vera**, avviando `npm run dev` e navigando con Playwright fino
  alla `LoginScreen` (che gira senza `VITE_SUPABASE_URL`/`ANON_KEY`, non
  serviva altro): sei `Tab` consecutivi, ogni elemento attivo — due `input`,
  due `button` — mostra `outlineColor: rgb(15, 32, 68)` (navy) e
  `boxShadow: rgb(255, 255, 255) 0px 0px 0px 4px`, cioè la regola vince
  sull'inline anche sui componenti reali e non solo sul caso minimo.
  Screenshot: sull'email input della login (sfondo scuro dell'app di
  autenticazione) l'alone bianco è nitido, coerente con la tabella di
  contrasto.

### Cosa NON è stato fatto

`M-2` (le 25 affordance solo-hover, `evidenziaConTastiera()` + la regola di
lint come `warn`) resta aperto: è un rilievo distinto nell'ordine di
esecuzione (punto 7, 4h), non incluso in «M-1». Il correttivo qui sopra
riguarda solo l'anello di `:focus-visible` globale.
