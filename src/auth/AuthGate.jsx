// Estratto da main.jsx (B-3 dell'audit del 13 agosto: un file, un componente
// — vedi docs/CLAUDE.md).
import { lazy, Suspense } from 'react';
import ErrorBoundary from '../components/errors/ErrorBoundary.jsx';
import { useAuth } from './AuthContext.jsx';
import LoginScreen from './LoginScreen.jsx';
import UpdatePasswordScreen from './UpdatePasswordScreen.jsx';
import { PendingScreen } from './PendingScreen.jsx';
import { ProfileErrorScreen } from './ProfileErrorScreen.jsx';
import { screenWrap } from './screenWrap.js';

// ─── B-1 · l'app intera non sta nel chunk d'ingresso ───────────────────────
// (audit performance/UX del 16 agosto, secondo passaggio)
//
// Era un `import VoyageDesk from '../VoyageDesk.jsx'` statico, e si portava
// dietro nel chunk d'ingresso il reducer, il registry di persistenza, il data
// layer, il guscio, la Dashboard e la ClientiView: chi è fermo alla schermata
// di login scaricava e PARSAVA tutto prima di poter digitare la password.
//
// `lazy()` da solo però sarebbe un peggioramento per il caso più frequente: in
// un gestionale la sessione persiste, quindi l'utente tipico è GIÀ autenticato
// e si ritroverebbe una cascata seriale (entry → init auth → chunk app). La
// forma corretta è lazy CON PREFETCH AVVIATO SUBITO: il download parte alla
// valutazione di questo modulo, cioè in parallelo al `getSession()` di
// AuthContext. Chi ha una sessione valida non paga alcuna cascata (il chunk è
// già in volo mentre auth risolve), chi arriva al login non paga il parse
// dell'app che non ha ancora aperto.
const caricaApp = () => import('../VoyageDesk.jsx');
const VoyageDesk = lazy(caricaApp);
// `catch` vuoto e non un errore ingoiato: se il chunk non arriva, l'errore
// VERO lo solleva il `lazy()` quando React prova a montarlo, e lo raccoglie il
// boundary qui sotto con il suo codice di segnalazione. Senza il `catch` questa
// promise di prefetch sarebbe una unhandled rejection, cioè lo stesso guasto
// raccontato due volte — una delle quali prima ancora che serva l'app.
caricaApp().catch(() => {});

// Splash d'avvio: stesso logo su bianco della splash PWA generata dal manifest
// (background_color #FFFFFF), così il passaggio dalla schermata di sistema a
// quella dell'app non stacca. È anche il fallback del `Suspense`: l'attesa del
// chunk e l'attesa di `getSession()` sono la stessa attesa per chi guarda.
const schermataDiAttesa = (
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
  const { session, profile, team, caricando, recovery, authError, refreshTeam, retryInit, signOut } = useAuth();

  if (caricando) return schermataDiAttesa;

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
    return schermataDiAttesa;
  }

  // Gate utenti non approvati: niente accesso all'app finché pending=true.
  if (profile.pending) return <PendingScreen />;

  // La rete di sicurezza del `lazy()` (A-1: montare un lazy e dargli un
  // boundary è UN gesto solo). Qui è quello di PRIMO livello e non
  // ViewErrorBoundary/OverlayErrorBoundary come negli altri otto punti di
  // montaggio, perché è l'unico in cui il chunk mancante È l'app: non esiste
  // "il resto di Tullio continua a funzionare" in cui rientrare, e la pagina
  // intera con "Ricarica" è la sola uscita sensata. Sta qui e non solo in
  // main.jsx così che il montaggio e la sua rete si leggano insieme.
  return (
    <ErrorBoundary>
      <Suspense fallback={schermataDiAttesa}>
        <VoyageDesk
          initialTeam={team}
          initialCurrentUserId={profile?.id}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
