-- 20260701_tasks_contact.sql
-- Aggiunge tasks.contact: recapito libero (telefono/email) legato al task,
-- distinto dalla descrizione. Compilabile dalla creazione task (singola e
-- bulk) e modificabile dal dettaglio task.

alter table public.tasks add column if not exists contact text;
