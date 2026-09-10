// src/components/chat/useTypingConversazione.js
// «Sta scrivendo…»: canale broadcast, mappa dei typer, scadenze.
//
// ─── M-5 dell'audit del 10 settembre · PERCHÉ È USCITO DA ConversationView ──
// Erano tre effetti, quattro ref e due funzioni sparsi in mezzo al resto della
// vista, e la loro coesione non si vedeva: `typingChannelRef` (il canale),
// `typingMapRef` (lo specchio sincrono della mappa), `lastTypingSentRef`
// (l'anti-flood) e `typingStopTimerRef` (il debounce dello stop) esistevano
// per parlarsi FRA LORO, non con la vista. Il rilievo lo dice meglio di così:
// i ref di coordinamento non erano il difetto, erano il sintomo — servivano a
// far comunicare effetti che stavano nello stesso file solo perché stavano
// nello stesso file.
//
// ⚠️ LA MAPPA ORA VIVE QUI, e non è un trasloco: era in `convViewReducer`
// (`cv.typingMap`, case `SET_TYPING_MAP`) E in un ref che la rispecchiava, con
// un effetto a tenerli allineati. Due copie della stessa verità e una terza
// riga di codice per farle coincidere — mentre l'unico lettore della mappa,
// fuori di qui, è la riga che costruisce l'etichetta dell'header. Tenerla
// dov'è usata toglie il ref specchio, l'effetto che lo aggiornava e un case
// dal reducer del pannello: −1 fonte di verità, non −1 file.
//
// COSA NON CAMBIA: il canale è per conversazione e si chiude sempre (anche
// annunciando `typing: false` a chi resta), l'anti-flood è quello di prima
// (TYPING_PING_MS), la potatura periodica pure — con la stessa ragione, che è
// il caso in cui un evento "stop" si perde per strada.

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToTyping } from "../../lib/api.js";
import { isUuid } from "../../lib/mappers.js";
import {
  applyTypingEvent, pruneTypingMap, TYPING_PING_MS, TYPING_STOP_MS,
} from "../../lib/typingUtils.js";

const POTATURA_MS = 1500;

/**
 * @param {{convId: string, myId: string}} opzioni
 * @returns {{typingMap: Record<string, number>, notifyTyping: () => void, stopTyping: () => void}}
 */
export function useTypingConversazione({ convId, myId }) {
  const [typingMap, setTypingMap] = useState(/** @type {Record<string, number>} */ ({}));
  // Il ref resta — ma uno solo, e per la ragione per cui i ref esistono: gli
  // eventi del canale arrivano più in fretta di quanto React ri-renderizzi, e
  // `applyTypingEvent` deve partire dalla mappa più recente, non da quella del
  // render in cui la callback è stata creata.
  const mappaRif = useRef(typingMap);
  const canaleRif = useRef(/** @type {any} */ (null));
  const ultimoInvioRif = useRef(0);
  const timerStopRif = useRef(/** @type {any} */ (null));

  const aggiorna = useCallback((prossima) => {
    mappaRif.current = prossima;
    setTypingMap(prossima);
  }, []);

  // Sottoscrizione al canale della conversazione. Solo su conv reali (uuid):
  // i mock/test non hanno realtime → nessuna connessione, nessun crash.
  useEffect(() => {
    if (!isUuid(convId)) return undefined;
    let canale;
    try {
      canale = subscribeToTyping(convId, (payload) => {
        aggiorna(applyTypingEvent(mappaRif.current, payload, { selfId: myId }));
      });
    } catch (err) {
      console.error("[chat] typing subscribe", err);
      return undefined;
    }
    canaleRif.current = canale;
    return () => {
      clearTimeout(timerStopRif.current);
      ultimoInvioRif.current = 0;
      try { canale?.send({ userId: myId, typing: false }); } catch { /* noop */ }
      try { canale?.unsubscribe(); } catch { /* noop */ }
      canaleRif.current = null;
      aggiorna({});
    };
  }, [convId, myId, aggiorna]);

  // Potatura periodica: toglie i typer scaduti. È il ripiego per l'evento
  // "stop" che non arriva — senza, l'indicatore resterebbe acceso per sempre
  // su chi ha chiuso l'app a metà frase.
  useEffect(() => {
    const t = setInterval(() => {
      const potata = pruneTypingMap(mappaRif.current);
      if (Object.keys(potata).length !== Object.keys(mappaRif.current).length) aggiorna(potata);
    }, POTATURA_MS);
    return () => clearInterval(t);
  }, [aggiorna]);

  // Segnala che l'utente locale sta scrivendo: pubblica "typing:start" (con
  // anti-flood) e programma un "typing:stop" dopo un po' di inattività.
  const notifyTyping = useCallback(() => {
    const canale = canaleRif.current;
    if (!canale) return;
    const ora = Date.now();
    if (ora - ultimoInvioRif.current > TYPING_PING_MS) {
      ultimoInvioRif.current = ora;
      try { canale.send({ userId: myId, typing: true }); } catch { /* noop */ }
    }
    clearTimeout(timerStopRif.current);
    timerStopRif.current = setTimeout(() => {
      ultimoInvioRif.current = 0;
      try { canale.send({ userId: myId, typing: false }); } catch { /* noop */ }
    }, TYPING_STOP_MS);
  }, [myId]);

  // Ferma subito il "sto scrivendo" (all'invio del messaggio).
  const stopTyping = useCallback(() => {
    clearTimeout(timerStopRif.current);
    ultimoInvioRif.current = 0;
    try { canaleRif.current?.send({ userId: myId, typing: false }); } catch { /* noop */ }
  }, [myId]);

  return { typingMap, notifyTyping, stopTyping };
}
