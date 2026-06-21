// src/lib/api.js
// Layer dati: CRUD su tutte le entità VoyageDesk via supabase-js.
// Le policy RLS sul DB filtrano automaticamente i risultati per utente loggato.
import { supabase } from './supabase';
import { getClientId } from './clientId';

// Step L: allega l'origin client a ogni payload di mutation sulle tabelle
// live (tasks/notices/conversations/messages). I subscriber realtime usano
// questo tag per scartare gli eventi che hanno generato loro stessi.
const withOrigin = (payload) => ({ ...payload, origin_client: getClientId() });

// ----------------- USERS / TEAM -----------------
export const Users = {
  list: () =>
    supabase.from('users').select('*').eq('active', true).order('name'),
  // listAll() include pending=true e active=false: serve agli admin per vedere
  // utenti in attesa di approvazione e disabilitati nel pannello Team. Le
  // policy RLS sulla tabella users non filtrano per active, quindi tutti gli
  // utenti autenticati possono leggere l'elenco completo (è un team condiviso).
  listAll: () =>
    supabase.from('users').select('*').order('name'),
  get: (id) =>
    supabase.from('users').select('*').eq('id', id).single(),
  // Nota: email/phone NON sono più colonne di public.users (migrazione
  // 20260613100833_user_contacts_table). Vivono in public.user_contacts via
  // getContacts/updateContact. updateProfile le scarta difensivamente per
  // evitare l'errore "column does not exist".
  updateProfile: (id, patch) => {
    const { email, phone, ...rest } = patch || {};
    return supabase.from('users').update(withOrigin(rest)).eq('id', id).select().single();
  },
  setActive: (id, active) =>
    supabase.from('users').update(withOrigin({ active })).eq('id', id),
  // Approvazione admin di un utente registrato (pending → attivo). Le policy
  // RLS (users_admin_all) consentono l'update solo a un admin.
  approve: (id) =>
    supabase.from('users').update(withOrigin({ pending: false, active: true })).eq('id', id),
  // Invito admin di un nuovo utente via email (Block 3). Chiama la Edge
  // Function 'invite-user' (verify_jwt) che usa la Auth Admin API per inviare
  // l'invito e pre-crea il profilo public.users con pending=true. L'admin
  // verrà poi notificato (trigger notify_user_pending) e potrà approvarlo.
  // La Edge Function ritorna { success } oppure { error } con status non-2xx:
  // in quel caso supabase-js mette il messaggio in error.context (lo
  // normalizziamo qui per esporre il testo localizzato al chiamante).
  invite: async ({ email, name, role = 'agent', capacity = 8, color = '#3B82F6' } = {}) => {
    const { data, error } = await supabase.functions.invoke('invite-user', {
      body: { email, name, role, capacity, color },
    });
    if (error) {
      let msg = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* body non-JSON: usa error.message */ }
      return { data: null, error: { message: msg } };
    }
    if (data?.error) return { data: null, error: { message: data.error } };
    return { data, error: null };
  },
  // Step H: presence
  setPresence: (id, status) =>
    supabase.from('users').update(withOrigin({
      status, last_seen_at: new Date().toISOString(),
    })).eq('id', id),
  // ----------------- CONTATTI PII (user_contacts) -----------------
  // email/phone sono in public.user_contacts (RLS: solo l'utente stesso o un
  // admin). Vedi migrazione 20260613100833_user_contacts_table.sql.
  // user_contacts non è in realtime e non ha origin_client → niente withOrigin.
  getContacts: (id) =>
    supabase.from('user_contacts').select('email, phone').eq('user_id', id).maybeSingle(),
  updateContact: (id, { email, phone } = {}) =>
    supabase.from('user_contacts')
      .upsert({ user_id: id, email: email ?? null, phone: phone ?? null }, { onConflict: 'user_id' })
      .select().single(),
  // ----------------- PREFERENZE APP (user_app_preferences) -----------------
  // Preferenze personali sincronizzate server-side (es. reazioni recenti chat).
  // RLS: solo l'utente stesso. Fuori da realtime, niente origin_client (vedi
  // migration 20260620_user_app_preferences.sql).
  getPreferences: (id) =>
    supabase.from('user_app_preferences').select('recent_reactions').eq('user_id', id).maybeSingle(),
  setRecentReactions: (id, recentReactions) =>
    supabase.from('user_app_preferences')
      .upsert({ user_id: id, recent_reactions: recentReactions, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }),
  // Self-service account deletion (Block 4). Calls the delete-account Edge
  // Function (verify_jwt) which bans the user for 10 years + sets active=false.
  // Does NOT hard-delete: preserves comments/messages (FK ON DELETE CASCADE safety).
  deleteAccount: async () => {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) {
      let msg = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.error) msg = body.error;
      } catch { /* non-JSON */ }
      return { data: null, error: { message: msg } };
    }
    if (data?.error) return { data: null, error: { message: data.error } };
    return { data, error: null };
  },
};

// ----------------- TASKS -----------------
// Select riusabile che porta dietro i commenti con il nome dell'autore.
const TASK_SELECT_WITH_COMMENTS =
  '*, comments(id, user_id, text, created_at, users(name))';

