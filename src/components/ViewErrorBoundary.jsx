// src/components/ViewErrorBoundary.jsx
// Boundary di secondo livello, attorno alla sola vista attiva.
//
// L'ErrorBoundary di primo livello (components/ErrorBoundary.jsx, montato in
// main.jsx) copre tutta l'app: quando scatta sostituisce l'intera interfaccia
// con una schermata a tutta pagina, e l'unica via d'uscita è "Ricarica". È il
// comportamento giusto per un errore che nasce nella shell — Topbar, Sidebar,
// provider — perché lì non c'è nulla di sano da preservare.
//
// Per un errore che nasce DENTRO una vista è una reazione sproporzionata: la
// shell è integra, le altre viste funzionano, e l'utente perde comunque tutta
// Tullio. Vale in particolare per il modulo Liste viaggio, che è il codice più
// recente e meno rodato e — essendo lazy — è anche l'unico che può fallire in
// un momento qualsiasi della sessione e non solo all'avvio.
//
// Qui l'errore resta confinato al riquadro della vista: Topbar, Sidebar e
// bottom-nav restano vive e navigabili, e si torna alla Dashboard senza
// ricaricare la pagina (quindi senza perdere sessione e stato in memoria).
import React from 'react';
import { codiceSegnalazione } from '../lib/errorReporting.js';
import { ErrorDetails } from './ui/ErrorDetails.jsx';

export class ViewErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, codice: null, viewKey: props.viewKey };
  }

  static getDerivedStateFromError(error) {
    // Criticità #9: il codice nasce col pannello e non a ogni render, così
    // quello dettato dall'utente è quello scritto in console.
    return { error, codice: codiceSegnalazione() };
  }

  // Cambiando vista il boundary si riarma da solo: senza questo, dopo un
  // crash resterebbe bloccato sul messaggio d'errore anche navigando altrove,
  // perché React non rimonta il boundary al cambio di children.
  static getDerivedStateFromProps(props, state) {
    if (props.viewKey !== state.viewKey) {
      return { error: null, info: null, codice: null, viewKey: props.viewKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error(
      `[VoyageDesk] Errore nella vista "${this.props.viewKey}" (${this.state.codice}):`,
      error, info,
    );
    this.setState({ info });
  }

  render() {
    const { error, info, codice } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="fade-in" style={{ padding: 28, maxWidth: 620 }}>
        <div style={{
          background: 'var(--card)', border: '1px solid var(--border)',
          borderRadius: 14, padding: 24,
        }}>
          <div style={{ fontSize: 30, marginBottom: 10 }}>⚠️</div>
          <h2 className="playfair" style={{
            margin: '0 0 8px', fontSize: 20, color: 'var(--heading)',
          }}>Questa sezione ha avuto un problema</h2>
          <p style={{
            margin: '0 0 16px', fontSize: 13.5, color: 'var(--text-muted)', lineHeight: 1.5,
          }}>
            Il resto di Tullio continua a funzionare: puoi tornare alla Dashboard
            e riprendere da lì. Se il problema si ripete, segnala il codice qui sotto.
          </p>
          <ErrorDetails error={error} info={info} codice={codice} />
          <button
            onClick={this.props.onReset}
            style={{
              padding: '9px 18px', borderRadius: 9, border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--navy)', fontWeight: 600,
              cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
            }}
          >← Torna alla Dashboard</button>
        </div>
      </div>
    );
  }
}

export default ViewErrorBoundary;
