# 🗺️ VoyageDesk — Roadmap di Sviluppo

Documento di pianificazione. Idee organizzate in **fasi sequenziali** basate su dipendenze tecniche e valore utente.

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

---

## 📍 Punto di partenza (post v0.10-dev / sessione 9)

- App a **7127 righe** (monolite `src/VoyageDesk.jsx`). Progetto Vite reale attivo.
- **Vite + React 18** su GitHub (`tucobpjmr/TULLIO`, branch `claude/trusting-einstein-GQM9K`, PR #6).
- **Vercel** (team `tooco-s-projects`, progetto `tullio`) — preview auto-deploy su ogni push al branch.
- **Supabase** (progetto `tullio`, ref `vmxvnxsqfisucugcpqlc`, region `eu-west-1`):
  - 6 tabelle con RLS: `users`, `tasks`, `comments`, `notices`, `conversations`, `messages`.
  - 5 utenti seedati (marco/roberto/sofia/luca/giulia, password: `tullio2026`).
  - Env vars su Vercel già configurate.
- **Auth Supabase reale** ✅ NUOVO v0.10: LoginScreen, AuthProvider, gate in main.jsx, logout nel dropdown UserSwitcher.
- **Team reale dal DB** ✅ NUOVO v0.10: `_syncTeam`/`_syncCurrentUser`/`_remapMockIds` — bootstrap pre-render del monolite.
- Tasks, notices, chat ancora **in memoria** (mock).
- Decisione presa: **Opzione B (progetto reale)** — persistenza incrementale con Supabase.
- Tutte le funzionalità v0.1–v0.9 invariate (vedi changelog).

### 🏗️ File infrastruttura aggiunti
```
src/lib/supabase.js           — client Supabase condiviso
src/lib/api.js                — CRUD layer per tutte le entità (pronto, non ancora usato dal reducer)
src/lib/auth/AuthContext.jsx  — AuthProvider + useAuth hook
src/lib/auth/LoginScreen.jsx  — schermata login
src/lib/auth/mapMember.js     — adapter DB row → shape TEAM mock
```

---

## ⚠️ Decisione chiave — PRESA

**Scelta: Opzione B — Progetto reale** (Vite + Supabase).
- Stack: React 18 + Vite 5 + Supabase (auth + postgres + realtime) + Vercel.
- Persistenza incrementale: entità per entità, UI invariata durante la migrazione.
- Roadmap split monolite: DOPO la persistenza (per non riscrivere il cablaggio due volte).

---

## 🚀 Fase 1 — Modello dati completo (il cuore gestionale)

Costruisce le entità su cui poggia tutto il resto. **Ordine vincolante: Clienti e Fornitori prima delle Pratiche.**

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Anagrafica Clienti (CRM base) | ⬜ | 🔴 | M | — |
| Anagrafica Fornitori | ⬜ | 🔴 | M | — |
| Pratiche di viaggio | ⬜ | 🔴 | L | Clienti + Fornitori |
| Collegamento Task ↔ Cliente ↔ Pratica | ⬜ | 🔴 | M | i tre sopra |

**Dettaglio Pratiche** — modulo centrale: aggrega task, documenti, pagamenti e fornitori di un singolo viaggio; numerazione progressiva (`PR-2026-001`), stati (Bozza → Confermata → In corso → Completata/Annullata), riepilogo economico, timeline eventi.

> Dopo questa fase, aggiungere il filtro **numero di pratica** nella Ricerca avanzata.

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
| Multi-utente reale & permessi | 🔶 | 🟡 | L | Auth Supabase ✅ v0.10. Team reale ✅ v0.10. Manca: isolamento dati per RLS su tasks/comments. |
| Estensioni chat (avanzate) | ⬜ | ⚪ | M | Chiamate audio/video (mock UI), reazioni custom |
| AI Assistant — estensioni | 🔶 | ⚪ | M | Day planner ✅. Da fare: "Genera preventivo" da testo, suggerimenti assegnazione, auto-categorizzazione |

---

## ✨ Migliorie incrementali emerse (post v0.5)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Badge sulla voce sidebar/bottom-nav **Admin** con conteggio agenti pending | ⬜ | 🟡 | |
| Badge sulla voce sidebar/bottom-nav **Dashboard** con conteggio coda globale | ⬜ | 🟡 | |
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
| Auth Supabase reale | ✅ | — | — | Fatto v0.10 |
| Team reale dal DB | ✅ | — | — | Fatto v0.10 (step 2a) |
| Persistenza Tasks su Supabase | ⬜ | 🔴 | M | **Prossimo step (2b)** |
| Persistenza Notices su Supabase | ⬜ | 🔴 | S | Dopo 2b |
| Persistenza Comments su Supabase | ⬜ | 🔴 | S | Dopo 2b |
| Persistenza Conversations/Messages | ⬜ | 🟡 | M | Dopo comments |
| Realtime sync (subscribeToTable) | ⬜ | 🟡 | S | Dopo persistenza base |
| Separazione monolite in più file | ⬜ | 🟡 | M | Dopo persistenza completa |
| Chat `useState` → `useReducer` | ⬜ | 🟡 | S–M | Con lo split |
| `TEAM`/`CATEGORIES`/`CURRENT_USER` da `let` a Context puro | ⬜ | ⚪ | M | Con lo split |
| TypeScript | ⬜ | ⚪ | L | Dopo split |
| Test unitari (Vitest) | ⬜ | ⚪ | M | Dopo TypeScript |

---

## 🔜 Prossimo step: 2b — Tasks su Supabase

**Cosa fare:**
1. Fix schema DB: `status` default `'da_fare'` → `'todo'` (mismatch con l'app)
2. Adapter snake_case→camelCase: `due_date`→`dueDate`, `estimated_hours`→`estimatedHours`, `deleted_at`→`deletedAt`, `created_by`→`createdBy`
3. `assignees`: DB è `uuid[]`, mock è `string[]` — già risolto con `_remapMockIds`. Il reducer al `ADD_TASK` dovrà passare UUID.
4. `client`: nel DB è `client_id text` (stringa libera per ora, non FK). Riusare così.
5. `comments`: tabella separata — al load tasks fare fetch parallelo e merge, oppure caricare on-demand all'apertura TaskSlideOver.
6. Cablare il reducer: le action `ADD_TASK`, `UPDATE_TASK`, `MOVE_TASK`, `DELETE_TASK`, `RESTORE_TASK`, `PURGE_TASK`, `ADD_COMMENT` chiamano `api.js` + aggiornano lo state.
7. Bootstrap: al mount di `VoyageDeskInner`, se sessione attiva, caricare tasks da Supabase invece dei mock.

**File da toccare:** `src/VoyageDesk.jsx` (reducer cases + effetto bootstrap) + `src/lib/api.js` (già pronto).

---

## ✅ Completato (cronologia)

- **v0.10** — Auth Supabase + Team reale (sessione 9): LoginScreen, AuthProvider, gate main.jsx, _syncTeam/_syncCurrentUser/_remapMockIds, makeInitialState lazy, logout nel UserSwitcher, .gitignore, package-lock.json. 7127 righe.
- **v0.9** — UI Ristrutturazione + Profilo (sessione 8): rimossi KPI/grafico/categoria, 4 tab coda Dashboard, CalendarPlanner unificato, rimosso Kanban, RestoreEditModal, ProfileEditor, fix responsive. 7071 righe.
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
