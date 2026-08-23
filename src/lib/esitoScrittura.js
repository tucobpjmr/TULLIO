// src/lib/esitoScrittura.js
// "Questa scrittura è andata a buon fine?" — una definizione sola, per tutti e
// tre i registry di scrittura dell'app.
//
// TRE REGISTRY, QUATTRO SUPERFICI (A-1 dell'audit del 23 agosto, secondo
// passaggio). Esiste un quarto gruppo che scrive e non è un registry: sedici
// componenti che chiamano lib/api.js direttamente per ciò che il reducer non
// può ospitare — Storage (TaskFiles, Users.uploadAvatar), Edge Function
// (Users.invite), preferenze personali, letture di pannello. Non usa questo
// modulo, e va bene così: nessuno dei suoi metodi chiede `count: 'exact'`,
// quindi non c'è alcun conteggio da leggere e `!r.error` è la risposta giusta.
//
// Il punto è che quel gruppo non era dichiarato da nessuna parte, e un elenco
// non scritto è un elenco che cresce. Ora il suo confine è una regola: i
// namespace di dominio che il registry possiede non si importano da un
// componente (VIETATE_ENTITA_DELLO_STATE in eslint.config.js), e le mutazioni
// del team restano vietate per metodo (VIETATE_MUTAZIONI_TEAM). Se domani una
// di quelle chiamate dirette dovesse mirare a UNA riga per chiave primaria, la
// regola la ferma prima che questo commento debba dire "quattro".
//
// PERCHÉ ESISTE (A-2 dell'audit del 14 agosto, terzo passaggio). La risposta a
// quella domanda non è `!res.error`, e il perché è C-1 del secondo passaggio
// dello stesso 14 agosto: una UPDATE/DELETE che la RLS rifiuta NON produce un
// errore. La clausola USING di una policy non solleva un'eccezione, rende le
// righe invisibili — la scrittura ne tocca zero e PostgREST risponde 2xx come
// per qualunque altra riuscita. L'unico modo per distinguerla è chiedere
// `count: 'exact'` (CONTA_RIGHE in lib/api.js) e leggerlo.
//
// Quella lettura era però scritta DENTRO hooks/useSyncedDispatch.js, cioè
// dentro l'orchestratore del solo core. Gli altri due sottosistemi che
// scrivono — la chat (components/chat/chatCommands.js) e il modulo Liste
// (components/liste/listePersistence.js) — hanno ciascuno il proprio
// `if (r?.error)` scritto a mano, e quindi la stessa cecità di prima di C-1.
// Il caso che rende la cosa misurabile e non teorica: `Messages.setPinned` in
// lib/api.js CHIEDE già `count: 'exact'` (fu aggiunto insieme agli altri
// sette), ma nessuno dei suoi chiamanti lo legge — il conteggio viaggia sulla
// rete a ogni pin e viene buttato via.
//
// Un contratto che vale per il data layer intero non può vivere dentro uno dei
// suoi consumatori: qui è un modulo puro, importabile dai tre registry e
// testabile da solo.

// Messaggio unico per il rifiuto silenzioso: l'utente non deve dedurre da un
// toast generico che il database ha detto di no.
export const RIFIUTO_RLS = {
  message: "operazione non consentita dal database (permessi insufficienti)",
};

/**
 * Normalizza l'esito di una scrittura supabase-js in "errore o null".
 *
 * `count` arriva SOLO dai metodi che lo hanno chiesto esplicitamente (i soli
 * che mirano a UNA riga per chiave primaria, vedi CONTA_RIGHE in lib/api.js):
 * dove non c'è, `typeof r?.count === 'number'` è falso e il comportamento
 * resta quello di sempre. L'adozione è per-metodo, non un cambiamento globale
 * del contratto.
 *
 * @param {{ error?: unknown, count?: number }|null|undefined} r
 * @returns {unknown|null} l'errore da mostrare, oppure null se è andata bene.
 */
export const esitoScrittura = (r) => {
  if (r?.error) return r.error;
  if (typeof r?.count === "number" && r.count === 0) return RIFIUTO_RLS;
  return null;
};
