// src/state/DispatchContext.jsx
// M-2 dell'audit del 25 agosto · `dispatch` smette di essere una prop.
//
// PERCHÉ ESISTE. L'app aveva già sei provider di dominio — team/categorie/
// utente, task, clienti, storico, anagrafica completa, conferme — nati tutti
// dallo stesso ragionamento: un dato che serve a mezza applicazione non si
// passa di mano in mano. `dispatch` è il dato che serve a MEZZA APPLICAZIONE
// PIÙ UNA: cinquanta componenti lo dichiaravano fra le prop, e per buona parte
// di loro non era nemmeno un dato — era un pacco da consegnare al piano di
// sotto. `AdminView` lo riceveva per darlo alle cinque tab; `ClienteDetail
// Panel` per darlo a `ClienteTaskTab` e a `ClienteListePanel`; `ListaDetail`
// per darlo a quattro editor in linea. Il costo, concreto:
//
//   • una firma più lunga in ogni componente attraversato, e il lettore che
//     deve stabilire ogni volta se quel `dispatch` venga USATO lì o solo
//     inoltrato;
//   • un componente nuovo in fondo a una catena che scrive costringe a toccare
//     ogni anello sopra di lui — la modifica più noiosa e più facile da
//     sbagliare che esista;
//   • `chatContext.js` ci era già arrivato per conto suo, mettendo `dispatch`
//     dentro il PROPRIO context perché quattro livelli di prop-drilling erano
//     troppi. Cioè: la risposta era già stata data una volta, in locale, senza
//     accorgersi che valeva per tutta l'app.
//
// PERCHÉ È SICURO FARLO PER CONTESTO, e non è la solita eccezione. Il difetto
// classico di un context è che i consumatori si ri-renderizzano quando cambia
// il `value`. Qui il value NON CAMBIA MAI: `useSyncedDispatch` ritorna una
// `useCallback` con dipendenze stabili — è un contratto dichiarato in cima a
// quel file proprio perché i figli memoizzati non si invalidino — e il value di
// questo provider È quella funzione, non un oggetto che la contiene. Zero
// ri-render aggiuntivi, e nessun `useMemo` da tenere allineato.
//
// COSA NON CAMBIA. `dispatch` resta un ARGOMENTO per gli hook di dominio
// (useAppHydration, usePushNavigation) e per il registry delle liste
// (useListeWrite): quelli sono chiamati dall'orchestratore, che il dispatch ce
// l'ha in mano, e riceverlo esplicitamente è ciò che li rende testabili senza
// montare un albero React.

import { createContext, useContext } from "react";

const DispatchContext = createContext(null);

/**
 * @param {object}   props
 * @param {Function} props.dispatch  il dispatch sincronizzato
 *   (hooks/useSyncedDispatch.js). L'identità è stabile per contratto: è ciò che
 *   permette a questo provider di non avere un `useMemo`.
 * @param {import('react').ReactNode} props.children
 */
export function DispatchProvider({ dispatch, children }) {
  return <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>;
}

/**
 * Il dispatch dell'app. SOLLEVA fuori dal provider, come useAppData/useTasks:
 * un no-op silenzioso al suo posto darebbe un'interfaccia che sembra funzionare
 * e non scrive niente — il guasto peggiore possibile per una funzione il cui
 * unico scopo è cambiare lo stato.
 *
 * Nei test si passa `dispatch` a `renderWithAppData` (src/test/helpers/appData.jsx).
 */
export function useDispatch() {
  const dispatch = useContext(DispatchContext);
  if (!dispatch) {
    throw new Error(
      "useDispatch() richiede <DispatchProvider>. Nei test usa renderWithAppData(ui, { dispatch })."
    );
  }
  return dispatch;
}

export { DispatchContext };
