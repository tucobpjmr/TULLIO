-- Fase 3 chat — Inoltra messaggio.
--
-- Aggiunge public.messages.original_sender_id: snapshot dell'UID di chi ha
-- originato il messaggio. Denormalizzato (non FK al message originale) perché:
-- 1) la RLS di messages è scoped per conversation_id: un partecipante del
--    destinatario non potrebbe leggere il messaggio originale per risalire al
--    sender. Tenere l'UID sul row del forward elimina il join cross-conv.
-- 2) supporta catene di forward (A→B→C): il forward C porta il sender_id
--    originale di A, non quello di B.
--
-- NULL su tutti i row esistenti = messaggio non inoltrato (comportamento
-- corrente). I client legacy che non scrivono original_sender_id continueranno
-- a funzionare: NULL significa "non un forward".
--
-- ON DELETE SET NULL: se l'utente che ha originato viene rimosso dal team
-- (DELETE su public.users), il badge "Inoltrato da" sparisce ma il messaggio
-- resta visibile.

alter table public.messages
  add column if not exists original_sender_id uuid
  references public.users(id) on delete set null;
