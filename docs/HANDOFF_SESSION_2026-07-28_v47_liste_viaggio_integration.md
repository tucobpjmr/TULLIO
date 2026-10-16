# HANDOFF — Sessione 2026-07-28 v47
### Integrazione modulo "Liste Viaggio" in VoyageDesk — Fase 1 (DB) chiusa, Fase 2 (UI React) da iniziare

---

## Stato attuale

**PR #129 mergiata** su `main` (squash, commit `f4c7906`, 2026-07-28 23:03 CET).
Contiene **solo** le migrazioni Supabase — nessun componente React, nessuna voce
di navigazione. L'app in produzione non espone ancora il modulo Liste.

Il progetto Supabase (`vmxvnxsqfisucugcpqlc`, alias `tullio`) è condiviso da
sempre tra VoyageDesk e l'app separata `liste-buoni-viaggio` (stesso DB,
stessa anagrafica clienti/utenti). Questa fase ha allineato la repo TULLIO
allo schema realmente applicato sul DB e ne ha ristretto l'accesso ai ruoli
di VoyageDesk. La Fase 2 (questa sessione) porta il modulo nella UI React.

---

## Cosa è stato fatto (Fase 1 — PR #129)

| File | Contenuto |
|---|---|
| `supabase/migrations/20260728190000_sync_modulo_liste_viaggio.sql` | Prima rappresentazione fedele dello schema `liste_viaggio`/`movimenti_lista`/`lista_history`, vista `liste_saldi`, trigger, RPC (`crea_lista`, `modifica_lista`, `registra_movimento_lista`, `elimina_lista_definitivamente`, `importa_backup`, `reset_completo`, `fmt_eur`, `mov_snapshot`), ottenuta per **introspezione diretta del DB live** (non copiata dalla repo `liste-buoni-viaggio`, la cui cronologia migrazioni è divergente — vedi nota sotto). Idempotente, non tocca `clients`/`users`. |
| `supabase/migrations/20260728190100_hardening_liste_viaggio_ruoli.sql` | Hardening ruoli (decisioni confermate dall'utente, vedi sotto). |

### Decisioni confermate dall'utente (vincolanti per la Fase 2)

1. **Il modulo Liste è precluso al ruolo `driver`.** Admin/manager/agent hanno
   pari accesso in lettura/scrittura. Applicato via RLS su tutte le tabelle
   del modulo — qualunque componente React deve rispettare lo stesso gating
   lato client (oltre alla RLS lato DB, che è comunque l'unica garanzia reale).
2. **`reset_completo`** (hard delete totale di liste/movimenti/storico) resta
   disponibile ma **solo per admin**.
3. **`elimina_lista_definitivamente`** e **`importa_backup`** (SECURITY
   DEFINER, bypassano la RLS) sono ora ristrette allo stesso perimetro del
   punto 1 — prima della PR chiunque autenticato e attivo, incluso un driver,
   poteva svuotare il cestino o fondere un backup esterno.
4. **Validazione**: nessuna modifica applicata "a scatola chiusa". Le due
   migrazioni sono state testate con dry-run transazionale
   (`BEGIN...ROLLBACK`) sul progetto Supabase reale, impersonando un utente
   per ruolo via `SET LOCAL request.jwt.claim.sub`. Tabella risultati nel
   corpo della PR #129.

### Gap noti, non bloccanti (documentati nei commenti della migrazione di sync)

- Assenza di trigger anti-hard-delete su `liste_viaggio`/`movimenti_lista`
  (a differenza di quanto fa `liste-buoni-viaggio/migrations/004`).
- Assenza di trigger di immutabilità su `lista_history`.
- Rischio pratico basso: non esistono policy RLS UPDATE/DELETE su queste
  tabelle oltre a quelle già introdotte, quindi la superficie d'attacco è
  già limitata. Da valutare se aggiungerli in una migrazione successiva,
  non urgente per la Fase 2.

### ⚠️ Nota sulla repo sorgente `liste-buoni-viaggio`

`migrations/004_liste_viaggio_schema.sql` in quella repo contiene un avviso
esplicito: **non applicarlo al progetto `tullio`**. Il file 004 sovrascrivere
la tabella `users` minimale che si aspetta quel frontend (id+name), mentre il
progetto reale ha uno schema `users` molto più ricco con RLS curate. È
conservato solo come riferimento storico/deploy greenfield. **Usa sempre lo
schema sincronizzato in `20260728190000_sync_modulo_liste_viaggio.sql` come
fonte di verità**, non i file della repo `liste-buoni-viaggio`.

---

## Cosa fare in questa sessione (Fase 2 — porting React)

### Obiettivo
Portare il modulo Liste da SPA vanilla JS/HTML (`liste-buoni-viaggio/index.html`,
~63KB, un unico file) a componenti React 18 dentro `src/components/liste/` in
questa repo, riusando `@supabase/supabase-js` già configurato
(`src/lib/supabase.js`).

### Punti di ingresso UI (decisi con l'utente — NON aggiungere voci di sidebar/bottom-nav)

1. **Bottone nell'header della Dashboard** (`src/components/dashboard/Dashboard.jsx:975`,
   dentro il blocco `justifyContent: "space-between"` che oggi ha un solo
   figlio — il lato destro è libero). `onClick` → `dispatch({ type: "SET_VIEW", payload: "liste" })`.
   Gating: `role !== "driver"` (stesso pattern di `showGlobalQueue`/`showUrgent`
   in quel file, righe 914/943).
2. **Tab dentro la scheda cliente** (`src/components/clients/ClientiView.jsx`,
   vicino a `ClienteTaskPanel`, riga ~379 — stesso pattern di apertura on-select
   di `selectedClient`).

**Esplicitamente NON fare**: non toccare `src/components/shell/Sidebar.jsx`
(`NAV_ITEMS`, `Sidebar`, `BottomNav`). L'utente ha scelto di non aggiungere una
voce dedicata lì per non affollare la bottom bar mobile (già 7-8 voci a
seconda del ruolo, sotto la soglia di 44px per touch target con una voce in
più).

### Routing

- Aggiungere `case "liste": return <ListeViaggio state={state} dispatch={dispatch} />;`
  allo switch in `src/VoyageDesk.jsx:1422` (`renderView`).
- **Guardia stato**: nessuna voce di nav punta a `"liste"`, quindi
  `state.activeView` può restare bloccato lì se l'utente attivo cambia (stesso
  problema già risolto per `"admin"` in `src/state/reducer.js:110`, case
  `SET_VIEW`/switch utente). Aggiungere lo stesso guard: se
  `activeView === "liste"` e il nuovo utente è `driver`, tornare a
  `"dashboard"`.
