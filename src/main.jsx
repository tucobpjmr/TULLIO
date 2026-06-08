import React from 'react';
import { createRoot } from 'react-dom/client';
import { AuthProvider } from './lib/auth/AuthContext.jsx';
import AppShell from './AppShell.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  </React.StrictMode>
);
