// src/hooks/useTema.js
// La scelta del tema come stato React: leggerla, cambiarla, e sapere cosa si
// sta vedendo davvero.
//
// M-4 dell'audit del 10 settembre. L'applicazione al documento avviene GIÀ
// prima di React (main.jsx chiama `applicaTema(leggiTema())` prima di
// `createRoot`, così non c'è un lampo chiaro all'avvio): questo hook non è
// quindi la sorgente del tema, è il modo in cui l'interfaccia lo mostra e lo
// cambia. Lo stato iniziale rilegge dallo stesso posto, e per costruzione
// coincide con ciò che è già a schermo.

import { useCallback, useEffect, useState } from "react";
import { applicaTema, leggiTema, salvaTema, temaEffettivo } from "../lib/tema.js";

export function useTema() {
  const [tema, setTema] = useState(leggiTema);
  const [effettivo, setEffettivo] = useState(() => temaEffettivo(leggiTema()));

  const scegli = useCallback((prossimo) => {
    salvaTema(prossimo);
    applicaTema(prossimo);
    setTema(prossimo);
    setEffettivo(temaEffettivo(prossimo));
  }, []);

  // Il sistema può cambiare idea mentre l'app è aperta — su iOS e Android il
  // tema scuro segue un orario. Il CSS si aggiorna da solo (è una media
  // query); questo listener serve all'ETICHETTA, che altrimenti continuerebbe
  // a dire «Sistema — ora chiaro» col buio a schermo.
  useEffect(() => {
    let mq;
    try {
      mq = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return undefined;
    }
    const aggiorna = () => setEffettivo(temaEffettivo(leggiTema()));
    // `addEventListener` con ripiego su `addListener`: Safari < 14 conosce
    // solo il secondo, ed è la versione che gira su iPhone 6s/7 ancora in uso.
    if (mq.addEventListener) mq.addEventListener("change", aggiorna);
    else if (mq.addListener) mq.addListener(aggiorna);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", aggiorna);
      else if (mq.removeListener) mq.removeListener(aggiorna);
    };
  }, []);

  return { tema, effettivo, scegli };
}
