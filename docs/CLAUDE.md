# CLAUDE.md — Istruzioni per Claude Code

> Gli altri documenti in `docs/` sono indicizzati in [`INDEX.md`](INDEX.md).
> Qui c'è la REGOLA, in una o due righe. Il perché per esteso (com'era prima,
> quale audit l'ha cambiata, cosa si è misurato) sta in
> [`CLAUDE_DETTAGLI.md`](CLAUDE_DETTAGLI.md), sotto lo stesso titolo in
> grassetto: si legge quando si tocca quell'area. Se questo file e il codice
> non sono d'accordo, il codice è la fonte di verità e questo file si corregge
> nello stesso commit.

## Identità progetto

**VoyageDesk** è un sistema gestionale per agenzie viaggi e tour operator: React 18 + Vite 6 su Supabase (PostgreSQL con RLS, Realtime, Storage, Auth, cinque Edge Function), in produzione, ~23.000 righe su un centinaio di moduli.

## Ruolo

Agisci come sviluppatore full-stack specializzato in sistemi gestionali per travel industry. Rispondi in italiano, sintetico.

## Regole di sviluppo

### Stile codice
- React 18 con hooks (useState, useReducer, useContext, useRef, useEffect, useCallback, useMemo)
- CSS inline + CSS variables (in `:root` di `src/styles/global.css`, importato da `main.jsx`) — NO Tailwind, NO librerie CSS
- Stato globale: useReducer + Context. Chat: `useState` in `hooks/useChatData.js` con le scritture in `chat/chatCommands.js`; la navigazione dentro il pannello ha un reducer suo (`chatPanelReducer`)
- Lingua UI: **italiano** (label, placeholder, toast, tutto)
- Font: Playfair Display (headings, classe `.playfair`) + DM Sans (body, default)
- Dipendenza esterna unica: SheetJS (`xlsx`) per import CSV/Excel ed export Excel

### Convenzioni naming
- Componenti: PascalCase (`PersonalQueue`, `CalendarPlanner`)
- Helper/utility: camelCase (`canViewTask`, `getAssignableTeam`)
- Actions reducer: UPPER_SNAKE_CASE (`ADD_TASK`, `UPDATE_OWN_PROFILE`)
- CSS variables: kebab-case (`--navy`, `--gold-dark`)
- Sezioni nel file: delimitatori `// ─── TITOLO ───`
- **Lingua degli identificatori**: in inglese solo ciò che detta la piattaforma (prop `on*`, hook e API di React e del DOM) e ciò che detta il database (i campi del modello rispecchiano le colonne: `dueDate` ← `due_date`). Tutto il resto in **italiano**. ⛔ Niente mix dentro uno scope, e mai due nomi per un concetto solo nello stesso file (misurato: «doppio nome per lo stesso concetto», atteso 0). `me` è la persona, `currentUserId` il suo id. L'arretrato si converte un file alla volta, quando lo si riscrive per altro: niente rename di massa.

### Pattern da rispettare

**Stato e architettura**
- **Immutabilità**: sempre spread `{ ...state, tasks: [...] }`, mai mutare direttamente.
- **Reducer puro**: `src/state/reducer.js` non ha effetti collaterali né scritture fuori dallo state. Fonte di verità: `state.team` / `state.categories` / `state.currentUserId`.
- **Niente stato globale mutabile**: `appGlobals.js` non esiste più (lo vieta `no-restricted-imports`). Team, categorie e utente arrivano da `useAppData()`; fuori dai componenti si usano le funzioni pure di `lib/permissions.js` con `state.team`. I permessi si chiedono con `io` o `per(id)`.
- **Permessi**: ogni feature su task o viste usa `canViewTask`/`canEditTask` (`lib/permissions.js`, funzioni pure). Nei componenti si prendono da `useAppData()`, già legate a `state.team`. Ogni voce di `NAV_ITEMS` ha il campo `roles`.
- **Le viste NON ricevono `state`**: leggono da `useTasks()`, `useClients()`, `useAppData()` e ricevono come prop solo le fette piccole che usano.
- **Il guscio compone, non implementa**: UI effimera del guscio in `hooks/useShellUi.js` (espone COMANDI, non setter), provider in `state/AppProviders.jsx`. `dispatch` viaggia per contesto (`useDispatch`), mai come prop (`VIETATO_DISPATCH_PROP`).
- **`selectedTask` È la riga di `tasks`**, non una copia: è lo stesso oggetto di `state.tasks`, o `null` se lì non c'è più.
- **Una cartella, una FUNZIONALITÀ**: `src/components/` raggruppa per funzionalità (`tasks/`, `chat/`, `liste/`, …). Solo `ui/` (trasversale, senza dominio) e `shell/` (guscio) sono eccezioni. «Modale» e «vista» non sono funzionalità.
- **Un file, una responsabilità**: sopra le 500 righe si spezza (`max-lines` è un errore, a zero violazioni, senza deroghe), e un componente per file. `react/no-multi-comp` è un warning, con 0 casi aperti in 0 file. Il tetto FISICO (righe che si aprono, commenti compresi) è 850.
- **File grandi**: si spezzano con lo stesso criterio — un file per componente, gli helper puri in `lib/` o in un `*.js` accanto.
- **Il data layer si importa da `src/lib/api.js`, che è una PORTA**: i moduli in `src/lib/api/` sono privati (`VIETATI_MODULI_API_INTERNI`). Eccezione: `lib/api/liste.js`, chiuso al solo modulo Liste.
- **Un task nuovo si costruisce con `nuovoTask()`**, mai a mano: la forma è CHIUSA.
- **La ricorrenza dei task NON esiste**: è stata rimossa, non è «da fare».

