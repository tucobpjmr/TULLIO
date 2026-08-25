import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './auth/AuthContext.jsx';
import { AuthGate } from './auth/AuthGate.jsx';
import ErrorBoundary from './components/errors/ErrorBoundary.jsx';
import { installaHandlerGlobali } from './lib/errorReporting.js';
// Il CSS globale (tema, keyframes, utility, safe-area): importato
// dall'entry perché Vite lo emetta come <link> nell'HTML iniziale — non
// più come <style> iniettato al mount. Vedi styles/global.css (M-1).
import './styles/global.css';

// Rete di sicurezza per gli errori che NON passano dai registry di persistenza
// e che quindi nessuno mostrerebbe: promise non gestite, errori in handler
// async, chunk lazy mancanti dopo un deploy. L'ErrorBoundary qui sotto copre
// solo il render — vedi lib/errorReporting.js. Installata prima di createRoot:
// un errore avvenuto prima dell'aggancio è per definizione fuori portata.
installaHandlerGlobali();

// Service worker per le Web Push (public/sw.js): solo notifiche, nessun
// caching. La sottoscrizione vera avviene dal toggle nel pannello notifiche;
// qui registriamo soltanto, così navigator.serviceWorker.ready è già risolto.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => {
      console.error('[VoyageDesk] registrazione service worker fallita:', e);
    });
  });
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
