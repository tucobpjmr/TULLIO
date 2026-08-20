// src/state/ClientiCompletiContext.jsx
// M-1 (passo 2) dell'audit performance/UX del 19 agosto, seconda metà.
//
// PERCHÉ ESISTE. `Clients.list()` scaricava l'anagrafica INTERA a ogni
// idratazione e a ogni ripresa dopo un buco di connessione — 874 righe il 19
// agosto, alimentate a blocchi da 200 dall'import, quindi a scalini. Era
// l'unica entità di dominio rimasta senza finestra, ed è lo stesso tipo di
// correttezza che A-3 descriveva per i task: giusta, e che peggiora da sola
// man mano che l'agenzia usa il gestionale.
//
// ⚠️ LA FINESTRA QUI È VUOTA, e non è una scorciatoia. Per i task esisteva un
// criterio naturale — «non completate, più le completate degli ultimi 60
// giorni» — perché una task ha un ciclo di vita. Un cliente non «scade»: non
// c'è un `completeDal` equivalente, e qualunque soglia temporale
// («aggiornati di recente») taglierebbe fuori proprio le schede vecchie che
// si vanno a cercare. La domanda giusta non era «quali clienti servono
// all'avvio» ma «a CHI serve l'anagrafica» — e la risposta, dopo che la
// tendina di suggerimento è passata alla ricerca lato server
// (`hooks/useRicercaClienti.js`), sono due viste soltanto.
//
// CHI LA CHIAMA, E PERCHÉ CIASCUNA. Come per `StoricoTaskContext`, l'elenco è
// corto e va tenuto tale:
//
//   • `clients/ClientiView.jsx`  — l'anagrafica È la vista: elenco, ricerca,
//                                  conteggi «818 di 874». Con una finestra
//                                  mostrerebbe un sottoinsieme chiamandolo
//                                  totale, che è la stessa famiglia di
//                                  difetto degli stati di attesa disonesti.
//   • `liste/ListeViaggio.jsx`   — passa `clients` a `NuovaListaModal` e a
//                                  `ListaDetail`, cioè ai due selettori di
//                                  TITOLARE e COINTESTATARIO. Un titolare che
//                                  non compare nel selettore non è un dato
//                                  mancante: è un operatore che ricrea una
//                                  scheda che esiste già, e il doppione in
//                                  anagrafica a posteriori non è banale da
//                                  deduplicare (è il difetto che la
//                                  sottoscrizione realtime su `clients` esiste
//                                  per impedire).
//
// ⛔ Non chiamarlo da una vista che vuole solo SUGGERIRE un cliente: per
// quello c'è `useClientSuggestions`, che interroga il server. Aggiungere qui
// `QuickAddTask` o `TaskSlideOver` — che si aprono da ogni vista e quasi ogni
// sessione — annullerebbe M-1 lasciandone in piedi il codice, esattamente come
// A-3 avverte per le viste d'ingresso.
//
// PERCHÉ UN CONTESTO E NON UNA PROP: le stesse ragioni di StoricoTaskContext —
// i due call site sono viste montate dal guscio, e far scendere una coppia
// richiesta+flag attraverso `renderView` significherebbe darla anche a chi non
// la usa, invalidando i `memo` per una prop che ignorano.

import { createContext, useContext, useEffect, useMemo } from "react";

const ClientiCompletiContext = createContext(null);

/**
 * @param {object}   props
 * @param {Function} props.richiedi   idempotente: carica l'anagrafica intera
 *                                    la prima volta e poi non fa più nulla
 *                                    (`useAppHydration().clientiCompleti.richiedi`)
 * @param {boolean}  props.caricando  true finché quella richiesta è in volo
 */
export function ClientiCompletiProvider({ richiedi, caricando = false, children }) {
  const value = useMemo(() => ({ richiedi, caricando }), [richiedi, caricando]);
  return (
    <ClientiCompletiContext.Provider value={value}>
      {children}
    </ClientiCompletiContext.Provider>
  );
}

/**
 * Dichiara che questa vista ha bisogno dell'anagrafica INTERA, e restituisce
 * `true` finché non è arrivata.
 *
 * Il flag va usato come gli altri flag di attesa (`docs/CLAUDE.md`, «stati di
 * attesa onesti»): finché è alzato la vista mostra uno scheletro, non un
 * elenco parziale spacciato per totale. Si chiude sia sul successo SIA
 * sull'errore — dopo un errore il canale è il toast.
 *
 * SOLLEVA fuori dal provider, come `useStoricoTaskCompleto()`. Il fallback
 * silenzioso sarebbe la cosa peggiore: una vista che continua a funzionare
 * mostrando i pochi clienti finiti in stato per altre vie (una creazione
 * ottimistica, un evento realtime) e li presenta come l'anagrafica.
 */
export function useClientiCompleti() {
  const ctx = useContext(ClientiCompletiContext);
  // L'effetto sta PRIMA del controllo perché gli hook non si chiamano dopo un
  // `throw` condizionale (react-hooks/rules-of-hooks). Non cambia il
  // comportamento: senza provider il render solleva due righe più sotto, e un
  // effetto di un render che ha sollevato non viene mai eseguito.
  const richiedi = ctx?.richiedi;
  useEffect(() => { richiedi?.(); }, [richiedi]);
  if (!ctx) {
    throw new Error(
      "useClientiCompleti() richiede <ClientiCompletiProvider>. Nei test usa "
      + "renderWithAppData(ui, { … }), che lo monta con una richiesta no-op."
    );
  }
  return ctx.caricando;
}

export { ClientiCompletiContext };
