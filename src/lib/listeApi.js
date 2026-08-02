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

// PostgREST tronca OGNI select a `db-max-rows` (1000 sui progetti Supabase)
// restituendo HTTP 200 senza errore: le righe oltre la soglia semplicemente
// non arrivano, e il chiamante non ha modo di accorgersene guardando
// `error`. Le query che devono restituire *tutto* (elenco liste, saldi,
// backup) vanno quindi paginate a mano.
const PAGE_SIZE = 1000;

// Chiedere il conteggio esatto insieme alle righe: `count` arriva dal
// Content-Range ed è il totale che soddisfa il filtro, NON il numero di righe
// consegnate. È il solo dato che dice quando la paginazione è finita senza
// dipendere dal valore del cap lato server.
const WITH_COUNT = { count: 'exact' };

// Scarica tutte le righe di una query paginando con .range().
//
// `buildQuery` deve costruire un builder NUOVO a ogni chiamata (i builder
// PostgREST sono thenable monouso) e deve avere un ordinamento
// DETERMINISTICO, cioè chiudersi su una colonna unica: senza ORDER BY stabile
// Postgres non garantisce lo stesso ordine tra due query, e pagine successive
// potrebbero ripetere o saltare righe.
// Righe per chiamata nel ripristino da backup. Tenuto basso di proposito: a
// 1000 movimenti la RPC misura ~150ms contro un tetto di 8s, così il margine
// regge anche su un'istanza carica o una connessione lenta.
const IMPORT_CHUNK_SIZE = 1000;

const chunk = (rows) => {
  const out = [];
  for (let i = 0; i < (rows?.length || 0); i += IMPORT_CHUNK_SIZE) {
    out.push(rows.slice(i, i + IMPORT_CHUNK_SIZE));
  }
  return out;
};

const fetchAllRows = async (buildQuery) => {
  const rows = [];
  for (;;) {
    const { data, count, error } = await buildQuery()
      .range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) return { data: null, error };
    const page = data || [];
    rows.push(...page);
    // Pagina vuota: il database ha finito le righe (vale anche come rete di
    // sicurezza se `count` non arrivasse, così il ciclo non è infinito).
    if (page.length === 0) return { data: rows, error: null };
    if (typeof count === 'number' && rows.length >= count) return { data: rows, error: null };
  }
};

