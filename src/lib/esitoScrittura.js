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

// ─── IL RIFIUTO CHE ARRIVA PRIMA DEL DATABASE (A-1 dell'audit del 4 settembre)
//
// `RIFIUTO_RLS` qui sopra è «il database ha detto di no». Questo è il suo
// gemello a monte: «il client ha detto di no, senza nemmeno chiedere» — il
// guard di una entry del registry, o ADMIN_ONLY_ACTIONS, che respingono
// l'azione in hooks/useSyncedDispatch.js prima di toccare la rete.
//
// PERCHÉ SERVIVA UN ERRORE E NON BASTAVA IL TOAST. Su quel percorso
// `useSyncedDispatch` ritornava `{ error: null }`, cioè la stessa risposta di
// una scrittura RIUSCITA. Il reducer alzava (e alza) il toast di rifiuto, ma
// chi ATTENDE l'esito legge `error` — e `useSalvataggio`, che è il modo in cui
// quindici form dell'app decidono se chiudersi, davanti a `null` chiamava
// `alSuccesso()`. Il risultato, verificato su ClientiView → ClienteModal: un
// agente disattivato mentre la scheda è aperta compila il form, preme Salva, e
// **la modale si chiude buttando via quanto ha scritto** — con un toast rosso
// a dirlo e nessun modo di recuperare i dati.
//
// L'altro registry dell'app lo faceva già giusto: `useListeWrite` in
// components/liste/listePersistence.js, davanti a un guard che nega, ritorna
// `{ ok: false, data: null }`. Non è una novità di disegno, è la stessa
// risposta data due volte in modo diverso — e A-1 è il posto in cui la
// versione sbagliata ha vinto.
//
// PERCHÉ È DISTINGUIBILE (`name`) E NON UN ERRORE QUALUNQUE. Un rifiuto di
// permesso e un guasto di scrittura chiedono al form la stessa cosa (non
// chiuderti) ma non lo stesso messaggio: «riprova» è un consiglio giusto per
// il secondo e sbagliato per il primo, dove riprovare fallirà identico. Il
// `name` è ciò che permette a `useSalvataggio` di tacere e lasciar parlare il
// toast del reducer, invece di aggiungere un secondo messaggio che contraddice
// il primo — la stessa distinzione che `meta.compensazione` fa nel reducer per
// i toast di una compensazione.
export const NOME_PERMESSO_NEGATO = "PermessoNegato";

/**
 * L'errore da restituire a chi attende l'esito di un'azione respinta dai
 * permessi lato client.
 *
 * @param {string} [messaggio] il motivo, se il chiamante ne ha uno più preciso.
 * @returns {Error}
 */
export const erroreDiPermesso = (messaggio = "non hai i permessi per questa azione") => {
  const e = new Error(messaggio);
  e.name = NOME_PERMESSO_NEGATO;
  return e;
};

/**
 * Riconosce l'errore qui sopra. Deliberatamente tollerante sul tipo: `error`
 * non è sempre un `Error` — `useSalvataggioLista` ci mette `true`, e il data
 * layer un oggetto di PostgREST — quindi la domanda va posta in modo che un
 * valore qualunque risponda «no» invece di sollevare.
 *
 * @param {unknown} err
 */
export const isPermessoNegato = (err) =>
  typeof err === "object" && err !== null && /** @type {{name?: unknown}} */ (err).name === NOME_PERMESSO_NEGATO;
