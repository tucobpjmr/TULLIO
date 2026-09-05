-- B-4 dell'audit del 4 settembre (prima meta': l'indice di copertura).
--
-- task_history.actor_id e' una FK (ON DELETE SET NULL verso users) senza
-- indice di copertura: ogni DELETE su users obbliga Postgres a fare una
-- scansione sequenziale di task_history per trovare le righe da aggiornare.
-- I sette indici "mai usati" segnalati dallo stesso rilievo (idx_users_active,
-- idx_tasks_assignees, idx_lista_history_actor_id, rate_limit_finestra,
-- audit_log_at_desc, audit_log_actor_at, idx_users_invited_by,
-- idx_lista_beneficiari_created_by) NON sono toccati qui: l'audit li marca
-- "da rivalutare fra qualche mese", non da rimuovere ora -- su audit_log e
-- rate_limit "mai usato" significa "tabella ancora giovane", non "indice
-- inutile".
create index if not exists idx_task_history_actor_id
  on public.task_history (actor_id);

comment on index public.idx_task_history_actor_id is
  'Copertura della FK task_history.actor_id (ON DELETE SET NULL da users): '
  'senza, ogni DELETE su users scansiona task_history per intero. '
  'B-4 dell''audit del 4 settembre.';
