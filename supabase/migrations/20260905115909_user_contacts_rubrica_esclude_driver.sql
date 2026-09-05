-- M-7 dell'audit del 4 settembre.
--
-- La 20260629222802 ha aperto la lettura di user_contacts a ogni utente
-- autenticato ("rubrica interna", su richiesta del prodotto). E' del 29
-- giugno: il ruolo driver e' stato ristretto DOPO -- fuori da tutte e
-- quattro le policy di clients, fuori da can_liste(), e in canViewTask
-- limitato ai propri task. La rubrica era rimasta l'unico dato del sistema
-- su cui il driver non aveva una restrizione, non per una decisione ma
-- perche' la policy e' piu' vecchia della restrizione del ruolo.
--
-- Decisione di prodotto (5 settembre): il driver NON deve vedere la rubrica
-- del team. Si mantiene la rubrica per i ruoli interni e la si chiude al
-- driver, che continua a leggere il PROPRIO contatto (ne ha bisogno:
-- ProfileEditor) via la prima meta' dell'OR.
drop policy if exists user_contacts_select on public.user_contacts;

create policy user_contacts_select on public.user_contacts
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (select private.can_liste())   -- admin, manager, agent: attivi e approvati
  );

comment on policy user_contacts_select on public.user_contacts is
  'Rubrica interna (20260629222802) chiusa al ruolo driver dalla 20260905115909 '
  '(M-7 dell''audit del 4 settembre): un driver legge solo il proprio contatto, '
  'gli altri ruoli interni (admin/manager/agent, attivi e approvati) leggono '
  'tutta la rubrica via private.can_liste().';
