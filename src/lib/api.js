// src/lib/api.js
// Layer dati: CRUD su tutte le entità VoyageDesk via supabase-js.
// Le policy RLS sul DB filtrano automaticamente i risultati per utente loggato.
import { supabase } from './supabase';
import { getClientId } from './clientId';
import { fetchAllRows, fetchRowsUpTo, WITH_COUNT } from './pagination.js';

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
// (signedUrlCache, subito sotto) perché ha una frequenza d'uso diversa: un
// avatar è richiesto da decine di componenti nello stesso render, quindi
// senza cache si genererebbe una richiesta per ogni <Avatar> montato.
const avatarUrlCache = new Map();
// Cache condivisa dagli allegati di chat e di task (Messages.getFileUrl,
// TaskFiles.getFileUrl): stessa pressione d'uso — un click alla volta —
// quindi le due si accontentano di una Map sola, a differenza degli avatar.
const signedUrlCache = new Map();

// Signed URL con cache in memoria, per i tre bucket privati (M-3 dell'audit
// del 14 agosto). Prima era lo stesso corpo scritto tre volte — qui, in
// Messages.getFileUrl e in TaskFiles.getFileUrl — differendo solo per il nome
// del bucket: un fix al TTL o all'invalidazione ne avrebbe raggiunta una sola
// delle tre per distrazione, non per scelta.
//
// Il MARGINE fra il TTL richiesto e la scadenza salvata in cache è
// l'invariante che questa funzione esiste per rendere esplicito: la URL si
// considera scaduta cinque minuti PRIMA che il server la rifiuti, così un
// click che parte poco prima della scadenza non riceve un 400 dal bucket.
// Finché la coppia era scritta a mano in tre punti (`60 * 60` e
// `55 * 60 * 1000`), il margine non era una regola: era una coincidenza fra
// sei numeri che nessuno dei tre call site dichiarava di voler mantenere.
const TTL_SIGNED_URL_S = 60 * 60;
const MARGINE_SCADENZA_MS = 5 * 60 * 1000;

const creaSignedUrlGetter = (bucket, cache) => async (path) => {
  if (!path) return { url: null, error: null };
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return { url: cached.url, error: null };
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, TTL_SIGNED_URL_S);
  const url = data?.signedUrl ?? null;
  if (url) cache.set(path, { url, expiresAt: Date.now() + TTL_SIGNED_URL_S * 1000 - MARGINE_SCADENZA_MS });
  return { url, error };
};

// Bucket fisso: l'unico dei tre call site che ha bisogno di RICORDARE quale
// bucket usa, perché getAvatarUrl lo richiama al posto di ripetere
// 'avatars' — Messages/TaskFiles passano invece il proprio bucket in linea,
// visto che ciascuna entry lo dichiara una volta sola.
const avatarSignedUrl = creaSignedUrlGetter('avatars', avatarUrlCache);

// C-1 dell'audit del 14 agosto (secondo passaggio). Chiede a PostgREST quante
// righe una UPDATE/DELETE ha DAVVERO toccato.
//
// Serve a distinguere "riuscita" da "rifiutata dalla RLS", che senza questo
// sono la stessa risposta: la clausola USING di una policy non solleva un
// errore, rende le righe invisibili — e una UPDATE/DELETE su zero righe è
// indistinguibile da una su un id inesistente. `res.error` resta null in
// entrambi i casi.
//
// Va aggiunta SOLO ai metodi che mirano a UNA riga già esistente per chiave
// primaria (.eq('id', …) o equivalente): lì `count === 0` significa "il
// database non me l'ha lasciata toccare". Non va aggiunta alle scritture che
// possono legittimamente non toccare nulla (markAllRead su zero non lette,
// hardDeleteMany su un cestino vuoto): là zero è un esito normale, non un
// rifiuto. useSyncedDispatch (hooks/useSyncedDispatch.js) legge `count` solo
// dove il metodo lo fornisce: l'adozione è per-metodo, non tutto-o-niente.
const CONTA_RIGHE = { count: 'exact' };

