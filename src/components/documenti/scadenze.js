// src/components/documenti/scadenze.js
// Lo stato di un documento rispetto alla sua data di scadenza, e il filtro
// dell'elenco che ne discende. Funzioni pure: nessun accesso al DOM, nessuna
// lettura dello stato globale, `oggi` passato dal chiamante.
//
// ─── PERCHÉ `oggi` È UN PARAMETRO ───────────────────────────────────────────
// Perché "fra 40 giorni" dipende da quando lo si chiede, e una funzione che
// legge `new Date()` da sé non è verificabile: il test dovrebbe o congelare
// l'orologio globale o costruire date relative a `now`, cioè riscrivere il
// calcolo che sta verificando. Il chiamante passa la data una volta per
// render; qui resta una funzione di due argomenti.

// Soglia dell'avviso. 180 giorni non è arbitrario: molti paesi extra-Schengen
// (fra cui Stati Uniti, Egitto, Thailandia, Emirati) esigono un passaporto
// valido almeno SEI MESI oltre la data di ingresso. Un documento che scade fra
// cinque mesi è formalmente valido e praticamente inutilizzabile per metà
// delle destinazioni vendute: è quello il momento in cui l'agenzia deve
// saperlo, non il giorno della scadenza.
export const GIORNI_AVVISO = 180;

const MS_GIORNO = 24 * 60 * 60 * 1000;

/**
 * Giorni che mancano alla scadenza. Negativo se è già passata, `null` se il
 * documento non ha una data.
 *
 * Il conto si fa a MEZZANOTTE UTC di entrambe le date, non sull'istante: un
 * documento che scade oggi deve dire «scade oggi» sia alle 9 sia alle 23, e
 * una differenza di millisecondi divisa per un giorno darebbe 0 la mattina e
 * −0,6 la sera, cioè due risposte diverse alla stessa domanda nello stesso
 * giorno.
 *
 * @param {string|null|undefined} scadenza  data ISO `YYYY-MM-DD`
 * @param {Date} oggi
 * @returns {number|null}
 */
export function giorniAllaScadenza(scadenza, oggi) {
  if (!scadenza) return null;
  const fine = new Date(`${String(scadenza).slice(0, 10)}T00:00:00Z`).getTime();
  if (Number.isNaN(fine)) return null;
  const inizio = Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), oggi.getUTCDate());
  return Math.round((fine - inizio) / MS_GIORNO);
}

/**
 * Lo stato del documento: `scaduto`, `inScadenza`, `valido`, o `senzaData`.
 *
 * `senzaData` è uno stato a sé e non un sinonimo di `valido`: un documento di
 * cui non sappiamo la scadenza non è un documento valido, è un documento su
 * cui non abbiamo l'informazione — e sull'archivio importato in blocco sarà
 * lo stato della maggioranza delle righe finché qualcuno non le completa.
 * Confonderlo con `valido` significherebbe dire all'agenzia che è tutto a
 * posto proprio dove non lo sappiamo.
 *
 * @param {{ scadenza?: string|null }} documento
 * @param {Date} oggi
 * @returns {'scaduto'|'inScadenza'|'valido'|'senzaData'}
 */
export function statoScadenza(documento, oggi) {
  const giorni = giorniAllaScadenza(documento?.scadenza, oggi);
  if (giorni === null) return 'senzaData';
  if (giorni < 0) return 'scaduto';
  if (giorni <= GIORNI_AVVISO) return 'inScadenza';
  return 'valido';
}

// Etichetta e colore per ciascuno stato. Vivono qui accanto alla funzione che
// li produce, invece che nel componente: sono parte della definizione dello
// stato, non della sua presentazione — un quinto stato aggiunto domani
// verrebbe dimenticato in un file lontano.
export const ETICHETTE_STATO = {
  scaduto:    { testo: 'Scaduto',     colore: 'var(--danger)' },
  inScadenza: { testo: 'In scadenza', colore: 'var(--warning)' },
  valido:     { testo: 'Valido',      colore: 'var(--success)' },
  senzaData:  { testo: 'Senza data',  colore: 'var(--text-muted)' },
};

/**
 * Testo per la scadenza di un documento: «Scaduto da 12 giorni», «Scade fra
 * 3 mesi», «—». È il campo che l'operatore legge di sfuggita in elenco,
 * quindi conta più la scala (giorni/mesi) del numero esatto.
 *
 * @param {{ scadenza?: string|null }} documento
 * @param {Date} oggi
 */
export function testoScadenza(documento, oggi) {
  const giorni = giorniAllaScadenza(documento?.scadenza, oggi);
  if (giorni === null) return '—';
  if (giorni === 0) return 'Scade oggi';
  if (giorni < 0) {
    const g = Math.abs(giorni);
    return g < 60 ? `Scaduto da ${g} ${g === 1 ? 'giorno' : 'giorni'}`
                  : `Scaduto da ${Math.round(g / 30)} mesi`;
  }
  if (giorni < 60) return `Scade fra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`;
  const mesi = Math.round(giorni / 30);
  return mesi < 24 ? `Scade fra ${mesi} mesi` : `Scade fra ${Math.round(mesi / 12)} anni`;
}

// Le opzioni del filtro dell'elenco. `chiave` è ciò che il componente tiene
// nello stato, `stati` sono gli stati di `statoScadenza` che passano il
// filtro; `null` significa «tutti», cioè nessun filtro.
export const FILTRI_SCADENZA = [
  { chiave: 'tutti',      etichetta: 'Tutti',        stati: null },
  { chiave: 'daRinnovare', etichetta: 'Da rinnovare', stati: ['scaduto', 'inScadenza'] },
  { chiave: 'scaduti',    etichetta: 'Scaduti',      stati: ['scaduto'] },
  { chiave: 'senzaData',  etichetta: 'Senza data',   stati: ['senzaData'] },
];

/**
 * Applica il filtro per stato di scadenza.
 *
 * @param {object[]} documenti
 * @param {string} chiave  una delle `FILTRI_SCADENZA`
 * @param {Date} oggi
 */
export function filtraPerScadenza(documenti, chiave, oggi) {
  const filtro = FILTRI_SCADENZA.find((f) => f.chiave === chiave);
  if (!filtro || !filtro.stati) return documenti || [];
  return (documenti || []).filter((d) => filtro.stati.includes(statoScadenza(d, oggi)));
}
