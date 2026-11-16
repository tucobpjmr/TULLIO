// src/auth/mfa.js
// A-2 dell'analisi del 15 novembre: registrazione e verifica del secondo
// fattore dell'admin (codice TOTP a 6 cifre da un'app come Google
// Authenticator). Lo usa solo MfaScreen, che è lazy. Quale passo manca lo
// decide auth/mfaStato.js; la regola vera è nel database e nelle Edge
// Function (vedi lì).

/**
 * Prepara un fattore nuovo e ne restituisce il QR. Toglie prima le
 * registrazioni lasciate a metà (QR mostrato e mai confermato), che altrimenti
 * si accumulano a ogni accesso.
 */
export async function avviaRegistrazione(auth) {
  const { data: fattori, error: errFattori } = await auth.mfa.listFactors();
  if (errFattori) throw errFattori;
  for (const f of fattori?.all ?? []) {
    if (f.factor_type === 'totp' && f.status !== 'verified') {
      const { error } = await auth.mfa.unenroll({ factorId: f.id });
      if (error) throw error;
    }
  }
  // Nome unico: in StrictMode due registrazioni possono incrociarsi, e con lo
  // stesso nome la seconda verrebbe rifiutata.
  const { data, error } = await auth.mfa.enroll({ factorType: 'totp', friendlyName: `Tullio ${Date.now()}` });
  if (error) throw error;
  return { factorId: data.id, qr: data.totp.qr_code, segreto: data.totp.secret };
}

/**
 * Verifica il codice: con successo la sessione passa a `aal2` e GoTrue emette
 * MFA_CHALLENGE_VERIFIED, che fa rileggere profilo e team (AuthContext).
 * Vale sia per la prima registrazione sia per gli accessi successivi.
 */
export function verificaCodice(auth, factorId, testo) {
  return auth.mfa.challengeAndVerify({ factorId, code: normalizzaCodice(testo) });
}

/** Sei cifre, spazi tollerati (le app li mostrano «123 456»). */
export function normalizzaCodice(testo) {
  return String(testo ?? '').replace(/\s+/g, '');
}

export function codiceValido(testo) {
  return /^\d{6}$/.test(normalizzaCodice(testo));
}

/** Messaggio per l'utente da un errore di GoTrue. */
export function messaggioErroreMfa(errore) {
  const codice = errore?.code ?? '';
  if (codice === 'mfa_verification_failed' || /invalid totp code/i.test(errore?.message ?? '')) {
    return 'Codice non corretto o scaduto. Riprova con quello nuovo.';
  }
  if (codice === 'over_request_rate_limit' || errore?.status === 429) {
    return 'Troppi tentativi: attendi un minuto e riprova.';
  }
  if (codice === 'mfa_totp_enroll_not_enabled' || codice === 'mfa_totp_verify_not_enabled') {
    return 'Il secondo fattore non è attivo sul server. Avvisa chi gestisce Supabase.';
  }
  return 'Operazione non riuscita. Controlla la connessione e riprova.';
}
