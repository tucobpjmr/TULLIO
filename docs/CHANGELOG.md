# CHANGELOG — VoyageDesk

## v0.9.8 — Pratiche di viaggio — chiude Fase 1 (sessione 16)

> **Fase 1 — Modello dati completo: 100%**. Le Pratiche di viaggio aggregano task + cliente + fornitori in un'entità centrale con numerazione progressiva, stati, riepilogo economico e timeline eventi. Sblocca il filtro "numero pratica" nella Ricerca avanzata.

### 📂 Modello dati Practice
- Nuovo schema `Practice`:
  ```js
  {
    id, number,              // "PR-YYYY-NNN" auto-progressive
    title, status,           // draft|confirmed|in_progress|completed|cancelled
    clientId, supplierIds: [],
    destination,
    departureDate, returnDate,
    totalValue, cost, paid,  // riepilogo economico (€)
    notes,
    events: [{ time, type, text, userId }],  // timeline
    createdAt, updatedAt, deletedAt
  }
  ```
- `PRACTICE_STATUSES`: 5 stati con icona + colore + bg (draft 📝, confirmed ✅, in_progress 🚀, completed 🏁, cancelled ❌).
- `generatePracticeNumber(existing)`: scansiona le pratiche dell'anno corrente e genera il successivo `PR-YYYY-NNN`.
- Helper `getPractice`, `getPracticeTasks`, `getPracticeMargin`, `getPracticePaidPct`.
- `INITIAL_PRACTICES`: 6 pratiche demo che aggregano i 27 task esistenti via nuovo campo `task.practiceId`.

### 🔁 Reducer
- Slice `state.practices` + `selectedPractice` volatile (PERSIST_OMIT).
- Actions: **`ADD_PRACTICE`**, **`UPDATE_PRACTICE`**, **`DELETE_PRACTICE`** (soft-delete), **`SET_SELECTED_PRACTICE`**, **`CHANGE_PRACTICE_STATUS`** (logga evento timeline).
- `ADD_PRACTICE` auto-genera il `number` se assente, e crea l'evento "Pratica creata" nella timeline.
- `RESTORE_BACKUP` esteso con `practices`.

### 🔐 Permessi
- `canManagePractices(uid)` / `canViewPractices(uid)` → `!isDriver(uid)`.
- `SET_VIEW("practices")` + `SET_CURRENT_USER` con check + redirect.

### 🧭 Vista Pratiche
- Nuova voce NAV `📂 Pratiche` (admin/manager/agent).
- **`PracticesView`**:
  - Header + KPI 4-card (totale, ricavo, margine €+%, incassato €+%).
  - Toolbar: search testuale, filtro stato, filtro cliente, toggle rimosse.
  - Griglia 2-col responsive con card pratica: numero, badge stato, titolo, cliente, destinazione, date partenza/rientro, conteggi task/fornitori, ricavo, margine (verde/rosso), progress bar "% incassato".
  - Default sort: per data partenza ASC con null in coda.

### 🪟 Modale `PracticeEditModal` (5 sezioni)
1. **Generale** — titolo, cliente, stato, destinazione, partenza/rientro, note.
2. **💰 Riepilogo economico** — ricavo / costo / incassato → margine calcolato live + marginalità % + % incassato.
3. **🤝 Fornitori collegati** — multi-select via chip toggleabili sui fornitori attivi (colorati per tipologia, ✓ se attivo).
4. **📋 Task collegati** — lista derivata da `getPracticeTasks`, click → apre `TaskSlideOver` chiudendo la modale.
5. **🕰️ Timeline** — eventi cronologici (created/status/payment/note) con icona, autore, data. Input per aggiungere nota inline.
- Cambio stato dispatcha `CHANGE_PRACTICE_STATUS` → logga automaticamente l'evento timeline.
- Modale **a livello root** in `VoyageDeskInner` (apribile da qualsiasi vista).
- Header con numero `PR-YYYY-NNN` + badge stato + timestamp creazione/aggiornamento.

### 🔗 Integrazione TaskSlideOver
- Nuova sezione **PRATICA** (sopra FORNITORE): bottone full-width navy con numero + titolo, click → apre `PracticeEditModal`.
- Visibile solo se `task.practiceId` risolve in anagrafica.

### ➕ Picker pratica in QuickAddTask
- Nuovo select PRATICA in cima ai picker entità (sopra Cliente).
- **Cliente auto-suggested**: se l'utente seleziona una pratica con `clientId` impostato e il form non ha ancora un cliente, lo pre-compila automaticamente.
- Pratiche annullate filtrate dal picker.

### 🔍 Ricerca avanzata: filtro numero pratica
- Nuovo input "📂 Numero pratica" subito sotto "Parola chiave". Accetta match parziale case-insensitive (es. `001` matcha `PR-2026-001`).
- Tasks senza `practiceId` esclusi quando il filtro è attivo.

### 💾 Backup
- `exportBackup` esteso con `practices`, version → `"0.9.8"`.

### 📈 Metriche
- File: 9012 → ~9700 righe (+~690).
- Componenti nuovi: 3 (`PracticesView`, `PracticeEditModal`, `PracticeStatusBadge`).
- Helper nuovi: 5 (`generatePracticeNumber`, `getPractice`, `getPracticeTasks`, `getPracticeMargin`, `getPracticePaidPct`, `formatEur`).
- Mock data: 6 pratiche + 16 task collegati via `practiceId`.

### ⚠️ Note migrazione
- Task persistiti pre-v0.9.8 senza `practiceId`: il chip PRATICA semplicemente non viene renderizzato.
- Hydration: se localStorage non ha `practices`, fallback a `INITIAL_PRACTICES`.
- `PERSIST_VERSION` invariato — il merge dei default copre i campi nuovi.