export const ListeAPI = {
  // Liste non archiviate, più recenti in cima (l'ordinamento fine è lato client).
  list: () =>
    fetchAllRows(() => supabase.from('liste_viaggio').select(LISTA_SELECT, WITH_COUNT)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .order('id')),

  // Cestino: archiviate (soft delete), più recenti in cima.
  listTrash: () =>
    fetchAllRows(() => supabase.from('liste_viaggio').select(LISTA_SELECT, WITH_COUNT)
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false })
      .order('id')),

  // Liste di un singolo cliente: alimenta il tab dentro la scheda cliente.
  listByClient: (clientId) =>
    supabase.from('liste_viaggio').select(LISTA_SELECT)
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false }),

  get: (id) =>
    supabase.from('liste_viaggio').select(LISTA_SELECT).eq('id', id).single(),

  // Vista `liste_saldi` (security_invoker): saldo, numero movimenti e data
  // dell'ultimo movimento per ogni lista non archiviata. Una riga per lista,
  // quindi cresce insieme all'elenco: va paginata come `list()`, altrimenti
  // oltre le 1000 liste le righe in fondo mostrerebbero "0 movimenti · 0,00 €"
  // invece del saldo reale.
  saldi: () =>
    fetchAllRows(() => supabase.from('liste_saldi').select('*', WITH_COUNT).order('lista_id')),

  // Come sopra, per un solo cliente: il tab dentro la scheda cliente mostra
  // le liste di quel cliente e non ha motivo di scaricare i saldi di tutti.
  saldiByClient: (clientId) =>
    supabase.from('liste_saldi').select('*').eq('client_id', clientId),

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

  // Note interne: campo libero visibile solo al team, mai incluso nel
  // riepilogo per il cliente (vedi riepilogoTesto/RiepilogoClienteModal, che
  // non leggono `note`). note null/vuoto svuota il campo.
  modificaNote: ({ id, note }) =>
    supabase.rpc('modifica_note_lista', { p_id: id, p_note: note || null }),

  // Soft delete del movimento: resta in tabella con deleted_at valorizzato e
  // una voce nello storico.
  annullaMovimento: (id) => supabase.rpc('annulla_movimento_lista', { p_id: id }),

  // ── Cestino: hard delete e strumenti dati ──
  // Le tre RPC seguenti sono SECURITY DEFINER lato DB (bypassano la RLS di
  // proposito) e hanno un controllo di ruolo esplicito nel loro corpo:
  // elimina_lista_definitivamente/importaBackup per admin/manager/agent,
  // resetCompleto solo per admin (vedi migrazione 20260728190100). Il client
  // non duplica quel controllo se non nella UI (bottone Reset nascosto ai
  // non-admin): il gate che conta resta quello nel database.
  eliminaDefinitiva: (id) => supabase.rpc('elimina_lista_definitivamente', { p_id: id }),

  // Ripristino da backup, a blocchi.
  //
  // La RPC è UNA sola istruzione per PostgREST, quindi ricade sotto lo
  // `statement_timeout` del ruolo `authenticated`, che su questo progetto è
  // 8s. Misurato sul database reale: 5.275 movimenti si importano in ~760ms,
  // ma 42.200 in ~7,1s — cioè il tetto si tocca poco oltre le 45.000 righe, e
  // in quel punto l'intero ripristino fallisce in blocco. Sarebbe il momento
  // peggiore per scoprirlo: si ripristina un backup dopo un disastro.
  //
  // Spezzare il payload tiene ogni chiamata a una frazione del limite,
  // qualunque sia la dimensione del backup. Si perde l'atomicità del "tutto o
  // niente", ma non è una perdita: la RPC è un merge per id con ON CONFLICT
  // DO NOTHING e non cancella mai nulla, quindi è idempotente — se una
  // chiamata fallisce, quelle già andate a buon fine restano valide e basta
  // ricaricare lo stesso file per riprendere da dove si era interrotto.
  //
  // `onProgress({ done, total })` è opzionale: serve alla UI per non restare
  // muta durante un ripristino lungo.
  importaBackup: async (payload, onProgress = null) => {
    // L'ordine è obbligato dai controlli di integrità dentro la RPC: scarta
    // le liste il cui client_id non esiste ancora e i movimenti la cui lista
    // non esiste. Clienti, poi liste, poi movimenti — mai mescolati.
    const steps = [
      ...chunk(payload.clients).map((rows) => ({ clients: rows, liste: [], movimenti: [] })),
      ...chunk(payload.liste).map((rows) => ({ clients: [], liste: rows, movimenti: [] })),
      ...chunk(payload.movimenti).map((rows) => ({ clients: [], liste: [], movimenti: rows })),
    ];

    const totale = (payload.clients?.length || 0) + (payload.liste?.length || 0)
      + (payload.movimenti?.length || 0);
    const totali = { clients_added: 0, liste_added: 0, movimenti_added: 0 };
    let fatte = 0;

    for (const p_data of steps) {
      const { data, error } = await supabase.rpc('importa_backup', { p_data });
      if (error) {
        // Errore a metà strada: i blocchi precedenti sono già stati scritti e
        // restano validi. Il messaggio deve dirlo, altrimenti l'utente crede
        // di dover ripulire a mano prima di riprovare.
        return {
          data: null,
          error: fatte === 0 ? error : {
            ...error,
            message: `${error.message} — importate ${fatte} righe su ${totale} prima dell'errore. `
              + 'I dati già caricati restano validi: ricarica lo stesso file per riprendere.',
          },
        };
      }
      totali.clients_added += data?.clients_added || 0;
      totali.liste_added += data?.liste_added || 0;
      totali.movimenti_added += data?.movimenti_added || 0;
      fatte += p_data.clients.length + p_data.liste.length + p_data.movimenti.length;
      onProgress?.({ done: fatte, total: totale });
    }

    return { data: totali, error: null };
  },

  resetCompleto: (conferma) => supabase.rpc('reset_completo', { p_conferma: conferma }),

  // Dati grezzi per il backup JSON scaricabile: le stesse tre tabelle che
  // esportava la SPA sorgente. Non passa da una RPC: sono semplici SELECT,
  // già coperte dalla RLS del modulo (admin/manager/agent).
  //
  // Le tre query DEVONO essere paginate: un backup troncato a 1000 righe si
  // scarica senza errori e sembra completo (il toast conta le righe del file,
  // non quelle del database), ma ripristinato dopo un reset totale
  // riporterebbe indietro solo una frazione dei movimenti. Ordinamento su
  // `id` perché è unico: è quello che rende le pagine stabili.
  backupData: async () => {
    const [rClients, rListe, rMovimenti] = await Promise.all([
      fetchAllRows(() => supabase.from('clients').select('*', WITH_COUNT).order('id')),
      fetchAllRows(() => supabase.from('liste_viaggio').select('*', WITH_COUNT).order('id')),
      fetchAllRows(() => supabase.from('movimenti_lista').select('*', WITH_COUNT).order('id')),
    ]);
    const failed = [rClients, rListe, rMovimenti].find((r) => r.error);
    if (failed) return { data: null, error: failed.error };
    return {
      data: {
        clients: rClients.data || [],
        liste: rListe.data || [],
        movimenti: rMovimenti.data || [],
      },
      error: null,
    };
  },
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
  lista_note_modificata: 'ha modificato le note interne',
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

