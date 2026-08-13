// Estratto da main.jsx (B-3 dell'audit del 13 agosto: un file, un componente
// — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import VoyageDesk from '../VoyageDesk.jsx';
import { useAuth } from './AuthContext.jsx';
import LoginScreen from './LoginScreen.jsx';
import UpdatePasswordScreen from './UpdatePasswordScreen.jsx';
import { PendingScreen } from './PendingScreen.jsx';
import { ProfileErrorScreen } from './ProfileErrorScreen.jsx';
import { screenWrap } from './screenWrap.js';

// Splash d'avvio: stesso logo su bianco della splash PWA generata dal manifest
// (background_color #FFFFFF), così il passaggio dalla schermata di sistema a
// quella dell'app non stacca.
const loadingScreen = (
  <div style={{
    ...screenWrap, background: '#fff', color: '#64748b',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: 16,
  }}>
    <img src="/apple-touch-icon-192.png" alt="VoyageDesk" width={112} height={112} />
    <span>Caricamento…</span>
  </div>
);

export function AuthGate() {
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