### ✅ Fase 1 completa
- [x] Anagrafica Clienti (v0.9.5)
- [x] Anagrafica Fornitori (v0.9.7)
- [x] **Pratiche di viaggio** (v0.9.8)
- [x] Collegamento Task ↔ Cliente ↔ Pratica (via `clientId` + `practiceId` su task)

### 🔜 Prossimo focus
- **Fase 2** — Notifiche reali (collegate ad azioni), Calendario avanzato residuo, estensioni chat.
- **Fase 3** — Modulo finanziario (ora che ci sono Pratiche con riepilogo economico).
- **Traccia tecnica** — splittare `VoyageDesk.jsx` (ora ~9700 righe).

---

## v0.9.7 — Anagrafica Fornitori (sessione 15)

> Secondo step della **Fase 1 — Modello dati completo**. Mirror stretto del pattern Clienti per consistenza UX, prepara il terreno per Pratiche di viaggio (entità centrale che aggregherà task + clienti + fornitori).

### 🤝 Modello dati Supplier
- Nuovo schema `Supplier`: `{ id, name, type, contactPerson, email, phone, address, services, notes, createdAt, updatedAt, deletedAt }`.
- `SUPPLIER_TYPES`: 7 tipologie (`hotel`, `transport`, `airline`, `insurance`, `tour-operator`, `visa`, `other`) con icona + colore + bg.
- `INITIAL_SUPPLIERS`: 6 fornitori demo coerenti coi task esistenti (Four Seasons Maldives, Emirates, NCC Autoservizi Meridionali, Allianz Travel, Tawaraya Ryokan, Visti Express).
- Schema Task esteso con campo opzionale **`supplierId: string|null`**. Pre-popolato su 8 task demo (t1, t2, t3, t6, t8, t12, t14, t17, t19).

### 🔁 Reducer
- Nuovo slice `state.suppliers` (persistenza automatica via lazy init merge).
- Nuovo slice volatile `state.selectedSupplier` (in `PERSIST_OMIT`).
- Nuove azioni: **`ADD_SUPPLIER`**, **`UPDATE_SUPPLIER`**, **`DELETE_SUPPLIER`** (soft-delete), **`SET_SELECTED_SUPPLIER`**.
- `RESTORE_BACKUP` esteso per includere `suppliers`.
- Tutte loggate in `activityLog`.

### 🔐 Permessi
- Nuovi helper `canManageSuppliers(uid)` / `canViewSuppliers(uid)` → `!isDriver(uid)`. Stessa regola dei clienti.
- `SET_VIEW("suppliers")` e `SET_CURRENT_USER` aggiornati per check + redirect.

### 🧭 Vista Fornitori
- Nuova voce NAV: `{ id: "suppliers", icon: "🤝", label: "Fornitori", roles: ["admin","manager","agent"] }`.
- **`SuppliersView`**: header con conteggio attivi/in elenco + bottone "+ Nuovo fornitore", toolbar (search testuale, filtro tipologia, toggle rimossi), griglia 3 col con card.
- Card: chip tipologia, badge "📋 N task collegati", nome, referente, email/telefono, anteprima servizi (2 righe), banner "Rimosso il …" per soft-deleted.

### 🪟 Modale `SupplierEditModal`
- Modalità: creazione (`supplier === null`), modifica, sola lettura (`canManage=false` o `deletedAt`).
- Campi: nome (obbligatorio), tipologia, referente, email, telefono, **indirizzo**, **servizi offerti**, note operative.
- Footer: "🗑 Rimuovi fornitore" + Annulla/Salva.
- Renderizzata a livello **root** (apribile da TaskSlideOver e Fornitori).
- Callback opzionale `onCreated(newSupplier)` per pre-selezione inline (usato da QuickAddTask).

### 🔗 Integrazione TaskSlideOver
- Nuova sezione "FORNITORE" (sotto CLIENTE, sopra ORE STIMATE) visibile solo se `task.supplierId` risolve in anagrafica.
- Chip colorato per tipologia con icona + nome + freccia. Click → apre `SupplierEditModal`.

### ➕ Picker fornitore in QuickAddTask
- Nuovo select FORNITORE parallelo a CLIENTE, con clienti e fornitori attivi ordinati alfabeticamente.
- Bottone **"+ Nuovo"** apre `SupplierEditModal` inline e pre-seleziona il nuovo fornitore.

### 💾 Backup
- `exportBackup` esteso con `suppliers`, version bumpata a `"0.9.7"`.

### 📈 Metriche
- File: 8433 → ~8900 righe (+~470).
- Componenti nuovi: 2 (`SuppliersView`, `SupplierEditModal`).
- Helper nuovi: 1 (`getSupplier`).
- Mock data: 6 fornitori + costanti tipologie.

### ⚠️ Note migrazione
- I task persistiti pre-v0.9.7 non hanno `supplierId`: il chip FORNITORE semplicemente non viene renderizzato. Nessuna mappa legacy necessaria (campo nuovo, non era mai esistito come testo).
- Hydration: se il payload localStorage non ha `suppliers`, fallback a `INITIAL_SUPPLIERS`. `PERSIST_VERSION` invariato.

### 🔜 Prossimo step Fase 1
- **Pratiche di viaggio** (effort L): entità che aggrega tasks + clienti + fornitori in una numerazione progressiva `PR-YYYY-NNN`, con stati e riepilogo economico.

---

## v0.9.6 — Vista settimana Calendario ridisegnata (sessione 14)

> Chiude il punto 🟡 "Vista settimanale Calendario migliorata" della roadmap post-v0.6. La vecchia griglia card-per-giorno (con scroll orizzontale su mobile) è stata rimpiazzata da due layout dedicati: **time-grid orario** su desktop e **day-tab + lista verticale** su mobile.

