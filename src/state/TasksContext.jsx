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
// Il costo non era teorico: CalendarPlanner rifiltra e ri-dispone tutti i task
// del periodo a ogni render (`layoutColumns` è quadratico nella giornata), e le
// code della Dashboard ridisegnano ogni card. Digitare "rossi" nella ricerca
// col calendario aperto significava cinque ricostruzioni complete.
// (Fino ad A-3 questa frase citava «l'espansione delle ricorrenze»: era il
// lavoro che si CREDEVA di fare lì, su un motore che non ha mai espanso nulla.
// Il rilievo sui render resta, il soggetto era sbagliato.) È anche il motivo per cui il `memo`
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
 * @param {import('react').ReactNode} props.children
 */
export function TasksProvider({ tasks, children }) {
  // Punto 8 dell'analisi del 15 novembre · Le derivazioni che più viste
  // rifacevano ciascuna per conto suo (attivi, cestinati, conteggi per
  // assegnatario e categoria) si calcolano QUI, una volta per cambio di
  // `tasks`, e le viste le leggono già pronte.
  const value = useMemo(() => derivaTask(tasks || []), [tasks]);
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
/**
 * Le derivazioni condivise, in un solo passaggio sull'array.
 * @param {Array<{ id: string, deletedAt?: string|null, assignees?: string[], category?: string }>} tasks
 */
export function derivaTask(tasks) {
  const attivi = [];
  const cestinati = [];
  /** @type {Map<string, number>} */
  const attiviPerAssegnatario = new Map();
  /** @type {Map<string, number>} */
  const attiviPerCategoria = new Map();
  for (const t of tasks) {
    if (t.deletedAt) { cestinati.push(t); continue; }
    attivi.push(t);
    for (const id of t.assignees || []) attiviPerAssegnatario.set(id, (attiviPerAssegnatario.get(id) ?? 0) + 1);
    if (t.category) attiviPerCategoria.set(t.category, (attiviPerCategoria.get(t.category) ?? 0) + 1);
  }
  return { tasks, attivi, cestinati, attiviPerAssegnatario, attiviPerCategoria };
}

const leggi = (ctx, nome) => {
  if (!ctx) {
    throw new Error(
      `${nome}() richiede <TasksProvider>. Nei test usa renderWithAppData(ui, { tasks: [...] }).`
    );
  }
  return ctx;
};

/** I task NON cestinati, calcolati una volta nel provider. */
export const useTaskAttivi = () => leggi(useContext(TasksContext), "useTaskAttivi").attivi;
/** I task nel cestino (`deletedAt` valorizzato), calcolati una volta nel provider. */
export const useTaskCestinati = () => leggi(useContext(TasksContext), "useTaskCestinati").cestinati;
/**
 * Conteggi dei task attivi per assegnatario e per categoria (Map id → n).
 * @returns {{ perAssegnatario: Map<string, number>, perCategoria: Map<string, number> }}
 */
export const useConteggiTaskAttivi = () => {
  const ctx = leggi(useContext(TasksContext), "useConteggiTaskAttivi");
  return { perAssegnatario: ctx.attiviPerAssegnatario, perCategoria: ctx.attiviPerCategoria };
};

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
