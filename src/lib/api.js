// src/lib/api.js
// Layer dati: CRUD su tutte le entità VoyageDesk via supabase-js.
// Le policy RLS sul DB filtrano automaticamente i risultati per utente loggato.
import { supabase } from './supabase';
import { getClientId } from './clientId';
import { fetchAllRows, WITH_COUNT } from './fetchAllRows';

// Step L: allega l'origin client a ogni payload di mutation sulle tabelle
// live. I subscriber realtime usano questo tag per scartare gli eventi che
// hanno generato loro stessi.
//
// Il tag funziona SOLO se la tabella ha davvero la colonna `origin_client`:
// altrimenti PostgREST rifiuta la scrittura con PGRST204. La colonna c'è su
// tasks, notices, conversations, messages, comments, users, categories,
// notifications e — dalla migrazione 20260808120000 — clients e task_history.
// Le tabelle del modulo Liste (liste_viaggio, movimenti_lista) sono in
// realtime ma NON hanno la colonna: le loro scritture passano tutte da RPC e
// non sono taggate (vedi il blocco (b) della stessa migrazione). L'invariante
// «pubblicata su realtime ⇒ ha origin_client» è misurata da
// src/test/realtimeOriginContract.test.js.
const withOrigin = (payload) => ({ ...payload, origin_client: getClientId() });

// Normalizza un errore (stringa, oggetto Error, oggetto serializzato) in un
// testo sempre mostrabile. Evita il bug per cui un Error serializzato via
// JSON.stringify diventa "{}" (message/stack sono proprietà non enumerabili)
// e finiva renderizzato così nelle modali. Restituisce sempre una stringa
// non vuota: il messaggio se disponibile, altrimenti il fallback.
const errText = (v, fallback = 'Operazione non riuscita.') => {
  if (typeof v === 'string' && v.trim()) return v;
  if (v && typeof v === 'object' && typeof v.message === 'string' && v.message.trim()) return v.message;
  return fallback;
};

// Messaggio mostrato quando la sessione lato server non esiste più (tipicamente
// dopo un logout avvenuto altrove). Le Edge Function (verify_jwt + getUser)
// rispondono "Token non valido"/"Non autorizzato": un access-token JWT può
// essere ancora formalmente valido mentre la sessione è già stata revocata.
const SESSION_EXPIRED_MSG = 'Sessione scaduta. Esci e accedi di nuovo, poi riprova.';
const isExpiredSessionError = (msg) =>
  typeof msg === 'string' && /token non valido|session.?not.?found|non autorizzato/i.test(msg);

// Invoca una Edge Function e normalizza sempre il risultato in
// { data, error: { message } }. Supabase-js mette il corpo JSON della risposta
// d'errore (status non-2xx) in error.context: lo estraiamo per esporre il
// messaggio localizzato dalla funzione invece del generico "Edge Function
// returned a non-2xx status code". Alcune funzioni ritornano { error } anche
// con status 2xx: lo trattiamo come errore. Un tempo questo blocco era
// copia-incollato in invite/deleteAccount/deleteUser.
const invokeFn = async (name, body = {}, fallback = 'Operazione non riuscita.') => {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = errText(error.message, fallback);
    try {
      const b = await error.context?.json?.();
      if (b?.error) msg = errText(b.error, msg);
    } catch { /* body non-JSON: usa error.message */ }
    return { data: null, error: { message: msg } };
  }
  if (data?.error) return { data: null, error: { message: errText(data.error, fallback) } };
  return { data, error: null };
};

