# 🗺️ VoyageDesk — Roadmap di Sviluppo

Documento di pianificazione. Idee organizzate in **blocchi sequenziali** basate su dipendenze tecniche e valore utente.

**Legenda**
Priorità: 🔴 Alta · 🟡 Media · ⚪ Bassa
Sforzo: `S` piccolo (~1 sessione) · `M` medio (2-3) · `L` grande (4+)
Stato: ✅ fatto · 🔶 parziale · ⬜ da fare

---

## 🎯 Blocchi Operatività 100%

> 🆕 **Sessione 34 — nuovi blocchi 5→8 (allegati task + OneDrive + WhatsApp).**
> Dettaglio tecnico completo in `docs/HANDOFF_SESSION_2026-06-21_v34_attachments_onedrive_whatsapp.md`.

### ✅ Block 5 — Allegati Task (FONDAZIONE) — COMPLETO (sessione 34) — 🔴 Alta — Sforzo M

> Prerequisito di Block 6 e 7, ora pronto: i task hanno allegati reali (upload/lista/download/elimina). OneDrive/WhatsApp diventano sorgenti che chiamano `TaskFiles.upload(file, taskId, { source })`.

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Migration `task_files` (tabella + RLS rispecchia `tasks_select`) | ✅ | 🔴 | S |
| Bucket privato `task-files` + policy storage (template `chat-files`) | ✅ | 🔴 | S |
| API `TaskFiles` (list/upload/remove/signedUrl) in `lib/api.js` | ✅ | 🔴 | S |
| UI dropzone reale in `TaskSlideOver` (upload/lista/download/badge sorgente) | ✅ | 🔴 | M |
| Test Vitest helper (`fileUtils`: size/mime/limit/badge) | ✅ | 🟡 | S |

**Deliverable**: migration `20260621_task_files.sql` (applicata in prod), `src/lib/fileUtils.js` + 11 test, export `TaskFiles` in `api.js`, sub-componente `TaskAttachments` in `TaskSlideOver.jsx` (drag&drop + lista + download via signed URL + elimina, badge sorgente). Limite 25 MB/file. RLS rispecchiano la visibilità del task; nessun nuovo advisor di sicurezza.

### ☁️ Block 6 — Allega da OneDrive (Azure personale/MSA) — ⬜ da fare — 🟡 Media — Sforzo M

> **Decisione**: il file viene **copiato in Supabase** (non solo linkato). **Prerequisito**: Block 5.

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Setup Azure App Registration (client ID, redirect SPA, scope `Files.Read`) — **manuale** | ⬜ | 🟡 | S |
| Frontend: OneDrive File Picker v8 (o MSAL.js) + bottone "☁️ Allega da OneDrive" | ⬜ | 🟡 | M |
| Edge Function `onedrive-import` (Graph `…/content` → bucket → riga `task_files`) | ⬜ | 🟡 | M |
| Env `VITE_AZURE_CLIENT_ID` (pubblica, no secret per SPA PKCE) | ⬜ | 🟡 | S |

### 🟢 Block 7 — Invia file da WhatsApp a un task — ⬜ da fare — 🟡 Media — Sforzo L

> **Decisione**: API ufficiale **Meta WhatsApp Business Cloud**. **Routing**: codice task nella didascalia (`#T<codice>`). **Prerequisito**: Block 5.

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Setup Meta App + WhatsApp Business + numero dedicato + token permanente — **manuale** | ⬜ | 🟡 | M |
| Edge Function `whatsapp-webhook` (verify GET + POST media, firma `X-Hub-Signature-256`) | ⬜ | 🟡 | L |
| Routing: estrai codice task dalla didascalia + match `user_contacts.phone` → utente | ⬜ | 🟡 | M |
| Codice task leggibile: `tasks.short_code` (consigliato) o primi 8 char UUID | ⬜ | 🟡 | S |
| UI box "Invia da WhatsApp" in `TaskSlideOver` (numero + codice + istruzioni) | ⬜ | 🟡 | S |
| Secrets Edge Function `WHATSAPP_TOKEN/PHONE_NUMBER_ID/VERIFY_TOKEN/APP_SECRET` | ⬜ | 🟡 | S |
| (Fase 2) Sessione "Collega WhatsApp" dall'app (TTL, no codice da digitare) | ⬜ | ⚪ | M |

