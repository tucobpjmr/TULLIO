// src/hooks/useErroriIdratazione.js
// ─── A-3 dell'audit UX/errori del 31 agosto · IL TERZO STATO ───────────────
//
// «Questa entità si è caricata?» aveva due risposte possibili e ne servivano
// tre.
//
// PERCHÉ ESISTE. `useAppHydration` espone `caricamento[entita]`, che chiude a
// `false` sia sul successo sia sull'ERRORE del primo fetch. La scelta è
// dichiarata nel suo preambolo ed è giusta — *«uno scheletro che gira per
// sempre è disonesto quanto un vuoto dichiarato troppo presto»* — ma la sua
// conseguenza non era chiusa: dopo un errore la vista non aveva uno stato
// d'errore da mostrare, quindi mostrava lo stato VUOTO. Con lo stesso testo di
// quando i dati ci sono davvero e sono zero:
//
//   Dashboard → «Nessuna task aperta a tuo nome. Buon lavoro!»
//   Archivio  → «Archivio vuoto»
//   Bacheca   → «Nessun avviso»
//
// È la criticità #6 vista dall'altro capo. Quella riguardava la finestra
// PRIMA della risposta («non lo so ancora» detto come «non c'è niente»),
// questa la finestra DOPO una risposta fallita. In un gestionale è la stessa
// classe di bugia che errorReporting.js chiama «credo di aver salvato»:
// qualcuno smette di lavorare su una coda che crede vuota.
//
// PERCHÉ NON BASTAVA IL TOAST, che pure c'era (sei `onError` in
// useAppHydration). Il toast è il canale giusto per l'ANNUNCIO ed è effimero
// per costruzione: l'utente lo chiude, o il cap della coda lo espelle quando
// ne arrivano altri. Da quel momento a schermo non resta nulla che dica che
// quei numeri non sono i numeri. E non c'era alcuna via di recupero: l'unica
// era ricaricare la pagina, cosa che l'interfaccia non suggeriva da nessuna
// parte.
//
// PERCHÉ IN UN FILE SUO. Stessa ragione di state/toastQueue.js e
// state/activityLog.js: `useAppHydration` ha un tetto di righe che non è un
// margine da consumare ma una deroga alla sua FORMA — sei idratazioni che si
// leggono una accanto all'altra. Aggiungendo A-3 il file arrivava al tetto, e
// la domanda giusta in quel punto è quale fetta meriti un file suo. Questa lo
// merita: non è idratazione, è la POLITICA di come si ricorda e si compone un
// fallimento, e non conosce nessuna delle sei entità per nome.
import { useState, useCallback, useMemo } from "react";

// Allocato UNA volta a livello di modulo: `useState({})` costruirebbe un
// letterale nuovo a ogni render — React usa solo il primo, ma il valore
// diventerebbe un'identità diversa per ogni istanza dell'hook senza motivo.
const VUOTO = {};

/**
 * @returns {{
 *   segnaEsito: (entita: string, messaggio?: string|null) => void,
 *   componi: (voci: Array<[string, () => void]>) => Record<string, {messaggio: string, riprova: () => void}|null>,
 * }}
 */
export function useErroriIdratazione() {
  // `entita → messaggio | null`. Il messaggio è quello del toast, RIPETUTO e
  // non riscritto: due frasi diverse per lo stesso evento davanti allo stesso
  // utente sono la cosa che state/registroScritture.js esiste per impedire.
  const [erroriPerEntita, impostaErrori] = useState(VUOTO);

  // Idempotente come `segnaCaricata`, e per la stessa ragione: un reload
  // realtime che fallisce due volte con lo stesso messaggio non deve
  // sostituire l'oggetto, o le viste memoizzate si sveglierebbero a ogni
  // tentativo.
  const segnaEsito = useCallback((entita, messaggio = null) => {
    impostaErrori(prec => {
      const precedente = prec[entita] ?? null;
      if (precedente === messaggio) return prec;
      return { ...prec, [entita]: messaggio };
    });
  }, []);

  /**
   * Unisce le due metà in ciò che le viste leggono.
   *
   * Arrivano da posti diversi ed è giusto così: il MESSAGGIO lo sa chi ha
   * visto fallire la richiesta (`segnaEsito`, chiamata dentro il reload), la
   * RIPROVA la sa la sottoscrizione che quel reload lo possiede — e passare da
   * lì è ciò che tiene il tentativo dentro il gen-counter invece di farne una
   * corsa a parte (vedi `ricarica` in useDebouncedTableSubscription).
   *
   * `voci` è un array di coppie `[entita, ricarica]` e non un oggetto: il
   * chiamante lo scrive in linea, e un array di coppie non chiede di
   * ricordarsi che le chiavi debbano coincidere con quelle di `segnaEsito` —
   * ce le mette lui, nello stesso punto.
   */
  const componi = useCallback((voci) => Object.fromEntries(
    voci.map(([entita, riprova]) => [
      entita,
      erroriPerEntita[entita] ? { messaggio: erroriPerEntita[entita], riprova } : null,
    ]),
  ), [erroriPerEntita]);

  return { segnaEsito, componi };
}

/**
 * Il memo che il chiamante applica al risultato di `componi`. Sta qui e non nel
 * chiamante perché la dipendenza da ricordare è una sola e non ovvia: gli
 * handle di ricarica hanno identità stabile per la vita dell'hook, quindi
 * l'unica cosa che può cambiare è `componi` — e senza il memo l'oggetto
 * sarebbe nuovo a ogni render, cioè le viste `memo` si sveglierebbero tutte
 * a ogni azione dell'utente.
 */
export function useErroriComposti(componi, voci) {
  // `voci` è un letterale in linea nel chiamante (identità nuova a ogni
  // render) e NON entra nelle dipendenze: il suo contenuto — le sei coppie
  // entità/handle — è costante per la vita dell'hook, e includerlo
  // annullerebbe il memo che questa funzione esiste per dare.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => componi(voci), [componi]);
}