export const Users = {
  list: () =>
    supabase.from('users').select('*').eq('active', true).order('name'),
  // listAll() include pending=true e active=false: serve agli admin per vedere
  // utenti in attesa di approvazione e disabilitati nel pannello Team. Le
  // policy RLS sulla tabella users non filtrano per active, quindi tutti gli
  // utenti autenticati possono leggere l'elenco completo (è un team condiviso).
  listAll: () =>
    supabase.from('users').select('*').order('name'),
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
  approve: (id, role = 'agent') =>
    supabase.from('users').update(withOrigin({ pending: false, active: true, role }), CONTA_RIGHE).eq('id', id),
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
  /**
   * @param {string} id
   * @param {{email?: string, phone?: string}} [contatti]
   */
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
// Select riusabile che porta dietro i commenti, col nome dell'autore via join.
//
// ─── LA CRONOLOGIA NON C'È PIÙ (A-3, passo 3) ──────────────────────────────
// Fino al 17 agosto questa select portava anche `task_history(...)`: la
// cronologia INTERA di OGNI task, a ogni idratazione. È la tabella che cresce e
// non si pota mai — una riga per ogni cambio di stato, priorità, scadenza,
// assegnatario o cestinamento — e nessuna vista d'elenco la guardava: l'unico
// lettore è il pannello CRONOLOGIA dello slide-over, cioè UN task per volta,
// quello che si sta guardando.
//
// I commenti restano, e la differenza fra i due non è la dimensione ma il
// numero di lettori: `AdvancedSearchPanel` cerca DENTRO il testo dei commenti
// (`matchTermini(… (t.comments || []).map(c => c.text))`), quindi il corpus dei
// commenti serve davvero per intero a una funzione che l'utente usa. Nessuno
// cerca dentro la cronologia. Il nome della costante, che diceva già
// «WITH_COMMENTS», torna a essere esatto.
const TASK_SELECT_WITH_COMMENTS =
  '*, comments(id, user_id, text, created_at, users(name))';

// Purge definitiva di uno o più task, con la pulizia dello storage che la FK
// non fa. Un'unica implementazione per il caso singolo e per quello in blocco:
// le due varianti differivano solo nel filtro (`eq` vs `in`), e tenerne due
// significava che la seconda poteva dimenticarsi i file orfani.
const purgeTasks = async (ids) => {
  const lista = (ids || []).filter(Boolean);
  if (!lista.length) return { error: null };
  const filesRes = await supabase.from('task_files').select('file_url').in('task_id', lista);
  if (filesRes.error) {
    console.warn('TasksAPI.purge: lettura allegati task_files fallita, procedo comunque', filesRes.error);
  } else {
    const paths = (filesRes.data || []).map((f) => f.file_url).filter(Boolean);
    if (paths.length) {
      const { error: removeError } = await supabase.storage.from('task-files').remove(paths);
      if (removeError) {
        console.warn('TasksAPI.purge: rimozione allegati da storage fallita, procedo comunque', removeError);
      }
    }
  }
  return supabase.from('tasks').delete().in('id', lista);
};

export const Tasks = {
  // Paginata (C-1). Era la terza lettura "che deve arrivare intera" rimasta su
  // una select nuda, dopo `clients` (ST-3) e le due tabelle figlie qui sotto.
  // 276 righe oggi, cestino incluso: sotto il cap `db-max-rows`, ma è la
  // tabella che alimenta OGNI vista dell'app — quando lo supererà, le task in
  // fondo all'ordinamento smetteranno semplicemente di esistere per il client,
  // senza che `error` dica nulla.
  //
  // `count: 'exact'` era il motivo per cui questa correzione era rimasta
  // indietro: il commento in fondo a questo file la dichiarava «il prossimo
  // candidato» ma con «un costo per richiesta che va misurato prima», perché a
  // differenza di `clients` la select porta con sé commenti e cronologia
  // annidati. Misurato il 12 agosto 2026 sul database di produzione: il count
  // esatto è un aggregato sulla sola tabella di PRIMO livello (le risorse
  // annidate non entrano nel conteggio), quindi `select count(*) from tasks` —
  // 11 ms comprensivi di pianificazione, contro un `statement_timeout` di 8 s.
  //
  // `.order('id')` come seconda chiave: `due_date` è nullable e non è unica,
  // e senza un ordinamento deterministico due pagine consecutive possono
  // ripetere o saltare una riga (stessa ragione del `.order('name').order('id')`
  // su Clients.list).
  //
  // ─── `completeDal`: LA FINESTRA DELL'IDRATAZIONE (A-3) ────────────────────
  // Paginare bene una lettura significa scaricarla INTERA senza troncamenti
  // silenziosi, ed è ciò che C-1 ha reso vero. Ma «intera, per sempre» è a sua
  // volta una scelta di scalabilità: la quota di `tasks` che serve alle viste
  // d'ingresso (Dashboard e Calendario filtrano con `getActiveTasks`) cala di
  // giorno in giorno, mentre il payload cresce con l'anzianità
  // dell'installazione. `completeDal` è la data oltre la quale una task
  // COMPLETATA non serve più all'avvio.
  //
  // È un PREDICATO e non un limite di righe, e la differenza è il punto: un
  // `.limit(n)` lascia fuori «quello che è avanzato dopo le prime n» — cioè un
  // insieme che nessuno sa nominare — mentre qui ciò che resta fuori è
  // definito ed è ricostruibile da chi lo vuole (vedi
  // `state/StoricoTaskContext.jsx`: Archivio, Cestino, statistiche, export e
  // ricerca avanzata chiedono il corpus intero al mount).
  //
  // `completed_at.is.null` nella `or` è deliberatamente FAIL-OPEN: per
  // l'invariante della migration `20260630144254_tasks_completed_at` (trigger
  // + backfill) una riga `status = 'done'` ha sempre una data, quindi quel
  // ramo oggi non seleziona nulla; se un giorno la violasse, la riga resta
  // NELLA finestra invece di sparire da ogni percorso senza che nulla lo dica.
  // Una task non databile che si vede è un difetto visibile; una che non si
  // vede è la stessa classe di guasto del troncamento silenzioso.
  //
  // La `or` NON tocca il cestino: quello è `includeDeleted`, che resta la sola
  // chiave per portarsi dietro le righe soft-deleted.
  //
  // ⚠️ `completeDal` deve essere una stringa ISO SENZA millisecondi. Dentro
  // `or=(…)` il punto separa colonna, operatore e valore, quindi un
  // `…T08:00:00.000Z` mette il separatore dentro il valore e la query dipende
  // da come il parser risolve l'ambiguità. Il chiamante la produce già così
  // (`inizioFinestra` in hooks/useAppHydration.js, dove sta la spiegazione
  // lunga); qui resta scritto perché è un vincolo di QUESTA firma, e il
  // prossimo chiamante non avrà letto quel file.
  list: ({ includeDeleted = false, withComments = false, completeDal = null } = {}) => {
    const select = withComments ? TASK_SELECT_WITH_COMMENTS : '*';
    return fetchAllRows(() => {
      let q = supabase.from('tasks').select(select, WITH_COUNT)
        .order('due_date', { ascending: true }).order('id');
      if (!includeDeleted) q = q.is('deleted_at', null);
      if (completeDal) q = q.or(`status.neq.done,completed_at.is.null,completed_at.gte.${completeDal}`);
      return q;
    });
  },
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
    supabase.from('tasks').update(withOrigin({ deleted_at: new Date().toISOString() }), CONTA_RIGHE).eq('id', id),
  restore: (id) =>
    supabase.from('tasks').update(withOrigin({ deleted_at: null }), CONTA_RIGHE).eq('id', id),
  // Purge definitiva: la FK task_files.task_id ON DELETE CASCADE ripulisce le
  // righe metadati ma NON tocca i file fisici nel bucket privato 'task-files'
  // (path <task_id>/<uuid>-<nomefile>, vedi TaskFiles.upload). Senza questo step
  // ogni purge di un task con allegati lascia file orfani nello storage per
  // sempre — vedi purgeTasks qui sopra.
  hardDelete: (id) => purgeTasks([id]),
  // Purge in BLOCCO (M-4 dell'audit del 12 agosto). EMPTY_TRASH chiamava
  // `Promise.all(ids.map(hardDelete))`: tre round-trip PER TASK (select
  // allegati, remove storage, delete riga) tutti in volo insieme — su un
  // cestino da 60 task sono 180 richieste concorrenti. E la cancellazione non
  // era atomica: un fallimento a metà lasciava il database con una parte dei
  // task già eliminata e la UI con il cestino svuotato per intero, senza alcun
  // rollback che rimettesse a posto la differenza. Qui i round-trip sono tre in
  // TOTALE e la cancellazione è una sola istruzione `delete … in (…)`: o cadono
  // tutte o nessuna, che è la premessa perché il rollback dichiarato in
  // state/persistence.js sia corretto.
  hardDeleteMany: (ids) => purgeTasks(ids),
};

// Le letture dei thread appesi ai task. Sono DUE, e da A-3 (passo 3) hanno
// forme diverse perché hanno lettori diversi.
//
// ─── `comments()`: PER CORPUS, e paginata (C-1) ────────────────────────────
// Serve al reload selettivo di useAppHydration — un commento aggiunto non
// richiede di riscaricare i task con tutti i loro campi, solo il thread
// cambiato — e la select rispecchia il ramo annidato di
// TASK_SELECT_WITH_COMMENTS, così `fromDbComment` riceve la stessa forma di
// riga in entrambi i percorsi. Resta per corpus perché il corpus lo usa
// qualcuno: `AdvancedSearchPanel` cerca dentro il testo dei commenti.
//
// La paginazione con `fetchAllRows` è C-1 e non si tocca: PostgREST tronca a
// `db-max-rows` rispondendo 200 senza errore, e il difetto che ne seguirebbe
// non è «mancano dei dati» — è che il reload completo passa dalle risorse
// ANNIDATE, che il cap del primo livello non tocca, mentre è il reload
// SELETTIVO (`soloThread` in useAppHydration, quello che scatta quando un
// collega commenta) a rileggere questa tabella PIATTA, dove il cap morde. Con
// l'ordine ascendente a cadere sarebbero le righe più RECENTI, che
// `SET_TASK_THREADS` traduce in `[]`: il thread sparisce quando qualcun altro
// commenta e torna premendo F5.
//
// `.order('id')` come seconda chiave: `created_at` NON è unico, e senza una
// chiave di spareggio due pagine consecutive possono ripetere o saltare una
// riga — il caso che si manifesta solo oltre il cap, cioè dove nessuno guarda.
//
// ─── `historyForTask()`: PER TASK APERTO (A-3, passo 3) ────────────────────
// La cronologia era l'altra metà di questa coppia, letta per corpus con la
// stessa forma. Era anche l'unica tabella dell'app che CRESCE E NON SI POTA
// MAI — una riga per ogni cambio di stato, priorità, scadenza, assegnatario o
// cestinamento — misurata a 660 righe il 17 agosto 2026, ~14,8 al giorno, e
// con la proiezione a dodici mesi (~5.500 righe) il percorso `soloThread`
// sarebbe arrivato a SEI round-trip in fila, seriali per costruzione dentro
// `fetchAllRows`, su un percorso che scatta a ogni commento scritto da
// chiunque.
//
// Il lettore però è UNO SOLO e guarda UN task per volta: il pannello
// CRONOLOGIA dello slide-over (components/tasks/TaskHistoryPanel.jsx). Da qui
// il filtro `.eq('task_id', …)`: la lettura passa da «tutta la cronologia di
// tutti i task, a ogni evento» a «la cronologia di questo task, quando lo si
// apre», ed è una quantità che non cresce con l'anzianità
// dell'installazione ma con la vita del singolo task.
//
// ⛔ NON ha un `.limit(50)` come `ListeAPI.history`, ed è una divergenza
// deliberata dal precedente. Un tetto dichiarato è la risposta giusta quando
// si vuole davvero mostrare «gli ultimi n» (là è un pannello di attività
// recenti); qui il pannello mostra la cronologia COMPLETA di un task, e un
// `limit` taglierebbe in silenzio le righe più vecchie — a partire da «task
// creata», che è quella che si va a cercare. `fetchAllRows` su una singola
// riga padre costa lo stesso round-trip e non ha un limite da sbagliare.
export const TaskThreads = {
  comments: () =>
    fetchAllRows(() => supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)', WITH_COUNT)
      .order('created_at').order('id')),
  // A-1 dell'audit del 22 agosto. I commenti dei SOLI task toccati da un
  // evento realtime.
  //
  // `comments()` qui sopra resta, ed è ancora la lettura giusta per il CORPUS
  // (AdvancedSearchPanel cerca dentro il testo dei commenti, che è il lettore
  // per cui quel metodo esiste). Ma era anche la lettura del percorso
  // `soloThread` di useAppHydration, cioè quello che scatta a ogni commento
  // scritto da CHIUNQUE, su OGNI client connesso: la tabella intera, paginata a
  // blocchi di 1000, per applicare UNA riga che l'evento realtime già portava
  // con sé.
  //
  // È la stessa forma di difetto che A-3 (passo 3) ha chiuso per
  // `task_history` — e `comments` ha la stessa proprietà che lo rendeva grave:
  // cresce e non si pota mai, perché nessuna UI cancella un commento (vedi la
  // nota su `Comments.remove` più sotto). La differenza con la cronologia è il
  // numero di LETTORI, non la dimensione: la cronologia ne aveva uno solo e ha
  // potuto scendere per-task del tutto, i commenti ne hanno due — il thread
  // dello slide-over e la ricerca avanzata — quindi qui il corpus resta
  // disponibile e a scendere è il solo percorso frequente.
  //
  // ⛔ Nessun `.limit()`: il tetto è già l'insieme dei task nominati dal
  // chiamante. `fetchAllRows` continua a proteggere dal cap di PostgREST nel
  // caso — improbabile ma non impossibile — di un task con più di 1000
  // commenti, e dove il cap morde è proprio qui: sul reload SELETTIVO, dove le
  // righe che cadono sono le più RECENTI (vedi il preambolo di `comments()`).
  commentsForTasks: (taskIds) =>
    fetchAllRows(() => supabase.from('comments')
      .select('id, task_id, user_id, text, created_at, users(name)', WITH_COUNT)
      .in('task_id', taskIds)
      .order('created_at').order('id')),
  historyForTask: (taskId) =>
    fetchAllRows(() => supabase.from('task_history')
      .select('id, task_id, actor_id, action, old_value, new_value, created_at, users(name)', WITH_COUNT)
      .eq('task_id', taskId)
      .order('created_at').order('id')),
};