// ----------------- USERS / TEAM -----------------
// Cache delle signed URL degli avatar. Separata da quella degli allegati
// (signedUrlCache, più in basso) perché ha una frequenza d'uso diversa: un
// avatar è richiesto da decine di componenti nello stesso render, quindi
// senza cache si genererebbe una richiesta per ogni <Avatar> montato.
const avatarUrlCache = new Map();

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
  // Avatar upload sul bucket pubblico 'avatars' (migration 20260706). Prima le
  // foto erano data-URL base64 dentro users.photo_url: la riga cresceva fino a
  // megabyte e listAll() la riscaricava per tutto il team ad ogni evento
  // realtime. Path fisso <user_id>/avatar.jpg con upsert → una sola foto per
  // utente, nessun orfano. Ritorna la public URL con cache-buster (?v=timestamp,
  // il path è fisso quindi senza query la CDN servirebbe la foto vecchia) da
  // salvare in photo_url. Il primo segmento del path = userId → le RLS del
  // bucket (foldername[1] = auth.uid()) autorizzano solo la propria cartella.
  uploadAvatar: async (userId, blob) => {
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
  // Signed URL per un avatar (1h, con cache in memoria).
  //
  // Accetta anche i valori NON-path già presenti in users.photo_url e li
  // restituisce invariati: i data URI base64 delle foto caricate prima che
  // esistesse il bucket, e le eventuali public URL http salvate quando il
  // bucket era pubblico. Così il passaggio a bucket privato non ha richiesto
  // nessuna migrazione dei dati e nessuna foto esistente si è rotta.
  getAvatarUrl: async (value) => {
    if (!value) return { url: null, error: null };
    if (value.startsWith('data:') || value.startsWith('http')) {
      return { url: value, error: null };
    }
    const cached = avatarUrlCache.get(value);
    if (cached && cached.expiresAt > Date.now()) return { url: cached.url, error: null };
    const { data, error } = await supabase.storage
      .from('avatars')
      .createSignedUrl(value, 60 * 60);
    const url = data?.signedUrl ?? null;
    if (url) avatarUrlCache.set(value, { url, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { url, error };
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
  invite: async ({ email, name, role = 'agent', capacity = 8, color = '#3B82F6', resend = false } = {}) => {
    const body = { email, name, role, capacity, color, resend, redirectTo: window.location.origin };
    const run = () => invokeFn('invite-user', body, 'Invito non riuscito.');
    let res = await run();
    // "Token non valido" = la sessione lato server non esiste più (es. logout
    // avvenuto in un'altra scheda/dispositivo). Provo a rinfrescare la sessione
    // e riprovo una volta; se non recupero, restituisco un messaggio chiaro
    // invece di quello criptico della Edge Function.
    if (res.error && isExpiredSessionError(res.error.message)) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) res = await run();
      if (res.error && isExpiredSessionError(res.error.message)) {
        return { data: null, error: { message: SESSION_EXPIRED_MSG } };
      }
    }
    return res;
  },
  // Step H: presence
  setPresence: (id, status) =>
    supabase.from('users').update(withOrigin({
      status, last_seen_at: new Date().toISOString(),
    })).eq('id', id),
  // ----------------- CONTATTI PII (user_contacts) -----------------
  // email/phone sono in public.user_contacts. RLS: SELECT consentito a tutti gli
  // utenti autenticati (rubrica interna del team — vedi migrazione
  // 20260629_user_contacts_select_team.sql); INSERT/UPDATE restano own+admin.
  // user_contacts non è in realtime e non ha origin_client → niente withOrigin.
  getContacts: (id) =>
    supabase.from('user_contacts').select('email, phone').eq('user_id', id).maybeSingle(),
  // Rubrica completa: tutte le righe contatti (per Team view e pannello Admin).
  // RLS lato server filtra ciò che non è leggibile; con la policy "team" vede tutti.
  listContacts: () =>
    supabase.from('user_contacts').select('user_id, email, phone'),
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
  deleteAccount: () => invokeFn('delete-account', {}, 'Eliminazione non riuscita.'),
  // Eliminazione DEFINITIVA di un utente da parte di un admin (Block 3).
  // Chiama la Edge Function 'delete-user' (verify_jwt) che hard-elimina la
  // riga auth.users: la FK CASCADE ripulisce public.users e user_contacts.
  // Serve a liberare un'email "fantasma" così l'invito può essere rifatto da
  // zero (altrimenti Users.invite restituisce "già registrata").
  deleteUser: (userId) => invokeFn('delete-user', { userId }, 'Eliminazione non riuscita.'),
};

// ----------------- TASKS -----------------
// Select riusabile che porta dietro i commenti e la cronologia (chi ha
// creato/modificato il task), entrambi con il nome dell'attore via join.
const TASK_SELECT_WITH_COMMENTS =
  '*, comments(id, user_id, text, created_at, users(name)), task_history(id, actor_id, action, old_value, new_value, created_at, users(name))';

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
  // Creazione in blocco (BulkTaskCreator): UNA insert multi-riga invece di N
  // chiamate in parallelo. È atomica — o entrano tutte o nessuna — mentre con
  // Promise.all una riga rifiutata (vincolo, RLS, rete) lasciava passare le
  // altre e l'utente si ritrovava metà batch sul server ma tutte le task in
  // lista, scoprendo la differenza solo al reload successivo.
  createMany: (tasks) =>
    supabase.from('tasks').insert(tasks.map(withOrigin)).select(),
  update: (id, patch) =>
    supabase.from('tasks').update(withOrigin(patch)).eq('id', id).select().single(),
  softDelete: (id) =>
    supabase.from('tasks').update(withOrigin({ deleted_at: new Date().toISOString() })).eq('id', id),
  restore: (id) =>
    supabase.from('tasks').update(withOrigin({ deleted_at: null })).eq('id', id),
  // Purge definitiva: la FK task_files.task_id ON DELETE CASCADE ripulisce le
  // righe metadati ma NON tocca i file fisici nel bucket privato 'task-files'
  // (path <task_id>/<uuid>-<nomefile>, vedi TaskFiles.upload). Senza questo step
  // ogni purge di un task con allegati lascia file orfani nello storage per
  // sempre. Leggiamo quindi i path prima di eliminare la riga task e rimuoviamo
  // in un'unica chiamata batch; solo dopo cancelliamo il task (che innesca la
  // cascade sui metadati). Se la lettura o la rimozione storage falliscono
  // (es. bucket già ripulito), logghiamo un warning ma non blocchiamo comunque
  // l'eliminazione del task — stesso principio non-bloccante di TaskFiles.remove.
  hardDelete: async (id) => {
    const filesRes = await supabase.from('task_files').select('file_url').eq('task_id', id);
    if (filesRes.error) {
      console.warn('TasksAPI.hardDelete: lettura allegati task_files fallita, procedo comunque', filesRes.error);
    } else {
      const paths = (filesRes.data || []).map((f) => f.file_url).filter(Boolean);
      if (paths.length) {
        const { error: removeError } = await supabase.storage.from('task-files').remove(paths);
        if (removeError) {
          console.warn('TasksAPI.hardDelete: rimozione allegati da storage fallita, procedo comunque', removeError);
        }
      }
    }
    return supabase.from('tasks').delete().eq('id', id);
  },
};