### ✅ Block 8 — Rifiniture "100% usable" (residui sicurezza/onboarding)

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| **HIBP** protezione password compromesse (toggle Dashboard, non via codice) | ⬜ | 🔴 | S |
| Email confirmation enforcement + UI "reinvia" | ⬜ | 🟡 | S |
| Admin **bulk** invite + invio link | ⬜ | 🟡 | M |
| Block 2 — RLS hardening pending users (quando ci sono utenti reali) | ⬜ | 🟡 | S |
| Bacheca @menzioni con notifica · Calendario eventi ricorrenti | ⬜ | 🟡 | M |
| TypeScript migration · copertura test estesa | ⬜ | ⚪ | L |

**Sequenza consigliata**: 5 → 6 → 7 → 8. Block 5 sblocca tutto; HIBP è un quick-win di sicurezza inseribile in qualsiasi momento.

---

### ✅ Block 1 — Autenticazione & Onboarding (COMPLETO — sessione 27)

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Password recovery (email magic link) | ✅ | 🔴 | S |
| Self-service signup (form + validation) | ✅ | 🔴 | S |
| Team member approval (pending gate) | ✅ | 🔴 | S |
| Approval persistence fix (DB write) | ✅ | 🔴 | S |
| Security hardening (trigger dedup + RLS) | ✅ | 🔴 | S |

**Deliverables**: Password recovery flow, signup form, PendingScreen gate, approval system (API + dispatch), migration (sync repo↔prod). All deployed ✅.

**Next decision**: 
- **Option A** (recommended): Apply Block 2 (RLS hardening for pending users).
- **Option B**: Skip to Block 3+ (email verification, admin invites, etc.).

---

### 🟡 Block 2 — RLS Hardening for Pending Users (DEFERRED — optional)

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Pending user read access isolation | ⬜ | 🟡 | S |
| Email confirmation requirement | ⬜ | 🟡 | S |
| Approval notification to admin | ⬜ | 🟡 | S |

**Why deferred**: No real users yet; safer to add when live data exists.

**Scope**:
- Add `AND (NOT auth.uid() = current_user_id OR active = true)` to RLS read policies where pending users should be blocked.
- Supabase config to require email confirmation before login.
- Trigger `notify_user_pending` when signup completes (notify admin).

---

### 🔵 Block 3 — Email Confirmation & Admin Controls

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Email confirmation enforcement | ⬜ | 🟡 | S |
| Resend confirmation email UI | ⬜ | 🟡 | S |
| Admin bulk invite + send links | ⬜ | 🟡 | M |
| Approval notification (→admin + user) | ⬜ | 🟡 | S |

---

### ✅ Block 4 — Account Management (COMPLETO — sessione 33)

| Modulo | Stato | Priorità | Sforzo |
|---|---|---|---|
| Profile edit (name, avatar, email/phone) | ✅ | 🟡 | S |
| Change password (in-app, not reset link) | ✅ | 🟡 | S |
| Account deletion (self-service or admin) | ✅ | ⚪ | S |
| Multi-session tracking (last seen, devices) | ✅ | ⚪ | S |

**Deliverables**: sezione "Cambia password" in `ProfileEditor`, sezione "Elimina account" con typed confirmation, Edge Function `delete-account` (ban 87600h + active=false), `Users.deleteAccount()` API, `AuthContext.deleteAccount()`, dot presenza + last-seen in `AdminView`. Tutti deployati ✅.

---



---

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

## 🚀 Fase 1 — Modello dati (storico)

