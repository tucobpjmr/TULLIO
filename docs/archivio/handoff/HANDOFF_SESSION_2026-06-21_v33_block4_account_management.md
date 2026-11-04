# HANDOFF — Session 33 (Block 4: Account Management — UI sky blue, presenza, cambio password, eliminazione account)

> **Status**: Block 4 completo ✅
> **Branch**: `claude/pr-73-merge-preview-02y67z`
> **PR**: #75 (draft → pronto per merge)
> **Base**: `main` @ `f697cfa`

---

## 0. TL;DR

Tre aree coperte in questa sessione:

1. **Shell più chiara** — `--sky` portata da `#87CEEB` a `#D0EEF9` (celeste quasi bianco) su topbar, sidebar e bottom-nav. Tutte le icone/testi muted su sfondo chiaro portate a opacità 0.65–0.80 per leggibilità.
2. **Presenza nel pannello admin** — ogni card membro in `AdminView` mostra ora un dot colorato (verde/ambra/grigio) sovrapposto all'avatar e la label "ultimo accesso X min fa" nella riga sottotitolo.
3. **Block 4 — Account Management**:
   - **Cambia password in-app**: sezione collassabile in `ProfileEditor` (solo con sessione reale), validazione minimo 8 char + conferma, feedback inline.
   - **Elimina account self-service**: sezione "zona pericolosa" collassabile, richiede digitazione esatta di `ELIMINA` prima di confermare. Il backend disabilita l'utente (`active=false`) e lo banna per 87600h (10 anni) senza cancellare chat/commenti.

---

## 1. Cosa è stato fatto

### 1a. Shell — Colore e contrasto

**`src/VoyageDesk.jsx`** (blocco `<style>` FontLoader)
- `--sky: #87CEEB` → `--sky: #D0EEF9` (celeste molto tenue)

**`src/components/shell/Topbar.jsx`**
- Subtitle "TRAVEL MANAGEMENT": `rgba(15,32,68,0.55)` → `0.75`
- Search icon: `0.5` → `0.7`
- UserSwitcher role text: `0.55` → `0.75`
- UserSwitcher dropdown arrow: `0.5` → `0.7`

**`src/components/shell/Sidebar.jsx`**
- Collapse toggle button: bg `0.07→0.09`, border `0.12→0.18`, color `0.5→0.7`
- Tutti i nav item inattivi: `rgba(15,32,68,0.6)` → `0.80` (replace_all)
- Chat button: `0.6` → `0.8`
- Label "TEAM ONLINE": `0.45` → `0.65`
- BottomNav item inattivi: `rgba(15,32,68,0.55)` → `0.75` (replace_all)
- BottomNav chat button: `0.55` → `0.75`

---

### 1b. Presenza in AdminView

**`src/components/admin/AdminView.jsx`**

