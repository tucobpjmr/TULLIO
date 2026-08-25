// src/components/dashboard/queues/queueShared.js
// Ordinamenti e hook condivisi dalle cinque code della Dashboard.
import { useCallback } from "react";
import { useDispatch } from "../../../state/DispatchContext.jsx";

// M-2 (audit performance/UX del 16 agosto, secondo passaggio) · Quante card
// disegna una coda alla volta. Dieci come l'elenco liste (`HOME_PAGE_SIZE`):
// una coda è una CARD della dashboard, non una pagina, e le due che non hanno
// un tetto naturale — Scadute e Coda globale — si allungano proprio quando
// l'agenzia va in affanno, cioè quando la dashboard deve essere più reattiva.
export const QUEUE_PAGINA = 10;

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
// il riferimento non cambia mai davvero — ed è la stessa proprietà che permette
// a DispatchContext di non avere un `useMemo` (M-2, audit del 25 agosto).
export const useOpenTask = () => {
  const dispatch = useDispatch();
  return useCallback((task) => dispatch({ type: "SET_SELECTED_TASK", payload: task }), [dispatch]);
};
