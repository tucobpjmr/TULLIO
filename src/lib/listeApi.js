// src/lib/listeApi.js
// Layer dati del modulo "Liste Viaggio" (buoni viaggio / liste cliente).
// Porting della SPA vanilla `liste-buoni-viaggio` dentro VoyageDesk: le query
// e le RPC sono le stesse, ma passano dal client Supabase condiviso invece che
// da un client dedicato creato nella pagina.
//
// Ogni SCRITTURA passa da una RPC PostgreSQL (vedi
// supabase/migrations/20260728190000_sync_modulo_liste_viaggio.sql) che scrive
// il dato e la relativa voce di `lista_history` nella stessa transazione: o
// entrambi o nessuno. Non scrivere mai direttamente su liste_viaggio /
// movimenti_lista dal client, si perderebbe la traccia nello storico.
//
// Gating ruoli: la RLS (migrazione 20260728190100) concede il modulo solo a
// admin/manager/agent. Il gate lato client (role !== "driver") è difesa in
// profondità, non la garanzia: quella è e resta la RLS.
import { supabase } from './supabase';

// Le liste portano sempre con sé il nome del cliente: la vista elenco e la
// testata del dettaglio mostrano quello, non l'id.
const LISTA_SELECT = '*, clients(name)';

export const ListeAPI = {
  // Liste non archiviate, più recenti in cima (l'ordinamento fine è lato client).
  list: () =>
    supabase.from('liste_viaggio').select(LISTA_SELECT)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),

  // Cestino: archiviate (soft delete), più recenti in cima.
  listTrash: () =>
    supabase.from('liste_viaggio').select(LISTA_SELECT)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false }),

  // Liste di un singolo cliente: alimenta il tab dentro la scheda cliente.
  listByClient: (clientId) =>
    supabase.from('liste_viaggio').select(LISTA_SELECT)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),

  get: (id) =>
    supabase.from('liste_viaggio').select(LISTA_SELECT).eq('id', id).single(),

  // Vista `liste_saldi` (security_invoker): saldo, numero movimenti e data
  // dell'ultimo movimento per ogni lista non archiviata.
  saldi: () => supabase.from('liste_saldi').select('*'),

  movimenti: (listaId) =>
    supabase.from('movimenti_lista').select('*')
      .eq('lista_id', listaId)
      .is('deleted_at', null)
      .order('data_movimento').order('created_at'),

  history: (listaId, limit = 50) =>
    supabase.from('lista_history').select('*')
      .eq('lista_id', listaId)
      .order('created_at', { ascending: false })
      .limit(limit),

  // ── RPC (scritture atomiche dato + storico) ──
  crea: ({ clientId = null, titolo = null, newClientName = null }) =>
    supabase.rpc('crea_lista', {
      p_client_id: clientId,
      p_titolo: titolo,
      p_new_client_name: newClientName,
    }),

  // p_client_name null → la RPC lascia invariato il nome cliente.
  // Attenzione: il nome cliente è l'anagrafica condivisa, rinominarlo si
  // riflette su tutte le liste di quel cliente.
  modifica: ({ id, titolo = null, clientName = null }) =>
    supabase.rpc('modifica_lista', { p_id: id, p_titolo: titolo, p_client_name: clientName }),

  cambiaStato: (id, stato) =>
    supabase.rpc('cambia_stato_lista', { p_id: id, p_stato: stato }),

  archivia: (id) => supabase.rpc('archivia_lista', { p_id: id }),

  ripristina: (id) => supabase.rpc('ripristina_lista', { p_id: id }),

  addMovimento: ({ listaId, data, descrizione, importo, metodo = null }) =>
    supabase.rpc('registra_movimento_lista', {
      p_lista_id: listaId,
      p_data: data,
      p_descrizione: descrizione,
      p_importo: importo,
      p_metodo: metodo,
    }),

  // p_movimenti: array di { descrizione, importo }. Data e metodo sono comuni
  // a tutte le righe; il segno dell'importo è per riga.
  addMovimenti: ({ listaId, data, movimenti, metodo = null }) =>
    supabase.rpc('registra_movimenti_lista', {
      p_lista_id: listaId,
      p_data: data,
      p_movimenti: movimenti,
      p_metodo: metodo,
    }),

  modificaMovimento: ({ id, data, descrizione, importo, metodo = null }) =>
    supabase.rpc('modifica_movimento_lista', {
      p_id: id,
      p_data: data,
      p_descrizione: descrizione,
      p_importo: importo,
      p_metodo: metodo,
    }),

  // Soft delete del movimento: resta in tabella con deleted_at valorizzato e
  // una voce nello storico.
  annullaMovimento: (id) => supabase.rpc('annulla_movimento_lista', { p_id: id }),
};

