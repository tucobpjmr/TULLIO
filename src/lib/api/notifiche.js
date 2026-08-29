// src/lib/api/notifiche.js
// Notifiche in-app e sottoscrizioni Web Push.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { supabase } from '../supabase';
import { withOrigin } from '../realtime.js';

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
  // B-1 (audit del 28 agosto): il CONTEGGIO dei non letti, indipendente dalla
  // finestra dell'elenco. Il badge dice «quante ne hai», e prima di questa
  // funzione lo ricavava contando `list({ limit: 100 })` — quindi un utente
  // con più di cento notifiche aveva un non letto invisibile e non contato,
  // senza che nulla lo dicesse. `head: true` non trasferisce righe, è un
  // Content-Range e basta: costa quanto un conteggio, non quanto un elenco.
  contaNonLette: () =>
    supabase.from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('read', false),
  // withOrigin sul patch: l'UPDATE realtime porta origin_client in payload.new,
  // così subscribeToTable scarta l'eco della nostra stessa scrittura (niente
  // refetch che sovrascrive l'update ottimistico → niente flicker "torna non
  // letta"). markAllRead aggiorna in blocco via .eq: withOrigin aggiunge solo
  // un campo al patch, la clausola where resta invariata.
  markRead: (id) =>
    supabase.from('notifications').update(withOrigin({ read: true })).eq('id', id),
  markAllRead: () =>
    supabase.from('notifications').update(withOrigin({ read: true })).eq('read', false),
  // Aprire la conversazione in chat deve spegnere anche la sua notifica
  // 'chat_message' (20260725_chat_message_notifications): senza, la campanella
  // resterebbe con un non letto che l'utente ha di fatto già visto. La RLS
  // scopa a auth.uid(); il filtro su read evita UPDATE a vuoto a ogni apertura.
  markReadForConversation: (conversationId) =>
    supabase.from('notifications').update(withOrigin({ read: true }))
      .eq('type', 'chat_message')
      .eq('read', false)
      .eq('payload->>conversation_id', conversationId),
  // Le remove sono hard-delete: .delete() non accetta un payload, quindi non
  // può trasportare origin_client (come Categories.remove). Le notifiche nascono
  // da trigger DB server-side con origin_client NULL, perciò l'eco della DELETE
  // non è auto-filtrabile; è però innocua (la riga eliminata non riappare: il
  // refetch la conferma assente, nessun flicker visibile).
  remove: (id) =>
    supabase.from('notifications').delete().eq('id', id),
  // Pulizia elenco: cancella le sole notifiche già lette. La RLS
  // ("own notifications delete") scopa automaticamente a auth.uid().
  removeRead: () =>
    supabase.from('notifications').delete().eq('read', true),
  // Cancella tutte le notifiche dell'utente. Il filtro id-non-null è solo
  // per soddisfare il requisito Supabase di un WHERE sulle delete: la RLS
  // garantisce comunque che tocchi solo le righe di auth.uid().
  removeAll: () =>
    supabase.from('notifications').delete().not('id', 'is', null),
};

// ----------------- PUSH SUBSCRIPTIONS -----------------
// Web Push (handoff v44). Una riga per dispositivo/browser sottoscritto; le
// RLS limitano tutto a auth.uid(). L'invio è server-side (trigger notify_push
// → Edge Function send-push), qui c'è solo la gestione della sottoscrizione.
export const Push = {
  // Chiave pubblica VAPID: arriva dal Vault via RPC, niente env var frontend.
  getVapidPublicKey: () => supabase.rpc('get_vapid_public_key'),
  // Upsert: ri-attivare sul solito dispositivo aggiorna le chiavi senza duplicare.
  save: (row) =>
    supabase.from('push_subscriptions').upsert(row, { onConflict: 'user_id,endpoint' }),
  // Esiste ancora la riga per questa sottoscrizione? La Edge Function cancella
  // gli endpoint che rispondono 404/410 (frequente su iOS), quindi il browser
  // può avere una subscription viva mentre il server non sa più a chi inviare.
  // maybeSingle: nessuna riga non è un errore, è proprio il caso da rilevare.
  findByEndpoint: (userId, endpoint) =>
    supabase.from('push_subscriptions').select('id')
      .eq('user_id', userId).eq('endpoint', endpoint).maybeSingle(),
  removeByEndpoint: (endpoint) =>
    supabase.from('push_subscriptions').delete().eq('endpoint', endpoint),
  // Notifica di prova a se stessi: l'insert su notifications è riservato ai
  // trigger (nessuna policy di INSERT), quindi passa da una RPC security
  // definer (migration 20260731_push_test_and_ios_fixes).
  sendTest: () => supabase.rpc('send_test_push'),
};