// ----------------- COMMENTS -----------------
// B-2 dell'audit del 14 agosto (terzo passaggio): `Comments.remove` è stato
// tolto perché non aveva chiamanti — nessuna UI cancella un commento, nessuna
// entry del registry la dichiara, nessun documento la cita come preparazione
// dichiarata (la verifica che mancò al primo tentativo di B-2 nel secondo
// passaggio, quando `Messages.listForConversation` fu rimossa per errore
// leggendo i soli usi nel repository). Un metodo di scrittura senza chiamanti
// nel data layer non è inerte: è una scorciatoia già pronta per chi domani
// vorrà cancellare un commento senza passare dal registry, cioè senza guard,
// senza rollback e senza tag origin.
export const Comments = {
  create: ({ task_id, user_id, text }) =>
    supabase.from('comments').insert(withOrigin({ task_id, user_id, text })).select().single(),
};

// ----------------- NOTICES (bacheca) -----------------
export const Notices = {
  // B-3 dell'audit del 16 agosto: era una `select` nuda. La bacheca non ha
  // potatura — un avviso resta finché qualcuno non lo cancella — quindi è una
  // delle due letture non paginate su una tabella che CRESCE, e il cap di
  // PostgREST (1000 righe, HTTP 200 senza errore) è esattamente il difetto che
  // non fallisce da solo: gli avvisi oltre la soglia semplicemente non
  // esistono più per la bacheca.
  //
  // `.order('id')` come terza chiave: né `pinned` né `created_at` sono unici
  // (due avvisi fissati nello stesso secondo bastano), e senza una chiave di
  // spareggio due pagine consecutive possono ripetere o saltare una riga —
  // stessa ragione del `.order('name').order('id')` di Clients.list.
  list: () =>
    fetchAllRows(() => supabase.from('notices').select('*, users(name, color)', WITH_COUNT)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id')),
  create: (n) =>
    supabase.from('notices').insert(withOrigin(n)).select().single(),
  update: (id, patch) =>
    supabase.from('notices').update(withOrigin(patch)).eq('id', id).select().single(),
  togglePin: (id, pinned) =>
    supabase.from('notices').update(withOrigin({ pinned }), CONTA_RIGHE).eq('id', id),
  remove: (id) =>
    supabase.from('notices').delete(CONTA_RIGHE).eq('id', id),
};

// ----------------- CONVERSATIONS -----------------
export const Conversations = {
  // B-3 dell'audit del 16 agosto, come Notices.list qui sopra: l'altra lettura
  // non paginata su una tabella che cresce — una riga per conversazione aperta,
  // e nessuna si cancella da sola. `.order('id')` chiude l'ordinamento su una
  // colonna unica: `updated_at` cambia a ogni messaggio, quindi due pagine
  // lette a cavallo di un invio potrebbero saltare una conversazione.
  listMine: () =>
    fetchAllRows(() => supabase.from('conversations').select('*', WITH_COUNT)
      .order('updated_at', { ascending: false })
      .order('id')),
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
  //
  // CONTA_RIGHE (C-1 del terzo passaggio del 14 agosto): è una DELETE mirata a
  // UNA riga per chiave primaria, quindi `count === 0` significa "la RLS non
  // me l'ha lasciata toccare" e non "non c'era niente da fare". Qui il
  // conteggio non è difesa in profondità ma la CONDIZIONE che decide se
  // ripulire lo storage: chatCommands.removeConversation rimuove gli allegati
  // solo DOPO che questa DELETE ha davvero tolto la riga.
  remove: (id) =>
    supabase.from('conversations').delete(CONTA_RIGHE).eq('id', id),
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
  // Non chiamata da nessuna parte, DI PROPOSITO: è il secondo passo di ST-4
  // (docs/AUDIT_STRUTTURA_2026-08-10.md), la lettura per-conversazione che
  // sostituirà il corpus intero di listAll() quando `messages` supererà la
  // soglia scritta lì (~1500) — oggi 13. Rimossa una prima volta in questo
  // stesso intervento (B-2, secondo audit del 14 agosto) scambiandola per
  // codice morto: era una lettura degli USI nel repository, senza incrociare
  // gli AUDIT che la citano per nome come preparazione dichiarata. Non
  // toccare senza aver letto ST-4 (parte 2) per intero.
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
  //
  // B-2 dell'audit del 13 agosto: `.limit(2000)` dichiara un tetto oltre
  // `db-max-rows` (1000 di default su Supabase, vedi lib/pagination.js), che
  // PostgREST applica troncando la risposta a 1000 righe con HTTP 200 — SENZA
  // errore. Il limite dichiarato non era mai stato davvero consegnato oltre
  // le prime 1000 righe. `fetchRowsUpTo` pagina con `.range()` in blocchi da
  // `PAGE_SIZE` (1000, lo stesso cap) finché non raggiunge `limit` o il
  // database finisce le righe: con `limit` di default (2000) sono due
  // richieste invece di una, ma è la differenza fra "i 2000 messaggi più
  // recenti" dichiarati e "i 1000 più recenti, in silenzio".
  // `.order('id')` come spareggio: fetchRowsUpTo pagina con `.range()`, che
  // richiede una chiave d'ordinamento deterministica (vedi pagination.js) —
  // senza, due messaggi con lo stesso `created_at` (stesso millisecondo, non
  // impossibile con più mittenti) potrebbero ripetersi o saltare fra due pagine.
  listAll: async (limit = 2000) => {
    const { data, error } = await fetchRowsUpTo(
      () => supabase.from('messages').select('*')
        .order('created_at', { ascending: false }).order('id', { ascending: false }),
      limit
    );
    return { data: data ? [...data].reverse() : data, error };
  },
  send: (m) =>
    supabase.from('messages').insert(withOrigin(m)).select().single(),
  // `remove` (cancellazione di un singolo messaggio) è stata tolta con lo
  // stesso criterio di `Comments.remove` — vedi lì: nessun chiamante, nessun
  // comando in chatCommands.js, nessun audit che la dichiari preparata. La
  // cancellazione della CONVERSAZIONE resta e passa da Conversations.remove,
  // che i messaggi se li porta dietro in CASCADE.
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
    }), CONTA_RIGHE).eq('id', id),
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
  // Cache in-memory condivisa con TaskFiles.getFileUrl (stessa fabbrica,
  // stesso TTL/margine — vedi creaSignedUrlGetter).
  getFileUrl: creaSignedUrlGetter('chat-files', signedUrlCache),
};

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
  getFileUrl: creaSignedUrlGetter('task-files', signedUrlCache),
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
  // Paginata (ST-3). La tabella è a 818 righe e PostgREST tronca ogni select a
  // `db-max-rows` (1000 di default) rispondendo 200 SENZA errore: sarebbe
  // bastata la crescita normale dell'anagrafica — che si alimenta a blocchi
  // via ClientImportModal, non una riga alla volta — perché i clienti in fondo
  // all'ordinamento smettessero di esistere per l'app. Con `.order('name')` le
  // prime a sparire sarebbero le ultime dell'alfabeto, e il sintomo ("non
  // trovo più il cliente Z") non assomiglia a un problema di paginazione.
  // Cadono in silenzio con essa anche l'autocomplete cliente sui task, il
  // conteggio liste per cliente e la ricerca globale.
  //
  // `order('name', ...).order('id')`: fetchAllRows richiede un ordinamento
  // deterministico, e `name` non è unico (due schede omonime esistono e sono
  // legittime — cliente e cointestatario con lo stesso nome). Senza la seconda
  // chiave, due pagine consecutive potrebbero ripetere o saltare una riga.
  //
  // Non è più l'unica: dal 12 agosto (C-1) passano da `fetchAllRows` anche
  // `Tasks.list` e le due tabelle figlie `TaskThreads.comments/history`. Il
  // costo di `count: 'exact'` sulla select annidata dei task — l'unica ragione
  // per cui la correzione era rimasta indietro — è stato misurato: 11 ms, vedi
  // il commento su Tasks.list. Con quelle tre, ogni lettura del data layer che
  // deve arrivare INTERA è paginata.
  list: () =>
    fetchAllRows(() => supabase.from('clients')
      .select('*', WITH_COUNT).order('name').order('id')),
  // ─── M-1 (passo 2) · la ricerca cliente si fa sul SERVER ────────────────
  // (audit performance/UX del 19 agosto)
  //
  // PERCHÉ ESISTE. `list()` qui sopra scarica l'anagrafica INTERA, e finché la
  // tendina di suggerimento cliente (`ui/ClientAutocomplete.jsx`) filtrava un
  // array in memoria, quel download era obbligatorio a ogni sessione: la
  // tendina si apre da `QuickAddTask` — il FAB su ogni vista, la scorciatoia
  // `K` — quindi «quasi ogni sessione» non è un'esagerazione. È il consumatore
  // che rendeva inutile qualunque finestra sull'idratazione, e per questo va
  // per primo.
  //
  // Un autocomplete è comunque il caso in cui la ricerca lato server è la forma
  // giusta e non un ripiego: si guardano le prime righe che corrispondono a ciò
  // che si sta digitando, non tutte.
  //
  // I TERMINI IN AND, non la stringa intera. `ilike '%mario rossi%'` non trova
  // «ROSSI MARIO», e in questa anagrafica l'ordine cognome/nome non è una
  // regola (vedi il commento in testa a lib/searchUtils.js): convivono
  // «COLUCCI GIANNICOLA» e «ELENA GIANCIPPOLI». Spezzando la query e
  // richiedendo ogni termine si ottiene l'indipendenza dall'ordine, che è la
  // proprietà che l'utente si aspetta perché è quella delle altre ricerche
  // dell'app.
  //
  // ⚠️ COSA QUESTA RICERCA NON FA, e va saputo: `ilike` confronta i caratteri
  // così come sono, quindi NON normalizza accenti e apostrofi come
  // `lib/searchUtils.js` — «d amato» non trova «D'AMATO» qui, mentre lo trova
  // nell'anagrafica (`ClientiView`, che lavora sul corpus in memoria con
  // l'indice). Coprire anche quello lato server richiede `unaccent`/`pg_trgm`,
  // che su questo progetto non sono installate: abilitare un'estensione è una
  // decisione a sé, non un effetto collaterale di un autocomplete. Chi cerca
  // una scheda con la punteggiatura la trova dall'anagrafica; qui si
  // suggerisce mentre si digita.
  //
  // Nessuna paginazione e nessun `count`: qui il tetto è VOLUTO — sono i primi
  // `limit` suggerimenti, non un insieme che deve arrivare intero (è la
  // distinzione fra `fetchRowsUpTo` e `fetchAllRows` in lib/pagination.js, e
  // `limit` è ben sotto `db-max-rows`).
  cerca: (q, { limit = 20 } = {}) => {
    const termini = String(q ?? '').trim().split(/\s+/).filter(Boolean);
    if (termini.length === 0) return Promise.resolve({ data: [], error: null });
    let query = supabase.from('clients').select('*');
    for (const t of termini) query = query.ilike('name', `%${t}%`);
    return query.order('name').limit(limit);
  },
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
    supabase.from('clients').delete(CONTA_RIGHE).eq('id', id),
  // Import anagrafica (A-2): insert multi-riga a BLOCCHI invece di N
  // `create()` in Promise.all. Ogni blocco è atomico — o entra tutto o
  // niente — quindi un fallimento a metà lascia uno stato NOTO (i blocchi già
  // scritti) invece di un insieme casuale di righe passate e righe respinte,
  // scoperto solo al reload successivo. 200 è il compromesso fra numero di
  // round-trip e dimensione del payload: oltre, PostgREST inizia a rifiutare
  // per lunghezza della richiesta. `scritti` dice al rollback quante righe
  // NON togliere dalla UI.
  createMany: async (clients, { chunk = 200 } = {}) => {
    let scritti = 0;
    for (let i = 0; i < clients.length; i += chunk) {
      const blocco = clients.slice(i, i + chunk).map(withOrigin);
      const { error } = await supabase.from('clients').insert(blocco);
      if (error) return { error, scritti };
      scritti += blocco.length;
    }
    return { error: null, scritti };
  },
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