- **Breadcrumb "← Dashboard"** in cima al modulo: senza una voce di sidebar
  attiva, su mobile l'utente non ha un segnale visivo di "dove sono". Il modulo
  deve fornire la propria via d'uscita esplicita (oltre al logo aeroplano in
  Topbar che porta comunque alla Dashboard).

### Stile — NON adottare la palette navy/oro di Tullio nel contenuto

Decisione esplicita dell'utente: il modulo mantiene il proprio stile attuale
(blu `#0F4C81`/bianco, font Inter, impaginazione "foglio cartaceo" con
`table.mov`). **Solo la chrome di navigazione** (bottone in Dashboard,
breadcrumb, eventuale badge) segue lo stile Tullio (navy/oro, Playfair per i
titoli, classi `vd-*`).

Il CSS sorgente (`liste-buoni-viaggio/index.html`, dentro `<style>`) **non è
namespacizzato** e collide con le variabili globali di Tullio se copiato
tal quale:

| Variabile | Liste | Tullio (`src/VoyageDesk.jsx:91-113`) |
|---|---|---|
| `--surface` | `#FFFFFF` | `#FAFAF7` |
| `--border` | `#E3E6EA` | `#E0DDD5` |

Inoltre il CSS liste stila elementi nudi (`body`, `button`, `input,select,textarea`)
che sovrascriverebbero il font DM Sans e le dimensioni globali di Tullio.