// Le due tabelle figlie dei task, lette per intero (la RLS restringe già alle
// righe dei task visibili). Servono al reload selettivo di useAppHydration: un
// commento aggiunto non richiede di riscaricare i task con tutti i loro campi,
// solo il thread che è cambiato. La select rispecchia i due rami annidati di
// TASK_SELECT_WITH_COMMENTS, così i mapper fromDbComment/fromDbHistory
// ricevono la stessa forma di riga in entrambi i percorsi.
export const TaskThreads = {
  comments: () =>
    supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)')
      .order('created_at'),
  history: () =>
    supabase.from('task_history')
      .select('id, task_id, actor_id, action, old_value, new_value, created_at, users(name)')
      .order('created_at'),
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
  // Eliminazione conversazione/gruppo: i messaggi seguono via FK ON DELETE
  // CASCADE; le RLS (20260705) permettono il delete a ogni partecipante.
  remove: (id) =>
    supabase.from('conversations').delete().eq('id', id),
};

// ----------------- MESSAGES -----------------
// Step M: i nomi file possono contenere caratteri non ammessi nelle key
// di Storage (spazi, accenti) → normalizzo mantenendo estensione leggibile.
const sanitizeFileName = (name = 'file') => name.replace(/[^\w.-]+/g, '_');

// Tipo MIME senza parametri: "audio/webm;codecs=opus" → "audio/webm",
// "text/plain;charset=utf-8" → "text/plain". Da quando i bucket hanno una
// allowed_mime_types (migrazione 20260806160000) il confronto è sulla stringa
// esatta, e un parametro attaccato fa rifiutare un upload per il resto
// legittimo. Il fallback octet-stream è nell'elenco consentito apposta: è ciò
// che il browser manda quando il sistema operativo non riconosce l'estensione.
const baseMimeType = (tipo) => (tipo || '').split(';')[0].trim() || 'application/octet-stream';

