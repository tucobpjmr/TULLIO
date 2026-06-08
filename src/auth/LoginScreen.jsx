// src/auth/LoginScreen.jsx
import React, { useState } from 'react';
import { useAuth } from './AuthContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr(null); setLoading(true);
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) setErr(error.message);
  }

  return (
    <div style={{
      minHeight:'100vh', display:'grid', placeItems:'center',
      background:'linear-gradient(135deg,#0f172a,#1e293b)', padding:24,
      fontFamily:'"DM Sans",system-ui,sans-serif', color:'#e2e8f0'
    }}>
      <form onSubmit={onSubmit} style={{
        width:'100%', maxWidth:380, background:'#0b1220',
        border:'1px solid #1e293b', borderRadius:16, padding:28,
        boxShadow:'0 20px 60px rgba(0,0,0,0.5)'
      }}>
        <h1 style={{
          margin:'0 0 4px', fontFamily:'"Playfair Display",serif',
          fontSize:28, fontWeight:700
        }}>VoyageDesk</h1>
        <p style={{margin:'0 0 24px', fontSize:13, opacity:0.7}}>
          Accedi al gestionale agenzia
        </p>

        <label style={{display:'block', fontSize:12, marginBottom:6, opacity:0.8}}>Email</label>
        <input
          type="email" autoComplete="email" required
          value={email} onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />

        <label style={{display:'block', fontSize:12, margin:'14px 0 6px', opacity:0.8}}>Password</label>
        <input
          type="password" autoComplete="current-password" required
          value={password} onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />

        {err && (
          <div style={{
            marginTop:14, padding:'10px 12px', borderRadius:8,
            background:'#3a0d18', color:'#fca5a5', fontSize:13,
            border:'1px solid #7f1d1d'
          }}>{err}</div>
        )}

        <button type="submit" disabled={loading} style={{
          width:'100%', marginTop:20, padding:'12px 16px', borderRadius:10,
          border:'none', background:'#2563eb', color:'white', fontWeight:600,
          cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.7 : 1
        }}>{loading ? 'Accesso…' : 'Accedi'}</button>
      </form>
    </div>
  );
}

const inputStyle = {
  width:'100%', padding:'11px 12px', borderRadius:10,
  border:'1px solid #334155', background:'#0f172a', color:'#e2e8f0',
  fontSize:14, outline:'none', boxSizing:'border-box'
};
