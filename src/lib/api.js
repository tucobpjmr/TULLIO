// src/lib/api.js
// Layer dati: CRUD su tutte le entità VoyageDesk via supabase-js.
// Le policy RLS sul DB filtrano automaticamente i risultati per utente loggato.
import { supabase } from './supabase';

// ─── USERS / TEAM ──────────────────────────────────────────────────────────
export const Users = {
  list: () =>
    supabase.from('users').select('*').eq('active', true).order('name'),
  listAll: () =>
    supabase.from('users').select('*').order('name'),
  get: (id) =>
    supabase.from('users').select('*').eq('id', id).single(),
  updateProfile: (id, patch) =>
    supabase.from('users').update(patch).eq('id', id).select().single(),
  setActive: (id, active) =>
    supabase.from('users').update({ active }).eq('id', id),
};

// ─── TASKS ─────────────────────────────────────────────────────────────────
export const Tasks = {
  list: ({ includeDeleted = false } = {}) => {
    const q = supabase.from('tasks').select('*').order('due_date', { ascending: true });
    return includeDeleted ? q : q.is('deleted_at', null);
  },
  listForDossier: (dossierId) =>
    supabase.from('tasks').select('*').eq('dossier_id', dossierId).is('deleted_at', null).order('due_date'),
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

// ─── COMMENTS ──────────────────────────────────────────────────────────────
export const Comments = {
  listForTask: (taskId) =>
    supabase.from('comments').select('*, users(name, color, photo_url)')
      .eq('task_id', taskId).order('created_at'),
  create: ({ task_id, user_id, text }) =>
    supabase.from('comments').insert({ task_id, user_id, text }).select().single(),
  remove: (id) =>
    supabase.from('comments').delete().eq('id', id),
};

// ─── NOTICES (bacheca) ─────────────────────────────────────────────────────
export const Notices = {
  list: () =>
    supabase.from('notices').select('*, users(name, color)')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false }),
  create: (n) =>
    supabase.from('notices').insert(n).select().single(),
  togglePin: (id, pinned) =>
    supabase.from('notices').update({ pinned }).eq('id', id),
  remove: (id) =>
    supabase.from('notices').delete().eq('id', id),
};

// ─── CONVERSATIONS ─────────────────────────────────────────────────────────
export const Conversations = {
  listMine: () =>
    supabase.from('conversations').select('*').order('updated_at', { ascending: false }),
  create: (c) =>
    supabase.from('conversations').insert(c).select().single(),
  update: (id, patch) =>
    supabase.from('conversations').update(patch).eq('id', id).select().single(),
};

// ─── MESSAGES ──────────────────────────────────────────────────────────────
export const Messages = {
  listForConversation: (conversation_id, limit = 200) =>
    supabase.from('messages').select('*')
      .eq('conversation_id', conversation_id)
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

// ─── CLIENTS (Anagrafica Clienti) ──────────────────────────────────────────
export const Clients = {
  list: () =>
    supabase.from('clients').select('*').order('name'),
  get: (id) =>
    supabase.from('clients').select('*').eq('id', id).single(),
  search: (q) =>
    supabase.from('clients').select('*')
      .or(`name.ilike.%${q}%,email.ilike.%${q}%,city.ilike.%${q}%`)
      .order('name')
      .limit(20),
  create: (data) =>
    supabase.from('clients').insert(data).select().single(),
  update: (id, patch) =>
    supabase.from('clients').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single(),
  remove: (id) =>
    supabase.from('clients').delete().eq('id', id),
};

// ─── SUPPLIERS (Anagrafica Fornitori) ──────────────────────────────────────
export const Suppliers = {
  list: (category) => {
    const q = supabase.from('suppliers').select('*').order('name');
    return category ? q.eq('category', category) : q;
  },
  get: (id) =>
    supabase.from('suppliers').select('*').eq('id', id).single(),
  search: (q) =>
    supabase.from('suppliers').select('*')
      .or(`name.ilike.%${q}%,city.ilike.%${q}%,country.ilike.%${q}%`)
      .order('name')
      .limit(20),
  create: (data) =>
    supabase.from('suppliers').insert(data).select().single(),
  update: (id, patch) =>
    supabase.from('suppliers').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single(),
  remove: (id) =>
    supabase.from('suppliers').delete().eq('id', id),
};

// ─── DOSSIERS (Pratiche di viaggio) ────────────────────────────────────────
export const Dossiers = {
  list: (status) => {
    const q = supabase.from('dossiers')
      .select('*, clients(id, name, email, phone), created_by_user:users!dossiers_created_by_fkey(id, name, color)')
      .order('created_at', { ascending: false });
    return status ? q.eq('status', status) : q;
  },
  get: (id) =>
    supabase.from('dossiers')
      .select('*, clients(id, name, email, phone, city), created_by_user:users!dossiers_created_by_fkey(id, name, color)')
      .eq('id', id).single(),
  getWithSuppliers: (id) =>
    supabase.from('dossiers')
      .select('*, clients(id, name, email, phone, city), dossier_suppliers(*, suppliers(*))')
      .eq('id', id).single(),
  nextNumber: async () => {
    const { data } = await supabase.rpc('next_dossier_number');
    return data;
  },
  create: async (data) => {
    const number = await Dossiers.nextNumber();
    return supabase.from('dossiers').insert({ ...data, number }).select().single();
  },
  update: (id, patch) =>
    supabase.from('dossiers').update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id).select().single(),
  setStatus: (id, status) =>
    supabase.from('dossiers').update({ status, updated_at: new Date().toISOString() }).eq('id', id),
  remove: (id) =>
    supabase.from('dossiers').delete().eq('id', id),
};

// ─── DOSSIER ↔ SUPPLIERS ───────────────────────────────────────────────────
export const DossierSuppliers = {
  list: (dossierId) =>
    supabase.from('dossier_suppliers').select('*, suppliers(*)')
      .eq('dossier_id', dossierId).order('created_at'),
  add: (row) =>
    supabase.from('dossier_suppliers').insert(row).select('*, suppliers(*)').single(),
  update: (id, patch) =>
    supabase.from('dossier_suppliers').update(patch).eq('id', id).select().single(),
  remove: (id) =>
    supabase.from('dossier_suppliers').delete().eq('id', id),
};

// ─── REALTIME ──────────────────────────────────────────────────────────────
export function subscribeToTable(tableName, handler) {
  const channel = supabase
    .channel(`realtime:${tableName}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, handler)
    .subscribe();
  return () => supabase.removeChannel(channel);
}
