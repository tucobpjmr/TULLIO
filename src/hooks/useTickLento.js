// src/hooks/useTickLento.js
// Un tick che fa invecchiare ciò che dipende dall'ORA CORRENTE.
//
// PERCHÉ ESISTE (B-5 e B-6 dell'audit di architettura del 16 agosto). Alcune
// cose a schermo non cambiano perché cambiano i dati, ma perché passa il tempo:
// una task «entro 24h» lo diventa da sola, un pallino di presenza sbiadisce da
// verde a grigio senza che nessuno scriva niente. React non ha modo di saperlo
// — `Date.now()` letto in un `useMemo` è congelato al momento in cui quel memo
// è stato calcolato, e le dipendenze non contengono il tempo.
//
// I due modi sbagliati di risolverlo, entrambi già presenti nel progetto prima
// di questo hook:
//
//   • togliere il `useMemo` e leggere `Date.now()` a ogni render. Il valore è
//     sempre fresco, ma si ricalcolano sei filtri su tutte le task ogni volta
//     che qualcuno digita un carattere — e resta comunque fermo finché
//     NESSUNO fa niente, che è esattamente il caso da coprire;
//   • un `setInterval` che forza un render dal punto più ALTO dell'albero.
//     È ciò che faceva `usePresence`, con un `setPresenceMap(prev => ({...prev}))`
//     ogni 30 s montato nel guscio: un render periodico dell'intera app per far
//     invecchiare dei pallini che si vedono solo dentro il pannello chat, e
//     solo quando è aperto (B-6).
//
// La forma giusta è la stessa in entrambi i casi: il tick vive nel componente
// che MOSTRA la cosa che invecchia, così esiste solo mentre quella cosa è a
// schermo, e il valore restituito entra nelle dipendenze del memo che ne
// dipende — rendendo il tempo una dipendenza dichiarata invece che una lettura
// nascosta.
import { useEffect, useState } from "react";

/**
 * @param {number} intervalloMs ogni quanto ricalcolare. Va scelto sulla
 *   GRANULARITÀ di ciò che si mostra, non "il più spesso possibile": un
 *   pallino di presenza con tre soglie in minuti non guadagna niente da un
 *   tick al secondo, e una finestra di 24 ore nemmeno.
 * @param {boolean} [attivo] a `false` non arma alcun timer e il valore resta
 *   fermo: serve a chi mostra la cosa solo in certe condizioni (una tab
 *   selezionata, un pannello aperto) senza dover spostare l'hook dentro un
 *   ramo condizionale, che le regole degli hook vietano.
 * @returns {number} l'istante dell'ultimo tick (`Date.now()`), da mettere
 *   nelle dipendenze del `useMemo` che legge l'ora.
 */
export function useTickLento(intervalloMs, attivo = true) {
  const [istante, setIstante] = useState(() => Date.now());

  useEffect(() => {
    if (!attivo) return undefined;
    const id = setInterval(() => setIstante(Date.now()), intervalloMs);
    return () => clearInterval(id);
  }, [intervalloMs, attivo]);

  return istante;
}
