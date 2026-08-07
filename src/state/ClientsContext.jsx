// src/state/ClientsContext.jsx
// L'anagrafica clienti dello state del reducer, distribuita per contesto.
//
// Contesto SEPARATO da quello dei task e non un unico provider "dati di
// dominio": un value condiviso cambierebbe identità quando cambia una
// qualsiasi delle due fette, e il calendario tornerebbe a ri-renderizzarsi
// all'arrivo di un cliente importato. Due contesti costano due righe in più nel
// guscio e mantengono le invalidazioni sul dato che le causa.
//
// Il resto del ragionamento — perché per contesto e non per prop, e perché
// serve anche `memo` sulla vista — sta in TasksContext.jsx.

import { createContext, useContext, useMemo } from "react";

const ClientsContext = createContext(null);

/**
 * @param {object} props
 * @param {Array}  props.clients  l'anagrafica dello state del reducer (state.clients)
 */
export function ClientsProvider({ clients, children }) {
  const value = useMemo(() => ({ clients: clients || [] }), [clients]);
  return <ClientsContext.Provider value={value}>{children}</ClientsContext.Provider>;
}

/**
 * SOLLEVA fuori dal provider, come useAppData/useTasks: vedi la nota in
 * TasksContext.jsx sul perché un fallback silenzioso sarebbe peggio.
 */
export function useClients() {
  const ctx = useContext(ClientsContext);
  if (!ctx) {
    throw new Error(
      "useClients() richiede <ClientsProvider>. Nei test usa renderWithAppData(ui, { clients: [...] })."
    );
  }
  return ctx.clients;
}

export { ClientsContext };
