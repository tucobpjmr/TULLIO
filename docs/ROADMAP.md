# 🗺️ VoyageDesk — Roadmap di Sviluppo

Documento di pianificazione. Idee organizzate in **fasi sequenziali** basate su dipendenze tecniche e valore utente.

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

---

## 📍 Punto di partenza (post v0.9)

- App stabile, validata in build Vite. **~9210 righe** in `src/VoyageDesk.jsx`.
- Stack: React 18 + hooks, CSS inline + variables, useReducer + Context, SheetJS.
- Dati ancora **solo in memoria** (no localStorage/backend). Backup JSON via Admin → Import/Export.
- **Fase 1 completa**: Clienti + Fornitori + Pratiche di viaggio + collegamenti task/fornitori.
- **Fase 2 completa**: Notifiche reali, Calendario avanzato (mese/settimana/giorno + iCal mock), Estensioni chat (task link cliccabile + ricerca full-text + presence), Impostazioni agenzia (template messaggi + preferenze UI).
- **Responsive completo** (desktop + tablet + mobile, mobile-first).
- **Sistema permessi** per ruolo (Admin/Manager/Agent/Driver), UserSwitcher in Topbar.
- **SwipeActions** mobile con undo.

---

## ⚠️ Decisione chiave (ancora aperta)

| Opzione | Cosa abiliti | Cosa perdi |
|---|---|---|
| **A — Resti su artifact / single-file** | Sviluppo rapido, zero setup | Niente persistenza, niente multi-file/TS/test/backend reale |
| **B — Progetto Vite reale** (in corso, già migrato) | Persistenza, TS, test, backend, multi-utente reale | Setup iniziale fatto |

> Il progetto è già migrato a Vite (`src/VoyageDesk.jsx` + `vite.config.js`). Le voci marcate ⚙️**B** richiedono il completamento della separazione in moduli o l'aggiunta di persistenza.

---

## 🚀 Fase 1 — Modello dati completo ✅

| Modulo | Stato | Note |
|---|---|---|
| Anagrafica Clienti (CRM base) | ✅ | v0.9 |
| Anagrafica Fornitori | ✅ | v0.9 |
| Pratiche di viaggio | ✅ | v0.9 — numerazione PR-YYYY-NNN, stati, riepilogo economico, timeline |
| Collegamento Task ↔ Cliente ↔ Pratica | ✅ | v0.9 |

---

## 🔧 Fase 2 — Operatività quotidiana ✅

| Modulo | Stato | Note |
|---|---|---|
| Notifiche reali | ✅ | v0.9 — iniettate dal reducer, filtri + segna tutte lette, badge nav |
| Calendario avanzato | ✅ | v0.9 — viste mese/settimana/giorno, iCal mock, drill-down |
| Estensioni chat (base) | ✅ | v0.9 — task link cliccabile, ricerca full-text, presence |
| Impostazioni agenzia | ✅ | v0.9 — tab Admin con dati agenzia, template messaggi, preferenze UI |
| Ricerca globale estesa | ✅ | v0.5 |
| Responsive | ✅ | v0.6 |
| SwipeActions mobile | ✅ | v0.7 |
| Permessi per ruolo | ✅ | v0.8 |

---

## 📊 Fase 3 — Report & catalogo

> Il **modulo finanziario** è stato escluso su decisione del prodotto. Le info economiche restano embedded nelle Pratiche (budget/ricavi/costi/margine) ma non c'è un modulo finanziario separato.

| Modulo | Stato | Priorità | Sforzo | Dipende da |
|---|---|---|---|---|
| Report & Analytics | 🔶 | 🟡 | M–L | KPI base già in Admin/Sistema. Estendere con: trend temporali, breakdown per agente/cliente/categoria, export PDF |
| Catalogo destinazioni / pacchetti | ⬜ | 🟡 | M | autonomo — galleria destinazioni con foto, prezzi indicativi, periodo migliore |

---

## 📈 Fase 4 — Scala & accessi

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Persistenza dati | ⬜ | 🔴 | L | localStorage iniziale, poi backend Supabase (config già presente). ⚙️**B** |
| Multi-utente reale & auth | 🔶 | 🟡 | L | Matrice permessi ✅ v0.8. Manca login vero. Auth + LoginScreen + AuthContext già scaffoldati. ⚙️**B** |
| Estensioni chat (avanzate) | ⬜ | ⚪ | M | Chiamate audio/video (mock UI), reazioni custom |
| AI Assistant — estensioni | 🔶 | ⚪ | M | Day planner ✅. Da fare: "Genera preventivo" da testo, suggerimenti assegnazione, auto-categorizzazione |

---

## ✨ Migliorie incrementali aperte