export const Tasks = {
  list: ({ includeDeleted = false, withComments = false } = {}) => {
    const select = withComments ? TASK_SELECT_WITH_COMMENTS : '*';
    const q = supabase.from('tasks').select(select).order('due_date', { ascending: true });
    return includeDeleted ? q : q.is('deleted_at', null);
  },
  get: (id) =>
    supabase.from('tasks').select('*').eq('id', id).single(),
  create: (task) =>
    supabase.from('tasks').insert(withOrigin(task)).select().single(),
  update: (id, patch) =>
    supabase.from('tasks').update(withOrigin(patch)).eq('id', id).select().single(),
  softDelete: (id) =>
    supabase.from('tasks').update(withOrigin({ deleted_at: new Date().toISOString() })).eq('id', id),
  restore: (id) =>
    supabase.from('tasks').update(withOrigin({ deleted_at: null })).eq('id', id),
  hardDelete: (id) =>
    supabase.from('tasks').delete().eq('id', id),
};

// ----------------- COMMENTS -----------------
export const Comments = {
  listForTask: (taskId) =>
    supabase.from('comments').select('*, users(name, color, photo_url)')
      .eq('task_id', taskId).order('created_at'),
  create: ({ task_id, user_id, text }) =>
    supabase.from('comments').insert(withOrigin({ task_id, user_id, text })).select().single(),
  remove: (id) =>
    supabase.from('comments').delete().eq('id', id),
};

// ----------------- NOTICES (bacheca) -----------------
export const Notices = {
  list: () =>
    supabase.from('notices').select('*, users(name, color)')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  create: (n) =>
    supabase.from('notices').insert(withOrigin(n)).select().single(),
  update: (id, patch) =>
    supabase.from('notices').update(withOrigin(patch)).eq('id', id).select().single(),
  togglePin: (id, pinned) =>
    supabase.from('notices').update(withOrigin({ pinned })).eq('id', id),
  remove: (id) =>
    supabase.from('notices').delete().eq('id', id),
};

// ----------------- CONVERSATIONS -----------------
export const Conversations = {
  listMine: () =>
    supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
  create: (c) =>
    supabase.from('conversations').insert(withOrigin(c)).select().single(),
  // updated_at va impostato qui: il DB non ha trigger moddatetime e listMine
  // ordina per updated_at — senza, pin/rename non riordinano la lista.
  update: (id, patch) =>
    supabase.from('conversations')
      .update(withOrigin({ updated_at: new Date().toISOString(), ...patch }))
      .eq('id', id).select().single(),
};

// ----------------- MESSAGES -----------------
// Step M: i nomi file possono contenere caratteri non ammessi nelle key
// di Storage (spazi, accenti) → normalizzo mantenendo estensione leggibile.
const sanitizeFileName = (name = 'file') => name.replace(/[^\w.\-]+/g, '_');