// ─── A-3 · LA PRESENZA È STATO DI CANALE, NON UNA RIGA DI TABELLA ──────────
// (audit performance/UX del 19 agosto)
//
// Era una `UPDATE` su `public.users` ogni 30 secondi per sessione. Quella
// tabella è nella publication `supabase_realtime` ed è a `REPLICA IDENTITY
// FULL`, quindi ogni battito diventava un evento — con la riga intera vecchia
// E nuova — consegnato a OGNI client sottoscritto a `users`; e ogni sessione
// la sottoscriveva due volte (il refresh del team e la presenza stessa). Con U
// sessioni contemporanee il traffico era U²/15 messaggi al secondo: ~2,1
// milioni al mese con le sette persone di oggi, ~26 con venticinque, in una
// giornata in cui nessuno tocca una task. Il filtro `filterEvent` in
// `useAppHydration` scartava quegli eventi, ma nel BROWSER — dopo che erano
// stati consegnati.
//
// Realtime Presence tiene lo stato NEL CANALE: `track()` non scrive niente sul
// database, non passa dal WAL, non fa valutare una policy RLS per riga, e alla
// disconnessione la voce si ritira da sola — che è il pezzo che un heartbeat
// su tabella non ha mai avuto (un browser ucciso senza `beforeunload` lasciava
// `status='online'` finché il tempo non lo faceva invecchiare).
//
// È lo stesso meccanismo di `subscribeToTyping` qui sotto, e per la stessa
// ragione: uno stato vero finché i client sono connessi non va persistito.
// Quello che ancora si scrive su `users` — e che il canale non può dare — è
// «quando questa persona ha aperto l'app l'ultima volta», che il pannello
// Admin mostra: resta una `setPresence` all'avvio della sessione, una al
// cambio di «Occupato» e una alla chiusura, cioè tre per sessione invece di
// una ogni trenta secondi.
//
// Un topic solo per tutta l'agenzia: la presenza è una lista di chi c'è, e
// dividerla per conversazione (come il typing) significherebbe non sapere chi
// è online finché non gli si apre una chat.
const CANALE_PRESENZA = 'presenza:agenzia';

