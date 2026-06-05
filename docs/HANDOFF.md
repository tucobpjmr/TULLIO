# VoyageDesk — Documento di Handoff
_Aggiornato: sessione 9 (v0.9-dev) — giugno 2026_

---

## Stato attuale in una riga

App React 18 (~7200 righe, single-file) con tutte le funzioni operative in memoria (no persistenza), ospitata su GitHub, pronta per essere deployata come SPA statica o collegata a un backend.

---

## Cosa funziona oggi

| Area | Stato |
|------|-------|
| Dashboard (code, bacheca, scadenze, carico team) | ✅ operativo |
| Calendario mese + settimana | ✅ operativo |
| Task management CRUD completo | ✅ operativo |
| Bulk Task Creator (manuale / duplica / CSV / template) | ✅ operativo |
| Cestino con soft-delete + ripristino con modifica | ✅ operativo |
| Chat interna 1:1 e gruppo (vocali, file, reply, reazioni, typing) | ✅ operativo |
| Reazioni emoji custom (70 emoji, picker estesa) | ✅ operativo v0.9 |
| Task link cliccabile in chat (chip → SlideOver) | ✅ operativo v0.9 |
| Chiamate audio/video mock UI | ✅ operativo v0.9 |
| Click-to-contact telefono/SMS/WhatsApp nelle task | ✅ operativo v0.9 |
| AI Day Planner (via Claude API) | ✅ operativo (key richiesta) |
| Sistema permessi Admin/Manager/Agent/Driver | ✅ operativo |
| Multi-utente mock (UserSwitcher) | ✅ operativo |
| Profilo personale (avatar, email, telefono) | ✅ operativo |
| Ricerca avanzata (keyword, date, categoria, stato, agente) | ✅ operativo |
| Pannello Admin (team, import/export, categorie, log) | ✅ operativo |
| Responsive completo (mobile 320px+, tablet, desktop) | ✅ operativo |
| SwipeActions mobile (Fatto/Cestino/Inoltra + undo) | ✅ operativo |

---

## Cosa manca per essere "live al 100%"

### Blockers assoluti (senza questi non è una web app reale)

1. **Persistenza dati** — oggi tutto vive in RAM: refresh = dati persi.
2. **Autenticazione reale** — oggi chiunque accede e può cambiare utente con un click.
3. **Deploy pubblico** — oggi gira solo in locale (`localhost:5173`).

### Dipendenze funzionali (valore business)

4. **Anagrafica Clienti + Fornitori** — senza questi le Pratiche non esistono.
5. **Pratiche di viaggio** — il modulo centrale che aggrega tutto.
6. **Notifiche reali** — oggi il campanellino è solo mock.
7. **Modulo finanziario** — preventivi, pagamenti, margini.

---

## Stack tecnologico

```
Frontend:  React 18 + Vite 5 (già configurato nel repo)
Stile:     CSS inline + CSS variables (no Tailwind, no librerie UI)
Font:      Playfair Display + DM Sans (Google Fonts, caricati runtime)
Build:     vite build → dist/ (SPA statica, ~806KB gzip ~241KB)
AI:        Claude API (anthropic.com/v1/messages) — usata da AIDayPlanner
Dati demo: SheetJS (xlsx) per import/export Excel
```

---

## Struttura repository

```
tucobpjmr/TULLIO (GitHub)
├── src/
│   ├── VoyageDesk.jsx   # app completa (~7200 righe)
│   └── main.jsx         # entry point React
├── docs/
│   ├── HANDOFF.md       # questo file
│   ├── ROADMAP.md       # roadmap dettagliata con dipendenze
│   ├── CLAUDE.md        # istruzioni per Claude Code (LEGGI SEMPRE PRIMA)
│   ├── PROJECT_SPEC.md  # specifiche tecniche
│   └── CHANGELOG.md     # storico versioni
├── test/
│   └── esempio_import_task.csv
├── .gitignore
├── package.json
├── package-lock.json
├── vite.config.js
└── index.html
```

---

## Come avviare in locale

```bash
git clone https://github.com/tucobpjmr/TULLIO
cd TULLIO
npm install
npm run dev
# → http://localhost:5173
```

Build di produzione:
```bash
npm run build
# → dist/ (SPA statica deployabile ovunque)
```

---

## Decisione architetturale aperta

Il progetto è a un bivio: **dati in memoria vs backend reale**.

| | Opzione A (solo frontend) | Opzione B (con backend) |
|---|---|---|
| **Persistenza** | localStorage (semplice, no server) | Supabase/PostgreSQL (robusto, multi-device) |
| **Auth** | Simulata o magic link | JWT reale con RLS Supabase |
| **Multi-utente** | Stesso browser | Browser diversi, device diversi |
| **Costo infra** | Zero (hosting statico) | Supabase free tier = zero fino a ~50k righe |
| **Complessità** | Bassa | Media (ma Supabase MCP automatizza molto) |
| **Raccomandazione** | MVP veloce per demo/uso personale | Produzione reale per team |

**Per un'agenzia viaggi reale con più operatori → Opzione B obbligatoria.**

---

## Convenzioni da rispettare (per Claude Code)

Leggere **sempre** `docs/CLAUDE.md` prima di toccare il codice. Contiene:
- Pattern React obbligatori (immutabilità, hover, animazioni)
- Regola CSS: solo inline + CSS variables, mai librerie
- Helper già scritti da non duplicare
- Permessi: ogni nuova feature che tocca task deve usare `canViewTask`/`canEditTask`
- Sync globale: `TEAM`/`CATEGORIES`/`CURRENT_USER` sono `let` mutabili — non usare Context diretto

---

## Claude API (AI Day Planner)

Il planner usa `https://api.anthropic.com/v1/messages` con chiamata diretta dal browser.
- In Claude.ai artifacts funziona nativamente.
- In produzione serve o un proxy backend (evita di esporre la key) oppure configurare CORS su Supabase Edge Function.
- Key da settare come variabile d'ambiente `VITE_ANTHROPIC_KEY` e iniettare nel componente `AIDayPlanner`.

---

## Deploy su dominio IONOS (vedi ROADMAP per dettaglio)

IONOS supporta hosting statico. Il processo è:
1. `npm run build` → genera `dist/`
2. Upload `dist/` via FTP/SFTP o deploy automatico da GitHub Actions
3. Configurare `_redirects` o regola `.htaccess` per SPA routing (tutte le route → `index.html`)
4. (Opzionale) Puntare il dominio personalizzato IONOS all'hosting o a Vercel/Netlify se si usa CI/CD

**Consiglio**: usare Vercel (gratuito, CI/CD automatico da GitHub push, dominio custom IONOS con CNAME) invece di FTP manuale IONOS.
