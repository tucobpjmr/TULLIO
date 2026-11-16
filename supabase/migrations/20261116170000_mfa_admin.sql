-- A-2 dell'analisi del 15 novembre: l'admin entra solo con il secondo fattore.
--
-- Un admin invita altri admin, elimina utenti e lancia `reset_completo`. In
-- agenzia i PC sono condivisi e la protezione sulle password trapelate è
-- spenta (piano Free): la sola password era troppo poco.
--
-- La regola: un admin la cui sessione NON è `aal2` (password + codice TOTP)
-- vale per il database come un utente disattivato. Non legge e non scrive
-- niente; legge solo la propria riga di `users` (policy
-- `users_select_self_o_attivo`), che serve all'app per sapere che deve
-- chiedere il codice. Gli altri ruoli non cambiano.
--
-- DOVE. Ogni permesso del progetto passa da una delle nove funzioni qui sotto:
-- la policy RESTRICTIVE `rls_active_only` (tutte le tabelle tranne le sei
-- nominate sotto), `storage_active_only` e le policy di Realtime usano
-- `is_active_user()`; `audit_log`, `error_reports` e `users` usano
-- `is_admin()`/`is_active_user()`; le quattro tabelle delle Liste
-- `can_liste()`; ogni RPC SECURITY DEFINER apre con uno di questi gate.
-- `rate_limit` non ha policy. Quindi la condizione si aggiunge in un punto
-- solo, `private.mfa_soddisfatta()`, chiamato dai nove.
--
-- ⛔ Il resto di ogni corpo è IDENTICO alla versione in produzione al 16
-- novembre: l'unica riga aggiunta è `and private.mfa_soddisfatta(<ruolo>)`.
-- ⛔ Le Edge Function con la service_role non passano da qui: lo stesso
-- controllo sta in `_shared/adminPredicate.ts` (`mfaSoddisfatta`).
-- ⛔ Applicarla PRIMA che l'app con la schermata del codice sia online
-- chiuderebbe fuori l'admin. Con l'app online non serve che l'admin abbia
-- già il fattore: al primo accesso l'app glielo fa registrare (la
-- registrazione è un'API di Auth, non passa dalla RLS).

-- ── 0. La condizione ──────────────────────────────────────────────────────
-- `p_role` è il ruolo GREZZO della riga di `users`, come lo confrontano i
-- gate (`role = 'admin'`). `auth.jwt()->>'aal'` lo firma GoTrue: 'aal1' dopo
-- la sola password, 'aal2' dopo il codice. Senza claim (service_role, cron)
-- il ruolo non è comunque 'admin' perché `auth.uid()` è null.
create or replace function private.mfa_soddisfatta(p_role text)
 returns boolean
 language sql
 stable
 set search_path to ''
as $function$
  select p_role is distinct from 'admin'
      or coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2';
$function$;

-- La chiamano solo i nove gate qui sotto, che sono SECURITY DEFINER: nessun
-- ruolo dell'API ha bisogno di eseguirla.
revoke all on function private.mfa_soddisfatta(text) from public, anon, authenticated;

-- ── 1. is_active_user ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.is_active_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND active = true AND coalesce(pending, false) = false
      AND private.mfa_soddisfatta(role)
  );
$function$;

-- ── 2. is_admin ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'admin' AND active = true AND coalesce(pending, false) = false
      AND private.mfa_soddisfatta(role)
  );
$function$;

-- ── 3. is_manager_or_admin ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.is_manager_or_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role IN ('admin','manager') AND active = true AND coalesce(pending, false) = false
      AND private.mfa_soddisfatta(role)
  );
$function$;

-- ── 4. can_clienti_eliminazione ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.can_clienti_eliminazione()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.users
    where id = (select auth.uid())
      and active and coalesce(pending, false) = false
      and role = any (array['admin','manager'])
      and private.mfa_soddisfatta(role)
  );
$function$;

-- ── 5. can_clienti_scrittura ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.can_clienti_scrittura()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.users
    where id = (select auth.uid())
      and active and coalesce(pending, false) = false
      and role = any (array['admin','manager','agent'])
      and private.mfa_soddisfatta(role)
  );
$function$;

-- ── 6. can_liste ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.can_liste()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (SELECT auth.uid()) AND u.active AND coalesce(u.pending, false) = false
      AND u.role = ANY (ARRAY['admin','manager','agent'])
      AND private.mfa_soddisfatta(u.role)
  );
$function$;

-- ── 7. can_take_global_queue ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.can_take_global_queue()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.users u
    where u.id = (select auth.uid())
      and u.active = true
      and coalesce(u.pending, false) = false
      and (
        u.role in ('admin', 'manager')
        or (u.role = 'agent' and coalesce(u.seniority, 'senior') = 'senior')
      )
      and private.mfa_soddisfatta(u.role)
  );
$function$;

-- ── 8. can_use_task_category ──────────────────────────────────────────────
-- `p_category is null → true` resta com'era: è il ramo «nessuna categoria»,
-- e la riga passa comunque da `rls_active_only`, cioè da is_active_user().
CREATE OR REPLACE FUNCTION private.can_use_task_category(p_category text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select case
    when p_category is null then true
    else exists (
      select 1 from public.users u
      where u.id = (select auth.uid()) and u.active and coalesce(u.pending, false) = false
        and private.mfa_soddisfatta(u.role)
        and case
          when u.role = 'driver' then p_category = 'transfer'
          when u.role = 'agent' and coalesce(u.seniority, 'senior') = 'junior'
            then p_category not in ('payment', 'admin')
          else true
        end
    )
  end;
$function$;

-- ── 9. can_view_global_queue ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.can_view_global_queue()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role in ('admin','manager','agent')
      and active = true
      and coalesce(pending, false) = false
      and private.mfa_soddisfatta(role)
  );
$function$;
