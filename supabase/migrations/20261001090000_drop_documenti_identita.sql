-- Rimozione dell'archivio documenti di identità.
--
-- La sezione «Documenti» è stata tolta dall'app (vista, API client, permessi):
-- qui si toglie ciò che restava sul database e creato da 20260916120000 —
-- tabella, trigger, le due funzioni e le policy per-bucket su storage.objects.
-- Il gate `storage_active_only` non nomina più alcun bucket (20260916150000),
-- quindi non c'è niente da togliere lì.
--
-- ⚠️ IL BUCKET NON SI ELIMINA DA QUI. Supabase rifiuta il DELETE diretto su
-- storage.buckets e storage.objects (trigger `protect_delete`): un DELETE SQL
-- toglierebbe i metadati e lascerebbe i file nello storage. Il bucket
-- `documenti-identita` si elimina dalla dashboard (Storage → bucket → Delete
-- bucket), che svuota i file e poi lo rimuove. Senza le policy qui sotto il
-- bucket privato è già inaccessibile a `authenticated`.

drop policy if exists "documenti_identita_storage_select" on storage.objects;
drop policy if exists "documenti_identita_storage_insert" on storage.objects;
drop policy if exists "documenti_identita_storage_delete" on storage.objects;

-- La tabella porta con sé le sue policy RLS, gli indici e il trigger.
drop table if exists public.documenti_identita;

drop function if exists private.documenti_identita_touch();
drop function if exists private.can_documenti();
