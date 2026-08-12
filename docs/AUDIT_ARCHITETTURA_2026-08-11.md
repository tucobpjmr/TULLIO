# Audit di architettura e sicurezza — 11 agosto 2026

> Perimetro richiesto: **organizzazione di cartelle e moduli, separazione delle
> responsabilità (logica di business / chiamate API / stato locale / UI),
> duplicazione, anti-pattern React, componenti troppo estesi** — con la
> superficie di sicurezza riletta da capo, perché è lì che si è concentrato il
> rilievo più grave.
>
> Rapporto con gli audit precedenti. `AUDIT_ARCHITETTURA_2026-08.md` (7-8
> agosto) ha coperto sicurezza, flusso dati e correttezza;
> `AUDIT_PERFORMANCE_2026-08.md` (9 agosto) bundle e costo di render;
> `AUDIT_STRUTTURA_2026-08-10.md` (10-11 agosto) la forma del codice. **Non
> ripeto nessuno dei loro rilievi chiusi**: li ho rimisurati e sono chiusi
> davvero. I quattordici ST sono confermati chiusi 📄, e i due passi
> deliberatamente rimasti aperti (stato effimero fuori dal reducer — fatto nel
> frattempo, `VoyageDesk.jsx:223-228`; messaggi per conversazione, sotto
> soglia) restano decisioni, non rilievi.
>
> Questo documento contiene **solo rilievi nuovi**.

**Marcatura delle fonti**, come negli audit precedenti:

- ✅ **verificato sul database live**
- 📄 **verificato nel repo** — letto nel sorgente
- 🔬 **misurato** — `npm run lint`, `npm test`, `npm run build` eseguiti oggi

---

## 1. Executive Summary

**Stato di salute: molto buono sul codice, con un buco singolo e grave sul
confine server.** La misura, non l'impressione:

| Indicatore | Valore | Fonte |
|---|---|---|
| Test | **1060 verdi + 7 skipped**, 93 file (erano 969 su 84 il 10 agosto) | 🔬 |
| ESLint | **0 errori**, 20 warning (tutti `no-multi-comp`) | 🔬 |
| Build di produzione | ok in 4.93s — chunk `index` **242 kB / 68.9 kB gzip** (era 291/81.7) | 🔬 |
| Primo caricamento | **595 kB / 168.8 kB gzip** (index + react + supabase) | 🔬 |
| `max-lines` (500 righe effettive) | 0 violazioni, ed è un **errore** di lint | 🔬 |
| Sink XSS (`dangerouslySetInnerHTML`, `innerHTML`, `eval`) | **0 occorrenze** | 📄 |
| CSP bloccante, header di sicurezza | presenti e coerenti (`vercel.json`) | 📄 |

Il refactoring ha retto e continua a migliorare: il chunk iniziale è sceso
ancora di 49 kB, i test sono cresciuti di 91 casi in un giorno, e le tre
invarianti architetturali cablate in `eslint.config.js` (`no-restricted-imports`
sul registry, sui chunk lazy, su `mockData.js`) restano la pratica più matura
del repo.

Detto questo, l'audit precedente si chiudeva con una domanda — **dove
l'invariante è scritta e non ancora applicata?** — e la risposta di oggi ha
spostato luogo. Non è più dentro React: è **al confine fra il client e il
server**, ed è di tre tipi.

**1. Il confine che non applica la regola che il database applica.** Le due
Edge Function più distruttive dell'app — `invite-user` e `delete-user`, che
girano con la `service_role` e quindi **scavalcano ogni policy RLS** — decidono
chi è admin guardando la sola colonna `role`:

```ts
if (caller?.role !== "admin") { … 403 }   // invite-user:75 · delete-user:49
```

Il database, per la stessa domanda, ne guarda tre: `role = 'admin' AND active`
(`private.is_admin()`), più il muro RESTRICTIVE `rls_active_only` su ogni tabella
e il gate `pending` della `20260806130000`. La conseguenza è concreta e non
teorica: **un admin disattivato, e un admin invitato ma non ancora approvato,
conservano il potere di invitare chiunque e di hard-eliminare qualunque utente**
— compresi gli admin veri. Disattivare un account è il modo con cui il pannello
Team revoca i privilegi (`TOGGLE_TEAM_MEMBER_ACTIVE`); dopo la revoca, sui due
endpoint che contano non è successo niente. È l'unico **rilievo critico** di
questo audit, ed è di due righe di correzione (§4, C-1).

