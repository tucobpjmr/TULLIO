# 🗺️ VoyageDesk — Roadmap di Sviluppo

Documento di pianificazione. Idee organizzate in **fasi sequenziali** basate su dipendenze tecniche e valore utente.

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

---

## 📍 Punto di partenza (post v0.9.10)

- App su Vite (no più artifact).
- **Persistenza `localStorage`** (state + chat versionati + reset).
- **🎉 Fase 1 — Modello dati 100%**: Clienti + Fornitori + Pratiche (`PR-YYYY-NNN`, 5 stati, economia, timeline). Collegamenti `clientId`+`supplierId`+`practiceId`. Picker triplo, auto-suggest cliente da pratica. Filtro numero pratica.
- **🎉 Fase 2 — Operatività 100%**:
  - **Notifiche reali** + **overdue automatici** (sweep al mount/cambio utente).
  - **Dark mode** con CSS vars override.
  - **Chat avanzata**: task link cliccabile, ricerca nei messaggi, presence status online/busy/away/offline mock.
  - **Calendario completo**: Mese (esistente) + Settimana (v0.9.6) + **Giorno** (v0.9.10) + **export iCal** (.ics download).
- **Editor assegnatari** da TaskSlideOver, **agenda Driver** transfer-oriented, **badge nav** contatori.
- File `VoyageDesk.jsx` monolitico (~10720 righe) — splitting è il primo step della traccia tecnica.

**Restano in Fase 3:** Modulo finanziario, Report & Analytics avanzati, Catalogo destinazioni.

**Traccia tecnica:** splittare il file, TypeScript, test unitari, backend reale.

---

## 📍 Punto di partenza (post v0.8)

- App stabile e validata sintatticamente (Babel) a **6617 righe**.
- Tutte le viste base: Dashboard, Kanban, Calendar, Team, Planning, Trash, Admin.
- **Responsive completo** (desktop + tablet + mobile, mobile-first) ✅.
- **Ricerca avanzata** topbar (🎛️) ✅.
- **Pannello Admin** con 5 tab ✅.
- **Coda globale** + **Coda personale** + **Urgenti altrui** in Dashboard ✅.
- **Bacheca avvisi** sticky notes condivisa ✅.
- **SwipeActions** mobile (Fatto/Cestino/Inoltra) con undo ✅ NUOVO v0.7.
- **Sistema permessi** per ruolo (Admin/Manager/Agent/Driver) ✅ NUOVO v0.8.
- **Multi-utente mock** con UserSwitcher in Topbar ✅ NUOVO v0.8.
- **Categoria `transfer`** per Driver ✅ NUOVO v0.8.
- Chat + AI Day Planner + Bulk Task Creator + Cestino tutti operativi ✅.
- Chat con `intent` per apertura contestuale (task link) ✅ NUOVO v0.8.
- TEAM, CATEGORIES e CURRENT_USER gestiti come stato mutabile via reducer.
- Dipendenza esterna: SheetJS (`xlsx`) — eccezione documentata.
- Dati ancora **solo in memoria**, single-file artifact.

---

## ⚠️ Decisione chiave (ancora aperta)

| Opzione | Cosa abiliti | Cosa perdi |
|---|---|---|
| **A — Resti su artifact** | Sviluppo rapido, zero setup | Niente persistenza, niente multi-file/TS/test/backend reale |
| **B — Progetto reale** (Vite + più file) | Persistenza, TS, test, backend, multi-utente reale | Setup iniziale, esci dall'artifact |

👉 La maggior parte delle voci sotto funziona in opzione A. Le voci marcate ⚙️**B** richiedono il passaggio a progetto reale.

---

## 🚀 Fase 1 — Modello dati completo (il cuore gestionale)

Costruisce le entità su cui poggia tutto il resto. **Ordine vincolante: Clienti e Fornitori prima delle Pratiche.**

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Anagrafica Clienti (CRM base) | ✅ | — | M | Completato in v0.9.5 — entità Client, vista dedicata, modale CRUD, picker in QuickAddTask, chip cliente in TaskSlideOver |
| Anagrafica Fornitori | ✅ | — | M | Completato in v0.9.7 — entità Supplier mirror di Client, vista dedicata, modale CRUD, picker in QuickAddTask, chip in TaskSlideOver |
| Pratiche di viaggio | ✅ | — | L | Completato in v0.9.8 — `PR-YYYY-NNN` auto-numbering, 5 stati, riepilogo economico, timeline eventi, modale 5-sezioni |
| Collegamento Task ↔ Cliente ↔ Pratica | ✅ | — | M | Completato in v0.9.8 — campi `clientId`+`practiceId` su task, picker QuickAddTask con auto-suggest cliente da pratica |

