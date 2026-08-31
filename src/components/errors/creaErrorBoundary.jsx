// src/components/errors/creaErrorBoundary.jsx
// M-3 dell'audit del 25 agosto · UNA sola implementazione del ciclo di vita di
// un error boundary.
//
// PERCHÉ ESISTE. L'app ha tre boundary, e devono restare tre: coprono tre
// superfici diverse (l'intera app, la sola vista attiva, un overlay lazy) e
// mostrano tre messaggi diversi con tre vie d'uscita diverse — ricaricare,
// tornare alla Dashboard, chiudere il pannello. Quella parte è dominio, ed è
// giusto che sia scritta tre volte.
//
// Quello che NON è dominio è il resto, ed era copiato tre volte identico:
// `getDerivedStateFromError` che genera il codice di segnalazione UNA volta per
// pannello (criticità #9), `componentDidCatch` che scrive in console lo stesso
// codice più il dettaglio completo, `getDerivedStateFromProps` che riarma il
// boundary quando cambia la chiave d'identità, e il `render` che sceglie fra
// `children` e il pannello d'errore. Circa quaranta righe di lifecycle in
// triplice copia, con le derive già iniziate: ViewErrorBoundary e
// OverlayErrorBoundary si riarmavano su prop diverse (`viewKey`/`resetKey`) con
// lo stesso codice, e ErrorBoundary — l'unico senza riarmo — aveva un
// `getDerivedStateFromProps` in meno che nessuno avrebbe notato mancare.
//
// Il rischio non era teorico: una policy replicata tre volte è una policy che
// fra sei mesi esiste in due varianti. È esattamente la ragione per cui il
// riquadro del dettaglio era già stato unificato in ui/ErrorDetails.jsx — qui
// si applica lo stesso ragionamento al lifecycle che gli sta intorno.
//
// COSA RESTA AL CHIAMANTE: il pannello (`Fallback`), la riga di log
// (`messaggio`) e il nome della prop che riarma (`chiaveReset`). Cioè le tre
// cose che DAVVERO distinguono i tre boundary.
import React from 'react';
import { codiceSegnalazione, isChunkMancante } from '../../lib/errorReporting.js';
import { PannelloAppAggiornata } from './PannelloAppAggiornata.jsx';

/**
 * @param {object}   spec
 * @param {string}   spec.nome         nome della classe nei React DevTools.
 * @param {string?}  spec.chiaveReset  prop d'identità che riarma il boundary
 *   (`viewKey`, `resetKey`). `null` = nessun riarmo: il boundary resta sul
 *   messaggio finché non viene smontato o la pagina non viene ricaricata, ed è
 *   il comportamento giusto per quello di primo livello.
 * @param {(props: object) => string} spec.messaggio  la riga di console, che
 *   può nominare ciò che è esploso (la vista, il modale).
 * @param {React.ComponentType} spec.Fallback  il pannello d'errore. Riceve
 *   `{ error, info, codice, onReset }`.
 */
export function creaErrorBoundary({ nome, chiaveReset = null, messaggio, Fallback }) {
  const iniziale = (props) => ({
    error: null, info: null, codice: null, obsoleto: false,
    reset: chiaveReset ? props[chiaveReset] : null,
  });

  class Boundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = iniziale(props);
    }

    // Criticità #9: il codice nasce QUI e non nel render, così resta lo stesso
    // per tutta la vita del pannello — altrimenti l'utente ne detta uno e in
    // console ce n'è un altro. `obsoleto` si decide nello stesso posto e per
    // la stessa ragione (A-4): è una proprietà dell'errore CATTURATO, non deve
    // poter cambiare mentre il pannello è a schermo.
    static getDerivedStateFromError(error) {
      return { error, codice: codiceSegnalazione(), obsoleto: isChunkMancante(error) };
    }

    // Cambiando identità il boundary si riarma da solo. Senza, dopo un crash
    // resterebbe bloccato sul messaggio d'errore anche navigando altrove:
    // React non rimonta un boundary quando cambiano i suoi `children`.
    static getDerivedStateFromProps(props, state) {
      if (!chiaveReset || props[chiaveReset] === state.reset) return null;
      return iniziale(props);
    }

    componentDidCatch(error, info) {
      // Il dettaglio completo vive QUI, in console, con accanto lo stesso
      // codice mostrato a schermo: è la coppia che rende il codice utile.
      console.error(
        `[VoyageDesk] ${messaggio(this.props)} (${this.state.codice}):`,
        error, info,
      );
      this.setState({ info });
    }

    render() {
      const { error, info, codice, obsoleto } = this.state;
      if (!error) return this.props.children;
      // Un chunk mancante NON è un errore di QUESTA vista o di QUESTO modale:
      // è la scheda che sta girando su un deploy che non esiste più. La via
      // d'uscita dei tre pannelli (ricarica / torna alla Dashboard / chiudi)
      // è specifica del dominio di ciascuno ed è giusta — ma nessuna delle
      // tre ripara QUESTO, e due su tre richiudono il ciclo. Qui il rimedio è
      // uno solo per tutti e tre (A-4).
      if (obsoleto) return <PannelloAppAggiornata />;
      return <Fallback error={error} info={info} codice={codice} onReset={this.props.onReset} />;
    }
  }

  Boundary.displayName = nome;
  return Boundary;
}
