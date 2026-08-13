// Estratto da main.jsx (B-3 dell'audit del 13 agosto: un file, un componente
// — vedi docs/CLAUDE.md). Nessun cambiamento di comportamento.
import { useAuth } from './AuthContext.jsx';
import { screenWrap } from './screenWrap.js';

// Utente registrato ma non ancora approvato da un admin (pending=true).
// Non monta l'app: l'accesso ai dati è bloccato finché un admin non approva.
export function PendingScreen() {
  const { profile, signOut } = useAuth();
  return (
    <div style={screenWrap}>
      <div style={{
        maxWidth: 420, textAlign: 'center', background: '#0b1220',
        border: '1px solid #1e293b', borderRadius: 16, padding: 32,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
        <h1 style={{
          margin: '0 0 8px', fontFamily: '"Playfair Display",serif', fontSize: 24, fontWeight: 700,
        }}>Account in attesa</h1>
        <p style={{ margin: '0 0 20px', fontSize: 14, opacity: 0.75, lineHeight: 1.5 }}>
          Ciao {profile?.name || ''}, la tua registrazione è stata ricevuta.
          Un amministratore deve approvare il tuo accesso prima che tu possa
          entrare. Riprova più tardi.
        </p>
        <button onClick={() => signOut()} style={{
          padding: '10px 18px', borderRadius: 10, border: '1px solid #334155',
          background: 'transparent', color: '#e2e8f0', fontWeight: 600, cursor: 'pointer',
          fontSize: 13, fontFamily: 'inherit',
        }}>Esci</button>
      </div>
    </div>
  );
}