**Dettaglio Pratiche** — modulo centrale: aggrega task, documenti, pagamenti e fornitori di un singolo viaggio; numerazione progressiva (`PR-2026-001`), stati (Bozza → Confermata → In corso → Completata/Annullata), riepilogo economico, timeline eventi.

> ~~Dopo questa fase, aggiungere il filtro **numero di pratica** nella Ricerca avanzata.~~ ✅ Fatto in v0.9.8.

---

## 🔧 Fase 2 — Operatività quotidiana

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Notifiche reali | ✅ | — | M | Completato in v0.9.9 — schema `recipientId`-aware, generazione automatica nel wrapper reducer (assignment, comment, status, pending, practice status), pannello con filtri + segna tutte lette + pulisci lette. Scadenze auto-generate (overdue check schedulato) rimandate. |
| Calendario avanzato | ✅ | — | M | Settimana (v0.9.6) + Giorno (v0.9.10) + iCal export (v0.9.10). Eventi multipli rimandati se serviranno. |
| Estensioni chat (base) | ✅ | — | S–M | Task link cliccabile ✅ v0.9.3. Ricerca estesa ✅ v0.9.9. Presence online/busy/away/offline ✅ v0.9.10. Rich preview pratiche rimandato. |
| Impostazioni agenzia | 🔶 | 🟡 | S | Gestione categorie e nome agenzia già in Admin. Manca: template messaggi, profilo utente, preferenze UI |
| Ricerca globale estesa | ✅ | — | — | Completata in v0.5. |
| Responsive (mobile/tablet/desktop) | ✅ | — | — | Completato in v0.6. |
| SwipeActions mobile | ✅ | — | — | Completato in v0.7. |
| Permessi per ruolo | ✅ | — | — | Completato in v0.8. |

---

## 💰 Fase 3 — Business & finanza

Ha senso **solo dopo le Pratiche** (servono dati reali).

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Modulo finanziario | ⬜ | 🔴 | L | Pratiche |
| Report & Analytics | 🔶 | 🟡 | M–L | KPI base già in Admin/Sistema. Da estendere con: margini, trend temporali, export PDF |
| Catalogo destinazioni / pacchetti | ⬜ | 🟡 | M | autonomo |

---

## 📈 Fase 4 — Scala & accessi

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Multi-utente reale & permessi | 🔶 | 🟡 | L | Matrice permessi ✅ v0.8. Manca login vero e isolamento dati. ⚙️**B** per autenticazione |
| Estensioni chat (avanzate) | ⬜ | ⚪ | M | Chiamate audio/video (mock UI), reazioni custom |
| AI Assistant — estensioni | 🔶 | ⚪ | M | Day planner ✅. Da fare: "Genera preventivo" da testo, suggerimenti assegnazione, auto-categorizzazione |

---

## ✨ Migliorie incrementali emerse (post v0.5)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Badge sulla voce sidebar/bottom-nav **Admin** con conteggio agenti pending | ✅ | — | Completato in v0.9.2 |
| Badge sulla voce sidebar/bottom-nav **Dashboard** con conteggio coda globale | ✅ | — | Completato in v0.9.2 |
| Toast personalizzato "Hai preso in carico: \[titolo\]" | ⬜ | ⚪ | |
| Auto-move in "In Corso" al "Prendi in carico" | ⬜ | ⚪ | |
| Notifica al manager se un task resta in coda > N ore | ⬜ | 🟡 | Dipende da notifiche reali |
| Filtro nella coda globale (per categoria/priorità) | ⬜ | ⚪ | |
| Bacheca: menzioni @utente con notifica | ⬜ | 🟡 | Dipende da notifiche reali |
| Bacheca: avvisi con scadenza automatica | ⬜ | ⚪ | |
| Bacheca: reazioni emoji sui post-it | ⬜ | ⚪ | |
| Bacheca: tag/categorie filtrabili | ⬜ | ⚪ | |
| Modifica assegnatari da `TaskSlideOver` | ✅ | — | Completato in v0.9.2 |
| Permessi granulari per ruolo | ✅ | — | Completato in v0.8 |
| Export Log attività in CSV | ⬜ | ⚪ | |

