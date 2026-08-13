// src/components/liste/ListaRow.jsx
// Riga della home del modulo Liste viaggio: cliente, titolo, numero
// movimenti, stato e saldo. Estratta da ListeViaggio.jsx (A-4, audit del 12
// agosto): un secondo componente nello stesso file di un modulo già a
// 495/500 righe, senza dipendere da nessuno stato o hook del genitore.
import { eur, fmtDate, intestazioneLista, saldoClass } from "./listeApi.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const cursor2 = { cursor: "default" };

export function ListaRow({ lista, saldo, onOpen, trashed = false, children }) {
  const s = saldo || { saldo: 0, num_movimenti: 0 };
  // Nel cestino conta da quanto la lista è archiviata, non il dettaglio dei
  // movimenti: la vista `liste_saldi` esclude comunque le liste archiviate,
  // quindi lì num_movimenti/ultimo_movimento sarebbero sempre a zero.
  const sub = trashed
    ? `${lista.titolo ? `${lista.titolo} · ` : ""}nel cestino dal ${fmtDate((lista.deleted_at || "").slice(0, 10))}`
    : [
      lista.titolo,
      `${s.num_movimenti} movimenti`,
      s.ultimo_movimento ? `ultimo ${fmtDate(s.ultimo_movimento)}` : null,
    ].filter(Boolean).join(" · ");

  const content = (
    <>
      <div className="who">
        <b>{intestazioneLista(lista) || "—"}</b>
        <span>{sub}</span>
      </div>
      {!trashed && <span className={`lv-badge ${lista.stato}`}>{lista.stato}</span>}
      {/* Nel cestino il saldo non si mostra: `liste_saldi` filtra le liste
          archiviate, quindi il valore sarebbe uno 0,00 € fuorviante e non il
          saldo reale della lista (la SPA sorgente lo mostrava comunque). */}
      {!trashed && (
        <span className={`lv-saldo lv-num ${saldoClass(Number(s.saldo))}`}>{eur(s.saldo)}</span>
      )}
      {children}
    </>
  );

  // Nel cestino la riga non è cliccabile (porta i propri bottoni): resta un
  // div, così i bottoni interni non finiscono annidati dentro un <button>.
  if (!onOpen) {
    return <div className="lv-lista-row" style={cursor2}>{content}</div>;
  }
  return (
    <button type="button" className="lv-lista-row" onClick={onOpen}>{content}</button>
  );
}
