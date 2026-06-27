// src/auth/UpdatePasswordScreen.jsx
// Mostrata quando l'utente arriva da un link "reimposta password"
// (evento PASSWORD_RECOVERY). Imposta la nuova password e rientra nell'app.
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export default function UpdatePasswordScreen() {
  const { updatePassword, signOut, recoveryKind } = useAuth();
  const isInvite = recoveryKind === 'invite';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  // Mostra/nascondi password: unico toggle per entrambi i campi (devono
  // coincidere, quindi mostrarli insieme è il comportamento atteso).
  const [show, setShow] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null);
    if (password.length < 8) { setErr('La password deve avere almeno 8 caratteri.'); return; }
    if (password !== confirm) { setErr('Le due password non coincidono.'); return; }
    setLoading(true);
    try {
      const { error } = await updatePassword(password);
      if (error) {
        setErr(error.message || 'Aggiornamento non riuscito. Riprova.');
      } else {
        setOk(true);
      }
    } catch (e) {
      setErr(e?.message || 'Errore di rete. Riprova.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={wrapStyle}>
      <form onSubmit={onSubmit} style={cardStyle}>
        <h1 style={titleStyle}>VoyageDesk</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, opacity: 0.7 }}>
          {isInvite ? 'Benvenuto! Imposta la tua password per attivare l’account' : 'Imposta una nuova password'}
        </p>

        {ok ? (
          <>
            <div style={successStyle}>
              {isInvite
                ? '✓ Password impostata. Un amministratore deve approvare il tuo account prima dell’accesso.'
                : '✓ Password aggiornata. Ora puoi usare l’app.'}
            </div>
            <button type="button" onClick={() => signOut()} style={primaryBtn}>
              Continua
            </button>
          </>
        ) : (
          <>
            <label style={labelStyle}>{isInvite ? 'Password' : 'Nuova password'}</label>
            <PasswordField
              value={password} onChange={e => setPassword(e.target.value)}
              show={show} onToggle={() => setShow(s => !s)}
            />

            <label style={{ ...labelStyle, marginTop: 14 }}>Conferma password</label>
            <PasswordField
              value={confirm} onChange={e => setConfirm(e.target.value)}
              show={show} onToggle={() => setShow(s => !s)}
            />

            {err && <div style={errStyle}>{err}</div>}

            <button type="submit" disabled={loading} style={{
              ...primaryBtn, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
            }}>
              {loading ? 'Salvataggio…' : 'Aggiorna password'}
            </button>
          </>
        )}
      </form>
    </div>
  );
}

// Campo password con icona a occhio per mostrare/nascondere il testo.
function PasswordField({ value, onChange, show, onToggle }) {
  return (
    <div style={{ position: 'relative' }}>
      <input
        type={show ? 'text' : 'password'} autoComplete="new-password" required
        value={value} onChange={onChange}
        style={{ ...inputStyle, paddingRight: 44 }}
      />
      <button
        type="button" onClick={onToggle}
        aria-label={show ? 'Nascondi password' : 'Mostra password'}
        title={show ? 'Nascondi password' : 'Mostra password'}
        style={eyeBtn}
      >
        {show ? '🙈' : '👁️'}
      </button>
    </div>
  );
}

const eyeBtn = {
  position: 'absolute', top: '50%', right: 8, transform: 'translateY(-50%)',
  background: 'none', border: 'none', cursor: 'pointer', fontSize: 16,
  padding: 4, lineHeight: 1, opacity: 0.85,
};

const wrapStyle = {
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: 'linear-gradient(135deg,#0f172a,#1e293b)', padding: 24,
  fontFamily: '"DM Sans",system-ui,sans-serif', color: '#e2e8f0',
};
const cardStyle = {
  width: '100%', maxWidth: 380, background: '#0b1220',
  border: '1px solid #1e293b', borderRadius: 16, padding: 28,
  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
};
const titleStyle = {
  margin: '0 0 4px', fontFamily: '"Playfair Display",serif',
  fontSize: 28, fontWeight: 700,
};
const labelStyle = { display: 'block', fontSize: 12, marginBottom: 6, opacity: 0.8 };
const inputStyle = {
  width: '100%', padding: '11px 12px', borderRadius: 10,
  border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
  fontSize: 14, outline: 'none', boxSizing: 'border-box',
};
const errStyle = {
  marginTop: 14, padding: '10px 12px', borderRadius: 8,
  background: '#3a0d18', color: '#fca5a5', fontSize: 13, border: '1px solid #7f1d1d',
};
const successStyle = {
  marginBottom: 16, padding: '12px', borderRadius: 8,
  background: '#0c2a1a', color: '#86efac', fontSize: 13, border: '1px solid #14532d',
};
const primaryBtn = {
  width: '100%', marginTop: 20, padding: '12px 16px', borderRadius: 10,
  border: 'none', background: '#2563eb', color: 'white', fontWeight: 600, cursor: 'pointer',
};
