# VoyageDesk — Roadmap operativa v2
_Piano per portare l'app al 100% operativo. Aggiornato sessione 9._

**Legenda**
Priorità: 🔴 Bloccante · 🟡 Alta · 🟢 Media · ⚪ Nice-to-have
Sforzo: `S` ~1 sessione · `M` 2-3 sessioni · `L` 4+ sessioni
Strumenti: `Claude Code` = sessione di sviluppo · `Claude Design` = revisione UI/UX

---

## Fase 0 — Fondamenta infra (pre-requisito tutto il resto)
> Senza questa fase l'app non è usabile da un team reale.

### 0a. Persistenza + Auth reale
**Strumento**: Claude Code · Sforzo: **L** · Priorità: 🔴

Tecnologia consigliata: **Supabase** (MCP già disponibile in Claude Code).

Passi:
1. Creare progetto Supabase (o collegare esistente)
2. Schema tabelle:
   - `users` (id, email, name, role, avatar, color, phone, photo_url, active, pending)
   - `tasks` (id, title, category, priority, status, assignees[], client_id, due_date, estimated_hours, description, deleted_at, created_by)
   - `comments` (id, task_id, user_id, text, created_at)
   - `notices` (id, text, color, pinned, author_id, created_at)
   - `conversations` (id, type, name, icon, participants[], pinned)
   - `messages` (id, conversation_id, sender_id, type, text, file_name, file_size, file_type, duration, waveform, reply_to, task_ref, reactions jsonb, read_by[], created_at)
3. Row Level Security (RLS): ogni utente vede solo i propri dati secondo la matrice permessi già implementata
4. Auth: email/password via Supabase Auth → JWT → `state.currentUserId` reale
5. Sostituire mock data con query Supabase (`supabase-js`)
6. Sostituire `CURRENT_USER` mock con utente autenticato

**Stima**: 4-6 sessioni Claude Code (schema + RLS + query + auth flow).

### 0b. Deploy su dominio IONOS
**Strumento**: Claude Code (CI/CD) · Sforzo: **S** · Priorità: 🔴

**Opzione consigliata — Vercel (gratis, CI/CD automatico)**:
1. Collegare repo GitHub `tucobpjmr/TULLIO` a Vercel
2. Build command: `npm run build`, Output: `dist`
3. Aggiungere variabili d'ambiente Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_ANTHROPIC_KEY`
4. In IONOS: aggiungere record DNS `CNAME` → `cname.vercel-dns.com`
5. In Vercel: aggiungere dominio personalizzato → genera certificato SSL automatico

**Alternativa — Hosting IONOS direttamente**:
- Upload `dist/` via FTP
- Aggiungere `.htaccess` per SPA routing:
  ```apache
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
  ```
- Limite: niente CI/CD automatico, variabili env non disponibili → API key esposte

**→ Vercel + CNAME IONOS è la scelta giusta.**

---

## Fase 1 — Modello dati core (valore business)
> Queste sono le entità che un'agenzia viaggi usa ogni giorno.

| Modulo | Sforzo | Priorità | Note |
|--------|--------|----------|------|
| **Anagrafica Clienti** | M | 🔴 | Vista CRM: lista clienti, scheda dettaglio (dati anagrafici, storico pratiche/task, documenti, note). Collegamento task → cliente già presente come stringa, va promosso a FK reale. |
| **Anagrafica Fornitori** | M | 🔴 | Hotels, tour operator, compagnie aeree, NCC. Campi: nome, categoria fornitore, contatti, contratti attivi, note. |
| **Pratiche di viaggio** | L | 🔴 | Entità centrale. Numerazione `PR-2026-001`. Stati: Bozza→Confermata→In Corso→Completata/Annullata. Aggrega: task, clienti, fornitori, documenti, pagamenti. Timeline eventi. Riepilogo economico (costi/ricavi/margine). |
| **Task ↔ Cliente ↔ Pratica** | M | 🔴 | Link bidirezionali. TaskSlideOver mostra pratica di appartenenza. Ricerca avanzata filtro per pratica. |

**Strumento**: Claude Code · 6-8 sessioni totali.

---

## Fase 2 — Notifiche reali
> Sblocca badge, alert su scadenze, menzioni. Dipende da Supabase Realtime.

| Feature | Sforzo | Priorità |
|---------|--------|----------|
| Notifiche in-app (campanellino reale) | M | 🟡 |
| Push via Supabase Realtime (nuovo task assegnato, commento, scadenza <24h) | M | 🟡 |
| Badge sidebar: Dashboard (coda globale), Admin (pending) | S | 🟡 |
| "Segna tutte lette", filtri notifiche | S | 🟡 |
| Menzioni @utente in bacheca con notifica | S | 🟡 |
| Alert manager se task in coda > N ore | S | 🟢 |

**Strumento**: Claude Code · 2-3 sessioni.

---

## Fase 3 — Business & finanza
> Dipende da Pratiche (Fase 1).

| Modulo | Sforzo | Priorità | Note |
|--------|--------|----------|------|
| **Modulo finanziario** | L | 🟡 | Preventivi con righe (servizi, hotel, voli, transfer, assicurazioni). Calcolo margine. Stati pagamento (acconto/saldo/emesso). Collegato a Pratica. |
| **Report & Analytics** | M | 🟡 | Dashboard KPI reali: fatturato per periodo, margine per destinazione, performance agenti, task completati vs scaduti. Export PDF. |
| **Catalogo destinazioni / pacchetti** | M | 🟢 | Pacchetti preconfigurati con servizi inclusi e prezzi base. Usato per pre-compilare preventivi. |

