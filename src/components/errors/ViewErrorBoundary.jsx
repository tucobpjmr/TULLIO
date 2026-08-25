// src/components/errors/ViewErrorBoundary.jsx
// Boundary di secondo livello, attorno alla sola vista attiva.
//
// L'ErrorBoundary di primo livello (errors/ErrorBoundary.jsx, montato in
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
import { creaErrorBoundary } from './creaErrorBoundary.jsx';
import { ErrorDetails } from '../ui/ErrorDetails.jsx';

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const p28MaxW620 = { padding: 28, maxWidth: 620 };
const boxP24R14 = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 14, padding: 24,
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

function PannelloErroreVista({ error, info, codice, onReset }) {
  return (
    <div className="fade-in" style={p28MaxW620}>
      <div style={boxP24R14}>
        <div style={txtF30Mb10}>⚠️</div>
        <h2 className="playfair" style={txtF20Heading}>Questa sezione ha avuto un problema</h2>
        <p style={txtF135Muted}>
          Il resto di Tullio continua a funzionare: puoi tornare alla Dashboard
          e riprendere da lì. Se il problema si ripete, segnala il codice qui sotto.
        </p>
        <ErrorDetails error={error} info={info} codice={codice} />
        <button onClick={onReset} style={boxF13Bold}>← Torna alla Dashboard</button>
      </div>
    </div>
  );
}

// `viewKey`: cambiando vista il boundary si riarma da solo — vedi
// creaErrorBoundary.jsx, dove quel confronto vive una volta sola.
export const ViewErrorBoundary = creaErrorBoundary({
  nome: 'ViewErrorBoundary',
  chiaveReset: 'viewKey',
  messaggio: (props) => `Errore nella vista "${props.viewKey}"`,
  Fallback: PannelloErroreVista,
});

export default ViewErrorBoundary;
