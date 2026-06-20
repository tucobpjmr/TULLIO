-- Fase 3 chat — Pin messaggio (gruppo-level).
--
-- Aggiunge public.messages.pinned: stato di "fissaggio" condiviso fra i
-- partecipanti della conversazione (come `reactions`/`read_by`). Chiunque
-- partecipi può togglare; le RLS UPDATE sono già scoped per conv.
--
-- Default false retroattivo: tutti i messaggi esistenti partono non-fissati.
-- Non NOT NULL aggressivo: NOT NULL DEFAULT false è safe (Postgres riempie
-- in O(1) — nessun rewrite della tabella).
--
-- Niente indice: i messaggi pinned per conversazione sono tipicamente pochi
-- (single-digit) e la query `WHERE conversation_id = ? AND pinned` viaggia
-- sull'index già esistente su conversation_id, filtrando per pinned lato heap.

alter table public.messages
  add column if not exists pinned boolean not null default false;
