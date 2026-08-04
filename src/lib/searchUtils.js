// src/lib/searchUtils.js
// Normalizzazione delle ricerche a testo libero dell'app (anagrafica clienti,
// elenco liste viaggio).
//
// Il confronto ingenuo `campo.toLowerCase().includes(query)` sembra
// sufficiente finché i dati sono puliti, ma questa anagrafica non lo è: è
// nata dalla fusione di due popolazioni diverse (schede importate dal
// gestionale e intestatari dei buoni viaggio ricavati dai documenti Word),
// quindi contiene apostrofi ("D'AMATO PATRIZIA", "DELL'ACQUA CARLO"),
// abbreviazioni con punto ("FAM. SCURO TEODORO"), gradi ("50° RICCARDO
// SCAMARCIO") e — soprattutto — l'ordine cognome/nome non è una regola:
// convivono "COLUCCI GIANNICOLA" e "ELENA GIANCIPPOLI". Con la sottostringa
// secca chi cerca "d amato", "dellacqua" o "giancippoli elena" non trova
// nulla e conclude che il dato non esista.
//
// Da qui passano SOLO le ricerche della UI. Il confronto di IDENTITÀ fra due
// clienti resta `chiaveNome` in clientNotes.js, che di proposito NON riordina
// le parole: lì scambiare l'ordine fonderebbe le liste di due persone
// diverse, qui allarga soltanto ciò che l'utente riesce a trovare.

const DIACRITICI = /[̀-ͯ]/g;

// Tutto ciò che non è lettera o cifra diventa spazio: apostrofi (compreso il
// ’ tipografico, che sulle tastiere mobili sostituisce l'apice e da solo
// bastava a non far trovare più nulla), punti, trattini, "°" e la
// punteggiatura in genere escono dal confronto.
export const normalizzaTesto = (s) => String(s ?? '')
  .normalize('NFD').replace(DIACRITICI, '')
  .toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim();

// La query digitata, spezzata nei suoi termini. Array vuoto = nessun filtro.
export const terminiRicerca = (q) => {
  const n = normalizzaTesto(q);
  return n ? n.split(' ') : [];
};

// Vero se OGNI termine compare nei campi passati (AND fra i termini, OR fra i
// campi). Le tre conseguenze sono volute:
//   • l'ordine delle parole non conta — "GIA COLUCCI" trova
//     "COLUCCI GIANNICOLA";
//   • i termini possono distribuirsi su campi diversi — "colucci massafra"
//     trova il cliente COLUCCI residente a MASSAFRA;
//   • il confronto avviene anche sul testo senza spazi, così un cognome
//     elided nell'originale si trova comunque scritto tutto attaccato
//     ("dellacqua" → "DELL'ACQUA", "damato" → "D'AMATO").
// I campi possono essere stringhe o array di stringhe (es. i nomi dei
// cointestatari di una lista); null/undefined sono ignorati.
export const matchTermini = (termini, ...campi) => {
  if (!termini.length) return true;
  const testo = campi.flat().map(normalizzaTesto).filter(Boolean).join(' ');
  if (!testo) return false;
  // Il confronto sul testo senza spazi allarga di proposito: un termine può
  // accavallarsi su due parole ("rossimaria" trova "ROSSI MARIA"). È il prezzo
  // dei cognomi elisi, ed è un falso positivo innocuo — chi digita così sta
  // comunque cercando quella scheda. I termini restano tutti obbligatori.
  const attaccato = testo.replace(/ /g, '');
  return termini.every((t) => testo.includes(t) || attaccato.includes(t));
};
