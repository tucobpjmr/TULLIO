// src/AppShell.jsx — gate autenticazione: mostra LoginScreen o l'app
import React from 'react';
import { useAuth } from './lib/auth/AuthContext.jsx';
import LoginScreen from './lib/auth/LoginScreen.jsx';
import VoyageDesk from './VoyageDesk.jsx';

export default function AppShell() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'linear-gradient(135deg,#0f172a,#1e293b)',
        fontFamily: '"DM Sans",system-ui,sans-serif', color: '#e2e8f0',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 40, height: 40, border: '3px solid #334155',
            borderTopColor: '#2563eb', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite', margin: '0 auto 16px',
          }} />
          <p style={{ fontSize: 14, opacity: 0.6 }}>Caricamento…</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  return <VoyageDesk />;
}