export const Messages = {
  listForConversation: (conversation_id, limit = 200) =>
    supabase.from('messages').select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(limit),
  // Carica TUTTI i messaggi delle conv visibili in un solo round-trip:
  // l'app raggruppa lato client per conversation_id. Le RLS già limitano
  // la visibilità ai soli partecipanti.
  listAll: (limit = 2000) =>
    supabase.from('messages').select('*')
      .order('created_at', { ascending: true })
      .limit(limit),
  send: (m) =>
    supabase.from('messages').insert(withOrigin(m)).select().single(),
  remove: (id) =>
    supabase.from('messages').delete().eq('id', id),
  setReactions: (id, reactions) =>
    supabase.from('messages').update(withOrigin({ reactions })).eq('id', id),
  // Fase 3 — pin condiviso: tutti i partecipanti vedono lo stesso stato.
  // Le RLS UPDATE su messages permettono già a chi partecipa di toggleare
  // (stesso path di setReactions). `pinnedBy`/`pinnedAt` sono l'audit (chi/
  // quando): valorizzati al pin, azzerati all'unpin.
  setPinned: (id, pinned, pinnedBy = null) =>
    supabase.from('messages').update(withOrigin({
      pinned,
      pinned_by: pinned ? pinnedBy : null,
      pinned_at: pinned ? new Date().toISOString() : null,
    })).eq('id', id),
  markRead: (id, readBy) =>
    supabase.from('messages').update(withOrigin({ read_by: readBy })).eq('id', id),
  // Step Q.4: RPC bulk markRead. Un singolo UPDATE su tutti i messaggi non
  // letti della conversazione → 1 round-trip + 1 evento realtime invece di N.
  // Vedi migration 20260612_messages_mark_read_bulk.sql.
  markReadBulk: (conversationId, userId) =>
    supabase.rpc('messages_mark_read', {
      conv_id: conversationId,
      reader_id: userId,
      origin: getClientId(),
    }),
  // Step M: upload allegato sul bucket privato 'chat-files'.
  // Path convention <conversation_id>/<uuid>-<nomefile>: le policy RLS del
  // bucket verificano l'appartenenza alla conversazione dal primo segmento.
  // Ritorna { path } da salvare in messages.file_url.
  uploadFile: async (file, conversationId) => {
    const path = `${conversationId}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(path, file, { contentType: file.type || 'application/octet-stream' });
    return { path: data?.path ?? null, error };
  },
  // Fase 3 forward allegati: copia server-side un file dal path sorgente a una
  // nuova path scoped sulla conversazione destinazione. Le RLS su
  // storage.objects richiedono SELECT su src (partecipante della conv sorgente)
  // + INSERT su dest (partecipante della conv destinazione): chi inoltra è in
  // entrambe → la copy passa. Niente download/upload lato client: il blob non
  // transita dal browser. Nuovo UUID nel path così non collide con l'originale.
  copyFile: async (srcPath, destConversationId, fileName) => {
    const destPath = `${destConversationId}/${crypto.randomUUID()}-${sanitizeFileName(fileName || 'file')}`;
    const { data, error } = await supabase.storage
      .from('chat-files')
      .copy(srcPath, destPath);
    return { path: data?.path ?? destPath, error };
  },
  // Fase 3 — audio vocale reale: carica il blob registrato (MediaRecorder) sullo
  // stesso bucket privato 'chat-files', con la convenzione di path
  // <conversation_id>/<uuid>-voice.<ext> così le RLS (primo segmento = conv)
  // valgono come per gli altri allegati. Ritorna { path } da salvare in file_url.
  uploadVoice: async (blob, conversationId, mimeType = 'audio/webm') => {
    const ext = mimeType.includes('mp4') ? 'm4a' : mimeType.includes('ogg') ? 'ogg' : 'webm';
    const path = `${conversationId}/${crypto.randomUUID()}-voice.${ext}`;
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(path, blob, { contentType: mimeType || 'audio/webm' });
    return { path: data?.path ?? null, error };
  },
  // Signed URL temporanea (1h) per scaricare/visualizzare un allegato.
  // Cache in-memory: scade 5 min prima del TTL, così click ripetuti sullo
  // stesso allegato non rigenerano una signed URL per ogni interazione.
  getFileUrl: async (path) => {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) {
      return { url: cached.url, error: null };
    }
    const { data, error } = await supabase.storage
      .from('chat-files')
      .createSignedUrl(path, 60 * 60);
    const url = data?.signedUrl ?? null;
    if (url) signedUrlCache.set(path, { url, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { url, error };
  },
};

const signedUrlCache = new Map();

// ----------------- NOTIFICATIONS -----------------
// Generate solo da trigger DB (vedi migration 20260609_notifications.sql).
// Le RLS filtrano automaticamente per auth.uid().
export const Notifications = {
  list: ({ limit = 50 } = {}) =>
    supabase.from('notifications').select('*')
      .order('created_at', { ascending: false })
      .limit(limit),
  listUnread: ({ limit = 50 } = {}) =>
    supabase.from('notifications').select('*')
      .eq('read', false)
      .order('created_at', { ascending: false })
      .limit(limit),
  markRead: (id) =>
    supabase.from('notifications').update({ read: true }).eq('id', id),
  markAllRead: () =>
    supabase.from('notifications').update({ read: true }).eq('read', false),
  remove: (id) =>
    supabase.from('notifications').delete().eq('id', id),
};

// ----------------- CLIENTS -----------------
export const Clients = {
  list: () =>
    supabase.from('clients').select('*').order('name'),
  get: (id) =>
    supabase.from('clients').select('*').eq('id', id).single(),
  create: (client) =>
    supabase.from('clients').insert(client).select().single(),
  update: (id, patch) =>
    supabase.from('clients').update(patch).eq('id', id).select().single(),
  remove: (id) =>
    supabase.from('clients').delete().eq('id', id),
};

// ----------------- REALTIME -----------------
// Step L: i payload realtime hanno origin_client se generati da una mutation
// taggata: su INSERT/UPDATE sta in payload.new, su DELETE in payload.old
// (serve REPLICA IDENTITY FULL sulle tabelle, vedi migration
// 20260611_replica_identity_full.sql). Se il tag coincide con il nostro
// client, l'evento è l'eco della nostra stessa scrittura — l'UI è già
// aggiornata in modo ottimistico, quindi lo scartiamo per evitare flash.
// Contatore monotono per generare topic di canale UNIVOCI a ogni chiamata.
// Più subscriber possono ascoltare la STESSA tabella: `users`, ad esempio, è
// osservata sia dal refresh team sia dalla presence. Con un topic fisso
// `realtime:<table>` supabase-js riusa il canale già sottoscritto e il secondo
// `.on('postgres_changes')` lancia "cannot add postgres_changes callbacks for
// realtime:realtime:<table> after subscribe()" (pagina bianca al mount). Un
// suffisso univoco dà a ogni subscriber il proprio canale indipendente, con lo
// stesso filtro postgres → entrambi ricevono gli eventi della tabella.
let channelSeq = 0;

export function subscribeToTable(tableName, handler) {
  const channel = supabase
    .channel(`realtime:${tableName}:${getClientId()}:${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
      const origin = payload?.new?.origin_client ?? payload?.old?.origin_client;
      if (origin && origin === getClientId()) return;
      handler(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}
