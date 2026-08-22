// Estratto da main.jsx (B-3 dell'audit del 13 agosto: un file, un componente
// — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import React from 'react';
import { screenWrap } from './screenWrap.js';
import * as stiliComuni from "../styles/common.js";

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxTxtCenterP32 = {
  maxWidth: 420, textAlign: 'center', background: '#0b1220',
  border: '1px solid #1e293b', borderRadius: 16, padding: 32,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const txtF24Bold = {
  margin: '0 0 8px', fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 700,
};
const txtF14Op075 = { margin: '0 0 20px', fontSize: 14, opacity: 0.75, lineHeight: 1.5 };
const rowMiddleGap10 = { display: 'flex', gap: 10, justifyContent: 'center' };
const boxF13Bold = {
  padding: '10px 18px', borderRadius: 10, border: '1px solid #334155',
  background: 'transparent', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer',
  fontSize: 13, fontFamily: 'inherit',
};

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
      <div style={boxTxtCenterP32}>
        <div style={stiliComuni.txtF40Mb12}>⚠️</div>
        <h1 style={txtF24Bold}>Caricamento non riuscito</h1>
        <p style={txtF14Op075}>
          Non è stato possibile caricare il tuo profilo. Può capitare al primo
          avvio per un blip di rete: riprova.
        </p>
        <div style={rowMiddleGap10}>
          <button onClick={handleRetry} disabled={retrying} style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#D4A843', color: '#0f172a', fontWeight: 700,
            cursor: retrying ? 'default' : 'pointer', fontSize: 13, fontFamily: 'inherit',
            opacity: retrying ? 0.7 : 1,
          }}>{retrying ? 'Riprovo…' : 'Riprova'}</button>
          <button onClick={() => onSignOut()} style={boxF13Bold}>Esci</button>
        </div>
      </div>
    </div>
  );
}
