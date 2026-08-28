-- B-1 dell'audit sicurezza del 26 agosto 2026.
--
-- LA SITUAZIONE. get_migrazioni_applicate() (20260806140000) è concessa ad
-- anon per tenere sveglio il progetto Supabase da keep-supabase-warm.yml: è
-- STABLE, interrogabile in GET, e tocca comunque Postgres. Il ragionamento di
-- allora — "non espone nulla che non sia già nel repository Git" — regge solo
-- finché il repository è pubblico, e `package.json` dichiara `"private":
-- true"`. Per un osservatore non autenticato, l'elenco dei nomi di migrazione
-- è una mappa dell'evoluzione dello schema e, letto di fila, un riassunto
-- della storia di sicurezza del progetto — `fix_users_privilege_escalation`,
-- `revoke_anon_table_grants`, `importa_backup_solo_admin` — raggiungibile con
-- un curl e la chiave anon pubblica, senza alcun account. Non è una falla; è
-- ricognizione gratuita.
--
-- LA CORREZIONE. Una funzione che non dice nulla tiene sveglio il progetto
-- altrettanto bene: ping(). get_migrazioni_applicate() resta per chi è
-- autenticato — la usa scripts/verifica-rpc/verifica-migrazioni.js — ma perde
-- il grant anon che la rendeva raggiungibile da chiunque.
create or replace function public.ping()
returns text
language sql
stable
set search_path = ''
as $$
  select 'ok'::text
$$;

revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;

revoke execute on function public.get_migrazioni_applicate() from anon;