**2. Tre impostazioni di amministrazione che l'app dichiara salvate e non
salva.** `messageTemplates`, `activityLog` e `agencyName` vivono nel reducer,
non hanno una entry in `state/persistence.js`, e 📄 **non hanno una tabella**:
`grep` sulle 104 migrazioni non trova né `message_templates` né `activity_log`
né alcuna tabella di impostazioni. Il reducer risponde con un toast di successo
("Template aggiunto", "Log attività svuotato"), e al reload non è rimasto
niente. È esattamente la classe di difetto che il registry di persistenza è
stato costruito per chiudere — il commento su `UPDATE_TEAM_MEMBER` la descrive
parola per parola ("il reducer mostrava 'Agente aggiornato' mentre sul database
non cambiava nulla") — sopravvissuta in tre punti che quel lavoro non ha
toccato. Il caso peggiore è il **Log attività**: un tab d'amministrazione che si
presenta come registro di audit, con filtri per tipo ed export CSV, e che in
realtà mostra le sole azioni compiute *in questa scheda del browser da questo
utente da quando l'ha aperta* (A-1).

**3. La lettura senza paginazione, secondo tempo.** ST-3 ha chiuso
`Clients.list()`; `Tasks.list()` è rimasta indietro ed è la query più pesante
dell'app — porta commenti e cronologia con i join sui nomi, include il cestino,
e non ha né `.range()` né `count`. Il commento in `lib/api.js:621-624` la
identifica già come "il prossimo candidato". Il taglio silenzioso a 1000 righe
(cap PostgREST di default) arriverà, e quando arriverà i task che spariscono
saranno quelli con la scadenza più lontana, senza alcun errore (A-3).

**Un'osservazione trasversale.** L'audit del 10 agosto notava che il rischio del
progetto non è più il debito tecnico ma la **deriva fra ciò che i documenti
affermano e ciò che il codice fa**, e ha risposto con
`scripts/verifica-convenzioni/`. C-1 mostra la stessa deriva su un asse che
nessuno script copre: `docs/SICUREZZA.md` §4 elenca il controllo delle Edge
Function come «token valido + `caller.role === 'admin'`» — la descrizione è
**esatta**, ed è proprio per questo che il documento non si è accorto di nulla.
Il confronto che manca non è fra documento e codice, è fra **la regola scritta
in SQL e la stessa regola riscritta in TypeScript**: due definizioni di "chi è
admin" in due linguaggi, senza nessun test che le metta l'una accanto all'altra
(suggerimento strategico n. 1).

---

## 2. Tabella delle priorità

| # | Priorità | Area | Problema | File |
|---|---|---|---|---|
| **C-1** | 🔴 **CRITICO** | Sicurezza / autorizzazione | Le Edge Function `invite-user` e `delete-user` girano come `service_role` e verificano **solo `role`**, non `active` né `pending`: un admin disattivato o non ancora approvato può invitare utenti e hard-eliminare qualunque account | `supabase/functions/invite-user/index.ts:69-77` · `supabase/functions/delete-user/index.ts:44-51` |
| **A-1** | 🟠 Alta | Persistenza / integrità | `messageTemplates`, `activityLog` e `agencyName` non sono persistiti e non hanno tabella, ma la UI conferma con un toast di successo. Il "Log attività" è per-scheda ed esportabile in CSV come se fosse un audit trail | `state/reducer.js:475-477,509-511,620-640,691-703` · `state/persistence.js` (entry assenti) · `components/admin/tabs/AdminLogTab.jsx` |
| **A-2** | 🟠 Alta | Integrità dati | `ADD_CLIENTS_BULK` scrive con `Promise.all(map(create))`: N richieste, non atomico, **nessun rollback**. È il percorso dell'import anagrafica (centinaia di righe per file) | `state/persistence.js:234-242` · `components/clients/ClientiView.jsx:333` |
| **A-3** | 🟠 Alta | Scalabilità | `Tasks.list()` senza paginazione né `count`, con join annidati e cestino incluso: stesso troncamento silenzioso che ST-3 ha chiuso per i clienti | `lib/api.js:212-217` · `hooks/useAppHydration.js:134` |
| **M-1** | ~~🟡 Media~~ ✔ **risolto** | Correttezza / UX | I rollback riusano le action di mutazione, che emettono un toast di **successo**: un salvataggio fallito mostra "Profilo aggiornato!" accanto all'errore | `state/persistence.js:346-349,430-446` · `state/reducer.js:434,674` |
| **M-2** | ~~🟡 Media~~ ✔ **risolto** | Duplicazione / a11y | Sette overlay modali scritti a mano bypassano `ui/Modal.jsx`: zero `role="dialog"`, zero `aria-modal`, nessuna chiusura con Esc, nessun blocco dello scroll. ST-5 ha chiuso lo stesso difetto **solo dentro il modulo Liste** | `modals/ProfileEditor.jsx:235-243` · `modals/CropModal.jsx:76-88` · `clients/ClienteModal.jsx:75` · `chat/ForwardPicker.jsx:41` · `ui/KeyboardHelpOverlay.jsx:16` · `views/Trash.jsx:276-290` · `clients/ClientiView.jsx:349` |
| **M-3** | ~~🟡 Media~~ ✔ **risolto** | Performance / rete | `visibilitychange` e `online` fanno ripartire un reload **completo** di ogni sottoscrizione: 7 hook, quindi ~7 refetch di tabella intera a ogni ritorno in primo piano, anche dopo due secondi in background | `hooks/useDebouncedTableSubscription.js:100-117` |
| **M-4** | ~~🟡 Media~~ ✔ **risolto** | Scalabilità | `EMPTY_TRASH` esegue N `hardDelete`, ciascuna con select + rimozione storage + delete: 3N round-trip in parallelo, nessun rollback, nessun resoconto parziale | `state/persistence.js:176-181` · `lib/api.js:244-258` |
| **M-5** | ~~🟡 Media~~ ✔ **risolto** | Render | `unreadChat` è ricalcolato nel corpo di `useChatData` a ogni render del guscio — quindi a **ogni carattere digitato nella ricerca** — scandendo fino a 2000 messaggi per conversazione | `hooks/useChatData.js:112-115` |
| **B-1** | ~~🟢 Bassa~~ ✔ **risolto** | Anti-pattern React | `useNotifications` cattura lo snapshot di rollback **dentro** l'updater di `setState` (updater impuro): è il pattern da cui `chatCommands` è stato rifattorizzato via | `hooks/useNotifications.js:61-85` |
| **B-2** | 🟢 Bassa | Dipendenze | `xlsx@0.18.5` con due CVE note, mitigate in-app ma non risolte: la migrazione al tarball CDN resta bloccata dalla egress policy | `package.json:29` · `lib/xlsx.js:1-40` |
| **B-3** | 🟢 Bassa | Config | `leaked_password_protection` ancora disabilitata (già ST-14 / B-2, riportato qui solo per continuità) | dashboard Supabase |

---

## 3. Cosa ho verificato e NON è un rilievo

Vale la pena dirlo, perché sono i punti dove un audit superficiale metterebbe
un rilievo che il codice ha già chiuso:

| Area | Esito |
|---|---|
| XSS | 📄 0 sink HTML, nessun renderer markdown, `window.open` sempre con `noopener`. |
| CSV/Excel injection | 📄 `adminExport.js` neutralizza `= + - @ TAB CR` con l'apice iniziale. Fatto bene, e con la motivazione giusta scritta accanto. |
| Prototype pollution da file importati | 📄 `lib/xlsx.js` fa snapshot di `Object.prototype` attorno al parse e rifiuta il file. |
| `redirectTo` dell'invito | 📄 whitelist stretta (`safeRedirect`), con le label annidate escluse. |
| CORS delle Edge Function | 📄 origin riflesso solo se del progetto, `Vary: Origin`. |
| Secret del push | 📄 confronto a tempo costante. |
| Modifica del testo dei messaggi altrui | 📄 chiusa dalla `20260806150000` con un trigger per-colonna. |
| Escalation di ruolo via self-update | 📄 chiusa dal trigger `BEFORE UPDATE` su `users`, `seniority` compresa. |
| Token in `localStorage` | 📄 scelta corretta per una PWA, e con zero sink XSS l'esposizione resta teorica. |

---

## 4. Action plan dettagliato

### C-1 · 🔴 CRITICO — Le Edge Function privilegiate non applicano il gate `active`/`pending`

**Dove.** `supabase/functions/invite-user/index.ts:69-77`,
`supabase/functions/delete-user/index.ts:44-51`.

**Perché è critico.** Entrambe le funzioni istanziano un client con la
`SUPABASE_SERVICE_ROLE_KEY`, che **bypassa integralmente la RLS**: qui non c'è
nessuna rete di sicurezza a valle, il controllo nel corpo della funzione *è*
l'autorizzazione. E quel controllo è più debole di quello che il database
applica ovunque altro:

```ts
// invite-user/index.ts:69-77 — e identico in delete-user:44-51
const { data: caller } = await supabaseAdmin
  .from("users")
  .select("role")          // ← solo role
  .eq("id", user.id)
  .single();

if (caller?.role !== "admin") {
  return json({ error: "Solo gli admin possono invitare nuovi utenti" }, 403);
}
```

Confronto con la stessa domanda posta al database. La forma corrente è quella
della `20260806130000`, che ha aggiunto il gate `pending` **dentro** l'helper —
quindi le condizioni sono tre, non due:

```sql
create or replace function private.is_admin() ... as $$
  SELECT EXISTS (SELECT 1 FROM public.users
                 WHERE id = auth.uid() AND role = 'admin'
                   AND active = true AND coalesce(pending, false) = false);
$$;
```

Due percorsi sfruttabili, entrambi raggiungibili con un `fetch` autenticato e
nessuno strumento speciale:

1. **Admin disattivato.** Un admin che ha cambiato mansione, o il cui account è
   stato compromesso, viene neutralizzato dal pannello Team con
   `TOGGLE_TEAM_MEMBER_ACTIVE` → `active = false`. Da quel momento la RLS gli
   nega tutto (policy RESTRICTIVE `rls_active_only` su ogni tabella)… ma la sua
   sessione resta valida — `active` è una colonna applicativa, non un ban di
   `auth.users` — e queste due funzioni continuano a rispondergli. **Può ancora
   hard-eliminare qualunque utente**, admin compresi (`auth.admin.deleteUser`,
   con CASCADE su `public.users` e `user_contacts`), e invitare indirizzi
   arbitrari.
2. **Admin invitato e mai approvato.** `invite-user:144` pre-crea la riga con il
   ruolo richiesto e `pending: true, active: false`. L'invitato riceve una
   sessione valida cliccando il link d'invito. L'app lo ferma
   (`main.jsx` → `PendingScreen`), il database lo ferma (gate `pending` della
   `20260806130000`) — **le due Edge Function no**. Il gate di approvazione,
   che è la ragione per cui `pending` esiste, non copre le due operazioni più
   distruttive del sistema.

**Perché nessun test l'ha visto.** `src/test/permissions.test.js` e
`persistenceGuards.test.js` verificano la matrice **client**;
`src/test/integration/rls.test.js` verifica il **database**. Le Edge Function
sono il terzo livello, e non è coperto da nessuno dei due: il loro codice
TypeScript non entra nemmeno nel perimetro di `vitest`.

**Soluzione.** Una sola definizione di "admin che può agire", condivisa dalle
due funzioni, che rispecchi il predicato SQL invece di riscriverne una versione
più debole. Nuovo file:

```ts
// supabase/functions/_shared/requireActiveAdmin.ts
//
// L'AUTORIZZAZIONE DELLE FUNZIONI PRIVILEGIATE, IN UN POSTO SOLO.
//
// Queste funzioni girano con la service_role e quindi scavalcano la RLS: il
// controllo qui dentro NON è una difesa in profondità, è l'unica difesa.
// Deve perciò rispecchiare esattamente il predicato che il database applica a
// tutto il resto — private.is_admin() richiede `active`, e il gate della
// migrazione 20260806130000 richiede `pending = false`. Verificare il solo
// `role`, come si faceva prima, lasciava passare due categorie di chiamante
// che ogni altro strato del sistema respinge: l'admin disattivato (che è il
// modo con cui il pannello Team REVOCA i privilegi) e l'admin invitato ma non
// ancora approvato (che l'app ferma con PendingScreen).
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

export type EsitoAdmin =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403; error: string };

export async function requireActiveAdmin(
  adminClient: SupabaseClient,
  anonClient: SupabaseClient,
): Promise<EsitoAdmin> {
  const { data: { user }, error } = await anonClient.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: "Token non valido" };

  const { data: caller } = await adminClient
    .from("users")
    .select("role, active, pending")
    .eq("id", user.id)
    .single();

  // Le tre condizioni, esplicite e separate: `active !== true` e
  // `pending === true` NON sono ridondanti fra loro (un utente approvato e poi
  // disattivato ha pending=false e active=false), e nessuna delle due si
  // deduce dall'altra.
  const abilitato = caller?.role === "admin"
    && caller.active === true
    && caller.pending !== true;

  // Messaggio unico per i tre casi: distinguerli direbbe a un chiamante non
  // autorizzato quale delle tre condizioni gli manca.
  if (!abilitato) {
    return { ok: false, status: 403, error: "Operazione riservata agli amministratori attivi" };
  }
  return { ok: true, userId: user.id };
}
```

Call site, identico nelle due funzioni (qui `invite-user`, sostituisce le righe
61-77):

```ts
    const esito = await requireActiveAdmin(supabaseAdmin, supabaseUser);
    if (!esito.ok) return json({ error: esito.error }, esito.status);
    const callerId = esito.userId;   // usato più sotto per invited_by
```

E in `delete-user`, il confronto "non puoi eliminare te stesso" passa da
`user.id` a `esito.userId` (riga 63).

**Verifica.** Il test che manca non è sul TypeScript ma sulla **coincidenza dei
due verdetti**: estrarre il predicato in una funzione pura e verificarlo contro
le stesse quattro combinazioni che `rls.test.js` già provisiona lato DB
(attivo/disattivato × approvato/pending). È il suggerimento strategico n. 1.

**Mitigazione immediata**, prima ancora del deploy delle funzioni corrette: in
`Users.deleteUser`/`Users.invite` non c'è niente da fare (il client non è la
barriera), ma **revocare la sessione** insieme al ruolo sì — vedi la nota in
fondo a C-1 nel piano: `TOGGLE_TEAM_MEMBER_ACTIVE` dovrebbe accompagnarsi a un
`auth.admin.updateUserById(id, { ban_duration })`, com'è già per
`delete-account`. Oggi disattivare un utente non tocca la sua sessione.

