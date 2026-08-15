-- C-1 dell'audit del 15 agosto (docs/AUDIT_ARCHITETTURA_2026-08-15.md).
--
-- IL PROBLEMA. handle_new_auth_user prendeva il ruolo da raw_user_meta_data:
--
--     urole := case when meta->>'role' in ('admin','manager','agent','driver')
--                   then meta->>'role' else 'agent' end;
--
-- raw_user_meta_data è `options.data` di /auth/v1/signup — SCRITTO DAL CLIENT.
-- Chiunque possa chiamare quell'endpoint sceglieva il proprio ruolo.
-- L'allowlist filtrava i valori fuori enum, non l'intenzione: 'admin' è
-- nell'enum quanto 'agent'.
--
-- Il ruolo restava inerte finché pending=true/active=false (private.is_admin()
-- richiede active AND NOT pending), ma APPROVE_TEAM_MEMBER si limitava a
-- scrivere pending=false, active=true SENZA toccare `role` — l'approvazione
-- concedeva il ruolo che la riga si portava dietro, non un ruolo scelto
-- dall'admin. E AdminTeamTab.jsx nascondeva il pulsante di modifica proprio
-- sugli utenti pending, quindi l'admin non poteva correggerlo prima di
-- approvare.
--
-- PERCHÉ È SICURO PER GLI INVITI. Il percorso d'invito non dipende da questo
-- trigger per il ruolo: la Edge Function invite-user chiama
-- inviteUserByEmail() (che fa scattare questo trigger) e SUBITO DOPO fa
-- upsert su public.users con il ruolo già validato lato server contro
-- VALID_ROLES. Il trigger crea la riga, l'upsert le assegna il ruolo corretto
-- un istante dopo, e nel frattempo la riga è comunque pending=true/
-- active=false, cioè inerte. Il ramo `meta->>'role'` serviva quindi solo per
-- l'account NON pre-creato — la registrazione diretta, l'unico chiamante che
-- quei metadata li controlla davvero.
--
-- La UI (Approva) ora passa il ruolo esplicitamente a UsersAPI.approve(id,
-- role): l'inserimento qui sotto con role='agent' fisso è quindi solo il
-- valore di partenza, MAI quello che decide chi diventa admin — quella
-- decisione la prende sempre e solo un admin già attivo, al momento
-- dell'approvazione.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  meta     jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  uname    text;
  ucap     int;
  ucol     text;
  uavat    text;
  uinviter uuid;
  parts    text[];
begin
  uname := coalesce(meta->>'name', split_part(NEW.email, '@', 1));
  ucap  := coalesce((meta->>'capacity')::int, 8);
  ucol  := coalesce(meta->>'color', '#3B82F6');
  uinviter := nullif(meta->>'invited_by', '')::uuid;
  select array_agg(word) into parts from unnest(string_to_array(uname, ' ')) as word;
  uavat := upper(left(coalesce(parts[1], ''), 1) ||
                 left(coalesce(parts[2], right(coalesce(parts[1], '  '), 1)), 1));

  insert into public.users (id, name, role, avatar, color, capacity, pending, active, invited_by)
  values (NEW.id, uname, 'agent', uavat, ucol, ucap, true, false, uinviter)
  on conflict (id) do nothing;

  insert into public.user_contacts (user_id, email)
  values (NEW.id, NEW.email)
  on conflict (user_id) do nothing;
  return NEW;
end;
$$;
