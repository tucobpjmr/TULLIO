// src/hooks/useDispatchInVolo.js
// Il dispatch grezzo del core, con il registro delle scritture in volo.
//
// B-4 del 16 novembre · Il registro (id → scritture in volo) non è stato
// React: nessuna vista lo mostra, e tenerlo nel reducer faceva ri-renderizzare
// il guscio due volte a ogni salvataggio. Qui sta in un ref:
//   • MARK/UNMARK_PENDING_WRITE aggiornano il ref e NON arrivano a React;
//   • ogni altra azione parte con `inVolo` = l'istantanea corrente, se non è
//     vuota. I case che fondono (SET_TASKS, MERGE_TASK_ROW, …) la leggono da
//     lì: il reducer resta puro e l'ordine è quello dei dispatch.
//
// Ritorna l'azione effettivamente consegnata: useSyncedDispatch la riapplica
// al proprio ref di stato, e deve vedere la stessa istantanea.

import { useCallback, useRef } from "react";
import { IN_VOLO_VUOTO, MARCA_IN_VOLO, SMARCA_IN_VOLO, aggiornaInVolo } from "../state/pendingWrites.js";

/**
 * @param {(azione: any) => void} dispatchReact il dispatch di useReducer
 * @returns {{ dispatch: (azione: any) => any, leggiInVolo: () => ReadonlyMap<string, number> }}
 */
export function useDispatchInVolo(dispatchReact) {
  const registro = useRef(IN_VOLO_VUOTO);

  const dispatch = useCallback((azione) => {
    if (azione.type === MARCA_IN_VOLO || azione.type === SMARCA_IN_VOLO) {
      registro.current = aggiornaInVolo(registro.current, azione);
      return azione;
    }
    const consegnata = registro.current.size ? { ...azione, inVolo: registro.current } : azione;
    dispatchReact(consegnata);
    return consegnata;
  }, [dispatchReact]);

  const leggiInVolo = useCallback(() => registro.current, []);

  return { dispatch, leggiInVolo };
}
