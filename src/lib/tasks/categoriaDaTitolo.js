// src/lib/tasks/categoriaDaTitolo.js
// «Se il titolo dice "volo", la categoria è biglietteria»: la tassonomia che
// suggerisce una categoria a partire dal testo digitato.
//
// PERCHÉ È USCITA DA QuickAddTask.jsx (B-2, audit del 25 agosto). Non è una
// scelta di presentazione: è una regola di dominio dell'agenzia, con lo stesso
// status di quelle in `lib/permissions.js` — dice come questa agenzia
// classifica il proprio lavoro. Viveva dentro il componente che la usa per
// primo, e le conseguenze erano tre:
//
//   • per leggere che cosa l'app considera «biglietteria» bisognava aprire un
//     file di 300 righe di JSX e cercarla fra gli stili;
//   • non era esercitabile da sola — l'unico modo di verificare che "navetta"
//     finisse in `transfer` era montare la modale e digitare;
//   • il secondo percorso di creazione che volesse suggerire una categoria
//     avrebbe copiato l'elenco, che è esattamente come nascono le divergenze
//     che M-4 ha appena chiuso sull'anagrafica clienti.
//
// ⚠️ IL PRIMO MATCH VINCE, e l'ordine è quindi parte della regola, non una
// preferenza di scrittura. "documenti sanitari per il volo" deve dare `visa` e
// non `booking`: `visa` sta più in alto proprio per questo. Chi aggiunge una
// parola nuova deve chiedersi non solo «a quale categoria appartiene» ma anche
// «quali altre voci potrebbe rubare», e il posto in cui rispondere è
// src/test/categoriaDaTitolo.test.js.
//
// ⚠️ LE PAROLE SONO PREFISSI, non parole intere: il confronto è `includes`, e
// molte voci lo sfruttano di proposito ("pagament" prende pagamento/pagamenti,
// "bigliett" prende biglietto/biglietteria/biglietti). Per la ragione opposta
// alcune portano uno spazio in coda ("ncc ", "bus ", "tour ", "post "): senza,
// "ncc" pescherebbe dentro parole che lo contengono per caso. Lo spazio è
// significativo — non è una svista di formattazione.

/**
 * Titoli più corti di così non contengono abbastanza segnale: "tour" da solo
 * arriva a quattro caratteri, meno di così si sta ancora digitando.
 */
const LUNGHEZZA_MINIMA = 4;

/**
 * L'ordine è la regola: la prima voce che trova un riscontro vince.
 */
export const CATEGORIE_PER_PAROLA = [
  { cat: "transfer",    words: ["transfer", "navetta", "shuttle", "ncc "] },
  // Sopra `booking` di proposito: "documenti sanitari per il volo" è una
  // pratica di visti, non una prenotazione.
  { cat: "visa",        words: ["visto", "passaporto", "visa", "documenti sanitar", "document"] },
  { cat: "booking",     words: ["volo", "voli", "aereo", "aerei", "bigliett", "compagnia aerea", "flight"] },
  { cat: "itinerary",   words: ["itinerario", "programma viaggio", "tappe", "tour ", "percorso", "preventivo", "hotel", "albergo", "resort", "villa", "bed ", "bungalow", "ryokan", "appartament", "ospitalit"] },
  { cat: "payment",     words: ["pagament", "acconto", "saldo", "fattura", "bonifico", "invoice", "polizza", "tariffa", "fornitore", "contratto", "accordo", "autobus", "bus "] },
  { cat: "client",      words: ["cliente", "followup", "follow-up", "chiamata", "contatto", "scadenza opt", "opzione"] },
  { cat: "appointment", words: ["appuntamento", "appointment", "meeting", "incontro"] },
  { cat: "marketing",   words: ["newsletter", "social", "post ", "campagna", "promo", "pubblicità", "instagram", "facebook"] },
  { cat: "admin",       words: ["check-in", "checkin", "check in", "riunione", "agenda", "report", "log ", "amministrazion"] },
];

/**
 * La categoria suggerita per un titolo, o `null` se nessuna regola scatta.
 *
 * `categorieDisponibili` è il dizionario delle categorie che il RUOLO di chi
 * scrive può usare (`getAvailableCategories`): suggerire una categoria che poi
 * il campo non offre sarebbe un suggerimento che l'utente non può accettare.
 *
 * @param {string|null|undefined} titolo
 * @param {Record<string, unknown>} categorieDisponibili
 * @returns {string|null}
 */
export function categoriaDaTitolo(titolo, categorieDisponibili = {}) {
  const testo = (titolo || "").toLowerCase();
  if (testo.length < LUNGHEZZA_MINIMA) return null;
  for (const { cat, words } of CATEGORIE_PER_PAROLA) {
    if (!categorieDisponibili[cat]) continue;
    if (words.some((w) => testo.includes(w))) return cat;
  }
  return null;
}
