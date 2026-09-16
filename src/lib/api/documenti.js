// src/lib/api/documenti.js
// Archivio dei documenti di identità dei passeggeri: metadati in
// public.documenti_identita, file nel bucket privato 'documenti-identita'.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.
//
// ─── PERCHÉ NON PASSA DAL REDUCER ───────────────────────────────────────────
// `DocumentiIdentita` NON è in VIETATE_ENTITA_DELLO_STATE, cioè i componenti
// la chiamano direttamente invece di passare da `dispatch()`. È la stessa
// deroga già motivata per `TaskFiles` e `Messages`: le entità che vivono su
// Storage non sono fette dello stato globale — non hanno un equivalente
// ottimistico da mostrare prima della risposta del server (il file O è
// caricato O non lo è), e il rollback che il registry di persistenza offre
// non avrebbe niente da annullare.

import { getSupabase } from '../supabase';
import { fetchAllRows, WITH_COUNT } from '../pagination.js';
import { CONTA_RIGHE } from './comuni.js';
import { signedUrlCache, creaSignedUrlGetter, sanitizeFileName, baseMimeType } from './storage.js';

const BUCKET = 'documenti-identita';

/**
 * I metadati che accompagnano un caricamento. Dichiarato come typedef e non
 * inline nel JSDoc di `upload`: un `@param {object} meta` seguito dai soli
 * `meta.passeggero` fa dedurre a `verifica:tipi` che le ALTRE chiavi non
 * esistano, e ogni campo facoltativo diventa un errore di tipo.
 *
 * @typedef {object} MetaDocumento
 * @property {string} passeggero
 * @property {string} [tipo]
 * @property {string|null} [numero]
 * @property {string|null} [scadenza]
 * @property {string|null} [note]
 * @property {string|null} [clientId]
 */

// Le colonne lette dall'elenco, esplicite invece di `*`: la tabella è quella
// con i dati più sensibili del progetto e `note` può contenere testo libero
// scritto da un operatore. Nominare le colonne è il modo per accorgersi che
// una nuova colonna esiste — con `*` arriverebbe in ogni vista senza che
// nessuno lo decida.
const COLONNE =
  'id, passeggero, client_id, tipo, numero, scadenza, file_path, file_name, ' +
  'file_size, file_type, note, uploaded_by, created_at, updated_at';

