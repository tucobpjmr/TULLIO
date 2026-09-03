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

import { getSupabase } from '../supabase';
import { withOrigin } from '../realtime.js';

// ----------------- CATEGORIES -----------------
export const Categories = {
  list: async () => {
    const supabase = await getSupabase();
    return supabase.from('categories').select('*').order('label');
  },
  create: async (cat) => {
    const supabase = await getSupabase();
    return supabase.from('categories').insert(withOrigin(cat)).select().single();
  },
  // key è la PK e non si rinomina: il patch tocca solo i campi visuali.
  update: async (key, patch) => {
    const supabase = await getSupabase();
    return supabase.from('categories')
      .update(withOrigin({ ...patch, updated_at: new Date().toISOString() }))
      .eq('key', key).select().single();
  },
  remove: async (key) => {
    const supabase = await getSupabase();
    return supabase.from('categories').delete().eq('key', key);
  },
};

// ----------------- MESSAGE TEMPLATES (chat, Admin → Sistema) -----------------
// Stesso trattamento di Categories: dati di dominio letti da tutto il team
// (il composer chat), scritti solo dall'admin (A-1 dell'audit dell'11 agosto —
// prima vivevano solo in state.messageTemplates, senza tabella).
export const MessageTemplates = {
  list: async () => {
    const supabase = await getSupabase();
    return supabase.from('message_templates').select('*').order('created_at');
  },
  create: async (tpl) => {
    const supabase = await getSupabase();
    return supabase.from('message_templates').insert(withOrigin(tpl)).select().single();
  },
  update: async (id, patch) => {
    const supabase = await getSupabase();
    return supabase.from('message_templates')
      .update(withOrigin({ ...patch, updated_at: new Date().toISOString() }))
      .eq('id', id).select().single();
  },
  remove: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('message_templates').delete().eq('id', id);
  },
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
  list: async ({ limit = 200 } = {}) => {
    const supabase = await getSupabase();
    return supabase.from('audit_log')
      .select('id, at, actor_id, actor_name, action, target_type, target_id, details')
      .order('at', { ascending: false })
      .limit(limit);
  },
};

// ----------------- ERROR REPORTS (A-4 dell'audit UX/errori del 1 settembre) -----------------
// Il codice che l'utente detta al telefono finiva SOLO in console.error, nel
// SUO browser: chi riceve la segnalazione non aveva dove cercarla. Stessa
// disciplina di AuditLog qui sopra — append-only, scrittura via funzione
// SECURITY DEFINER (`segnala_errore_client`, tollerante alla sessione
// assente), lettura ai soli admin — applicata a un errore imprevisto invece
// che a un'azione privilegiata. Il chiamante è lib/errorReporting.js, che
// importa questo modulo con `import()` DINAMICO apposta per non tirarsi
// dietro l'intero data layer nel chunk d'ingresso (installaHandlerGlobali
// gira da main.jsx, prima ancora del login — vedi la nota lì).
// ⚠️ C-1 dell'audit del 2 settembre · I TETTI SONO DUE, E NON SONO UNO DI
// TROPPO. Quello che CONTA sta nel database (`left()` dentro
// `segnala_errore_client`, migrazione 20260903094500): è l'unico che valga
// anche per chi chiama la RPC senza passare da qui — e chiunque può, con la
// chiave anon che sta nel bundle. Questo qui evita di TRASFERIRE ciò che il
// database scarterebbe comunque: un `stack` da mezzo megabyte partirebbe dal
// dispositivo dell'utente, spesso in mobilità e spesso proprio mentre qualcosa
// non funziona, per essere troncato all'arrivo.
//
// I valori rispecchiano quelli della migrazione. Se un giorno divergono, è il
// database ad avere ragione: qui si perde qualche carattere in più del
// necessario, che è il verso giusto in cui sbagliare.
const TETTI = { code: 64, origin: 64, message: 500, stack: 4000, url: 500, userAgent: 300 };

// `null` e non stringa vuota per i campi assenti: la colonna è nullable e
// `stack`/`url`/`user_agent` mancanti sono un fatto («questo errore non aveva
// uno stack»), non una stringa di lunghezza zero da distinguere a valle.
const tronca = (valore, tetto) =>
  (typeof valore === 'string' && valore ? valore.slice(0, tetto) : null);

export const ErrorReports = {
  create: async ({ code, origin, message, stack, url, userAgent }) => {
    const supabase = await getSupabase();
    return supabase.rpc('segnala_errore_client', {
      p_code: tronca(code, TETTI.code),
      p_origin: tronca(origin, TETTI.origin),
      p_message: tronca(message, TETTI.message),
      p_stack: tronca(stack, TETTI.stack),
      p_url: tronca(url, TETTI.url),
      p_user_agent: tronca(userAgent, TETTI.userAgent),
    });
  },
  // Non ancora letta da nessuna vista: la tab «Log attività» esiste già per
  // audit_log (AdminActivityTab) e questo elenco può affiancarla allo stesso
  // modo, quando servirà una UI invece della sola query su Supabase.
  list: async ({ limit = 200 } = {}) => {
    const supabase = await getSupabase();
    return supabase.from('error_reports')
      .select('id, code, at, user_id, user_name, origin, message, stack, url, user_agent')
      .order('at', { ascending: false })
      .limit(limit);
  },
};
