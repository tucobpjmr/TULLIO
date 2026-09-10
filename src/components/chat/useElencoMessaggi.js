// src/components/chat/useElencoMessaggi.js
// Dai messaggi della conversazione alle righe da disegnare: coppia con il
// precedente, filtro, finestra.
//
// M-5 dell'audit del 10 settembre. Erano cinque `useMemo` incatenati in mezzo
// alla vista — `conPrecedente` → `filtrati` → `rovesciati` → `finestra` →
// `visibili` — e la catena è l'unica cosa che li teneva insieme: ognuno esiste
// SOLO per alimentare il successivo. Un lettore che entrava in
// ConversationView per capire l'header li attraversava tutti e cinque.
//
// Le due decisioni che questa catena porta con sé — e che restano qui, dove si
// vedono in dieci righe invece che in centoventi:
//
//   1. IL PRECEDENTE VIENE DALLA TIMELINE INTERA, non dalla finestra: serve a
//      decidere se una riga ripete l'intestazione (stesso autore, stesso
//      giorno), e la riga prima può essere fuori dalla finestra o filtrata via.
//   2. IL FILTRO VIENE PRIMA DELLA FINESTRA. Cercare dentro la sola finestra
//      significherebbe rispondere «non c'è» su un messaggio che c'è ma è più
//      vecchio di cinquanta — la stessa disonestà di A-3 sulla ricerca dei
//      task, in piccolo.

import { useMemo } from "react";
import { useFinestra } from "../../hooks/useFinestra.js";

// Quanti messaggi si disegnano. Cinquanta e non 24 come le altre viste: una
// conversazione si legge a colpo d'occhio scorrendo indietro, e una finestra
// troppo stretta trasformerebbe la lettura normale in una sequenza di click.
export const PAGINA_MESSAGGI = 50;

/**
 * @param {{msgs: any[], convId: string, msgSearch: string, showPinnedOnly: boolean}} opzioni
 */
export function useElencoMessaggi({ msgs, convId, msgSearch, showPinnedOnly }) {
  // Il difetto originale era `msgs.indexOf(m)` DENTRO la `.map()`: una
  // scansione lineare dell'array completo per ogni riga disegnata, cioè O(n²)
  // per render — su una conversazione da 500 messaggi, 125.000 confronti,
  // ripetuti ogni 2,5 secondi mentre un collega scrive.
  const conPrecedente = useMemo(
    () => msgs.map((m, i) => ({ m, prev: msgs[i - 1] })),
    [msgs]);

  const filtrati = useMemo(() => {
    if (!showPinnedOnly && !msgSearch) return conPrecedente;
    const q = msgSearch.toLowerCase();
    return conPrecedente.filter(({ m }) => {
      if (showPinnedOnly && !m.pinned) return false;
      if (msgSearch && !m.text?.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [conPrecedente, msgSearch, showPinnedOnly]);

  // `useFinestra` taglia i PRIMI N: per avere gli ULTIMI N si rovescia, si
  // finestra, si rimette in ordine. Due `reverse` su un array già memoizzato,
  // contro una libreria di virtualizzazione che il progetto ha deciso di non
  // avere (vedi hooks/useFinestra.js).
  const rovesciati = useMemo(() => [...filtrati].reverse(), [filtrati]);
  const finestra = useFinestra(rovesciati, PAGINA_MESSAGGI, [convId, msgSearch, showPinnedOnly]);
  const visibili = useMemo(() => [...finestra.visibili].reverse(), [finestra.visibili]);

  return { visibili, finestra };
}
