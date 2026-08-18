// src/hooks/useFinestra.js
// La finestra su un elenco lungo: quante righe si disegnano, il conteggio di
// quelle che restano fuori e il riazzeramento a ogni restringimento.
//
// PERCHÉ ESISTE (M-2, audit performance/UX del 16 agosto, secondo passaggio).
// La convenzione è scritta in docs/CLAUDE.md — «elenchi lunghi: una finestra,
// non tutte le righe» — ed era applicata a DUE viste su sette: `ClientiView`
// (24 card) e `ListeViaggio` (10 righe), con due copie identiche della stessa
// meccanica. Archivio, Cestino e le cinque code della Dashboard montavano
// l'array intero: 209 card d'archivio oggi, +4 al giorno, ognuna con il
// proprio `SwipeActions`, gli avatar degli assegnatari e il chip di categoria.
//
// La terza copia sarebbe stata quella in cui una delle tre si dimentica il
// riazzeramento e mostra i primi 24 di una ricerca precedente — il difetto che
// `src/test/clientiPaginazione.test.jsx` esiste per impedire in una vista sola.
//
// NON è una libreria di virtualizzazione: sarebbe la risposta giusta a 10.000
// righe, non a 209, e porterebbe una dipendenza in un progetto che ne ha
// volutamente una sola.
import { useMemo, useState } from "react";

/**
 * @param {Array}  elementi        l'elenco COMPLETO, già filtrato e ordinato
 * @param {number} passo           quante righe per volta
 * @param {Array}  restringimenti  i valori che, cambiando, RIAZZERANO la
 *   finestra: ricerca, filtri, ordinamento. Chi cerca "Rossi" si aspetta di
 *   vedere i Rossi, non i primi 24 di una finestra aperta su un'altra ricerca;
 *   cambiare l'ordinamento ridefinisce *quali* sono i primi 24.
 * @returns {{visibili: Array, restanti: number, totale: number, passo: number, ancora: () => void}}
 */
export function useFinestra(elementi, passo, restringimenti = []) {
  // Il riazzeramento è un ADEGUAMENTO DELLO STATO IN RENDER, non un `useEffect`
  // con `restringimenti` come array di dipendenze: quello sarebbe un array
  // dinamico (che `react-hooks/exhaustive-deps` non sa verificare, e la regola
  // è a zero warning per scelta) e commetterebbe un render con la finestra
  // vecchia prima di correggerla. Qui React ri-esegue il componente prima di
  // toccare il DOM, quindi a schermo non arriva mai lo stato intermedio.
  const chiave = restringimenti.join(" ");
  const [limite, setLimite] = useState(passo);
  const [chiaveVista, setChiaveVista] = useState(chiave);
  if (chiave !== chiaveVista) {
    setChiaveVista(chiave);
    setLimite(passo);
  }

  // `slice` solo quando serve davvero: sotto la soglia si ritorna l'array
  // originale, così l'identità regge e i figli `memo` non si svegliano.
  const visibili = useMemo(
    () => (elementi.length <= limite ? elementi : elementi.slice(0, limite)),
    [elementi, limite],
  );

  return {
    visibili,
    restanti: elementi.length - visibili.length,
    totale: elementi.length,
    passo,
    ancora: () => setLimite((n) => n + passo),
  };
}