---

### A-1 · 🟠 Alta — Tre impostazioni admin che l'app dice di salvare e non salva

**Dove.** `state/reducer.js:475-477` (`SET_AGENCY_NAME`), `509-511`
(`CLEAR_ACTIVITY_LOG`), `620-640` (i tre `*_MESSAGE_TEMPLATE`), `691-703` (il
wrapper che accumula `activityLog`); nessuna entry corrispondente in
`state/persistence.js`.

**Perché è un problema.** 📄 `grep` su tutte le 104 migrazioni: nessuna tabella
`message_templates`, nessuna `activity_log`, nessuna tabella di impostazioni
d'agenzia. Le tre fette vivono e muoiono nello state React. Ma il reducer
risponde come se fossero salvate:

```js
// reducer.js:620-628
case "ADD_MESSAGE_TEMPLATE": {
  …
  return { …state,
    messageTemplates: [...(state.messageTemplates || []), tpl],
    toasts: pushToast(state.toasts, { message: "Template aggiunto", type: "success" }),
  };
}
```

Conseguenze, in ordine di gravità:

- **Log attività.** `AdminLogTab` lo presenta come registro (filtri per tipo,
  export CSV con `escapeCSV`, bottone "svuota"). In realtà è un array in
  memoria, capped a 100, **per scheda del browser e per utente**: l'admin che lo
  apre vede solo ciò che ha fatto lui, in quella scheda, da quando l'ha aperta.
  Un audit trail che non registra le azioni degli altri non è un audit trail
  incompleto: è un audit trail che *sembra* completo. `docs/SICUREZZA.md` §6 lo
  elenca fra i "non urgenti, da mettere a piano" — quello che il documento non
  dice è che nel frattempo l'app ne mostra uno.
- **Template messaggi chat.** Gestiti nel pannello Admin, dichiarati "Solo Admin
  può gestire", usati dal composer chat di **tutti**. L'admin ne crea uno, legge
  "Template aggiunto", e nessun altro lo vedrà mai. I quattro di default
  (`reducer.js:758-763`) tornano identici a ogni reload, il che rende il difetto
  più difficile da notare: la funzionalità *sembra* funzionare.
- **Nome agenzia.** Stesso schema, impatto minore (è usato nell'export).

**Soluzione.** Due entità, due trattamenti diversi — e vanno distinti, perché
applicare a entrambe la stessa soluzione è ciò che ha lasciato il problema
aperto finora.

**(a) Template messaggi → tabella + registry.** Sono dati di dominio come le
categorie, e le categorie hanno già esattamente questo trattamento
(`20260630_categories_table`, entry `ADD_CATEGORY` &c.). Migrazione:

```sql
-- supabase/migrations/<ts>_message_templates.sql
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  origin_client uuid            -- l'app è in realtime: vedi realtimeOriginContract
);
alter table public.message_templates enable row level security;

-- Lettura a tutto il team (il composer li usa), scrittura ai soli admin ATTIVI:
-- is_admin() include già `active`, ed è l'helper da usare invece di riscrivere
-- il predicato (è la lezione di C-1 nello stesso audit).
create policy message_templates_select on public.message_templates
  for select to authenticated using ((select private.is_active_user()));
create policy message_templates_write on public.message_templates
  for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

alter publication supabase_realtime add table public.message_templates;
```

Entry nel registry, sulla falsariga di quelle delle categorie:

```js
// state/persistence.js — accanto a ADD_CATEGORY
ADD_MESSAGE_TEMPLATE: {
  normalize: (a) => ({ ...a, payload: { ...a.payload, id: isUuid(a.payload?.id) ? a.payload.id : newId() } }),
  persist: (s, a) => MessageTemplatesAPI.create({
    id: a.payload.id, label: a.payload.label.trim(), text: a.payload.text.trim(),
  }),
},
UPDATE_MESSAGE_TEMPLATE: {
  persist: (s, a) => MessageTemplatesAPI.update(a.payload.id, {
    label: a.payload.label, text: a.payload.text,
  }),
},
DELETE_MESSAGE_TEMPLATE: { persist: (s, a) => MessageTemplatesAPI.remove(a.payload) },
```

più l'idratazione in `useAppHydration` (una `useDebouncedTableSubscription`
identica a quella delle categorie) e la rimozione dei quattro template hard-coded
da `makeInitialState`, che vanno nel `seed` della migrazione: finché restano lì,
un template cancellato dall'admin ricompare al reload successivo.

**(b) Log attività → o server-side, o onesto.** La versione completa è un audit
trail scritto dai **trigger**, non dal client: un client può omettere di
registrare ciò che fa, quindi un registro compilato dal client non è una prova
di niente. Fino a che quella tabella non c'è, la correzione a costo zero è
smettere di presentarlo come registro globale — una riga nel tab:

```jsx
{/* AdminLogTab: dire cos'è. Il log vive nello state React di QUESTA scheda:
    non contiene le azioni degli altri utenti né quelle compiute prima di
    aprire la pagina, e si azzera al reload. Finché è così, chiamarlo
    "registro attività" senza dirlo è la parte del difetto che costa meno
    correggere e di più lasciare com'è. */}
<p style={{ fontSize: 12, color: "var(--text-muted)" }}>
  Sessione corrente · {activityLog.length} azioni registrate in questa scheda.
  Non include le azioni di altri utenti né quelle precedenti all'apertura della
  pagina, e non viene conservato dopo la chiusura.
</p>
```

Le due cose non sono alternative: (b) è ciò che si fa **oggi**, l'audit trail
server-side è il lavoro da mettere a piano con una stima propria.

---

### A-2 · 🟠 Alta — L'import anagrafica scrive N righe senza atomicità né rollback

**Dove.** `state/persistence.js:234-242`; percorso di chiamata
`components/clients/ClientiView.jsx:333` ← `ClientImportModal`.

```js
ADD_CLIENTS_BULK: {
  normalize: (a) => ({ …ids… }),
  persist: (s, a) => (a.payload.length
    ? Promise.all(a.payload.map(c => ClientsAPI.create(toDbClient(c))))   // ← N insert
    : NOOP),
},
```

**Perché è un problema.** Il gemello sui task ha ricevuto proprio questa
correzione, con la motivazione scritta accanto (`lib/api.js:222-228`):

> «UNA insert multi-riga invece di N chiamate in parallelo. È atomica — o
> entrano tutte o nessuna — mentre con `Promise.all` una riga rifiutata
> (vincolo, RLS, rete) lasciava passare le altre e l'utente si ritrovava metà
> batch sul server ma tutte le task in lista, scoprendo la differenza solo al
> reload successivo.»

Quel ragionamento vale identico qui, e con un input più grande: l'import
anagrafica accetta file fino a 15 MB e un foglio Excel di centinaia di righe
(✅ la tabella è già a 818 clienti, alimentata proprio così). In più
`ADD_CLIENTS_BULK` **non ha `rollback`** — mentre `ADD_TASKS_BULK` ce l'ha
(`ROLLBACK_TASKS_BULK`) — quindi un fallimento parziale lascia in lista clienti
che sul server non esistono, senza nessun modo di accorgersene se non
ricaricando. E su un'anagrafica il sintomo pratico è il doppione: l'operatore
non trova il cliente al reload e lo reimporta.

**Soluzione.** `createMany` a blocchi + rollback, esattamente come i task. I
blocchi servono perché una singola insert da 800 righe supera i limiti pratici
di payload di PostgREST:

```js
// lib/api.js — accanto a Clients.create
// Insert multi-riga a blocchi. Il blocco è atomico (o entra tutto o niente),
// quindi un fallimento a metà import lascia uno stato NOTO — i blocchi
// completati — e non un insieme casuale di righe passate e righe respinte.
// 200 è il compromesso fra numero di round-trip e dimensione del payload:
// oltre, PostgREST inizia a rifiutare per lunghezza della richiesta.
createMany: async (clients, { chunk = 200 } = {}) => {
  let scritti = 0;
  for (let i = 0; i < clients.length; i += chunk) {
    const blocco = clients.slice(i, i + chunk).map(withOrigin);
    const { error } = await supabase.from('clients').insert(blocco);
    if (error) return { error, scritti };   // `scritti` dice al rollback cosa NON togliere
    scritti += blocco.length;
  }
  return { error: null, scritti };
},
```

