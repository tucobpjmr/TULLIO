// src/lib/auth/LogoutButton.jsx
// Bottone logout fluttuante in alto a destra, sopra l'UserSwitcher mock.
// Temporaneo: una volta integrata l'auth dentro VoyageDesk, l'azione
// "Esci" andrà nel dropdown dell'UserSwitcher.
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LogoutButton() {
  const { signOut, profile, user } = useAuth();
  const [busy, setBusy] = useState(false);

  const label = profile?.name || user?.email || 'Esci';

  async function onClick() {
    setBusy(true);
    await signOut();
    setBusy(false);
  }

  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={`Esci (${user?.email ?? ''})`}
      style={{
        position: 'fixed',
        top: 14,
        right: 14,
        zIndex: 9999,
        padding: '8px 14px',
        borderRadius: 999,
        border: '1px solid rgba(212,168,67,0.5)',
        background: 'rgba(15,32,68,0.85)',
        backdropFilter: 'blur(6px)',
        color: '#e8c46a',
        fontFamily: '"DM Sans",system-ui,sans-serif',
        fontSize: 12,
        fontWeight: 600,
        cursor: busy ? 'wait' : 'pointer',
        boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
      }}
    >
      ↩ Esci — {label}
    </button>
  );
}
