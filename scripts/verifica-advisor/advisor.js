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
export function valutaLints(lints) {
  const errori = lints.filter((l) => l.level === 'ERROR');
  const avvisi = lints.filter((l) => l.level === 'WARN');
  return { fallisce: errori.length > 0, errori, avvisi };
}