```js
// state/persistence.js
ADD_CLIENTS_BULK: {
  normalize: (a) => ({
    ...a,
    payload: (a.payload || []).map(c => ({ ...c, id: isUuid(c?.id) ? c.id : newId() })),
  }),
  persist: (s, a) => (a.payload.length
    ? ClientsAPI.createMany(a.payload.map(toDbClient))
    : NOOP),
  // Toglie dalla lista SOLO i clienti che non sono arrivati sul server. Un
  // rollback totale sarebbe sbagliato quanto nessun rollback: cancellerebbe
  // dalla UI righe che sul database ci sono davvero, e l'operatore le
  // reimporterebbe creando doppioni — che è il difetto peggiore possibile su
  // un'anagrafica, perché a posteriori non si deduplica da solo.
  rollback: (s, a, res) => {
    const daTogliere = (a.payload || []).slice(res?.scritti ?? 0).map(c => c.id);
    return daTogliere.length
      ? { type: "ROLLBACK_CLIENTS_BULK", payload: daTogliere }
      : null;
  },
  mapError: (err) => (err?.code === "23505"
    ? "alcune righe erano già presenti in anagrafica: import interrotto, i clienti già inseriti restano"
    : err?.message),
},
```

`rollback` riceve oggi solo `(state, action)`: il terzo argomento va aggiunto in
`useSyncedDispatch.js:94` (`spec.rollback?.(s, toDispatch, res)`), passando il
risultato di `persist` — una modifica retrocompatibile, i rollback esistenti lo
ignorano. E `ROLLBACK_CLIENTS_BULK` nel reducer è il gemello silenzioso di
`ROLLBACK_TASKS_BULK` (`reducer.js:324-328`), **senza toast**: il toast d'errore
lo mostra già `fail()`.

---

### A-3 · 🟠 Alta — `Tasks.list()` senza paginazione, con i join più pesanti dell'app

**Dove.** `lib/api.js:212-217`, consumata da `hooks/useAppHydration.js:134`.

```js
list: ({ includeDeleted = false, withComments = false } = {}) => {
  const select = withComments ? TASK_SELECT_WITH_COMMENTS : '*';
  const q = supabase.from('tasks').select(select).order('due_date', { ascending: true });
  return includeDeleted ? q : q.is('deleted_at', null);   // né .range(), né count
},
```

**Perché è un problema.** È lo stesso difetto di ST-3, sulla tabella che cresce
per prima e nella variante più cara: `TASK_SELECT_WITH_COMMENTS` porta con sé
`comments` e `task_history` con i join sui nomi, `includeDeleted: true` include
il cestino, e non c'è né `.range()` né `count`. PostgREST tronca a `db-max-rows`
(1000 di default) **rispondendo 200 senza errore**. Con `.order('due_date')` i
primi a sparire sono i task con la scadenza più lontana — cioè quelli che
nessuno sta guardando oggi, quindi il difetto resta invisibile fino a quando
qualcuno cerca una pratica di là da venire e non la trova. Il commento in
`api.js:621-624` lo dice già («il prossimo candidato alla stessa correzione è
`Tasks.list`»); manca la correzione.

**Soluzione, e non è solo `.range()`.** Il motivo per cui la paginazione qui
costa (il `count: 'exact'` su una select con join annidati) sparisce se si
smette di fare quei join: le due query figlie **esistono già** ed è già in
piedi il percorso che le usa. `useAppHydration` sa distinguere il caso
"thread-only" (`:103`) e sa dispatchare `SET_TASK_THREADS`. Basta usare quel
percorso anche per l'idratazione completa:

```js
// lib/api.js — la select dei task diventa piatta e paginabile.
// TASK_SELECT_WITH_COMMENTS non serve più a nessuno: i due rami annidati sono
// esattamente le due query di TaskThreads, che il percorso "solo thread" di
// useAppHydration già usa da solo. Toglierli dalla query principale rende la
// paginazione economica (il `count` su una select piatta costa poco) e riduce
// il payload dell'idratazione iniziale, che oggi trasporta ogni commento e
// ogni riga di cronologia di OGNI task.
list: ({ includeDeleted = false } = {}) =>
  fetchAllRows(({ from, to }) => {
    const q = supabase.from('tasks')
      .select('*', WITH_COUNT)
      // `due_date` non è unico e può essere NULL: senza una seconda chiave
      // l'ordinamento non è deterministico e due pagine consecutive possono
      // ripetere o saltare una riga (stessa ragione dell'`.order('id')` di
      // Clients.list).
      .order('due_date', { ascending: true, nullsFirst: false })
      .order('id')
      .range(from, to);
    return includeDeleted ? q : q.is('deleted_at', null);
  }),
```

```js
// hooks/useAppHydration.js — l'idratazione completa carica le tre parti in
// parallelo e le consegna con le due action che già esistono.
const [rTasks, rCommenti, rCronologia] = await Promise.all([
  TasksAPI.list({ includeDeleted: true }),
  TaskThreadsAPI.comments(),
  TaskThreadsAPI.history(),
]);
if (!isCurrent()) return;
if (rTasks.error) { …invariato… }
dispatch({ type: "SET_TASKS", payload: (rTasks.data || []).map(fromDbTask) });
dispatch({
  type: "SET_TASK_THREADS",
  payload: {
    comments: perTaskId(rCommenti.data, fromDbComment),
    history: perTaskId(rCronologia.data, fromDbHistory),
  },
});
segnaCaricata("tasks");
```

Due note che rendono la correzione sicura invece che solo elegante:
`fromDbTask` deve continuare a tollerare l'assenza di `comments`/`task_history`
nella riga (📄 già lo fa: `mappers.js:36-41` ripiega su `[]` quando il campo non
è un array, che è esattamente il caso della select piatta), e `SET_TASK_THREADS` va
dispatchata **dopo** `SET_TASKS`, altrimenti mappa i thread su un array di task
ancora vuoto. Anche `TaskThreads.comments()/history()` andranno paginate quando
supereranno le 1000 righe: sono già piatte, quindi è lo stesso
`fetchAllRows`.

---

### M-1 · 🟡 Media — Un salvataggio fallito mostra un toast di successo

**Dove.** `state/persistence.js:346-349` e `430-446` (i due `rollback`), che
producono action gestite da `reducer.js:434` e `reducer.js:674`.

```js
// persistence.js:346 — UPDATE_TEAM_MEMBER
rollback: (s, a) => {
  const prev = (s.team || []).find(m => m.id === a.payload?.id);
  return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev } : null;   // ← riemette la mutazione
},
```

```js
// reducer.js:434 — che quella action la festeggia
return { ...state, team, toasts: pushToast(state.toasts, { message: "Agente aggiornato", type: "success" }) };
```

**Perché è un problema.** `useSyncedDispatch.fail()` dispatcha **prima** il
rollback e **poi** il toast d'errore (`:94-100`). L'utente che tenta un cambio
di ruolo respinto dalla RLS si vede quindi comparire, insieme, un ✅ "Agente
aggiornato" e un ❌ "Salvataggio fallito: ruolo non aggiornato". Il dedup di
`pushToast` è per messaggio, quindi non ne assorbe nessuno dei due. Su
`UPDATE_OWN_PROFILE` è identico: "Profilo aggiornato!" accanto all'errore. Il
messaggio verde è quello che l'utente crede, perché è quello che conferma ciò
che ha appena fatto — ed è falso.

Non è una svista isolata: gli **altri** due rollback del registry lo sanno già.
`ROLLBACK_TASKS_BULK` è un'action dedicata e silenziosa, con il motivo scritto
accanto («Puramente locale e senza toast — quello d'errore lo mostra già il
wrapper»), e `RESTORE_CLIENT` non emette toast. La regola c'è, applicata a metà.

**Soluzione.** Un flag sull'action, letto nei due `case`, invece di due nuove
action gemelle — il rollback deve applicare *esattamente* la stessa transizione,
e duplicarla è il modo in cui le due copie divergeranno:

```js
// reducer.js:420 — UPDATE_TEAM_MEMBER
      const team = state.team.map(m => m.id === patch.id ? { ...m, ...patch } : m);
      // `action.rollback`: la stessa transizione, ma è una COMPENSAZIONE, non
      // una modifica dell'utente. Il toast di successo qui direbbe che è
      // andata bene proprio l'operazione che è appena fallita, e comparirebbe
      // accanto al suo messaggio d'errore (useSyncedDispatch.fail dispatcha il
      // rollback e poi il toast). Vedi ROLLBACK_TASKS_BULK, che per la stessa
      // ragione è già muto.
      if (action.rollback) return { ...state, team };
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Agente aggiornato", type: "success" }) };
```

