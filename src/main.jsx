import React from 'react';
import { createRoot } from 'react-dom/client';
import VoyageDesk from './VoyageDesk.jsx';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginScreen from './auth/LoginScreen.jsx';

const loadingScreen = (
  <div style={{
    minHeight: '100vh', display: 'grid', placeItems: 'center',
    background: '#0f172a', color: '#e2e8f0',
    fontFamily: '"DM Sans",system-ui,sans-serif', fontSize: 14
  }}>
    Caricamento…
  </div>
);

function AuthGate() {
  const { session, profile, team, loading } = useAuth();

  if (loading) return loadingScreen;

  if (!session) return <LoginScreen />;

  // Caveat #17: al login onAuthStateChange imposta la session prima che
  // profile/team siano caricati. Montare VoyageDesk con team vuoto congela
  // i mock nel reducer (useReducer inizializza una volta sola), quindi
  // aspettiamo il profilo prima di montare l'app.
  if (!profile) return loadingScreen;

  return (
    <VoyageDesk
      initialTeam={team}
      initialCurrentUserId={profile?.id}
    />
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>
);