> ⛔ **Nota sessione 24:** I moduli **Pratiche** (dossiers) e **Fornitori** (suppliers) sono stati **RIMOSSI DEFINITIVAMENTE** su richiesta utente (PR #63, migration `20260616`). Non reintrodurli. Il modulo **Clienti** rimane intatto.

| Modulo | Stato | Note |
|---|---|---|
| Anagrafica Clienti (CRM base) | ✅ mantenuto | `src/components/clients/ClientiView.jsx` intatto |
| Anagrafica Fornitori | ~~✅~~→⛔ **RIMOSSO** | `FornitoriView.jsx` eliminato, tabella `suppliers` droppata |
| Pratiche di viaggio | ~~✅~~→⛔ **RIMOSSO** | `PraticheView.jsx` eliminato, tabella `dossiers` droppata |
| Collegamento Task ↔ Pratica | ~~✅~~→⛔ **RIMOSSO** | `tasks.dossier_id` (FK) → `tasks.pratica_ref text` (campo libero) |
| Fornitori collegati a Pratica | ~~✅~~→⛔ **RIMOSSO** | tabella `dossier_suppliers` droppata |
| Filtro numero pratica in Ricerca avanzata | ~~✅~~→⛔ **RIMOSSO** | rimosso insieme al modulo |

---

## 🔧 Fase 2 — Operatività quotidiana

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Notifiche reali | ✅ | 🔴 | M | Trigger task ✅ (Step F/J), trigger pratica ✅ (caveat #28, PR #57), coda stantia ✅ (`queue_stale`, hourly cron). Filtri + "segna tutte lette" ✅ (PR #57). |
| Calendario avanzato | 🔶 | 🟡 | M | iCal export ✅, vista settimanale ✅, vista giornaliera ✅, pratiche nel calendario ✅ (PR #57). Manca: eventi multipli/ricorrenti |
| Estensioni chat (base) | ✅ | 🟡 | S–M | Ricerca conversazioni ✅, presence online/assente/offline ✅, **stato "Occupato" manuale ✅** (toggle header chat), task link cliccabile ✅, rich preview pratiche ✅ |
| Impostazioni agenzia | 🔶 | 🟡 | S | Gestione categorie e nome agenzia in Admin; **template messaggi chat** ✅ v2.8-dev (Admin tab Sistema + picker composer). Manca: profilo utente, preferenze UI |
| Ricerca globale estesa | ✅ | — | — | Completata in v0.5. |
| Responsive (mobile/tablet/desktop) | ✅ | — | — | Completato in v0.6. |
| SwipeActions mobile | ✅ | — | — | Completato in v0.7. |
| Permessi per ruolo | ✅ | — | — | Completato in v0.8. |

---

## 📈 Fase 3 — Scala & accessi

| Modulo | Stato | Priorità | Sforzo | Note |
|---|---|---|---|---|
| Multi-utente reale & permessi | 🔶 | 🟡 | L | Matrice permessi ✅ v0.8. Manca login vero e isolamento dati. ⚙️**B** per autenticazione |
| Estensioni chat (avanzate) | ⬜ | ⚪ | M | Chiamate audio/video (mock UI), reazioni custom |
| AI Assistant — estensioni | 🔶 | ⚪ | M | Day planner ✅. Da fare: "Genera preventivo" da testo, suggerimenti assegnazione, auto-categorizzazione |

---

## ✨ Migliorie incrementali emerse (post v0.5)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Badge sulla voce sidebar/bottom-nav **Admin** con conteggio agenti pending | ✅ | — | Completato in main (Sidebar `getNavBadges`) |
| Badge sulla voce sidebar/bottom-nav **Dashboard** con conteggio coda globale | ✅ | — | Completato in main (Sidebar `getNavBadges`) |
| Badge sulla voce sidebar/bottom-nav **Pratiche** con partenze imminenti (≤7gg) | ✅ | — | Completato in PR #56 (sessione 21) |
| Toast personalizzato "Hai preso in carico: \[titolo\]" | ✅ | — | Completato in Step I (`takeOwnership` → toastMessage) |
| Auto-move in "In Corso" al "Prendi in carico" | ✅ | — | Completato in Step I (`takeOwnership`) |
| Notifica al manager se un task resta in coda > N ore | ✅ | — | Trigger DB `notify_queue_stale` + cron orario (migration `20260615_queue_stale_notifications.sql`) |
| Filtro nella coda globale (per categoria/priorità) | ✅ | — | Completato in PR #57 (sessione 22) |
| Bacheca: menzioni @utente con notifica | ⬜ | 🟡 | Dipende da notifiche reali (trigger DB su `notices`) |
| Bacheca: avvisi con scadenza automatica | ⬜ | ⚪ | Richiede colonna `expires_at` su `notices` |
| Bacheca: reazioni emoji sui post-it | ✅ | — | TOGGLE_NOTICE_REACTION (shape gemello chat), picker 6 emoji, chip riassuntive cliccabili. v2.8-dev |
| Bacheca: tag/categorie filtrabili | ✅ | — | Tag (max 5 lowercase) gestiti in NoticeEditorModal; filtro multi-select OR in NoticeBoard header. v2.8-dev |
| Modifica assegnatari da `TaskSlideOver` | ✅ | — | Completato in PR #57 (sessione 22) |
| Permessi granulari per ruolo | ✅ | — | Completato in v0.8 |
| Export Log attività in CSV | ✅ | — | Pulsante "Esporta CSV" nel tab Log (rispetta il filtro attivo), helper `downloadFile`/`escapeCSV` hoistati a module-scope |
| Sort e ricerca avanzata Clienti | ✅ | — | 4 chip ordinamento (A-Z / Z-A / Più recenti / Città), ricerca estesa a telefono e note. v2.8-dev Round 8. |
| Pannello task del cliente | ✅ | — | Click su card cliente mostra task collegati inline (match campo `client`). v2.8-dev Round 9. |
| Scorciatoie tastiera globali | ✅ | — | K=QuickAddTask, ?=overlay shortcut, Esc=chiudi. v2.8-dev Round 10. |
| Badge urgenze personali nav | ✅ | — | Badge rosso su voce Dashboard per task scaduti/urgenti dell'utente corrente. v2.8-dev Round 11. |
| Filtro categoria CalendarPlanner | ✅ | — | Chip categoria sotto header calendario, filtra mese/settimana/giorno/distribuzione. v2.8-dev Round 12. |
| Cerca nei messaggi chat | ✅ | — | Pulsante 🔍 in header conversazione, ricerca full-text con contatore risultati. v2.8-dev Round 13. |
| Avanzamento status rapido PersonalQueue | ✅ | — | Bottoni inline ▶/⏸/✓ contestuali per status nella coda personale, senza aprire TaskSlideOver. v2.8-dev Round 14. |
| Filtro per agente UrgentOthersQueue | ✅ | — | Chip con avatar + nome + contatore per filtrare i task urgenti del team per agente. Badge aggiorna. v2.8-dev Round 15. |
| Filtro periodo nel Cestino | ✅ | — | Chip Tutti/Ultimi 7 gg/Questo mese/Mese scorso su `deletedAt`. Badge `N di M`, stato vuoto con reset. v2.8-dev Round 16. |
| Ore stimate nel pannello task cliente | ✅ | — | Summary row `N aperti · Xh stimate · N completati · Yh · Totale: Zh` in ClienteTaskPanel. v2.8-dev Round 17. |
| Export CSV coda personale | ✅ | — | Bottone `↓ CSV` nel header PersonalQueue, esporta il set filtrato corrente. v2.8-dev Round 18. |
| Mini-avatar assegnatari nel day view | ✅ | — | Avatar 14px degli assegnatari sulle card evento nel time-grid giornaliero (height ≥ 42px). v2.8-dev Round 19. |
| Ore stimate in coda per membro (Team view) | ✅ | — | Riga `N/M task · ⏱ Xh` sotto barra capacità nella card membro. v2.8-dev Round 20. |
| Filtro assegnatario OverdueQueue | ✅ | — | Chip avatar+nome+contatore per filtrare task scaduti per agente (speculare a Round 15). v2.8-dev Round 21. |
| Campo ore stimate nel QuickAddTask | ✅ | — | Input numerico "ORE ⏱" (step 0.5) nella riga Assegna A/Scadenza. Default 1h se vuoto. v2.8-dev Round 22. |
| Pill ore-in-coda nel greeting Dashboard | ✅ | — | Pill `⏱ Xh in coda` + `· N scadute` (rosso) sotto il saluto per ruoli non-admin. v2.8-dev Round 23. |

## ✨ Migliorie incrementali emerse (post v0.6)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Vista settimanale Calendario | ✅ | — | Completata in v0.7 (CalendarPlanner: week + week-full) |
| Comprimi automaticamente Sidebar desktop tra 1024–1280px | ✅ | — | Auto-collapse a transizione di banda in `Sidebar` (guardia `prevBandRef`, non contrasta il toggle manuale) |
| Skeleton loading su prime render | ✅ | — | `SkeletonCards` (shimmer) nelle viste Clienti/Fornitori/Pratiche durante l'idratazione CRM (`crmLoading`) |
| Dark mode | ✅ | — | Token `--card`/`--heading` + blocco `[data-theme="dark"]`, toggle 🌙/☀️ in Topbar (solo-sessione). Shell resta brand-celeste. v2.8-dev |
| Test responsive automatici (Playwright) | ⬜ | ⚪ | ⚙️**B** |

## ✨ Migliorie incrementali emerse (post v0.8)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Task link cliccabile nella chat (apre TaskSlideOver) | ✅ | — | Completato in Step H/K (`MessageTextContent` + `taskRef`) |
| Permessi granulari per sub-ruolo (Senior vs Junior) | ✅ | — | isJuniorAgent() + canEditTask/canCreateTaskCategory ridotti. Badge UI in Topbar e Dashboard. v2.8-dev Round 4. |
| Coda personale Driver: filtro per data/ora (tipo agenda giornaliera) | ✅ | — | `PersonalQueue` con `enableDateFilter` per role=driver: chip Tutte/Oggi/Domani + date picker, orario nelle card. v2.8-dev |
| Indicatore visivo "read-only" sulle card urgenti altrui | ✅ | — | Completato in PR #57 (sessione 22): bordo dashed + chip 🔒 |
| Notifica in-app al cambio utente | ✅ | — | Toast type=warning + banner countdown 60s con rollback automatico all'utente precedente. "Rimani come Admin" / "Torna ora →". v2.8-dev Round 3. |

## ✨ Migliorie incrementali emerse (post v2.2-dev / sessione 21-22)

| Idea | Stato | Priorità | Note |
|---|---|---|---|
| Badge sidebar **Pratiche** con partenze imminenti (≤7gg) | ✅ | — | PR #56 draft (handoff v17) |
| Deep-link notifiche pratica → PraticaDetail | 🔶 | 🔴 | UI in PR #56 (handoff v17), trigger DB ✅ caveat #28 (PR #57). Merge entrambe per chiudere |
| Selettore pratica in BulkTaskCreator | ✅ | — | PR #56 draft (handoff v17) |
| Calendario: eventi partenza/ritorno pratiche (celesti ✈️/🏁) | ✅ | — | PR #57 (sessione 22) |
| Rich preview pratiche in chat (`PR-YYYY-NNN` come chip) | ✅ | — | PR #57 (sessione 22) |
| Filtri NotificationsPanel (Tutte / Non lette / Task / Pratiche / Menzioni) | ✅ | — | PR #57 (sessione 22) |
| openDossierById in PraticheView (sostituisce SET_VIEW) | ⬜ | ⚪ | Quick refactor post-merge #56 |

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

- **v2.7-dev** — Sessione 24 (PR #63 ready for review, handoff v22): **Rimozione completa Pratiche & Fornitori** su richiesta utente. Deleted `PraticheView.jsx` + `FornitoriView.jsx`. Tabelle `dossiers`/`suppliers`/`dossier_suppliers` droppate. `tasks.dossier_id` → `tasks.pratica_ref text`. Cleanup api/mappers/reducer/sidebar/topbar/calendar/chat. Migration `20260616_remove_pratiche_fornitori.sql` applicata in produzione.

- **v2.5/v2.6-dev** — Sessione 23 (PR #60 **mergeata**, `46dbe0a`, handoff v21): **Fase 2 chiusa al 100%**. `queue_stale` versionata (migration `20260615`, repo↔DB allineati) + chat stato "Occupato" manuale (presence `busy`) + auto-collapse Sidebar 1025–1280px + export Log CSV + skeleton loading viste CRM. Rimozione completa **Fase 3 Business**. Build: 264.00 kB / 62.90 kB gz.

- **v2.2-dev** — **Fase 1 COMPLETA** (PR #51/#52/#53): collegamento Task↔Pratica (`dossierId` su QuickAddTask/TaskSlideOver), pannello fornitori in `PraticaDetail` (`FornitoriPanel`), filtro pratica nella Ricerca avanzata. Caveat #26 e #27 chiusi. Build: 252.04 kB / 59.47 kB gz.

- **v2.3-dev** — Sessione 22 (PR #57): caveat #28 (trigger DB notifiche pratica, allinea repo↔DB) + Calendario pratiche (eventi ✈️/🏁 celesti in tutte le viste) + Modifica assegnatari da TaskSlideOver + Filtri NotificationsPanel (Tutte/Non lette/Task/Pratiche/Menzioni) + icon dossier (📁 ✈️) + Filtri coda globale (categoria/priorità) + Indicatore read-only urgenti altrui + Rich preview pratiche in chat (`PR-YYYY-NNN` → chip). Cleanup docs: Fase 3 Business (modulo finanziario, Report & Analytics, catalogo) rimossa da roadmap/CLAUDE.md/changelog (richiesta utente). Build: 260.57 kB / 61.79 kB gz.

- **v2.2.1-dev** — Sessione 21 (PR #56 draft, handoff v17): badge sidebar Pratiche partenze imminenti, deep-link notifiche pratica (UI), selettore pratica in BulkTaskCreator, tema celeste `--sky` su Topbar/Sidebar/BottomNav. Build: 253.08 kB / 59.87 kB gz.

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
4. **Fase 2 residua** (Calendario avanzato, estensioni chat).
5. **Fase 3** (multi-utente reale, scala & accessi).
6. Migliorie incrementali post-v0.5/v0.6/v0.8 inserite dove pertinenti.
7. Traccia tecnica man mano, se in Opzione B.
