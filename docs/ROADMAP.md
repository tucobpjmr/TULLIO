# 🗺️ VoyageDesk — Roadmap di Sviluppo

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

---

## 📍 Stato attuale (post sessione 11 — v0.12-dev)

- **File**: `src/VoyageDesk.jsx` — **8025 righe**, single-file React, Vite project ✅
- **Deploy**: Vercel preview automatico su ogni PR ✅
- **Branch attivo**: `claude/endorf-roadmap-review-oUDia` → PR #7 (draft, da mergiare)
- **Dati**: in memoria (no persistenza). Supabase infrastruttura pronta ma non connessa.

### Feature completate (riepilogo)
- Dashboard con 4 tab code (Globale / Personale / Scadute / Urgenti) ✅
- Calendario unificato (mese + settimana) ✅
- Team & assegnazioni ✅
- Pannello Admin (5 tab: Team, Import/Export, Sistema, Categorie, Log) ✅
- Chat completa (voce, reazioni, read receipts, typing, intent per task) ✅
- AI Day Planner ✅
- Bulk Task Creator (4 tab: manuale, duplica, CSV/Excel, template) ✅
- Cestino con restore + pre-restore editing ✅
- Bacheca avvisi sticky notes ✅
- Profilo personale con foto ✅
- Responsive completo (320px+), SwipeActions mobile, BottomNav ✅
- Ricerca avanzata con filtri multipli ✅
- Sistema permessi per ruolo (Admin/Manager/Agent/Driver) ✅
- Multi-utente mock con UserSwitcher ✅
- **Anagrafica Clienti CRM** (v0.10): lista, dettaglio, CRUD, import CSV/Excel ✅
- **QuickAddTask semplificato** (v0.11): cliente da dropdown + categoria → titolo auto ✅
- **Import clienti CSV** (v0.11): mapping colonne intelligente, anteprima duplicati ✅
- **Notifiche dinamiche** (v0.12): scaduti, 24h, coda, pending — generati dallo state ✅
- **Badge live nav** (v0.12): Dashboard (coda globale) + Admin (pending) ✅

---

## 🚀 Fase 1 — Modello dati

| Modulo | Stato | Note |
|--------|-------|------|
| Anagrafica Clienti (CRM base) | ✅ | v0.10 |
| Collegamento Task ↔ Cliente | ✅ | v0.11 — QuickAddTask con dropdown clienti |
| Anagrafica Fornitori | ~~rimossa~~ | Non necessaria per il flusso |
| Pratiche di viaggio | ~~deprioritizzata~~ | |

---

## 🔧 Fase 2 — Operatività quotidiana

| Modulo | Stato | Priorità | Sforzo | Note |
|--------|-------|----------|--------|------|
| Notifiche reali | ✅ | 🔴 | M | v0.12 — dinamiche, badge, segna lette, click → task |
| Badge sidebar/bottom-nav | ✅ | 🟡 | S | v0.12 — Dashboard + Admin |
| Task link cliccabile in chat | ⬜ | 🟡 | S | Testo precompilato → click apre TaskSlideOver |
| Modifica assegnatari da TaskSlideOver | ⬜ | 🟡 | S | Oggi solo dall'edit completo |
| Filtro coda Driver per data/ora | ⬜ | 🟡 | S | Vista transfer-oriented per Giulia |
| Filtro coda globale (cat/priorità) | ⬜ | ⚪ | S | |
| Estensioni chat (ricerca, rich preview) | ⬜ | 🟡 | M | |
| Calendario avanzato | ⬜ | 🟡 | M | Viste giornaliera, eventi multipli |
| Impostazioni agenzia | 🔶 | 🟡 | S | Template messaggi, preferenze UI |

---

## 💰 Fase 3 — Business & finanza

| Modulo | Stato | Priorità | Sforzo | Note |
|--------|-------|----------|--------|------|
| Report & Analytics avanzati | 🔶 | 🟡 | M | KPI base in Admin. Mancano: margini, trend, export PDF |
| Catalogo destinazioni / pacchetti | ⬜ | 🟡 | M | autonomo |
| Modulo finanziario | ⬜ | ⚪ | L | Dipende da dati reali (Supabase) |

