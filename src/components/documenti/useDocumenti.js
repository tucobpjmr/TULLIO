// src/components/documenti/useDocumenti.js
// I dati dell'archivio documenti: caricamento iniziale e le tre scritture.
//
// ─── PERCHÉ NON PASSA DAL REDUCER ───────────────────────────────────────────
// Stessa ragione di `useListeData` e della chat: i documenti sono un modulo a
// sé, e soprattutto sono un'entità di Storage. Il registry di persistenza
// (state/persistence.js) esiste per dare a una mutazione l'aggiornamento
// ottimistico più il rollback; qui l'aggiornamento ottimistico non ha senso —
// un file O è stato caricato O non lo è, e mostrarlo in elenco prima che il
// bucket risponda significherebbe mostrare una riga che apre il vuoto.
//
// ─── PERCHÉ NON C'È REALTIME ────────────────────────────────────────────────
// `documenti_identita` non è pubblicata su `supabase_realtime`, ed è una
// scelta: l'archivio non è una vista collaborativa come la bacheca o la chat —
// si apre, si cerca un passeggero, si chiude. Chi carica vede il proprio
// inserimento perché è lui a farlo, e il documento di un collega si vede al
// prossimo ingresso nella vista. Il costo di un canale permanente aperto su
// una tabella che cambia qualche volta al giorno non è giustificato.
//
// ⛔ Le scritture aggiornano l'elenco IN MEMORIA invece di rifare la fetch.
// Non è un'ottimizzazione prematura: l'import massivo carica fino a mille file
// in sequenza, e un refetch dell'intero archivio dopo ciascuno significherebbe
// mille letture paginate da mille righe.

import { useState, useCallback, useRef, useEffect } from "react";
import { DocumentiIdentita } from "../../lib/api.js";
import { fromDbDocumento, ordinaDocumenti } from "./documentiModello.js";

/**
 * @param {object} [opts]
 * @param {boolean} [opts.enabled=true]  false per i ruoli senza accesso
 *   all'archivio: niente fetch, niente stato di caricamento.
 */
export function useDocumenti({ enabled = true } = {}) {
  const [documenti, setDocumenti] = useState(/** @type {object[]} */ ([]));
  const [caricamento, setCaricamento] = useState(enabled);
  const [erroreCaricamento, setErroreCaricamento] = useState(/** @type {string|null} */ (null));

  // Generazione anti-stale, come in useListeData: due `carica()` che si
  // accavallano devono risolversi sull'ordine di PARTENZA, non su quello di
  // arrivo. Qui il caso è raro (una sola fetch al montaggio, più il pulsante
  // «Ricarica») ma costa un ref, e l'alternativa è una vista che mostra in
  // silenzio un elenco più vecchio di quello che aveva già.
  const genRef = useRef(0);
  // Sopravvive allo smontaggio: senza, una fetch ancora in volo quando
  // l'utente cambia vista chiamerebbe i setter su un componente smontato.
  const vivoRef = useRef(true);
  useEffect(() => () => { vivoRef.current = false; }, []);

  const carica = useCallback(async () => {
    if (!enabled) return;
    const mia = ++genRef.current;
    const attuale = () => vivoRef.current && mia === genRef.current;
    setCaricamento(true);
    setErroreCaricamento(null);
    const { data, error } = await DocumentiIdentita.list();
    if (!attuale()) return;
    if (error) {
      setErroreCaricamento(error.message || "Caricamento non riuscito");
      setCaricamento(false);
      return;
    }
    setDocumenti(ordinaDocumenti((data || []).map(fromDbDocumento)));
    setCaricamento(false);
  }, [enabled]);

  useEffect(() => { carica(); }, [carica]);

  /**
   * Carica un file e la sua riga di metadati. Il blob arriva GIÀ compresso:
   * la compressione è una decisione del chiamante (che sa se sta importando
   * in blocco o caricando un singolo file) e non di questo hook.
   *
   * @returns {Promise<{ documento: object|null, error: object|null }>}
   */
  const aggiungi = useCallback(async (blob, nomeFile, meta, uploadedBy) => {
    const { data, error } = await DocumentiIdentita.upload(blob, nomeFile, meta, uploadedBy);
    if (error || !data) return { documento: null, error: error || { message: "Caricamento non riuscito" } };
    const documento = fromDbDocumento(data);
    // L'updater resta PURO — nessuna chiamata di rete dentro (docs/CLAUDE.md,
    // «Scritture della chat»): la rete è già andata e ritornata qui sopra, e
    // l'updater riceve solo il risultato.
    if (vivoRef.current) setDocumenti((prec) => ordinaDocumenti([...prec, documento]));
    return { documento, error: null };
  }, []);

  /** Correzione dei metadati (numero, scadenza, tipo, nome, note). */
  const aggiorna = useCallback(async (id, patch) => {
    const { data, error, count } = await DocumentiIdentita.update(id, patch);
    // `count === 0` è un rifiuto della RLS travestito da successo: la clausola
    // USING di una policy non solleva, rende le righe invisibili (C-1
    // dell'audit del 14 agosto, secondo passaggio).
    if (error) return { documento: null, error };
    if (count === 0) return { documento: null, error: { message: "Non hai i permessi per modificare questo documento" } };
    const documento = fromDbDocumento(data);
    if (vivoRef.current) {
      setDocumenti((prec) => ordinaDocumenti(prec.map((d) => (d.id === id ? documento : d))));
    }
    return { documento, error: null };
  }, []);

  /**
   * Elimina riga e file. Irreversibile: non esiste un cestino per i documenti
   * di identità, ed è voluto — un cestino sarebbe una seconda copia dello
   * stesso dato sensibile, che continua a esistere dopo che qualcuno ha
   * chiesto di eliminarlo.
   */
  const elimina = useCallback(async (documento) => {
    const { error, count } = await DocumentiIdentita.remove(documento.id, documento.filePath);
    if (error) return { error };
    if (count === 0) return { error: { message: "Non hai i permessi per eliminare questo documento" } };
    if (vivoRef.current) setDocumenti((prec) => prec.filter((d) => d.id !== documento.id));
    return { error: null };
  }, []);

  return { documenti, caricamento, erroreCaricamento, carica, aggiungi, aggiorna, elimina };
}
