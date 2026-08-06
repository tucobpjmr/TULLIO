-- S-14 — chat-files e task-files accettavano qualunque tipo di file.
--
-- IL PROBLEMA. I due bucket avevano `allowed_mime_types = null`: si poteva
-- caricare un .html o un .svg, e ChatMessage.jsx:53 / TaskSlideOver.jsx:63 li
-- aprono con window.open(signedUrl). Il file viene servito da
-- <progetto>.supabase.co, quindi lo script che contiene NON gira nell'origine
-- dell'app (la sessione vive in localStorage su tullio-seven.vercel.app e
-- resta fuori portata) — ma è comunque una pagina attiva servita da un dominio
-- che l'utente riconosce come quello del gestionale. È una pagina di phishing
-- credenziali molto più credibile della media.
--
-- Il bucket `avatars` era già configurato correttamente (jpeg/png/webp): il
-- pattern giusto esisteva già nel progetto, andava solo esteso agli altri due.
--
-- COSA NON C'È NELL'ELENCO, E PERCHÉ. Niente text/html, niente
-- application/xhtml+xml e soprattutto niente image/svg+xml: l'SVG è un
-- documento che può contenere <script>, quindi sta con l'HTML e non con le
-- immagini, ed è il motivo per cui questo elenco enumera i tipi immagine uno
-- per uno invece di scrivere `image/*` — la scorciatoia con il carattere jolly
-- avrebbe riammesso proprio il formato da cui ci si sta difendendo.
--
-- application/octet-stream RESTA ammesso: è ciò che il browser manda quando il
-- sistema operativo non riconosce l'estensione, quindi escluderlo romperebbe
-- l'upload di file legittimi. Non è un buco: un octet-stream il browser lo
-- scarica, non lo interpreta — che è esattamente il comportamento voluto.
--
-- I tipi audio coprono i vocali della chat (MediaRecorder produce webm/mp4/
-- ogg secondo il browser). Vedi anche la normalizzazione del contentType in
-- lib/api.js: MediaRecorder restituisce "audio/webm;codecs=opus" e il
-- parametro codecs va tolto prima dell'upload, altrimenti non combacia con
-- nessuna voce di questo elenco e il vocale viene rifiutato.
update storage.buckets
   set allowed_mime_types = array[
     -- immagini (SVG deliberatamente escluso, vedi sopra)
     'image/jpeg','image/png','image/webp','image/gif','image/bmp',
     'image/tiff','image/heic','image/heif','image/avif',
     -- documenti
     'application/pdf','text/plain','text/csv','text/markdown',
     'application/rtf',
     -- office
     'application/msword',
     'application/vnd.ms-excel',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/vnd.oasis.opendocument.text',
     'application/vnd.oasis.opendocument.spreadsheet',
     -- audio (vocali della chat)
     'audio/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav',
     'audio/x-wav','audio/aac','audio/x-m4a',
     -- video
     'video/mp4','video/webm','video/quicktime',
     -- archivi
     'application/zip','application/x-zip-compressed',
     -- fallback per estensioni che il sistema operativo non riconosce
     'application/octet-stream'
   ]
 where id in ('chat-files','task-files');
