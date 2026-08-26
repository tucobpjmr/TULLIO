// src/lib/api/configurazione.js
// Dati di dominio amministrati: categorie task, template messaggi e il
// registro di controllo.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { supabase } from '../supabase';
import { withOrigin } from '../realtime.js';

// ----------------- CATEGORIES -----------------
export const Categories = {
  list: () =>
    supabase.from('categories').select('*').order('label'),
  create: (cat) =>
    supabase.from('categories').insert(withOrigin(cat)).select().single(),
  // key è la PK e non si rinomina: il patch tocca solo i campi visuali.
  update: (key, patch) =>
    supabase.from('categories')
      .update(withOrigin({ ...patch, updated_at: new Date().toISOString() }))
      .eq('key', key).select().single(),
  remove: (key) =>
    supabase.from('categories').delete().eq('key', key),
};

// ----------------- MESSAGE TEMPLATES (chat, Admin → Sistema) -----------------
// Stesso trattamento di Categories: dati di dominio letti da tutto il team
// (il composer chat), scritti solo dall'admin (A-1 dell'audit dell'11 agosto —
// prima vivevano solo in state.messageTemplates, senza tabella).
export const MessageTemplates = {
  list: () =>
    supabase.from('message_templates').select('*').order('created_at'),
  create: (tpl) =>
    supabase.from('message_templates').insert(withOrigin(tpl)).select().single(),
  update: (id, patch) =>
    supabase.from('message_templates')
      .update(withOrigin({ ...patch, updated_at: new Date().toISOString() }))
      .eq('id', id).select().single(),
  remove: (id) =>
    supabase.from('message_templates').delete().eq('id', id),
};

// ----------------- AUDIT LOG (Admin → Log attività) -----------------
// A-2 dell'audit sicurezza del 26 agosto. La tab «Log attività» leggeva
// `state.activityLog`: stato React in memoria, tetto 100 voci, azzerato a ogni
// reload e locale alla singola scheda — mostrava ciò che aveva fatto QUEL
// browser, non ciò che aveva fatto il team.
//
// Qui c'è SOLO la lettura, e non è una svista: le voci le scrivono i trigger
// del database e le Edge Function privilegiate. `audit_log` non ha alcuna
// policy di insert per `authenticated`, quindi un `create` qui non
// funzionerebbe nemmeno — ed è il punto: un registro che il client può
// scrivere è un registro che il client può omettere di scrivere.
export const AuditLog = {
  // `limit` esplicito e non "tutto": è una tabella che cresce e basta, e la
  // vista è una cronologia recente. La RLS concede la SELECT ai soli admin,
  // quindi per chiunque altro questa chiamata torna un elenco vuoto — non un
  // errore, che è ciò che PostgREST fa quando la policy non seleziona righe.
  list: ({ limit = 200 } = {}) =>
    supabase.from('audit_log')
      .select('id, at, actor_id, actor_name, action, target_type, target_id, details')
      .order('at', { ascending: false })
      .limit(limit),
};