Helper aggiunti (module-scope, prima di `card`):
```jsx
const PRESENCE_COLOR = { online: "#2D7A4F", busy: "#C8832A", offline: "#9999AA" };
const fmtLastSeen = (ts) => {
  if (!ts) return null;
  const ms = Date.now() - new Date(ts).getTime();
  const min = Math.round(ms / 60000);
  if (min < 2) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h fa`;
  return `${Math.round(h / 24)}g fa`;
};
```

Dentro `card()`:
- Avatar wrappato in `position: relative`, dot 11×11px `position: absolute, bottom: 0, right: -1` con colore da `PRESENCE_COLOR[m.status]`.
- Riga sottotitolo: aggiunta `{seenLabel && <span> • ultimo accesso {seenLabel}</span>}`.

Dati disponibili: `state.team[*].status` e `state.team[*].last_seen_at` già caricati via `loadProfile` in `AuthContext` (spread `{ ...u }` su tutti gli utenti).

---

### 1c. Block 4 — Account Management

#### Edge Function `delete-account`

**`supabase/functions/delete-account/index.ts`** (nuovo, `verify_jwt: true`, deployato in prod v2)
- Verifica JWT → ottiene `user.id` tramite `userClient.auth.getUser()`.
- `adminClient.from("users").update({ active: false }).eq("id", user.id)` — disabilita il profilo pubblico.
- `adminClient.auth.admin.updateUserById(user.id, { ban_duration: "87600h" })` — ban 10 anni: impedisce login futuri senza cancellare dati.
- **Perché non `deleteUser`**: `comments.user_id ON DELETE CASCADE` e `messages.sender_id ON DELETE CASCADE` da `public.users` — la cancellazione hard azzerrebbe la cronologia chat. Il ban + `active=false` è sicuro.

#### API

**`src/lib/api.js`** — `Users.deleteAccount()`:
```js
deleteAccount: async () => {
  const { data, error } = await supabase.functions.invoke('delete-account');
  if (error) { ... normalizzazione errore ... }
  if (data?.error) return { data: null, error: { message: data.error } };
  return { data, error: null };
},
```

#### AuthContext

**`src/auth/AuthContext.jsx`** — `deleteAccount()`:
```js
const deleteAccount = async () => {
  const res = await Users.deleteAccount();
  if (!res.error) await supabase.auth.signOut();
  return res;
};
```
Esposto in `value`.

#### ProfileEditor

**`src/components/modals/ProfileEditor.jsx`** — 2 nuove sezioni collassabili:

**Cambia password** (visibile solo con `session`):
- Toggle `🔑 Cambia password` ▲/▼
- Due input password (nuova + conferma), validazione lato client (min 8, match)
- Feedback inline ok/err, reset field su successo

**Elimina account** (visibile solo con `session`):
- Toggle `⚠️ Elimina account` in rosso
- Box avvertenza rosso chiaro + istruzioni
- Input "Scrivi ELIMINA per confermare" — bottone "Elimina account definitivamente" abilitato solo quando `deleteConfirm === "ELIMINA"`
- Su successo: `deleteAccount()` → `signOut()` → app smonta automaticamente (nessun redirect manuale necessario)

---

## 2. Stato prod (`vmxvnxsqfisucugcpqlc`)

- Edge Function `delete-account` v2 **ACTIVE** (deployata in questa sessione).
- Nessuna migration DB: la funzione usa tabelle e auth già esistenti.
- `user_app_preferences` già presente (sessione 32).

---

## 3. Note / limitazioni

1. **Ban vs. delete**: il ban 87600h è reversibile da un admin Supabase. Se in futuro si vuole cancellazione fisica, aggiungere un job pg_cron che hard-deletes gli utenti bannati da > N mesi.
2. **Email non liberata**: il campo `email` in `auth.users` resta occupato (utente bannato). Per riutilizzarla bisogna cancellare l'utente dalla dashboard Supabase.
3. **Sessioni attive**: il ban invalida le sessioni esistenti al prossimo refresh token; la `signOut()` nel client garantisce disconnessione immediata per l'utente che si elimina.
4. **Presenza in AdminView**: aggiornata al mount/render della tab; non si aggiorna in realtime (richiede reload o cambio tab). Il dato `last_seen_at` viene scritto da `Users.setPresence` all'ingresso app (VoyageDesk.jsx).

---

## 4. Prossimi step

Tutti i blocchi "essenziali" (1–4) sono completati. Le prossime aree secondo ROADMAP:

- **Block 2** (deferred): RLS hardening pending users — non urgente finché non ci sono utenti reali.
- **Block 3 residuo**: resend confirmation email UI, bulk invite admin.
- **Migliorie incrementali**: menzioni @utente in bacheca, eventi multipli/ricorrenti nel calendario, tab Urgenti dashboard estesa.
- **Traccia tecnica**: chat `useState` → `useReducer`, TypeScript, Vitest.

---

**Session 33 — Block 4 Account Management: COMPLETO ✅**
