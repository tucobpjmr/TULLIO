# HANDOFF — Sessione TULLIO UI polish + responsive mobile
**Data:** 13 giugno 2026 (sessione 15)
**Sessione precedente:** Claude Code on the web — sessione 14 ha mergeato PR #24 (Step Q) e prodotto handoff v8. Sessione 15 ha aperto PR #29 con 4 interventi UI ed eseguito merge.
**Per:** Claude Code / Claude Cowork (prossima sessione)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/CHANGELOG.md` → `docs/ROADMAP.md`.

---

## 0. TL;DR (30 secondi)

- ✅ **PR #29 mergiata** (`3a7bb17`, squash): **4 interventi UI** in un'unica sessione, tutti su `src/VoyageDesk.jsx`.
  1. **Cestino per tutti** (sidebar + bottom nav): ruoli admin/manager/agent/driver, prerogative per status via `canEditTask`.
  2. **Ricerca unificata** nell'header (lente 🔍): fonde input testuale + filtri avanzati, rimuove bottone 🎛️ duplicato.
  3. **"Più task"** spostato da FAB secondaria a sidebar/bottom nav (icon 📑).
  4. **Layout responsive** tab Manuale di BulkTaskCreator: card impilate su mobile (no scroll orizzontale).
- ⏳ **Prossima sessione**: **Step R** (drift repo↔DB, caveat #19, ~1-2h) o **Step P** (refactor monolite, caveat #15 residuo, ~4-6h). Quick wins (#10/#18/#2/#3/#8) sempre accessibili.

---

## 1. Riepilogo lavori sessione 15 (cronologico)

| # | Intervento | Commit | Stato |
|---|------------|--------|-------|
| 1 | Cestino accessibile a tutti gli utenti | `9d8d08d` | ✅ NAV_ITEMS + Vista Trash filtrata + Reducer con canEditTask |
| 2 | Ricerca unificata nell'header (lente 🔍) | `ff34bdb` | ✅ Merge input + pannello, rimozione bottone 🎛️ |
| 3 | "Più task" nella nav (sidebar + bottom) | `d67167f` | ✅ FAB secondaria → Sidebar + BottomNav callback |
| 4 | Layout responsive BulkTaskCreator Mobile | `04890d9` | ✅ Card impilate, griglia 2 col su mobile |
| 5 | Merge PR #29 su main | `3a7bb17` (squash) | ✅ Build Vercel Ready, live su io-seven.vercel.app |

---

## 2. Dettagli interventi

### Intervento 1: Cestino per tutti gli utenti

**Cambio di design**: prima solo admin vedevano il Cestino. Ora è un diritto di tutti ma con **prerogativa per status** (ogni utente gestisce solo i propri task cestinati).

- **`NAV_ITEMS`** (linea 2137): aggiunti ruoli `manager`, `agent`, `driver` → icona 🗑️ visibile a tutti in Sidebar (desktop) e BottomNav (mobile).
- **Vista `Trash`** (linea 6518+): la lista di task cestinati è filtrata con `canEditTask(t, currentUserId)`:
  - **Admin**: vede tutti i cestinati.
  - **Manager / Agent**: vede i propri + coda globale (non assegnati).
  - **Driver**: vede solo transfer propri + transfer in coda globale.
- **Reducer**:
  - `RESTORE_TASK` (linea 477): autorizzazione via `canEditTask(prev, uid)` invece di `isAdmin(uid)`.
  - `PURGE_TASK` (linea 484): idem.
  - `EMPTY_TRASH` (linea 489): svuota **solo** i task cestinati che l'utente corrente può gestire (non più "tutti").

**Coerenza**: allineato a `DELETE_TASK` che usa già `canEditTask` per cestinare. Un non-admin non può né cestinare né recuperare task altrui.

### Intervento 2: Ricerca unificata nell'header

**Problema risotto**: due strumenti separati e ridondanti:
- Input testuale `state.searchQuery` → non era consumato da alcuna vista (memorizzava solo il valore).
- Bottone 🎛️ ("ricerca avanzata") → apriva un pannello con un **proprio campo keyword duplicato** + filtri.

**Soluzione**: un **unico input lente 🔍** che al focus/digitazione apre il pannello unificato (filtri + risultati cliccabili). La keyword è condivisa via `state.searchQuery`.

- **Topbar** (linea 1482+):
  - Rimosso il bottone 🎛️ separato.
  - Input lente ha nuovo hook `searchWrapRef` → chiude il pannello su click fuori via `mousedown`.
  - `onFocus` e `onChange` (digitazione) aprono il pannello via `setSearchOpen(true)`.
- **`AdvancedSearchPanel`** (linea 1174+):
  - Riceve `keyword` + `onKeyword` come props (invece di state locale).
  - Rimosso il campo keyword duplicato; la keyword input viene da topbar.
  - Titolo: "🔍 Ricerca" (era "🎛️ Ricerca avanzata").
  - Empty-state rinominato: "Digita una parola chiave o imposta un filtro per iniziare la ricerca".
- **Ctrl+K**: invariato, mette a fuoco l'input.

### Intervento 3: "Più task" spostato nella nav

**Cambio di UX**: il FAB secondario 📑 ("Crea più task / Import / Template") in basso a destra accanto al `+` è rimosso. L'azione è ora una voce della navigazione:
- **Desktop (Sidebar)**: bottone accentato (oro) "Più task" 📑 sotto le voci di navigazione; in modalità collassata mostra solo l'icona.
- **Mobile/Tablet (BottomNav)**: pulsante "Più task" 📑 accanto alle altre voci.

**Implementazione**:
- **`Sidebar`** (linea 2178): aggiunto param `onOpenBulk`, bottone dedicato con stile `background: rgba(212,168,67,0.12)` (accentato) sotto le righe di nav.
- **`BottomNav`** (linea 2246): aggiunto param `onOpenBulk`, pulsante extra in fondo alla nav.
- **`VoyageDeskInner`** (linea 8191+): passa `onOpenBulk={() => setShowBulkModal(true)}` a entrambi.
- **FAB secondario rimosso** (linea 8220+): prima c'era un bottone `position: fixed` con icon 📑; è stato eliminato. Resta solo il FAB `+` singolo per il task veloce.

### Intervento 4: Layout responsive tab Manuale di BulkTaskCreator

**Problema**: su mobile la tab "Manuale" di "Crea più task" usava una griglia a **larghezza fissa** (`26px 1fr 130px 100px 120px 130px 28px` ≈ 534px+), che sforava la viewport → scroll orizzontale.

**Soluzione**: layout reattivo a livello di tab:

- **`ManualTab`** (linea 2326+): aggiunto hook `useViewport()` per `isMobile`.
- **Impostazioni comuni**: griglia da `1fr 1fr 1fr 1fr` (desktop) a `1fr 1fr` (mobile).
- **Righe task**:
  - **Desktop**: griglia tabellare classica con header (come prima).
  - **Mobile**: ogni riga diventa una **card impilata** (border, padding 10px):
    - Top: numero + titolo + bottone ✕ (flex row).
    - Under: griglia `1fr 1fr` (categoria / priorità / assegnato / scadenza).
    - Niente header tabellare.
- **`bulkInputStyle`**: aggiunti `minWidth: 0` + `boxSizing: border-box` per evitare che `<select>` con label lunghe forzino l'overflow della cella.

**Risultato**: niente più scroll orizzontale su mobile. Tab Manuale completamente responsiva.

---

## 3. Stato del repo

**Repo:** https://github.com/tucobpjmr/TULLIO
**Branch `main` HEAD:** `3a7bb17 feat: Cestino per tutti + ricerca unificata + bulk task nella nav (#29)`
**Build finale:** ✅ Vercel Ready

```
dist/assets/index-BA9NVbhp.js     267.97 kB │ gzip:  64.32 kB (vs v1.5: 266.31 kB gzip)
```

**Delta righe** (all'incirca):
- `src/VoyageDesk.jsx`: +145 riga nette (responsive BulkTaskCreator, ricerca unificata, callback sidebar/nav, filtro Trash) — il monolite sale da ~7071 a ~7216 righe.

---

## 4. 🐛 Caveat aggiornato

| # | Area | Stato | Prio | Note |
|---|------|-------|------|------|
| 1 | Auto-assegnazione | ✅ Step J | — | |
| 2 | Mention edge case (nomi simili) | ⚪ Aperto | bassa | Quick win Pri 4 |
| 3 | Presence heartbeat 45s | ⚪ Aperto | bassa | + 1 UPDATE/tab anche con status invariato |
| 4 | RLS realtime users | ✅ Step Q.6 (non-issue) | — | Policy `qual='true'` by-design |
| 5 | Eco realtime (flash re-render) | ✅ Step L + fix DELETE (PR #22) | — | |
| 6 | markRead chat 1 UPDATE/msg | ✅ Step Q.4 | — | RPC bulk |
| 7 | fileSize chat string vs bigint | ✅ Step M | — | |
| 8 | Calendar Distribuzione Agenti settimana fissa | ⚪ Aperto | bassa | |
| 9 | Task link chat match per titolo | ✅ Step K | — | |
| 10 | Hook subscribe duplicati (3 useEffect simili) | 🟢 Aperto | bassa | finding #10 review — `useDebouncedTableSubscription`. Pri 4 |
| 11 | NOTIFICATIONS mock fallback | ✅ fix #11 | — | |
| 12 | Mock+reali convivono | ✅ fix #11 | — | |
| 13 | tasks_insert created_by | ✅ Step J fix3 | — | |
| 14 | Demo switch confonde RLS | ✅ fix #14 | — | |
| 15 | VoyageDesk.jsx ~7200 righe | 🔶 Step N parziale | media | bundle ✅, refactor strutturale ⏳ Step P |
| 16 | Logout mancante UI | ✅ Step O | — | |
| 17 | TEAM seed locale al primo login | ✅ PR #22 | — | |
| 18 | Encoding mojibake preview import CSV | ⚪ Aperto | bassa | Quick win Pri 4 |
| 19 | Drift repo↔DB migrazioni | 🟡 Aperto | **Step R** | fix2 manca, DDL base non versionato, def stale `notify_queue_stale` |
| 20 | Index `messages(conversation_id)` | ✅ Step Q.5 (già esistente) | — | |
| 21 | Race init chat / realtime | ✅ Step Q.2 | — | generation counter |
| 22 | Errori reactions/markRead chat senza toast | ✅ Step Q.3 | — | |
| 23 | withOrigin parziale (comments, users) | ✅ Step Q.1 | — | |

**Aperti rilevanti**: #15 residuo (Step P), #19 (Step R), #10/#18/#2/#3/#8 (quick wins).

---

## 5. 🚧 ROADMAP — Prossima sessione (in ordine)

### Pri 1 — Step R: Drift repo↔DB (~1-2 h, caveat #19) — **raccomandato**

Pulisce il debito di versionamento DB **prima** di affrontare Step P (refactor monolite): se Step P richiede un reset del DB locale, oggi il repo non è ricostruibile. Inoltre la def stale di `notify_queue_stale` confonde audit.

Pianificato (da handoff v8):
1. **DDL tabelle base mancante.** Esportare lo schema effettivo di `tasks`, `users`, `conversations`, `messages`, `notices`, `comments` da Supabase.
2. **`step_j_fix2.sql` perso.** Dalla handoff v5 risulta applicata solo via MCP — cercare in `mcp__supabase__list_migrations` se Supabase ha mantenuto la copia.
3. **Def stale `notify_queue_stale`** (`20260610_notifications_extra.sql:214`). È sovrascritta da `step_j_fix.sql:40` — aggiungere commento "superseded by step_j_fix" o rimuoverla.
4. Verificare che applicando le migrazioni in ordine su un DB vuoto si ottenga lo stesso schema del progetto remoto (smoke-test).

### Pri 2 — Step P: Refactor monolite VoyageDesk.jsx (~4-6 h, caveat #15 residuo)

Da handoff v8 §5 (ridefinito post-finding #3):
1. **Prima** sostituire i `let` mutabili `TEAM`/`CATEGORIES`/`CURRENT_USER` con un puro flusso state→context, deprecando `_syncTeam`/`_syncCategories`/`_syncCurrentUser`. È invasivo (molti helper li usano) ma sblocca Step P senza trascinarsi dietro il pattern ibrido.
2. **Poi** estrarre componenti in `src/components/` (calendar, admin, chat, dashboard, tasks, modali).
3. **Lazy-load** su modali e viste non-default → ulteriore riduzione del chunk principale.

### Pri 3 — Quick wins (~1-2 h totali)

- **#10**: estrarre hook `useDebouncedTableSubscription(table, reload, delay=200)`.
- **#18**: mojibake CSV → `XLSX.read(buf, { type: 'array', codepage: 65001 })`.
- **#3**: Presence heartbeat: skip UPDATE se status invariato.
- **#2**: Mention edge case: parser boundary `\b` stringente.
- **#8**: Calendar settimana fissa: parametrizzare settimana di partenza.

---

## 6. Quick start prossima sessione

```
1. Leggi sez 0-2 di questo file
2. Decidi pri (raccomandato: Step R prima di Step P)
3. Crea branch dedicato (es. claude/step-r-drift-schema)
4. Esegui, verifica build, apri PR draft, attendi Vercel Ready, mergea (squash)
```

---

## 7. Note importanti per Claude nella prossima sessione

- **Merge squash**: convenzione fissa per questo repo.
- **PR sempre draft alla creazione**; togliere draft solo dopo Vercel preview Ready + verifica manuale / UI.
- **`package-lock.json` con CRLF**: il file repo ha CRLF; `npm install` su container Linux lo riscrive con LF. Scarta il diff cosmetico (`git checkout -- package-lock.json`) prima di chiudere il turno, altrimenti l'hook git-check fallirà.
- **Migrazioni**: ogni `apply_migration` MCP va riflessa in un file `supabase/migrations/<data>_<nome>.sql` versionato. Non lasciare drift come per `step_j_fix2.sql`.
- **Step R e Step P**: sono azioni architetturali significative. Usa `AskUserQuestion` se serve chiarimento sul trade-off fra priorità. Se l'utente dice "procedi", prosegui in autonomia.
- **Vercel / Anteprima**: il branch sessione ha anteprima Vercel automatica. Link della PR nel commit message (come fatto in questo ciclo) rende facile il confronto prima del merge su `main`.
- **Caveat #17 e i `_sync*` globali**: è chiuso, ma la fragilità architetturale resta. Step P (passo 1) lo affronta alla radice.

---

**Fine handoff v9.** Sessione 15 ha chiuso 4 interventi UI (Cestino, ricerca unificata, Più task, responsive mobile). Pri 1 → Step R (drift) prima di Step P (refactor). Buona prossima sessione.
