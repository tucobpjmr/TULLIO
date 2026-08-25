// src/components/errors/ErrorBoundary.jsx
// Boundary di primo livello: senza, qualsiasi errore di render lascia la pagina
// completamente bianca (nessun messaggio, niente da diagnosticare). Qui lo
// catturiamo e mostriamo cosa è successo, così l'errore è visibile e
// segnalabile invece di un blank, e offriamo un reload.
//
// ─── CRITICITÀ #9 · lo stack non è per l'utente ────────────────────────────
// Prima il pannello stampava sempre `error.message` PIÙ l'intero
// `componentStack`. Due problemi distinti:
//
//   RUMORE — "Cannot read properties of undefined (reading 'assignees')"
//   seguito da quaranta righe di `in TaskCard (at PersonalQueue.jsx:118)` non
//   dice a un agente di viaggio nulla che possa usare. Nasconde l'unica frase
//   utile ("ricarica, e se si ripete segnala") sotto un muro di testo.
//
//   INFORMATION DISCLOSURE — lo stack dei componenti è una mappa della
//   struttura interna dell'app, mostrata a chiunque guardi lo schermo:
//   utente, cliente seduto alla scrivania di fronte, screenshot in un gruppo
//   WhatsApp. Non è un segreto crittografico, ma è informazione che non
//   serve a chi la vede e aiuta chi cerca una superficie d'attacco.
//
// La divisione è netta: in DEV il dettaglio completo resta a schermo (è lì che
// serve, ed è dove si sviluppa); in produzione a schermo va un CODICE DI
// SEGNALAZIONE e il dettaglio completo va in console, dove è recuperabile da
// chi deve leggerlo senza essere in faccia a chi non deve. `import.meta.env.DEV`
// è la costante `false` in produzione, quindi il ramo con lo stack esce dal
// bundle invece di restare solo irraggiungibile (stessa tecnica di demoState.js).
//
// Il ciclo di vita (codice di segnalazione, log in console, scelta fra children
// e pannello) sta in creaErrorBoundary.jsx: qui restano il pannello e la via
// d'uscita, che sono le uniche cose che distinguono questo boundary dagli
// altri due — M-3 dell'audit del 25 agosto.
import { creaErrorBoundary } from './creaErrorBoundary.jsx';
import { ErrorDetails } from '../ui/ErrorDetails.jsx';

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const boxP28WFull = {
  maxWidth: 560, width: '100%', background: '#0b1220',
  border: '1px solid #1e293b', borderRadius: 16, padding: 28,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const txtF36Mb10 = { fontSize: 36, marginBottom: 10 };
const txtF22Bold = {
  margin: '0 0 8px', fontFamily: '"Playfair Display",serif',
  fontSize: 22, fontWeight: 700,
};
const txtF135Op075 = { margin: '0 0 16px', fontSize: 13.5, opacity: 0.75, lineHeight: 1.5 };
const boxF13Bold = {
  padding: '10px 18px', borderRadius: 10, border: 'none',
  background: '#d4a843', color: '#0f172a', fontWeight: 700,
  cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
};

const wrap = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: '#0f172a', color: '#e2e8f0',
  fontFamily: '"DM Sans",system-ui,sans-serif',
  padding: 'calc(24px + var(--safe-top)) 24px calc(24px + var(--safe-bottom))',
};

// L'unica via d'uscita possibile a questo livello è ricaricare: quando salta la
// shell — provider compresi — non resta niente di sano da cui ripartire senza
// ricostruire l'albero da zero.
function PannelloErroreApp({ error, info, codice }) {
  return (
    <div style={wrap}>
      <div style={boxP28WFull}>
        <div style={txtF36Mb10}>⚠️</div>
        <h1 style={txtF22Bold}>Qualcosa è andato storto</h1>
        <p style={txtF135Op075}>
          L&#39;app ha incontrato un errore imprevisto durante il caricamento.
          Ricarica la pagina; se il problema persiste, segnala il codice qui sotto.
        </p>
        <ErrorDetails error={error} info={info} codice={codice} tone="dark" />
        <button onClick={() => window.location.reload()} style={boxF13Bold}>Ricarica</button>
      </div>
    </div>
  );
}

// Nessuna `chiaveReset`: è il boundary che copre TUTTO, non esiste una
// navigazione interna che possa dire «quello di prima non conta più».
export const ErrorBoundary = creaErrorBoundary({
  nome: 'ErrorBoundary',
  messaggio: () => 'Errore non gestito nel render',
  Fallback: PannelloErroreApp,
});

export default ErrorBoundary;
