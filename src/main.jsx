import React, { useRef } from 'react';
import { createRoot } from 'react-dom/client';
import VoyageDesk, { _syncTeam, _syncCurrentUser, _remapMockIds } from './VoyageDesk.jsx';
import { AuthProvider, useAuth } from './lib/auth/AuthContext.jsx';
import LoginScreen from './lib/auth/LoginScreen.jsx';
import { mapMember } from './lib/auth/mapMember.js';

function App() {
  const { loading, session } = useAuth();

  if (loading) return <SplashScreen label="Caricamento…" />;
  if (!session) return <LoginScreen />;
  return <BootstrappedApp />;
}

function BootstrappedApp() {
  const { profile, team } = useAuth();

  if (!profile || !team || team.length === 0) {
    return <SplashScreen label="Preparazione workspace…" />;
  }

  // Iniezione dei dati reali dentro il monolite prima del primo render di
  // VoyageDesk: TEAM/CURRENT_USER vengono letti da `makeInitialState`.
  // `useRef` garantisce che la sync avvenga UNA volta sola per sessione,
  // così le modifiche al team via Admin non vengono soprascritte ai re-render.
  const booted = useRef(false);
  if (!booted.current) {
    _syncTeam(team.map(mapMember));
    _syncCurrentUser(profile.id);
    // Mappa "marco" → UUID Supabase per i mock task/notices/chat ancora in memoria
    const idMap = Object.fromEntries(
      team
        .filter((u) => u.email)
        .map((u) => [u.email.split('@')[0].toLowerCase(), u.id])
    );
    _remapMockIds(idMap);
    booted.current = true;
  }

  return <VoyageDesk />;
}

function SplashScreen({ label }) {
  return (
    <div style={{
      minHeight: '100vh', display: 'grid', placeItems: 'center',
      background: '#0F2044', color: '#e2e8f0',
      fontFamily: '"DM Sans",system-ui,sans-serif', fontSize: 14,
    }}>
      {label}
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
