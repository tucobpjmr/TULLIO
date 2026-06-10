# 🗺️ VoyageDesk — Roadmap di Sviluppo

Documento di pianificazione. Idee organizzate in **fasi sequenziali** basate su dipendenze tecniche e valore utente.

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

---

## 📍 Punto di partenza (post v0.10)

- App stabile, Vite build, **~9000 righe** (`src/VoyageDesk.jsx`).
- Tutte le viste base: Dashboard, Kanban, Calendar, Team, Planning, Trash, Admin.
- **Responsive completo** (desktop + tablet + mobile, mobile-first) ✅.
- **Ricerca avanzata** topbar ✅.
- **Pannello Admin** con 6 tab (Team, Import/Export, Sistema, Categorie, Log, ⚙️ Impostazioni) ✅.
- **Coda globale** + **Coda personale** + **Urgenti altrui** in Dashboard ✅.
- **Bacheca avvisi** sticky notes condivisa ✅.
- **SwipeActions** mobile ✅.
- **Sistema permessi** per ruolo (Admin/Manager/Agent/Driver) ✅.
- **Multi-utente mock** con UserSwitcher in Topbar ✅.
- **Notifiche reali** dinamiche (v0.10): generate da azioni, filtrabili, click-to-navigate ✅.
- **Badge** su Sidebar/BottomNav per Admin (pending) e Dashboard (coda globale) ✅.
- **Calendario avanzato** (v0.10): viste Mese/Settimana/Giorno, click drill-down, export iCal ✅.
- **Estensioni chat** (v0.10): task link cliccabili `[task:ID]`, ricerca nel testo, presenza (Online/Occupato/Offline), template rapidi ⚡, task picker 📋 ✅.
- **Impostazioni agenzia** (v0.10): dati agenzia, CRUD template messaggi, preferenze UI ✅.
- Fase 1 completa: Clienti + Fornitori + Pratiche ✅.
- Dati ancora **solo in memoria** (no persistenza).
- Dipendenza esterna: SheetJS (`xlsx`) per import/export Excel.

---

## 🚀 Fase 1 — Modello dati completo ✅

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Anagrafica Clienti (CRM base) | ✅ | 🔴 | M | — |
| Anagrafica Fornitori | ✅ | 🔴 | M | — |
| Pratiche di viaggio | ✅ | 🔴 | L | Clienti + Fornitori |
| Collegamento Task ↔ Cliente ↔ Pratica | ✅ | 🔴 | M | i tre sopra |

---

## 🔧 Fase 2 — Operatività quotidiana ✅

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Notifiche reali | ✅ | 🔴 | M | v0.10: dinamiche, filtri, click-to-navigate, badge su nav |
| Calendario avanzato | ✅ | 🟡 | M | v0.10: viste Mese/Settimana/Giorno, iCal export |
| Estensioni chat (base) | ✅ | 🟡 | M | v0.10: task link, ricerca, presenza, template, task picker |
| Impostazioni agenzia | ✅ | 🟡 | S | v0.10: dati agenzia + template + prefs UI in Admin tab |
| Ricerca globale estesa | ✅ | — | — | Completata in v0.5 |
| Responsive | ✅ | — | — | Completato in v0.6 |
| SwipeActions mobile | ✅ | — | — | Completato in v0.7 |
| Permessi per ruolo | ✅ | — | — | Completato in v0.8 |

---

## 📈 Fase 3 — Report & catalogo

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Report & Analytics avanzati | 🔶 | 🟡 | M–L | KPI base già in Admin/Sistema. Da estendere: margini, trend, export PDF |
| Catalogo destinazioni / pacchetti | ⬜ | ⚪ | M | autonomo |

---

## 🗄️ Fase 4 — Persistenza & autenticazione

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Persistenza dati (localStorage → Supabase) | ⬜ | 🔴 | L | Scaffolding Supabase in `src/lib/supabase.js` e `src/lib/api/` |
| Login vero & AuthContext | ⬜ | 🔴 | L | Scaffolding in `src/lib/auth/` + `src/components/LoginScreen.jsx` |
| Multi-utente reale & isolamento dati | ⬜ | 🟡 | L | Dipende da login vero |
| Estensioni chat avanzate | ⬜ | ⚪ | M | Chiamate audio/video (mock UI), reazioni custom |
| AI Assistant — estensioni | 🔶 | ⚪ | M | Day planner ✅. Da fare: "Genera preventivo", auto-categorizzazione |

