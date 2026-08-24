// src/lib/api/chat.js
// Conversazioni e messaggi, inclusi vocali e allegati di chat.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { supabase } from '../supabase';
import { getClientId } from '../clientId';
import { fetchAllRows, fetchRowsUpTo, WITH_COUNT } from '../pagination.js';
import { withOrigin } from '../realtime.js';
import { CONTA_RIGHE } from './comuni.js';
import { signedUrlCache, creaSignedUrlGetter, sanitizeFileName, baseMimeType } from './storage.js';

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
// `sanitizeFileName` e `baseMimeType` sono in ./storage.js: li usano anche gli
// allegati dei task, e stavano qui perché la chat è stata la prima a caricare
// file. Erano già una coppia condivisa fra due sezioni dello stesso file — lo
// split le ha solo messe dove entrambe le vedono.

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
