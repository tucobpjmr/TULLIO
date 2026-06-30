-- Permetti l'eliminazione di un utente che ha caricato allegati.
--
-- Problema: la FK public.task_files.uploaded_by -> public.users(id) era
-- ON DELETE NO ACTION. Conseguenza: l'admin non poteva piu' eliminare
-- definitivamente nessun utente che avesse caricato anche un solo file
-- (es. un utente che ha gia' fatto "Elimina account" e si vuole rimuovere
-- per liberare l'email): la delete CASCADE da auth.users -> public.users
-- veniva bloccata dal vincolo, e la Edge Function delete-user restituiva
-- un errore opaco ("Impossibile eliminare l'utente: {}").
--
-- Fix: porto la FK a ON DELETE SET NULL, coerente con il pattern gia'
-- usato per tasks.created_by, notices.author_id, messages.original_sender_id,
-- ecc. I metadati del file restano (la riga e' linkata al task via task_id
-- con ON DELETE CASCADE: se il task viene eliminato il file metadata
-- sparisce comunque); solo l'uploader diventa "sconosciuto", il che e'
-- accettabile dopo l'eliminazione definitiva dell'utente.

alter table public.task_files
  drop constraint if exists task_files_uploaded_by_fkey;

alter table public.task_files
  add constraint task_files_uploaded_by_fkey
    foreign key (uploaded_by) references public.users(id) on delete set null;