**Strumento**: Claude Code + Claude Design (UI preventivi) · 4-6 sessioni.

---

## Fase 4 — Scala & accessi (in corso)
> Estensioni per team più grandi e funzionalità avanzate.

| Modulo | Stato | Sforzo | Priorità | Note |
|--------|-------|--------|----------|------|
| Auth reale + isolamento dati | → Fase 0a | L | 🔴 | — |
| Estensioni chat (reazioni custom) | ✅ v0.9 | — | — | — |
| Task link in chat | ✅ v0.9 | — | — | — |
| Chiamate mock UI | ✅ v0.9 | — | — | — |
| Click-to-contact tel/SMS/WA | ✅ v0.9 | — | — | — |
| AI: Genera preventivo da testo | S | 🟢 | Prompt Claude → prefill form preventivo |
| AI: Auto-categorizzazione task | S | 🟢 | Suggerisce categoria + priorità da titolo/desc |
| AI: Suggerimento assegnatario | S | 🟢 | Basato su carico e specializzazione |
| WebRTC audio/video reale | L | ⚪ | Dipende da Supabase Realtime o Daily.co |

---

## Migliorie incrementali (quick win, ordine consigliato)

Tutte realizzabili in **mezza sessione Claude Code** ciascuna:

| Feature | Priorità | Note |
|---------|----------|------|
| Modifica assegnatari da TaskSlideOver | 🟡 | Oggi si può solo leggere |
| Badge coda globale in sidebar/bottom-nav | 🟡 | Counter già disponibile nello stato |
| Badge agenti pending in voce Admin | 🟡 | Idem |
| Coda Driver: filtro per data/ora (agenda giornaliera) | 🟡 | Giulia ha bisogno di una vista transfer per orario |
| Dark mode | 🟢 | CSS variables già pronte, serve solo toggle |
| Skeleton loading su prime render | 🟢 | Migliora perceived performance |
| Filtro nella coda globale (categoria/priorità) | 🟢 | |
| Toast "Hai preso in carico: [titolo]" | ⚪ | |
| Auto-move in Corso al "Prendi in carico" | ⚪ | |
| Export Log attività in CSV | ⚪ | |
| Comprimi sidebar desktop 1024-1280px | ⚪ | |

---

## Nuove funzionalità suggerite (non presenti nella roadmap originale)

### 📧 Email integration (consigliato)
- Ricezione email cliente → crea task automaticamente (via Supabase Edge Function + webhook email provider)
- Invio email automatica dal template messaggi (conferma prenotazione, richiesta pagamento)
- **Sforzo**: M · **Strumento**: Claude Code

### 📱 PWA (Progressive Web App)
- Aggiungere `manifest.json` e service worker → installabile su telefono come app nativa
- Notifiche push native (iOS/Android)
- **Sforzo**: S · **Strumento**: Claude Code

### 🗂️ Gestione documenti
- Upload allegati su task (oggi è solo placeholder)
- Storage su Supabase Storage (bucket per pratica)
- Preview PDF/immagini inline
- **Sforzo**: M · **Strumento**: Claude Code

### 🔍 Ricerca globale tipo "command palette" (⌘K)
- Apre overlay con ricerca su tutto: task, clienti, pratiche, fornitori, messaggi
- Navigazione rapida da tastiera
- **Sforzo**: S · **Strumento**: Claude Code + Claude Design

### 📊 Integrazione Google Calendar / iCal
- Export scadenze task come eventi calendario
- Import eventi da Google Calendar come task
- **Sforzo**: M · **Strumento**: Claude Code

### 🤖 Chatbot AI per clienti (avanzato)
- Widget sul sito agenzia → cliente chiede info su pratica
- Risponde tramite Claude con i dati della pratica specifica
- **Sforzo**: L · **Strumento**: Claude Code

---

## Sequenza operativa consigliata

```
Sessione 10  → Fase 0b: Deploy Vercel + dominio IONOS (1 sessione)
Sessione 11  → Fase 0a step 1-2: Supabase schema + RLS (1 sessione)
Sessione 12  → Fase 0a step 3-4: auth flow + sostituzione mock (2 sessioni)
Sessione 13  → Quick win: badge, modifica assegnatari, coda driver
Sessione 14  → Fase 1a: Anagrafica Clienti
Sessione 15  → Fase 1b: Anagrafica Fornitori
Sessione 16-17 → Fase 1c: Pratiche di viaggio
Sessione 18  → Fase 1d: collegamenti Task ↔ Cliente ↔ Pratica
Sessione 19  → Fase 2: Notifiche reali (Supabase Realtime)
Sessione 20  → PWA + documenti allegati
Sessione 21-22 → Fase 3: Modulo finanziario
Sessione 23  → Fase 3: Report & Analytics
Sessione 24  → Email integration
```

---

## Nota su Claude Design

Usare **Claude Design** (non Code) per:
- Revisione layout Anagrafica Clienti e Fornitori
- UI form preventivi (Fase 3) — spesso complessa e multi-step
- Dark mode (confronto palette visivo)
- Landing page o pagina di login (aspetto marketing)

Usare **Claude Code** per tutto ciò che richiede modifiche al JSX/logica.

---

## Riferimenti rapidi

| Cosa | Dove |
|------|------|
| Repo GitHub | `tucobpjmr/TULLIO` |
| Branch sviluppo attivo | `claude/confident-hamilton-0tZga` |
| PR aperta | `#5` (estensioni chat Fase 4) |
| Istruzioni per Claude | `docs/CLAUDE.md` — **leggi sempre prima** |
| Stato corrente dettagliato | `docs/HANDOFF.md` |
| Storico versioni | `docs/CHANGELOG.md` |
