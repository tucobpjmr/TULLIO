// src/lib/api.js
// Layer dati: CRUD su tutte le entità VoyageDesk via supabase-js.
// Le policy RLS sul DB filtrano automaticamente i risultati per utente loggato.
import { supabase } from './supabase';

// ----------------- USERS / TEAM -----------------
export const Users = {
  list: () =>
    supabase.from('users').select('*').eq('active', true).order('name'),
  get: (id) =>
    supabase.from('users').select('*').eq('id', id).single(),
  updateProfile: (id, patch) =>
    supabase.from('users').update(patch).eq('id', id).select().single(),
  setActive: (id, active) =>
    supabase.from('users').update({ active }).eq('id', id),
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
    supabase.from('tasks').insert(task).select().single(),
  update: (id, patch) =>
    supabase.from('tasks').update(patch).eq('id', id).select().single(),
  softDelete: (id) =>
    supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', id),
  restore: (id) =>
    supabase.from('tasks').update({ deleted_at: null }).eq('id', id),
  hardDelete: (id) =>
    supabase.from('tasks').delete().eq('id', id),
};

// ----------------- COMMENTS -----------------
export const Comments = {
  listForTask: (taskId) =>
    supabase.from('comments').select('*, users(name, color, photo_url)')
      .eq('task_id', taskId).order('created_at'),
  create: ({ task_id, user_id, text }) =>
    supabase.from('comments').insert({ task_id, user_id, text }).select().single(),
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
    supabase.from('notices').insert(n).select().single(),
  update: (id, patch) =>
    supabase.from('notices').update(patch).eq('id', id).select().single(),
  togglePin: (id, pinned) =>
    supabase.from('notices').update({ pinned }).eq('id', id),
  remove: (id) =>
    supabase.from('notices').delete().eq('id', id),
};

// ----------------- CONVERSATIONS -----------------
export const Conversations = {
  listMine: () =>
    supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
  create: (c) =>
    supabase.from('conversations').insert(c).select().single(),
  update: (id, patch) =>
    supabase.from('conversations').update(patch).eq('id', id).select().single(),
};

// ----------------- MESSAGES -----------------
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
    supabase.from('messages').insert(m).select().single(),
  remove: (id) =>
    supabase.from('messages').delete().eq('id', id),
  setReactions: (id, reactions) =>
    supabase.from('messages').update({ reactions }).eq('id', id),
  markRead: (id, readBy) =>
    supabase.from('messages').update({ read_by: readBy }).eq('id', id),
};

// ----------------- REALTIME -----------------
export function subscribeToTable(tableName, handler) {
  const channel = supabase
    .channel(`realtime:${tableName}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, handler)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
