// ─── CHIAVE GIORNO ───────────────────────────────────────────────────────────
// La chiave di raggruppamento per GIORNO LOCALE, come numero.
//
// PERCHÉ NON `toDateString()`. Il calendario raggruppava i task per giorno
// confrontando `new Date(t.dueDate).toDateString() === giorno.toDateString()`
// dentro un `filter`, UNA VOLTA PER CELLA: 35 celle nella vista mese, 7 nella
// settimana, team×7 nella distribuzione agenti. Ogni confronto alloca una Date
// e formatta due stringhe, quindi il costo cresce come celle × task e non
// come task. Una chiave numerica confronta due interi, e soprattutto permette
// di INDICIZZARE una volta invece di rifiltrare per ogni cella.
//
// Resta ora LOCALE come prima: `toDateString()` lavorava sul fuso del browser
// e i getter qui sotto fanno lo stesso. Non è un dettaglio — un'agenzia che
// guarda una partenza delle 23:30 deve vederla nel giorno in cui parte per
// lei, non in UTC.
export const chiaveGiorno = (d) =>
  d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate();

/** @returns {number|null} `null` se la data non è valida: il chiamante salta la riga. */
export const chiaveGiornoDaISO = (iso) => {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return chiaveGiorno(new Date(ms));
};
