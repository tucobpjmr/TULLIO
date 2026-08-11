// src/lib/dates.js
// I formati di data dell'app, NOMINATI.
//
// PERCHÉ ESISTE, e perché non riduce le forme a una. Prima c'erano sedici
// chiamate a `toLocaleDateString`/`toLocaleTimeString` sparse in nove file,
// quasi tutte scritte in linea dentro il JSX, che producevano sette forme
// diverse (ST-8 di docs/AUDIT_STRUTTURA_2026-08-10.md). Sette forme sono
// probabilmente le sette giuste — l'intestazione di un calendario e il
// timestamp di un messaggio non devono somigliarsi — quindi il difetto non era
// la varietà: era che la varietà non stava scritta da nessuna parte. La settima
// variante nasceva dal fatto che nessuno sapeva quali fossero le prime sei, e
// cambiare la lingua dell'app significava rileggere il markup di nove file.
// ⛔ Chi aggiunge un formato lo aggiunge QUI, con il nome e il motivo: la regola
// non è "usane uno solo", è "non inventarne uno nuovo dentro un componente".
//
// I formatter sono costruiti UNA volta. `toLocaleDateString` ne ricostruisce
// uno a ogni chiamata: in un ciclo sui task (248 righe) è la parte costosa
// dell'operazione, e qui la si paga al primo import del modulo.

const IT = "it-IT";

const F = {
  // "28 lug"        — chat (messaggi più vecchi di ieri), bacheca
  breve: new Intl.DateTimeFormat(IT, { day: "2-digit", month: "short" }),
  // "28 lug 2026"   — scadenze dei task, anteprima dei template
  media: new Intl.DateTimeFormat(IT, { day: "2-digit", month: "short", year: "numeric" }),
  // "28/07/2026"    — modulo Liste (movimenti, riepiloghi, export), DateTimePicker
  numerica: new Intl.DateTimeFormat(IT, { day: "2-digit", month: "2-digit", year: "numeric" }),
  // "martedì 28 luglio" — intestazione della dashboard e del giorno di calendario
  giornoLungo: new Intl.DateTimeFormat(IT, { weekday: "long", day: "numeric", month: "long" }),
  // "luglio 2026"   — intestazione di mese (calendario, DateTimePicker)
  meseAnno: new Intl.DateTimeFormat(IT, { month: "long", year: "numeric" }),
  // "28 lug" senza lo zero — solo per gli estremi di una settimana di
  // calendario ("28 lug — 3 ago 2026"): lì il giorno sta accanto a un altro
  // giorno e lo zero iniziale rende la coppia più difficile da leggere, non
  // più allineata. È il motivo per cui è una forma a sé e non `breve`.
  giornoMese: new Intl.DateTimeFormat(IT, { day: "numeric", month: "short" }),
  giornoMeseAnno: new Intl.DateTimeFormat(IT, { day: "numeric", month: "short", year: "numeric" }),
  // "14:30"
  ora: new Intl.DateTimeFormat(IT, { hour: "2-digit", minute: "2-digit" }),
};

// `YYYY-MM-DD` senza ora: è il tipo `date` di Postgres (data_movimento nel
// modulo Liste, il valore di un <input type="date">).
const SOLO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalizza l'input in un Date LOCALE.
 *
 * ⚠️ È il caveat che teneva separate `taskUtils.formatDate` e `listeApi.fmtDate`,
 * e va conservato qui invece di essere rispiegato in due posti: `new Date("2026-07-28")`
 * interpreta la stringa come UTC-mezzanotte, che in Italia è l'1:00 o le 2:00 del
 * 28 — ma se il fuso fosse a ovest di Greenwich sarebbe il 27, e la data mostrata
 * NON sarebbe quella scritta nel database. `fmtDate` evitava il problema
 * spezzando la stringa a mano; qui si costruisce un Date locale con i tre
 * numeri, che ottiene la stessa cosa e vale per tutti i formati, non solo per
 * quello numerico.
 *
 * Un timestamp ISO completo, invece, ha davvero un istante: si converte e basta.
 */
const aData = (v) => {
  if (v instanceof Date) return v;
  if (typeof v === "string" && SOLO_DATA.test(v)) {
    const [a, m, g] = v.split("-").map(Number);
    return new Date(a, m - 1, g);
  }
  return new Date(v);
};

// Un valore assente rende stringa vuota, non "Invalid Date": è il comportamento
// che avevano già tutti i call site, ognuno con il proprio `if (!x) return ""`.
// L'unica eccezione dichiarata è `formatDate` dei task, che rende "—" perché lì
// la scadenza è opzionale e la sua assenza va DETTA (vedi lib/taskUtils.js).
const con = (fmt) => (v) => {
  if (v === null || v === undefined || v === "") return "";
  const d = aData(v);
  return Number.isNaN(d.getTime()) ? "" : fmt.format(d);
};

export const dataBreve = con(F.breve);
export const dataMedia = con(F.media);
export const dataNumerica = con(F.numerica);
export const giornoLungo = con(F.giornoLungo);
export const meseAnno = con(F.meseAnno);
export const giornoMese = con(F.giornoMese);
export const giornoMeseAnno = con(F.giornoMeseAnno);
export const oraBreve = con(F.ora);
