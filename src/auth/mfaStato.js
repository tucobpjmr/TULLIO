// src/auth/mfaStato.js
// A-2 dell'analisi del 15 novembre: QUALE passo del secondo fattore manca
// all'admin. È la sola parte che serve ad AuthContext, quindi al chunk
// d'ingresso; il resto (registrazione, verifica, messaggi) sta in auth/mfa.js
// e lo scarica solo MfaScreen, che è lazy (verifica:bundle).
//
// ⛔ La regola vera sta nel database (`private.mfa_soddisfatta()`, migrazione
// 20261116170000) e nelle Edge Function (`_shared/adminPredicate.ts`). Qui si
// decide solo QUALE SCHERMATA mostrare: un admin che lo aggirasse troverebbe
// un database che non gli dà niente. Per questo, se la verifica fallisce, si
// sbaglia dalla parte della schermata del codice.
//
// Il confronto sul ruolo è sul valore GREZZO della colonna (`role = 'admin'`),
// come nel database: vedi `puoAgireComeAdmin` in adminPredicate.ts.

export const RUOLO_CON_MFA = 'admin';

/**
 * Pura: quale passo manca, o null se non manca niente.
 * @returns {null | { fase: 'registra' } | { fase: 'verifica', factorId: string }}
 */
export function faseMfa({ ruolo, livello, fattoriVerificati }) {
  if (ruolo !== RUOLO_CON_MFA) return null;
  if (livello === 'aal2') return null;
  const totp = (fattoriVerificati ?? [])[0];
  return totp ? { fase: 'verifica', factorId: totp.id } : { fase: 'registra' };
}

/**
 * Chiede a GoTrue il livello della sessione e i fattori dell'utente.
 * `getAuthenticatorAssuranceLevel` legge il token in locale; `listFactors`
 * fa una richiesta, quindi la si fa solo per l'admin non ancora a `aal2`.
 */
export async function valutaMfa(auth, ruolo) {
  if (ruolo !== RUOLO_CON_MFA) return null;
  const { data: livello, error } = await auth.mfa.getAuthenticatorAssuranceLevel();
  if (error) throw error;
  if (livello?.currentLevel === 'aal2') return null;
  const { data: fattori, error: errFattori } = await auth.mfa.listFactors();
  if (errFattori) throw errFattori;
  return faseMfa({ ruolo, livello: livello?.currentLevel, fattoriVerificati: fattori?.totp });
}