```js
// reducer.js:663 — UPDATE_OWN_PROFILE, stesso trattamento
      const team = state.team.map(m => m.id === uid ? { ...m, ...updates } : m);
      if (action.rollback) return { ...state, team };
      return { ...state, team, toasts: pushToast(state.toasts, { message: "Profilo aggiornato!", type: "success" }) };
```

```js
// persistence.js — le due entry marcano l'action
  rollback: (s, a) => {
    const prev = (s.team || []).find(m => m.id === a.payload?.id);
    return prev ? { type: "UPDATE_TEAM_MEMBER", payload: prev, rollback: true } : null;
  },
```

Il rollback resta anche fuori dal log attività: `reducer.js:697` registra ogni
`LOGGED_ACTIONS` che cambia lo state, quindi oggi un cambio di ruolo fallito
produce **due** righe di log ("Modificato agente" due volte). Stessa riga di
guardia: `if (LOGGED_ACTIONS.has(action.type) && !action.rollback && next !== state)`.

---

### M-2 · 🟡 Media — Sette modali scritti a mano che bypassano `ui/Modal.jsx`

**Dove.** `modals/ProfileEditor.jsx:235-243`, `modals/CropModal.jsx:76-88`,
`clients/ClienteModal.jsx:75`, `chat/ForwardPicker.jsx:41`,
`ui/KeyboardHelpOverlay.jsx:16`, `views/Trash.jsx:276-290`,
`clients/ClientiView.jsx:349`.

**Perché è un problema.** 📄 `role="dialog"` compare in **tre** file soltanto:
`ui/Modal.jsx`, `ui/ConfirmDialog.jsx`, `liste/modals/LvOverlay.jsx`. I sette
sopra ricostruiscono a mano `position: fixed; inset: 0` + card e non hanno
nessuna delle quattro cose che `Modal.jsx` porta con sé: semantica
(`role`/`aria-modal`/`aria-labelledby`), chiusura con Esc, blocco dello scroll
di fondo, e il portale che evita il bug di centratura dentro un antenato con
`transform`. La testata di `Modal.jsx` descrive esattamente questa situazione
— «il fix strutturale esisteva già: non era applicato dove serviva» — e ST-5 ha
fatto lo stesso lavoro **dentro il modulo Liste**, senza tornare sul core.
Per chi usa uno screen reader il risultato non è un modale mal etichettato: è
un modale che *non esiste*, con il contenuto della pagina sotto ancora
raggiungibile da tastiera.

**Soluzione.** Sostituzione meccanica, senza cambiare né layout né stile.
Esempio su `ProfileEditor` (le due `<div>` a righe 235-243 diventano):

```jsx
    <Modal
      open
      onClose={onClose}
      labelledBy="profilo-titolo"
      width={isMobile ? "calc(100vw - 32px)" : 480}
      cardStyle={{ borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}
    >
      {/* invariato: la testata riceve solo l'id per aria-labelledby */}
      <div style={{ … }}>
        <h2 id="profilo-titolo" className="playfair" style={{ … }}>Il mio profilo</h2>
```

Due avvertenze che decidono l'ordine dei sette:

- `CropModal` e `ForwardPicker` si aprono **sopra** un altro modale
  (rispettivamente ProfileEditor e ChatPanel): vanno con `layer="modalFull"` /
  `layer="chatForward"`, e non con il livello di default, altrimenti si aprono
  sotto il pannello che le ha invocate.
- `ClienteModal` è un pannello laterale a piena altezza, non una card centrata:
  o riceve un `cardStyle` che ne riproduce la geometria, o resta fuori da questa
  correzione e prende solo la parte a11y (`role`, `aria-modal`, Esc, scroll
  lock). Forzarlo dentro `Modal` per uniformità cambierebbe la UI, che non è
  ciò che questo rilievo chiede.

Una volta convertiti, la regola si tiene chiusa con una quinta
`no-restricted-syntax` in `eslint.config.js`, nello spirito delle quattro
esistenti: vietare `position: "fixed", inset: 0` fuori da `ui/` e `styles/`.

---

### M-3 · 🟡 Media — Ogni ritorno in primo piano scatena sette reload di tabella intera

**Dove.** `hooks/useDebouncedTableSubscription.js:100-117`.

```js
const onVisibility = () => {
  if (document.visibilityState === "visible") onReconnectSignal();   // → run(null) = ricarica TUTTO
};
```