// Esegue una chiamata (query o RPC) e instrada l'esito nel Toast dell'app.
// Sostituisce la coppia `must()` + `toast()` della SPA sorgente, che scriveva
// direttamente nel div #toast. Ritorna { ok, data } così il chiamante può
// riabilitare il proprio bottone quando la scrittura fallisce.
export const runListeCall = async (dispatch, promise, successMsg) => {
  const { data, error } = await promise;
  if (error) {
    console.error('[liste]', error);
    dispatch({ type: 'SHOW_TOAST', payload: { type: 'error', message: `Errore: ${error.message}` } });
    return { ok: false, data: null };
  }
  if (successMsg) {
    dispatch({ type: 'SHOW_TOAST', payload: { type: 'success', message: successMsg } });
  }
  return { ok: true, data };
};

// ─── formattazione (identica alla SPA sorgente) ───────────────────────────
export const eur = (v) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(v || 0);

// Le date dei movimenti sono `date` (YYYY-MM-DD), non timestamp: vanno
// formattate a mano. new Date("2026-07-28") sarebbe interpretata come UTC e
// in Italia potrebbe rendere il giorno precedente.
export const fmtDate = (d) => {
  if (!d) return '';
  const [y, m, g] = String(d).split('-');
  return `${g}/${m}/${y}`;
};

export const todayISO = () => {
  // Data locale, non `toISOString()`: quest'ultima è in UTC e dopo le 22:00
  // (ora legale italiana) proporrebbe il giorno dopo come data di default.
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// Soglia di tolleranza sul saldo: gli importi sono numeric(12,2), sotto mezzo
// centesimo il saldo si considera in pari (evita "-0,00 €" in rosso).
export const EPS = 0.004;

export const saldoClass = (v) => (v > EPS ? 'pos' : v < -EPS ? 'neg' : 'zero');

export const METODI = ['', 'pos', 'bonifico', 'contanti', 'assegno', 'altro'];

export const ACTION_LABELS = {
  lista_creata: 'ha creato la lista',
  lista_modificata: 'ha modificato i dati della lista',
  lista_chiusa: 'ha segnato la lista ESAURITA',
  lista_riaperta: 'ha riaperto la lista',
  lista_archiviata: 'ha spostato la lista nel cestino',
  lista_ripristinata: 'ha ripristinato la lista dal cestino',
  movimento_aggiunto: 'ha registrato un movimento',
  movimento_modificato: 'ha modificato un movimento',
  movimento_eliminato: 'ha eliminato un movimento',
};

export const actionLabel = (a) => ACTION_LABELS[a] || a;

// Converte l'importo digitato ("12,50" o "12.50") nel numero con segno atteso
// dalla RPC. Ritorna null se non è un importo valido (zero incluso: la RPC lo
// rifiuta comunque con check_violation, ma qui evitiamo il round-trip).
export const parseImporto = (raw, segno = 1) => {
  const n = parseFloat(String(raw ?? '').replace(',', '.'));
  if (!n || Number.isNaN(n)) return null;
  return Math.abs(n) * (segno < 0 ? -1 : 1);
};
