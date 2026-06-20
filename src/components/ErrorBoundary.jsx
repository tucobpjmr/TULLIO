// src/components/ErrorBoundary.jsx
// Boundary di primo livello: senza, qualsiasi errore di render lascia la pagina
// completamente bianca (nessun messaggio, niente da diagnosticare). Qui lo
// catturiamo e mostriamo il messaggio + stack, così l'errore è visibile e
// segnalabile invece di un blank, e offriamo un reload.
import React from 'react';

const wrap = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: '#0f172a', color: '#e2e8f0',
  fontFamily: '"DM Sans",system-ui,sans-serif', padding: 24,
};

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log in console per la diagnosi (lo stack minificato resta utile).
    console.error('[VoyageDesk] Errore non gestito nel render:', error, info);
    this.setState({ info });
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={wrap}>
        <div style={{
          maxWidth: 560, width: '100%', background: '#0b1220',
          border: '1px solid #1e293b', borderRadius: 16, padding: 28,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>⚠️</div>
          <h1 style={{
            margin: '0 0 8px', fontFamily: '"Playfair Display",serif',
            fontSize: 22, fontWeight: 700,
          }}>Qualcosa è andato storto</h1>
          <p style={{ margin: '0 0 16px', fontSize: 13.5, opacity: 0.75, lineHeight: 1.5 }}>
            L'app ha incontrato un errore imprevisto durante il caricamento.
            Ricarica la pagina; se il problema persiste, segnala il testo qui sotto.
          </p>
          <pre style={{
            margin: '0 0 16px', padding: 12, borderRadius: 10,
            background: '#020617', border: '1px solid #1e293b',
            color: '#fca5a5', fontSize: 12, lineHeight: 1.45,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            maxHeight: 240, overflow: 'auto',
          }}>
            {String(error?.message || error)}
            {info?.componentStack ? `\n${info.componentStack}` : ''}
          </pre>
          <button onClick={() => window.location.reload()} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#d4a843', color: '#0f172a', fontWeight: 700,
            cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
          }}>Ricarica</button>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