**Perché è un problema.** Il meccanismo è giusto (Postgres Changes non ha
ripresa da offset: dopo un buco l'unica risposta corretta è ricaricare) ma il
**segnale** è troppo largo. `visibilitychange` scatta a ogni cambio di scheda e
a ogni ritorno dall'app switcher, anche dopo due secondi, quando nessun evento
è andato perso. E l'hook è montato **sette volte**: cinque in `useAppHydration`
(tasks+comments+task_history, notices, categories, users, clients), una in
`useNotifications`, una in `useChatData`, più quella del modulo Liste quando è
aperto. Ogni ritorno in foreground significa quindi ~7 refetch completi
simultanei, fra cui i due più cari dell'app: `Tasks.list` con i join annidati
(A-3) e `Messages.listAll(2000)`. Su mobile — dove il cambio app è continuo e la
rete è quella che è — è il costo di rete ricorrente più alto dell'applicazione,
speso quasi sempre per riconfermare dati che non sono cambiati.

**Soluzione.** Ricaricare quando l'assenza è stata abbastanza lunga da poter
aver perso qualcosa, non a ogni sguardo:

```js
    // Un websocket non muore perché l'utente ha guardato una notifica per due
    // secondi. Ricaricare tutto a ogni `visible` costa ~7 refetch di tabella
    // intera (tanti quanti gli hook montati) per riconfermare dati che non
    // sono cambiati. La soglia distingue il cambio scheda dall'assenza vera:
    // sotto, il canale realtime era quasi certamente ancora vivo e gli eventi
    // sono arrivati; sopra, si ricarica come prima. `online` NON passa dalla
    // soglia — lì un'interruzione c'è stata per definizione.
    const SOGLIA_ASSENZA_MS = 30_000;
    let nascostoDa = null;

    const onVisibility = () => {
      if (document.visibilityState === "hidden") { nascostoDa = Date.now(); return; }
      const assenza = nascostoDa === null ? Infinity : Date.now() - nascostoDa;
      nascostoDa = null;
      if (assenza >= SOGLIA_ASSENZA_MS) onReconnectSignal();
    };
```

(`nascostoDa === null` → `Infinity` copre il caso in cui la scheda parte già
nascosta e diventa visibile senza che noi abbiamo mai visto l'evento `hidden`:
lì non sappiamo quanto è durata l'assenza, e il default prudente è ricaricare.)

Il secondo passo, se una misura dovesse mostrarlo ancora caro, è **coalescere
fra hook**: oggi ogni istanza ha il proprio timer e i sette partono insieme.
Un'"epoca di riconnessione" a livello di modulo — un contatore incrementato una
volta sola dal segnale, che ogni hook osserva — li ridurrebbe a un ventaglio
ordinato. Non lo propongo ora perché la soglia sopra toglie la maggior parte
delle occorrenze, e la seconda correzione va misurata su ciò che resta, non su
ciò che c'era prima.

---

### M-4 · 🟡 Media — `EMPTY_TRASH` fa 3N round-trip, senza rollback né resoconto

**Dove.** `state/persistence.js:176-181`, che chiama `lib/api.js:244-258`.

```js
EMPTY_TRASH: {
  persist: (s, a, uid) => {
    const ids = (s.tasks || []).filter(t => t.deletedAt && canEditTask(s.team, t, uid)).map(t => t.id);
    return ids.length ? Promise.all(ids.map(id => TasksAPI.hardDelete(id))) : NOOP;
  },
},
```

Ogni `hardDelete` è a sua volta tre operazioni (select su `task_files`, remove
su storage, delete del task): svuotare un cestino da 200 task significa **600
richieste in parallelo**, con cui si sfiorano i limiti di connessione del
browser e si sollecita PostgREST senza necessità. Il reducer intanto ha già
tolto tutto dalla lista, e non c'è rollback: se metà falliscono, l'utente vede
un cestino vuoto e un toast d'errore, e i task tornano al reload successivo.

**Soluzione.** Una sola delete multi-riga, preceduta da una sola raccolta dei
path:

```js
// lib/api.js
// Purge in blocco. Tre query invece di 3N, e soprattutto UNA delete: la
// versione precedente ne faceva una per task, quindi un fallimento a metà
// lasciava il cestino svuotato nella UI e mezzo pieno sul database.
hardDeleteMany: async (ids) => {
  if (!ids.length) return { error: null };
  const filesRes = await supabase.from('task_files').select('file_url').in('task_id', ids);
  if (filesRes.error) {
    console.warn('TasksAPI.hardDeleteMany: lettura allegati fallita, procedo comunque', filesRes.error);
  } else {
    const paths = (filesRes.data || []).map(f => f.file_url).filter(Boolean);
    // La rimozione dei file resta best-effort e non bloccante, com'era in
    // hardDelete: un bucket già ripulito non deve impedire di svuotare il
    // cestino. Il costo di un file orfano è spazio; quello di un cestino che
    // non si svuota è un'operazione che l'utente non può portare a termine.
    if (paths.length) {
      const { error } = await supabase.storage.from('task-files').remove(paths);
      if (error) console.warn('TasksAPI.hardDeleteMany: rimozione storage fallita', error);
    }
  }
  return supabase.from('tasks').delete().in('id', ids);
},
```

```js
// state/persistence.js
EMPTY_TRASH: {
  persist: (s, a, uid) =>
    TasksAPI.hardDeleteMany(
      (s.tasks || []).filter(t => t.deletedAt && canEditTask(s.team, t, uid)).map(t => t.id)
    ),
  // Il filtro DEVE restare identico a quello del reducer (reducer.js:395-403):
  // è l'invariante che persistenceGuards.test.js verifica, e vale anche per
  // questa versione — cambia il COME si scrive, non il CHE COSA.
  rollback: (s) => ({
    type: "SET_TASKS",
    payload: s.tasks,        // lo stato PRE-dispatch: il cestino torna com'era
  }),
},
```

---

### M-5 · 🟡 Media — `unreadChat` si ricalcola a ogni carattere digitato

**Dove.** `hooks/useChatData.js:112-115`.

```js
const unreadChat = chatConversations.reduce(
  (acc, c) => acc + getUnreadCount(messages, c.id, currentUserId), 0
);
```

Non è memoizzato, quindi gira nel corpo dell'hook a ogni render di
`VoyageDeskInner` — e `searchQuery` vive lì (`VoyageDesk.jsx:223`), quindi
**ogni carattere digitato nella ricerca** ricalcola il conteggio scandendo
l'array dei messaggi di ogni conversazione, su un insieme che arriva a 2000
messaggi. È la stessa classe di ST-1, in un punto che ST-1 non ha guardato
perché non è una prop.

```js
// I due `memo` a valle (Sidebar, BottomNav) ricevono `unreadChat`: senza
// questo useMemo il valore è ricalcolato a ogni render del guscio — un numero
// nuovo ma uguale — e su un array di 2000 messaggi è la scansione più cara
// che si paghi per carattere digitato nella Topbar.
const unreadChat = useMemo(
  () => chatConversations.reduce(
    (acc, c) => acc + getUnreadCount(messages, c.id, currentUserId), 0),
  [chatConversations, messages, currentUserId],
);
```

Il beneficio pieno arriverà con il secondo passo di ST-4 (messaggi indicizzati
per conversazione invece che ricaricati tutti): allora `messages` smetterà di
cambiare identità a ogni evento e il `useMemo` salterà davvero. Oggi il
guadagno è già quello che conta — i render *senza* nuovi messaggi, che sono la
quasi totalità.

---

### B-1 · 🟢 Bassa — Snapshot di rollback catturato dentro un updater di `setState`

**Dove.** `hooks/useNotifications.js:61-85`.

```js
const remove = useCallback((id) => {
  let snapshot = [];
  setNotifications(prev => { snapshot = prev; return prev.filter(n => n.id !== id); });  // ← effetto nell'updater
  …
```

Un updater di `setState` deve essere puro: React 18 può invocarlo più di una
volta (StrictMode) e ri-eseguirlo quando ri-basa gli aggiornamenti in coda. È
lo stesso anti-pattern da cui `chatCommands` è stato estratto — il commento in
`useChatData.js:41-45` lo racconta («creare una conversazione produceva due
INSERT in sviluppo»). Qui l'effetto è meno grave (il valore catturato resta
plausibile) ma il rollback non è garantito.

```js
// Lo stato vivo in un ref: lo snapshot si prende PRIMA di aggiornare, fuori
// dall'updater, che così resta puro.
const notificheRef = useRef(notifications);
notificheRef.current = notifications;

const remove = useCallback((id) => {
  if (!enabled) return;
  const snapshot = notificheRef.current;
  setNotifications(prev => prev.filter(n => n.id !== id));
  NotificationsAPI.remove(id).then(r => {
    if (r?.error) { …; setNotifications(snapshot); … }
  });
}, [enabled, onError]);
```

Identico per `clearAll` (`:74-85`).

---

## 5. Top 3 suggerimenti strategici

### 1. Un test che confronta i TRE livelli di autorizzazione, non due

**Il problema che risolve.** Le regole di permesso di questo progetto esistono
in tre linguaggi: JavaScript puro (`lib/permissions.js`), SQL (`is_admin()`, le
policy, `can_use_task_category`) e TypeScript (le Edge Function). Il repo ha già
il test che allinea il **primo con sé stesso** (`persistenceGuards.test.js`:
guard ≡ reducer) e quello che allinea il **primo col secondo**
(`integration/rls.test.js`, contro un progetto di staging). C-1 è nato
esattamente nel triangolo scoperto — il terzo livello — e non è stato visto per
sessioni, in un repo con 1060 test.

**Cosa fare.** Estrarre il predicato dalle Edge Function in una funzione pura
(`_shared/requireActiveAdmin.ts`, §4 C-1) e aggiungere a `rls.test.js` un blocco
che, con gli stessi tre utenti già provisionati, invoca le funzioni **davvero**
via HTTP e verifica il 403 dove il database dà `42501`. Il test costa poche
decine di righe perché l'infrastruttura (utenti di staging, token, `describe.skip`
senza env var) esiste già: è la stessa che M-4 dell'audit del 7 agosto ha
costruito.

**Perché per primo.** Non perché C-1 sia grave — quello si corregge in due righe
oggi — ma perché è l'unico dei tre livelli che oggi **nessuno** guarda, e le
Edge Function sono per costruzione le uniche che girano senza RLS. È il posto
dove il prossimo difetto della stessa famiglia costerà di più.

### 2. Chiudere il cerchio della persistenza: nessuna action che finge

**Il problema che risolve.** A-1 e M-1 sono la stessa cosa vista da due lati: il
reducer emette un toast di successo in casi in cui il successo non c'è stato —
perché non si è scritto niente (A-1) o perché si sta compensando un errore
(M-1). Il registry di `persistence.js` è nato per chiudere proprio questa
classe, e la sua testata la descrive meglio di quanto sappia fare io («quella
classe di bug non si vede in review, si vede in produzione»). Ma il registry
copre le action che *hanno* una entry: quelle che non ce l'hanno restano nel
punto cieco, e nulla oggi obbliga a dichiararlo.

**Cosa fare.** Un test di completezza, nello spirito di
`persistenceGuards.test.js` — che già ne ha uno simile per i rollback:

```js
// src/test/persistenzaCompleta.test.js
// Ogni action che il reducer festeggia con un toast di SUCCESSO deve avere una
// entry in PERSISTENCE oppure comparire in questa lista, che dichiara — e
// motiva — le eccezioni. È l'invariante che A-1 ha violato in silenzio per
// sessioni: tre impostazioni d'amministrazione confermate all'utente e mai
// scritte da nessuna parte.
const LOCALI_PER_SCELTA = new Set([
  "ADD_TEAM_MEMBER",     // senza email non esiste una riga auth.users
  "SET_CURRENT_USER",    // cambio-utente demo, solo DEV
  // ADD_MESSAGE_TEMPLATE, SET_AGENCY_NAME, CLEAR_ACTIVITY_LOG NON sono qui:
  // vedi A-1 dell'audit dell'11 agosto.
]);
```

Con un `LOGGED_ACTIONS`/`SUCCESS_TOAST_ACTIONS` derivato dal reducer, il test
fallisce il giorno in cui qualcuno aggiunge la quarta impostazione locale che si
dichiara salvata. E la marcatura `action.rollback` di M-1 rende la stessa
invariante vera anche nel percorso d'errore.

### 3. Portare il gate `active` dove la sessione lo sente: revocare, non solo disattivare

**Il problema che risolve.** C-1 mostra un caso particolare di un difetto più
generale: `public.users.active = false` è un flag **applicativo**, e
disattivare un utente non tocca la sua sessione di autenticazione. La RLS lo
blocca su ogni tabella (`rls_active_only`), il che copre quasi tutto — ma
"quasi" comprende esattamente i percorsi che la RLS non attraversa: le Edge
Function con `service_role` (C-1), e ogni percorso futuro dello stesso tipo. Il
suo access token resta valido fino alla scadenza, e il refresh token continua a
rinnovarlo.

