-- B-2 (audit del 22 agosto) — Chiude le due tabelle rimaste fuori dal gate
-- RESTRICTIVE "utente attivo" introdotto da 20260621153006 e già applicato
-- alle altre undici tabelle sensibili (l'ultima, message_templates, in
-- 20260811224053).
--
-- LA SITUAZIONE. Su push_subscriptions, solo INSERT e UPDATE richiedono
-- private.is_active_user() (via WITH CHECK nelle rispettive policy): SELECT
-- e DELETE no. Su user_app_preferences il gate non c'è affatto. L'impatto è
-- minimo — sono in entrambi i casi le proprie righe, e i dati non sono
-- sensibili — ma l'asimmetria è il difetto: chi legge le policy non può
-- dedurre la regola, e la prossima tabella verrà scritta copiando quella
-- sbagliata.
--
-- Una policy RESTRICTIVE è in AND con tutte le PERMISSIVE esistenti (le
-- quattro "_own"/"_self" sopra): una riga sola per tabella basta, ed è la
-- stessa forma usata per le altre undici.
drop policy if exists "rls_active_only" on public.push_subscriptions;
create policy "rls_active_only" on public.push_subscriptions
  as restrictive for all to authenticated
  using (private.is_active_user()) with check (private.is_active_user());

drop policy if exists "rls_active_only" on public.user_app_preferences;
create policy "rls_active_only" on public.user_app_preferences
  as restrictive for all to authenticated
  using (private.is_active_user()) with check (private.is_active_user());
