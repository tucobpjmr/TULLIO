// src/state/AppDataContext.jsx
// Fonte di verità UNICA per team / categorie / utente corrente lato componenti.
//
// PERCHÉ ESISTE. Fino a questa sessione gli stessi tre dati vivevano in due
// posti: lo state del reducer (`state.team`, `state.categories`,
// `state.currentUserId`) e tre `let` mutabili di modulo in state/appGlobals.js,
// allineati per effetto collaterale da `syncLegacyGlobals()` chiamata NEL CORPO
// del render di VoyageDeskInner. Due problemi, entrambi reali:
//
//   1. Le decisioni di AUTORIZZAZIONE (canEditTask, getVisibleTasks…) venivano
//      prese leggendo una variabile di modulo, cioè un dato che non partecipa al
//      ciclo di render: React non lo osserva, non invalida nulla quando cambia,
//      e un componente memoizzato poteva mostrare permessi vecchi.
//   2. Scrivere stato esterno durante il render non è sicuro in Concurrent
//      Rendering: React può iniziare un albero, sospenderlo e renderizzarne un
//      altro — i figli del secondo leggerebbero i valori scritti dal primo
//      (tearing).
//
// Oggi il dato passa dall'albero React come qualsiasi altro: il provider è
// alimentato dallo stesso `state` del reducer, e i consumatori si ri-renderizzano
// quando e solo quando team/categorie/utente cambiano davvero.
//
// FIRME. Le funzioni esposte hanno la stessa firma "team implicito" che avevano
// in appGlobals (getMember(id), canEditTask(task, userId), …): sotto chiamano le
// funzioni pure di lib/permissions.js legandogli il `team` del provider. Esiste
// quindi una sola definizione di ogni regola di permesso in tutta la codebase —
// quella pura — e questo è solo il modo di accedervi dai componenti.
//
//   const { categories, getMember, canEditTask } = useAppData();
//   if (canEditTask(task, uid)) { … }
//
// Per la logica NON di componente (reducer, persistence.js, script) si importano
// direttamente le funzioni pure da lib/permissions.js passando `state.team`.

import { createContext, useContext, useMemo } from "react";
import * as P from "../lib/permissions.js";

const AppDataContext = createContext(null);

/**
 * @param {object}   props
 * @param {Array}    props.team           membri del team (state.team)
 * @param {object}   props.categories     dizionario categorie (state.categories)
 * @param {string}   props.currentUserId  utente loggato (state.currentUserId)
 */
export function AppDataProvider({ team, categories, currentUserId, children }) {
  // Un'unica dipendenza per riferimento: finché il reducer non sostituisce
  // l'array team o il dizionario categorie, il value non cambia identità e i
  // consumatori memoizzati non si invalidano.
  const value = useMemo(() => {
    const t = team || [];
    const c = categories || {};
    return {
      // Dati grezzi (sostituiscono TEAM / CATEGORIES / CURRENT_USER)
      team: t,
      categories: c,
      currentUserId,

      // Lookup team
      getMember: (id) => P.getMember(t, id),
      getAssignableTeam: () => P.getAssignableTeam(t),

      // Ruoli
      getRoleType: (userId) => P.getRoleType(t, userId),
      isJuniorAgent: (userId) => P.isJuniorAgent(t, userId),
      isSeniorAgent: (userId) => P.isSeniorAgent(t, userId),
      isAdmin: (userId) => P.isAdmin(t, userId),
      isDriver: (userId) => P.isDriver(t, userId),

      // Permessi sui task
      canViewTask: (task, userId) => P.canViewTask(t, task, userId),
      canEditTask: (task, userId) => P.canEditTask(t, task, userId),
      canCreateTaskCategory: (category, userId) => P.canCreateTaskCategory(t, category, userId),
      canAccessAdmin: (userId) => P.canAccessAdmin(t, userId),
      getVisibleTasks: (tasks, userId) => P.getVisibleTasks(t, tasks, userId),

      // Categorie disponibili al ruolo
      getAvailableCategories: (userId) => P.getAvailableCategories(c, t, userId),
    };
  }, [team, categories, currentUserId]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

/**
 * Accesso ai dati condivisi dell'app. Solleva se usato fuori dal provider:
 * un fallback silenzioso ai dati demo ricreerebbe esattamente il problema che
 * questo modulo elimina — un valore globale implicito che nessuno ha dichiarato.
 * Nei test si usa `renderWithAppData` (src/test/helpers/appData.jsx).
 */
export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) {
    throw new Error(
      "useAppData() richiede <AppDataProvider>. Nei test usa renderWithAppData()."
    );
  }
  return ctx;
}

export { AppDataContext };