// ─── export "copia agente" (Word) e riepilogo cliente (SPA sorgente) ──────
// Qui si costruisce HTML come stringa (non JSX): a differenza del rendering
// React, non c'è escaping automatico, quindi va fatto a mano prima di
// interpolare testo libero (descrizione, nome cliente...) nel markup.
const escHtml = (s) => (s ?? '').toString().replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

// Documento a uso interno (Word/.doc via HTML con namespace `w:`): include
// metodo di pagamento e, se passato lo storico, il registro di chi ha
// modificato cosa e quando. Il riepilogo per il cliente è un'altra cosa
// (niente metodi di pagamento, niente storico): vedi riepilogoTesto.
export const docHtml = (lista, movimenti, storico, usersById = {}) => {
  const rows = movimenti.map((m) => `
    <tr>
      <td style="width:90px">${fmtDate(m.data_movimento)}</td>
      <td>${escHtml(m.descrizione)}</td>
      <td style="width:110px;text-align:right">${Number(m.importo) < 0 ? '-' : ''}€ ${Math.abs(Number(m.importo)).toLocaleString('it-IT', { minimumFractionDigits: 2 })}</td>
      <td style="width:80px">${m.metodo ? escHtml(m.metodo.toUpperCase()) : ''}</td>
    </tr>`).join('');
  const saldo = movimenti.reduce((s, m) => s + Number(m.importo), 0);
  const storicoHtml = storico && storico.length ? `
    <h2 style="font-size:12pt;margin-top:18pt">Storico modifiche</h2>
    <table>${storico.map((h) => `
      <tr>
        <td style="width:120px;font-size:9pt">${new Date(h.created_at).toLocaleString('it-IT')}</td>
        <td style="width:110px;font-size:9pt">${escHtml(usersById[h.actor_id] || '—')}</td>
        <td style="font-size:9pt">${escHtml(actionLabel(h.action))}${h.old_value ? ` — da: ${escHtml(h.old_value)}` : ''}${h.new_value ? ` — a: ${escHtml(h.new_value)}` : ''}</td>
      </tr>`).join('')}</table>` : '';
  return `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8">
    <style>body{font-family:Calibri,Arial,sans-serif;font-size:12pt}table{border-collapse:collapse;width:100%}td{padding:4pt 6pt;border-bottom:0.5pt solid #ccc}h1{font-size:14pt}</style>
    </head><body>
    <h1>LISTA ${escHtml(lista.clients?.name || '')}</h1>
    ${lista.titolo ? `<p><i>${escHtml(lista.titolo)}</i></p>` : ''}
    <p style="font-size:9pt;color:#B23A2E;letter-spacing:.06em"><b>COPIA AGENTE — USO INTERNO</b></p>
    <table>${rows}</table>
    <p style="margin-top:14pt"><b>SALDO: € ${saldo.toLocaleString('it-IT', { minimumFractionDigits: 2 })}</b></p>
    ${lista.stato === 'esaurita' ? '<p style="color:#C0392B"><b>LISTA ESAURITA</b></p>' : ''}
    ${storicoHtml}
    <p style="font-size:9pt;color:#888">Esportato il ${new Date().toLocaleDateString('it-IT')} — Gestione Liste Viaggio</p>
    </body></html>`;
};

// Testo semplice per il riepilogo cliente (condivisione via navigator.share o
// clipboard): niente metodi di pagamento, niente storico.
export const riepilogoTesto = (lista, movimenti) => {
  const righe = movimenti.map((m) => `${fmtDate(m.data_movimento)}  ${m.descrizione}  ${eur(m.importo)}`).join('\n');
  const saldo = movimenti.reduce((s, m) => s + Number(m.importo), 0);
  return `RIEPILOGO BUONO VIAGGIO\n${lista.clients?.name || ''}${lista.titolo ? ' — ' + lista.titolo : ''}\n\n`
    + (righe || 'Nessun movimento registrato.')
    + `\n\nSALDO: ${eur(saldo)}`
    + (lista.stato === 'esaurita' ? '\n\nLISTA ESAURITA' : '');
};

// Innesca il download lato client di un Blob già pronto (doc Word, JSON di
// backup...). Stesso pattern di `downloadFile` in AdminView.jsx.
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 500);
};