### 🕐 Desktop — Time-grid orario
- Griglia oraria da **06:00 a 22:00** (16 righe da 56px), 7 colonne giorno + 1 colonna etichetta ora.
- Task posizionati nella cella `(giorno, ora di inizio)`. Ogni blocco mostra ora (tabular-nums), icona categoria, titolo troncato e pallino priorità.
- **"Now line" rossa** orizzontale + dot quando "oggi" è in settimana visualizzata e l'ora corrente è nel range — assoluta sopra la griglia.
- **Riga "FUORI ORARIO"** sopra la griglia: visibile solo se ci sono task con orario notturno/precoce; ospita pillole compatte per non perderli.
- Sfondo colonna "oggi" tinto in oro tenue per orientamento immediato.

### 📱 Mobile — Day-tab + lista
- **Tab strip orizzontale** con scroll-snap (un bottone per giorno: nome corto + numero + badge conteggio task). Bottone "oggi" colorato oro, attivo navy.
- Sotto: **lista verticale del giorno selezionato**, ordinata per `dueDate`, con orario a sinistra grande (`tabular-nums` 16px), categoria/stato a destra. Niente più scroll orizzontale fra le colonne.
- `SwipeActions` riattivati sulle card mobile (Fatto/Cestino/Inoltra).
- Heading dinamico: "lunedì 14 dicembre" + badge OGGI quando opportuno.

### 🔁 Sincronizzazione
- Quando l'utente cambia settimana via ← / → (mobile), il tab si riallinea a "oggi" se è nella nuova settimana, altrimenti al primo giorno. Implementato con `useEffect([weekOffset])`.

### 🧹 Cleanup
- Rimosso helper `getTasksForDay` (non più referenziato).
- Costanti time-grid esportate a livello modulo: `WEEK_START_HOUR`, `WEEK_END_HOUR`, `WEEK_HOUR_COUNT`, `WEEK_ROW_HEIGHT`.

### 📈 Metriche
- File: 8177 → ~8390 righe (+~210).
- Componenti nuovi: 0 (riscrittura inline del blocco settimana in `CalendarPlanner`).

---

## v0.9.5 — Anagrafica Clienti CRM (sessione 13)

> Primo step della **Fase 1 — Modello dati completo** (post-handoff). Introduce l'entità Cliente, la vista dedicata, il picker nei form e il collegamento dei task tramite `clientId`.

### 🧳 Modello dati Client
- Nuovo schema `Client`: `{ id, name, type, contactPerson, email, phone, notes, createdAt, updatedAt, deletedAt }`.
- `CLIENT_TYPES`: 5 tipologie (`famiglia`, `coppia`, `azienda`, `gruppo`, `individuale`) con icona + colore + bg.
- `INITIAL_CLIENTS`: 6 anagrafiche demo coerenti coi clienti già citati nei task (Rossi, Bianchi, TechCorp, Marchetti, Liceo Manzoni, Sposi Conte).
- Schema Task esteso con campo opzionale **`clientId: string|null`**. Il vecchio campo `client` (testo) resta come fallback display (backward-compat).
- Mappa legacy `_LEGACY_CLIENT_NAME_TO_ID` + helper `resolveLegacyClientId(task)` per i task pre-v0.9.5 senza `clientId` ma con nome cliente riconoscibile.

### 🔁 Reducer
- Nuovo slice `state.clients` (con persistenza localStorage automatica via lazy init merge).
- Nuovo slice volatile `state.selectedClient` (in `PERSIST_OMIT`, ripristinato a `null` al refresh).
- Nuove azioni: **`ADD_CLIENT`**, **`UPDATE_CLIENT`**, **`DELETE_CLIENT`** (soft-delete), **`SET_SELECTED_CLIENT`**.
- `RESTORE_BACKUP` esteso per includere `clients`.
- Tutte loggate in `activityLog` con messaggi dedicati.

### 🔐 Permessi
- Nuovi helper: `canManageClients(uid)` e `canViewClients(uid)` → `!isDriver(uid)`. Driver: nessun accesso alla vista Clienti, ma vede comunque il chip cliente in `TaskSlideOver` (read-only via `canManage=false`).
- `SET_VIEW("clients")` e `SET_CURRENT_USER` aggiornati per il check + redirect.

### 🧭 Vista Clienti
- Nuovo `NAV_ITEMS` entry: `{ id: "clients", icon: "🧳", label: "Clienti", roles: ["admin","manager","agent"] }`. Visibile in Sidebar e BottomNav per i ruoli non-Driver.
- Nuovo componente **`ClientsView`**:
  - Header con conteggio attivi/in elenco + bottone "+ Nuovo cliente" (solo se `canManage`).
  - Toolbar: search testuale (nome/referente/email/telefono/note), filtro tipologia, toggle "Mostra rimossi".
  - Griglia 3 col con card cliente: chip tipologia, badge "📋 N task collegati", nome, referente, email/telefono, anteprima note (2 righe), banner "Rimosso il …" per soft-deleted.

### 🪟 Modale `ClientEditModal`
- Modalità: creazione (`client === null`), modifica, sola lettura (read-only via `canManage=false` o `client.deletedAt`).
- Campi: nome (obbligatorio), tipologia, referente, email, telefono, note.
- Footer: bottone "🗑 Rimuovi cliente" a sx (solo se modifica + non rimosso + canManage) + Annulla/Salva a dx.
- Renderizzata a livello **root** (in `VoyageDeskInner`) per essere aperta anche da TaskSlideOver senza dover navigare alla vista Clienti.
- Callback opzionale `onCreated(newClient)` per pre-selezionare il cliente appena creato in altri form.