**Cosa fare.** Far accompagnare la disattivazione da una revoca vera, com'è già
per `delete-account` (che banna per 10 anni prima di toccare `public.users`, e
nell'ordine giusto — il commento in `delete-account/index.ts:39-45` spiega
perché quell'ordine conta). Serve una Edge Function `set-user-active` (o
un'estensione di `delete-user`) che, oltre a scrivere la colonna, chiami
`auth.admin.updateUserById(id, { ban_duration })` — e la rimuova alla
riattivazione. `TOGGLE_TEAM_MEMBER_ACTIVE` in `persistence.js:360-365`
passerebbe da `UsersAPI.setActive` a quella funzione.

**Perché conta più di quanto sembri.** È l'unico dei tre suggerimenti che
cambia una **proprietà del sistema** invece di aggiungere una verifica: dopo,
"revocare l'accesso" nel pannello Team significa davvero che l'utente non ha
più accesso — a prescindere da quali percorsi server-side esisteranno domani e
da chi si ricorderà di controllare `active` al loro interno. È la stessa forma
di ragionamento della migrazione `revoke_anon_table_grants` citata in
`SICUREZZA.md`: un privilegio non sfruttabile resta un privilegio da non
concedere.

---

## 6. Stato dei rilievi

Questa sezione va aggiornata **nello stesso commit** che chiude un rilievo — è
la disciplina che ST-13 ha introdotto e che `npm run verifica:convenzioni` ora
presidia.

| Rilievo | Stato |
|---|---|
| **C-1** | ✔ **corretto e deployato in produzione l'11 agosto** — `invite-user` v9, `delete-user` v4 |
| **A-1** | ✔ **corretto e deployato in produzione l'11 agosto** — tabella `message_templates` + registry + idratazione (a), nota di onestà in `AdminLogTab` (b) |
| **A-2** | ✔ **corretto nel repo l'11 agosto** — `ClientsAPI.createMany` a blocchi + `ROLLBACK_CLIENTS_BULK` (codice applicativo, nessun deploy separato: arriva con il merge) |
| A-3 | 🟠 aperto |
| **M-1 … M-5** | ✔ **corretti nel repo il 12 agosto** — vedi §6-bis |
| **B-1** | ✔ **corretto nel repo il 12 agosto** — vedi §6-bis |
| B-2, B-3 | 🟢 aperti — **nessuno dei due è correggibile da questo repo**, e il 12 agosto è stato riverificato che il blocco persiste: vedi §6-ter |

---

## 6-bis. M-1 … M-5 e B-1 — cosa è stato fatto (12 agosto)

Tutti e sei sono codice applicativo: arrivano con il merge, nessun deploy
separato. Suite a **1119 test verdi** (94 in più della baseline), `npm run lint`
e `npm run verifica:convenzioni` puliti.

### M-1 — i rollback non si annunciano come successi

Il difetto non era in una singola entry, era nel fatto che **la stessa action è
una mutazione quando la chiede l'utente e una compensazione quando la chiede il
ramo d'errore** — e nulla nel dispatch distingueva i due casi. Correggerlo entry
per entry (una `ROLLBACK_OWN_PROFILE`, una `ROLLBACK_TEAM_MEMBER`…) avrebbe
duplicato ogni case del reducer per la sua versione muta.

La correzione è un flag messo dall'**orchestratore**, non dalle entry, perché
descrive il percorso e non l'azione (`hooks/useSyncedDispatch.js`):

```js
if (undo) rawDispatch({ ...undo, meta: { ...undo.meta, compensazione: true } });
```

e letto in **un punto solo**, il wrapper `reducer` (`state/reducer.js`): la
transizione di stato resta quella del case — è esattamente ciò che il rollback
vuole — mentre i toast tornano quelli di prima e non viene scritta alcuna voce
nel log attività, perché un annullamento tecnico non è un'azione che l'utente ha
compiuto. Vale da subito per **tutti** i rollback, compresi quelli aggiunti
dopo. Coperto da `reducer.test.js` (4 casi) e `syncedDispatch.test.jsx` (2).

### M-2 — otto overlay a mano, non sette

Convertiti a `ui/Modal.jsx`: `ProfileEditor`, `CropModal`, `NoticeEditorModal`,
`Trash` (ripristino), `ForwardPicker`, `KeyboardHelpOverlay`, `ClienteModal` e
la conferma di eliminazione in `ClientiView` — l'ottavo che la tabella di §2 non
contava. Nessun `Z.*` resta importato in quei file: il livello lo decide il
guscio (`layer="modal"` / `"modalFull"`).

Un difetto è emerso **dalla** conversione, ed è la ragione per cui `Modal.jsx`
non è rimasto invariato: il listener di Esc è su `window`, quindi ogni modale
montato riceve lo stesso keydown. Con i modali annidati che l'app ha davvero —
la `CropModal` si apre da `ProfileEditor`, una `ConfirmDialog` dall'import
clienti — **un Esc per annullare il ritaglio avrebbe chiuso anche il form
sotto**, con quello che c'era scritto. `Modal.jsx` tiene ora una pila dei modali
aperti e consegna Esc solo a quello in cima; `onClose` sta in un ref così un
re-render del genitore non fa risalire in cima quello sotto. Quattro casi in
`modal.test.jsx`.

Dove il form ha contenuto da perdere (profilo, avviso, ripristino task, scheda
cliente, ritaglio) il click sull'overlay **non** chiude più: `closeOnOverlay={false}`.
Prima chiudeva, ed era il modo più rapido di buttare via dieci campi compilati.

`VoyageDesk.jsx` non gestisce più Escape a mano per l'overlay delle scorciatoie:
lo faceva **fuori** dalla pila e non scattava affatto mentre il focus era in un
campo.

### M-3 — il ritorno in primo piano ha una soglia

`visibilitychange → visible` non significa "sono stato via a lungo": su mobile
lo emettono il commutatore di app, la tendina delle notifiche, il selettore di
file e il picker della fotocamera — cioè proprio i gesti con cui si allega un
file o si risponde a una notifica, più volte in pochi secondi. Con **nove**
istanze dell'hook vive insieme (sei in `useAppHydration`, più chat, notifiche e
liste viaggio), ognuno di quei ritorni costava nove SELECT di tabella intera.

`useDebouncedTableSubscription` tiene ora il momento del passaggio a `hidden` e
ricarica solo se la pausa ha superato `SOGLIA_RIPRESA_MS` (30 s): sopra c'è il
congelamento di timer e socket che i browser mobili applicano alle tab nascoste,
sotto c'è una finestra in cui il canale è rimasto agganciato e **non si è perso
nulla**. `online` resta senza soglia: lì la caduta della rete è un fatto, non
un'euristica. Tre casi nuovi in `realtimeReconnect.test.jsx`.

### M-4 — `EMPTY_TRASH` in una sola istruzione

`Tasks.hardDelete` e il nuovo `Tasks.hardDeleteMany` condividono una sola
implementazione (`purgeTasks`), che filtra con `in` anche per un id solo — due
varianti separate erano il modo in cui la seconda si sarebbe dimenticata i file
orfani nello storage. Su un cestino da 60 task si passa da **180 richieste
concorrenti a 3**.

Il guadagno che conta però non è il numero: è che `delete … in (…)` è **una
istruzione atomica**. Con la cancellazione parziale di prima nessun rollback
poteva essere corretto — rimettere in lista tutti i task avrebbe mostrato come
presenti anche quelli già spariti dal server. Ora la entry dichiara un
`rollback` che rimette **gli oggetti interi** (la purge non ha un inverso da cui
rileggerli) presi dallo stato pre-dispatch, tramite `daPurgare()`, lo stesso
filtro che `persist` usa — la conformità col reducer che `persistenceGuards`
verifica resta su un'unica definizione.

### M-5 — il badge dei non letti

`useMemo` su `[chatConversations, messages, currentUserId]`. Il test non asserisce
un tempo: avvolge `getUnreadCount` in una spia e conta le invocazioni su tre
re-render a vuoto (`chatUnreadMemo.test.jsx`).

### B-1 — lo snapshot fuori dall'updater

Fatto come suggerito (stato vivo in un ref, updater puro), **più** una seconda
correzione che l'audit non aveva chiesto e che si vede scrivendo il test: la
campanella è un feed vivo, e fra il click e la risposta del server il realtime
può aver già consegnato. `setNotifications(snapshot)` cancellava quelle notifiche
dalla campanella senza che nulla le riportasse, perché la loro eco era già
passata. La compensazione è quindi **mirata**: `remove` rimette al suo indice
solo la notifica che il server non ha eliminato, `clearAll` unisce lo snapshot a
ciò che è arrivato invece di sostituirlo. Otto casi in `useNotifications.test.jsx`.

### Un effetto collaterale sul tetto di `max-lines`

M-1 e M-4 hanno portato `state/reducer.js` a 557 righe effettive, 7 oltre la
deroga di 550 che `eslint.config.js` gli concede. Il numero **non** è stato
alzato: il commento accanto a quella deroga dice che alla soglia la domanda
giusta è quale fetta meriti un file suo. È uscito `buildLogEntry` +
`LOGGED_ACTIONS` → `state/activityLog.js` (517 righe effettive residue). Non
sono transizioni di stato: sono il dizionario che le racconta, ed è l'unica
fetta che si può togliere senza spezzare la macchina a stati su due file.

---

## 6-ter. B-2 e B-3 — riverificati aperti il 12 agosto

Restano aperti perché **nessuno dei due si chiude da questo repo**. Riverificati
oggi, non dedotti da una sessione precedente:

