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
// FIRME. Le regole di permesso hanno UNA sola definizione in tutta la codebase
// — quella pura, in lib/permissions.js, che prende il `team` come primo
// argomento. Questo modulo è solo il modo di accedervi dai componenti, con il
// team del provider già legato.
//
// ─── M-2 (audit del 26 agosto) · `io` E `per(id)` ─────────────────────────
//
// Fino al 26 agosto le regole legate a UN utente erano diciassette voci con la
// firma `(…, userId)`, e i call site erano ventinove. In VENTOTTO su
// ventinove quel `userId` valeva `currentUserId` — cioè un valore che il
// contesto conosce già e che il chiamante gli ripassava indietro:
//
//   canViewTask(t, uid) ×4     canEditTask(task, me) ×3      getRoleType(uid) ×2
//   canAccessListe(currentUserId) ×2   getAvailableCategories(currentUserId) ×2
//   … e l'UNICA eccezione: isJuniorAgent(m.id) in UserSwitcher.
//
// Un parametro che è sempre lo stesso valore non documenta niente e apre una
// strada sola: passare quello sbagliato, senza che nulla lo segnali. Al suo
// posto ci sono due superfici, e la differenza fra loro è visibile a colpo
// d'occhio:
//
//   io.vedeTask(task)          // «io», il caso normale
//   per(m.id).isJuniorAgent()  // «qualcun altro», il caso raro — ora si vede
//
// Convivevano anche TRE forme di chiamata per la stessa domanda — `P.isAdmin(team, uid)`
// pura, `ctx.isAdmin(uid)` legata, e di nuovo la pura in `VoyageDeskInner` —
// e la seconda è quella che sparisce: dai componenti si passa da `io`/`per`,
// fuori dai componenti (reducer, persistence.js, script) dalle funzioni pure.
//
// ⚠️ CIÒ CHE M-2 **NON** CAMBIA, e l'audit lo dava per rotto: l'identità del
// value. Il rilievo temeva che `team` cambiasse a ogni evento realtime su
// `users` — presenza e avatar compresi — invalidando insieme tutte le voci del
// contesto. Non succede, ed era già stato risolto: `useAppHydration` filtra
// gli UPDATE di sola presenza (`filterEvent`) e confronta il payload con
// `stessaLista` prima di dispatchare `SET_TEAM` (ST-15, vedi
// lib/confrontoIdratazione.js). `io` nasce dentro lo stesso `useMemo` e ha
// quindi la stessa identità stabile delle diciassette voci che sostituisce.

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
    // I predicati legati a UN utente. `per(id)` è la forma generale; `io` è
    // `per(currentUserId)`, cioè il 28° caso su 29.
    //
    // I nomi sono in italiano perché li scegliamo noi (vedi «lingua degli
    // identificatori» in docs/CLAUDE.md): `io.vedeTask(t)` si legge come la
    // domanda che è, dove `canViewTask(t, uid)` obbligava a risalire a cosa
    // fosse `uid` per sapere di chi si stesse parlando.
    const per = (uid) => ({
      ruolo:                () => P.getRoleType(t, uid),
      isAdmin:              () => P.isAdmin(t, uid),
      isDriver:             () => P.isDriver(t, uid),
      isJuniorAgent:        () => P.isJuniorAgent(t, uid),
      isSeniorAgent:        () => P.isSeniorAgent(t, uid),
      vedeTask:             (task) => P.canViewTask(t, task, uid),
      modificaTask:         (task) => P.canEditTask(t, task, uid),
      creaCategoria:        (categoria) => P.canCreateTaskCategory(t, categoria, uid),
      accedeAdmin:          () => P.canAccessAdmin(t, uid),
      // Accesso al modulo Liste viaggio. Le viste che ci linkano lo chiedevano
      // ciascuna a modo suo (`!isDriver(...)`): la domanda è una sola, e
      // rispecchia can_liste() del database.
      accedeListe:          () => P.canAccessListe(t, uid),
      taskVisibili:         (tasks) => P.getVisibleTasks(t, tasks, uid),
      // Anagrafica clienti (A-1 dell'audit del 14 agosto, secondo passaggio):
      // due funzioni perché il database ha due policy diverse per update e
      // delete — vedi lib/permissions.js.
      modificaCliente:      () => P.canEditClient(t, uid),
      eliminaCliente:       () => P.canDeleteClient(t, uid),
      categorieDisponibili: () => P.getAvailableCategories(c, t, uid),
      // Rubrica interna (M-7 dell'audit del 4 settembre): un driver vede solo
      // il proprio contatto — vedi lib/permissions.js.
      vedeContatto:         (targetId) => P.canViewContacts(t, uid, targetId),
    });

    return {
      // Dati grezzi (sostituiscono TEAM / CATEGORIES / CURRENT_USER)
      team: t,
      categories: c,
      currentUserId,

      // Lookup team: non sono permessi e non dipendono da chi guarda.
      getMember: (id) => P.getMember(t, id),
      getAssignableTeam: () => P.getAssignableTeam(t),

      per,
      io: per(currentUserId),
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
