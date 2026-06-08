import React from 'react';
import { createRoot } from 'react-dom/client';
import VoyageDesk from './VoyageDesk.jsx';
import { AuthProvider, useAuth } from './lib/auth/AuthContext.jsx';
import LoginScreen from './lib/auth/LoginScreen.jsx';
import { isSupabaseConfigured } from './lib/supabase';

const screenStyle = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  background: 'linear-gradient(135deg,#0f172a,#1e293b)',
  color: '#e2e8f0',
  fontFamily: '"DM Sans",system-ui,sans-serif',
  padding: 24,
};

function LoadingScreen() {
  return (
    <div style={screenStyle}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontFamily: '"Playfair Display",serif', fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
          VoyageDesk
        </div>
        <div style={{ opacity: 0.6, fontSize: 14 }}>Caricamento…</div>
      </div>
    </div>
  );
}

function ConfigErrorScreen() {
  return (
    <div style={screenStyle}>
      <div style={{ maxWidth: 480, background: '#0b1220', border: '1px solid #7f1d1d', borderRadius: 16, padding: 24 }}>
        <h1 style={{ fontFamily: '"Playfair Display",serif', fontSize: 22, marginBottom: 10 }}>
          Configurazione mancante
        </h1>
        <p style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.5 }}>
          Le variabili <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> non
          sono impostate. Aggiungile in <code>.env</code> (sviluppo locale) e nelle env vars
          del progetto Vercel, poi ricarica.
        </p>
      </div>
    </div>
  );
}

function Gate() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <LoginScreen />;
  return <VoyageDesk />;
}

const root = createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    {isSupabaseConfigured ? (
      <AuthProvider>
        <Gate />
      </AuthProvider>
    ) : (
      <ConfigErrorScreen />
    )}
  </React.StrictMode>
);
