// src/lib/searchListe.js
//
// ─── M-5 (audit del 26 agosto) · LA RICERCA DEL CORE SULLE LISTE ──────────
//
// Estratte da `components/search/AdvancedSearchPanel.jsx` per la stessa
// ragione dei task (vedi `searchTask.js`): erano pure e non raggiungibili.
//
// ⚠️ STANNO IN `lib/` E NON NEL MODULO LISTE, ed è il confine a deciderlo: è
// la ricerca che il CORE fa sulle liste, su oggetti già ottenuti dalla
// facciata `components/liste/listeModuleApi.js`. Per questo `indicizzaListe`
// riceve l'estrattore dei cointestatari come ARGOMENTO invece di importarlo:
// così questo modulo non conosce né `listeApi.js` (che gli sarebbe vietato) né
// la facciata, e resta verificabile senza toccare il modulo Liste.
import { indicizza, matchIndice, terminiRicerca } from "./searchUtils.js";

/**
 * ⚠️ NON è `indicizzaLista` di `liste/listeOrdinamento.js`, e la differenza è
 * voluta: là i campi sono tre (titolare, titolo, cointestatari), qui sono
 * quattro — c'è anche `note`, perché la ricerca globale è il punto in cui si
 * cerca dentro tutto e le note interne di una lista sono un posto dove la
 * gente scrive il nome di un cliente. Riusare l'altra funzione qui
 * RESTRINGEREBBE questa ricerca. `indicizza` è comunque la stessa primitiva,
 * quindi la semantica — accenti, apostrofi, ordine delle parole — resta una.
 *
 * @param {object[]} liste
 * @param {(l: object) => string[]} beneficiari i cointestatari di una lista
 * @returns {{l: object, idx: object}[]}
 */
export function indicizzaListe(liste, beneficiari) {
  return (liste || []).map(l => ({
    l,
    idx: indicizza(l.clients?.name, l.titolo, l.note, beneficiari(l)),
  }));
}

/**
 * Le liste che passano i filtri, ordinate per nome del titolare.
 *
 * Categoria, agente e scadenza non hanno un equivalente sulle liste: i filtri
 * sono keyword, stato, cliente e cestino.
 *
 * @param {{l: object, idx: object}[]} indice da `indicizzaListe`
 * @param {{listeStati?: string[], listeClienti?: string[], includeTrashed?: boolean}} filtri
 * @param {string} keyword
 * @returns {object[]}
 */
export function filtraListe(indice, filtri, keyword) {
  const { listeStati = [], listeClienti = [], includeTrashed = false } = filtri || {};
  const termini = terminiRicerca(keyword);

  return (indice || []).filter(({ l, idx }) => {
    if (!includeTrashed && l.deleted_at) return false;
    if (listeStati.length && !listeStati.includes(l.stato)) return false;
    if (listeClienti.length && !listeClienti.includes(l.clients?.name)) return false;
    // I COINTESTATARI contano: una lista intestata a ROSSI con BIANCHI
    // cointestataria è anche di BIANCHI, e nel modulo Liste cercando "BIANCHI"
    // si trova. Qui non si trovava — stessa ricerca, due esiti diversi, e il
    // posto dove l'utente si aspetta di trovare tutto è proprio questo.
    return matchIndice(termini, idx);
  }).map(r => r.l)
    .sort((a, b) => (a.clients?.name || "").localeCompare(b.clients?.name || "", "it"));
}
