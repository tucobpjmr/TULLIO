// src/lib/chiaveCliente.js
// M-4 dell'audit del 25 agosto · LA chiave d'identità di un cliente.
//
// PERCHÉ ESISTE. «Questi due nomi sono la stessa persona?» è una domanda di
// dominio che l'app si pone in quattro punti — la rinomina in anagrafica, il
// legame testuale fra task e cliente, la deduplica dell'import Excel e quella
// dello script che converte le liste viaggio storiche — e aveva quattro
// risposte scritte a mano:
//
//   lib/clientNotes.js       `chiaveNome`     maiuscole, accenti, spazi doppi
//   ClientImportModal.jsx    `normName`       come sopra, ma in minuscolo
//   importa-liste/parser.js  `chiaveCliente`  come sopra, PIÙ la punteggiatura
//   lib/searchUtils.js       `normalizzaTesto` come parser.js, in minuscolo
//
// Le prime tre si dichiaravano gemelle («maiuscole, accenti e spazi doppi non
// distinguono due clienti», diceva il commento di clientNotes.js) e non lo
// erano: la punteggiatura le divideva in due famiglie. Su questa anagrafica
// non è un dettaglio teorico — è nata dalla fusione di due popolazioni e
// contiene "D'AMATO PATRIZIA", "DELL'ACQUA CARLO", "FAM. SCURO TEODORO",
// "50° RICCARDO SCAMARCIO" (vedi searchUtils.js, che quel censimento l'ha già
// fatto). Lo script considerava "FAM. SCURO TEODORO" e "FAM SCURO TEODORO" lo
// stesso cliente e riusava il suo id; l'app li considerava due persone diverse
// e la scheda dell'una non mostrava i task dell'altra.
//
// LA REGOLA, una sola: maiuscole, accenti, punteggiatura e spazi doppi NON
// distinguono due clienti. È la più larga delle due famiglie, ed è la scelta
// giusta perché sbaglia in una direzione sola — può unire due schede che un
// operatore separerebbe, mai spezzare in due un cliente che è uno.
//
// ⛔ NON riordina le parole, e non è una dimenticanza: "ROSSI MARIO" resta
// diverso da "MARIO ROSSI". In un'anagrafica dove l'ordine cognome/nome non è
// una regola (convivono "COLUCCI GIANNICOLA" e "ELENA GIANCIPPOLI"), fonderli
// d'ufficio unirebbe le liste di due persone diverse in caso di omonimia
// parziale. Il riordino vive un livello sopra, nella RICERCA
// (`terminiRicerca`/`matchIndice` in searchUtils.js): lì allarga soltanto ciò
// che l'utente riesce a trovare, e non decide chi è chi.
//
// Questo è quindi l'UNICO asse su cui identità e ricerca differiscono, ed è
// visibile nel codice: `normalizzaTesto` è questa stessa funzione in
// minuscolo, e la ricerca ci costruisce sopra la tolleranza sull'ordine.

// Combining marks lasciati da `normalize('NFD')`: scritti come escape e non
// come caratteri letterali, che nel sorgente sono invisibili.
const DIACRITICI = /[̀-ͯ]/g;

/**
 * La chiave d'identità di un nome cliente. Due nomi sono lo stesso cliente se
 * e solo se hanno la stessa chiave.
 *
 * @param {string|null|undefined} nome
 * @returns {string} chiave normalizzata ('' per un nome vuoto: non identifica
 *   nessuno, e i chiamanti la trattano come "nessun cliente")
 */
export const chiaveCliente = (nome) => String(nome ?? '')
  .normalize('NFD').replace(DIACRITICI, '')
  .toUpperCase()
  // Tutto ciò che non è lettera o cifra diventa spazio: apostrofi (compreso il
  // ’ tipografico, che sulle tastiere mobili sostituisce l'apice), punti,
  // trattini, virgole, "°" e la punteggiatura in genere.
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

/**
 * Task collegati a un cliente PER NOME. `tasks.client_id` è testo libero, non
 * una foreign key: il legame regge finché le due chiavi coincidono, quindi
 * rinominare il cliente in modo non equivalente lo spezza in silenzio. Chi
 * rinomina deve saperlo, e il rename deve poter portarsi dietro i task (vedi
 * RENAME_CLIENT_IN_TASKS in state/reducer.js).
 *
 * Sta qui e non in clientNotes.js — dove è vissuta finché la chiave stava lì —
 * perché è il consumatore diretto della chiave, non una lettura delle note.
 */
export const tasksDelCliente = (tasks, name) => {
  const k = chiaveCliente(name);
  if (!k) return [];
  return (tasks || []).filter((t) => chiaveCliente(t.client) === k);
};
