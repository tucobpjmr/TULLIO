# VoyageDesk

Sistema gestionale per agenzie viaggi e tour operator.

## Stato attuale — v0.9-dev

App single-file React (~8856 righe) con tutte le feature operative funzionanti in memoria (no persistenza).

👉 **Leggi `docs/HANDOFF.md` prima di iniziare**: è il riassunto sempre aggiornato dello stato del lavoro e del prossimo step suggerito.

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
- **Ricerca avanzata** — barra di ricerca + filtri avanzati in un unico controllo nella topbar
- **Anagrafica Clienti (CRM base)** — vista dedicata, CRUD, ricerca, dettaglio con tab Anagrafica/Pratiche/Task
- **Pratiche di viaggio** — modulo centrale (numero progressivo PR-YYYY-NNN), stati Bozza→Confermata→In corso→Completata/Annullata, riepilogo economico, task collegati
- **Notifiche reali** — generate dagli eventi del reducer, per-utente, tab Tutte/Non lette, click → apre task

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
│   ├── HANDOFF.md            # ⭐ Punto di partenza: stato corrente + prossimo step
│   ├── CLAUDE.md             # Istruzioni per Claude Code (convenzioni, helper, modello dati)
│   ├── ROADMAP.md            # Piano sviluppo futuro per fasi
│   ├── CHANGELOG.md          # Storico versioni
│   └── PROJECT_SPEC.md       # Specifiche tecniche e architettura
├── test/
│   └── esempio_import_task.csv
├── package.json
├── vite.config.js
├── index.html
└── README.md
```

## Sviluppo con Claude Code (e cowork)

1. Apri `docs/HANDOFF.md` — è il riassunto sempre aggiornato dello stato del lavoro, di cosa è stato fatto e del prossimo step suggerito.
2. Poi consulta `docs/CLAUDE.md` per convenzioni di codice, helper utility, modello dati e azioni del reducer disponibili.
3. `docs/ROADMAP.md` ha il piano per fasi con priorità e dipendenze.

## Licenza

Progetto privato.
