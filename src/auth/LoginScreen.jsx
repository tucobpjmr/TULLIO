// src/auth/LoginScreen.jsx
import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { PasswordField } from '../components/ui/PasswordField.jsx';

function isEmailNotConfirmed(error) {
  if (!error) return false;
  const code = error.code || error.error || '';
  const raw = (error.message || '').toLowerCase();
  return code === 'email_not_confirmed' || raw.includes('email not confirmed');
}

function localizeAuthError(error) {
  if (!error) return null;
  const code = error.code || error.error || '';
  const raw = (error.message || '').toLowerCase();
  if (code === 'invalid_credentials' || raw.includes('invalid login credentials')) {
    return 'Email o password non corretti.';
  }
  if (isEmailNotConfirmed(error)) {
    return 'Email non confermata. Controlla la tua casella.';
  }
  if (code === 'user_banned' || raw.includes('banned')) {
    return 'Utente disabilitato. Contatta un amministratore.';
  }
  if (code === 'over_request_rate_limit' || raw.includes('rate limit')) {
    return 'Troppi tentativi. Riprova tra qualche minuto.';
  }
  if (code === 'user_already_exists' || raw.includes('already registered') || raw.includes('already been registered')) {
    return 'Esiste già un account con questa email. Prova ad accedere.';
  }
  if (code === 'weak_password' || raw.includes('password should be')) {
    return 'Password troppo debole: usa almeno 8 caratteri.';
  }
  if (raw.includes('network') || raw.includes('failed to fetch')) {
    return 'Errore di rete. Verifica la connessione.';
  }
  return error.message || 'Operazione non riuscita. Riprova.';
}

export default function LoginScreen() {
  const { signIn, signUp, resetPassword, resendConfirmation } = useAuth();
  const [mode, setMode] = useState('login'); // 'login' | 'forgot' | 'signup'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  // showResend = true quando l'ultimo tentativo è fallito per email_not_confirmed:
  // mostra la CTA "Reinvia conferma" sotto al messaggio d'errore.
  const [showResend, setShowResend] = useState(false);
  const [resending, setResending] = useState(false);

  function switchMode(next) {
    setMode(next);
    setErr(null);
    setInfo(null);
    setShowResend(false);
    setPassword('');
  }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null); setInfo(null); setShowResend(false); setLoading(true);
    const mail = email.trim().toLowerCase();
    try {
      if (mode === 'login') {
        const { error } = await signIn(mail, password);
        if (error) {
          setErr(localizeAuthError(error));
          if (isEmailNotConfirmed(error)) setShowResend(true);
        }
      } else if (mode === 'forgot') {
        const { error } = await resetPassword(mail);
        if (error) setErr(localizeAuthError(error));
        else setInfo('Se l\'email è registrata, riceverai un link per reimpostare la password.');
      } else if (mode === 'signup') {
        if (!name.trim()) { setErr('Inserisci il tuo nome.'); setLoading(false); return; }
        if (password.length < 8) { setErr('La password deve avere almeno 8 caratteri.'); setLoading(false); return; }
        const { error } = await signUp(mail, password, name.trim());
        if (error) setErr(localizeAuthError(error));
        else setInfo('Registrazione inviata! Un amministratore deve approvare il tuo accesso. Se richiesto, conferma prima l\'email.');
      }
    } catch (e) {
      setErr(localizeAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  async function onResendConfirmation() {
    const mail = email.trim().toLowerCase();
    if (!mail) { setErr('Inserisci l\'email per ricevere il link di conferma.'); return; }
    setResending(true);
    setErr(null); setInfo(null);
    try {
      const { error } = await resendConfirmation(mail);
      if (error) setErr(localizeAuthError(error));
      else {
        setInfo('Email di conferma reinviata. Controlla la tua casella (e lo spam).');
        setShowResend(false);
      }
    } catch (e) {
      setErr(localizeAuthError(e));
    } finally {
      setResending(false);
    }
  }

  const subtitle = {
    login: 'Accedi al gestionale agenzia',
    forgot: 'Reimposta la tua password',
    signup: 'Richiedi un account',
  }[mode];

  const submitLabel = {
    login: loading ? 'Accesso…' : 'Accedi',
    forgot: loading ? 'Invio…' : 'Invia link di reset',
    signup: loading ? 'Registrazione…' : 'Registrati',
  }[mode];

  return (
    <div style={wrapStyle}>
      <form onSubmit={onSubmit} style={cardStyle}>
        <h1 style={titleStyle}>VoyageDesk</h1>
        <p style={{ margin: '0 0 24px', fontSize: 13, opacity: 0.7 }}>{subtitle}</p>

        {mode === 'signup' && (
          <>
            <label style={labelStyle}>Nome completo</label>
            <input
              type="text" autoComplete="name" required
              value={name} onChange={e => setName(e.target.value)}
              style={{ ...inputStyle, marginBottom: 14 }}
            />
          </>
        )}

        <label style={labelStyle}>Email</label>
        <input
          type="email" autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />

        {mode !== 'forgot' && (
          <>
            <label style={{ ...labelStyle, margin: '14px 0 6px' }}>Password</label>
            <PasswordField
              inputStyle={inputStyle}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              value={password} onChange={e => setPassword(e.target.value)}
            />
          </>
        )}

        {err && <div style={errStyle}>{err}</div>}
        {showResend && (
          <button
            type="button"
            onClick={onResendConfirmation}
            disabled={resending}
            style={{
              marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 8,
              border: '1px solid #7f1d1d', background: 'transparent', color: '#fca5a5',
              fontSize: 13, fontWeight: 600, cursor: resending ? 'wait' : 'pointer',
              opacity: resending ? 0.7 : 1, fontFamily: 'inherit',
            }}
          >
            {resending ? 'Invio in corso…' : '✉ Reinvia email di conferma'}
          </button>
        )}
        {info && <div style={infoStyle}>{info}</div>}

        <button type="submit" disabled={loading} style={{
          ...primaryBtn, cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1,
        }}>{submitLabel}</button>

        <div style={linksStyle}>
          {mode === 'login' && (
            <>
              <button type="button" onClick={() => switchMode('forgot')} style={linkBtn}>
                Password dimenticata?
              </button>
              <button type="button" onClick={() => switchMode('signup')} style={linkBtn}>
                Richiedi un account
              </button>
            </>
          )}
          {mode !== 'login' && (
            <button type="button" onClick={() => switchMode('login')} style={linkBtn}>
              ← Torna all'accesso
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const wrapStyle = {
  // padding con safe area: su iPhone (viewport-fit=cover) la card resterebbe
  // altrimenti sotto la status bar quando è più alta del viewport.
  minHeight: '100vh', display: 'grid', placeItems: 'center',
  background: 'linear-gradient(135deg,#0f172a,#1e293b)',
  padding: 'calc(24px + var(--safe-top)) calc(24px + var(--safe-right)) calc(24px + var(--safe-bottom)) calc(24px + var(--safe-left))',
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
const infoStyle = {
  marginTop: 14, padding: '10px 12px', borderRadius: 8,
  background: '#0c2030', color: '#7dd3fc', fontSize: 13, border: '1px solid #155e75',
};
const primaryBtn = {
  width: '100%', marginTop: 20, padding: '12px 16px', borderRadius: 10,
  border: 'none', background: '#2563eb', color: 'white', fontWeight: 600, cursor: 'pointer',
};
const linksStyle = {
  marginTop: 18, display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap',
};
const linkBtn = {
  background: 'none', border: 'none', color: '#7dd3fc', fontSize: 12.5,
  cursor: 'pointer', padding: 0, fontFamily: 'inherit',
};
