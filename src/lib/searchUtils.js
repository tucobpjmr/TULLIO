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
// clienti è `chiaveCliente` in lib/chiaveCliente.js, che di proposito NON
// riordina le parole: lì scambiare l'ordine fonderebbe le liste di due persone
// diverse, qui allarga soltanto ciò che l'utente riesce a trovare.
//
// M-4 (audit del 25 agosto): quella differenza ora è l'UNICA, ed è visibile nel
// codice invece che promessa in un commento. `normalizzaTesto` NON riscrive la
// normalizzazione — è la chiave d'identità in minuscolo — e la tolleranza
// sull'ordine delle parole è il solo strato che la ricerca aggiunge sopra
// (`terminiRicerca` + `matchIndice`). Finché erano due funzioni scritte a mano
// la promessa era falsa: questa toglieva la punteggiatura e `chiaveNome` no.

import { chiaveCliente } from './chiaveCliente.js';

// Accenti, maiuscole e punteggiatura sono già ciò che `chiaveCliente` toglie:
// apostrofi (compreso il ’ tipografico, che sulle tastiere mobili sostituisce
// l'apice e da solo bastava a non far trovare più nulla), punti, trattini, "°"
// e la punteggiatura in genere escono dal confronto. Qui resta solo il
// minuscolo, che è la convenzione con cui i termini digitati arrivano.
export const normalizzaTesto = (s) => chiaveCliente(s).toLowerCase();

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
//
// ─── M-3 · l'indice dipende dalla RIGA, non dalla query ────────────────────
// La semantica sopra è definita in un punto solo, ma in DUE funzioni, e la
// divisione è la correzione di M-3 (audit performance/UX del 16 agosto,
// secondo passaggio). `matchTermini` normalizzava i campi a ogni confronto:
// per ogni riga, per ogni campo, un `normalize('NFD')` più due `replace` con
// regex Unicode, e una seconda stringa senza spazi. Il filtro delle viste gira
// dentro un `useMemo` che dipende dal testo digitato, quindi quel lavoro si
// rifaceva PER INTERO a ogni battuta, su tutte le righe: misurato su
// un'anagrafica delle dimensioni di quella di produzione (835 righe, 5 campi),
// 6,32 ms per battuta contro 0,19 ms con l'indice precalcolato (−97%).
//
// La normalizzazione però non dipende da ciò che si digita: dipende dalla riga.
// `indicizza` la calcola una volta per riga (quando cambiano i dati), e
// `matchIndice` confronta i termini con il risultato. `matchTermini` resta per
// i call site che hanno una riga sola da confrontare e non un elenco da
// indicizzare, ed è scritta SOPRA le altre due — così le regole (apostrofi,
// ordine delle parole, cognomi elisi) restano definite in un punto solo, e i
// test esistenti su quelle regole sono anche il modo di verificare che
// l'indice non le abbia cambiate.
//
// L'indice di una riga: il testo normalizzato dei suoi campi più la variante
// senza spazi. `attaccato` è precalcolato per la stessa ragione del resto —
// era un `replace` per riga per battuta.
export const indicizza = (...campi) => {
  const testo = campi.flat().map(normalizzaTesto).filter(Boolean).join(' ');
  // Il confronto sul testo senza spazi allarga di proposito: un termine può
  // accavallarsi su due parole ("rossimaria" trova "ROSSI MARIA"). È il prezzo
  // dei cognomi elisi, ed è un falso positivo innocuo — chi digita così sta
  // comunque cercando quella scheda. I termini restano tutti obbligatori.
  return { testo, attaccato: testo.replace(/ /g, '') };
};

export const matchIndice = (termini, idx) => {
  if (!termini.length) return true;
  if (!idx.testo) return false;
  return termini.every((t) => idx.testo.includes(t) || idx.attaccato.includes(t));
};

export const matchTermini = (termini, ...campi) => {
  // Il controllo qui PRIMA di indicizzare non è una ripetizione di quello in
  // `matchIndice`: senza, una query vuota pagherebbe la normalizzazione di
  // tutti i campi per poi rispondere `true` comunque.
  if (!termini.length) return true;
  return matchIndice(termini, indicizza(...campi));
};
