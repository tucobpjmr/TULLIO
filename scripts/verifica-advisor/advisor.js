// scripts/verifica-advisor/advisor.js
//
// Parte pura del controllo advisor: dato l'esito grezzo delle chiamate alla
// Management API di Supabase (security + performance advisors), decide se il
// controllo deve fallire.
//
// Perché solo "ERROR" fa fallire: i lint di livello WARN/INFO di questo
// progetto sono in parte accettati consapevolmente (es. le funzioni
// SECURITY DEFINER richiamabili da `authenticated` come get_vapid_public_key
// o reset_completo — gate applicativo voluto, non un buco; gli indici non
// ancora usati su tabelle nuove). Farli fallire tutti trasformerebbe un
// controllo periodico in un allarme costante e ignorato — la stessa
// preoccupazione già scritta in scripts/verifica-rpc/sonda.js. ERROR sì:
// sono cose come RLS disabilitata su una tabella esposta, dove non c'è un
// motivo legittimo per cui dovrebbe restare così.
// ─── ST-14 · GLI AVVISI ACCETTATI SONO UN ELENCO, NON UNA CATEGORIA ─────────
// Il commento qui sopra dice il vero ma nasconde una cosa: «i WARN di questo
// progetto sono in parte accettati consapevolmente». In parte. Fra i dieci WARN
// dell'advisor, nove sono le funzioni SECURITY DEFINER esposte di proposito
// (motivate in docs/SICUREZZA.md) e uno — `auth_leaked_password_protection` —
// non è accettato da nessuno: è il rilievo B-2 dell'audit di architettura, poi
// ST-14 di quello di struttura, aperto da agosto e mai chiuso perché non è
// correggibile da codice (Supabase → Authentication → Password → Enable leaked
// password protection). Trattandolo come "un WARN come gli altri" lo si è reso
// invisibile per due audit di fila.
//
// Da qui in avanti l'accettazione è NOMINATA: i lint in questo elenco non fanno
// fallire, tutti gli altri sì — compresi quelli che non esistono ancora, che è
// il caso che conta davvero (un WARN nuovo su una tabella nuova oggi si
// perderebbe in mezzo ai nove noti).
const AVVISI_ACCETTATI = new Set([
  // Funzioni SECURITY DEFINER richiamabili da `authenticated`: sono le RPC
  // transazionali del modulo Liste e le due letture di configurazione. Il gate
  // è applicativo e voluto, non un buco — vedi docs/SICUREZZA.md.
  'anon_security_definer_function_executable',
  'authenticated_security_definer_function_executable',
  // Indici non ancora usati su tabelle nuove: informativo per definizione.
  'unused_index',
  'unindexed_foreign_keys',
]);

export function valutaLints(lints) {
  const errori = lints.filter((l) => l.level === 'ERROR');
  const avvisi = lints.filter((l) => l.level === 'WARN');
  // Un WARN non nominato nell'elenco è un rilievo aperto che nessuno ha
  // deciso di accettare: va detto, e va detto in modo che qualcuno lo chiuda.
  const nonAccettati = avvisi.filter((l) => !AVVISI_ACCETTATI.has(l.name));
  return {
    fallisce: errori.length > 0 || nonAccettati.length > 0,
    errori,
    avvisi,
    nonAccettati,
  };
}

export { AVVISI_ACCETTATI };