---

## ✨ Migliorie incrementali (ancora aperte)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Auto-move in "In Corso" al "Prendi in carico" | ⬜ | ⚪ | |
| Filtro nella coda globale (per categoria/priorità) | ⬜ | ⚪ | |
| Bacheca: menzioni @utente con notifica | ⬜ | 🟡 | Dipende da notifiche reali |
| Bacheca: avvisi con scadenza automatica | ⬜ | ⚪ | |
| Bacheca: reazioni emoji sui post-it | ⬜ | ⚪ | |
| Modifica assegnatari da `TaskSlideOver` | ⬜ | 🟡 | |
| Export Log attività in CSV | ⬜ | ⚪ | |
| Coda personale Driver: filtro per data/ora | ⬜ | 🟡 | Vista transfer-oriented |
| Indicatore visivo "read-only" sulle card urgenti altrui | ⬜ | ⚪ | Lucchetto o bordo tratteggiato |
| Permessi granulari per sub-ruolo (Senior vs Junior) | ⬜ | ⚪ | |
| Vista settimanale Calendario | ✅ | — | Completato in v0.10 |
| Dark mode | ⬜ | ⚪ | CSS variables pronte in `:root` |
| Comprimi automaticamente Sidebar desktop 1024–1280px | ⬜ | ⚪ | |
| Skeleton loading su prime render | ⬜ | ⚪ | |
| Test responsive automatici (Playwright) | ⬜ | ⚪ | ⚙️ richiede migrazione multi-file |

---

## 🧱 Traccia tecnica (trasversale)

| Intervento | Stato | Priorità | Sforzo | Quando |
|---|---|---|---|---|
| Chat `useState` → `useReducer` | ⬜ | 🟡 | S–M | Quick win |
| `TEAM`/`CATEGORIES`/`CURRENT_USER` da `let` mutabile a Context puro | ⬜ | ⚪ | M | Migrazione multi-file |
| Persistenza dati (localStorage o backend mock) | ⬜ | 🔴 | L | Fase 4 |
| Separazione in più file | ⬜ | 🟡 | M | Post-persistenza |
| TypeScript | ⬜ | ⚪ | L | Dopo refactor multi-file |
| Test unitari (Vitest) | ⬜ | ⚪ | M | Dopo TypeScript |

---

## ✅ Completato (cronologia)

- **v0.10** — Notifiche reali dinamiche + badge Sidebar/BottomNav + Calendario avanzato (Giorno + iCal) + Estensioni chat (task link, search, presenza, template, task picker) + Impostazioni agenzia (dati, template CRUD, prefs UI). ~9000 righe.
- **v0.9** — Fase 1 completa: Clienti + Fornitori + Pratiche di viaggio. Modelli dati, CRUD, pannelli dettaglio, collegamento task/fornitori/pratiche, riepilogo economico, timeline stati, numerazione PR-YYYY-NNN. 8349 righe.
- **v0.8** — Sistema Permessi per Ruolo, UserSwitcher, Dashboard con 3 code, chat intent task link, Sidebar/BottomNav per ruolo. 6617 righe.
- **v0.7** — SwipeActions mobile. 6048 righe.
- **v0.6** — Responsive full pass. 5738 righe.
- **v0.5** — Ricerca avanzata + Admin + Coda globale + Bacheca + God Mode. 5581 righe.
- **v0.4** — Cestino (soft-delete). 3807 righe.
- **v0.3** — AI Day Planner, Bulk Task Creator. 3634 righe.
- **v0.2** — Modulo chat completo. 2624 righe.
- **v0.1** — Core app. ~1800 righe.

---

## ✅ Sequenza consigliata (prossimi step)

1. **Persistenza dati** — localStorage iniziale (scaffolding Supabase già pronto). Sblocca tutto il resto.
2. **Login vero & AuthContext** — scaffolding in `src/lib/auth/`. Dipende da persistenza.
3. **Report & Analytics avanzati** — estende KPI già presenti in Admin/Sistema.
4. **Migliorie incrementali** — modifica assegnatari in TaskSlideOver, filtri coda globale.
5. **Catalogo destinazioni**.
6. **Dark mode** — CSS variables pronte.
7. **Separazione multi-file + TypeScript + Vitest**.
