// src/components/ui/MostraAltri.jsx
// Il piede di un elenco con la finestra di `hooks/useFinestra.js`: il comando
// che allarga la finestra e il conteggio che tiene onesto il totale.
//
// «24 di 209» e «24» sono due affermazioni diverse su dati operativi, ed è la
// ragione per cui la convenzione richiede il totale accanto al comando (M-2).
//
// Le due frasi arrivano già composte dal chiamante e non da un'interpolazione
// qui dentro: in italiano «Mostra altri» e «Mostra altre» dipendono dal nome
// che segue, e comporre testo per interpolazione è il modo in cui nasce
// «Descrizione è obbligatorio» (vedi il commento in lib/validators.js).

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const colCenterGap6 = {
  display: "flex", flexDirection: "column", alignItems: "center", gap: 6, marginTop: 18,
};
const boxF13Bold = {
  background: "var(--card)", color: "var(--text)",
  border: "1px solid var(--border)", borderRadius: 10,
  padding: "10px 22px", cursor: "pointer",
  fontSize: 13, fontWeight: 600, fontFamily: "inherit",
};
const txtF115Muted = { fontSize: 11.5, color: "var(--text-muted)" };

/**
 * @param {{restanti: number, ancora: () => void}} finestra  il ritorno di `useFinestra`
 * @param {string} azione     testo del bottone, es. «Mostra altre 24 di 185»
 * @param {string} conteggio  riga sotto il bottone, es. «24 di 209 task»
 */
export function MostraAltri({ finestra, azione, conteggio }) {
  if (finestra.restanti <= 0) return null;
  return (
    <div style={colCenterGap6}>
      <button type="button" onClick={finestra.ancora} style={boxF13Bold}>{azione}</button>
      <div style={txtF115Muted}>{conteggio}</div>
    </div>
  );
}
