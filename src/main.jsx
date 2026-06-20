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

function AuthGate() {
  const { session, profile, team, loading, recovery } = useAuth();

  if (loading) return loadingScreen;

  // Recovery ha priorità: anche con una session valida, se l'utente arriva da
  // un link "reimposta password" mostriamo prima la schermata di aggiornamento.
  if (recovery) return <UpdatePasswordScreen />;

  if (!session) return <LoginScreen />;

  // Caveat #17: al login onAuthStateChange imposta la session prima che
  // profile/team siano caricati. Montare VoyageDesk con team vuoto congela
  // i mock nel reducer (useReducer inizializza una volta sola), quindi
  // aspettiamo il profilo prima di montare l'app.
  if (!profile) return loadingScreen;

  // Gate utenti non approvati: niente accesso all'app finché pending=true.
  if (profile.pending) return <PendingScreen />;

  return (
    <VoyageDesk
      initialTeam={team}
      initialCurrentUserId={profile?.id}
    />
  );
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
