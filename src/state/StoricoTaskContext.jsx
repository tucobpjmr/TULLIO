// src/state/StoricoTaskContext.jsx
// A-3 (audit performance/UX del 16 agosto, secondo passaggio), seconda metà.
//
// PERCHÉ ESISTE. Dal 17 agosto l'idratazione non scarica più tutto lo storico
// dei task: chiede una finestra — le non completate, più le completate degli
// ultimi 60 giorni — e NON chiede il cestino (vedi `hooks/useAppHydration.js`).
// È la metà che fa risparmiare; da sola sarebbe una perdita di dati, perché
// alcune viste guardano esattamente ciò che la finestra lascia fuori.
//
// Questo modulo è l'altra metà: il canale con cui quelle viste dicono «a me
// serve il corpus intero». Una riga per vista, al mount:
//
//     const caricandoStorico = useStoricoTaskCompleto();
//
// e da lì in poi lo stato contiene tutto — per il resto della sessione, anche
// dopo una riconnessione (`useAppHydration` tiene il ref alzato apposta).
//
// CHI LA CHIAMA, E PERCHÉ CIASCUNA. L'elenco è corto e va tenuto tale: ogni
// call site è una vista che, senza la richiesta, mostrerebbe un numero o un
// elenco PLAUSIBILE e sbagliato — che è la stessa famiglia di difetto degli
// stati di attesa disonesti, non un dettaglio di completezza.
//
//   • `views/Archive.jsx`   — l'archivio SONO le task completate. Con la sola
//                             finestra mostrerebbe «le completate degli ultimi
//                             60 giorni» chiamandole «209 task completate».
//   • `views/Trash.jsx`     — il cestino non è nella finestra per costruzione,
//                             ed è la vista in cui si va a cercare qualcosa
//                             che si crede eliminato per sbaglio: una risposta
//                             sbagliata lì chiude la ricerca.
//   • `admin/tabs/AdminStatsTab.jsx` — il tasso di completamento è un rapporto
//                             fra due conteggi sullo stesso array: una
//                             finestra che ne pota uno solo lo falsa senza
//                             lasciare traccia.
//   • `admin/tabs/AdminIOTab.jsx`    — l'export è un BACKUP. Un backup che
//                             omette in silenzio le task più vecchie è peggio
//                             di un export fallito.
//   • `search/AdvancedSearchPanel.jsx` — ha una casella «includi cestinati» e
//                             un filtro per stato: entrambi promettono di
//                             cercare in ciò che la finestra non ha caricato.
//
// ⛔ Non chiamarlo da una vista d'ingresso (Dashboard, Calendario, TaskSlideOver,
// le schede cliente): filtrano tutte con `getActiveTasks`/`isActiveTask`, cioè
// guardano precisamente la parte che la finestra garantisce. Aggiungere lì la
// richiesta annullerebbe A-3 lasciandone in piedi il codice.
//
// PERCHÉ UN CONTESTO E NON UNA PROP. Tre dei cinque call site sono tab o
// pannelli montati a due o tre livelli di distanza da chi possiede l'hook di
// idratazione (`AdminView` → `tabs/*`, `Topbar` → `AdvancedSearchPanel`), e
// far scendere una coppia richiesta+flag attraverso quei livelli significa
// darla anche a chi non la usa — con l'effetto, su componenti `memo`, di
// invalidarli per una prop che ignorano. Il contesto la consegna solo a chi la
// chiede, che è anche l'unico modo perché l'elenco qui sopra resti leggibile.

import { createContext, useContext, useEffect, useMemo } from "react";

const StoricoTaskContext = createContext(null);

/**
 * @param {object}   props
 * @param {Function} props.richiedi   idempotente: carica il corpus intero la
 *                                    prima volta e poi non fa più nulla
 *                                    (`useAppHydration().storicoTask.richiedi`)
 * @param {boolean}  props.caricando  true finché quella richiesta è in volo
 */
export function StoricoTaskProvider({ richiedi, caricando = false, children }) {
  const value = useMemo(() => ({ richiedi, caricando }), [richiedi, caricando]);
  return <StoricoTaskContext.Provider value={value}>{children}</StoricoTaskContext.Provider>;
}

/**
 * Dichiara che questa vista ha bisogno dello storico INTERO dei task, e
 * restituisce `true` finché non è arrivato.
 *
 * Il flag va usato come gli altri flag di attesa (`docs/CLAUDE.md`, «stati di
 * attesa onesti»): finché è alzato la vista mostra uno scheletro o dei puntini,
 * non un conteggio parziale spacciato per totale. Si chiude sia sul successo
 * SIA sull'errore — dopo un errore il canale è il toast, e sotto va mostrato
 * ciò che si è riusciti a caricare.
 *
 * SOLLEVA fuori dal provider, come `useTasks()` e `useAppData()`. Il fallback
 * silenzioso qui sarebbe la cosa peggiore possibile: una vista che continua a
 * funzionare mostrando la sola finestra, cioè un archivio che sembra completo
 * e non lo è. È la classe di guasto che questo file esiste per impedire.
 */
export function useStoricoTaskCompleto() {
  const ctx = useContext(StoricoTaskContext);
  // L'effetto sta PRIMA del controllo perché gli hook non si chiamano dopo un
  // `return`/`throw` condizionale (react-hooks/rules-of-hooks). Non cambia il
  // comportamento: senza provider il render solleva due righe più sotto, e un
  // effetto di un render che ha sollevato non viene mai eseguito.
  const richiedi = ctx?.richiedi;
  useEffect(() => { richiedi?.(); }, [richiedi]);
  if (!ctx) {
    throw new Error(
      "useStoricoTaskCompleto() richiede <StoricoTaskProvider>. Nei test usa "
      + "renderWithAppData(ui, { … }), che lo monta con una richiesta no-op."
    );
  }
  return ctx.caricando;
}

export { StoricoTaskContext };
