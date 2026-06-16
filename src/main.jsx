import React from 'react';
import { createRoot } from 'react-dom/client';
import VoyageDesk from './VoyageDesk.jsx';
import { AuthProvider, useAuth } from './auth/AuthContext.jsx';
import LoginScreen, { SetPasswordScreen, PendingScreen } from './auth/LoginScreen.jsx';

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
  const { session, profile, team, loading, needsPasswordSetup } = useAuth();

  if (loading) return loadingScreen;

  // Nessuna sessione → login
  if (!session) return <LoginScreen />;

  // Sessione da link invito/recovery → imposta password prima di accedere
  if (needsPasswordSetup) return <SetPasswordScreen />;

  // Caveat #17: aspetta che profile sia caricato prima di montare l'app
  if (!profile) return loadingScreen;

  // Account creato ma non ancora approvato dall'admin
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
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  </React.StrictMode>
);
