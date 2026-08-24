// src/lib/api/configurazione.js
// Dati di dominio amministrati: categorie task e template messaggi.
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
