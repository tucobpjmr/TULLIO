-- Step L: origin-tagging realtime.
-- Aggiunge colonna origin_client (uuid) sulle tabelle live: i client la
-- valorizzano con un UUID per tab (sessionStorage) ad ogni mutation, e i
-- subscriber realtime scartano gli eventi in cui origin_client coincide col
-- proprio. Risolve caveat #5 (flash di re-render dopo update ottimistico).
--
-- La colonna è nullable: row esistenti restano NULL, vecchi client che non
-- mandano il tag continuano a funzionare (gli eventi NON vengono filtrati).

ALTER TABLE public.tasks         ADD COLUMN IF NOT EXISTS origin_client uuid;
ALTER TABLE public.notices       ADD COLUMN IF NOT EXISTS origin_client uuid;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS origin_client uuid;
ALTER TABLE public.messages      ADD COLUMN IF NOT EXISTS origin_client uuid;
