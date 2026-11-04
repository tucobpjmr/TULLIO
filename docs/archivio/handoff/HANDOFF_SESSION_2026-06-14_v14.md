# HANDOFF — Sessione TULLIO Fase 1 CRM
**Data:** 14 giugno 2026 (sessione 19)
**Sessione precedente:** sessione 18 ha chiuso Step P Phase 2g (code-splitting) e i caveat #10/#18/#3/#8/#2/#25 (PR #41–#47); handoff v13.
**Per:** Claude Code / Claude Cowork (prossima sessione 20)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-14_v13.md` (sessione 18) per Phase 2g.

---

## 0. TL;DR (60 secondi)

- ✅ **Mergeati in `main`** (squash, ordine): #46 (caveat #2 — @menzioni), #47 (caveat #25 — profilo persistente), #48 (docs v13 + roadmap).
- ✅ **Fase 1 CRM completa** (PR #49, draft, branch `claude/fase1-crm`): Anagrafica Clienti, Fornitori, Pratiche di viaggio — UI + API + mappers + reducer + sidebar + wiring VoyageDesk.
- ✅ **DB trigger auto-numerazione** pratiche: `dossiers_auto_number` → `PR-YYYY-NNN` via sequence. Migration `20260614_fase1_dossier_autonumber.sql` applicata in prod e versionata nel repo.
- ✅ **Build verde**: `dist/assets/index-*.js 245.71 kB │ gzip: 58.15 kB` (+7.25 kB gz rispetto Phase 2g — 3 nuove viste).
- ⏳ **Da mergeare**: #49 (Fase 1 CRM) → #50 (questo docs). Poi Fase 1 completamento: Collegamento Task ↔ Pratica + DossierSuppliers.
- 🚧 **Prossimo lavoro**: Collegamento Task ↔ Pratica (`QuickAddTask`/`TaskSlideOver` con dossier selector), poi Fase 2 operatività.

---

## 1. Cosa è stato fatto in sessione 19

### Merge PR #46, #47, #48

Le 3 PR draft rimanenti dalla sessione 18 sono state mergeate in `main` (squash) nell'ordine:
1. **#46** (caveat #2 — @menzioni robuste commenti + chat, DB già live via MCP)
2. **#47** (caveat #25 — profilo persistente su Supabase)
3. **#48** (docs: handoff v13 + changelog v2.0-dev + roadmap aggiornata)

### DB — Trigger auto-numerazione pratiche

Migration: `supabase/migrations/20260614_fase1_dossier_autonumber.sql`

```sql
CREATE SEQUENCE IF NOT EXISTS dossier_number_seq START 1;
CREATE OR REPLACE FUNCTION generate_dossier_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL OR NEW.number = '' THEN
    NEW.number := 'PR-' || to_char(CURRENT_DATE, 'YYYY') || '-' || lpad(nextval('dossier_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS dossiers_auto_number ON dossiers;
CREATE TRIGGER dossiers_auto_number
  BEFORE INSERT ON dossiers
  FOR EACH ROW EXECUTE FUNCTION generate_dossier_number();
```

Le tabelle `clients`, `suppliers`, `dossiers`, `dossier_suppliers` e le policy RLS erano già presenti e complete nel DB. Il trigger era l'unico pezzo mancante.

### API layer — `src/lib/api.js`

Nuovi oggetti (dopo il blocco `Notifications`):

```js
Clients   — list / get / create / update / remove
Suppliers — list / get / create / update / remove
Dossiers  — list({ join: "*, clients(id,name,email,phone)" }) / get({ join profondo }) / create / update / remove
DossierSuppliers — list(dossierId) / add / remove
```

**Nota pattern**: le tabelle CRM non hanno la colonna `origin_client`, quindi **non** usano `withOrigin()` (a differenza di tasks/notices/chat che hanno realtime subscription).

### Mappers — `src/lib/mappers.js`

Prima di `fromDbNotification`:
- `fromDbClient(row)` → `{id, name, email, phone, address, city, notes, createdAt}`
- `toDbClient(client)` → `{name, email, phone, address, city, notes}`
- `fromDbSupplier(row)` → aggiunge `category`, `country`
- `toDbSupplier(supplier)`
- `fromDbDossier(row)` → `{id, number, title, status, clientId, client: fromDbClient(row.clients), destination, departureDate, returnDate, paxAdults, paxChildren, budgetTotal, notes, createdBy, createdAt, updatedAt}`
- `toDbDossier(dossier)` → `{title, status, client_id, destination, departure_date, return_date, pax_adults, pax_children, budget_total, notes}`

**Nota**: `toDbDossier` non include `id` né `number` — l'id è generato da Supabase (UUID), il `number` è generato dal trigger DB.

### Reducer — `src/state/reducer.js`

Nuove azioni in `baseReducer` (prima di `"SHOW_TOAST"`):

```
SET_CLIENTS, ADD_CLIENT, UPDATE_CLIENT, DELETE_CLIENT
SET_SUPPLIERS, ADD_SUPPLIER, UPDATE_SUPPLIER, DELETE_SUPPLIER
SET_DOSSIERS, ADD_DOSSIER, UPDATE_DOSSIER, DELETE_DOSSIER
```

`makeInitialState` aggiornato: aggiunge `clients: [], suppliers: [], dossiers: []`.

### Componenti UI

**`src/components/clients/ClientiView.jsx`** (~200 righe):
- `ClienteCard`: avatar iniziali (sfondo navy), nome/città, link email/telefono (mailto/tel), badge n° pratiche collegate, edit/delete.
- `ClienteModal`: nome (required), email, phone, address, city, notes — griglia 2 colonne.
- Ricerca per nome/email/città. Layout a griglia, responsive via `useViewport`.
- Conteggio pratiche via `state.dossiers.filter(d => d.clientId)`.

**`src/components/suppliers/FornitoriView.jsx`** (~220 righe):
- `SUPPLIER_CATEGORIES`: hotel / volo / transfer / tour_operator / assicurazione / crociera / altro.
- `FornitoreModal`: nome, categoria (select), email, phone, city, country, address, notes.
- Filtro per categoria (select) + ricerca testo.

**`src/components/dossiers/PraticheView.jsx`** (~330 righe):
- `DOSSIER_STATUSES`: bozza / confermata / in_corso / completata / annullata (con colore/bg).
- `PraticaCard`: numero (small), titolo, status badge, cliente, destinazione, date 🛫/🛬, pax, budget €, conteggio task.
- `PraticaModal`: titolo (required), select cliente da `state.clients`, destinazione, date partenza/ritorno, pax adulti/bambini, budget totale, note.
- `PraticaDetail` (slide-over): header navy, cambio status live, griglia info, lista task collegati (filtra `state.tasks` per `t.dossierId === dossier.id && !t.deletedAt`), bottone elimina.
- KPI badge per ogni status, filtro a chip.

### Wiring — `src/components/shell/Sidebar.jsx`

`NAV_ITEMS` aggiornato da 5 a 8 voci: aggiunti `clienti` (👤), `fornitori` (🤝), `pratiche` (📁) con `roles: ["admin", "manager", "agent"]`. I driver non vedono le viste CRM.

### Wiring — `src/VoyageDesk.jsx`

- Import: `Clients as ClientsAPI, Suppliers as SuppliersAPI, Dossiers as DossiersAPI` da `api.js`.
- Import: `fromDbClient, toDbClient, fromDbSupplier, toDbSupplier, fromDbDossier, toDbDossier` da `mappers.js`.
- Import: `ClientiView, FornitoriView, PraticheView` (import normali, non lazy — componenti non pesanti).
- `useEffect` per idratazione CRM al mount (dopo le subscription realtime):

```js
useEffect(() => {
  if (!useSupabase) return;
  let cancelled = false;
  Promise.all([ClientsAPI.list(), SuppliersAPI.list(), DossiersAPI.list()])
    .then(([cRes, sRes, dRes]) => {
      if (cancelled) return;
      if (!cRes.error) rawDispatch({ type: "SET_CLIENTS", payload: (cRes.data || []).map(fromDbClient) });
      if (!sRes.error) rawDispatch({ type: "SET_SUPPLIERS", payload: (sRes.data || []).map(fromDbSupplier) });
      if (!dRes.error) rawDispatch({ type: "SET_DOSSIERS", payload: (dRes.data || []).map(fromDbDossier) });
    }).catch(e => console.error("[CRM] hydration", e));
  return () => { cancelled = true; };
}, [useSupabase]);
```

- Dispatch cases CRM (dopo `TOGGLE_PIN_NOTICE`):
  - `ADD_CLIENT` / `UPDATE_CLIENT` / `DELETE_CLIENT` → `ClientsAPI.create/update/remove`, fire-and-forget + toast su errore.
  - `ADD_SUPPLIER` / `UPDATE_SUPPLIER` / `DELETE_SUPPLIER` → `SuppliersAPI`.
  - `ADD_DOSSIER`: async — dopo `DossiersAPI.create` chiama `rawDispatch({type:"UPDATE_DOSSIER", payload:{id, number: res.data.number}})` per backfillare il numero generato dal trigger DB.
  - `UPDATE_DOSSIER` / `DELETE_DOSSIER` → `DossiersAPI`.
- `renderView` esteso con `case "clienti"`, `case "fornitori"`, `case "pratiche"`.

---

## 2. Struttura aggiornata (delta vs v13)

Nuovi file in sessione 19:
```
supabase/migrations/
└── 20260614_fase1_dossier_autonumber.sql   🆕 trigger PR-YYYY-NNN

src/
├── components/
│   ├── clients/
│   │   └── ClientiView.jsx                 🆕 Anagrafica Clienti
│   ├── suppliers/
│   │   └── FornitoriView.jsx               🆕 Anagrafica Fornitori
│   └── dossiers/
│       └── PraticheView.jsx                🆕 Pratiche di viaggio

src/lib/api.js        ✏️ +Clients/Suppliers/Dossiers/DossierSuppliers
src/lib/mappers.js    ✏️ +fromDb*/toDb* per Client/Supplier/Dossier
src/state/reducer.js  ✏️ +azioni CRM + makeInitialState
src/components/shell/Sidebar.jsx  ✏️ +clienti/fornitori/pratiche NAV_ITEMS
src/VoyageDesk.jsx    ✏️ +import CRM, +useEffect hydration, +dispatch CRM, +renderView cases
```

---

## 3. Stato corrente

### Branch / PR

| Branch | PR | Stato | Mergeable |
|--------|----|-------|-----------|
| `main` | — | su commit `25f1e23` post #48 | — |
| `claude/fase1-crm` | #49 | **Draft** | ✅ clean |
| `claude/fase1-docs` | #50 | **Draft** | ✅ clean |

**Ordine di merge**: #49 → #50 (squash, come sempre).

### Build

```
dist/assets/index-*.js    245.71 kB │ gzip: 58.15 kB
117 moduli trasformati.
✅ Build verde.
```

### DB (produzione)

Tutte le migrazioni applicate e versionate:
- Tabelle CRM + RLS: già presenti (sessioni precedenti).
- `20260614_fase1_dossier_autonumber.sql`: trigger auto-numerazione ✅ live in prod.

---

## 4. Cosa fare nella prossima sessione (20)

### Priorità 1 — Merge PR #49 e #50
Fare squash merge in ordine: #49 (CRM code) → #50 (docs).

### Priorità 2 — Collegamento Task ↔ Pratica
**File da modificare:**
- `src/components/modals/QuickAddTask.jsx`: aggiungere un campo `<select>` "Pratica" che popola `tasks.dossier_id`. Prendere `state.dossiers` (filtrare per status ≠ annullata), mostrare `dossier.number + " — " + dossier.title`.
- `src/components/tasks/TaskSlideOver.jsx`: nella sezione dettagli, aggiungere "Pratica collegata" con select o chip cliccabile (apre `PraticheView` filtrata sulla pratica).
- `src/VoyageDesk.jsx`: dispatch `UPDATE_TASK` con `dossierId` e `dossier_id` deve essere incluso nella patch Supabase.
- `src/lib/mappers.js`: verificare che `fromDbTask` legga `dossier_id` → `dossierId` (dovrebbe già farlo).

**Nota tecnica**: `tasks.client_id` è un campo testo libero (legacy), NON un UUID FK su `clients`. Il collegamento reale è `tasks.dossier_id → dossiers.client_id`. Non toccare `tasks.client_id` a meno di una migration esplicita.

### Priorità 3 — DossierSuppliers (fornitori della pratica)
Nella `PraticaDetail` (slide-over di `PraticheView`), aggiungere sezione "Fornitori":
- `DossierSuppliers.list(dossierId)` per caricare i fornitori esistenti.
- Select per aggiungere un fornitore esistente (`state.suppliers`), con campo "note" (es. nome hotel/tour).
- Bottone rimozione per ogni fornitore collegato.
- Nessuna nuova migration necessaria (tabella `dossier_suppliers` già presente con RLS).

### Priorità 4 (quick win) — Filtro pratica in Ricerca avanzata
Il roadmap nota: "dopo questa fase, aggiungere il filtro numero di pratica nella Ricerca avanzata". In `Topbar` → `AdvancedSearchPanel`: aggiungere chip/filtro `dossierId` che filtra i task della vista attiva.

---

## 5. Note tecniche / gotcha

### `tasks.client_id` vs `tasks.dossier_id`
- `tasks.client_id`: campo `text` libero legacy (nome cliente scritto a mano), NON FK UUID.
- `tasks.dossier_id`: UUID FK → `dossiers.id` — questo è il collegamento reale.
- In `PraticheView` il conteggio task usa `t.dossierId === dossier.id` (camelCase, da mapper).
- Non confondere `fromDbTask`'s `client: row.client_id` (free text) con `dossierId: row.dossier_id` (UUID).

### Nessun realtime su tabelle CRM
Le tabelle CRM (`clients`, `suppliers`, `dossiers`) usano idratazione one-shot (`Promise.all` al mount), non subscribe realtime. Questo è intenzionale: la lista clienti/fornitori/pratiche cambia raramente; il realtime aggiungerebbe complessità inutile. Se si vuole refresh: `dispatch({type:"SET_VIEW",payload:"clienti"})` per ora forzare un re-mount, o aggiungere un pulsante "Aggiorna" che chiama la hydration manualmente.

### `ADD_DOSSIER` — backfill numero
Il DB trigger genera `number = PR-YYYY-NNN` al momento dell'INSERT. Il client:
1. Dispatcha `ADD_DOSSIER` con `number: ""` (ottimistico, mostra "" o "-" nella card fino al ritorno del DB).
2. `DossiersAPI.create` ritorna la riga inserita (`.select().single()`).
3. Un secondo `rawDispatch({type:"UPDATE_DOSSIER", payload:{id, number}})` aggiorna il numero in stato.

### Nuovo provider struttura `src/components/`
```
src/components/
├── clients/     🆕 ClientiView.jsx
├── suppliers/   🆕 FornitoriView.jsx
└── dossiers/    🆕 PraticheView.jsx
```
Queste directory non avevano file precedenti; ora create da questo PR.

---

## 6. Caveat aperti (aggiornato)

| # | Stato | Descrizione |
|---|-------|-------------|
| #1 | ✅ chiuso | Auto-assegnazione genera notifica → risolto in Step J |
| #2 | ✅ chiuso | @menzioni robuste → PR #46, DB live |
| #3 | ✅ chiuso | Heartbeat 30s → PR #44 |
| #4 | ✅ chiuso | RLS realtime users → non-issue |
| #5 | ✅ chiuso | Echo realtime DELETE → Step Q |
| #6 | ✅ chiuso | Toast errori reactions/markRead → Step Q |
| #7 | ✅ chiuso | Storage file chat → Step M |
| #8 | ✅ chiuso | Calendar weekOffset → PR #45 |
| #9 | ✅ chiuso | Task link via task_ref UUID → Step K |
| #10 | ✅ chiuso | useDebouncedTableSubscription → PR #42 |
| #15 | ✅ chiuso | Refactor monolite Step P → Phase 2g |
| #16 | ✅ chiuso | Logout UI → Step O |
| #17 | ✅ chiuso | TEAM seed locale → Step Q |
| #18 | ✅ chiuso | Mojibake CSV → PR #43 |
| #19 | ✅ chiuso | Drift repo↔DB → Step R |
| #20 | ✅ chiuso | Index messages(conversation_id) → già presente |
| #21 | ✅ chiuso | Race init realtime → generation counter Step Q |
| #22 | ✅ chiuso | Toast errori reactions/markRead → Step Q |
| #23 | ✅ chiuso | withOrigin parziale → Step Q |
| #24 | ✅ chiuso | user_contacts email/phone → Step S |
| #25 | ✅ chiuso | Profilo persistente → PR #47 |
| #26 | 🆕 **aperto** | Collegamento Task ↔ Pratica: `tasks.dossier_id` non popolato da QuickAddTask/TaskSlideOver. Il modello dati è pronto (colonna FK e `dossierId` in mapper), manca solo la UI per selezionare la pratica. |
| #27 | 🆕 **aperto** | DossierSuppliers: nessuna UI per collegare fornitori a una pratica (tabella presente in DB, API pronta, solo il pannello UI manca in `PraticaDetail`). |
