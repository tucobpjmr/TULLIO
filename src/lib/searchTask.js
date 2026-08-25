// src/lib/searchTask.js
//
// ─── M-5 (audit del 26 agosto) · IL FILTRAGGIO DELLA RICERCA AVANZATA ─────
//
// Queste funzioni stavano dentro `components/search/AdvancedSearchPanel.jsx`,
// dove erano pure ma non raggiungibili: per verificarle bisognava montare un
// pannello con sei provider, e infatti nessun test unitario le copriva.
//
// Sono le righe che promettono le due cose delicate di quel pannello: cercare
// **dentro il cestino** (casella «includi nel cestino») e **dentro le
// completate** (il corpus intero, `useStoricoTaskCompleto`). Una ricerca che
// non trova non dice «non ho cercato lì», dice «non c'è» — ed è la risposta su
// cui si decide di ricreare una task che esiste già.
//
// Nel componente resta il `useMemo`, cioè l'unica cosa che dipende da React.
import { indicizza, matchIndice, terminiRicerca } from "./searchUtils.js";
import { startOfLocalDay, endOfLocalDay } from "./taskUtils.js";

/**
 * ─── A-2 · l'indice dipende dalla RIGA, non dalla query ───────────────────
 * (audit performance/UX del 19 agosto)
 *
 * Questo era l'ultimo call site rimasto con `matchTermini`, cioè con la
 * normalizzazione rifatta per ogni riga a ogni battuta. Ed è il call site dove
 * pesa di più, per due ragioni che si sommano: questo pannello chiede lo
 * storico INTERO, quindi guarda anche completate e cestino, e fra i campi ci
 * sono i COMMENTI, che sono un array per riga.
 *
 * Misurato sulla funzione reale, media su 20 esecuzioni: 6,21 ms per battuta
 * su 292 task (la produzione al 17 agosto) contro 0,18 con l'indice; 49,25
 * contro 1,47 su 2500, cioè dove arriva questa installazione in circa un anno
 * al ritmo attuale di ~5,6 task al giorno. Su un telefono di fascia media sono
 * 3-5×, e stanno tutti fra il tasto premuto e il carattere che compare.
 *
 * ⚠️ Il chiamante deve memoizzarlo sul solo CORPUS: l'indice si ricostruisce
 * quando cambiano i task, non quando cambia ciò che si digita.
 *
 * @param {object[]} tasks
 * @returns {{t: object, idx: object}[]}
 */
export function indicizzaTask(tasks) {
  return (tasks || []).map(t => ({
    t,
    idx: indicizza(t.title, t.description, t.client, t.praticaRef,
      (t.comments || []).map(c => c.text || "")),
  }));
}

/**
 * Le task che passano i filtri, ordinate per scadenza crescente.
 *
 * @param {{t: object, idx: object}[]} indice da `indicizzaTask`
 * @param {{dateFrom?: string, dateTo?: string, cats?: string[], stats?: string[],
 *          agents?: string[], includeTrashed?: boolean}} filtri
 * @param {string} keyword
 * @returns {object[]}
 */
export function filtraTask(indice, filtri, keyword) {
  const { dateFrom, dateTo, cats = [], stats = [], agents = [], includeTrashed = false } = filtri || {};
  const termini = terminiRicerca(keyword);
  const from = startOfLocalDay(dateFrom);
  const to = endOfLocalDay(dateTo);

  return (indice || []).filter(({ t, idx }) => {
    // I filtri STRUTTURALI restano davanti al confronto testuale: scartano una
    // riga con un'uguaglianza, e ogni riga che cade qui è un `matchIndice`
    // risparmiato. L'ordine era già questo e non è un dettaglio dell'indice.
    if (!includeTrashed && t.deletedAt) return false;
    if (cats.length && !cats.includes(t.category)) return false;
    if (stats.length && !stats.includes(t.status)) return false;
    if (agents.length && !(t.assignees || []).some(a => agents.includes(a))) return false;
    // Una task SENZA scadenza non entra in un filtro per periodo: «dal 1° al 30»
    // è una domanda sulle date, e «nessuna data» non è una data dentro
    // l'intervallo.
    if (from) {
      if (!t.dueDate) return false;
      if (new Date(t.dueDate) < from) return false;
    }
    if (to) {
      if (!t.dueDate) return false;
      if (new Date(t.dueDate) > to) return false;
    }
    // Normalizzazione condivisa con anagrafica e liste (lib/searchUtils.js): il
    // campo `client` del task è il nome dell'anagrafica, e deve trovarsi
    // digitandolo come lo si digita là. `matchIndice` è la stessa semantica di
    // `matchTermini` — sono definite una sopra l'altra proprio perché non
    // possano divergere.
    return matchIndice(termini, idx);
  }).map(r => r.t).sort(perScadenzaCrescente);
}

/** Le task senza scadenza vanno in FONDO, non in testa: `null` non è «presto». */
const perScadenzaCrescente = (a, b) => {
  if (!a.dueDate && !b.dueDate) return 0;
  if (!a.dueDate) return 1;
  if (!b.dueDate) return -1;
  return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
};
