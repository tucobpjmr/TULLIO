# Handoff — Cloud Gold

> Documento di passaggio per la sessione successiva di sviluppo VoyageDesk.
> Aggiornato al: 2026-06-07 (post sessione 11, v0.12-dev)

---

## Stato repository

- **Branch**: `claude/endorf-roadmap-review-oUDia`
- **PR #7**: draft aperta su GitHub, Vercel preview attivo e verde
- **Ultimo commit**: `d1f5fcd` — notifiche dinamiche + badge nav
- **Working tree**: pulito

```bash
git clone https://github.com/tucobpjmr/TULLIO
cd TULLIO
npm install
npm run dev  # http://localhost:5173
```

---

## Cosa è stato fatto in questa sessione

### v0.10 — Anagrafica Clienti CRM
- Nuova vista "Clienti" (👤 nel nav, Admin/Manager/Agent)
- 6 clienti mock pre-caricati (corrispondono ai clienti nei task esistenti)
- CRUD completo: add, edit, delete (solo Admin)
- Pannello dettaglio: contatti, note, tag, task collegati per nome
- `state.clients` aggiunto all'initialState

### v0.11 — Task rapido + Import CSV
- **QuickAddTask**: dropdown clienti + categoria → titolo auto-generato
- **Import clienti**: bottone 📥 in Clienti, SheetJS, mapping colonne multi-lingua, anteprima duplicati

### v0.12 — Notifiche reali + Badge nav
- `getNotifications(state)`: genera notifiche live (scaduti, 24h, coda, pending team)
- ID deterministici per persistenza stato "letto" (`state.readNotifIds`)
- `MARK_NOTIF_READ`, `MARK_ALL_NOTIF_READ`
- NotificationsPanel rinnovato: filtro Tutte/Non lette, click → apre task
- Badge rossi live su Sidebar e BottomNav (Dashboard=coda, Admin=pending)

---

## Prossimi step consigliati (in ordine)

### 1. Merge PR #7 → main
La PR è draft e pronta. Mergiare prima di aprire nuovi branch.

### 2. Quick wins (ognuno ~1 sessione)

#### A — Task link cliccabile nella chat
**File**: `src/VoyageDesk.jsx` — cerca il componente `Message` e la sezione `ConversationView`
**Problema**: quando si invia un link a un task nella chat (es. `[Task: Visto Giappone]`), è testo statico.
**Soluzione**: parsare i messaggi per il pattern `[Task: ...]`, renderizzare come `<span>` cliccabile che fa `dispatch({ type: "SET_SELECTED_TASK", payload: task })`.
**Hint**: in `ChatContext` ci sono già `tasks` e `currentUserId` — usarli nel componente `Message`.

#### B — Modifica assegnatari da TaskSlideOver
**File**: `src/VoyageDesk.jsx` — componente `TaskSlideOver`
**Problema**: per cambiare gli assegnatari bisogna aprire la modale di edit completa.
**Soluzione**: aggiungere nel pannello dettaglio task un row di avatar cliccabili con `+` per aggiungere assegnatari inline, senza aprire l'edit.
**Azione reducer**: `UPDATE_TASK` con `{ id, assignees: [...] }`.

#### C — Filtro coda Driver per data
**File**: `src/VoyageDesk.jsx` — componente `PersonalQueue`
**Problema**: Giulia (Driver) vede tutti i suoi task transfer in lista piatta.
**Soluzione**: aggiungere un toggle "Oggi / Tutto" che filtra `t.dueDate` per il giorno corrente. Su mobile mostrare come agenda verticale con ora.

### 3. Persistenza Supabase (L effort)

I file sono già pronti in `src/lib/`:
```
src/lib/supabase.js       ← client configurato (richiede env vars)
src/lib/api.js            ← CRUD layer completo
src/lib/auth/AuthContext.jsx
src/lib/auth/LoginScreen.jsx
```

**Variabili d'ambiente necessarie** (`.env` locale, Vercel env vars per deploy):
```
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

**Schema DB da creare** (Supabase SQL editor o migration):
```sql
-- users (estende auth.users)
create table users (
  id uuid primary key references auth.users,
  name text, role text, avatar text, color text,
  capacity int, active boolean default true, pending boolean default false,
  email text, phone text, photo_url text
);

-- tasks
create table tasks (
  id text primary key, title text, category text, priority text,
  status text, assignees text[], client text, due_date timestamptz,
  estimated_hours float, description text, deleted_at timestamptz,
  created_at timestamptz default now()
);

-- clients
create table clients (
  id text primary key, name text, type text, email text, phone text,
  address text, notes text, tags text[], total_spend float default 0,
  created_at timestamptz default now(), last_contact timestamptz
);

-- notices, conversations, messages (vedi src/lib/api.js per i campi)
```

**Passi di integrazione**:
1. Avvolgere `VoyageDeskInner` con `AuthProvider` in `src/main.jsx`
2. In `VoyageDeskInner`, leggere il `currentUser` da `AuthContext` invece di `CURRENT_USER`
3. Sostituire `INITIAL_TASKS`/`INITIAL_CLIENTS` con fetch da `api.js` in `useEffect`
4. Ogni `dispatch` che modifica dati → chiamare anche l'API corrispondente

---

## File chiave

| File | Righe | Scopo |
|------|-------|-------|
| `src/VoyageDesk.jsx` | 8025 | Tutta l'app |
| `docs/CLAUDE.md` | — | Istruzioni sviluppo, modelli dati, componenti |
| `docs/ROADMAP.md` | — | Pianificazione fasi e sequenza consigliata |
| `docs/CHANGELOG.md` | — | Storia versioni |
| `src/lib/api.js` | 98 | CRUD Supabase |
| `src/lib/auth/AuthContext.jsx` | 71 | Auth context |
| `src/lib/auth/LoginScreen.jsx` | 76 | Login UI |

---

## Utenti mock (per testare)

| ID | Nome | Ruolo | Note |
|----|------|-------|------|
| `marco` | Marco Ferretti | Manager | utente default |
| `sofia` | Sofia Conti | Senior Agent | |
| `luca` | Luca Moretti | Junior Agent | |
| `giulia` | Giulia Ricci | Driver | vede solo transfer |
| `roberto` | Roberto Esposito | Admin | accesso completo |

Cambio utente: dropdown nell'angolo in alto a destra (UserSwitcher).

---

## Decisioni prese in questa sessione

- **Niente Anagrafica Fornitori**: non necessaria per il flusso dell'agenzia
- **Niente Pratiche di viaggio**: deprioritizzate, la gestione task è sufficiente
- **Flusso minimo task**: cliente + categoria bastano, titolo auto-generato
- **Notifiche**: generate dal vivo dallo state, nessun DB dedicato (per ora)
