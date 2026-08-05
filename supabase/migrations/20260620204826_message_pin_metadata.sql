-- Fase 3 chat — Pin metadata (audit: chi/quando ha fissato).
--
-- Estende public.messages.pinned (boolean, migration 20260620_message_pinned)
-- con due colonne nullable:
--   pinned_at  timestamptz  — istante in cui il messaggio è stato fissato.
--   pinned_by  uuid         — UID di chi l'ha fissato (FK users, SET NULL).
--
-- Entrambe NULL quando pinned=false. Popolate dal client via setPinned al
-- toggle. Niente trigger di coerenza (overkill per uno stato group-level già
-- governato dalle RLS UPDATE scoped per conversazione): se un client scrive
-- pinned=true con pinned_by NULL il peggio è un tooltip "Fissato" generico.
--
-- ON DELETE SET NULL su pinned_by: se l'utente viene rimosso, il pin resta ma
-- perde l'attribuzione (coerente con original_sender_id del forward).

alter table public.messages
  add column if not exists pinned_at timestamptz,
  add column if not exists pinned_by uuid references public.users(id) on delete set null;
