// src/components/dashboard/queues/queueShared.js
// Ordinamenti e hook condivisi dalle quattro code della Dashboard.
import { useCallback } from "react";

// Ordini disponibili per la coda personale (v2.8 Round 5)
export const QUEUE_SORT_OPTIONS = [
  { key: "date",     label: "Scadenza" },
  { key: "priority", label: "Priorità" },
  { key: "client",   label: "Cliente"  },
  { key: "status",   label: "Stato"    },
];
export const PRIO_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };
export const STATUS_ORDER = { todo: 0, inprogress: 1, awaiting_client: 2, awaiting_supplier: 3, done: 4 };

// Apertura del dettaglio task. È `useCallback` perché `TaskCard` è `memo`: una
// funzione ricreata a ogni render invaliderebbe la memoizzazione di tutte le
// card della lista. `dispatch` ha identità stabile (useSyncedDispatch), quindi
// il riferimento non cambia mai davvero.
export const useOpenTask = (dispatch) =>
  useCallback((task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);