**Prima di copiare il CSS**:
1. Rinominare tutte le variabili con prefisso `--lv-*` (es. `--lv-primary`,
   `--lv-surface`, `--lv-border`…) — mai `--primary`/`--surface`/`--border` nudi.
2. Prefissare le classi generiche: `.lv-card`, `.lv-btn`, `.lv-modal`,
   `.lv-badge`, `.lv-toolbar`, `.lv-foglio`, tabella `.lv-mov`… (le classi
   `.card`, `.btn`, `.modal`, `.badge`, `.toolbar` di oggi collidono per nome,
   anche se non per valore, con qualunque futura classe generica di Tullio).
3. Scoping totale sotto un contenitore radice `.lv-root`: i selettori nudi
   `body`, `button`, `input,select,textarea` diventano `.lv-root`,
   `.lv-root button`, `.lv-root input, .lv-root select, .lv-root textarea`.
4. L'import del font Inter va caricato solo nello scope del modulo (non in
   `<head>` globale), es. dentro il componente React con un tag `<style>`
   locale o un file CSS module dedicato.
5. Il toast `#toast` del modulo liste va sostituito con il componente React
   esistente `src/components/ui/Toast.jsx` (già usato da tutta l'app via
   `state.toast`/`dispatch`) — non portare l'implementazione DOM-diretta.

Verificato in questa sessione: Tullio oggi usa **solo** classi `vd-*` più
`fade-in`/`hover-lift`/`skeleton`/`playfair` — zero collisioni di classe
allo stato attuale, ma sono nomi generici da non lasciare "nudi" in una
codebase condivisa.

### Riferimenti tecnici Tullio (utili per orientarsi rapidamente)

- Router principale: `src/VoyageDesk.jsx` (1526 righe) — `renderView()` è lo
  switch su `state.activeView`, riga 1422.
- Stato globale/reducer: `src/state/reducer.js` — case `SET_VIEW` riga 82,
  pattern guardia ruolo-vista riga 110 (da replicare per `driver`/`liste`).
- Tema/variabili CSS globali: `src/VoyageDesk.jsx:91-160` (dentro `FontLoader`).
- Sidebar/bottom-nav: `src/components/shell/Sidebar.jsx` (**non modificare**
  per questa fase).
- Dashboard: `src/components/dashboard/Dashboard.jsx` (1113 righe) — header
  con slot libero riga 975.
- Scheda cliente: `src/components/clients/ClientiView.jsx` (435 righe) —
  pattern `selectedClient`/pannello contestuale riga 246, 379.
- Client Supabase: `src/lib/supabase.js`; pattern chiamate API/RPC:
  `src/lib/api.js` (581 righe) — usare questi pattern per le RPC del modulo
  liste (`crea_lista`, `registra_movimento_lista`, ecc.) invece di
  `fetch`/chiamate dirette come nella SPA vanilla.
- Stile componenti UI riusabili: `src/components/ui/` (`Avatar`, `StatusBadge`,
  `PriorityBadge`, `Toast`, `PasswordField`…) — verificare se qualcuno è
  riusabile per il modulo liste prima di crearne di nuovi.

### Non ancora fatto (esplicitamente fuori scope, da non dimenticare più avanti)

- Il deploy separato di `liste-buoni-viaggio` **resta attivo**: non va
  disattivato finché il modulo non è verificato stabile dentro VoyageDesk.
- Test manuale post-merge PR #129 ancora da fare: verificare che gli utenti
  `driver` esistenti non abbiano regressioni (non dovrebbero comunque essere
  esposti al modulo Liste, ma vale la pena una verifica in app reale).
- I due gap RLS/trigger elencati sopra (hard-delete guard, immutabilità
  history) non sono stati portati dalla migrazione `004` della repo sorgente.

### Workflow

- Ramo di sviluppo: repo `tucobpjmr/TULLIO`, branch dedicato per feature
  (mai push diretto su `main`), PR come draft finché non pronta.
- Confermato con l'utente: sviluppo su `tucobpjmr/TULLIO` (non più su
  `liste-buoni-viaggio`, che verrà archiviata solo a migrazione completata).
