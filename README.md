# VoyageDesk

Sistema gestionale per agenzie viaggi e tour operator.

## Stato attuale — v0.9.5

App single-file React (~7980 righe) con persistenza locale via `localStorage` (state app + chat). Primo step modello dati completo: **anagrafica Clienti** con vista dedicata, modale CRUD, picker nel form task. Dati conservati tra refresh. Badge contatori su nav, editor multi-assegnatari da TaskSlideOver, task link cliccabile nei messaggi chat, agenda Driver con filtri data e orario in evidenza.

### Feature completate

- **Dashboard** — saluto dinamico, 4 tab code (Globale/Personale/Scadute/Urgenti), bacheca avvisi, scadenze prossime, carico team
- **Calendario unificato** — vista mese + settimana con toggle, distribuzione settimanale agenti
- **Team** — card membro con carico, dettaglio task per agente
- **Chat interna** — 1:1 e gruppo, vocali con waveform, reply, emoji reactions, typing indicator, read receipts, intent con task link
- **Task management** — CRUD completo, 10 categorie, 4 priorità, 5 stati, commenti, slide-over dettaglio
- **Bulk Task Creator** — 4 tab (manuale, duplica, import CSV/Excel, template pratica)
- **AI Day Planner** — pianificazione giornaliera via Claude API
- **Cestino** — soft-delete con ripristino + modifica prima del ripristino
- **Pannello Admin** — 5 tab (Team, Import/Export, Sistema, Categorie, Log attività)
- **Bacheca avvisi** — sticky notes condivise con pin, colori, CRUD
- **Permessi per ruolo** — Admin/Manager/Agent/Driver con matrice completa
- **Multi-utente mock** — UserSwitcher in topbar
- **Profilo personale** — modifica nome, avatar (emoji/foto), email, telefono
- **Responsive** — desktop + tablet + mobile (320px+), SwipeActions, BottomNav
- **Ricerca avanzata** — filtri keyword, date, categoria, stato, agente
- **Persistenza locale** — stato app + chat su `localStorage` con versioning; reset disponibile in Admin → Import/Export

### Stack

- React 18 (hooks, useReducer, Context)
- CSS inline + CSS variables + classi responsive
- SheetJS (xlsx) per import/export
- Font: Playfair Display + DM Sans
- Lingua UI: italiano

## Setup locale

```bash
npm install
npm run dev
```

Apri `http://localhost:5173`.

## Struttura progetto

```
voyagedesk/
├── public/
├── src/
│   └── VoyageDesk.jsx      # App completa (single-file, da splittare)
├── docs/
│   ├── PROJECT_SPEC.md      # Specifiche tecniche e architettura
│   ├── CHANGELOG.md          # Storico versioni
│   ├── ROADMAP.md            # Piano sviluppo futuro
│   └── CLAUDE.md             # Istruzioni per Claude Code
├── test/
│   └── esempio_import_task.csv
├── package.json
├── vite.config.js
├── index.html
└── README.md
```

## Sviluppo con Claude Code

Leggi `docs/CLAUDE.md` prima di qualsiasi modifica. Contiene tutte le convenzioni, i pattern, gli helper disponibili e le istruzioni per Claude Code.

## Licenza

Progetto privato.