## ✨ Migliorie incrementali emerse (post v0.6)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Vista settimanale Calendario | ✅ | — | Completato in v0.9.6 — time-grid orario desktop, day-tab+lista mobile, now-line |
| Comprimi automaticamente Sidebar desktop tra 1024–1280px | ⬜ | ⚪ | |
| Skeleton loading su prime render | ⬜ | ⚪ | |
| Dark mode | ✅ | — | Completato in v0.9.9 — toggle in UserSwitcher, override CSS vars via `html[data-theme="dark"]`, persistito |
| Test responsive automatici (Playwright) | ⬜ | ⚪ | ⚙️**B** |

## ✨ Migliorie incrementali emerse (post v0.8)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Task link cliccabile nella chat (apre TaskSlideOver) | ✅ | — | Completato in v0.9.3 — chip `TaskLinkChip` con check `canViewTask` |
| Permessi granulari per sub-ruolo (Senior vs Junior) | ⬜ | ⚪ | Oggi trattati identicamente come "agent" |
| Coda personale Driver: filtro per data/ora (tipo agenda giornaliera) | ✅ | — | Completato in v0.9.4 — chip Oggi/Domani/Tutte, agenda raggruppata per giorno, orario in evidenza |
| Indicatore visivo "read-only" sulle card urgenti altrui | ⬜ | ⚪ | Lucchetto o bordo tratteggiato |
| Notifica in-app al cambio utente (rollback automatico dopo X secondi?) | ⬜ | ⚪ | Per evitare che qualcuno lasci l'app loggato come Admin |

---

## 🧱 Traccia tecnica (trasversale)

| Intervento | Stato | Priorità | Sforzo | Quando |
|---|---|---|---|---|
| Chat `useState` → `useReducer` | ⬜ | 🟡 | S–M | Fattibile in Opzione A |
| `TEAM`/`CATEGORIES`/`CURRENT_USER` da `let` mutabile a Context puro | ⬜ | ⚪ | M | Funzionale oggi, ma più pulito |
| Persistenza dati (localStorage) | ✅ | — | — | Completata v0.9.1 — `loadPersistedState`/`savePersistedState`. Backend reale ancora da fare. |
| Separazione in più file | ⬜ | 🟡 | M | ⚙️**B** |
| TypeScript | ⬜ | ⚪ | L | Dopo refactor multi-file ⚙️**B** |
| Test unitari (Vitest) | ⬜ | ⚪ | M | Dopo TypeScript ⚙️**B** |

---

## ✅ Completato (cronologia)

- **v0.8** — Sistema Permessi per Ruolo: helper centralizzati (canViewTask/canEditTask/…), check nel reducer, UserSwitcher in Topbar, Dashboard con 3 code condizionali (PersonalQueue/UnassignedQueue/UrgentOthersQueue), chat con intent per task link, Sidebar/BottomNav filtrate per ruolo, QuickAddTask categorie filtrate, nuova categoria `transfer` 🚐 + 2 task demo. 6617 righe.
- **v0.7** — SwipeActions mobile: wrapper riusabile, swipe→3 bottoni (Fatto/Cestino/Inoltra), undo con toast 5s, integrato in KanbanCard/UnassignedQueue/Calendar/PersonalQueue. 6048 righe.
- **v0.6** — Responsive full pass: ViewportProvider/useViewport, classi CSS responsive, BottomNav, tutte le viste adattate, FAB/Toast sopra bottom nav. 5738 righe.
- **v0.5** — Ricerca avanzata + Admin + Coda globale + Bacheca + God Mode. 5581 righe.
- **v0.4** — Cestino (soft-delete). 3807 righe.
- **v0.3** — Bug fix, AI Day Planner, Bulk Task Creator. 3634 righe.
- **v0.2** — Modulo chat completo. 2624 righe.
- **v0.1** — Core app. ~1800 righe.

---

## ✅ Sequenza consigliata (sintesi aggiornata)

1. **Decidi A o B** (persistenza sì/no).
2. **Fase 1** — Clienti → Fornitori → Pratiche → collegamenti.
3. **Notifiche reali** (Fase 2) — sblocca badge, alert su pending/coda, menzioni in bacheca.
4. **Fase 3** — Finanziario, poi Report avanzati.
5. **Fase 2 residua** (Calendario avanzato, estensioni chat) + **Fase 4** (multi-utente reale).
6. Migliorie incrementali post-v0.5/v0.6/v0.8 inserite dove pertinenti.
7. Traccia tecnica man mano, se in Opzione B.
