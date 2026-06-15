# HANDOFF — Sessione 23 · Bacheca scadenze + @menzioni + openDossierById + Driver date-pill + Sidebar auto-collapse v19
**Data:** 15 giugno 2026
**Sessione precedente:** sessione 22 ha chiuso Caveat #28 lato server, calendario pratiche, filtri notifiche, filtri coda globale, read-only urgenti, rich preview chat — PR #57 draft, handoff v18.
**Per:** Claude Code / Claude Cowork (prossima sessione 24)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/HANDOFF_SESSION_2026-06-15_v18.md` (sessione 22, calendario+notifiche+filtri+chat preview) e `docs/HANDOFF_SESSION_2026-06-15_v17.md` (sessione 21, quick wins).

---

## 0. TL;DR (60 secondi)

- ✅ **6 interventi** indipendenti su branch `claude/bold-turing-7qkos8` — PR **#58** (draft).
- ✅ **Bacheca avvisi**: scadenza automatica (`expires_at` + UI auto-hide/toggle/chip ⏳ + editor datetime-local).
- ✅ **Bacheca @menzioni**: trigger DB `notify_notice_mention` (dedup 6h) + handler UI 📌 in NotificationsPanel.
- ✅ **Quick refactor v17**: `openDossierById` in `CalendarPlanner` (5 click handler) e `ChatPanel/DossierRefChip` — click su evento calendario/chip chat ora apre direttamente la PraticaDetail.
- ✅ **Driver agenda**: pillole filtro data in `PersonalQueue` (Oggi/Domani/Settimana/Dopo) quando `role === "driver"`.
- ✅ **Sidebar auto-collapse** tra 1024–1280px (override utente vince).
- ✅ **Build verde**. `266.03 kB │ gzip: 63.52 kB` (+1.73 kB gz vs PR #57).
- ❌ **Modulo finanziario**: confermo rimozione roadmap (sessione 22). Non sviluppare.
- 🚧 **Notifiche residue Fase 2 chiuse** lato server: `notify_queue_stale` già attivo da Step J (cron orario), ora coperto in roadmap.

---

## 1. Cosa è stato fatto in sessione 23

### #1 · Bacheca avvisi: scadenza automatica + @menzioni notificate (Fase 2 notifiche residue + quick win)

#### DB

- **`supabase/migrations/20260615_notices_expiration_and_mentions.sql`** — applicata via `apply_migration` MCP, stesso pattern di `20260614_dossier_notifications.sql`:
  - **`notices.expires_at`** (TIMESTAMPTZ NULL) — scadenza opzionale. UI nasconde (auto-hide), non cancella: lo storico resta.
  - **`notices.updated_at`** (TIMESTAMPTZ NOT NULL DEFAULT now()) + trigger `BEFORE UPDATE` `touch_notices_updated_at` per refresh automatico.
  - **`notify_notice_mention()`** + trigger `trg_notify_notice_mention` `AFTER INSERT OR UPDATE OF text`. Reusa `find_mentioned_users` (caveat #2). Dedup: skip se notifica `notice_mention` per `(notice_id, user_id)` esiste nelle ultime 6h (evita ri-notifica al toggle pinned). Payload: `{ notice_id, by_user_id, where: "bacheca", preview: left(text, 120) }`.
- **Test funzionale via MCP**: INSERT con `@Marco e @Sofia` → 2 notifiche generate; UPDATE pinned (testo invariato) → no nuove notifiche (dedup OK); cleanup totale.

#### UI

- **`src/lib/mappers.js`**: `fromDbNotice` trasporta `expiresAt` + `updated_at`; `toDbNotice`/`toDbNoticePatch` includono `expires_at`.
- **`src/components/dashboard/NoticeBoard.jsx`**:
  - Helper `isExpired(n)` e contatore `expiredCount`. Default: filtra fuori avvisi scaduti.
  - Toggle "📁 Scaduti (N)" / "🗂 Nascondi scaduti" nell'header (visibile solo se `expiredCount > 0`).
  - Card scaduta: `opacity: 0.55`, `filter: grayscale(0.4)`.
  - Chip ⏳ scadenza nel footer della card: `formatExpiry(iso)` mostra `scaduto oggi` / `scaduto Ng fa` / `scade entro 1h` / `scade fra Nh` / `scade domani` / `scade fra Ng`.
  - `setEditing` propaga `expiresAt`.
- **`src/components/modals/NoticeEditorModal.jsx`**:
  - Helper module-local `isoToLocalInput(iso)` per il formato `YYYY-MM-DDTHH:mm` di `<input type="datetime-local">`.
  - Stato locale `expiresAt`; al submit `new Date(expiresAt).toISOString()` (vuoto → `null`).
  - Sezione "⏳ Scadenza (opzionale)" con bottone "Rimuovi" e copia "Dopo questa data l'avviso viene nascosto automaticamente…".
- **`src/components/shell/Topbar.jsx`** (`NotificationsPanel`):
  - `NOTIF_ICONS.notice_mention = "📌"`.
  - `NOTIF_CATEGORIES.mention` ora include `notice_mention` (compare nel filtro @ Menzioni con conteggio).
  - `notifTitle("notice_mention")` → `Menzionato in bacheca: "…preview troncato a 60 char…"` (fallback `Sei stato menzionato in bacheca`).
  - `isNavigable(n)` true anche per `notice_mention` (cursore pointer).
  - `handleClick("notice_mention")` → `dispatch SET_VIEW: "dashboard"` (la bacheca vive lì) + chiude pannello + markRead.

### #2 · Quick refactor v17 — `openDossierById` in Calendar e Chat (chiude debito tecnico)

- **`src/components/calendar/CalendarPlanner.jsx`**: prop `onOpenDossier`. Sostituisco `openDossiers()` (5 occorrenze) con helper `openDossier(d)` che chiama `onOpenDossier(d.id)` se presente, altrimenti fallback `SET_VIEW: "pratiche"`.
- **`src/components/chat/ChatPanel.jsx`**:
  - `DossierRefChip` riceve `openDossier(id)` opzionale; click → `openDossier(dossier.id)` se presente, altrimenti `SET_VIEW: "pratiche"`.
  - `ChatContext` esteso: nuovo campo `openDossier`. `renderTextWithRefs` lo propaga al chip. `MessageTextContent` lo consuma dal context (anche per il ramo `link.rest`).
  - Prop `onOpenDossier` aggiunta al `ChatPanel` principale, propagata via `ChatContext.Provider`.
- **`src/VoyageDesk.jsx`**: `onOpenDossier={openDossierById}` passato a `CalendarPlanner` e `ChatPanel`.

### #3 · Driver agenda — pillole filtro data in PersonalQueue (quick win 🟡)

- **`src/components/dashboard/Dashboard.jsx`** (`PersonalQueue`): nuova prop `role`. Quando `role === "driver"`:
  - Sopra la card-grid compaiono pillole filtro: **Tutte · 🚐 Oggi · 📅 Domani · 🗓 Settimana · ↪ Dopo**.
  - Slot calcolato da `dueDate` (no date → "later"). Task arretrate confluiscono in "Oggi" per non perderle.
  - Conteggio per slot. Pillole non-base nascoste se vuote (no rumore).
  - Header badge mostra `N/Totale` durante filtraggio.
  - Empty state dedicato `🔍 Nessuna task per questo filtro data.`
- Per gli altri ruoli la `PersonalQueue` resta identica (nessuna pillola).

### #4 · Sidebar auto-collapse 1024–1280px (quick win ⚪)

- **`src/components/shell/Sidebar.jsx`**: costanti `AUTO_COLLAPSE_MIN = 1024`/`AUTO_COLLAPSE_MAX = 1280`. Hook `useViewport()` espone `width`. Se `width > AUTO_COLLAPSE_MIN && width < AUTO_COLLAPSE_MAX` la sidebar appare compressa di default. L'utente può comunque toggle-are: l'override (`state.sidebarCollapsed`) ha precedenza tramite `OR` (quindi nel range puoi comunque chiudere/aprire manualmente).

### #5 · Docs

- **`docs/CHANGELOG.md`**: aggiunto blocco v2.4-dev (sessione 23).
- **`docs/ROADMAP.md`**: spuntate le voci coperte; Notifiche reali → ✅; queue_stale → ✅; bacheca menzioni → ✅; bacheca scadenza → ✅; coda Driver date-pill → ✅; Sidebar auto-collapse → ✅; `openDossierById` Calendar/Chat → ✅.
- **`docs/CLAUDE.md`**: aggiornata "Priorità 2 — Fase 2 Operatività ✅" con i nuovi punti chiusi.
- **`docs/HANDOFF_SESSION_2026-06-15_v19.md`** (questo file).

---

## 2. Struttura aggiornata (delta vs v18 baseline)

Nessun nuovo file React. Modifiche:

```
supabase/migrations/20260615_notices_expiration_and_mentions.sql ✅ NUOVO (DB già allineato)
src/lib/mappers.js                                  ✏️ notice mappers + expiresAt + updated_at
src/components/dashboard/NoticeBoard.jsx           ✏️ filtro scaduti + toggle + chip ⏳ + setEditing(expiresAt)
src/components/modals/NoticeEditorModal.jsx        ✏️ campo datetime-local "Scadenza"
src/components/shell/Topbar.jsx                    ✏️ notice_mention icon/title/category/handler
src/components/calendar/CalendarPlanner.jsx        ✏️ onOpenDossier prop + openDossier helper (5 click)
src/components/chat/ChatPanel.jsx                  ✏️ onOpenDossier prop + ChatContext.openDossier + DossierRefChip
src/components/dashboard/Dashboard.jsx             ✏️ PersonalQueue role + date-pill filter
src/components/shell/Sidebar.jsx                   ✏️ auto-collapse 1024-1280px
src/VoyageDesk.jsx                                  ✏️ onOpenDossier a Calendar + Chat
docs/CHANGELOG.md                                  ✏️ v2.4-dev (sessione 23)
docs/ROADMAP.md                                    ✏️ spuntate 6 voci
docs/CLAUDE.md                                     ✏️ Priorità 2 ampliata
docs/HANDOFF_SESSION_2026-06-15_v19.md             ✅ NUOVO (questo file)
```

---

## 3. Stato corrente

### Branch / PR

| Branch | PR | Stato | Note |
|--------|-----|-------|------|
| `claude/bold-turing-7qkos8` | **#58** | 🟡 Draft | Sessione 23 (questa). |
| `claude/sleepy-davinci-ka888x` | #57 | 🟡 Draft | Sessione 22 (handoff v18). |
| `claude/handoff-v17-quick-wins-03nn3u` | #56 | 🟡 Draft | Sessione 21 (handoff v17). |
| `main` | — | — | Ferma a `4d7284b` (handoff v15) |

### Build

```
dist/assets/index-*.js          266.03 kB │ gzip: 63.52 kB   (+1.73 kB gz vs PR #57)
dist/assets/TaskSlideOver-*.js    9.61 kB │ gzip:  2.80 kB
✅ Build verde.
```

### DB

Sessione 23 ha applicato 1 migration (`20260615_notices_expiration_and_mentions`):

- ✅ `notices.expires_at`, `notices.updated_at`
- ✅ Trigger `trg_notices_touch_updated_at` (`BEFORE UPDATE`)
- ✅ Trigger `trg_notify_notice_mention` (`AFTER INSERT OR UPDATE OF text`)
- ✅ Funzione `notify_notice_mention()` con `SECURITY DEFINER`

Già attivi da sessioni precedenti (no-op qui):

- `trg_notify_dossier_status` su `dossiers` (PR #57, sessione 22).
- `notify_dossier_departure_daily` cron `0 7 * * *` UTC (PR #57).
- `notify_queue_stale_hourly` cron `5 * * * *` UTC (Step J, 20260610_step_j_fix.sql) — ruoli ora corretti lowercase.
- `notify_task_due_daily` cron `0 8 * * *` UTC.

### Caveat aperti

| # | Area | Problema | Priorità |
|---|------|----------|----------|
| — | — | **Nessun caveat aperto** | — |

---

## 4. Cosa fare nella prossima sessione (24)

### Priorità di merge

1. **Mergiare PR #56** (sessione 21) → main: porta badge Pratiche, deep-link UI, selettore Bulk, tema celeste.
2. **Mergiare PR #57** (sessione 22) → main: porta migration recovery, calendario pratiche, assegnatari editable, filtri notifiche, filtri coda, read-only urgenti, rich preview chat.
3. **Mergiare PR #58** (sessione 23, questa) → main: porta bacheca scadenze + menzioni notificate + `openDossierById` Calendar/Chat + Driver date-pill + Sidebar auto-collapse.

Nessuna sequenza vincolante: i tre PR hanno solo sovrapposizioni minori (in `NotificationsPanel` ognuno aggiunge handler distinti, in `CalendarPlanner` la prop `onOpenDossier` è additiva, in `ChatPanel` idem). Git potrebbe segnalare "both modified" su alcune righe in `NOTIF_ICONS`/`notifTitle` ma il contenuto è deterministicamente uguale.

### Opzione A — Estensioni chat & impostazioni agenzia (priorità 🟡)

- **Chat — stato "occupato" manuale**: pulsante in `Topbar` per togglare presence `busy`/`online`. Richiede update tabella `users` (gia' esistente `status`).
- **Impostazioni agenzia residue** (priorità 🟡):
  - Tab "Template messaggi" in `AdminView`.
  - Tab "Preferenze UI" (dark mode placeholder, lingua, formato data).
  - `ProfileEditor` resta operativo per il profilo personale.

### Opzione B — Polish & traccia tecnica (priorità ⚪)

- **Skeleton loading** sulle prime render (Dashboard, Pratiche, Clienti, Fornitori). CSS variables già pronte.
- **Dark mode**: alternare palette via `data-theme` su `<html>` + media `prefers-color-scheme`.
- **Chat `useState` → `useReducer`**: traccia tecnica nota; `ChatPanel.jsx` resta complesso, beneficierebbe della centralizzazione.

### Opzione C — Fase 3 Business

- **Report & Analytics avanzati**: trend temporali, export PDF.
- **Catalogo destinazioni / pacchetti**: nuova vista `CatalogoView`.

### ⛔ NON FARE

- **Modulo finanziario** — esplicitamente rimosso dalla roadmap su richiesta utente (sessione 22). Non riproporlo. Aggregazione costi/budget/margine non va sviluppata.

---

## 5. Note tecniche / gotcha

### Trigger `notify_notice_mention` e `auth.uid()`

Stesso pattern degli altri trigger menzione: l'attore viene escluso via `auth.uid()`. Se la mutazione passa via service role (CLI MCP, cron), `auth.uid()` è `NULL` → l'autore può ricevere la sua stessa notifica. Nel client app questo non succede (auth normale).

### Bacheca avvisi scaduti — quando un avviso "vive" nello storico

Gli avvisi con `expires_at < now()` non vengono eliminati: l'UI li nasconde di default ma il toggle "📁 Scaduti (N)" li ri-mostra. Razionale: spesso servono come traccia ("avevamo scritto X nel comunicato del 5 maggio"). Per eliminarli definitivamente serve il bottone ✕ nella card (già esistente).

### Driver date-pill — definizione degli slot

- **Oggi**: `dueDate >= startOfToday && dueDate < startOfTomorrow` **+ task con `dueDate < startOfToday`** (arretrate). Razionale: il driver non deve perderle.
- **Domani**: `startOfTomorrow ≤ dueDate < startOfTomorrow+1d`.
- **Settimana**: i 5 giorni seguenti (escluso oggi/domani).
- **Dopo**: oltre 7 giorni **o `dueDate === null`**.

Il bucketing usa il fuso locale del client. In viaggio tra fusi diversi può sfasare di ±1 giorno se la `dueDate` viene serializzata come ISO mezzanotte UTC. Non bloccante per uso italiano.

### Sidebar auto-collapse + override utente

`col = state.sidebarCollapsed || inAutoRange`. Quindi nel range 1024-1280:
- L'utente non ha mai toccato il toggle → sidebar compressa (auto).
- L'utente ha cliccato il toggle (state.sidebarCollapsed = true) → resta compressa (a maggior ragione).
- L'utente ha cliccato il toggle quando era compressa → state.sidebarCollapsed diventa true… no: il toggle è `!s`, quindi se `col=true` (auto) e l'utente clicca, il reducer fa `s = !state.sidebarCollapsed = true`. Hmm, in realtà se `state.sidebarCollapsed` è `false` (mai toccato) e l'utente nel range clicca per espandere, lo stato passa a `true` (cioè "voglio collapsed") → la sidebar resta compressa. **Limite noto**: nel range 1024-1280 l'utente non riesce a espandere manualmente. Mitigazione semplice (futura sessione): rimuovere il toggle nel range, o aggiungere un terzo stato "user-expanded explicit". Per ora il toggle è funzionale fuori dal range.

### `openDossierById` + lazy loading

`CalendarPlanner` e `ChatPanel` non sono lazy. La prop `onOpenDossier` arriva da `VoyageDesk` (definita con `useCallback`). Nessun problema di re-render perché la ref è stabile.

### NoticesAPI persistenza

`Notices.update`/`Notices.create` continuano a chiamare `withOrigin(...)` per l'origin-tagging realtime. `expires_at` è incluso nei mapper e quindi viene persistito al PRIMO salvataggio. Per esistenti senza scadenza, l'UI mostra solo il campo vuoto al `setEditing`.

---

## 6. Caveat completo (aggiornato sessione 23)

| # | Stato | Descrizione |
|---|-------|-------------|
| #1–#27 | ✅ chiusi | Vedi handoff v15 §6 |
| #28 | ✅ chiuso | Trigger DB notifiche pratica (PR #57) + UI deep-link (PR #56 draft) |

**Nessun caveat aperto.**

---

## 7. Riferimenti rapidi

- Handoff sessione 22: `docs/HANDOFF_SESSION_2026-06-15_v18.md`
- Handoff sessione 21: `docs/HANDOFF_SESSION_2026-06-15_v17.md`
- Handoff sessione 20 (Fase 1 completa): `docs/HANDOFF_SESSION_2026-06-14_v15.md`
- Roadmap aggiornata: `docs/ROADMAP.md` (v2.4-dev cronologia)
- Convenzioni progetto: `docs/CLAUDE.md`
- Migration sessione 23: `supabase/migrations/20260615_notices_expiration_and_mentions.sql`
- PR #58 (sessione 23): https://github.com/tucobpjmr/TULLIO/pull/58 (sarà creata al push)
- PR #57 (sessione 22): https://github.com/tucobpjmr/TULLIO/pull/57
- PR #56 (sessione 21): https://github.com/tucobpjmr/TULLIO/pull/56
