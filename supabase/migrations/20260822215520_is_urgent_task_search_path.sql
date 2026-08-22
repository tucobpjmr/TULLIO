-- Seguito immediato di 20260822215237 (A-1, urgenti altrui).
--
-- PERCHÉ ESISTE. Applicata la 20260822215237, il passo 4 di
-- docs/MIGRAZIONI_SUPABASE.md — «far girare gli advisor: le modifiche a RLS e
-- funzioni ne accendono facilmente di nuovi» — ha acceso
-- `function_search_path_mutable` su `private.is_urgent_task`. Era l'undicesimo
-- WARN, l'unico NUOVO, e l'unico non nominato in AVVISI_ACCETTATI
-- (scripts/verifica-advisor/advisor.js): `verifica:advisor` tratta un avviso
-- non accettato come un fallimento, quindi il prossimo run di verifica-rpc.yml
-- su main sarebbe diventato rosso per una regressione introdotta dalla
-- migrazione che chiudeva A-1.
--
-- Vale la pena notarlo perché è il passo che si salta: applicare aveva
-- risposto `success`, la policy funzionava, e il dry-run per ruolo dava i
-- numeri attesi (227 → 228 task viste da un agent, urgenti altrui 0 → 1). Tre
-- verifiche superate e una regressione lo stesso, trovata solo dal quarto
-- controllo.
--
-- ⚠️ `search_path = ''` e non `'public'` come i fratelli
-- (is_manager_or_admin, can_view_global_queue, is_active_user): quelli
-- interrogano `public.users` e hanno bisogno dello schema nel path; questa non
-- tocca alcun oggetto, è logica sui soli parametri. Il path vuoto è il più
-- stretto dei due ed è quello corretto qui.
--
-- `create or replace` conserva l'oid, quindi la policy `tasks_select` che la
-- richiama resta valida senza essere ricreata — verificato dopo l'applicazione
-- reimpersonando l'agent: 228 task viste, 1 urgente altrui, invariate.
create or replace function private.is_urgent_task(p_due timestamptz, p_status text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_due is not null
     and p_status is distinct from 'done'
     and p_due >= now()
     and p_due <= now() + interval '24 hours';
$$;
