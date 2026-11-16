-- B-7 del 16 novembre · I non letti della chat contati sul server.
--
-- Il client legge solo i 2000 messaggi più recenti (TETTO_CORPUS in
-- src/hooks/useChatData.js): un non letto più vecchio non entrava nel badge.
-- Questa funzione conta, per conversazione, i messaggi altrui che il chiamante
-- non ha ancora letto. Il client la chiama solo quando il corpus è troncato e
-- usa la differenza col conteggio locale («non letti oltre il corpus»).
--
-- SECURITY INVOKER: valgono le policy di public.messages (partecipazione alla
-- conversazione + rls_active_only), quindi nessuna conversazione altrui entra
-- nel conteggio. Il lettore è sempre auth.uid(), mai un parametro.
--
-- ⚠️ Non applicata da `supabase db push` (vedi docs/MIGRAZIONI_SUPABASE.md):
-- va applicata a parte. Finché manca, il client ripiega sul conteggio locale.

create or replace function public.chat_non_letti()
returns table (conversation_id uuid, non_letti bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select m.conversation_id, count(*)::bigint as non_letti
  from public.messages m
  where m.sender_id <> (select auth.uid())
    and not ((select auth.uid()) = any(m.read_by))
  group by m.conversation_id
$$;

revoke execute on function public.chat_non_letti() from public, anon;
grant execute on function public.chat_non_letti() to authenticated;
