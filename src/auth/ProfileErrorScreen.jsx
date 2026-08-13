// Estratto da main.jsx (B-3 dell'audit del 13 agosto: un file, un componente
// — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import React from 'react';
import { screenWrap } from './screenWrap.js';

// Mostrato quando la session è valida ma il caricamento del profilo (loadProfile)
// è fallito, es. per un errore di rete transitorio al primo avvio. Offre un
// retry esplicito invece di lasciare l'utente bloccato sullo spinner "Caricamento…".
export function ProfileErrorScreen({ onRetry, onSignOut }) {
  const [retrying, setRetrying] = React.useState(false);
  const handleRetry = async () => {
    setRetrying(true);
    try { await onRetry(); } finally { setRetrying(false); }
  };
  return (
    <div style={screenWrap}>
      <div style={{
        maxWidth: 420, textAlign: 'center', background: '#0b1220',
        border: '1px solid #1e293b', borderRadius: 16, padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h1 style={{
          margin: '0 0 8px', fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 700,
        }}>Caricamento non riuscito</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
          Non è stato possibile caricare il tuo profilo. Può capitare al primo
          avvio per un blip di rete: riprova.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={handleRetry} disabled={retrying} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#D4A843', color: '#0f172a', fontWeight: 700,
            cursor: retrying ? 'default' : 'pointer', fontSize: 13, fontFamily: 'inherit',
            opacity: retrying ? 0.7 : 1,
          }}>{retrying ? 'Riprovo…' : 'Riprova'}</button>
          <button onClick={() => onSignOut()} style={{
            padding: '10px 18px', borderRadius: 10, border: '1px solid #334155',
            background: 'transparent', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer',
            fontSize: 13, fontFamily: 'inherit',
          }}>Esci</button>
        </div>
      </div>
    </div>
  );
}
