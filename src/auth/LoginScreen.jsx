// src/auth/LoginScreen.jsx
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

// Schermata login email + password
export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  function localizeAuthError(error) {
    if (!error) return null;
    const code = error.code || error.error || '';
    const raw = (error.message || '').toLowerCase();
    if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) {
      return 'Email o password non corretti.';
    }
    if (code === 'email_not_confirmed' || raw.includes('email not confirmed')) {
      return 'Email non confermata. Controlla la tua casella.';
    }
    if (code === 'user_banned' || raw.includes('banned')) {
      return 'Utente disabilitato. Contatta un amministratore.';
    }
    if (code === 'over_request_rate_limit' || raw.includes('rate limit')) {
      return 'Troppi tentativi. Riprova tra qualche minuto.';
    }
    if (raw.includes('network') || raw.includes('failed to fetch')) {
      return 'Errore di rete. Verifica la connessione.';
    }
    return error.message || 'Accesso non riuscito. Riprova.';
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const { error } = await signIn(email.trim().toLowerCase(), password);
      if (error) setErr(localizeAuthError(error));
    } catch (e) {
      setErr(localizeAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <form onSubmit={onSubmit} style={formStyle}>
        <h1 style={h1Style}>VoyageDesk</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, opacity: 0.7 }}>
          Accedi al gestionale agenzia
        </p>

        <label style={labelStyle}>Email</label>
        <input
          type="email" autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={{ ...labelStyle, margin: '14px 0 6px' }}>Password</label>
        <input
          type="password" autoComplete="current-password" required
          value={password} onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />

        {err && <div style={errStyle}>{err}</div>}

        <button type="submit" disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Accesso…' : 'Accedi'}
        </button>
      </form>
    </div>
  );
}

// Schermata imposta password (mostrata dopo click su link invito o reset)
export function SetPasswordScreen() {
  const { user, updatePassword, signOut } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr('La password deve essere di almeno 8 caratteri.'); return; }
    if (pw !== pw2) { setErr('Le password non coincidono.'); return; }
    setLoading(true);
    try {
      const { error } = await updatePassword(pw);
      if (error) setErr(error.message || 'Errore aggiornamento password.');
      else setDone(true);
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div style={wrapStyle}>
        <div style={{ ...formStyle, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={h1Style}>Password impostata!</h2>
          <p style={{ color: '#94a3b8', fontSize: 14, margin: '12px 0 24px' }}>
            Benvenuto in VoyageDesk. Puoi ora accedere con le tue credenziali.
          </p>
          <p style={{ color: '#64748b', fontSize: 13 }}>Reindirizzamento in corso…</p>
        </div>
      </div>
    );
  }

  return (
    <div style={wrapStyle}>
      <form onSubmit={onSubmit} style={formStyle}>
        <h1 style={h1Style}>VoyageDesk</h1>
        <p style={{ margin: '0 0 4px', fontSize: 14, color: '#94a3b8' }}>
          Benvenuto, {user?.email}
        </p>
        <p style={{ margin: '0 0 24px', fontSize: 13, opacity: 0.7 }}>
          Scegli una password per il tuo account
        </p>

        <label style={labelStyle}>Nuova password</label>
        <input
          type="password" autoComplete="new-password" required minLength={8}
          value={pw} onChange={e => setPw(e.target.value)}
          placeholder="Almeno 8 caratteri"
          style={inputStyle}
        />

        <label style={{ ...labelStyle, margin: '14px 0 6px' }}>Conferma password</label>
        <input
          type="password" autoComplete="new-password" required
          value={pw2} onChange={e => setPw2(e.target.value)}
          style={inputStyle}
        />

        {err && <div style={errStyle}>{err}</div>}

        <button type="submit" disabled={loading} style={btnStyle(loading)}>
          {loading ? 'Salvataggio…' : 'Imposta password'}
        </button>

        <button
          type="button"
          onClick={signOut}
          style={{
            width: '100%', marginTop: 10, padding: '10px 16px', borderRadius: 10,
            border: '1px solid #334155', background: 'transparent', color: '#94a3b8',
            fontSize: 14, cursor: 'pointer',
          }}
        >
          Annulla ed esci
        </button>
      </form>
    </div>
  );
}

// Schermata "in attesa di approvazione"
export function PendingScreen() {
  const { user, signOut } = useAuth();
  return (
    <div style={wrapStyle}>
      <div style={{ ...formStyle, textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
        <h2 style={h1Style}>In attesa di approvazione</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '12px 0 4px' }}>
          Il tuo account <strong style={{ color: '#e2e8f0' }}>{user?.email}</strong>
        </p>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: '0 0 24px' }}>
          è stato creato ma deve essere approvato da un amministratore.
        </p>
        <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
          Riceverai una comunicazione non appena il tuo accesso sarà attivato.
        </p>
        <button
          onClick={signOut}
          style={{
            padding: '10px 24px', borderRadius: 10, border: '1px solid #334155',
            background: 'transparent', color: '#94a3b8', fontSize: 14, cursor: 'pointer',
          }}
        >
          Esci
        </button>
      </div>
    </div>
  );
}

// ─── Stili condivisi ─────────────────────────────────────────────────────────
const wrapStyle = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: 24,
  fontFamily: '"DM Sans",system-ui,sans-serif', color: '#e2e8f0',
};

const formStyle = {
  width: '100%', maxWidth: 380, background: '#0b1220',
  border: '1px solid #1e293b', borderRadius: 16, padding: 28,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};

const h1Style = {
  margin: '0 0 4px', fontFamily: '"Playfair Display",serif',
  fontSize: 28, fontWeight: 700,
};

const labelStyle = {
  display: 'block', fontSize: 12, marginBottom: 6, opacity: 0.8,
};

const errStyle = {
  marginTop: 14, padding: '10px 12px', borderRadius: 8,
  background: '#3a0d18', color: '#fca5a5', fontSize: 13,
  border: '1px solid #7f1d1d',
};

const btnStyle = (loading) => ({
  width: '100%', marginTop: 20, padding: '12px 16px', borderRadius: 10,
  border: 'none', background: '#2563eb', color: 'white', fontWeight: 600,
  cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1, fontSize: 14,
});

const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
