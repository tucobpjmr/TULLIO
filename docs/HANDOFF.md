# 🤝 HANDOFF — VoyageDesk (sessioni 8 → 11)

> Documento di consegna per Claude Code e per chiunque continui lo sviluppo (cowork). Leggi questo file **prima** di aprire il codice. È il punto di partenza più aggiornato.

**Repo:** `tucobpjmr/TULLIO` · **Branch attivo:** `claude/peaceful-einstein-3fdmrp` · **PR aperta:** [#12](https://github.com/tucobpjmr/TULLIO/pull/12) (draft) · **Preview:** Vercel auto-deploy dal branch.

---

## 1. Cos'è VoyageDesk

Sistema gestionale per agenzie viaggi / tour operator. Single-file React (`src/VoyageDesk.jsx`, **8856 righe** al momento del handoff) servito da Vite. Stato in `useReducer` + Context; nessun backend, dati in memoria + mock seed.

Identità completa, palette, modello dati e convenzioni stanno in **`docs/CLAUDE.md`** — quel file è la fonte di verità per: pattern reducer, naming, classi CSS responsive, helper esistenti, ruoli e permessi. Tieni `CLAUDE.md` sempre allineato quando aggiungi entità o azioni.

---

## 2. Stato attuale al handoff

| Area | Stato | Note |
|---|---|---|
| Ricerca header | ✅ unificata barra + filtri avanzati | Icona 🎛️ dentro l'input, dropdown sotto. |
| Pulsante "Crea multipli" 📑 | ✅ in sidebar desktop + bottom-nav mobile | Niente più FAB dedicato. |
| **Fase 1 — Clienti** | ✅ MVP | Vista, CRUD, ricerca, filtro per tipo, dettaglio con tab. |
| **Fase 1 — Pratiche** | 🔶 MVP solido | Numero progressivo PR-YYYY-NNN, stati, economici, link al cliente. |
| **Fase 1 — Collegamento Task ↔ Cliente / Pratica** | ✅ | `task.clientId` + `task.praticaId`, autocomplete in QuickAdd/BulkManual, chip cliccabili in TaskSlideOver. |
| **Fase 2 — Notifiche reali** | 🔶 base operativa | Per-utente, generate da reducer events; panel con tab Tutte/Non lette, segna lette, pulisci. |
| Anagrafica Fornitori | ❌ rimosso da roadmap | Decisione utente, sessione 11. |
| Modulo Finanziario | ❌ rimosso da roadmap | Decisione utente, sessione 11. I numeri economici essenziali vivono già dentro la pratica. |

L'ultimo deploy Vercel del branch è andato in **Ready** dopo ogni commit di questa sessione. Build locale: `npm run build` → ~857 KB bundle, gzip ~251 KB.

---

## 3. Cosa è stato fatto in questa sessione (8 → 11)

### Ristrutturazione UI header
1. **Barra di ricerca + ricerca avanzata fuse** in un unico controllo: icona 🎛️ dentro l'input a destra, pannello filtri (Scadenza, Categoria, Status, Agente, Cestino) apre sotto. Il campo "Parola chiave" del pannello è stato rimosso — l'unica fonte di verità è il valore dell'input dell'header, sincronizzato con `state.searchQuery`. Aggiunto pulsante ✕ per pulire e badge oro quando il pannello è aperto.

### Pulsante Bulk Task Creator riposizionato
2. **Su desktop**: spostato nella sidebar come voce dedicata "📑 Crea multipli" sotto le voci di navigazione, in stile CTA oro (gold).
3. **Su mobile/tablet**: spostato nella BottomNav come voce "Multipli" accanto agli altri item. Il FAB 📑 dedicato è stato eliminato.

### Fase 1 — Anagrafica Clienti
4. Vista `clients` con icona 🪪 in sidebar + bottom-nav. Permessi: Admin/Manager/Agent (no Driver).
5. `ClientsView`: card grid, ricerca testuale, filtro per tipo (Privato 👤 / Azienda 🏢 / Gruppo 👥).
6. `ClientEditorModal`: nome (obbligatorio), tipo, email, telefono, indirizzo, note.
7. `ClientDetailModal`: tab **Anagrafica** + **Pratiche** + **Task collegati**. Lookup task per `clientId` o per nome legacy (retro-compatibile con i task pre-esistenti).
8. Reducer: `ADD_CLIENT` / `UPDATE_CLIENT` / `DELETE_CLIENT`. Permesso `canManageClients` (no Driver).
9. 6 clienti seed coerenti con il mock storico.

### Fase 1 — Collegamento Task ↔ Cliente
10. Componente riusabile **`ClientAutocomplete`**: input + dropdown suggerimenti, badge 🪪 LINK quando un cliente è collegato. Selezione → setta `task.client` (testo) + `task.clientId`. Digitazione libera → spezza il link.
11. Integrato in **`QuickAddTask`** e in **`BulkTaskCreator/ManualTab`** (cliente comune).
12. `TaskSlideOver`: blocco CLIENTE ora rileva il cliente collegato (per `clientId` o per nome) e lo rende come chip cliccabile colorato per tipo. Click → apre dettaglio cliente nella vista Clienti.
13. Cross-view navigation: nuove action `OPEN_CLIENT_DETAIL` + `CONSUME_CLIENT_DETAIL_REQUEST` con `state.clientDetailRequest`.

### Fase 2 — Notifiche reali
14. Rimossa la costante statica `NOTIFICATIONS`. `state.notifications` (cap 200), per-utente (`recipientId`).
15. Generazione automatica dagli eventi del reducer:
    - `ADD_TASK` / `ADD_TASKS_BULK` → `assigned` per ogni assegnatario (≠ attore).
    - `UPDATE_TASK` → `assigned` per assegnatari aggiunti, `unassigned` per quelli rimossi, `status` / `done` su cambio stato.
    - `MOVE_TASK` → `status` / `done` per gli assegnatari attuali.
    - `ADD_COMMENT` → `comment` per gli altri assegnatari del task.
16. Modello: `{ id, type, recipientId, taskId?, text, time, read }`. `NOTIFICATION_TYPES` mappa tipo → icona + label.
17. Nuove action: `MARK_NOTIF_READ`, `MARK_ALL_NOTIF_READ`, `CLEAR_NOTIF`, `CLEAR_ALL_NOTIF`.
18. `NotificationsPanel` ridisegnato: tab Tutte / Non lette, tempi relativi ("5 min fa", "1 h fa", "2 g fa"), click su notifica → apre il task + marca letta, ✕ per cancellare la singola, footer "Segna tutte lette" + "Pulisci".
19. Topbar badge dinamico dalle notifiche dell'utente corrente (cambia col UserSwitcher).
20. Helper: `makeNotif`, `appendNotifications`, `getUserNotifications`, `formatRelTime`.

### Fase 1 — Pratiche di viaggio MVP
21. Vista `pratiche` con icona 📁. Permessi: Admin/Manager/Agent (no Driver).
22. `PraticheView`: card grid (border-left colorato per stato), ricerca per numero/titolo/destinazione/cliente, filtro per stato.
23. `PraticaEditorModal`: numero auto `PR-YYYY-NNN` (helper `getNextPraticaNumber`), titolo, cliente (select), stato, destinazione, date partenza/ritorno, viaggiatori, budget/ricavo/costo, note.
24. `PraticaDetailModal` con 3 tab:
    - **Anagrafica** — cliente cliccabile (apre dettaglio cliente), destinazione, date, viaggiatori, note, timestamp.
    - **Task collegati** — list per `task.praticaId`; click apre TaskSlideOver.
    - **Economico** — 4 card Budget / Ricavo / Costo / **Margine** (€ + %) con colore success/danger sul margine.
25. Cambio stato rapido via pillole nel header del dettaglio.
26. Stati: `draft` 📝 / `confirmed` ✅ / `in_progress` 🟢 / `completed` 🏁 / `cancelled` ❌.
27. Reducer: `ADD_PRATICA` / `UPDATE_PRATICA` / `DELETE_PRATICA` + `OPEN_PRATICA_DETAIL` / `CONSUME_PRATICA_DETAIL_REQUEST`. Eliminare una pratica scollega i task (`praticaId = null`).
28. 6 pratiche seed collegate ai 6 clienti con date relative coerenti.

### Fase 1 — Collegamento Task ↔ Pratica
29. Componente riusabile **`PraticaAutocomplete`** (specchio di `ClientAutocomplete`). Se la pratica è preceduta da un `clientId`, le pratiche di quel cliente vengono ordinate prima.
30. Integrato in `QuickAddTask` (nuovo campo PRATICA) e `BulkTaskCreator/ManualTab` (riga "Collega a una pratica").
31. `TaskSlideOver`: nuova riga PRATICA con chip cliccabile (numero + titolo) → apre dettaglio pratica.
32. `ClientDetailModal` esteso con tab **Pratiche** che lista quelle del cliente.

### Pulizie roadmap (sessione 11)
33. Rimosso modulo **Anagrafica Fornitori** da `ROADMAP.md` e `CLAUDE.md`.
34. Rimosso **Modulo Finanziario** da `ROADMAP.md`, `CLAUDE.md`, `CHANGELOG.md` e dal testo della tab Economico del dettaglio pratica.
35. Sostituita Fase 3 con "Business" (Report & Analytics + Catalogo destinazioni).

---

## 4. Dove guardare nel codice

Il file è grande ma è organizzato con commenti delimitatori `// ─── TITOLO ───`. Punti chiave (i numeri di riga possono spostarsi nei prossimi commit):

| Sezione | Cerca con Grep |
|---|---|
| Costanti dominio (CATEGORIES, STATUSES, PRIORITIES) | `^const STATUSES` / `^const CATEGORIES =` |
| Notifiche tipi + seed | `NOTIFICATION_TYPES =` / `buildInitialNotifications` |
| Mock clienti | `let CLIENTS = [` |
| Mock pratiche | `let PRATICHE = [` |
| Reducer (un solo `baseReducer` enorme) | `^function baseReducer` |
| Wrapper reducer + log + permessi admin | `^function reducer` |
| Helpers permessi e dominio | `^// ─── PERMESSI` / `^// ─── HELPER` |
| ViewportProvider / useViewport | `const ViewportProvider` |
| `NotificationsPanel` ridisegnato | `^// ─── NOTIFICATIONS PANEL` |
| `ClientsView` + Editor + Detail + Autocomplete | `^// ─── CLIENTI` |
| `PraticheView` + Editor + Detail + Autocomplete | `^// ─── PRATICHE DI VIAGGIO` |
| `Topbar` (search bar fusa) | `^const Topbar =` |
| `Sidebar` (con CTA "Crea multipli") | `^const Sidebar =` |
| `BottomNav` (con voce Multipli) | `^const BottomNav =` |
| `TaskSlideOver` (chip cliente + pratica cliccabili) | `^const TaskSlideOver =` |
| `QuickAddTask` (autocomplete cliente + pratica) | `^const QuickAddTask =` |
| `BulkTaskCreator/ManualTab` | `^const ManualTab =` |
| `renderView` switch | `const renderView = () =>` |
| `NAV_ITEMS` (con `clients` e `pratiche`) | `^const NAV_ITEMS =` |

---

## 5. Modello dati — aggiunte di questa sessione

### Cliente
```js
{
  id, name, type: "private" | "business" | "group",
  email, phone, address, notes, createdAt
}
```

### Pratica
```js
{
  id, number,           // "PR-2026-001"
  title, clientId,      // obbligatorio: link al cliente
  status: "draft" | "confirmed" | "in_progress" | "completed" | "cancelled",
  destination,
  startDate, endDate,   // ISO
  travelers,
  budget, revenue, cost,
  notes,
  createdAt, updatedAt
}
```

### Notifica
```js
{
  id, type,                                    // assigned | unassigned | comment | status | done | deadline | overdue | client | notice
  recipientId,                                 // utente destinatario
  taskId?, text, time, read
}
```

### Task — campi opzionali nuovi
```js
{
  ...
  clientId: string | null,    // link al cliente (in aggiunta a `client` testuale legacy)
  praticaId: string | null,   // link alla pratica
}
```

### State — chiavi nuove
- `state.clients`, `state.clientDetailRequest`
- `state.pratiche`, `state.praticaDetailRequest`
- `state.notifications`

`CLIENTS` e `PRATICHE` sono `let` mutabili sincronizzati via `_syncClients` / `_syncPratiche` (stesso pattern di `TEAM` / `CATEGORIES`). È debito tecnico noto da migrare a Context puro più avanti.

---

## 6. Reducer actions disponibili (nuove)

| Action | Permesso | Note |
|---|---|---|
| `ADD_CLIENT` / `UPDATE_CLIENT` / `DELETE_CLIENT` | `canManageClients` (no Driver) | |
| `OPEN_CLIENT_DETAIL` / `CONSUME_CLIENT_DETAIL_REQUEST` | `canViewClients` (no Driver) | Cross-view |
| `ADD_PRATICA` / `UPDATE_PRATICA` / `DELETE_PRATICA` | `canManagePratiche` (no Driver) | Delete sgancia i task collegati |
| `OPEN_PRATICA_DETAIL` / `CONSUME_PRATICA_DETAIL_REQUEST` | `canViewPratiche` (no Driver) | Cross-view |
| `MARK_NOTIF_READ` / `MARK_ALL_NOTIF_READ` / `CLEAR_NOTIF` / `CLEAR_ALL_NOTIF` | tutti (l'utente agisce sulle proprie) | |

Tutte le mutazioni task (`ADD_TASK`, `ADD_TASKS_BULK`, `UPDATE_TASK`, `MOVE_TASK`, `ADD_COMMENT`) generano notifiche automatiche per gli assegnatari ≠ attore.

---

## 7. Come riprendere il lavoro

### Setup locale
```bash
git clone https://github.com/tucobpjmr/TULLIO.git
cd TULLIO
git checkout claude/peaceful-einstein-3fdmrp
npm install
npm run dev    # http://localhost:5173
npm run build  # validazione veloce
```

### Convenzioni essenziali
- **Editor inline + CSS variables**, niente Tailwind / niente librerie UI.
- Componenti `PascalCase`, action `UPPER_SNAKE`, helper `camelCase`.
- **Permessi**: ogni nuova action che tocca task / clienti / pratiche / notifiche deve passare per il rispettivo `can…` helper.
- **Responsive**: ogni nuovo componente di vista chiama `useViewport()`. Classi CSS responsive sono in `FontLoader`.
- **Italiano dappertutto**: label, placeholder, toast, log entry, commit messages dei reducer.
- **Mutazione di `TEAM` / `CATEGORIES` / `CLIENTS` / `PRATICHE`** solo via `_sync…` (mai `array.push` diretto fuori da `_sync`).
- Non aggiungere `console.log` "rumorosi". Non usare `localStorage` (decisione architetturale: lo stato è in memoria fino alla migrazione backend).

### Sessione del PR
La PR #12 è impostata come **draft**. Vercel rideploy automatico su ogni push. Hai una subscription attiva agli eventi del PR — i commenti del bot Vercel sono solo notifica di build, non richiedono azione.

---

## 8. Prossimo step naturale (suggerito)

Dalla `Sequenza consigliata` di ROADMAP.md, finita la Fase 1 e quasi finita Fase 2 (Notifiche), gli aggiornamenti più utili sono:

### Opzione A — quick wins notifiche reali (consigliata, sforzo S–M)
Sblocca tutto ciò che le notifiche reali permettono:
- **Badge su voce Admin** della sidebar/bottom-nav con conteggio agenti pending.
- **Badge su voce Dashboard** con conteggio coda globale.
- **Alert al manager** se un task resta in coda > N ore (timer derivato).
- **Menzioni `@utente` in bacheca** (NoticeBoard) con creazione notifica.

### Opzione B — Calendario avanzato (Fase 2 residua, sforzo M)
- Vista giornaliera (oggi mancano viste sotto la settimana).
- Eventi multipli sullo stesso giorno.
- Export iCal mock.

### Opzione C — Estensioni chat (Fase 2 residua, sforzo S–M)
- Ricerca dentro le conversazioni.
- Stato online/occupato.
- Rich-preview dei task nel messaggio + task-link cliccabile.

### Opzione D — Persistenza dati (debito tecnico, sforzo L)
- Migrare `TEAM` / `CATEGORIES` / `CLIENTS` / `PRATICHE` da `let` mutabile + sync a Context/state puro.
- Aggiungere persistenza (Supabase è già configurato a livello MCP: i client `@supabase/supabase-js` sono in `package.json`).
- Sotto-step: definire schema tabelle che rispecchi il modello attuale + repository.

---

## 9. Decisioni di scope chiuse in questa sessione

- ✅ **Anagrafica Fornitori rimossa** dalla roadmap (decisione utente sessione 11).
- ✅ **Modulo Finanziario rimosso** dalla roadmap (decisione utente sessione 11). I numeri economici essenziali (Budget / Ricavo / Costo / Margine) restano dentro la pratica come MVP sufficiente.
- ✅ Pratiche di viaggio mantenute come modulo centrale di Fase 1.
- ✅ Driver continua a essere escluso da Clienti, Pratiche e Admin.

---

## 10. File da tenere sincronizzati

| File | Aggiornare quando… |
|---|---|
| `docs/CHANGELOG.md` | Ogni nuova sessione: aggiungere una sezione `## v0.9-dev — <Titolo> (sessione N+1)` in cima con bullet sintetici. |
| `docs/ROADMAP.md` | Cambi di stato di un modulo (`⬜ → 🔶 → ✅`), aggiunte/rimozioni. |
| `docs/CLAUDE.md` | Nuove reducer actions, nuovi helper utility, nuove view nella struttura componenti. |
| `docs/HANDOFF.md` | Riscrivere (sezioni 2, 3, 4, 5, 8) alla fine di una sessione di handoff. |
| `docs/PROJECT_SPEC.md` | Aggiornamenti al modello dati / processi di business. |
