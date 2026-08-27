-- A-3 dell'audit sicurezza del 26 agosto — `public.users` entra nel gate
-- "utente attivo", ma NON con la policy che hanno le altre quattordici.
--
-- ─── LA SITUAZIONE ────────────────────────────────────────────────────────
--
-- La migrazione 20260822190100 si apre dichiarando di chiudere «le due tabelle
-- rimaste fuori dal gate RESTRICTIVE». Il conteggio letto sul database di
-- produzione dice altro: quattordici tabelle su diciannove hanno
-- `rls_active_only`. Le cinque scoperte sono le quattro `liste_*` e `users`.
--
-- Le `liste_*` NON sono un problema, ed è importante dirlo qui perché la
-- prossima lettura non riapra la domanda: ogni loro policy passa da
-- `private.can_liste()`, che contiene già `u.active AND coalesce(u.pending,
-- false) = false`. Il gate c'è, espresso in un'altra forma.
--
-- `users` era scoperta davvero. Le sue uniche policy erano:
--
--     users_select_all | SELECT | using (true)
--     users_update     | UPDATE | using (id = auth.uid() OR is_admin())
--
-- Due categorie di chiamante passavano di qui ed erano respinte da ogni altra
-- tabella del sistema:
--
--   1. l'utente INVITATO E NON ANCORA APPROVATO. Ha una sessione valida dal
--      momento in cui clicca il link d'invito. L'app lo ferma (PendingScreen),
--      il database lo ferma ovunque (`is_active_user()` è falsa per un
--      pending) — tranne qui: una GET su /rest/v1/users gli consegnava nomi,
--      ruoli, seniority, capacity e invited_by di tutto il team. È il gate di
--      approvazione, cioè la ragione per cui la colonna `pending` esiste, che
--      non si applica alla tabella in cui quella colonna vive.
--   2. l'utente APPENA DISATTIVATO. Da 20260628 `set-user-active` banna anche
--      la sessione, ed è la correzione giusta — ma il ban agisce al REFRESH
--      del token: l'access token già emesso resta valido fino a scadenza. In
--      quella finestra ogni altra tabella lo respinge; `users` continuava a
--      servirlo in lettura e ad accettare scritture sulla sua riga.
--
-- ─── PERCHÉ NON UNA `rls_active_only` COPIATA DALLE ALTRE ──────────────────
--
-- La forma usata sulle altre quattordici tabelle —
--
--     as restrictive for all to authenticated
--     using (private.is_active_user()) with check (private.is_active_user())
--
-- — qui ROMPEREBBE IL FLUSSO PENDING, ed è l'unica ragione per cui questa
-- migrazione è più lunga di quella. `AuthContext.caricaProfilo` legge la
-- PROPRIA riga (`select('*').eq('id', userId).single()`) prima di qualunque
-- altra cosa; con una RESTRICTIVE su `is_active_user()` quella select
-- tornerebbe vuota per un utente pending, `AuthGate` non troverebbe `profile`
-- e mostrerebbe ProfileErrorScreen — «profilo non trovato» — invece di
-- PendingScreen. L'invitato vedrebbe un guasto al posto di «in attesa di
-- approvazione», e chi amministra non avrebbe modo di collegare le due cose.
--
-- Il gate va quindi messo SULLA RUBRICA, non sul profilo: la riga propria
-- resta leggibile sempre — è ciò che permette di distinguere «in attesa» da
-- «profilo mancante» — e le righe ALTRUI si vedono solo da dentro.
--
-- In scrittura non esiste un caso legittimo simmetrico: un utente pending o
-- disattivato non ha nulla da aggiornare sul proprio profilo (PendingScreen
-- non espone alcun campo, e la password vive in auth.users, non qui). Lì il
-- gate si applica pieno.
--
-- ⚠️ NOTA PER CHI VERIFICA. Gli admin continuano a vedere pending e
-- disattivati nel pannello Team: `private.is_active_user()` è SECURITY
-- DEFINER, quindi non attraversa a sua volta questa policy, e un admin attivo
-- passa dal secondo ramo del SELECT leggendo tutto. Il trigger
-- `users_block_privileged_self_update` resta al suo posto e continua a essere
-- ciò che impedisce l'escalation vera (role/active/pending/capacity/
-- seniority/id): questa migrazione non lo sostituisce, chiude una porta
-- diversa.

-- ─── SELECT ────────────────────────────────────────────────────────────────
drop policy if exists "users_select_all" on public.users;

create policy "users_select_self_o_attivo" on public.users
  for select to authenticated
  using (
    -- La propria riga, sempre: senza questo ramo un utente pending non può
    -- sapere di essere pending (vedi sopra).
    id = (select auth.uid())
    -- La rubrica del team: solo per chi è attivo e approvato.
    or (select private.is_active_user())
  );

-- ─── UPDATE ────────────────────────────────────────────────────────────────
drop policy if exists "users_update" on public.users;

create policy "users_update" on public.users
  for update to authenticated
  using (
    (id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  )
  with check (
    (id = (select auth.uid()) and (select private.is_active_user()))
    or (select private.is_admin())
  );

-- ─── ANNOTAZIONE SULLE liste_* ─────────────────────────────────────────────
-- Non cambia alcun comportamento: mette per iscritto, dove qualcuno andrà a
-- cercarlo, il perché quelle quattro tabelle non hanno `rls_active_only`. È
-- la domanda che questo audit ha dovuto porre al database perché il repository
-- non la rispondeva.
comment on table public.liste_viaggio is
  'Il gate "utente attivo" NON è una policy rls_active_only come sulle altre '
  'tabelle: è dentro private.can_liste(), che ogni policy di questa tabella '
  'chiama e che contiene già active AND coalesce(pending,false)=false. '
  'Stessa cosa per movimenti_lista, lista_beneficiari, lista_history. '
  'Vedi docs/AUDIT_SICUREZZA_2026-08-26.md, rilievo A-3.';