**Scritture**
- **Persistenza**: una action che scrive su Supabase si dichiara in `src/state/persistence.js` (o `persistenceAdmin.js`): `guard` / `normalize` / `persist` / `rollback` / `mapError` / `entityId`. L'orchestratore `hooks/useSyncedDispatch.js` contiene solo ciò che vale per OGNI azione. Gli id di `entityId` sono «in volo» finché la scrittura non torna, e un refetch concorrente non li sovrascrive (`fondiScrittureInVolo`).
- **⛔ Un solo percorso di scrittura**: un componente non chiama il data layer per mutare un'entità dello state. Il registry è l'unico punto con doppio controllo di permesso, rollback e tag `origin_client`.
- **Un solo percorso di scrittura, anche nella chat**: `ConversationView` chiama `commands`, mai un setter di stato.
- **Scritture della chat**: comandi espliciti in `chat/chatCommands.js`. ⛔ Mai chiamate di rete dentro l'updater di `setState` (React lo può rieseguire): vale per tutta l'app.
- **Scritture delle Liste**: in `components/liste/listePersistence.js` (`LISTE_WRITES`), eseguite con `useListeWrite(dispatch)` → `esegui(...)`. Niente ottimistico né rollback: ogni scrittura è una RPC transazionale seguita da un reload.
- **Scrivere da offline**: `offline: true` su una entry significa IDEMPOTENZA, non importanza. Tre condizioni: id generato dal client, `persist` che non legge `state`, significato che non scade. Su guasto di rete l'azione va in coda (IndexedDB) e `useSyncedDispatch` risponde successo.
- **⛔ Mai chiudere o svuotare prima di conoscere l'esito**: ogni salvataggio passa da `useSalvataggio(esegui, { alSuccesso })` — freno al doppio invio su un ref, pannello aperto in errore, `alSuccesso` solo a esito positivo; `{ avviso }` per la riuscita parziale. **27 call site usano `useSalvataggio`**. Controlli a 0: «form che scrivono senza attendere l'esito», «stato di invio scritto a mano»; il contratto «salva e chiudi» guarda 7 form.
- **`await` in un componente smontabile**: dopo un `await` che precede una scrittura nello stato, `if (!montato()) return;` (`useIsMounted`). Per i salvataggi lo fa già `useSalvataggio`.
- **Disattivare un membro del team REVOCA, non etichetta**: `TOGGLE_TEAM_MEMBER_ACTIVE` passa dalla Edge Function `set-user-active`, che banna la sessione in GoTrue e scrive `public.users.active`. Se il profilo non si aggiorna, il ban torna com'era (`set-user-active/statoAccesso.ts`). ⛔ Un admin non disattiva se stesso.
- **Le scritture fuori dal registry hanno comunque un guard nell'AZIONE** (`TaskFiles`, `Messages`, `Users.uploadAvatar`, `Users.invite`).

