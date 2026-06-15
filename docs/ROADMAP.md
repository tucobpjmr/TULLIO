# 🗺️ VoyageDesk — Roadmap di Sviluppo

Documento di pianificazione. Idee organizzate in **fasi sequenziali** basate su dipendenze tecniche e valore utente.

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

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
| Anagrafica Clienti (CRM base) | ✅ | 🔴 | M | — |
| Anagrafica Fornitori | ✅ | 🔴 | M | — |
| Pratiche di viaggio | ✅ | 🔴 | L | Clienti + Fornitori |
| Collegamento Task ↔ Cliente ↔ Pratica | ✅ | 🔴 | M | i tre sopra |
| Fornitori collegati a Pratica (DossierSuppliers) | ✅ | 🟡 | S | Pratiche |
| Filtro numero pratica in Ricerca avanzata | ✅ | 🟡 | S | Pratiche |

**Dettaglio Pratiche** — modulo centrale: aggrega task, documenti, pagamenti e fornitori di un singolo viaggio; numerazione progressiva (`PR-2026-001` ✅), stati (Bozza → Confermata → In corso → Completata/Annullata ✅), riepilogo economico, timeline eventi.

**Stato sessione 20**: ✅ **Fase 1 COMPLETA**. Task↔Pratica (PR #51, caveat #26 chiuso), Fornitori della pratica (PR #52, caveat #27 chiuso), filtro pratica in Ricerca avanzata (PR #53). Nessun caveat aperto.

**Stato sessione 21** (PR #56 draft): quick wins v17 — badge partenze imminenti, deep-link notifiche→pratica (caveat #28 aperto), selettore pratica in BulkTaskCreator, tema celeste shell.

---

## 🔧 Fase 2 — Operatività quotidiana

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Notifiche reali | ⬜ | 🔴 | M | Collegate ad azioni (scadenze, assegnazioni, commenti, pending, coda > N ore); filtri + "segna tutte lette" |
| Calendario avanzato | ⬜ | 🟡 | M | Viste settimanale/giornaliera, eventi multipli, iCal (mock) |
| Estensioni chat (base) | ⬜ | 🟡 | S–M | Ricerca nelle conversazioni, stato online/occupato, rich preview di task/pratiche, **task link cliccabile** nel messaggio |
| Impostazioni agenzia | 🔶 | 🟡 | S | Gestione categorie e nome agenzia già in Admin. Manca: template messaggi, profilo utente, preferenze UI |
| Ricerca globale estesa | ✅ | — | — | Completata in v0.5. |
| Responsive (mobile/tablet/desktop) | ✅ | — | — | Completato in v0.6. |
| SwipeActions mobile | ✅ | — | — | Completato in v0.7. |
| Permessi per ruolo | ✅ | — | — | Completato in v0.8. |

---

## 💰 Fase 3 — Business

Ha senso **solo dopo le Pratiche** (servono dati reali).

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Report & Analytics | 🔶 | 🟡 | M–L | KPI base già in Admin/Sistema. Da estendere con: trend temporali, export PDF |
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
| Badge sulla voce sidebar/bottom-nav **Admin** con conteggio agenti pending | ✅ | — | Step F |
| Badge sulla voce sidebar/bottom-nav **Dashboard** con conteggio coda globale | ✅ | — | Step F |
| Badge sulla voce sidebar/bottom-nav **Pratiche** con partenze imminenti (≤7gg) | ✅ | — | sessione 21, PR #56 |
| Toast personalizzato "Hai preso in carico: \[titolo\]" | ⬜ | ⚪ | |
| Auto-move in "In Corso" al "Prendi in carico" | ⬜ | ⚪ | |
| Notifica al manager se un task resta in coda > N ore | ⬜ | 🟡 | Dipende da notifiche reali |
| Filtro nella coda globale (per categoria/priorità) | ⬜ | ⚪ | |
| Bacheca: menzioni @utente con notifica | ⬜ | 🟡 | Dipende da notifiche reali |
| Bacheca: avvisi con scadenza automatica | ⬜ | ⚪ | |
| Bacheca: reazioni emoji sui post-it | ⬜ | ⚪ | |
| Bacheca: tag/categorie filtrabili | ⬜ | ⚪ | |
| Modifica assegnatari da `TaskSlideOver` | ⬜ | 🟡 | |
| Permessi granulari per ruolo | ✅ | — | Completato in v0.8 |
| Export Log attività in CSV | ⬜ | ⚪ | |

## ✨ Migliorie incrementali emerse (post v0.6)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Vista settimanale Calendario | ⬜ | 🟡 | Utile specialmente su mobile |
| Comprimi automaticamente Sidebar desktop tra 1024–1280px | ⬜ | ⚪ | |
| Skeleton loading su prime render | ⬜ | ⚪ | |
| Dark mode | ⬜ | ⚪ | CSS variables pronte |
| Test responsive automatici (Playwright) | ⬜ | ⚪ | ⚙️**B** |

## ✨ Migliorie incrementali emerse (post v0.8)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Task link cliccabile nella chat (apre TaskSlideOver) | ⬜ | 🟡 | Oggi è testo precompilato, non interattivo |
| Permessi granulari per sub-ruolo (Senior vs Junior) | ⬜ | ⚪ | Oggi trattati identicamente come "agent" |
| Coda personale Driver: filtro per data/ora (tipo agenda giornaliera) | ⬜ | 🟡 | Giulia ha bisogno di una vista transfer-oriented |
| Indicatore visivo "read-only" sulle card urgenti altrui | ⬜ | ⚪ | Lucchetto o bordo tratteggiato |
| Notifica in-app al cambio utente (rollback automatico dopo X secondi?) | ⬜ | ⚪ | Per evitare che qualcuno lasci l'app loggato come Admin |

---

## 🧱 Traccia tecnica (trasversale)

| Intervento | Stato | Priorità | Sforzo | Quando |
|---|---|---|---|---|
| Chat `useState` → `useReducer` | ⬜ | 🟡 | S–M | Fattibile in Opzione A |
| `TEAM`/`CATEGORIES`/`CURRENT_USER` da `let` mutabile a Context puro | 🔶 | ⚪ | M | Step P Phase 2c (PR #35) ha estratto in `src/state/appGlobals.js` con live bindings + setter; migrazione a Context puro React resta aperta |
| Persistenza dati (Supabase) | ✅ | — | — | Completata (Step C–D) |
| Separazione in più file | 🔶 | 🟡 | M | Step P Phase 1→2e mergeate (catena #32→#36 + #38). Resta l'estrazione dei cluster grandi di componenti |
| TypeScript | ⬜ | ⚪ | L | Dopo Phase 2e completa |
| Test unitari (Vitest) | ⬜ | ⚪ | M | Dopo TypeScript |

---

## 🔧 Step P — Refactor monolite (caveat #15)

Obiettivo: portare `src/VoyageDesk.jsx` da ~8300 righe a uno **shell sottile** che importa moduli, eliminando il pattern di stato mutabile globale via `_sync*`.

### Stato corrente (tutte le PH 1→2g MERGEATE in `main`)

| Phase | Stato | PR | Output | Δ monolite |
|-------|-------|----|--------|-----------|
| **1** — Rimozione mutazione in-place | ✅ | #32 | `_sync*` → riassegnazione diretta | 0 (refactor pattern) |
| **2a** — Costanti + utility pure | ✅ | #33 | `lib/taskConstants.js` + `lib/taskUtils.js` | −300 |
| **2b** — Dati mock | ✅ | #34 | `state/mockData.js` | −100 |
| **2c** — Globali + permessi | ✅ | #35 | `state/appGlobals.js` (live bindings + setter) | −70 |
| **2d** — Reducer | ✅ | #36 | `state/reducer.js` | −370 |
| **2e** — Componenti (avvio) | ✅ | #38 | `components/Viewport.jsx`, `SwipeActions.jsx`, `ui/` (Avatar/Badge/Chip/Toast) | −355 |
| **2f** — Componenti (8 cluster grandi) | ✅ | #39–#47 | `components/` (modals/dashboard/calendar/chat/tasks/admin/views/shell) + `lib/xlsx.js` | −6410 |
| **2g** — `React.lazy` code-splitting | ✅ | #41 | Lazy-load AdminView/Bulk/AIDayPlanner/TaskSlideOver + `LazyFallback` | index −13.2 kB gz (−20%) |

**Cumulativo:** 8325 → **903 righe** (−7422, −88%); ~955 righe dopo Phase 2g (wrapper Suspense + LazyFallback).

### ✅ Step P COMPLETO (Phase 1 → 2g)

Phase 2g (PR #41, sessione 18): `React.lazy` + `<Suspense>` sui 4 componenti pesanti caricati on-demand. Bundle `index` 268.60 → 205.13 kB (64.11 → **50.90 kB gz, −20%**) + 4 chunk async (AdminView 7.12, Bulk 6.00, AIDayPlanner 3.28, TaskSlideOver 2.18 kB gz). La stima v12 di −100 kB confondeva raw/gz: il guadagno reale gz è −13.2 kB.

Vedi `docs/HANDOFF_SESSION_2026-06-14_v13.md` per il dettaglio sessione 18 (Phase 2g + quick win #10/#18/#3/#8/#2/#25).

---

## ✅ Completato (cronologia)

- **v2.2-dev** — **Fase 1 COMPLETA** (PR #51/#52/#53): collegamento Task↔Pratica (`dossierId` su QuickAddTask/TaskSlideOver), pannello fornitori in `PraticaDetail` (`FornitoriPanel`), filtro pratica nella Ricerca avanzata. Caveat #26 e #27 chiusi. Build: 252.04 kB / 59.47 kB gz.

- **v2.1-dev** — **Fase 1 CRM base** (PR #49): Anagrafica Clienti (`ClientiView`), Fornitori (`FornitoriView`), Pratiche di viaggio (`PraticheView`). DB trigger auto-numerazione `PR-YYYY-NNN`. API/mappers/reducer/sidebar/VoyageDesk wiring. Build: 245.71 kB / 58.15 kB gz.

- **v2.0-dev** — Step P **Phase 2g** (code-splitting `React.lazy`, PR #41) + quick win: caveat **#10** (`useDebouncedTableSubscription`, #42), **#18** (mojibake CSV UTF-8, #43), **#3** (heartbeat 30s, #44), **#8** (calendar weekOffset, #45). Mergeati anche #46 (#2), #47 (#25), #48 (docs v13). Step P completo (Phase 1 → 2g).

- **v1.8-dev** — Step P (Phase 1 → 2e): refactor monolite. Rimosso `_sync*`; estratti costanti task, utility pure, dati mock, globali + permessi, reducer, e primo slice di componenti (Viewport/SwipeActions/ui). `VoyageDesk.jsx` 8325 → 7313 righe. Catena #32→#36 + #38, tutte mergeate (squash).
- **v1.7-dev** — Step R (drift repo↔DB, 14 migrazioni recuperate, #30) + Step S (wiring `email`/`phone` su `user_contacts`, #31). Caveat #19 + #24 chiusi.
- **v1.6-dev** — Step Q: Hardening realtime + chat (withOrigin completo, race init reducer, toast errori reactions/markRead, RPC bulk markRead). PR #24.
- **v1.5-dev** — Step M (storage file chat reale, bucket `chat-files`) + Step O (logout UI). PR #22.
- **v1.4-dev** — Step N: code-splitting. Bundle iniziale 1039 → 262 KB (lazy `xlsx`, manualChunks). PR #18.
- **v1.3-dev** — Step L: origin-tagging realtime (caveat #5).
- **v1.2-dev** — Step J (notifiche complete) + Step K (task link via `task_ref`).
- **v1.0–v1.1-dev** — Persistenza Supabase + Auth (Step C–D) + robustezza sync/notifiche/calendario/chat/dashboard (Step E–I).

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
4. **Fase 2 residua** (Calendario avanzato, estensioni chat) + **Fase 3** (Report avanzati, catalogo).
5. **Fase 4** (multi-utente reale).
6. Migliorie incrementali post-v0.5/v0.6/v0.8 inserite dove pertinenti.
7. Traccia tecnica man mano, se in Opzione B.
