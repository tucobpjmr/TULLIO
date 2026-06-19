# HANDOFF — Session 28 (Block 3: Email Confirmation & Admin Controls)

> **Status**: Block 3 — primo giro COMPLETO ✅ (notifica admin signup, inviti email, predisposizione email confirmation)
> **Branch**: `claude/block3-email-confirm-invites`
> **Base**: `main` dopo merge **#66** (Block 1 auth/onboarding + v2.8-dev) e **#67** (server-fix migration)
> **Per**: sessione 29

---

## 0. TL;DR

- ✅ **#67** e **#66** mergiati su `main` in questa sessione → `main` ora ha Block 1 (auth UI, signUp/reset, PendingScreen, Users.approve) + la migration server-side `20260619_security_dedupe_signup_trigger`.
- ✅ **RLS hardening core verificato in prod**: RLS attiva su tutte le 9 tabelle; advisor residui = 2 falsi positivi documentati (`is_admin`/`is_manager_or_admin`) + toggle `leaked_password_protection`.
- ✅ **Block 3 (primo giro)**:
  - **Notifica admin su signup** — trigger `notify_user_pending` (migration applicata in prod) + notifica `user_pending` nel frontend.
  - **Inviti utente reali via email** — Edge Function `invite-user` (deployata in prod, v4) + `Users.invite()` + campo email in `AddTeamMemberModal`.
  - **Email confirmation** — frontend pronto; manca solo il toggle dashboard Supabase.
- 🚧 **Aperto**: toggle dashboard (email confirmation + leaked password protection), bulk invite, UI "reinvia conferma", refresh team live dopo invito.

---

## 1. Cosa è stato fatto

### Merge su main
- **#67** (`claude/handoff-changelog-server-fix-pbn8ux`) → main: porta in repo la migration `20260619_security_dedupe_signup_trigger.sql` (già live in prod).
- **#66** (`claude/handoff-changelog-roadmap-wm7scp`) → main: Block 1 + sessioni 25–27 (mergeable_state `clean`, CI verde). La migration condivisa con #67 si è auto-risolta (contenuto identico, nessun conflitto).

### Block 3 — server-side
- **`supabase/migrations/20260619_notify_user_pending.sql`** (applicata in prod): funzione `notify_user_pending()` SECURITY DEFINER + trigger `trg_notify_user_pending` AFTER INSERT su `public.users`. Notifica gli admin attivi quando nasce un utente `pending=true` (vale sia per signup self-service che per invito admin, perché entrambi inseriscono in `public.users`).
- **`supabase/functions/invite-user/index.ts`** (salvata da #64, deployata in prod v4, `verify_jwt:true`): invito admin-only via `auth.admin.inviteUserByEmail` + pre-crea profilo + contatto.

### Block 3 — frontend
- `src/lib/api.js` → `Users.invite({email,name,role,capacity,color})` (invoca la Edge Function, normalizza l'errore localizzato).
- `src/components/modals/AddTeamMemberModal.jsx` → campo **Email**: con email = invito reale; senza = agente locale (vecchio comportamento). Mappa ruolo UI→DB.
- `src/components/shell/Topbar.jsx` → `user_pending` in `NOTIF_ICONS` (👤) e `notifTitle()`.
- `src/auth/AuthContext.jsx` → commento signUp aggiornato (handle_new_auth_user + notify_user_pending).

Build `npm run build`: ✅ verde (117 moduli).

---

## 2. Stato prod (Supabase `vmxvnxsqfisucugcpqlc`)

### Trigger su `public.users`
- `trg_notify_user_pending` → `notify_user_pending()` (NEW).

### Trigger su `auth.users`
- `on_auth_user_created` → `handle_new_auth_user()` (unico, dedup fatto in #67).

### Edge Functions
- `invite-user` — ACTIVE, v4, verify_jwt.

### Migrations applicate (nuove questa sessione)
- `notify_user_pending` (oltre alle già presenti).

---

## 3. Caveat / cose da fare (sessione 29)

1. **Toggle dashboard (manuale — nessun tool MCP)**:
   - Supabase → Authentication → Providers/Email → **"Confirm email"** ON per attivare l'email confirmation (il frontend è già pronto).
   - Authentication → Policies → **Leaked password protection** ON (chiude l'advisor residuo).
2. **Refresh team live dopo invito**: la subscription realtime su `users` aggiorna solo `presenceMap`, non la lista team del reducer. Dopo un invito il nuovo pending appare al reload. Per il live serve dispatch SET_TEAM / re-idratazione (non fatto, scope contenuto).
3. **Bulk invite** e **UI "reinvia conferma"**: non implementati.
4. **#64** (`claude/first-real-invites-juidur`): branch obsoleto (pre-#63/Block 1). Ne è stata salvata solo la Edge Function. **Da chiudere** — un rebase reintrodurrebbe Pratiche/Fornitori e rimuoverebbe Block 1.

---

## 4. RLS — stato (confermato in prod)

- RLS ON su tutte le 9 tabelle public.
- Advisor security residui: `is_admin()`/`is_manager_or_admin()` SECURITY DEFINER eseguibili da authenticated = **falso positivo documentato** (usate nelle policy RLS); `leaked_password_protection` = toggle dashboard.
- Block 2 (isolamento SELECT utenti pending a livello RLS) resta **deliberatamente rinviato**: `users_select_all` ha `qual=true` per authenticated; il blocco pending è solo nel gate frontend (`PendingScreen`). Applicare quando ci saranno dati reali.

---

**Session 28 — Block 3 (primo giro): COMPLETE ✅**
