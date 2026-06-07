import React from 'react';
import { createRoot } from 'react-dom/client';
import VoyageDesk from './VoyageDesk.jsx';
import { AuthProvider, useAuth } from './lib/auth/AuthContext.jsx';
import LoginScreen from './lib/auth/LoginScreen.jsx';
import LogoutButton from './lib/auth/LogoutButton.jsx';

function App() {
  const { loading, session } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: '#0F2044', color: '#e2e8f0',
        fontFamily: '"DM Sans",system-ui,sans-serif', fontSize: 14
      }}>
        Caricamento…
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return (
    <>
      <VoyageDesk />
      <LogoutButton />
    </>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
);
