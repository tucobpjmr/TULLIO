// src/lib/pagination.js
// Come si legge da PostgREST una tabella che deve arrivare INTERA.
//
// PERCHÉ ESISTE COME MODULO A SÉ. PostgREST tronca ogni `select` a
// `db-max-rows` (1000 sui progetti Supabase) restituendo **HTTP 200 senza
// errore**: le righe oltre la soglia semplicemente non arrivano, e il
// chiamante non ha modo di accorgersene guardando `error`. È la classe di
// difetto peggiore che questo data layer possa avere, perché quando si
// verifica non sbaglia — omette, e in silenzio.
//
// Questa logica esisteva già, ma solo dentro `lib/listeApi.js`, dove serviva
// per liste_viaggio (616 righe) e movimenti_lista (5.320). `Clients.list()`
// non ce l'aveva, e la tabella `clients` è a 818 righe: a meno di 200 dal cap
// (rilievo ST-3 di docs/AUDIT_STRUTTURA_2026-08-10.md). Promuoverla da
// funzione privata di un modulo a modulo condiviso è ciò che rende la
// correzione un riuso invece del terzo posto in cui la stessa regola è
// scritta.
//
// Vive in un file suo e non in `lib/api.js` per non accoppiare il modulo
// Liste al data layer del core: `listeApi.js` importa da qui, non da lì.

// Righe per pagina. Coincide con il default di `db-max-rows` di proposito: è
// la pagina più grande che il server può comunque consegnare.
export const PAGE_SIZE = 1000;

// Chiedere il conteggio esatto insieme alle righe: `count` arriva dal
// Content-Range ed è il totale che soddisfa il filtro, NON il numero di righe
// consegnate. È il solo dato che dice quando la paginazione è finita senza
// dipendere dal valore del cap lato server — che su Supabase vive nella
// configurazione di piattaforma e non è leggibile né da SQL né dalle API di
// gestione.
export const WITH_COUNT = { count: 'exact' };

/**
 * Scarica TUTTE le righe di una query, paginando con `.range()`.
 *
 * `buildQuery` deve costruire un builder NUOVO a ogni chiamata (i builder
 * PostgREST sono thenable monouso) e deve avere un ordinamento
 * DETERMINISTICO, cioè chiudersi su una colonna unica: senza un ORDER BY
 * stabile Postgres non garantisce lo stesso ordine fra due query, e pagine
 * successive potrebbero ripetere o saltare righe.
 *
 * @param {() => object} buildQuery
 * @returns {Promise<{ data: object[]|null, error: object|null }>}
 */
export const fetchAllRows = async (buildQuery) => {
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
