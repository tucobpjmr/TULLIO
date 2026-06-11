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
  get: (id) =>
    supabase.from('users').select('*').eq('id', id).single(),
  updateProfile: (id, patch) =>
    supabase.from('users').update(withOrigin(patch)).eq('id', id).select().single(),
  setActive: (id, active) =>
    supabase.from('users').update(withOrigin({ active })).eq('id', id),
  // Step H: presence
  setPresence: (id, status) =>
    supabase.from('users').update(withOrigin({
      status, last_seen_at: new Date().toISOString(),
    })).eq('id', id),
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

// ----------------- REALTIME -----------------
// Step L: i payload realtime hanno origin_client se generati da una mutation
// taggata: su INSERT/UPDATE sta in payload.new, su DELETE in payload.old
// (serve REPLICA IDENTITY FULL sulle tabelle, vedi migration
// 20260611_replica_identity_full.sql). Se il tag coincide con il nostro
// client, l'evento è l'eco della nostra stessa scrittura — l'UI è già
// aggiornata in modo ottimistico, quindi lo scartiamo per evitare flash.
export function subscribeToTable(tableName, handler) {
  const channel = supabase
    .channel(`realtime:${tableName}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
      const origin = payload?.new?.origin_client ?? payload?.old?.origin_client;
      if (origin && origin === getClientId()) return;
      handler(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}
