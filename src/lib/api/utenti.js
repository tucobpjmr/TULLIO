// src/lib/api/utenti.js
// Team, profili, contatti, presenza, inviti e cancellazione account.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { getSupabase } from '../supabase';
import { withOrigin } from '../realtime.js';
import { SESSION_EXPIRED_MSG, isExpiredSessionError, invokeFn, CONTA_RIGHE } from './comuni.js';
import { avatarUrlCache, avatarSignedUrl } from './storage.js';

export const Users = {
  list: async () => {
    const supabase = await getSupabase();
    return supabase.from('users').select('*').eq('active', true).order('name');
  },
  // listAll() include pending=true e active=false: serve agli admin per vedere
  // utenti in attesa di approvazione e disabilitati nel pannello Team. Le
  // policy RLS sulla tabella users non filtrano per active, quindi tutti gli
  // utenti autenticati possono leggere l'elenco completo (è un team condiviso).
  listAll: async () => {
    const supabase = await getSupabase();
    return supabase.from('users').select('*').order('name');
  },
  // Nota: email/phone NON sono più colonne di public.users (migrazione
  // 20260613100833_user_contacts_table). Vivono in public.user_contacts via
  // getContacts/updateContact. updateProfile le scarta difensivamente per
  // evitare l'errore "column does not exist".
  updateProfile: async (id, patch) => {
    const supabase = await getSupabase();
    const { email, phone, ...rest } = patch || {};
    return supabase.from('users').update(withOrigin(rest)).eq('id', id).select().single();
  },
  // Avatar upload sul bucket pubblico 'avatars' (migration 20260706). Prima le
  // foto erano data-URL base64 dentro users.photo_url: la riga cresceva fino a
  // megabyte e listAll() la riscaricava per tutto il team ad ogni evento
  // realtime. Path fisso <user_id>/avatar.jpg con upsert → una sola foto per
  // utente, nessun orfano. Ritorna la public URL con cache-buster (?v=timestamp,
  // il path è fisso quindi senza query la CDN servirebbe la foto vecchia) da
  // salvare in photo_url. Il primo segmento del path = userId → le RLS del
  // bucket (foldername[1] = auth.uid()) autorizzano solo la propria cartella.
  uploadAvatar: async (userId, blob) => {
    const supabase = await getSupabase();
    const path = `${userId}/avatar.jpg`;
    const { error } = await supabase.storage
      .from('avatars')
      .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) return { url: null, error };
    // Si salva il PATH, non più la public URL: dalla migrazione 20260806180000
    // il bucket è privato (S-10) e /object/public/... non risponde più. La
    // signed URL si genera alla lettura, in getAvatarUrl.
    //
    // Il cache-buster ?v=<timestamp> non serve più ed è anzi impossibile: il
    // valore salvato è un path, non una URL. Al suo posto si invalida qui la
    // cache in memoria — il path è fisso (upsert), quindi senza questa riga il
    // vecchio avatar resterebbe visibile fino alla scadenza della signed URL.
    avatarUrlCache.delete(path);
    return { url: path, error: null };
  },
  // Signed URL per un avatar (1h, con cache in memoria — vedi
  // creaSignedUrlGetter più in alto).
  //
  // Accetta anche i valori NON-path già presenti in users.photo_url e li
  // restituisce invariati: i data URI base64 delle foto caricate prima che
  // esistesse il bucket, e le eventuali public URL http salvate quando il
  // bucket era pubblico. Così il passaggio a bucket privato non ha richiesto
  // nessuna migrazione dei dati e nessuna foto esistente si è rotta. È il
  // solo ramo dei tre getFileUrl/getAvatarUrl che non generalizza —
  // Messages/TaskFiles non hanno un equivalente storico — quindi resta qui e
  // non nella fabbrica condivisa.
  getAvatarUrl: async (value) => {
    if (!value) return { url: null, error: null };
    if (value.startsWith('data:') || value.startsWith('http')) {
      return { url: value, error: null };
    }
    return avatarSignedUrl(value);
  },
  // Attiva/disattiva un membro passando dalla Edge Function 'set-user-active'
  // (Admin-only), che oltre alla colonna applicativa REVOCA davvero la sessione
  // (ban_duration lato auth.admin) — suggerimento strategico n. 3 dell'audit
  // dell'11 agosto. Prima era una scrittura diretta sulla tabella: la RLS
  // bloccava un utente disattivato su ogni query, ma il suo token restava
  // valido fino a scadenza. ⛔ Non tornare a `supabase.from('users').update(…)`
  // per questa colonna: sarebbe di nuovo un'etichetta, non una revoca.
  setActive: (id, active) =>
    invokeFn('set-user-active', { userId: id, active }, 'Aggiornamento non riuscito.'),
  // Approvazione admin di un utente registrato (pending → attivo). Le policy
  // RLS (users_admin_all) consentono l'update solo a un admin.
  //
  // C-1 dell'audit del 15 agosto: il ruolo viaggia CON l'approvazione invece
  // di essere ereditato dalla riga. Approvare non è "sbloccare un account":
  // è concedere un ruolo, e chi lo concede deve dirlo — non scoprirlo dalla
  // riga, che per un account auto-registrato era scritta dal registrante
  // stesso (chiuso lato trigger dalla migrazione
  // 20260815230000_handle_new_auth_user_stop_trusting_role_metadata, ma
  // questo resta il posto giusto per non farlo dipendere solo da quello).
  approve: async (id, role = 'agent') => {
    const supabase = await getSupabase();
    return supabase.from('users').update(withOrigin({ pending: false, active: true, role }), CONTA_RIGHE).eq('id', id);
  },
  // Invito admin di un nuovo utente via email (Block 3). Chiama la Edge
  // Function 'invite-user' (verify_jwt) che usa la Auth Admin API per inviare
  // l'invito e pre-crea il profilo public.users con pending=true. L'admin
  // verrà poi notificato (trigger notify_user_pending) e potrà approvarlo.
  // La Edge Function ritorna { success } oppure { error } con status non-2xx:
  // in quel caso supabase-js mette il messaggio in error.context (lo
  // normalizziamo qui per esporre il testo localizzato al chiamante).
  /** @param {{email?: string, name?: string, role?: string, capacity?: number, color?: string, resend?: boolean}} [dati] */
  invite: async ({ email, name, role = 'agent', capacity = 8, color = '#3B82F6', resend = false } = {}) => {
    const body = { email, name, role, capacity, color, resend, redirectTo: window.location.origin };
    const run = () => invokeFn('invite-user', body, 'Invito non riuscito.');
    let res = await run();
    // "Token non valido" = la sessione lato server non esiste più (es. logout
    // avvenuto in un'altra scheda/dispositivo). Provo a rinfrescare la sessione
    // e riprovo una volta; se non recupero, restituisco un messaggio chiaro
    // invece di quello criptico della Edge Function.
    if (res.error && isExpiredSessionError(res.error.message)) {
      const supabase = await getSupabase();
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) res = await run();
      if (res.error && isExpiredSessionError(res.error.message)) {
        return { data: null, error: { message: SESSION_EXPIRED_MSG } };
      }
    }
    return res;
  },
  // Step H: presence
  setPresence: async (id, status) => {
    const supabase = await getSupabase();
    return supabase.from('users').update(withOrigin({
      status, last_seen_at: new Date().toISOString(),
    })).eq('id', id);
  },
  // ----------------- CONTATTI PII (user_contacts) -----------------
  // email/phone sono in public.user_contacts. RLS: SELECT consentito a tutti gli
  // utenti autenticati (rubrica interna del team — vedi migrazione
  // 20260629_user_contacts_select_team.sql); INSERT/UPDATE restano own+admin.
  // user_contacts non è in realtime e non ha origin_client → niente withOrigin.
  getContacts: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('user_contacts').select('email, phone').eq('user_id', id).maybeSingle();
  },
  // Rubrica completa: tutte le righe contatti (per Team view e pannello Admin).
  // RLS lato server filtra ciò che non è leggibile; con la policy "team" vede tutti.
  listContacts: async () => {
    const supabase = await getSupabase();
    return supabase.from('user_contacts').select('user_id, email, phone');
  },
  /**
   * @param {string} id
   * @param {{email?: string, phone?: string}} [contatti]
   */
  updateContact: async (id, { email, phone } = {}) => {
    const supabase = await getSupabase();
    return supabase.from('user_contacts')
      .upsert({ user_id: id, email: email ?? null, phone: phone ?? null }, { onConflict: 'user_id' })
      .select().single();
  },
  // ----------------- PREFERENZE APP (user_app_preferences) -----------------
  // Preferenze personali sincronizzate server-side (es. reazioni recenti chat).
  // RLS: solo l'utente stesso. Fuori da realtime, niente origin_client (vedi
  // migration 20260620_user_app_preferences.sql).
  getPreferences: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('user_app_preferences').select('recent_reactions').eq('user_id', id).maybeSingle();
  },
  setRecentReactions: async (id, recentReactions) => {
    const supabase = await getSupabase();
    return supabase.from('user_app_preferences')
      .upsert({ user_id: id, recent_reactions: recentReactions, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  },
  // Self-service account deletion (Block 4). Calls the delete-account Edge
  // Function (verify_jwt) which bans the user for 10 years + sets active=false.
  // Does NOT hard-delete: preserves comments/messages (FK ON DELETE CASCADE safety).
  deleteAccount: () => invokeFn('delete-account', {}, 'Eliminazione non riuscita.'),
  // Eliminazione DEFINITIVA di un utente da parte di un admin (Block 3).
  // Chiama la Edge Function 'delete-user' (verify_jwt) che hard-elimina la
  // riga auth.users: la FK CASCADE ripulisce public.users e user_contacts.
  // Serve a liberare un'email "fantasma" così l'invito può essere rifatto da
  // zero (altrimenti Users.invite restituisce "già registrata").
  deleteUser: (userId) => invokeFn('delete-user', { userId }, 'Eliminazione non riuscita.'),
};
