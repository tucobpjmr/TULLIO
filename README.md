# VoyageDesk

Sistema gestionale per agenzie viaggi e tour operator.

## Stato attuale — v0.9-dev

Applicazione React + Supabase in produzione: ~23.000 righe su un centinaio di
moduli, con persistenza su PostgreSQL, Row Level Security, aggiornamenti
realtime, notifiche Web Push e quattro Edge Function.

> La descrizione precedente ("app single-file da ~7.071 righe, tutto in
> memoria, nessuna persistenza") risaliva a prima del refactoring Step P ed era
> rimasta ferma per molte sessioni.

### Feature completate

- **Dashboard** — saluto dinamico, 4 tab code (Globale/Personale/Scadute/Urgenti), bacheca avvisi, scadenze prossime, carico team
- **Calendario unificato** — vista mese + settimana con toggle, distribuzione settimanale agenti
- **Team** — card membro con carico, dettaglio task per agente
- **Chat interna** — 1:1 e gruppo, vocali con waveform, reply, emoji reactions, typing indicator, read receipts, intent con task link
- **Task management** — CRUD completo, 10 categorie, 4 priorità, 5 stati, commenti, slide-over dettaglio
- **Bulk Task Creator** — 4 tab (manuale, duplica, import CSV/Excel, template pratica)
- **Cestino** — soft-delete con ripristino + modifica prima del ripristino
- **Pannello Admin** — 5 tab (Team, Import/Export, Sistema, Categorie, Log attività)
- **Bacheca avvisi** — sticky notes condivise con pin, colori, CRUD
- **Permessi per ruolo** — Admin/Manager/Agent/Driver con matrice completa
- **Multi-utente mock** — UserSwitcher in topbar
- **Profilo personale** — modifica nome, avatar (emoji/foto), email, telefono
- **Responsive** — desktop + tablet + mobile (320px+), SwipeActions, BottomNav
- **Ricerca avanzata** — filtri keyword, date, categoria, stato, agente

- **Liste buoni viaggio** — modulo con movimenti, saldi, cointestazioni, cestino e storico
- **Anagrafica clienti** — CRM con import, task e liste collegati
- **Notifiche** — in-app (campanella) e Web Push su iOS/Android/desktop

### Stack

| | |
|---|---|
| Frontend | React 18 (`useReducer` + Context), Vite 6 |
| Backend | Supabase — PostgreSQL, RLS, Realtime, Storage, Auth, Edge Functions |
| Stile | CSS-in-JS + variabili di tema; token condivisi in `src/styles/tokens.js` |
| Import/export | SheetJS (`xlsx`), caricato on-demand |
| Test | Vitest + Testing Library — 676 test |
| Qualità | ESLint 9 (flat config) con `max-lines`, `no-restricted-imports` |
| Font | Playfair Display + DM Sans + Inter |
| Lingua UI | italiano |

## Setup locale

```bash
npm install
npm run dev
```

Apri `http://localhost:5173`.

## Struttura progetto

```
src/
├── VoyageDesk.jsx        orchestratore: compone hook e viste (~340 righe)
├── main.jsx              entry point, AuthGate, service worker
├── auth/                 AuthContext, login, recupero password
├── state/                reducer, persistence (registry), AppDataContext, mockData
├── hooks/                useAppHydration, useNotifications, usePresence,
│                         usePushNavigation, useChatData, useSyncedDispatch,
│                         useDebouncedTableSubscription
├── lib/                  api (data layer), permissions (pure), mappers, utils
├── styles/               GlobalStyles (tema), tokens (z-index, bottoni, campi)
├── components/
│   ├── shell/            Topbar, Sidebar/BottomNav, FAB, UserSwitcher
│   ├── dashboard/        Dashboard + queues/ (4 code) + NoticeBoard
│   ├── tasks/ clients/ calendar/ views/ admin/ chat/ liste/ search/
│   ├── notifications/ modals/ ui/
└── test/                 676 test (Vitest)

supabase/
├── migrations/           96 migrazioni SQL (schema, RLS, RPC, trigger)
└── functions/            invite-user, delete-user, delete-account, send-push

docs/                     vedi docs/INDEX.md
```

## Comandi

```bash
npm run dev      # dev server su http://localhost:5173
npm test         # Vitest
npm run lint     # ESLint
npm run build    # build di produzione
```

## Sviluppo con Claude Code

Leggi `docs/CLAUDE.md` prima di qualsiasi modifica: contiene convenzioni,
pattern, helper disponibili e i caveat accumulati. `docs/INDEX.md` dice quali
altri documenti sono vigenti e quali sono storici.

## Licenza

Progetto privato.