export const Messages = {
  listForConversation: (conversation_id, limit = 200) =>
    supabase.from('messages').select('*')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true })
      .limit(limit),
  // Carica i messaggi più RECENTI delle conv visibili in un solo round-trip:
  // l'app raggruppa lato client per conversation_id. Le RLS già limitano
  // la visibilità ai soli partecipanti.
  // Nota: ordiniamo discendente per prendere gli ultimi `limit` (non i primi:
  // con ascending una volta superato il totale cumulativo di `limit` messaggi
  // su tutte le conversazioni visibili, i messaggi NUOVI smetterebbero di
  // comparire perché la query restituirebbe sempre e solo i più vecchi).
  // Poi si reinverte per ripristinare l'ordine cronologico atteso dai
  // consumer (msgsByConv in VoyageDesk.jsx costruisce gli array assumendo
  // ordine ascendente).
  listAll: async (limit = 2000) => {
    const { data, error } = await supabase.from('messages').select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    return { data: data ? [...data].reverse() : data, error };
  },
  send: (m) =>
    supabase.from('messages').insert(withOrigin(m)).select().single(),
  remove: (id) =>
    supabase.from('messages').delete().eq('id', id),
  // Toggle atomico di una reazione (RPC messages_toggle_reaction, migration
  // 20260706). Sostituisce il vecchio setReactions che scriveva l'intero
  // oggetto reactions calcolato lato client: due utenti che reagivano allo
  // stesso messaggio in contemporanea si sovrascrivevano (last-write-wins). La
  // RPC fa read-modify-write sotto lock di riga e usa sempre auth.uid() come
  // reactor (non spoofabile). origin taggato per filtrare l'eco realtime.
  toggleReaction: (id, emoji) =>
    supabase.rpc('messages_toggle_reaction', {
      msg_id: id,
      emoji,
      origin: getClientId(),
    }),
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
  // Il lettore è sempre auth.uid() lato server (no reader_id spoofabile dal
  // client). Vedi migration 20260702_messages_mark_read_auth_uid.sql.
  markReadBulk: (conversationId) =>
    supabase.rpc('messages_mark_read', {
      conv_id: conversationId,
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
      .upload(path, file, { contentType: baseMimeType(file.type) });
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
    // MediaRecorder restituisce il tipo COMPLETO di parametri — es.
    // "audio/webm;codecs=opus" (VoiceRecorder.jsx:15). Il parametro serve al
    // codec in registrazione, non alla riproduzione: si salva il tipo base
    // (vedi baseMimeType) e il player funziona lo stesso.
    const { data, error } = await supabase.storage
      .from('chat-files')
      .upload(path, blob, { contentType: baseMimeType(mimeType) || 'audio/webm' });
    return { path: data?.path ?? null, error };
  },
  // Cleanup allegati di una conversazione in via di eliminazione: lista i
  // file sotto il prefisso <conversation_id>/ e li rimuove. Va chiamato PRIMA
  // del delete della riga conversations: le policy storage derivano
  // l'autorizzazione dai partecipanti della conversazione, che dopo il delete
  // non esiste più (i file diventerebbero orfani permanenti). Best-effort:
  // un errore qui non deve bloccare l'eliminazione della conversazione.
  removeConversationFiles: async (conversationId) => {
    const { data, error } = await supabase.storage
      .from('chat-files')
      .list(conversationId, { limit: 1000 });
    if (error) return { error };
    if (!data?.length) return { error: null };
    const paths = data.map(f => `${conversationId}/${f.name}`);
    const { error: rmError } = await supabase.storage.from('chat-files').remove(paths);
    return { error: rmError };
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
  getFileUrl: async (path) => {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt > Date.now()) return { url: cached.url, error: null };
    const { data, error } = await supabase.storage
      .from('task-files')
      .createSignedUrl(path, 60 * 60);
    const url = data?.signedUrl ?? null;
    if (url) signedUrlCache.set(path, { url, expiresAt: Date.now() + 55 * 60 * 1000 });
    return { url, error };
  },
};

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

// ----------------- CLIENTS -----------------
// `clients` è in realtime dalla 20260807215625 e ha origin_client dalla
// 20260808120000 (S-1). Prima di quest'ultima erano le uniche mutazioni del
// data layer a non passare da withOrigin: chi salvava una scheda in anagrafica
// riceveva l'eco della propria scrittura e si riscaricava le 818 righe
// dell'elenco, che aveva già aggiornato in ottimistico.
export const Clients = {
  // PostgREST tronca ogni select oltre `db-max-rows` senza errore: qui non ci
  // si può fermare alla prima pagina come per le altre entità (`.range()` +
  // `count`, condiviso con `lib/listeApi.js` in `lib/fetchAllRows.js`), perché
  // `clients` è l'unica anagrafica letta per intero a ogni avvio dell'app.
  list: () =>
    fetchAllRows(() => supabase.from('clients').select('*', WITH_COUNT).order('name')),
  get: (id) =>
    supabase.from('clients').select('*').eq('id', id).single(),
  create: (client) =>
    supabase.from('clients').insert(withOrigin(client)).select().single(),
  update: (id, patch) =>
    supabase.from('clients').update(withOrigin(patch)).eq('id', id).select().single(),
  // Niente withOrigin qui: .delete() non accetta un payload (stesso limite di
  // Notifications.remove e Categories.remove), quindi l'eco della DELETE non è
  // filtrabile e ogni client ricarica l'elenco. È il comportamento corretto,
  // non una lacuna: l'unico modo per rendere leggibile un'origine su una
  // DELETE sarebbe la REPLICA IDENTITY FULL, che però esporrebbe l'origine
  // dell'ULTIMA SCRITTURA — quella di chi ha modificato la scheda per ultimo,
  // non di chi la sta cancellando — e farebbe scartare a QUELL'utente la
  // cancellazione altrui, lasciandogli in lista un cliente che non esiste più.
  // Vedi il blocco (a) in fondo alla migrazione 20260808120000.
  remove: (id) =>
    supabase.from('clients').delete().eq('id', id),
};

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