| | |
|---|---|
| **B-2** `xlsx@0.18.5` | `curl https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` → **`CONNECT tunnel failed, response 403`**, la stessa egress policy dell'11 agosto e dell'analisi S-06 del 6. Senza accesso al CDN non si può né rigenerare il lockfile né verificare build e test, e una entry URL non risolvibile romperebbe `npm ci`. La mitigazione applicativa resta il fix effettivo e non un segnaposto: limite di dimensione **prima** della lettura in memoria + guard anti prototype-pollution attorno all'intero parse, su entrambi i punti che analizzano file arbitrari. Il comando da eseguire da una rete che raggiunge il CDN è scritto in testa a `src/lib/xlsx.js`. |
| **B-3** `leaked_password_protection` | Riletto **sull'advisor live** (`get_advisors`, progetto `tullio`): `auth_leaked_password_protection` è ancora `WARN`. È un interruttore in Supabase → Authentication → Password → *Enable leaked password protection*, non esposto da API né da MCP. È lo stesso rilievo di ST-14 e del B-2 dell'audit dell'8 agosto: **tre audit di fila**, su un'app il cui accesso è a sola password. Gli altri nove WARN dello stesso advisor sono i `SECURITY DEFINER` esposti di proposito, nominati uno per uno in `AVVISI_ACCETTATI` di `verifica-advisor`. |

### C-1 — cosa è stato fatto

| | |
|---|---|
| **Predicato** | `supabase/functions/_shared/adminPredicate.ts` — `puoAgireComeAdmin()` rispecchia `private.is_admin()` nella forma della `20260806130000`, tutte e tre le condizioni. Modulo **puro e senza import**, nemmeno di tipo: è ciò che lo rende eseguibile da Vitest, che gira su Node e non risolverebbe gli specificatori `jsr:` del runtime Deno. |
| **Preambolo** | `supabase/functions/_shared/requireActiveAdmin.ts` — verifica il JWT, rilegge il profilo con la `service_role` e applica il predicato. Era copiato nelle due funzioni, con lo **stesso identico difetto** in entrambe: è il modo in cui i controlli duplicati sbagliano — non divergono, restano uguali e sbagliati insieme. |
| **Call site** | `invite-user:66-73`, `delete-user:41-50`. In `delete-user` anche il confronto "non puoi eliminare te stesso" passa da `esito.userId`, così l'identità del chiamante ha una sola origine. |
| **Test** | `src/test/edgeFunctionAdminGate.test.js` — 13 casi, **il primo test di questo repo sul terzo livello di autorizzazione**. |

Due correzioni sono nate **dal** test, non prima:

- `maybeSingle()` al posto di `single()` e **l'errore della query letto**. Prima
  il risultato era destrutturato ignorando l'errore (`const { data: caller } =
  await …`): con `caller` a `null` il vecchio confronto rispondeva comunque
  403, quindi il difetto non c'era — ma reggeva *per coincidenza*, e bastava
  invertire il senso di un confronto per trasformare un errore di rete in un
  via libera.
- **`pending: undefined` ≠ `pending: null`.** Da PostgREST una colonna
  selezionata torna `null`, mai `undefined`: `undefined` significa che il campo
  non è stato chiesto, cioè una `select` incompleta a monte. Su `pending` —
  dove il valore assente è quello *permissivo* — trattarlo come NULL avrebbe
  riaperto in silenzio il percorso 2. La prima stesura del predicato li
  confondeva, e a dirlo è stato il test.

**Verificato che il test fallisca senza la correzione**, nelle due metà
separatamente (🔬, la disciplina di `memoViste.test.jsx`): rimettendo il
controllo debole in `invite-user` falliscono i 2 casi di cablaggio;
riducendo il predicato a `role === "admin"` ne falliscono 4, fra cui i due
nominati sui percorsi 1 e 2 di C-1.

> ✔ **Deployato in produzione l'11 agosto**, via MCP `deploy_edge_function`
> (le Edge Function non partono da CI in questo progetto — committare non è
> applicare, la stessa lezione di `docs/MIGRAZIONI_SUPABASE.md` per le
> migrazioni). `invite-user` v8→v9, `delete-user` v3→v4. Verificato rileggendo
> il sorgente effettivamente live (`get_edge_function`): contiene
> `requireActiveAdmin`, non il controllo debole. Nessun avviso nuovo su
> `get_advisors` dopo il deploy.

### A-1 — cosa è stato fatto

**(a) Template messaggi → tabella + registry**, esattamente come proposto:
migrazione `20260811224053_message_templates.sql` (tabella, RLS — lettura a
tutti gli utenti attivi, scrittura solo admin via `is_admin()` — realtime,
seed con i quattro template che prima vivevano solo in `makeInitialState`);
`MessageTemplates` in `lib/api.js`; le tre entry `ADD/UPDATE/DELETE_MESSAGE_TEMPLATE`
in `state/persistence.js` (nessun guard proprio: il gate è `ADMIN_ONLY_ACTIONS`,
come per `ADD_CATEGORY`); idratazione + subscription realtime su
`message_templates` in `useAppHydration.js` (nuova action `SET_MESSAGE_TEMPLATES`,
stesso trattamento di `SET_CATEGORIES`). `reducer.js` non genera più un id
locale (`"mt" + Date.now()`) quando la scrittura è sincronizzata: usa quello
già assegnato da `normalize()`, lo stesso che finisce sulla riga DB — il
fallback locale resta solo per la modalità demo (dispatch non sincronizzato).

I quattro template hard-coded sono usciti da `makeInitialState` come dato
finale: restano nel seed della migrazione, quindi il primo avvio in
produzione li trova identici a prima, ma da lì in poi sono righe vere — un
template cancellato dall'admin non ricompare più al reload.

> ✔ **Deployata in produzione l'11 agosto**, via MCP `apply_migration`, e
> registrata come `20260811224053` — non `20260811210000`, il timestamp con
> cui il file era stato scritto: è lo scarto fra nome-file e versione
> registrata che `docs/MIGRAZIONI_SUPABASE.md` descrive per altri 56 file, e
> qui è stato chiuso subito rinominando il file appena committato invece di
> lasciarlo un cinquantasettesimo caso. **Il primo tentativo di applicazione è
> fallito**: la bozza (copiata da `20260630_categories_table`) referenziava
> `public.is_admin()`/`public.is_active_user()`, che non esistono più da
> quando `20260706181011` li ha spostati in schema `private` — uno scarto fra
> **questo stesso documento** (§4 C-1, che li citava come `public.*`) e il
> database live, scoperto solo provando a applicare per davvero. Corretto
> nella migrazione e in tutti i punti di questo documento e di
> `docs/SICUREZZA.md` che citavano `public.is_admin()`/`public.is_active_user()`.

**(b) Log attività → onesto**, non server-side (quella resta lavoro a sé, il
suggerimento strategico n. 2): `AdminLogTab` dichiara ora esplicitamente,
sopra i filtri, che il registro è per questa scheda del browser, per questo
utente, dall'apertura della pagina — non un audit trail.

**Test**: `src/test/reducer.test.js` (`ADD_MESSAGE_TEMPLATE` usa l'id del
payload quando presente, genera un fallback locale in demo, `SET_MESSAGE_TEMPLATES`
sostituisce l'intero elenco) e `src/test/persistenceGuards.test.js` (le tre
entry chiamano `MessageTemplatesAPI.create/update/remove`, il non-admin non
raggiunge il database). 🔬 Verificato che i test sulla forma dell'id e su
`SET_MESSAGE_TEMPLATES` falliscano senza la correzione (12 casi, fra A-1 e
A-2, verificati stash-e-riprova sui soli file sorgente).

### A-2 — cosa è stato fatto

`ClientsAPI.createMany` in `lib/api.js`: insert a blocchi da 200 righe (non
una sola insert multi-riga come per i task — un import da centinaia di righe
supera i limiti pratici di payload di PostgREST), ciascuno atomico. Il
blocco fallito interrompe il ciclo e ritorna `{ error, scritti }`.
`ADD_CLIENTS_BULK` in `persistence.js` guadagna un `rollback` che non aveva
mai avuto: toglie dalla UI **solo** i clienti oltre `res.scritti` — non tutti
(cancellerebbe righe che sul server ci sono davvero, producendo il doppione
che questa correzione esiste per evitare) e non nessuno (lascerebbe in lista
clienti mai scritti). La nuova action `ROLLBACK_CLIENTS_BULK` è il gemello
silenzioso di `ROLLBACK_TASKS_BULK`.

Per farlo, `rollback()` doveva ricevere il risultato di `persist()`:
`useSyncedDispatch.js` passa ora un terzo argomento (`res`) a `fail()` e a
`rollback()`, letto dal solo `.then()` (un `.catch()` non ha un `res` del
genere — un errore di rete prima di qualunque blocco si comporta come
`scritti: undefined`, cioè rollback totale). I rollback esistenti lo
ignorano: retrocompatibile.

**Test**: `src/test/reducer.test.js` (`ROLLBACK_CLIENTS_BULK` toglie solo gli
id indicati) e `src/test/persistenceGuards.test.js` (il rollback usa
`res.scritti` per decidere la coda, `persist` chiama `createMany` una volta
sola e non `create` N volte). 🔬 Verificato che falliscano senza la
correzione.
