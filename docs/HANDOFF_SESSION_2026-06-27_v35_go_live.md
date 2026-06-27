# HANDOFF — Session 35 (Debug pre-go-live: URL config, SMTP, delete utente)

> **Data**: 2026-06-27
> **Branch di lavoro**: `claude/ecstatic-lamport-ysu2d4`
> **PR**: #77 (draft, open — NON ancora mergiata in main)
> **Sessione precedente**: v34 (Block 5 allegati task + OneDrive/WhatsApp planning — poi abbandonati)

---

## 0. TL;DR

Questa sessione ha risolto **4 bug critici pre-lancio** che impedivano l'onboarding di nuovi utenti:

| Bug | Causa | Fix |
|---|---|---|
| Link invito/reset → localhost | Site URL Supabase = localhost | Config Dashboard Supabase (manuale) |
| SMTP errore "Error sending recovery email" | SMTP custom Resend non ancora validato | In corso (v. sezione 5) |
| `REMOVE_TEAM_MEMBER` non persisteva | Solo locale, niente DB write | Edge Function `delete-user` + VoyageDesk wiring |
| Re-invito falliva "già registrata" | Stessa causa sopra | Risolto dal delete corretto |

**Stato attuale**: PR #77 deployata su Vercel preview, SMTP Resend configurato ma non ancora validato, merge in `main` (go-live) in attesa.

---

## 1. Cosa è stato fatto in questa sessione

### 1a. Config URL Supabase (manuale — già eseguita)

Supabase Dashboard → Authentication → URL Configuration:

- **Site URL**: `https://tullio-seven.vercel.app`
- **Redirect URLs** aggiunti:
  ```
  https://tullio-seven.vercel.app/**
  https://tullio-tooco-s-projects.vercel.app/**
  https://tullio-git-main-tooco-s-projects.vercel.app/**
  https://*-tooco-s-projects.vercel.app/**
  ```

### 1b. SMTP custom Resend (configurato — da validare)

Supabase Dashboard → Authentication → Emails → SMTP Settings:

| Campo | Valore |
|---|---|
| Sender name | Tullio |
| Sender email | `onboarding@resend.dev` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | chiave `re_...` da resend.com |

**Problema attuale**: test reset password restituisce "Error sending recovery email". Possibili cause: chiave API errata/troncata, username sbagliato (deve essere letteralmente `resend`), porta errata.

### 1c. Edge Function `delete-user` — NUOVA (deployata v1)

File: `supabase/functions/delete-user/index.ts`

- Admin-only (verify_jwt, controlla `role='admin'`)
- Hard-delete da `auth.users` → CASCADE ripulisce `public.users` + `user_contacts`
- Blocca auto-delete (l'admin usa "Elimina account" dal profilo)
- Gestisce gracefully "not found" (ripulisce residui `public.users`)

### 1d. `REMOVE_TEAM_MEMBER` ora persiste al DB

File: `src/VoyageDesk.jsx` (linea ~709)

Prima: il cestino 🗑️ in AdminView rimuoveva l'utente solo dallo state React.
Dopo: chiama `UsersAPI.deleteUser(action.payload)` → Edge Function → hard delete.

### 1e. `Users.deleteUser(id)` in `src/lib/api.js`

Aggiunto dopo `deleteAccount`. Chiama `supabase.functions.invoke('delete-user', { body: { userId } })` con stessa normalizzazione errori degli altri metodi.

---

## 2. Stato attuale del branch

```
Branch: claude/ecstatic-lamport-ysu2d4
Ultimo commit: 6ed0ce1 — fix(admin): eliminazione definitiva utente per liberare email e re-invitare
PR #77: draft, open, 5 commit sopra main
Vercel preview: tullio-git-claude-ecstatic-lamport-ysu2d4-tooco-s-projects.vercel.app
```

**Commit in PR #77** (dal più vecchio):
1. `feat(block5+)` — merge allegati task + sessioni 30-34
2. `fix(deploy)` — vercel.json SPA + Vite 5→6
3. `fix(db)` — security + performance advisor fixes
4. `fix(invite)` — redirectTo dinamico link email invito
5. `fix(admin)` — eliminazione definitiva utente (questa sessione)

---

## 3. Problemi aperti (da risolvere nella prossima sessione)

### 🔴 P1 — SMTP Resend non funziona

**Sintomo**: "Error sending recovery email" sulla schermata reset password.

**Da fare**:
1. Vai su Supabase → Authentication → Emails → SMTP Settings
2. Verifica **esattamente**:
   - Username: `resend` (non l'email, non la chiave)
   - Password: chiave completa che inizia con `re_`
   - Port: `465`
   - Host: `smtp.resend.com`
3. Su resend.com → API Keys: verifica che la chiave sia **Active**
4. Se dubbi: elimina la chiave Resend e ricreala, aggiorna in Supabase
5. Riprova reset password

**Alternativa se Resend continua a dare problemi**: prova con **Brevo**:
- Host: `smtp-relay.brevo.com`, Port: `587`, Username: la tua email Brevo, Password: chiave SMTP da Brevo

### 🔴 P2 — Test end-to-end onboarding non completato

Da testare (in ordine):
1. ✅ Reset password → link arriva e punta a `tullio-seven.vercel.app` (da verificare dopo fix SMTP)
2. ⬜ Admin elimina Cosimo dal pannello Team (🗑️) → ora il DB viene effettivamente ripulito
3. ⬜ Admin re-invita Cosimo → email arriva con link corretto
4. ⬜ Cosimo imposta password → accede → vede PendingScreen
5. ⬜ Admin approva Cosimo → Cosimo ricarica → entra nell'app

### 🟡 P3 — Merge PR #77 in main (go-live)

In attesa del completamento dei test. Una volta che P1 e P2 sono verdi:
1. Converti PR #77 da draft a ready
2. Merge in main → Vercel auto-deploya `tullio-seven.vercel.app`
3. Verifica deploy production

---

## 4. Configurazione ambiente

| Risorsa | Valore |
|---|---|
| Supabase project | `vmxvnxsqfisucugcpqlc` (eu-west-1, ACTIVE_HEALTHY) |
| Vercel project | `prj_wTgRmOAIjzVwxDrwNKB0X5PqqlB8` |
| Team Vercel | `team_gWKjAgtqUI6mX6tyZEfUA1xH` |
| Dominio produzione | `tullio-seven.vercel.app` |
| Branch di lavoro | `claude/ecstatic-lamport-ysu2d4` |
| PR aperta | #77 |
| Edge Functions | `invite-user` (v6), `delete-account` (v2), `delete-user` (v1) |

---

## 5. File chiave modificati in questa sessione

| File | Tipo modifica |
|---|---|
| `supabase/functions/delete-user/index.ts` | NUOVO — hard-delete admin |
| `src/lib/api.js` | aggiunto `Users.deleteUser()` |
| `src/VoyageDesk.jsx` | `REMOVE_TEAM_MEMBER` → `UsersAPI.deleteUser()` |

---

## 6. Note per la prossima sessione

- **Non toccare** le migration già applicate a prod (security + performance di sessione precedente)
- **Non droppare** le Edge Functions esistenti — `delete-user` è nuova e non conflittuante
- Il codice client già passa `window.location.origin` come `redirectTo` ovunque (invite, reset, resend confirmation) — se l'SMTP funziona, il flusso è corretto
- `HIBP (leaked password check)` è ancora da attivare manualmente su Supabase Dashboard → Auth → Password Protection (low priority, post-go-live)