### 🔗 Integrazione TaskSlideOver
- Sezione "CLIENTE" ora mostra:
  - Se `resolveLegacyClientId(task)` → chip colorato per tipologia con icona + nome + freccia. Click → apre `ClientEditModal`.
  - Altrimenti se solo testo legacy → vecchia chip surface.
  - Altrimenti `—`.

### ➕ Picker cliente in QuickAddTask
- Vecchio input testo libero rimpiazzato da **select** con clienti attivi (ordinati alfabeticamente, prefissati dall'icona di tipologia) + opzione `— Nessuno —`.
- Bottone **"+ Nuovo"** affianco al select: apre `ClientEditModal` inline e pre-seleziona il cliente appena creato via `onCreated`.
- Salvataggio task: scrive sia `clientId` che `client` (nome risolto) per consistenza retro-compatibile.

### 💾 Backup
- `exportBackup` esteso con `clients` e version bumpato a `"0.9.5"`.

### 📈 Metriche
- File: 7597 → ~7980 righe (+~380).
- Componenti nuovi: 2 (`ClientsView`, `ClientEditModal`).
- Helper nuovi: 4 (`getClient`, `getTaskClientName`, `resolveLegacyClientId`, `canManageClients`).
- Mock data: 6 clienti + costanti tipologie.

### ⚠️ Note migrazione
- I task persistiti pre-v0.9.5 non hanno `clientId`. `resolveLegacyClientId` fa la mappatura on-the-fly dai nomi noti, quindi i chip cliente in TaskSlideOver funzionano anche su state legacy. Per i nomi sconosciuti, mostra il testo libero come prima.
- Hydration: se il payload localStorage non ha `clients`, fallback a `INITIAL_CLIENTS`. Non c'è bisogno di bumpare `PERSIST_VERSION` (le voci nuove vengono mergeate sui default).

---

## v0.9.4 — Agenda Driver transfer-oriented (sessione 12)

> Chiude il punto 🟡 "Coda personale Driver con filtro data/ora (tipo agenda giornaliera)" della roadmap post-v0.8. Giulia (e ogni altro Driver) ora vede le proprie corse organizzate come agenda con orario in evidenza.

### 🚐 Modalità agenda per Driver
- **`PersonalQueue`** ora rileva `getRoleType(me.id) === "driver"` e mostra una vista alternativa:
  - **Layout agenda** raggruppato per giorno: header sezione "Oggi · gio 14 dic" / "Domani · ven 15 dic" / "lun 16 dic" + contatore corse del giorno.
  - **Card a row** con riquadro orario a sinistra (`formatTime` in font grande, "ORARIO" sotto) e dettagli a destra.
  - Card singola colonna (più leggibile in mobile, vista transfer-oriented).
  - L'icona 📅 ridondante è stata rimossa dalle card driver — l'orario è già grande a sinistra.

### 🗓️ Filtri data
- **Chip filtro** sopra l'agenda: **Oggi · Domani · Tutte**, con conteggio per chip.
- Default `today`. Stato locale al componente (non persistito).
- Filtraggio puro per intervalli `[startOfDay, startOfDay+1)`; task senza `dueDate` esclusi dai filtri Oggi/Domani.

### 🔁 Backward-compat
- Per Admin/Manager/Agent il rendering resta identico (grid auto-fill 280px, etichetta "La mia coda — task assegnate a me"). Nessuna regressione.
- Card driver e card non-driver condividono lo stesso `renderCard(t, opts)` per coerenza visiva e per non duplicare il markup.

### 📈 Metriche
- File: 7427 → ~7580 righe (+~150).
- Componenti nuovi: 0 (solo evoluzione di `PersonalQueue`).
- Stato locale nuovo: `dayFilter` ("today" | "tomorrow" | "all").

---

## v0.9.3 — Task link cliccabile in chat (sessione 11)

> Promosso il "task link" della chat da testo precompilato a chip interattivo. Click → apre `TaskSlideOver` e chiude la chat. Completa il punto 🟡 "Task link cliccabile nella chat (apre TaskSlideOver)" della roadmap post-v0.8.

### 🔗 Task agganciato al messaggio
- Nuovo campo opzionale **`taskRef`** sui messaggi testuali: `{ id, title, dueDate }`. I messaggi senza `taskRef` restano invariati.
- Nuovo componente **`TaskLinkChip`** renderizzato sotto il testo della bubble. Stile coerente con i due lati (mine: navy/oro, others: surface2).
- Click sul chip → `dispatch({ type: "SET_SELECTED_TASK", payload: task })` + `onCloseChat()` (così lo slide-over non resta coperto dalla chat).
- **Permessi rispettati**: il chip controlla `canViewTask(task, CURRENT_USER)` e si disabilita ("Task non disponibile") se l'utente non può aprirlo o se il task è stato cestinato/purgato.

### 📎 Preview "Task agganciato" sopra l'input
- Quando arriva un intent con `taskLink`, `ConversationView` mostra una preview tipo reply (bordo navy, "🔗 Task agganciato" + titolo + data) sopra l'input.
- ✕ rimuove l'aggancio prima dell'invio.
- Send → `taskRef` viene scritto nel messaggio inviato. Permesso anche l'invio "solo task" senza testo (utile se basta condividere il riferimento).
- Bottone invio compare anche con testo vuoto se c'è un task agganciato (prima compariva il microfono).

### 🧹 Refactor intent → prefillTask
- `ChatPanel` non sputa più una stringa fissa (`🔗 Riferimento task: "…"\n📅 Scadenza: …`) nell'input: ora passa un oggetto `prefillTask` a `ConversationView` via prop `initialAttachedTask`. L'esperienza utente è "qui sotto c'è il riferimento, scrivi il tuo messaggio".
- Vecchi prop `initialInput`/`onInitialInputConsumed` rimossi.

### 🧩 ChatContext esteso
- Ora propaga anche **`dispatch`** e **`onCloseChat`** (oltre a tasks/currentUserId). Sblocca i sotto-componenti chat dal poter fare azioni globali in modo type-safe-by-convention.
- `ChatPanel` riceve `dispatch` come nuova prop da `VoyageDeskInner`.

### 📦 Persistenza
- `taskRef` viene salvato in `localStorage` (sotto `voyagedesk:chat:v1`) come parte del messaggio. Compatibile con `PERSIST_VERSION = 1`.

### 📈 Metriche
- File: 7338 → ~7395 righe (+~55).
- Componenti nuovi: 1 (`TaskLinkChip`).
- Schema chat: campo opzionale `taskRef`.

---

## v0.9.2 — Fix incrementali roadmap (sessione 10)

> Bundle di tre fix 🟡 dalla roadmap "Migliorie incrementali post-v0.5/v0.8": badge contatori su Sidebar/BottomNav, editor multi-assegnatari in `TaskSlideOver`, commento firmato con l'utente loggato.

### 🔔 Badge nav contatori
- Nuovo helper **`getNavBadges(state)`** + componente **`NavBadge`** (variante `dot` per icona compatta, `inline` per sidebar espansa).
- **Voce Admin** → numero agenti con `pending: true`. Visibile solo ad admin (gli altri ruoli non vedono la voce).
- **Voce Dashboard** → numero task in coda globale (`assignees: []` non cestinati). Nascosto per Driver (che non vede la coda globale).
- Stile: pillola dorata `var(--gold)` con testo navy, bordo navy-dark per stacco sul fondo scuro. Mostrata solo se `count > 0`. Limite display `99+`.
- Integrato in **Sidebar** (sia collassata con dot sull'icona, sia espansa con badge inline a destra della label) e **BottomNav** (dot sull'icona).

### 👥 Editor multi-assegnatari in TaskSlideOver
- Nuovo bottone **"✎ modifica"** accanto a label ASSEGNATI, visibile solo se `canEditTask(task, CURRENT_USER)`.
- Edit mode: chip per ogni agente di `getAssignableTeam()` (toggle), colore agente quando attivo + ✓.
- **Salva** → `UPDATE_TASK` con il nuovo array `assignees`. **Annulla** → ripristina bozza dal task.
- `useEffect([task.id])` resetta editor + bozza al cambio task aperto (evita stale state se si chiude lo slide-over e se ne apre un altro).

### 🐛 Commento firmato dall'utente reale
- Prima: ogni commento era hard-coded come "Marco Ferretti" (residuo single-user pre-v0.8).
- Ora: usa `getMember(CURRENT_USER)?.name` → ogni utente firma con il proprio nome. Coerente con UserSwitcher.

### 📈 Metriche
- File: 7205 → ~7290 righe (+~85).
- Componenti nuovi: 1 (`NavBadge`).
- Helper nuovi: 1 (`getNavBadges`).

---

## v0.9.1 — Persistenza localStorage (sessione 9)

> Primo step della migrazione a progetto reale post-handoff: i dati non si perdono più al refresh. Sblocca uso reale dell'app come single-user demo locale.

### 💾 Stato persistito su `localStorage`
- **Hydrate al mount**: `useReducer(reducer, initialState, loadPersistedState)`. Se trova lo state salvato (versione compatibile), lo unisce ai default; altrimenti parte da `INITIAL_TASKS`/`INITIAL_NOTICES`/`TEAM`/`CATEGORIES` come prima.
- **Save al cambio**: `useEffect([state])` con debounce 300ms → `localStorage.setItem`.
- **Chiavi**: `voyagedesk:state:v1` (app) + `voyagedesk:chat:v1` (conversazioni e messaggi).
- **Versioning**: costante `PERSIST_VERSION = 1`. Bumpando si invalidano automaticamente i payload vecchi.

### 📦 Cosa viene salvato
- `tasks`, `team`, `categories`, `notices`, `agencyName`, `activityLog`, `currentUserId`, `activeView`, `sidebarCollapsed`.
- Chat: `conversations` + `messages` (inclusi vocali con waveform — attenzione: i base64 pesano).

### 🚫 Cosa NON viene salvato (campi UI volatili)
- `toast`, `lastAction`, `selectedTask`, `showNotif`, `searchQuery`, `filters` — tornano ai default al refresh.

### 🔄 Resync globali alla hydration
- `TEAM`, `CATEGORIES`, `CURRENT_USER` (i `let` mutabili usati dagli helper) vengono riallineati allo stato persistito via `_syncTeam`/`_syncCategories`/`_syncCurrentUser`, prima che qualsiasi componente leggi i riferimenti.
- Se l'`currentUserId` salvato non esiste più nel TEAM, fallback al default.

### 🧹 Reset dati locali
- Nuovo riquadro in **Admin → Import/Export**: bottone "Cancella dati locali e ricarica" che fa `removeItem` su entrambe le chiavi + `location.reload()`. Conferma `window.confirm` obbligatoria.
- Esistente "Esporta backup JSON" resta il modo consigliato per fare un salvataggio prima del reset.

### 🛡️ Robustezza
- Tutto in try/catch: errori di parse, quota superata o storage non disponibile → log su console + fallback ai default, niente schermata bianca.
- Funziona anche in SSR / ambienti senza `window.localStorage`.

### 📈 Metriche
- File: 7071 → **~7180 righe** (+~110, solo helper + admin card).
- Componenti nuovi: 0 (solo logica + un riquadro nel tab Admin IO).

### ⚠️ Note migrazione
- Rimosso il vincolo "no localStorage" dalla `CLAUDE.md` (era legato a claude.ai artifacts, ora in Vite).
- Roadmap: spuntato il punto **Persistenza** nella traccia tecnica.

---

## v0.9-dev — Ristrutturazione UI + Profilo + Handoff (sessione 8)

> Semplificazione interfaccia, unificazione viste, nuovo profilo utente, preparazione per migrazione a progetto Vite.

### 🗑️ Rimossi dalla Dashboard
- **KPI Cards** (4 counter: Task Visibili, In Scadenza, Completati Oggi, In Lavorazione) — rimossi con intero contenitore e variabili.
- **Pannello "Attività Settimanale"** (grafico a barre mock) — rimosso.
- **Pannello "Per Categoria"** (barre progresso) — rimosso.

### 📊 Dashboard: nuove tab code
- **4 tab cliccabili** (Coda Globale 🌐, Coda Personale 👤, Scadute 📅, Urgenti ⚠️) con badge contatore.
- Filtro a sezione singola: una sola coda visibile alla volta.
- Default: Coda Personale. Driver: vede solo Personale + Scadute.
- Nuovo componente `QueueTab` (card tab) + `OverdueQueue` (task scaduti visibili).
- Bacheca avvisi spostata sopra le tab.

### 📅 Calendario unificato
- Fusi **Calendar** e **Planning** in un unico componente `CalendarPlanner`.
- Toggle **Mese / Settimana** in header.
- Distribuzione settimanale agenti sempre visibile sotto entrambe le viste.
- Rimossa voce "Pianificazione" da sidebar/bottom-nav → una sola voce 📅 Calendario.
- Rimossi componenti `Calendar` e `Planning`.

### 🗂️ Kanban rimosso
- Rimossi `KanbanCard`, `KanbanColumn`, `Kanban` (~190 righe).
- Rimossa voce "Kanban Board" da sidebar/bottom-nav.
- FAB multi-task (📑) ora visibile in tutte le viste (tranne Cestino/Admin).

### ↻ Ripristino dal cestino con modifica
- Click "Ripristina" → modale precompilato con tutti i campi (titolo, categoria, priorità, stato, scadenza, cliente, assegnatari, descrizione).
- Modifica opzionale prima della conferma.
- Nuova action implicita: UPDATE_TASK + RESTORE_TASK in sequenza.

### 👤 Profilo personale
- Nuovo componente `ProfileEditor` accessibile dal dropdown UserSwitcher.
- Campi: nome visualizzato, avatar (emoji/iniziali o upload foto base64), colore avatar, email, telefono. Ruolo read-only.
- Nuova action `UPDATE_OWN_PROFILE` (non admin-only, modifica solo il proprio profilo).
- `Avatar` aggiornato: mostra `<img>` se `photoUrl` presente.
- Nuovi campi member: `email`, `phone`, `photoUrl`.
- Foto visibile anche in topbar button e lista utenti.

### 📱 Fix responsive
- **Dashboard**: `minWidth: 0` + `overflow: hidden` sul container padre.
- **PersonalQueue, UnassignedQueue, UrgentOthersQueue, OverdueQueue, NoticeBoard**: padding mobile ridotto (`14px 12px` vs `18px 22px`) + `overflow: hidden`.
- **NotificationsPanel**: `position: fixed` su mobile con `left: 12px; right: 12px` (non sfora più).

### 📦 Handoff per GitHub
- Preparato pacchetto completo per repository GitHub + Claude Code:
  - `README.md`, `CLAUDE.md`, `PROJECT_SPEC.md`, `CHANGELOG.md`, `ROADMAP.md`
  - Setup Vite (`package.json`, `vite.config.js`, `index.html`, `src/main.jsx`)
  - `.gitignore`

### 📈 Metriche
- File: 6617 → **7071 righe** (netto dopo rimozioni e aggiunte).
- Componenti rimossi: 5 (Calendar, Planning, KanbanCard, KanbanColumn, Kanban).
- Componenti aggiunti: 5 (QueueTab, OverdueQueue, CalendarPlanner, ProfileEditor, RestoreEditModal inline).

---

## v0.8 — Sistema Permessi per Ruolo + User Switcher (sessione 7b)

> Introduce un sistema completo di permessi per ruolo, multi-utente mock con switcher, nuove code nella Dashboard, e integrazione chat con link ai task urgenti.

### 🔐 Sistema Permessi (UTILS — helper centralizzati)
- **`getRoleType(userId)`** → `admin` | `manager` | `agent` | `driver`. Derivato dal campo `role` del team member.
- **`canViewTask(task, userId)`** — Admin: tutto. Manager/Agent: proprie + coda globale + urgenti altrui (<24h). Driver: solo proprie task.
- **`canEditTask(task, userId)`** — Admin: tutto. Manager/Agent: proprie + globali. Driver: solo transfer + proprie/globali.
- **`canCreateTaskCategory(category, userId)`** — Driver: solo `transfer`. Altri: tutte.
- **`canAccessAdmin(userId)`** — solo Admin.
- **`getAvailableCategories(userId)`** — Driver: solo `{ transfer }`. Altri: tutte.
- **`isUrgent(task)`** — scadenza < 24h, non done, non scaduto.
- **`getVisibleTasks(tasks, userId)`** — filtro lista completo.
- **Helper di supporto**: `isMyTask`, `isInGlobalQueue`, `isAdmin`, `isDriver`.

### 🔒 Reducer con check permessi
- **Tutte le mutazioni task** (`MOVE_TASK`, `UPDATE_TASK`, `DELETE_TASK`, `ADD_TASK`, `ADD_TASKS_BULK`, `ADD_COMMENT`) verificano `canEditTask`/`canCreateTaskCategory` → toast rosso "Non hai i permessi" se bloccato.
- **`SET_VIEW`** e **`SET_SELECTED_TASK`** verificano `canAccessAdmin`/`canViewTask`.
- **11 azioni admin** (`ADD_TEAM_MEMBER`, `UPDATE_TEAM_MEMBER`, ecc.) bloccate centralmente nel wrapper reducer via `ADMIN_ONLY_ACTIONS` set.
- **Cestino** (`RESTORE_TASK`, `PURGE_TASK`, `EMPTY_TRASH`) → solo Admin.

### 🔄 UserSwitcher + SET_CURRENT_USER
- **`CURRENT_USER`** da `const` a **`let`** sincronizzato via `_syncCurrentUser(id)`.
- Nuovo campo **`state.currentUserId`** + action **`SET_CURRENT_USER`** (aggiorna stato + globale + redirect se view non permessa).
- Nuovo componente **`UserSwitcher`** in Topbar: dropdown con tutti gli agenti non-pending, ordinati per ruolo, indicatore ✓ sull'utente attivo. Sostituisce l'avatar statico.
- Al cambio utente: chiusura di chat/modali, redirect a dashboard se la view corrente è vietata.

### 🚐 Nuova categoria `transfer`
- Aggiunta in `CATEGORIES`: icona 🚐, colore lilla `#7B4F9E`, bg `#F3F0F9`.
- 2 task demo assegnati a Giulia (Driver): `t26` (Transfer Linate → Hotel) e `t27` (Transfer Hotel → Stazione).

### 📊 Dashboard ridisegnata
- **Saluto dinamico**: "Buongiorno, {firstName}" + badge ruolo per non-admin.
- **KPI "Task Visibili"** invece di "Task Totali" (filtrate per ruolo).
- **3 code condizionali**:
  - **`PersonalQueue`** (nuova) — le mie task non chiuse, ordinate per scadenza, con SwipeActions e indicatori urgent/overdue. Visibile a tutti.
  - **`UnassignedQueue`** (esistente) — nascosta a Driver.
  - **`UrgentOthersQueue`** (nuova) — task altrui con scadenza <24h, **read-only**, con bottone "💬 contatta" sotto ogni card. Bottone apre la chat con l'agente intestatario e messaggio precompilato (titolo + scadenza del task). Nascosta a Driver e Admin.

### 💬 ChatPanel esteso
- Nuove props: `intent`, `tasks`, `currentUserId`.
- **`intent: { toUser, taskLink }`** — all'apertura, cerca/crea conversazione diretta e precompila l'input con riferimento al task (titolo + data).
- Nuovo **`ChatContext`** per condividere tasks/currentUserId nella chat.
- `ConversationView`: nuove props `initialInput`, `onInitialInputConsumed`.

### 🧭 Sidebar / BottomNav filtrate per ruolo
- `NAV_ITEMS`: nuovo campo `roles` (array di ruoli ammessi).
- **`getNavItemsForUser(userId)`** — filtra voci nav.
- Trash + Admin → solo `admin`. Team + Planning → no `driver`.

### 📱 Filtri visibilità nelle viste
- **Kanban, Calendar, Team, Planning** filtrano via `canViewTask(t, uid)`.
- **QuickAddTask**: `Object.entries(availableCats)` invece di `CATEGORIES` diretto. Driver vede solo Transfer.
- **SwipeActions**: disabilitato automaticamente se `!canEditTask(task, CURRENT_USER)`.

### 📈 Metriche
- File da 6048 → **6617 righe** (+569 netti nella sessione permessi).
- Sintassi validata con Babel a ogni step intermedio.

---

## v0.7 — Swipe Actions mobile/tablet (sessione 7a)

> Swipe gesture per azioni rapide su task: Completato, Cestino, Inoltra con supporto Undo.

### 📱 Componente `SwipeActions`
- Wrapper riusabile (~210 righe). Touch swipe orizzontale verso destra.
- **Soglia 40%** larghezza card → "blocca aperto" (pannello 210px con 3 bottoni).
- Sotto soglia → torna chiuso con animazione spring.
- Tap fuori → chiude.
- Su desktop → componente trasparente (non intercetta).

### ✅ 3 azioni rivelate
- **✅ Fatto** (verde `--success`) → `MOVE_TASK` a `done`.
- **🗑 Cestino** (rosso `--danger`) → `DELETE_TASK`.
- **↪ Inoltra** (oro `--gold`) → apre dropdown con lista `getAssignableTeam()` per riassegnazione.

### ↶ Sistema Undo
- Nuovo campo **`state.lastAction`** in `initialState`.
- Nuova action **`UNDO_LAST_ACTION`** nel reducer (gestisce MOVE/DELETE/UPDATE).
- `MOVE_TASK`, `DELETE_TASK`, `UPDATE_TASK` ora accettano `swipe: true` per attivare undo.
- **Toast esteso**: supporta bottone "↶ Annulla" dorato, durata **5s** invece di 3s per azioni undoable.

### 🔌 Integrato in
- `KanbanCard` (mobile — **sostituisce il vecchio `<select>`** di v0.6, con hint "← scorri per azioni").
- `UnassignedQueue` (coda Dashboard).
- `Calendar` → dettaglio giorno.
- **Trash escluso**: le azioni Completato/Cestino/Inoltra non si applicano a task già cestinati.

### 📈 Metriche
- File da 5738 → **6048 righe** (+310).
- Sintassi validata con Babel a ogni step intermedio.

---

## v0.6 — Responsive (sessione 6)

> Full pass responsive su tutte le viste. Target: desktop + tablet + mobile (mobile-first, 320px+).

### 🧱 Fondamenta responsive
- **`ViewportProvider`** + hook **`useViewport()`** → espone `width`, `isMobile` (≤640px), `isTablet` (641–1024px), `isDesktop` (>1024px). Listener `resize` con `requestAnimationFrame` per smoothness.
- **Meta viewport** iniettato automaticamente al mount se assente (`width=device-width, initial-scale=1, viewport-fit=cover`).
- **Classi CSS responsive** definite nel `FontLoader` (media query con `!important` per superare gli stili inline):
  - `.vd-grid-kpi` → 4col → 2col (≤1024) → 1col (≤640)
  - `.vd-grid-2col`, `.vd-grid-3col`, `.vd-grid-dash-main` → collassano a 2col tablet, 1col mobile
  - `.vd-grid-collapse` → 1col su mobile (utility per form a colonne fisse strette)
  - `.vd-hide-mobile` → `display:none` ≤640px
  - `.vd-row-wrap` → forza `flex-wrap:wrap` ≤640px
  - `.vd-pad` → riduce padding container (32 → 18 → 14)
  - `.vd-bottom-nav` → bottom navigation visibile solo ≤1024px
  - `.vd-main-scroll` → `padding-bottom:70px` ≤1024px (spazio per la bottom nav)
- Override delle griglie con `grid-column:auto` per layout speciali (es. weekly chart con `gridColumn:"1/3"`).

### 🧭 Navigazione mobile/tablet
- Nuovo componente **`BottomNav`** (7 voci icona+label, scorre se necessario, evidenzia voce attiva con bordo dorato).
- **`Sidebar`** ritorna `null` su tablet/mobile (`isDesktop` false).
- Padding-bottom del main aumentato su mobile per non sovrapporsi alla bottom nav.

### 📱 Adattamenti per vista
- **Topbar**: padding/gap adattivi, logo testuale e blocco "nome utente + ruolo" nascosti su mobile (resta avatar), placeholder search corto, `AdvancedSearchPanel` fluido full-width (`position:fixed` su mobile, dropdown su desktop).
- **Dashboard**: padding 28→16, font header 26→21, KPI 4→2→1, griglia chart+categoria 3→2→1, scadenze/workload 2→1, coda globale con `minmax(min(100%, 280px), 1fr)`.
- **Kanban**: Board orizzontale con `scrollSnapType:"x mandatory"` su mobile. Colonne larghezza fissa **82vw** + `scrollSnapAlign:"center"`. **Drag & drop disattivato su mobile** (touch inaffidabile).
- **Calendar**: celle 100px→52px su mobile, pallini-conteggio colorati per categoria.
- **Planning**: griglia 7-giorni con scroll orizzontale snap + colonne 60vw.
- **TaskSlideOver** e **ChatPanel**: full-screen (`width:"100vw"`) su mobile.
- **QuickAddTask**: overlay con `padding:16`, card `maxWidth:"100%"` + `maxHeight:"90vh"` + `overflowY:"auto"`.

### 🎯 Dettagli sopra la bottom nav
- **FAB**: `bottom: 28/32` desktop → `80/84` mobile.
- **Toast**: `bottom: 24` → `80` su mobile.
- **NotificationsPanel**: larghezza `min(360px, calc(100vw - 24px))`.

### 📈 Metriche
- File da 5581 → **5738 righe** (+157).

---

## v0.5 — Ricerca avanzata + Admin + Coda globale + Bacheca + God Mode (sessione 5)

> Macro-release che chiude lo Step 2 di v0.4 e introduce il pannello Admin completo, la coda di task non assegnati, la bacheca avvisi e un giro di hardening generale (God Mode).

### 🔍 Ricerca avanzata topbar (chiusura v0.4)
- Nuovo componente `AdvancedSearchPanel`, accessibile da pulsante 🎛️ accanto alla search bar.
- Filtri: parola chiave, range date, multi-select categoria / status / agente.
- Default: cestinati esclusi + toggle "Includi cestinati".
- Click-outside e ESC per chiudere, autofocus keyword, anteprima risultati live ordinati per `dueDate`.

### ⚙️ Pannello Admin (nuova vista nella sidebar)
- 5 tab: Team, Import/Export, Sistema, Categorie, Log attività.
- **2 agenti pending pre-caricati** in mock per demo: Elena Marini, Matteo De Luca.

### 🙋 Coda globale (task non assegnati)
- Nuovo componente `UnassignedQueue` in Dashboard. 3 task di demo non assegnati.

### 📌 Bacheca avvisi
- Sticky notes con rotazione, 5 colori palette. Crea/modifica/pin/elimina. 3 avvisi pre-caricati.

### 🔧 Modifiche al reducer / stato
- `TEAM` e `CATEGORIES` da `const` → `let` mutabili.
- Wrapper reducer per activity log automatico.

### 🐛 God Mode — 7 bug risolti

### 📈 Metriche
- File da 3807 → **5581 righe** (+1774).

---

## v0.4 — Cestino (sessione 4, parziale)

- Soft delete + vista Cestino dedicata + filtri attivi ovunque.

---

## v0.3 — Bugfix + AI Planner + Bulk Task Creator (sessione 3)

- Badge chat fix, AI Day Planner, Bulk Task Creator con 4 tab.

---

## v0.2 — Modulo Chat (sessione 2)

- ChatPanel completo con vocali, file, reply, reazioni, typing, read receipts.

---

## v0.1 — Prima implementazione (sessione 1)

- Core app: Dashboard, Kanban, Calendar, Team, Planning, ricerca, notifiche.
