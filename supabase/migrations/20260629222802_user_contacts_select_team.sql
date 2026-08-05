-- 2026-06-29 — Rubrica interna: contatti del team visibili a tutti i membri
-- La migrazione 20260613100833 aveva ristretto la lettura di public.user_contacts
-- al solo diretto interessato + admin (privacy hardening). Su richiesta del
-- prodotto i contatti (email/telefono) diventano una rubrica interna: ogni utente
-- autenticato può leggerli (es. cliccando un membro nella vista Team).
--
-- Cambia SOLO la policy di SELECT. INSERT/UPDATE/DELETE restano invariati
-- (own + admin per INSERT/UPDATE, admin per DELETE): un utente non può
-- modificare i contatti altrui.
--
-- anon resta escluso (revoke già presente nella 20260613100833).

drop policy if exists user_contacts_select on public.user_contacts;

create policy user_contacts_select on public.user_contacts
  for select to authenticated
  using (true);
