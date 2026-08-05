-- Allegati task: alza il limite per file da 25 MB a 50 MB per consentire il
-- caricamento di clip video e tracce audio più lunghe direttamente nella task.
-- Coerente con la costante MAX_TASK_FILE_SIZE (src/lib/fileUtils.js).
-- 50 MB = 52428800 byte.
update storage.buckets
set file_size_limit = 52428800
where id = 'task-files';
