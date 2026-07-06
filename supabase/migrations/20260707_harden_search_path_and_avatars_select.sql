-- Hardening di due advisor di sicurezza Supabase (solo WARN) introdotti dalle
-- migrazioni del 2026-07-06:
--   1) 0011_function_search_path_mutable  → messages_toggle_reaction
--   2) 0025_public_bucket_allows_listing  → bucket avatars
-- Nessun cambiamento di comportamento lato app: le reazioni funzionano come
-- prima e le foto profilo continuano a caricarsi via public URL.

-- 1) search_path immutabile su messages_toggle_reaction.
-- Senza un search_path fissato, un ruolo potrebbe anteporre uno schema con
-- oggetti omonimi e dirottare le reference non qualificate della funzione.
-- Il corpo qualifica già tutto (public.messages, public.is_active_user(),
-- auth.uid()) e usa solo builtin di pg_catalog (sempre in scope): con
-- search_path vuoto continua a risolvere correttamente.
alter function public.messages_toggle_reaction(uuid, text, uuid)
  set search_path = '';

-- 2) Elenco del bucket avatars ristretto alla propria cartella.
-- La vecchia policy "avatars_public_select" (SELECT a `public` su tutto il
-- bucket) permetteva a chiunque di ELENCARE tutti i file — di fatto la lista
-- degli user_id che hanno una foto. Il rendering delle foto NON dipende da
-- questa policy: essendo il bucket pubblico, l'oggetto è servito dall'endpoint
-- /object/public/ che bypassa la RLS. Qui la SELECT resta solo per eventuali
-- list()/download autenticati e viene limitata alla cartella dell'utente
-- (<user_id>/...), coerente con insert/update/delete_own.
drop policy if exists "avatars_public_select" on storage.objects;
drop policy if exists "avatars_select_own" on storage.objects;
create policy "avatars_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