---

## 📈 Fase 4 — Scala & accessi

| Modulo | Stato | Priorità | Sforzo | Note |
|--------|-------|----------|--------|------|
| Persistenza Supabase | ⬜ | 🔴 | L | Infrastruttura pronta (`src/lib/`). Connettere al componente principale |
| Auth reale (login/logout) | ⬜ | 🟡 | M | `LoginScreen` + `AuthContext` pronti in `src/lib/auth/` |
| Multi-utente reale | 🔶 | 🟡 | L | Permessi ✅. Manca isolamento dati per utente |
| AI Assistant — estensioni | 🔶 | ⚪ | M | Day planner ✅. Da fare: preventivo da testo, auto-categorizzazione |

---

## ✨ Migliorie incrementali (aperte)

| Idea | Priorità | Note |
|------|----------|------|
| Toast "Hai preso in carico: [titolo]" | ⚪ | |
| Auto-move in "In Corso" al "Prendi in carico" | ⚪ | |
| Notifica manager se task in coda > N ore | 🟡 | Sistema notifiche ✅, aggiungere il check |
| Bacheca: menzioni @utente con notifica | 🟡 | |
| Bacheca: avvisi con scadenza automatica | ⚪ | |
| Indicatore visivo read-only su urgenti altrui | ⚪ | |
| Dark mode | ⚪ | CSS variables pronte |
| Export Log attività in CSV | ⚪ | |

---

## 🧱 Traccia tecnica

| Intervento | Stato | Priorità | Quando |
|------------|-------|----------|--------|
| Chat `useState` → `useReducer` | ⬜ | 🟡 | Quando si toccano le chat |
| Separazione `VoyageDesk.jsx` in più file | ⬜ | 🟡 | Prima di Supabase |
| `TEAM`/`CATEGORIES`/`CURRENT_USER` → Context puro | ⬜ | ⚪ | Insieme a separazione file |
| TypeScript | ⬜ | ⚪ | Dopo multi-file |
| Test unitari (Vitest) | ⬜ | ⚪ | Dopo TypeScript |

---

## ✅ Sequenza consigliata — Cloud Gold

Partenza dalla PR #7 già deployata su Vercel.

1. **Merge PR #7** → main (sblocca il branch)
2. **Quick wins** (S effort, alta visibilità):
   - Task link cliccabile nella chat → click apre TaskSlideOver
   - Modifica assegnatari da TaskSlideOver (senza aprire edit completo)
   - Filtro coda Driver per data (vista agenda per Giulia)
3. **Estensioni chat** — ricerca conversazioni, rich preview task
4. **Persistenza Supabase**:
   - Configurare env `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`
   - Creare schema DB (tabelle: users, tasks, clients, notices, conversations, messages)
   - Connettere `src/lib/api.js` al reducer (sostituire INITIAL_* con fetch da Supabase)
   - Abilitare `LoginScreen` + `AuthContext` nel main
5. **Auth reale** — login/logout con Supabase Auth, sessioni persistenti
6. **Report & Analytics** avanzati

---

## ✅ Cronologia versioni

| Versione | Righe | Descrizione |
|----------|-------|-------------|
| v0.1 | ~1800 | Core app |
| v0.2 | 2624 | Modulo chat completo |
| v0.3 | 3634 | Bug fix + AI Planner + Bulk Creator |
| v0.4 | 3807 | Cestino soft-delete |
| v0.5 | 5581 | Ricerca avanzata + Admin + Coda + Bacheca |
| v0.6 | 5738 | Responsive full pass |
| v0.7 | 6048 | SwipeActions mobile + Undo |
| v0.8 | 6617 | Permessi per ruolo + UserSwitcher |
| v0.9 | 7071 | Ristrutturazione UI + Profilo + Handoff Vite |
| v0.10 | 7641 | Anagrafica Clienti CRM |
| v0.11 | 7760 | QuickAddTask semplificato + Import CSV clienti |
| v0.12 | 8025 | Notifiche dinamiche + Badge live nav |
