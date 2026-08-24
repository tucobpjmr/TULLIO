// src/lib/api/allegati.js
// Allegati dei task (bucket privato 'task-files').
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { supabase } from '../supabase';
import { signedUrlCache, creaSignedUrlGetter, sanitizeFileName, baseMimeType } from './storage.js';

// ----------------- TASK FILES (allegati task) -----------------
// Block 5: allegati reali sui task. Bucket privato 'task-files', metadati in
// public.task_files. Path convention <task_id>/<uuid>-<nomefile>: le policy RLS
// del bucket derivano l'autorizzazione dal primo segmento (= task_id),
// rispecchiando la visibilità dei task (manager/admin o assegnatario).
// Niente withOrigin: la tabella non è in realtime e non ha origin_client.
export const TaskFiles = {
  listForTask: (taskId) =>
    supabase.from('task_files')
      .select('*, users(name)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),

  // Upload: 1) carica nel bucket, 2) inserisce la riga metadati. `source`
  // permette di distinguere upload manuale da OneDrive/WhatsApp (Block 6/7).
  upload: async (file, taskId, { source = 'upload', uploadedBy = null } = {}) => {
    const path = `${taskId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const up = await supabase.storage
      .from('task-files')
      .upload(path, file, { contentType: baseMimeType(file.type) });
    if (up.error) return { data: null, error: up.error };
    const row = {
      task_id: taskId,
      file_name: file.name,
      file_size: file.size ?? null,
      file_type: file.type || null,
      file_url: up.data?.path ?? path,
      source,
      uploaded_by: uploadedBy,
    };
    return supabase.from('task_files').insert(row).select('*, users(name)').single();
  },

  // Rimuove la riga metadati (fonte di verità) poi l'oggetto nel bucket. Un
  // errore sul delete storage non è bloccante (file già rimosso ecc.).
  remove: async (id, path) => {
    const del = await supabase.from('task_files').delete().eq('id', id);
    if (del.error) return del;
    if (path) await supabase.storage.from('task-files').remove([path]);
    return del;
  },

  // Signed URL temporanea (1h) con cache in-memory condivisa (stessa di chat).
  getFileUrl: creaSignedUrlGetter('task-files', signedUrlCache),
};
