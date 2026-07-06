-- Foto profilo su storage invece che come data-URL base64 in users.photo_url.
-- Prima photo_url conteneva l'INTERO base64 dell'immagine (fino a ~6-7 MB di
-- testo per riga): listAll() (rieseguita a ogni evento realtime su public.users)
-- riscaricava le foto di TUTTO il team ad ogni refresh. Ora la foto vive nel
-- bucket pubblico 'avatars' e photo_url tiene solo la URL pubblica (~100 byte).
-- Path convention: <user_id>/avatar.jpg (upsert → una sola foto per utente,
-- nessun file orfano). Le foto base64 già esistenti restano valide (i data-URL
-- si renderizzano ancora): vengono migrate al bucket al primo salvataggio.

-- Bucket PUBBLICO: le foto profilo di un team interno non sono PII sensibili
-- come email/telefono; il path per-utente non è elencabile e la lettura via
-- public URL evita di dover firmare una URL a ogni <Avatar> renderizzato.
-- Limite 5 MB, solo tipi immagine.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Lettura pubblica (bucket public): consentita a chiunque.
drop policy if exists "avatars_public_select" on storage.objects;
create policy "avatars_public_select" on storage.objects
for select to public
using (bucket_id = 'avatars');

-- Upload: solo l'utente nella PROPRIA cartella (<user_id>/...).
-- auth.uid() deve combaciare col primo segmento del path.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Update: serve per l'upsert (overwrite della propria foto sullo stesso path).
drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

-- Delete: solo la propria cartella.
drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
