# HANDOFF — Session 36 (Go Live completato)

> **Data**: 2026-06-27
> **Branch di lavoro**: `claude/ecstatic-lamport-ysu2d4` (mergiato in `main`)
> **PR**: #77 — **MERGIATA** in `main` ✅
> **Sessione precedente**: v35 (debug pre-go-live: URL config, SMTP, delete utente)

---

## 0. TL;DR

L'app è **in produzione** su `tullio-seven.vercel.app`.
Tutti i blocchi pre-go-live sono stati completati e testati con successo.

| Blocco | Stato |
|---|---|
| R1 — SMTP email (Resend) | ✅ funzionante |
| R2 — Test onboarding end-to-end | ✅ superato |
| R3 — Merge PR #77 in main | ✅ mergiato (commit `75224c1`) |

---

## 1. Cosa è stato fatto in questa sessione

### 1a. Diagnosi SMTP (log Supabase)
- Errore confermato dai log: `535 "Invalid username"` → credenziali Resend errate
- L'utente ha corretto le credenziali nel Dashboard Supabase
- Verifica dai log: `/recover` status 200 alle 21:22, `/verify` 303 alle 21:23 — reset password funzionante ✅

### 1b. Merge PR #77 in main (go-live)
- PR convertita da draft a ready
- Mergiata via `merge commit` → SHA `75224c1dc9e30e6af08c0cac0250c11febf96233`
- Vercel auto-deployato su `tullio-seven.vercel.app`

### 1c. Test onboarding end-to-end (R2)
- Admin ha eliminato Cosimo dal pannello Team → cancellazione reale dal DB via Edge Function `delete-user`
- Admin ha re-invitato Cosimo → email con link corretto (Vercel, non localhost)
- Cosimo ha impostato la password → accesso → PendingScreen
- Admin ha approvato Cosimo → accesso completo all'app
- **Tutti i test superati** ✅

---

## 2. Stato attuale del progetto

```
main ──── (production — LIVE su tullio-seven.vercel.app)
  ├── Block 5: allegati task ✅
  ├── fix: SPA routing Vercel ✅
  ├── fix: security/perf RLS ✅
  ├── fix: redirectTo invito/reset ✅
  └── fix: delete utente persistente ✅
```

**Nessun branch di lavoro aperto.** Il prossimo sviluppo dovrà creare un nuovo branch da `main`.

---

## 3. Architettura di riferimento (stabile)

```
Browser (React SPA)
  └── Vite 6 build → Vercel CDN (tullio-seven.vercel.app)
        ├── vercel.json: rewrite /* → / (SPA routing)
        └── env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY

Supabase (vmxvnxsqfisucugcpqlc, eu-west-1, ACTIVE_HEALTHY)
  ├── Auth: email/password, invite, recovery
  │     ├── Site URL: https://tullio-seven.vercel.app
  │     └── Redirect URLs: *.vercel.app/**
  ├── DB (Postgres): users, tasks, comments, notices, clients,
  │                  conversations, messages, notifications,
  │                  user_contacts, user_app_preferences,
  │                  task_files
  ├── Storage: chat-files (privato), task-files (privato) — 25MB max
  ├── Edge Functions (Deno, verify_jwt):
  │     ├── invite-user (v6) — admin invia invito email
  │     ├── delete-account (v2) — self-service ban 87600h
  │     └── delete-user (v1) — admin hard-delete con CASCADE
  └── SMTP: Resend (smtp.resend.com:465, user=resend)
```

---

## 4. Configurazione ambiente

| Risorsa | Valore |
|---|---|
| Supabase project | `vmxvnxsqfisucugcpqlc` (eu-west-1) |
| Vercel project | `prj_wTgRmOAIjzVwxDrwNKB0X5PqqlB8` |
| Team Vercel | `team_gWKjAgtqUI6mX6tyZEfUA1xH` |
| Dominio produzione | `tullio-seven.vercel.app` |
| Branch attivo | `main` (tutto mergiato) |
| Edge Functions | `invite-user` (v6), `delete-account` (v2), `delete-user` (v1) |
| SMTP | Resend — `smtp.resend.com:465`, username=`resend` |

---

## 5. Attività post go-live (non bloccanti)

| Attività | Dove | Urgenza |
|---|---|---|
| Attivare HIBP (leaked password check) | Supabase → Auth → Password Protection | Bassa |
| Aggiungere dominio personalizzato | Vercel → Domains + Resend → Domains | Quando disponibile |
| Template email personalizzati (logo, colori) | Supabase → Auth → Emails → Templates | Estetica |
| Test bulk invite con email reali | AdminView → Invito multiplo | Dopo primo utente reale |
| Monitoraggio errori (Sentry o simile) | Aggiungere SDK al progetto | Quando ci sono più utenti |
| Rate limit email: aumentare soglia Resend | resend.com → Limits | Se si invitano molti utenti |

---

## 6. Note per la prossima sessione

- **L'app è live**: qualsiasi modifica deve partire da un nuovo branch da `main`
- **Non toccare** le migration già applicate (security + performance RLS delle sessioni 33-34)
- **Non droppare** le Edge Functions — `delete-user` è attiva e usata dall'admin
- Se si aggiunge SMTP alternativo: la configurazione è in Supabase Dashboard (non nel codice)
- Il codice client usa già `window.location.origin` come `redirectTo` ovunque — funzionerà anche con un dominio personalizzato senza modifiche
- La chiave API Resend è nel Dashboard Supabase (non nel `.env` del progetto, è corretta così)
