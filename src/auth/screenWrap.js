// Stile condiviso dalle schermate a tutta pagina mostrate PRIMA che l'app
// monti (splash, pending, errore di caricamento profilo) — estratto da
// main.jsx (B-3 dell'audit del 13 agosto: un file, un componente).
export const screenWrap = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: '#0f172a', color: '#e2e8f0',
  fontFamily: '"DM Sans",system-ui,sans-serif', fontSize: 14,
  padding: 'calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom))',
};