/**
 * Apre il canale di presenza e ci pubblica il proprio stato.
 *
 * @param {object} opts
 * @param {string} opts.key           id dell'utente: è la chiave con cui le
 *   proprie voci si raggruppano in `presenceState()` (più schede aperte = più
 *   voci sotto la stessa chiave).
 * @param {() => object} opts.payload  lo stato da pubblicare, letto AL MOMENTO
 *   della pubblicazione e non catturato: `track` parte anche da un timer e da
 *   `visibilitychange`, cioè dopo che il chiamante ha cambiato idea.
 * @param {(stato: object) => void} opts.onSync  riceve `presenceState()` grezzo
 *   a ogni sincronizzazione; la traduzione è `daStatoCanale` in lib/presenza.js.
 * @returns {{ track: () => void, unsubscribe: () => void }}
 */
export function subscribeToPresence({ key, payload, onSync }) {
  // Stessa degradazione di `subscribeToTable`: senza client utilizzabile
  // (env var assenti, o mockato nei test) la presenza è un miglioramento, non
  // un requisito — si resta senza pallini invece di sollevare dentro un
  // useEffect e mostrare una pagina bianca.
  if (typeof supabase?.channel !== 'function') {
    return { track: () => {}, unsubscribe: () => {} };
  }
  const channel = supabase.channel(CANALE_PRESENZA, {
    config: { presence: { key } },
  });
  channel
    .on('presence', { event: 'sync' }, () => onSync(channel.presenceState()))
    .subscribe((stato) => {
      // La prima pubblicazione va fatta DA QUI e non subito dopo `subscribe()`:
      // `track()` su un canale non ancora agganciato viene rifiutato, e il
      // proprio pallino resterebbe spento per tutti gli altri finché il primo
      // refresh periodico non arriva.
      if (stato === 'SUBSCRIBED') channel.track(payload());
    });
  return {
    track: () => channel.track(payload()),
    unsubscribe: () => supabase.removeChannel(channel),
  };
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
