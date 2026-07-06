import React from 'react';
import { createRoot } from 'react-dom/client';
import VoyageDesk from './VoyageDesk.jsx';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginScreen from './auth/LoginScreen.jsx';
import UpdatePasswordScreen from './auth/UpdatePasswordScreen.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

const screenWrap = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: '#0f172a', color: '#e2e8f0',
  fontFamily: '"DM Sans",system-ui,sans-serif', fontSize: 14, padding: 24,
};

const loadingScreen = <div style={screenWrap}>Caricamento…</div>;

// Utente registrato ma non ancora approvato da un admin (pending=true).
// Non monta l'app: l'accesso ai dati è bloccato finché un admin non approva.
function PendingScreen() {
  const { profile, signOut } = useAuth();
  return (
    <div style={screenWrap}>
      <div style={{
        maxWidth: 420, textAlign: 'center', background: '#0b1220',
        border: '1px solid #1e293b', borderRadius: 16, padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h1 style={{
          margin: '0 0 8px', fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 700,
        }}>Account in attesa</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
          Ciao {profile?.name || ''}, la tua registrazione è stata ricevuta.
          Un amministratore deve approvare il tuo accesso prima che tu possa
          entrare. Riprova più tardi.
        </p>
        <button onClick={() => signOut()} style={{
          padding: '10px 18px', borderRadius: 10, border: '1px solid #334155',
          background: 'transparent', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit',
        }}>Esci</button>
      </div>
    </div>
  );
}

// Mostrato quando la session è valida ma il caricamento del profilo (loadProfile)
// è fallito, es. per un errore di rete transitorio al primo avvio. Offre un
// retry esplicito invece di lasciare l'utente bloccato sullo spinner "Caricamento…".
function ProfileErrorScreen({ onRetry, onSignOut }) {
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

function AuthGate() {
  const { session, profile, team, loading, recovery, authError, refreshTeam, retryInit, signOut } = useAuth();

  if (loading) return loadingScreen;

  // Recovery ha priorità: anche con una session valida, se l'utente arriva da
  // un link "reimposta password" mostriamo prima la schermata di aggiornamento.
  if (recovery) return <UpdatePasswordScreen />;

  // getSession() stessa è fallita o è andata in timeout (rete instabile,
  // mobile riportato in foreground dopo essere stato a lungo in background):
  // nessuna session è mai stata ottenuta, ma potrebbe essercene una valida
  // persistita. Senza questo ramo si finiva su LoginScreen forzando un
  // nuovo login anche quando la sessione salvata era ancora valida — qui
  // offriamo invece un retry che ritenta l'intera sequenza di init.
  if (authError && !session) return <ProfileErrorScreen onRetry={retryInit} onSignOut={signOut} />;

  if (!session) return <LoginScreen />;

  // Caveat #17: al login onAuthStateChange imposta la session prima che
  // profile/team siano caricati. Montare VoyageDesk con team vuoto congela
  // i mock nel reducer (useReducer inizializza una volta sola), quindi
  // aspettiamo il profilo prima di montare l'app.
  if (!profile) {
    // Il caricamento profilo è fallito (es. connessione DB a freddo dopo
    // inattività): senza questo ramo restava uno spinner infinito, con
    // l'unico recupero possibile un refresh manuale della pagina.
    if (authError) return <ProfileErrorScreen onRetry={refreshTeam} onSignOut={signOut} />;
    return loadingScreen;
  }

  // Gate utenti non approvati: niente accesso all'app finché pending=true.
  if (profile.pending) return <PendingScreen />;

  return (
    <VoyageDesk
      initialTeam={team}
      initialCurrentUserId={profile?.id}
    />
  );
}

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
