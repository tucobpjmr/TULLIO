# Handoff v38 — VoyageDesk / TULLIO
**Data**: 2026-06-29  
**main HEAD**: `015ce41c` (merge PR #82)  
**Branch attivo**: `claude/handoff-v37-webapp-roadmap-zkj6ip` (già mergiato)  
**Deploy**: tullio-seven.vercel.app — build verde, Vercel Ready  
**Test**: 82/82 Vitest ✅ | lint 0 errori ✅ | build verde ✅

---

## Stack

| Layer | Tecnologia |
|---|---|
| Frontend | React 18 SPA + Vite 6 |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) |
| Edge Functions | Deno (su Supabase), `invite-user` v7 |
| Hosting | Vercel CDN |
| CI/CD | GitHub Actions → Vercel auto-deploy |

---

## Stato attuale (al merge PR #82)

### ✅ Risolti in questa sessione

| Fix | File/Area |
|---|---|
| Errore `{}` nell'invito agenti | `src/lib/api.js` — helper `errText()` |
| Render difensivo errore modale | `src/components/modals/AddTeamMemberModal.jsx` |
| SMTP error → messaggio azionabile 502 | `supabase/functions/invite-user/index.ts` (v7 deployata) |
| Rimozione completa campo `capacity` | 5 file: `AddTeamMemberModal.jsx`, `BulkInviteModal.jsx`, `AdminView.jsx`, `Team.jsx`, `Dashboard.jsx` |
| Crash "Cannot read properties of undefined (reading 'bg')" | `src/components/shell/Topbar.jsx` + `Dashboard.jsx` — fallback per category/priority rimossi |

### ⏳ Pendente — SMTP Supabase

Il dominio `londonviaggi.it` è stato **verificato su Resend** (DNS record aggiunti, status: Verified).  
**Manca ancora**: configurare l'SMTP custom in Supabase Dashboard:

```
Auth → SMTP Settings → Enable Custom SMTP
Sender:  noreply@londonviaggi.it
Host:    smtp.resend.com
Port:    465
Username: resend
Password: re_... (API key Resend)
```

Dopo la config: cliccare **"Test SMTP Settings"** e verificare che l'email arrivi.

### ⏳ Pendente — Test onboarding E2E (R2 roadmap)

Da eseguire dopo SMTP funzionante:
1. Admin elimina Cosimo (test user in `pending`) → verifica che sparisca dal DB
2. Admin reinvita Cosimo → email con link arriva correttamente
3. Cosimo imposta password → vede `PendingScreen`
4. Admin approva → Cosimo accede, testa task/chat/calendario

---

## File chiave

| File | Ruolo |
|---|---|
| `src/lib/api.js` | Client Supabase, helper `errText()` |
| `src/state/appGlobals.js` | TEAM, CATEGORIES, PRIORITIES, costanti globali |
| `src/state/reducer.js` | Reducer centrale (add/edit/delete task, team) |
| `src/components/shell/Topbar.jsx` | Shell principale, ricerca avanzata |
| `src/components/dashboard/Dashboard.jsx` | Dashboard con widget workload |
| `src/components/admin/AdminView.jsx` | Gestione team, inviti, utenti pending |
| `src/components/modals/AddTeamMemberModal.jsx` | Invito singolo agente |
| `src/components/modals/BulkInviteModal.jsx` | Invito multiplo |
| `src/components/views/Team.jsx` | Vista team & assegnazioni |
| `supabase/functions/invite-user/index.ts` | Edge Function invito (v7) |

---

## Pattern ricorrenti da rispettare

- **Fallback dizionari**: `CATEGORIES[t.category] || { icon: "📋", color: "#6B7280", bg: "#F9FAFB", label: t.category }` — sempre aggiungere per evitare crash su categorie legacy rimosse.
- **Errori API**: usare `errText(err.message, 'Fallback.')` — mai `JSON.stringify(err)` su oggetti Error.
- **Capacity**: **rimossa** — non reimplementare. Il campo `capacity` non è più nel DB state né nell'UI.
- **Branch**: creare nuovo branch da `main` per ogni sessione, naming `claude/<descrizione>-<hash>`.

---

## Roadmap (aggiornata)

### Fase 1 — Go-Live (blocchi obbligatori)

| # | Task | Stato |
|---|---|---|
| R1 | SMTP funzionante (Resend + londonviaggi.it) | ⏳ Config Supabase da fare |
| R2 | Test onboarding E2E | ⏳ Dipende da R1 |
| R3 | PR #82 merge in main | ✅ Fatto (`015ce41c`) |

### Fase 2 — Post Go-Live

| Intervento | Dove | Sforzo |
|---|---|---|
| HIBP password compromesse | Supabase → Auth → Password Protection (toggle) | S |
| Dominio personalizzato | Vercel → Domains + Resend → Domains | S |
| Template email personalizzati | Supabase → Auth → Emails | S |
| Resend confirmation email UI | `LoginScreen.jsx` → bottone "Reinvia email" | S |
| Sentry/monitoring errori | `src/main.jsx` + `vite.config.js` | S |

### Fase 3 — Evoluzione (non urgente)

| Intervento | File/Area | Sforzo |
|---|---|---|
| TypeScript migration | `*.jsx` → `*.tsx` + `tsconfig.json` | L |
| Chat `useState` → `useReducer` | `src/components/chat/ChatPanel.jsx` | M |
| Test Playwright responsive | Nuovo `tests/` | M |
| RLS hardening pending users | Migrations Supabase | S |

---

## Cosa NON ripristinare

- ❌ Block 6 OneDrive — abbandonato
- ❌ Block 7 WhatsApp — abbandonato  
- ❌ Pratiche/Fornitori (dossiers/suppliers) — rimossi sessione 24
- ❌ Campo `capacity` — rimosso sessione corrente

---

## Comandi utili

```bash
npm test          # 82/82 Vitest
npm run build     # build produzione
npm run lint      # 0 errori attesi
npm run dev       # dev server localhost:5173
```

```bash
# Deploy Edge Function (se modificata)
supabase functions deploy invite-user --project-ref <ref>
```
