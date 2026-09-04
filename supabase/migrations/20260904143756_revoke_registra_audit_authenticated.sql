-- 2026-09-04 — A-2 dell'audit del 4 settembre
-- `public.registra_audit()` torna riservata a service_role.
--
-- ─── COSA ERA APERTO ────────────────────────────────────────────────────────
--
-- La 20260826214000 concede la RPC a `authenticated`, e il corpo controlla una
-- cosa sola:
--
--     if v_me is null then raise exception 'Non autenticato.'; end if;
--
-- Cioè: chiunque abbia una sessione valida può scrivere nel registro di
-- controllo una voce con `action`, `target_type`, `target_id` e `details`
-- SCELTI DA LUI. Non può falsificare l'attore — `actor_id` viene da
-- `auth.uid()`, ed è la ragione per cui la RPC esiste invece di un
-- `GRANT INSERT` su `audit_log` — ma può contraffare tutto il resto e, non
-- avendo la funzione né tetti di lunghezza né limite di frequenza, può
-- sommergere le voci vere sotto quante ne vuole. Su un registro di controllo
-- le due cose si equivalgono: quello che si perde non è l'integrità della
-- singola riga, è la fiducia nell'insieme.
--
-- Passano anche i due chiamanti che OGNI ALTRO strato respinge, e per la
-- stessa ragione elencata in cima a `_shared/adminPredicate.ts`: una
-- SECURITY DEFINER non attraversa la RLS, quindi la policy RESTRICTIVE
-- `rls_active_only` (20260621153006) qui non si applica.
--   1. l'utente DISATTIVATO, che `active = false` esclude da ogni tabella;
--   2. l'invitato PENDING, mai approvato, che `coalesce(pending,false)`
--      esclude da `is_admin`/`is_active_user`/`can_liste`.
--
-- ─── PERCHÉ SI REVOCA INVECE DI METTERE UN GATE ─────────────────────────────
--
-- Perché non c'è un chiamante legittimo da proteggere: `registra_audit` NON è
-- chiamata da nessun percorso dell'applicazione. L'unica occorrenza in `src/`
-- è in `test/integration/rls.test.js`, cioè una sonda. Le scritture vere su
-- `audit_log` arrivano da due sorgenti, e nessuna delle due passa di qui:
--   • i trigger di riga (`audit_users_privilegi`, `audit_clients_insert`, …),
--     che girano come proprietario della tabella e non toccano questo GRANT;
--   • le Edge Function privilegiate, via `_shared/audit.ts`, che con la
--     service_role inserisce DIRETTAMENTE — e il preambolo di quel file dice
--     esattamente perché non passa dalla RPC (con la service_role `auth.uid()`
--     è null, quindi l'attore va passato per parametro; e il parametro la RPC
--     non ce l'ha, di proposito).
-- Verificato anche lato database prima di scrivere questa migrazione: nessuna
-- funzione di `public` o `private` nomina `registra_audit` nel proprio corpo.
--
-- Un gate (`private.is_active_user()`) più i tre limiti di
-- `segnala_errore_client` (20260903094500) sarebbe la risposta giusta se la
-- porta servisse a qualcuno. Non servendo a nessuno, la risposta giusta è
-- chiuderla: è codice di sicurezza che non va mantenuto, invece che codice di
-- sicurezza in più da mantenere.
--
-- È la stessa mossa della 20260729190431 su `reset_completo` — SENZA la
-- ragione che lì l'aveva fatta rimangiare 24 ore dopo (20260729193509: «l'admin
-- deve poter eseguire reset_completo dall'app»). Qui quel chiamante non esiste,
-- e questa nota è qui perché chi rileggesse la coppia revoke/regrant di luglio
-- non concluda che anche questa vada rimangiata.
--
-- ⚠️ SE UN DOMANI SERVISSE DAL CLIENT, non basta rifare il GRANT: vanno
-- aggiunti insieme il gate di attività e i tre limiti (tetti sui campi, ritmo,
-- e un tetto sulle RIGHE — è il terzo a rendere calcolabile il caso peggiore,
-- come C-1 dell'audit del 2 settembre ha stabilito su `error_reports`).
--
-- Idempotente: REVOKE su un privilegio già assente non è un errore.

revoke execute on function public.registra_audit(text, text, text, jsonb)
  from authenticated, anon, public;

-- Esplicito e non implicito. `service_role` ha già il privilegio per
-- appartenenza, ma il REVOKE qui sopra nomina `public` — e il GRANT a
-- service_role scritto accanto è ciò che dice, a chi legge questo file fra un
-- anno, che la funzione ha ancora un chiamante previsto e non è morta.
grant execute on function public.registra_audit(text, text, text, jsonb)
  to service_role;

comment on function public.registra_audit(text,text,text,jsonb) is
  'Scrittura sul registro di controllo per un chiamante che ha una sessione '
  'utente (l''attore è auth.uid(), non un parametro). Riservata a service_role '
  'dalla 20260904143756, A-2 dell''audit del 4 settembre: il GRANT ad '
  'authenticated era una porta di contraffazione del registro — action, '
  'target e details a scelta del chiamante, nessun tetto, nessun limite di '
  'frequenza, e aperta anche a un utente disattivato o pending, che una '
  'SECURITY DEFINER non fa passare dalla RLS — senza un chiamante legittimo: '
  'nessun percorso dell''app la usa. Riaprirla al client richiede insieme '
  'private.is_active_user() e i tre limiti di segnala_errore_client '
  '(20260903094500).';