### Workflow & task
| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Toast personalizzato "Hai preso in carico: \[titolo\]" | ⬜ | ⚪ | |
| Auto-move in "In Corso" al "Prendi in carico" | ⬜ | ⚪ | |
| Notifica al manager se un task resta in coda > N ore | ⬜ | 🟡 | Notifiche reali ora disponibili |
| Filtro nella coda globale (per categoria/priorità) | ⬜ | ⚪ | |
| Modifica assegnatari da `TaskSlideOver` | ⬜ | 🟡 | |
| Export Log attività in CSV | ⬜ | ⚪ | |
| Indicatore visivo "read-only" sulle card urgenti altrui | ⬜ | ⚪ | Lucchetto o bordo tratteggiato |
| Coda personale Driver: agenda giornaliera transfer | ⬜ | 🟡 | Vista transfer-oriented per Giulia |

### Bacheca avvisi
| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Menzioni @utente con notifica | ⬜ | 🟡 | Notifiche reali ora disponibili |
| Avvisi con scadenza automatica | ⬜ | ⚪ | |
| Reazioni emoji sui post-it | ⬜ | ⚪ | |
| Tag/categorie filtrabili | ⬜ | ⚪ | |

### UI/UX
| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Comprimi automaticamente Sidebar desktop tra 1024–1280px | ⬜ | ⚪ | |
| Skeleton loading su prime render | ⬜ | ⚪ | |
| Dark mode | ⬜ | ⚪ | CSS variables pronte |
| Test responsive automatici (Playwright) | ⬜ | ⚪ | ⚙️**B** |

### Permessi & multi-utente
| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Permessi granulari per sub-ruolo (Senior vs Junior) | ⬜ | ⚪ | Oggi trattati identicamente come "agent" |
| Notifica in-app al cambio utente (rollback automatico dopo X secondi?) | ⬜ | ⚪ | Evita che si lasci l'app loggata come Admin |

---

## 🧱 Traccia tecnica (trasversale)

| Intervento | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Chat `useState` → `useReducer` | ⬜ | 🟡 | S–M | Pulizia, opzionale |
| `TEAM`/`CATEGORIES`/`CURRENT_USER` da `let` mutabile a Context puro | ⬜ | ⚪ | M | Funzionale oggi |
| Persistenza dati (localStorage o Supabase) | ⬜ | 🔴 | L | Scaffolding Supabase già presente in `src/lib/supabase.js` |
| Separazione `VoyageDesk.jsx` in moduli | ⬜ | 🟡 | M | File ora ~9210 righe |
| TypeScript | ⬜ | ⚪ | L | Dopo refactor multi-file |
| Test unitari (Vitest) | ⬜ | ⚪ | M | Dopo TypeScript |

---

## ✅ Completato (cronologia)

- **v0.9** — Fase 1 + Fase 2 complete. Clienti + Fornitori + Pratiche (PR-YYYY-NNN) + collegamenti. Notifiche dinamiche con badge nav. Calendario mese/settimana/giorno + iCal mock + drill-down. Chat: task link cliccabile, ricerca full-text con highlight, presence states, template messaggi nel composer. Tab Admin "Impostazioni" (dati agenzia, template CRUD, preferenze UI). ~9210 righe.
- **v0.8** — Sistema Permessi per Ruolo. Multi-utente mock con UserSwitcher. Categoria `transfer` 🚐 per Driver. Chat con intent. 6617 righe.
- **v0.7** — SwipeActions mobile + undo. 6048 righe.
- **v0.6** — Responsive full pass. ViewportProvider, BottomNav, classi CSS responsive. 5738 righe.
- **v0.5** — Ricerca avanzata + Admin (5 tab) + Coda globale + Bacheca + God Mode. 5581 righe.
- **v0.4** — Cestino (soft-delete). 3807 righe.
- **v0.3** — AI Day Planner + Bulk Task Creator. 3634 righe.
- **v0.2** — Modulo chat completo. 2624 righe.
- **v0.1** — Core app. ~1800 righe.

---

## ✅ Sequenza consigliata (post v0.9)

1. **Persistenza dati** (Fase 4) — primo blocco vero, sblocca tutto il resto. Inizia con localStorage → poi Supabase.
2. **Login vero & AuthContext** (Fase 4) — sostituisce UserSwitcher mock.
3. **Report & Analytics avanzati** (Fase 3) — sfrutta i dati Pratiche già esistenti.
4. **Migliorie incrementali** in parallelo (Auto-move, filtri coda, modifica assegnatari da TaskSlideOver).
5. **Catalogo destinazioni** (Fase 3) — valore per vendita.
6. **Dark mode** — variables CSS già pronte.
7. **Separazione multi-file** + **TypeScript** + **test** quando il file supera ~10k righe.
