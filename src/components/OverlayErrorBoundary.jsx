// src/components/OverlayErrorBoundary.jsx
// Boundary attorno ai modali lazy (TaskSlideOver, BulkTaskCreator).
//
// React non dà un error boundary implicito a `lazy()`/`Suspense`: se il
// chunk risponde 404 dopo un deploy, o il modale semplicemente esplode in
// render, l'errore sale fino all'ErrorBoundary di main.jsx — quello che
// sostituisce TUTTA l'app con la schermata "Ricarica". Sproporzionato per un
// pannello: la dashboard sotto resta integra, e l'utente stava solo aprendo
// un task o una creazione bulk.
//
// Qui l'errore resta confinato all'overlay: si chiude, il resto di Tullio
// resta usabile. Stesso schema di ViewErrorBoundary (getDerivedStateFromProps
// per riarmarsi), ma con `resetKey` invece di `viewKey`: serve perché
// TaskSlideOver resta MONTATO quando si passa da un task all'altro senza
// chiudere (es. click su una notifica mentre un altro task è già aperto —
// vedi VoyageDesk.jsx, openTaskById) — senza il confronto d'identità un
// crash sul task precedente resterebbe visibile aprendo quello nuovo.
import React from 'react';
import { Z } from '../styles/tokens.js';
import { codiceSegnalazione } from '../lib/errorReporting.js';
import { ErrorDetails } from './ui/ErrorDetails.jsx';

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxP24WFull = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24, maxWidth: 420, width: '100%',
};
const txtF30Mb10 = { fontSize: 30, marginBottom: 10 };
const txtF20Heading = {
  margin: '0 0 8px', fontSize: 20, color: 'var(--heading)',
};
const txtF135Muted = {
  margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5,
};
const boxF13Bold = {
  padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)',
  background: 'var(--card)', color: 'var(--navy)', fontWeight: 600,
  cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};

export class OverlayErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, codice: null, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error) {
    // Criticità #9: vedi ui/ErrorDetails.jsx per la policy dev/produzione.
    return { error, codice: codiceSegnalazione() };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, info: null, codice: null, resetKey: props.resetKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error(`[VoyageDesk] Errore in un modale (${this.state.codice}):`, error, info);
    this.setState({ info });
  }

  render() {
    const { error, info, codice } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: Z.modal,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,21,45,0.35)', padding: 20,
      }}>
        <div className="fade-in" style={boxP24WFull}>
          <div style={txtF30Mb10}>⚠️</div>
          <h2 className="playfair" style={txtF20Heading}>Non è stato possibile aprire questo pannello</h2>
          <p style={txtF135Muted}>
            Il resto di Tullio continua a funzionare. Se il problema si ripete,
            segnala il codice qui sotto.
          </p>
          <ErrorDetails error={error} info={info} codice={codice} />
          <button
            onClick={this.props.onReset}
            style={boxF13Bold}
          >Chiudi</button>
        </div>
      </div>
    );
  }
}

export default OverlayErrorBoundary;
