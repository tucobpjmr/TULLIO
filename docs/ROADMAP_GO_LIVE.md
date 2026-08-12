# ROADMAP GO-LIVE — Tullio / VoyageDesk

> Aggiornata: 2026-06-27 (sessione 35)
> Obiettivo: portare l'app in produzione e renderla operativa per utenti reali.
> OneDrive (Block 6) e WhatsApp (Block 7) sono stati **abbandonati** su richiesta.

---

## Stato attuale

```
main ──── (production — ancora vecchia versione senza Block 5)
  └── PR #77 (draft) ── claude/ecstatic-lamport-ysu2d4
        ├── Block 5: allegati task ✅
        ├── fix: SPA routing Vercel ✅
        ├── fix: security/perf RLS ✅
        ├── fix: redirectTo invito/reset ✅
        └── fix: delete utente persistente ✅
```

---

## Blocchi rimanenti prima del go-live

### 🔴 R1 — SMTP email funzionante
**Stato**: configurato (Resend), non ancora validato.

Passi:
- [ ] Verificare credenziali SMTP in Supabase (username=`resend`, password=chiave `re_...`)
- [ ] Test reset password → email arriva con link corretto
- [ ] Test invito → email arriva con link corretto

**Fallback**: usare Brevo (`smtp-relay.brevo.com`, porta 587) se Resend non si sblocca.

---

### 🔴 R2 — Test onboarding end-to-end
**Stato**: parziale. Cosimo ha confermato la email ma è rimasto bloccato in pending.

Passi (dopo R1):
- [ ] Admin elimina Cosimo da pannello Team → ora si cancella davvero dal DB
- [ ] Admin reinvita Cosimo → link corretto nell'email
- [ ] Cosimo imposta password → accede → vede PendingScreen
- [ ] Admin approva Cosimo → Cosimo entra nell'app
- [ ] Cosimo testa funzionalità base (task, chat, calendario)

---

### 🟡 R3 — Merge PR #77 in main (go-live)
**Stato**: in attesa di R1 e R2.

Passi:
- [ ] Converti PR #77 da draft a ready for review
- [ ] Merge in main
- [ ] Vercel auto-deploya `tullio-seven.vercel.app`
- [ ] Smoke test su produzione (login, task, chat, invito)

---

## Post go-live (priorità bassa, non bloccanti)

| Attività | Dove | Urgenza |
|---|---|---|
| ~~Attivare HIBP (leaked password check)~~ — ⛔ accettato: richiede piano Supabase Pro, progetto sul Free per scelta (12 agosto) | Supabase → Auth → Password Protection | — |
| Aggiungere dominio personalizzato (`tuaagenzia.it`) | Vercel → Domains + Resend → Domains | Quando disponibile |
| Template email personalizzati | Supabase → Auth → Emails | Estetica |
| Test bulk invite con email reali | AdminView → Invito multiplo | Dopo primo utente reale |
| Monitoraggio errori (Sentry o simile) | Aggiungere SDK | Quando ci sono più utenti |

---

## Architettura di riferimento (stabile)

```
Browser (React SPA)
  └── Vite 6 build → Vercel CDN (tullio-seven.vercel.app)
        ├── vercel.json: rewrite /* → / (SPA routing)
        └── env: VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY

Supabase (vmxvnxsqfisucugcpqlc, eu-west-1)
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

## Checklist finale go-live

- [x] SPA routing Vercel (`vercel.json`)
- [x] Vite 5→6 (fix CVE esbuild)
- [x] RLS security hardening (clients_insert, is_active_user anon)
- [x] RLS performance (auth.uid() → select, policy dedup)
- [x] redirectTo dinamico (invito + reset + resend puntano a Vercel)
- [x] Delete utente persistente (Edge Function delete-user)
- [x] Site URL Supabase → tullio-seven.vercel.app
- [x] Redirect URLs Supabase → *.vercel.app/**
- [ ] SMTP validato (R1)
- [ ] Test onboarding end-to-end (R2)
- [ ] Merge PR #77 → main (R3)