// ----------------- REALTIME -----------------
// Step L: i payload realtime hanno origin_client se generati da una mutation
// taggata: su INSERT/UPDATE sta in payload.new, su DELETE in payload.old (solo
// dove la tabella è a REPLICA IDENTITY FULL, vedi migration
// 20260611_replica_identity_full.sql). Se il tag coincide con il nostro
// client, l'evento è l'eco della nostra stessa scrittura — l'UI è già
// aggiornata in modo ottimistico, quindi lo scartiamo per evitare flash.
//
// Su DELETE l'origine NON è affidabile e infatti non viene più letta.
// `.delete()` non trasporta un payload, quindi `payload.old.origin_client` non
// è l'origine di CHI CANCELLA: è quella dell'ultima scrittura che ha toccato
// la riga. Fidarsene invertiva il senso del filtro proprio per l'utente più
// coinvolto —
//
//   A modifica un task (origin = A) → B lo purga dal cestino → l'evento DELETE
//   arriva ad A con origin = A → A lo scarta come eco propria → nella lista di
//   A quel task resta, e resta finché A non ricarica la pagina.
//
// — sulle sette tabelle a REPLICA IDENTITY FULL, `tasks` compresa. Ignorando
// l'origine sui DELETE ogni cancellazione provoca un refetch: una richiesta in
// più, sempre corretta. Non è una perdita, perché l'eco della PROPRIA DELETE
// non era comunque filtrabile (non porta il tag), quindi il ramo scartava solo
// cancellazioni altrui. Vedi il blocco (a) della migrazione 20260808120000,
// che per la stessa ragione NON ha portato a FULL le tabelle nuove.
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
  // Client non utilizzabile (env var assenti, o mockato nei test): il realtime
  // è un miglioramento, non un requisito di funzionamento. Degradiamo a "nessun
  // aggiornamento automatico" invece di sollevare dentro un useEffect, dove
  // l'eccezione risalirebbe fino all'ErrorBoundary e mostrerebbe una pagina
  // bianca al posto di una vista che i dati li ha già caricati.
  if (typeof supabase?.channel !== "function") {
    return () => {};
  }
  const channel = supabase
    .channel(`realtime:${tableName}:${getClientId()}:${++channelSeq}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, (payload) => {
      // Solo INSERT/UPDATE possono portare un'origine attendibile: sono le sole
      // che passano da un payload nostro (withOrigin). Sui DELETE l'origine si
      // ignora — vedi la nota sopra: è quella dell'ultima scrittura, non del
      // cancellante, e filtrarci sopra nascondeva la cancellazione a chi aveva
      // toccato la riga per ultimo.
      if (payload?.eventType !== 'DELETE') {
        const origin = payload?.new?.origin_client;
        if (origin && origin === getClientId()) return;
      }
      handler(payload);
    })
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Canale realtime di BROADCAST per lo stato EFFIMERO "sta scrivendo".
// A differenza di subscribeToTable non tocca il DB: gli eventi vivono solo
// finché i client sono connessi (il typing non va persistito). Topic dedicato
// per-conversazione così ogni chat ha il suo canale isolato.
//   { config: { broadcast: { self: false } } } → il mittente NON riceve l'eco
//   dei propri eventi, quindi non serve filtrare il proprio userId in ricezione.
// Ritorna { send, unsubscribe }; send(payload) pubblica un evento 'typing'.
export function subscribeToTyping(conversationId, onEvent) {
  const channel = supabase
    .channel(`typing:${conversationId}`, { config: { broadcast: { self: false } } })
    .on('broadcast', { event: 'typing' }, ({ payload }) => onEvent(payload))
    .subscribe();
  const send = (payload) =>
    channel.send({ type: 'broadcast', event: 'typing', payload });
  const unsubscribe = () => supabase.removeChannel(channel);
  return { send, unsubscribe };
}
