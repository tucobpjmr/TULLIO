// src/state/TasksContext.jsx
// I task dello state del reducer, distribuiti alle viste per contesto invece
// che come prop.
//
// PERCHÉ ESISTE. Ogni vista riceveva l'INTERO `state` del reducer:
//
//     case "calendar": return <CalendarPlanner state={state} dispatch={dispatch} />;
//
// `state` è un oggetto nuovo dopo QUALUNQUE azione — un toast che compare, il
// toast che sparisce da solo dopo tre secondi, un carattere digitato nella
// ricerca globale, la sidebar che si chiude. Ognuna di queste faceva
// ri-renderizzare per intero la vista attiva e tutto ciò che conteneva.
//
// Il costo non era teorico: CalendarPlanner ricalcola l'espansione delle
// ricorrenze su tutti i task ad ogni render, e le code della Dashboard
// ridisegnano ogni card. Digitare "rossi" nella ricerca col calendario aperto
// significava cinque espansioni complete. È anche il motivo per cui il `memo`
// di TaskCard/TaskRow non produceva alcun effetto: la memoizzazione di un
// figlio non serve a niente se il genitore viene comunque ri-renderizzato.
//
// COME FUNZIONA, E PERCHÉ IL PROVIDER DA SOLO NON BASTA. Due metà, entrambe
// necessarie:
//   1. la vista smette di ricevere `state` e legge i task da qui — così si
//      ri-renderizza quando cambiano i TASK, non quando cambia lo state;
//   2. la vista è avvolta in `memo` — così React, quando il genitore
//      ri-renderizza per un motivo che non la riguarda, confronta le prop
//      rimaste (tutte a identità stabile: `dispatch` da useSyncedDispatch, gli
//      array che vengono dal reducer) e salta il render.
// Senza la (2) il provider non cambia nulla: un componente si ri-renderizza
// comunque quando lo fa il genitore, per quanto poco dipenda dalle sue prop.
//
// La dipendenza dell'useMemo è UNA e per riferimento — stesso schema di
// AppDataContext: finché il reducer non sostituisce l'array `tasks`, il value
// non cambia identità e i consumatori non si invalidano.

import { createContext, useContext, useMemo } from "react";

const TasksContext = createContext(null);

/**
 * @param {object} props
 * @param {Array}  props.tasks  i task dello state del reducer (state.tasks)
 */
export function TasksProvider({ tasks, children }) {
  const value = useMemo(() => ({ tasks: tasks || [] }), [tasks]);
  return <TasksContext.Provider value={value}>{children}</TasksContext.Provider>;
}

/**
 * I task, inclusi quelli cestinati (`deletedAt` valorizzato): è lo stesso array
 * che il reducer tiene in `state.tasks`, e le viste filtrano come hanno sempre
 * fatto con getActiveTasks/isActiveTask/getTrashedTasks.
 *
 * SOLLEVA fuori dal provider, come useAppData: un fallback ad array vuoto
 * mostrerebbe una vista plausibile ma priva di dati, ed è esattamente il tipo
 * di guasto che si scopre in produzione invece che al primo render in test.
 */
export function useTasks() {
  const ctx = useContext(TasksContext);
  if (!ctx) {
    throw new Error(
      "useTasks() richiede <TasksProvider>. Nei test usa renderWithAppData(ui, { tasks: [...] })."
    );
  }
  return ctx.tasks;
}

export { TasksContext };
