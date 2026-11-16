// src/auth/MfaScreen.jsx
// A-2 dell'analisi del 15 novembre: la schermata del secondo fattore per
// l'admin. Due casi, decisi da `faseMfa` (auth/mfaStato.js):
//   - `registra`: primo accesso. Mostra il QR da inquadrare con un'app di
//     autenticazione e chiede il primo codice, che conferma il fattore.
//   - `verifica`: accessi successivi. Chiede solo il codice.
// Con il codice giusto la sessione diventa `aal2`, AuthContext rilegge
// profilo e team e AuthGate monta l'app.
//
// ⛔ Non è questa schermata a proteggere i dati: senza `aal2` il database non
// dà niente all'admin (migrazione 20261116170000). Qui si guida solo l'utente.
import { useEffect, useId, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import { supabaseAuth } from '../lib/supabaseAuth.js';
import { useIsMounted } from '../hooks/useIsMounted.js';
import { screenWrap } from './screenWrap.js';
import * as stiliComuni from '../styles/common.js';
import {
  avviaRegistrazione, codiceValido, messaggioErroreMfa, verificaCodice,
} from './mfa.js';

// Stili costanti di questo file: allocati una volta a livello di modulo,
// non ricostruiti a ogni render (M-1 dell'audit del 12 agosto).
const { cardAccesso: card, titoloAccesso: titolo, etichettaAccesso: etichetta,
  erroreAccesso: errore, btnPrimarioAccesso: primario } = stiliComuni;
const testo = { margin: '0 0 16px', fontSize: 13, opacity: 0.8, lineHeight: 1.5 };
const testoChiave = { ...testo, marginBottom: 6 };
const passi = { margin: '0 0 16px', paddingLeft: 18, fontSize: 13, lineHeight: 1.6, opacity: 0.9 };
const boxQr = {
  display: 'grid', placeItems: 'center', background: '#fff', borderRadius: 12,
  padding: 12, margin: '0 auto 12px', width: 200, height: 200,
};
const chiave = {
  display: 'block', fontFamily: 'ui-monospace,monospace', fontSize: 12,
  wordBreak: 'break-all', background: '#0f172a', border: '1px solid #334155',
  borderRadius: 8, padding: '8px 10px', margin: '0 0 16px', userSelect: 'all',
};
const campo = {
  width: '100%', padding: '11px 12px', borderRadius: 10, border: '1px solid #334155',
  background: '#0f172a', color: '#e2e8f0', fontSize: 20, letterSpacing: 6,
  textAlign: 'center', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const secondario = {
  width: '100%', marginTop: 10, padding: '10px 12px', borderRadius: 10,
  border: '1px solid #334155', background: 'transparent', color: 'inherit',
  fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};
const nota = { margin: '16px 0 0', fontSize: 11, opacity: 0.6, lineHeight: 1.5 };

export default function MfaScreen() {
  const { mfa, refreshTeam, signOut } = useAuth();
  const registra = mfa?.fase === 'registra';
  const montato = useIsMounted();
  const codiceId = useId();
  // Il fattore appena creato (QR, chiave, id). Solo nel caso `registra`.
  const [nuovo, setNuovo] = useState(null);
  // Cambia per rifare la registrazione dopo un errore («Riprova»).
  const [tentativo, setTentativo] = useState(0);
  const [codice, setCodice] = useState('');
  const [err, setErr] = useState(null);
  const [invio, setInvio] = useState(false);

  useEffect(() => {
    if (!registra) return undefined;
    // In StrictMode l'effetto parte due volte: la seconda registrazione
    // toglie quella a metà della prima (avviaRegistrazione), e vale l'ultima.
    let valido = true;
    setNuovo(null);
    setErr(null);
    avviaRegistrazione(supabaseAuth).then(
      (f) => { if (valido) setNuovo(f); },
      (e) => { if (valido) setErr(messaggioErroreMfa(e)); },
    );
    return () => { valido = false; };
  }, [registra, tentativo]);

  const factorId = registra ? nuovo?.factorId : mfa?.factorId;

  async function conferma(e) {
    e.preventDefault();
    setErr(null);
    if (!factorId) return;
    if (!codiceValido(codice)) { setErr('Scrivi le 6 cifre del codice.'); return; }
    setInvio(true);
    try {
      const { error } = await verificaCodice(supabaseAuth, factorId, codice);
      if (!montato()) return;
      if (error) {
        setErr(messaggioErroreMfa(error));
        setCodice('');
        return;
      }
      // MFA_CHALLENGE_VERIFIED rilegge già il profilo; questa chiamata copre
      // il caso in cui l'evento arrivi prima del rilascio del lock di gotrue.
      // Il caricamento in volo è uno solo per utente: non si fa due volte.
      await refreshTeam();
    } catch (e2) {
      if (montato()) setErr(messaggioErroreMfa(e2));
    } finally {
      if (montato()) setInvio(false);
    }
  }

  const inAttesaQr = registra && !nuovo && !err;

  return (
    <div style={screenWrap}>
      <form onSubmit={conferma} style={card}>
        <h1 style={titolo}>{registra ? 'Proteggi l’account admin' : 'Codice di verifica'}</h1>

        {registra ? (
          <>
            <p style={testo}>
              Per entrare come amministratore servono la password e un codice
              che cambia ogni 30 secondi. Si configura una volta sola.
            </p>
            <ol style={passi}>
              <li>Installa sul telefono un’app di autenticazione (Google Authenticator, Microsoft Authenticator…).</li>
              <li>Nell’app aggiungi un account e inquadra il QR qui sotto.</li>
              <li>Scrivi il codice a 6 cifre che l’app mostra.</li>
            </ol>
            {nuovo && (
              <>
                <div style={boxQr}>
                  <img src={nuovo.qr} alt="QR da inquadrare con l’app di autenticazione" width={176} height={176} />
                </div>
                <p style={testoChiave}>Non riesci a inquadrarlo? Inserisci questa chiave a mano:</p>
                <code style={chiave}>{nuovo.segreto}</code>
              </>
            )}
            {inAttesaQr && <p style={testo}>Preparazione del QR…</p>}
          </>
        ) : (
          <p style={testo}>Apri l’app di autenticazione e scrivi il codice a 6 cifre di Tullio.</p>
        )}

        {(!registra || nuovo) && (
          <>
            <label htmlFor={codiceId} style={etichetta}>Codice</label>
            <input
              id={codiceId} style={campo} value={codice} required autoFocus
              inputMode="numeric" autoComplete="one-time-code" maxLength={7}
              onChange={(ev) => setCodice(ev.target.value)}
            />
          </>
        )}

        {err && <div style={errore} role="alert">{err}</div>}

        {registra && !nuovo && err ? (
          <button type="button" style={primario} onClick={() => setTentativo((t) => t + 1)}>Riprova</button>
        ) : (
          <button type="submit" disabled={invio || !factorId} style={{
            ...primario, cursor: invio ? 'wait' : 'pointer', opacity: invio || !factorId ? 0.7 : 1,
          }}>
            {invio ? 'Verifica…' : 'Conferma'}
          </button>
        )}
        <button type="button" disabled={invio} style={secondario} onClick={() => signOut()}>Esci</button>

        <p style={nota}>
          Telefono perso o app cancellata? Il fattore si rimuove dal pannello di
          Supabase (Authentication → Users → il tuo utente). Al prossimo accesso
          Tullio ne farà registrare uno nuovo.
        </p>
      </form>
    </div>
  );
}