**Letture e realtime**
- **Letture che devono arrivare INTERE**: `fetchAllRows` + `WITH_COUNT` (`lib/pagination.js`), mai una `select` nuda (PostgREST tronca a 1000 righe senza errore), con un ordinamento chiuso su una colonna unica.
- **Una finestra sull'idratazione, e chi si carica il resto**: all'avvio arrivano i task non completati più i completati degli ultimi 60 giorni. Chi guarda il resto chiede il corpus con `useStoricoTaskCompleto()`: **5 viste chiedono `useStoricoTaskCompleto`**.
- **L'anagrafica clienti non si scarica all'avvio: la chiede chi la guarda**, con `useClientiCompleti()`: **2 viste chiedono `useClientiCompleti`**.
- **La cronologia di un task si legge quando quel task si apre**: `task_history` non entra nell'idratazione né nel realtime.
- **Il transport realtime ha un file suo: `src/lib/realtime.js`**: `withOrigin` (chi mette il tag `origin_client`) e `subscribeTo*` (chi scarta l'eco) stanno insieme. L'ingresso resta `lib/api.js`.
- **Il modulo Liste ha lo stesso contratto `origin_client` del core**: le RPC che scrivono con INSERT/UPDATE prendono `p_origin` come ultimo parametro (`drop function` + `create function`, mai un overload).
- **Merge per riga per le tabelle piatte**: un evento su `tasks`, `notices` o `clients` applica la riga del payload (`applyRow` → `MERGE_*_ROW`), senza reload. Non vale per `comments`/`task_history`.
- **Idratazione della chat**: `useChatData` ricarica selettivamente per tabella, come `useListeData`.
- **Modulo Liste viaggio**: stato suo, stessa architettura dati del core (`useDebouncedTableSubscription` su `liste_viaggio`, `movimenti_lista`, `lista_beneficiari`); il reload parziale è scritto in positivo.
- **Il modulo Liste è chiuso anche STRUTTURALMENTE**: data layer in `lib/api/liste.js`, raggiungibile solo da `components/liste/**` (`VIETATO_LISTEAPI_DA_FUORI`); dal core si entra da `listeModuleApi.js`.
- **Un canale realtime permanente si apre solo per le tabelle su cui il realtime È la funzionalità**: `senzaCanale: true` per categorie e template.
- **Ripresa dopo un buco di connessione**: su `online` e sul ritorno in primo piano, reload completo (`tabelle = null`), con un debounce di 300 ms.
- **Il reload di ripresa ha una soglia**: dal secondo piano si ricarica solo dopo `SOGLIA_RIPRESA_MS` (30 s).
- **La presenza è stato di CANALE, non una riga di tabella** (`hooks/usePresence.js`). ⛔ Niente heartbeat su tabella.
- **Ciò che invecchia col tempo ha un tick, e il tick vive dove la cosa si mostra**: `useTickLento(intervalloMs, attivo)`, con il valore nelle dipendenze del memo.

**Interfaccia**
- **Hover**: `onMouseEnter`/`onMouseLeave` su `e.currentTarget.style`, sempre con il gemello da tastiera: `{...conTastiera(onEnter, onLeave)}` (`lib/a11y.js`).
- **Focus dei campi**: il bordo di un campo a fuoco si dà con `className="vd-campo-fuoco"` (o `vd-campo-fuoco-danger`), definite in `styles/global.css`. ⛔ Mai `e.target.style` da `onFocus`/`onBlur` (`FOCUS_SCRITTO_A_MANO`).
- **Animazioni ingresso**: classi `slide-up`, `fade-in`, `slide-right`.
- **Responsive**: `const { isMobile, isDesktop } = useViewport()` dentro ogni componente che adatta il layout.
- **Modali**: `components/ui/Modal.jsx` (portale, overlay, Esc al solo modale in cima, blocco scroll, `role="dialog"`). ⛔ Non ricostruire l'overlay a mano; il livello lo decide `layer`.
- **I modali del modulo Liste hanno semantica di dialogo**: `LvOverlay.jsx` porta le stesse garanzie di `Modal.jsx`.
- **⛔ Niente `window.confirm` / `alert` / `prompt`**: conferme con `useConfirm()` (`danger: true` per le azioni distruttive), errori con un toast.
- **⛔ Mai un `lazy()` montato con il solo `<Suspense>`**: si monta con `components/ui/LazyPanel.jsx` (Suspense + boundary insieme). Misurato: «lazy() senza boundary», atteso 0.
- **Errori: a schermo il minimo, in console il dettaglio**: i boundary mostrano `ErrorDetails.jsx` (in produzione solo il codice di segnalazione). ⛔ Niente `<pre>{error.stack}</pre>`.
- **Validazione dei form: inline, non via toast**: `validaCampi(valori, REGOLE)` con i validatori di `lib/validators.js`, `<FieldError>` + `ariaCampo`, focus su `primoCampoInvalido`. ⛔ Niente return muti né bottoni spenti al posto del messaggio; `type="text" inputMode="email"`, non `type="email"`.
- **Attese annunciate**: ogni attesa visibile ha `role="status"` + `aria-live` e un TESTO.
- **Stati di attesa onesti**: finché il primo fetch non è tornato, scheletro (`SkeletonCards`/`SkeletonRows`) e conteggi `…`, mai un vuoto o uno `0` che non si conosce.
- **Stato di rete visibile**: offline, `shell/OfflineBanner.jsx` mostra una striscia persistente e non chiudibile.
- **Elenchi lunghi: una finestra, non tutte le righe**: `useFinestra` + `ui/MostraAltri.jsx`; ogni restringimento riazzera la finestra. ⛔ Non riscrivere il pattern a mano.
- **Una ricerca su un elenco si fa con un INDICE, non normalizzando a ogni battuta**: `indicizza(...)` per riga, `matchIndice(termini, idx)` a ogni battuta. ⛔ Niente `matchTermini` in un `useMemo` che dipende dalla query.
- **Card di un task**: `TaskCard` e `TaskRow` (entrambi `memo`, callback con `useCallback`); le differenze passano dagli slot.
- **⛔ Mai un `value={{…}}` o `value={[…]}` letterale su un `Context.Provider`** (`VIETATO_CONTEXT_VALUE_LETTERALE`): `useMemo` o costante di modulo.

**Stili**
- **Stili**: z-index, bottoni e campi da `src/styles/tokens.js`. ⛔ Mai uno `zIndex` numerico inline. ⛔ Mai uno `style={{…}}` di soli valori costanti (`STILE_INLINE_COSTANTE`): va in una `const` di modulo, nel `*Styles.js` accanto o in `styles/common.js` se la forma ricorre in tre o più file (misurato per VALORE: «forme di stile identiche in 3+ file» e «forme già in common.js riscritte altrove», attesi 0). Restano **333 style inline dinamici**.
- **Stili condivisi**: `src/styles/common.js` si importa **qualificato** — `import * as stiliComuni from "…/styles/common.js"`. ⛔ Mai un import nominato da lì (`VIETATO_COMMON_NOMINATO`).
- **CSS globale**: `src/styles/global.css` (e `components/liste/liste.css`). ⛔ Niente `<style>` in JSX o in `index.html`: la CSP è `style-src 'self'`.

**Dominio**
- **Date**: ogni formattazione passa da `src/lib/dates.js` (le forme sono nominate lì). ⛔ Niente `toLocaleDateString`/`toLocaleTimeString` nel JSX. Una colonna `date` si legge con `aData`.
- **Sommare denaro**: `sommaImporti(valori)` (`lib/importi.js`), in centesimi interi. ⛔ Mai un `reduce` con `+`.
- **Una cache in memoria ha una scadenza che LIBERA e un tetto**: `creaCacheScadenza({ tetto })` (`lib/cacheScadenza.js`).
- **Commenti che asseriscono il database**: un commento su una policy, un grant o un predicato lato server va accompagnato da un caso in `src/test/integration/rls.test.js`.

**Verifiche**
- **Test di componenti**: chi usa `useAppData()` si monta con `renderWithAppData` (`src/test/helpers/appData.jsx`). I test stanno in cartelle che rispecchiano il sorgente (misurato: «test sciolti», atteso 0).
- **`checkJs` incrementale, e verificato**: `npm run verifica:tipi` su `src/lib/` e `src/state/`, a zero errori; lo scope si allarga una cartella alla volta.
- **Il budget del bundle misura DUE percorsi, non uno**: `npm run verifica:bundle`, soglie su first load anonimo e autenticato (in `scripts/verifica-bundle/index.js`).
- **I numeri scritti in `docs/` sono verificati da uno script**: `npm run verifica:convenzioni` confronta i conteggi di questo file e di `INDEX.md` con la misura, e fallisce sulla divergenza. Ogni lettura da documento SOLLEVA se la frase non c'è.
- **Sei controlli NEGANO i call site mancanti, non li contano**: atteso 0 — «form che scrivono senza attendere l'esito», «stato di invio scritto a mano», «ricerche che normalizzano a ogni battuta», «indexOf/findIndex dentro una `.map()`», «guardia di solo smontaggio su un caricamento» (il caricamento lo possiede `useCaricamento`), «metà scoperte delle scritture in volo». ⛔ Nessuna lista di eccezioni: un caso legittimo si motiva nel codice.
- **Gli avvisi dell'advisor Supabase si accettano per NOME** (`AVVISI_ACCETTATI`, `FUNZIONI_SECURITY_DEFINER_VERIFICATE` in `scripts/verifica-advisor`).
- **La copertura dei test è misurata, e ha una soglia in CI**: `npm run verifica:copertura`, soglie in `vite.config.js` un punto sotto la misura.

### Commenti

M-4 dell'analisi del 6 novembre: i commenti erano il 35% delle righe, e questo file pesava 159 KB. Ogni modifica costava la lettura di tutto.

- Un commento dice **perché** il codice è così e **cosa non va toccato** (⚠️/⛔). Non racconta la storia: com'era prima, quale audit l'ha cambiato, cosa si è misurato quel giorno. Quella va nel `CHANGELOG.md` o nell'audit.
- Per citare un rilievo basta la sigla e la data (`B-2 del 6 novembre`).
- Una regola nuova entra qui in una o due righe; il ragionamento lungo, se serve, in `CLAUDE_DETTAGLI.md`.
- `npm run verifica:convenzioni` misura due tetti: in `src/` (test esclusi) i commenti sono al più il 32% delle righe, e questo file resta sotto i 40 KB. Si abbassano quando la misura scende.

### Cosa NON fare
- Non usare localStorage/sessionStorage per i DATI: la fonte di verità è il database. Due eccezioni, motivate nel proprio file: `lib/tema.js` (la scelta del tema, da applicare prima del primo paint) e `lib/depositoIdb.js` (la coda offline, su IndexedDB).
- Non aggiungere librerie CSS/UI esterne
- Non rompere funzionalità esistenti
- Non rimuovere commenti delimitatore sezione
- Non usare drag&drop su mobile (usare SwipeActions)
- ⛔ Non lanciare `supabase db push`: la storia delle migrazioni nel repo non coincide con `schema_migrations`. Procedura in `docs/MIGRAZIONI_SUPABASE.md`.
- Committare una migrazione non significa averla applicata: si verifica a parte (`npm run verifica:rpc`, `npm run verifica:migrazioni`).
- ⛔ **Non scrivere il gate «utente attivo» dello Storage come elenco di bucket.** `storage_active_only` è `using ((select private.is_active_user()))`, senza elenchi; un bucket da esentare si scrive come disgiunzione affermativa. Misurato da `verifica:convenzioni` (atteso 0). Perché: `docs/SICUREZZA.md` § 2.

## Palette colori

```css
--navy: #0F2044;        --navy-light: #1a3060;     --navy-dark: #08152d;
--sky: #D0EEF9;         /* shell: topbar, sidebar, bottom-nav (celeste tenue) */
--gold: #D4A843;        --gold-light: #e8c46a;     --gold-dark: #b8902e;
--surface: #FAFAF7;     --surface2: #F0EEE8;       --surface3: #E8E5DC;
--success: #2D7A4F;     --warning: #C8832A;        --danger: #C0392B;
--text: #1A1A2E;        --text-muted: #6B6B80;     --text-light: #9999AA;
--border: #E0DDD5;
--card: #ffffff;        --card2: #F7F6F2;          --heading: var(--navy);
--focus: var(--navy);   --focus-alone: #fff;
```

### Tema scuro (M-4 dell'audit del 10 settembre)

Non è una seconda serie di regole: sono gli **stessi token, ridefiniti** in
`src/styles/global.css` sotto due selettori — `@media (prefers-color-scheme:
dark)` ristretto a `:root:not([data-tema="chiaro"])`, e `:root[data-tema="scuro"]`
per la scelta esplicita. La scelta la scrive `src/lib/tema.js` (tre valori:
`sistema`, `chiaro`, `scuro`), l'interruttore sta nel menù utente
(`shell/UserSwitcher.jsx`), e `main.jsx` la applica **prima di `createRoot`**
per non far partire l'app chiara e virare al buio sotto gli occhi di chi legge.

Le due regole che rendono possibile tutto questo, e che vanno rispettate dal
codice nuovo:

1. **Il colore si prende da un token, sempre.** Un `#1A1A2E` scritto a mano è
   un pezzo di interfaccia che al buio resta chiaro, e nulla lo segnala perché
   non è un errore. `npm run verifica:convenzioni` conta i colori in duro fuori
   da `src/styles/` con un ratchet: si può solo abbassare.
2. **`--navy` è una SUPERFICIE, non un inchiostro.** Per il testo che era navy
   c'è `--heading` (in chiaro *è* `var(--navy)`, al buio è inchiostro chiaro).
   L'unica eccezione è il testo sui fondi ORO, che resta `var(--navy)` in
   entrambi i temi: l'oro è chiaro anche al buio, quindi vuole inchiostro scuro.

| Token | Chiaro | Scuro |
|---|---|---|
| `--surface` / `--card` | `#FAFAF7` / `#ffffff` | `#0E1524` / `#131C2F` |
| `--sky` (guscio) | `#D0EEF9` | `#182643` |
| `--navy` (superficie di marca) | `#0F2044` | `#213154` |
| `--text` / `--text-muted` | `#1A1A2E` / `#6B6B80` | `#E9ECF4` / `#A6AFC4` |
| `--heading` | `var(--navy)` | `#EDF0F7` |
| `--border` | `#E0DDD5` | `#26314C` |
| `--focus` / `--focus-alone` | `var(--navy)` / `#fff` | `var(--gold-light)` / `#0E1524` |

## Breakpoints responsive

| Nome | Range | Hook |
|------|-------|------|
| Mobile | ≤ 640px | `isMobile` |
| Tablet | 641–1024px | `isTablet` |
| Desktop | > 1024px | `isDesktop` |

Navigazione: Desktop → Sidebar collassabile. Tablet/Mobile → BottomNav.

## Modello dati

### Task
```js
{
  id, title, category, priority, status,
  assignees: [memberId],     // [] = coda globale
  client: string|null,       // campo testo libero (NON FK)
  praticaRef: string|null,   // campo testo libero "N° pratica" (es. "PR-2026-001") — NON FK
  dueDate: ISO|null,
  estimatedHours: number,
  description: string,
  comments: [{ user, text, time }],
  deletedAt: ISO|null,       // soft-delete
  completedAt: ISO|null      // data completamento — gestita dal DB (trigger set_task_completed_at), sola lettura lato app
}
```

> ⛔ `dossierId` / `dossier_id` NON ESISTONO PIÙ (rimossi in sessione 24, migration `20260616`). Usare `praticaRef`/`pratica_ref` (testo libero).

### Cliente (CRM)
```js
{
  id: UUID,
  name: string,              // required
  email: string|null,
  phone: string|null,
  address: string|null,
  city: string|null,
  notes: string|null,
  createdAt: ISO
}
```

> ⚠️ `clients` è **condivisa con il modulo Liste viaggio**: `liste_viaggio.client_id`
> è una FK (il TITOLARE) e le liste mostrano `clients.name` come intestazione;
> `lista_beneficiari` aggiunge zero o più COINTESTATARI (stessa FK, es. marito
> e moglie), ciascuno con una propria scheda. `tasks.client_id` è invece una
> copia testuale del nome (nessun vincolo). Rinominare un cliente cambia tutte
> le sue liste e lascia indietro i task; eliminarlo è rifiutato dalla FK se ha
> liste — come titolare o cointestatario — cestino compreso. Regole e
> protezioni in `docs/ANAGRAFICA_E_LISTE.md`.

> ⛔ **Fornitore** e **Pratica di viaggio** (Dossier) sono stati **RIMOSSI DEFINITIVAMENTE** in sessione 24. Non reintrodurli.

### Team member
```js
{
  id, name, role, avatar, color, capacity,
  active: boolean, pending: boolean,
  email: string|undefined, phone: string|undefined,
  photoUrl: string|undefined   // URL pubblica del bucket `avatars` (Users.uploadAvatar), o null
}
```

### Categorie task (mutabili via Admin)
`booking`, `hotel`, `visa`, `client`, `payment`, `marketing`, `supplier`, `admin`, `itinerary`, `transfer`

### Priorità
`critical`, `high`, `medium`, `low`

### Stati task
`todo`, `inprogress`, `awaiting_client`, `awaiting_supplier`, `done`

### Team mock
Marco (Manager, default), Sofia (Senior Agent), Luca (Junior Agent), Giulia (Driver), Roberto (Admin) + 2 pending (Elena, Matteo)

### Clienti mock
Famiglia Rossi (Maldive), Coppia Bianchi (Giappone), Azienda TechCorp (Incentive), Famiglia Marchetti (Caraibi), Liceo Manzoni (gruppo studenti), Sposi Conte (Vietnam)

## Reducer actions disponibili

### View/UI
`SET_VIEW`, `SET_SELECTED_TASK`, `CLEAR_TOAST`, `SET_SEARCH`, `TOGGLE_NOTIF`, `SET_FILTER`, `TOGGLE_SIDEBAR`

### Task CRUD
`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`

### Cestino
`DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`

### Profilo personale (non admin-only)
`UPDATE_OWN_PROFILE`

### Admin Team (ADMIN_ONLY)
`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, `APPROVE_TEAM_MEMBER`, `TOGGLE_TEAM_MEMBER_ACTIVE`, `REMOVE_TEAM_MEMBER`

### Admin Categorie (ADMIN_ONLY)
`ADD_CATEGORY`, `UPDATE_CATEGORY`, `REMOVE_CATEGORY`

### Admin Backup/Settings (ADMIN_ONLY)
`SET_AGENCY_NAME`, `RESTORE_BACKUP`, `CLEAR_ACTIVITY_LOG`

### Bacheca
`ADD_NOTICE`, `UPDATE_NOTICE`, `DELETE_NOTICE`, `TOGGLE_PIN_NOTICE`

### CRM Clienti
`SET_CLIENTS`, `ADD_CLIENT`, `UPDATE_CLIENT`, `DELETE_CLIENT`

> ⛔ Le azioni CRM Fornitori (`*_SUPPLIER`) e CRM Pratiche (`*_DOSSIER`) sono state **rimosse** in sessione 24.

### Altro
`UNDO_LAST_ACTION`, `SET_CURRENT_USER`

## Helper utility (da usare, non duplicare)

```
getMember(id)                    — legge dal TEAM globale
getAssignableTeam()              — agenti attivi e non-pending
formatDate(iso), formatTime(iso) — formattazione date
isOverdue(task), isUrgent(task)  — check scadenze
getDayKey(iso)                   — stringa data
isActiveTask(t)                  — true se non cestinato
getActiveTasks(tasks)            — filtra non-cestinati
getTrashedTasks(tasks)           — filtra cestinati
// src/lib/tasks/nuovoTask.js — l'UNICA forma di un task appena creato (A-2)
nuovoTask(campi)                 — uuid + default + normalizzazione (trim,
                                   vuoto → null, data → ISO, ore > 0). ⛔ La
                                   forma è CHIUSA: le chiavi non previste
                                   vengono scartate. Ogni nuovo percorso di
                                   creazione passa da qui — erano cinque copie
                                   a mano, e le differenze fra loro non erano
                                   scelte (`praticaRef` mancava nell'import,
                                   `recurrence` sopravviveva in un solo punto)
DEFAULT_TASK                     — i default, congelati
useViewport()                    — hook responsive
// src/lib/permissions.js — funzioni pure, `team` esplicito
getRoleType(team, userId)        — "admin"|"manager"|"agent"|"driver"
isAdmin(team, userId), isDriver(team, userId)
canViewTask(team, task, userId)
canEditTask(team, task, userId)
canCreateTaskCategory(team, cat, userId)
canAccessAdmin(team, userId)
canAccessListe(team, userId)     — modulo Liste: rispecchia can_liste() sul DB
                                   (admin|manager|agent AND active AND NOT
                                   pending — M-4 dell'audit del 13 agosto ha
                                   aggiunto pending, che mancava). NON usare
                                   `!isDriver(...)`: erano cinque formulazioni
                                   della stessa regola, divergenti sui ruoli
                                   fuori enum e sugli utenti disattivati
getAvailableCategories(categories, team, userId)
getVisibleTasks(team, tasks, userId)
// src/state/AppDataContext.jsx — le stesse regole, legate allo state React.
// Firme identiche a quelle di lib/permissions.js ma SENZA il primo argomento
// `team`: lo lega il provider. È l'unico modo di accedervi dai componenti.
useTasks()                       — state.tasks (src/state/TasksContext.jsx)
useClients()                     — state.clients (src/state/ClientsContext.jsx)
useAppData()                     — { team, categories, currentUserId,
                                     getMember, getAssignableTeam,
                                     getRoleType, isAdmin, isDriver, isJuniorAgent, isSeniorAgent,
                                     canViewTask, canEditTask, canCreateTaskCategory,
                                     canAccessAdmin, canAccessListe,
                                     getVisibleTasks, getAvailableCategories }
isMyTask(task, userId)
isInGlobalQueue(task)
getNavItemsForUser(userId)       — NAV_ITEMS filtrati per ruolo
```

## Classi CSS (definite in `src/styles/global.css`)

```
.vd-grid-kpi        — griglia KPI, collassa su mobile
.vd-grid-2col       — 2 colonne, collassa a 1 su mobile
.vd-grid-3col       — 3 colonne, collassa
.vd-grid-dash-main  — griglia dashboard principale
.vd-grid-collapse   — 1 colonna su mobile
.vd-hide-mobile     — nasconde ≤640px
.vd-row-wrap        — flex-wrap su mobile
.vd-pad             — padding adattivo (32→18→14)
.vd-bottom-nav      — bottom nav visibile ≤1024px
.vd-main-scroll     — padding-bottom per bottom nav
.vd-campo-fuoco     — bordo oro sul campo a fuoco (-danger: rosso)
```

## Permessi per ruolo

| Azione | Admin | Manager/Agent | Driver |
|--------|-------|---------------|--------|
| Vedere task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Vedere coda globale | ✅ | ✅ | ❌ |
| Modificare task proprie | ✅ | ✅ | ✅ (solo transfer) |
| Creare task (tutte cat.) | ✅ | ✅ | ❌ (solo transfer) |
| Azioni Admin | ✅ | ❌ | ❌ |
| Cestino | ✅ | ❌ | ❌ |

## Struttura componenti attuali (post Phase 2f + Fase 1 CRM)

```
VoyageDesk (export default, ViewportProvider wrapper)
└── VoyageDeskInner
    ├── shell/Topbar
    │   ├── AdvancedSearchPanel (locale)
    │   ├── UserSwitcher → shell/ProfileEditor (+ shell/AccountSicurezza)
    │   └── NotificationsPanel (locale)
    ├── shell/Sidebar (desktop) / shell/BottomNav (mobile/tablet)
    ├── [Vista attiva — renderView switch]
    │   ├── dashboard/Dashboard
    │   │   ├── dashboard/NoticeBoard + dashboard/NoticeEditorModal
    │   │   ├── QueueTab (locale in dashboard/Dashboard)
    │   │   ├── PersonalQueue / UnassignedQueue / OverdueQueue / UrgentOthersQueue (locale)
    │   │   └── Scadenze Prossime + Carico Team (locale)
    │   ├── calendar/CalendarPlanner (mese + settimana + distribuzione + helper iCal)
    │   ├── clients/ClientiView          ← mantenuto (anagrafica clienti)
    │   ├── tasks/Trash + tasks/Archive
    │   └── admin/AdminView (5 tab locale, stili da adminStyles.js)
    ├── tasks/TaskSlideOver
    ├── tasks/TaskCard (TaskCard + TaskRow condivisi da code/archivio/calendario/CRM)
    ├── chat/ChatPanel (orchestratore; il resto in chat/*.js + chat/message/)
    ├── tasks/QuickAddTask
    ├── tasks/bulk/BulkTaskCreator (shell; le 4 tab accanto, in tasks/bulk/)
    ├── shell/FAB
    └── ui/Toast
```

Tutti i componenti sono **moduli separati** in `src/components/`; helper e sub-componenti rimangono **module-local** (non esportati).

## Struttura moduli

```
src/
├── auth/                    AuthContext.jsx, LoginScreen.jsx
├── lib/
│   ├── api.js               Tasks/Notices/Conversations/Messages/Notifications/Users/Clients APIs (Suppliers/Dossiers RIMOSSI sessione 24)
│   ├── bulkImport.js        normalizzazione valori CSV/Excel + auto-mappatura colonne (puro)
│   ├── chiaveCliente.js     LA chiave d'identità cliente + tasksDelCliente (M-4, 25 agosto)
│   ├── tasks/nuovoTask.js   l'UNICA forma di un task appena creato (A-2, 23 agosto)
│   ├── tasks/categoriaDaTitolo.js  la tassonomia keyword→categoria dell'agenzia:
│   │                        regola di DOMINIO, non del form che la usa (B-2, 25 agosto)
│   ├── clientId.js          UUID per tab (origin-tagging realtime)
│   ├── mappers.js           DB ↔ camelCase (fromDbClient/toDbClient, fromDbNotification; Supplier/Dossier RIMOSSI sessione 24)
│   ├── supabase.js
│   ├── taskConstants.js     PRIORITIES/STATUSES/STATUS_*/NOTICE_COLORS/TASK_TEMPLATES (Phase 2a)
│   ├── taskUtils.js         formatDate/formatTime/isUrgent/isMyTask/... (Phase 2a)
│   ├── xlsx.js              loadXLSX() lazy loader (Phase 2f)
│   └── mentions.js          findMentions() — parser @menzioni (caveat #2, gemello DB)
├── hooks/                   (sessione 18)
│   ├── useDebouncedTableSubscription.js   idratazione+subscribe realtime debounced (caveat #10)
│   └── useSyncedDispatch.js               reducer + persistenza Supabase (orchestratore)
├── state/                   (Phase 2b–2d)
│   ├── mockData.js          INITIAL_TEAM/CATEGORIES/TASKS/NOTICES + MOCK_NOTIFICATIONS
│   ├── AppDataContext.jsx   team/categorie/utente + permessi per i componenti (useAppData)
│   ├── DispatchContext.jsx  il dispatch sincronizzato per i componenti (useDispatch) — M-2, 25 agosto
│   ├── persistence.js       registry action → operazione Supabase (guard/normalize/persist/rollback)
│   ├── registroScritture.js IL contratto dei due registry a tabella: vocabolario delle entry,
│   │                        le due famiglie (ottimistico / conferma prima) e le primitive
│   │                        dell'esecutore — esito, testo d'errore, i due toast (M-1, 25 agosto)
│   ├── visteRiservate.js    quali viste richiedono un ruolo, come TABELLA: erano tre
│   │                        `if` copiati in SET_VIEW più due condizioni scritte a mano
│   │                        in SET_CURRENT_USER, già disallineate fra loro
│   └── reducer.js           baseReducer / reducer / makeInitialState / LOGGED_ACTIONS / ADMIN_ONLY
├── components/              (Phase 2e + 2f — ESTRAZIONE COMPLETA + Fase 1 CRM)
│   ├── errors/              i tre error boundary + la loro UNICA implementazione (M-3, 25 agosto)
│   │   ├── creaErrorBoundary.jsx  lifecycle condiviso: codice di segnalazione, log, riarmo su chiave
│   │   ├── ErrorBoundary.jsx      primo livello (main.jsx/AuthGate) — via d'uscita: ricarica
│   │   ├── ViewErrorBoundary.jsx  la sola vista attiva — riarmo su `viewKey`, uscita: Dashboard
│   │   └── OverlayErrorBoundary.jsx  i modali lazy — riarmo su `resetKey`, uscita: chiudi
│   ├── ui/                  trasversale: nessuna conoscenza del dominio
│   │   ├── Viewport.jsx     ViewportContext / useViewport / ViewportProvider
│   │   ├── CropModal.jsx    ritaglia un'immagine e non sa di cosa sia
│   │   ├── Avatar.jsx
│   │   ├── PriorityBadge.jsx
│   │   ├── CategoryChip.jsx
│   │   ├── StatusBadge.jsx
│   │   ├── Toast.jsx
│   │   └── MentionText.jsx  evidenzia @menzioni come chip (caveat #2)
│   ├── tasks/                (B-1, 25 agosto: `modals/` e `views/` non esistono più)
│   │   ├── TaskSlideOver.jsx     i CAMPI del task; assegnatari e commenti hanno un file loro
│   │   ├── TaskAssegnatari.jsx / TaskCommenti.jsx / TaskAttachments.jsx / TaskHistoryPanel.jsx
│   │   ├── TaskCard.jsx / TaskRow.jsx / CategoryPill.jsx / SwipeActions.jsx
│   │   ├── QuickAddTask.jsx      creazione rapida (FAB, scorciatoia `K`)
│   │   ├── Archive.jsx / Trash.jsx / RipristinaTaskModal.jsx  le due viste storiche
│   │   └── archiveFilters.js     filtro per periodo, condiviso dalle due
│   ├── tasks/bulk/
│   │   ├── BulkTaskCreator.jsx  shell: scelta modalità + tab bar + guardia "non salvato"
│   │   ├── ManualTab.jsx / DuplicateTab.jsx / ImportTab.jsx / TemplateTab.jsx
│   │   ├── RowAttachments.jsx  allegati di riga (upload dopo la persistenza)
│   │   └── bulkStyles.js       stili condivisi dalle 4 tab
│   ├── dashboard/
│   │   ├── Dashboard.jsx (le code sono in dashboard/queues/)
│   │   ├── NoticeBoard.jsx
│   │   └── NoticeEditorModal.jsx
│   ├── calendar/
│   │   ├── CalendarPlanner.jsx    sceglie la vista e la naviga, non la disegna
│   │   ├── CalendarMonthGrid.jsx / CalendarWeekGrid.jsx / CalendarDayGrid.jsx
│   │   └── CalendarAgentLoad.jsx  «chi è carico questa settimana» (M-5, 25 agosto)
│   ├── chat/
│   │   ├── ChatPanel.jsx        orchestratore: navigazione, ponte Supabase, context
│   │   ├── ConversationView.jsx / ConversationList.jsx / NewConversationView.jsx
│   │   ├── MessageComposer.jsx  allegati, template, microfono, invio
│   │   ├── ForwardPicker.jsx
│   │   ├── chatContext.js       ChatContext + useChatContext
│   │   ├── (la presenza è in lib/presenza.js — A-3, la legge anche l'Admin)
│   │   ├── chatFormat.js        orari, nome conv., ultimo messaggio, getUnreadCount
│   │   ├── chatReactions.js     emoji + reazioni recenti (localStorage + DB)
│   │   ├── chatFiles.js         limite upload, classificazione allegati
│   │   ├── chatReducers.js      convViewReducer + chatPanelReducer
│   ├── chatCommands.js      scritture chat: stato locale + persistenza (comandi espliciti)
│   │   └── message/             ChatMessage, MessageTextContent, ReactionPicker,
│   │                            VoicePlayer, VoiceRecorder
│   ├── tasks/
│   │   ├── TaskSlideOver.jsx
│   │   └── TaskCard.jsx         TaskCard (card); TaskRow (riga) e CategoryPill in file propri (B-3), entrambi memo
│   ├── admin/
│   │   ├── AdminView.jsx (contiene 5 tab locali)
│   │   └── adminStyles.js (13 costanti stile consolidate)
│   ├── clients/
│   │   └── ClientiView.jsx              ← anagrafica clienti (mantenuta)
│   └── shell/               il guscio dell'app
│       ├── Topbar.jsx / Sidebar.jsx / BottomNav.jsx / FAB.jsx / NavBadge.jsx
│       ├── UserSwitcher.jsx / OfflineBanner.jsx / AdminRollbackBanner.jsx
│       └── ProfileEditor.jsx + AccountSicurezza.jsx  il profilo dell'utente loggato
├── VoyageDesk.jsx           Shell di orchestrazione (hydration solo Clienti; sessione 24)
└── main.jsx
```

## Note tecniche

1. **Architettura root**: `VoyageDesk` avvolge `VoyageDeskInner` in `<ViewportProvider>`: ogni componente con `useViewport()` sta lì dentro.
2. **Nessuna chiamata a modelli AI**: la chat è interna al team e passa da Supabase.
3. **Due misure per la dimensione di un file**: `max-lines` (500, commenti esclusi) e il tetto fisico di `verifica:convenzioni` (850, commenti compresi).
4. **Le notifiche nascono solo lato server** (trigger o funzioni `SECURITY DEFINER`): la RLS vieta l'insert dal client.
5. **activityLog**: max 100 voci, poi taglia le più vecchie. **Backup JSON**: Admin → Import/Export, il ripristino sovrascrive.
6. **CRM**: solo Clienti. Fornitori e Pratiche sono stati rimossi: non ripristinarli.

Roadmap storica e note per esteso: `CLAUDE_DETTAGLI.md`. Piano corrente: `docs/ROADMAP.md`.
