# HANDOFF — Sessione 24 · Inviti team reali (Fase 3 kickoff) (v22)
**Data:** 16 giugno 2026
**PR di riferimento:** **#64 DRAFT** su `claude/first-real-invites-juidur`
**Per:** Claude Code / Claude Cowork (prossima sessione 25)

> **LEGGI PRIMA:** `docs/CLAUDE.md` (convenzioni) → questo file → `docs/CHANGELOG.md`.
>
> Handoff v21 (sessione 23) rimane il riferimento per lo stato precedente (`main`). Questo v22 documenta solo la sessione 24 (PR #64 non ancora mergeata).

---

## 0. TL;DR (60 secondi)

- ✅ **PR #64 in draft** su `claude/first-real-invites-juidur`. Build verde: `index 268.02 kB │ gzip 63.94 kB`.
- ✅ **Edge Function `invite-user` v3** deployata su Supabase (progetto `vmxvnxsqfisucugcpqlc`).
- ✅ **Migration `20260616235900_invite_user_trigger`** applicata in produzione.
- 🚧 **Fase 3 kickoff**: inviti email reali → SetPasswordScreen → PendingScreen → Approva.
- ⛔ **Fase 3 Business RIMOSSA** dal progetto (handoff v21). **Non reintrodurre.**

---

## 1. Cosa è stato fatto (sessione 24, PR #64)

### Backend

**Edge Function `invite-user` v3** (`supabase/functions/invite-user/index.ts`):
- Endpoint admin-only (`verify_jwt: true` + check `role = 'admin'` in `public.users`).
- Chiama `auth.admin.inviteUserByEmail(email, { data: { name, role, capacity, color } })`.
- Pre-crea immediatamente il profilo in `public.users` con `pending=true, active=false` via `upsert`.
- Pre-crea `user_contacts` con l'email dell'invitato.
- Errori gestiti: email già registrata (409), non admin (403), campi mancanti (400).

**Migration `20260616235900_invite_user_trigger`**:
- Trigger `AFTER INSERT ON auth.users` → funzione `handle_new_auth_user()` (`SECURITY DEFINER`).
- Safety-net: crea `public.users` + `user_contacts` dai `raw_user_meta_data` dell'invito.
- `ON CONFLICT DO NOTHING` → idempotente se l'EF ha già creato il profilo.
- **Già applicata in produzione** (non ri-applicare).

### Frontend

**`src/lib/api.js`**:
- `Users.list()` → ora restituisce **tutti** gli utenti (inclusi `pending=true`) per AdminView.
- `Users.listActive()` → solo `active=true`, per select/assign task (ex `Users.list()`).
- `Users.invite(email, name, role, capacity, color)` → chiama EF via `supabase.functions.invoke`.
- `Users.approve(id)` → `UPDATE users SET pending=false, active=true`.

**`src/auth/AuthContext.jsx`**:
- `loadProfile`: query `all` senza filtro `active=true` → include pending (per AdminView).
- `needsPasswordSetup`: stato inizializzato leggendo `window.location.hash` prima che Supabase lo cancelli (`type=invite` o `type=recovery` → `true`).
- `updatePassword(password)`: chiama `supabase.auth.updateUser({ password })`, setta `needsPasswordSetup=false` on success.

**`src/auth/LoginScreen.jsx`**:
- Aggiunge `SetPasswordScreen`: schermata imposta-password per primo accesso da link invito. Valida lunghezza minima (8 car.) + conferma password. Bottone "Esci" per annullare.
- Aggiunge `PendingScreen`: schermata "In attesa di approvazione" per account creati ma non ancora approvati dall'admin. Mostra l'email del proprio account.

**`src/main.jsx`**:
- `AuthGate` gestisce 5 stati in ordine:
  1. `loading` → spinner
  2. `!session` → `LoginScreen`
  3. `needsPasswordSetup` → `SetPasswordScreen`
  4. `!profile` → spinner (profilo non ancora caricato)
  5. `profile.pending` → `PendingScreen`
  6. else → `VoyageDesk`

**`src/components/modals/AddTeamMemberModal.jsx`** (rewrite completo):
- Rimuove la checkbox "simula iscrizione", aggiunge campo `email` (required).
- Su submit: chiama `Users.invite()`, aspetta risposta, mostra errore inline se fallisce.
- On success: dispatch `ADD_TEAM_MEMBER` (ottimistico, pending=true) + toast "Invito inviato a [email]".
- Dropdown ruolo ora usa valori DB (`agent`, `manager`, `driver`, `admin`) con label italiane.

**`src/state/reducer.js`**:
- Aggiunge `SET_TEAM` action: aggiorna `state.team` e chiama `setTeam()` globale. Non è in `ADMIN_ONLY_ACTIONS` né `LOGGED_ACTIONS` (è dispatch interno).

**`src/VoyageDesk.jsx`**:
- Dispatch wrapper: aggiunge sync DB per `APPROVE_TEAM_MEMBER` (`Users.approve`) e `TOGGLE_TEAM_MEMBER_ACTIVE` (`Users.setActive`).
- Deps `useCallback`: aggiunto `state.team` (necessario per `TOGGLE_TEAM_MEMBER_ACTIVE`).
- Subscription realtime su tabella `users`: quando cambia (nuovo invitato/approvazione da altro client), ricarica tutti gli utenti e dispatch `SET_TEAM`.

**`src/components/admin/AdminView.jsx`**:
- Pulsante `+ Aggiungi agente` → `✉️ Invita agente`.
- `existingIds` rimosso dalla prop (non più usato nel modal rewrite).

---

## 2. Flusso inviti end-to-end

```
Admin → AdminView > Team > "✉️ Invita agente"
  → Modal: email + nome + ruolo + capacità + colore → "Invia invito"
  → Users.invite() → Edge Function → auth.admin.inviteUserByEmail()
  → Supabase invia email con magic link
  → public.users creato con pending=true, active=false

Utente riceve email → clicca link → app con #access_token&type=invite
  → AuthContext.needsPasswordSetup = true → SetPasswordScreen
  → Imposta password → supabase.auth.updateUser({password})
  → needsPasswordSetup = false → profile caricato
  → profile.pending = true → PendingScreen ("In attesa di approvazione")

Admin vede l'utente in "⏳ Iscrizioni in attesa"
  → clicca "✓ Approva"
  → dispatch APPROVE_TEAM_MEMBER → reducer aggiorna state + DB: pending=false, active=true
  → Subscription realtime users → altri client vedono l'approvazione in tempo reale

Utente ricarica pagina → profile.pending = false → accede a VoyageDesk normalmente
```

---

## 3. Stato corrente

### Branch / PR
- `claude/first-real-invites-juidur` → PR **#64 DRAFT** (non ancora mergeata in `main`).
- Preview Vercel: `tullio-git-claude-first-real-invites-juidur-tooco-s-projects.vercel.app`

### Build
```
dist/assets/index-*.js   268.02 kB │ gzip: 63.94 kB
✅ Build verde.
```

### Supabase
- Edge Function `invite-user`: **v3 ACTIVE** (deployata sessione 24).
- Migration `20260616235900_invite_user_trigger`: **già applicata in produzione**.

### Caveat aperti
- Nessuno di nuovi. Il precedente tracker #1–#28 è tutto chiuso (vedi handoff v21).

---

## 4. Cosa fare nella prossima sessione (25)

### Step immediato: merge PR #64
La PR è draft — se il test manuale è OK, cambiala in "ready for review" e fai merge in `main`.

### Fase 3 — Continuazione (da concordare)

**A. Hardening RLS / isolamento multi-agenzia** (grande, da pianificare):
- Attualmente il progetto è "mono-agenzia": tutti i dati sono visibili a tutti i login.
- Serve: colonna `agency_id` sulle tabelle principali + policy RLS `agency_id = auth.jwt()->>'agency_id'`.
- Richiede decisione architetturale prima di iniziare.

**B. Quick win post-invito** (piccoli, frontend-only):
- Pulsante "Rinvia invito" nella card pending (chiama di nuovo l'EF con `inviteUserByEmail` — Supabase lo gestisce come re-invite se l'email non è ancora confermata).
- Notifica all'admin quando un utente completa il signup (trigger `auth.users` UPDATE su `email_confirmed_at`).
- `PendingScreen` con countdown/polling automatico per rilevare la propria approvazione senza reload manuale.

**C. Candidati micro-UI rimasti (da v21):**
- Refactor `openDossierById` in PraticheView (quick win frontend).
- Filtro data/ora coda Driver (Giulia).
- Dark mode (CSS variables pronte).

---

## 5. Note tecniche / gotcha

- **`Users.list()` ora include pending**: qualsiasi codice che iterava su `Users.list()` aspettandosi solo utenti attivi potrebbe comportarsi diversamente. In VoyageDesk, `getAssignableTeam()` in `appGlobals.js` filtra già `!m.pending`, quindi task assign non è impattato.
- **`SET_TEAM` non è in `ADMIN_ONLY_ACTIONS`**: lo dispatch viene fatto internamente da VoyageDesk (subscription realtime), non da UI admin. Aggiungendolo ad `ADMIN_ONLY_ACTIONS` si bloccherebbe l'aggiornamento automatico per utenti non-admin.
- **`needsPasswordSetup` è volatile**: se l'utente ricarica la pagina dopo il click sul link ma prima di impostare la password, la variabile torna `false` (l'hash URL è già sparito). Non è un bug: il login funziona, e la password si può sempre reimpostare via "forgot password".
- **CRLF su `src/VoyageDesk.jsx`**: verificare `git diff --numstat src/VoyageDesk.jsx` prima del push (vedi CLAUDE.md §7).
- **Migration già live**: `20260616235900_invite_user_trigger.sql` è già in produzione. Non ri-applicare.

---

## 6. Changelog sessione 24 (per CHANGELOG.md)

Vedere voce `v2.7-dev` che andrà aggiunta al CHANGELOG prima del merge.
