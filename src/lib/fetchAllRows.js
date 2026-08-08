// src/lib/fetchAllRows.js
// Helper condiviso per scaricare TUTTE le righe di una query paginando con
// `.range()`, invece di affidarsi al default di PostgREST: ogni select viene
// troncato a `db-max-rows` (1000 sui progetti Supabase) restituendo HTTP 200
// senza errore, e il chiamante non ha modo di accorgersene guardando
// `error`. Usato da `lib/listeApi.js` e `lib/api.js` per le query che devono
// restituire *tutto* (elenco liste, saldi, backup, anagrafica clienti).
const PAGE_SIZE = 1000;

// Chiedere il conteggio esatto insieme alle righe: `count` arriva dal
// Content-Range ed è il totale che soddisfa il filtro, NON il numero di righe
// consegnate. È il solo dato che dice quando la paginazione è finita senza
// dipendere dal valore del cap lato server.
export const WITH_COUNT = { count: 'exact' };

// `buildQuery` deve costruire un builder NUOVO a ogni chiamata (i builder
// PostgREST sono thenable monouso) e deve avere un ordinamento
// DETERMINISTICO, cioè chiudersi su una colonna unica: senza ORDER BY stabile
// Postgres non garantisce lo stesso ordine tra due query, e pagine successive
// potrebbero ripetere o saltare righe.
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