export const DocumentiIdentita = {
  /**
   * L'archivio intero, ordinato per nome del passeggero.
   *
   * Passa da `fetchAllRows` e non da una `select` secca per la stessa ragione
   * di C-1 (audit del 12 agosto): il cap `db-max-rows` di PostgREST tronca a
   * 1000 righe SENZA errore, e questo archivio nasce con ~1000 documenti —
   * cioè esattamente sul cap, il caso in cui il troncamento silenzioso si
   * manifesta come «il documento c'era e adesso non lo trovo più».
   *
   * L'ordinamento si chiude su `id` perché `fetchAllRows` richiede un ORDER BY
   * DETERMINISTICO: `passeggero` da solo non lo è (gli omonimi esistono, ed è
   * proprio il caso in cui due pagine potrebbero ripetere o saltare una riga).
   */
  list: async () => {
    const supabase = await getSupabase();
    return fetchAllRows(() => supabase
      .from('documenti_identita')
      .select(COLONNE, WITH_COUNT)
      .order('passeggero', { ascending: true })
      .order('id', { ascending: true }));
  },

  /**
   * Carica il file nel bucket e inserisce la riga di metadati.
   *
   * ORDINE: prima il file, poi la riga. L'inverso lascerebbe una riga che
   * promette un documento inesistente — un buco che si nota solo aprendolo,
   * cioè al momento peggiore. Così il caso di fallimento è un oggetto orfano
   * nel bucket: invisibile nell'app, e recuperabile.
   *
   * Se l'INSERT fallisce il file appena caricato viene rimosso: senza questa
   * compensazione un import da 1000 file che incontra 50 rifiuti della RLS
   * lascerebbe 50 oggetti pagati e mai referenziati.
   *
   * @param {Blob|File} blob      il file GIÀ compresso (vedi lib/comprimiImmagine.js)
   * @param {string} nomeFile      il nome originale, mostrato nell'app
   * @param {MetaDocumento} meta
   * @param {string|null} [uploadedBy]  id dell'utente: la policy di INSERT
   *   esige che sia il proprio, quindi un `null` qui fa rifiutare l'insert dal
   *   database invece di produrre una riga senza proprietario.
   */
  upload: async (blob, nomeFile, meta, uploadedBy = null) => {
    const supabase = await getSupabase();
    // `<uuid>/<nome>`: il nome originale resta leggibile (è ciò che il
    // browser propone al download) e l'uuid rende impossibile la collisione
    // fra due passeggeri omonimi, che su un archivio di documenti non è un
    // caso di scuola.
    const path = `${crypto.randomUUID()}/${sanitizeFileName(nomeFile)}`;
    const contentType = baseMimeType(blob?.type);
    const up = await supabase.storage.from(BUCKET).upload(path, blob, { contentType });
    if (up.error) return { data: null, error: up.error };

    const riga = {
      passeggero: meta.passeggero,
      client_id: meta.clientId ?? null,
      tipo: meta.tipo || 'passaporto',
      numero: meta.numero ?? null,
      scadenza: meta.scadenza ?? null,
      note: meta.note ?? null,
      file_path: up.data?.path ?? path,
      file_name: nomeFile,
      file_size: blob?.size ?? null,
      file_type: contentType,
      uploaded_by: uploadedBy,
    };
    const ins = await supabase.from('documenti_identita').insert(riga).select(COLONNE).single();
    if (ins.error) {
      // Compensazione, non gestione dell'errore: l'errore dell'INSERT si
      // propaga al chiamante comunque. `await` e non fire-and-forget perché su
      // un import a blocchi il prossimo upload parte subito dopo, e una
      // rimozione ancora in volo è ciò che questa riga esiste per evitare.
      // Il try/catch copre il caso in cui a fallire sia la rimozione stessa:
      // resta un oggetto orfano — invisibile nell'app — e il chiamante deve
      // comunque vedere l'errore VERO, quello dell'INSERT.
      try { await supabase.storage.from(BUCKET).remove([path]); } catch { /* orfano nel bucket */ }
      return { data: null, error: ins.error };
    }
    return ins;
  },

  /**
   * Correzione dei soli metadati (numero, scadenza, tipo, nome, note). Il file
   * non si tocca: per sostituirlo si carica il nuovo e si elimina il vecchio —
   * vedi la nota sull'assenza di una policy di UPDATE sugli oggetti nella
   * migrazione 20260916120000.
   *
   * `CONTA_RIGHE` perché mira a UNA riga per chiave primaria: senza, una
   * UPDATE respinta dalla RLS è indistinguibile da una riuscita (C-1
   * dell'audit del 14 agosto, secondo passaggio).
   */
  update: async (id, patch) => {
    const supabase = await getSupabase();
    const campi = {};
    if (patch.passeggero !== undefined) campi.passeggero = patch.passeggero;
    if (patch.tipo !== undefined) campi.tipo = patch.tipo;
    if (patch.numero !== undefined) campi.numero = patch.numero || null;
    if (patch.scadenza !== undefined) campi.scadenza = patch.scadenza || null;
    if (patch.note !== undefined) campi.note = patch.note || null;
    if (patch.clientId !== undefined) campi.client_id = patch.clientId || null;
    return supabase.from('documenti_identita')
      .update(campi, CONTA_RIGHE)
      .eq('id', id)
      .select(COLONNE)
      .single();
  },

  /**
   * Elimina la riga di metadati (la fonte di verità) e poi l'oggetto nel
   * bucket. Stesso ordine di `TaskFiles.remove` e stessa ragione, che M-3 del
   * 14 agosto (terzo passaggio) ha pagato sulla chat: l'operazione
   * IRREVERSIBILE va per ultima. Cancellare prima il file e poi scoprire che
   * la RLS rifiuta la riga significa aver distrutto il documento lasciando in
   * archivio la scheda che lo promette.
   */
  remove: async (id, path) => {
    const supabase = await getSupabase();
    const del = await supabase.from('documenti_identita').delete(CONTA_RIGHE).eq('id', id);
    if (del.error || del.count === 0) return del;
    if (path) {
      await supabase.storage.from(BUCKET).remove([path]);
      // La signed URL dell'oggetto appena rimosso non deve restare in cache:
      // il path è unico, quindi non verrà riutilizzato, ma la voce
      // occuperebbe uno dei 200 posti fino alla scadenza.
      signedUrlCache.dimentica(path);
    }
    return del;
  },

  /**
   * Signed URL temporanea per aprire o scaricare il documento, con la cache
   * in memoria condivisa con allegati task e chat.
   */
  getFileUrl: creaSignedUrlGetter(BUCKET, signedUrlCache),
};
