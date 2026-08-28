// scripts/verifica-redirect/csp.js
//
// B-3 dell'audit sicurezza del 26 agosto 2026. La allow-list degli host che
// questo progetto possiede vive in TRE posti indipendenti — ORIGIN_PROPRIE in
// `supabase/functions/_shared/originConsentite.ts`, la Content-Security-Policy
// in `vercel.json`, e i Redirect URL nella dashboard Supabase — e solo il
// terzo aveva una sonda (il resto di questo modulo, da C-1 del 22 agosto).
// Aggiungere un dominio significa quindi ricordarsi di tre modifiche, e le
// prime due possono divergere in silenzio: nessun controllo esistente lo
// direbbe.
//
// Questo file confronta le prime due. È testo, non un import di
// originConsentite.ts: quel file è TypeScript ed è pensato per girare dentro
// una Edge Function Deno, non per essere eseguito da uno script Node — la
// stessa ragione per cui verifica-convenzioni legge il codice come stringa
// invece di caricarlo. Estrarre l'elenco da un letterale `Set([...])` con una
// regex è fragile solo quanto lo è il formato del file, che è dichiarato e
// coperto da `estraiOriginProprie.test` (vedi verificaRedirect.test.js): se
// smette di combaciare, il controllo solleva invece di leggere silenziosamente
// un elenco vuoto.

/**
 * Estrae gli hostname elencati nel letterale `ORIGIN_PROPRIE: ... Set([...])`
 * dal sorgente testuale di originConsentite.ts.
 *
 * @param {string} sorgente contenuto del file originConsentite.ts
 * @returns {string[]} gli hostname, nell'ordine in cui compaiono
 */
export function estraiOriginProprie(sorgente) {
  const blocco = /ORIGIN_PROPRIE[^=]*=\s*new Set\(\s*\[([\s\S]*?)\]\s*\)/.exec(sorgente);
  if (!blocco) {
    throw new Error(
      'estraiOriginProprie: non trovo più il letterale "ORIGIN_PROPRIE = new Set([...])" ' +
      'in originConsentite.ts — il file è cambiato forma, questa estrazione va aggiornata.',
    );
  }
  const host = [...blocco[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  if (!host.length) {
    throw new Error('estraiOriginProprie: il letterale ORIGIN_PROPRIE non contiene alcun host.');
  }
  return host;
}

/**
 * Estrae il valore della direttiva Content-Security-Policy dall'oggetto
 * già fatto il parse di vercel.json.
 *
 * @param {object} vercelJson il contenuto di vercel.json (parsificato)
 * @returns {string} il valore dell'header Content-Security-Policy
 */
export function estraiCsp(vercelJson) {
  for (const blocco of vercelJson.headers ?? []) {
    const csp = blocco.headers?.find((h) => h.key === 'Content-Security-Policy');
    if (csp) return csp.value;
  }
  throw new Error('estraiCsp: nessun header Content-Security-Policy trovato in vercel.json.');
}

/**
 * Gli host di ORIGIN_PROPRIE che la CSP non copre: né nominati esplicitamente,
 * né coperti da `'self'` (che nella pagina servita da quell'host vale come
 * l'host stesso).
 *
 * @param {object}   args
 * @param {string[]} args.originProprie host da `estraiOriginProprie`
 * @param {string}   args.csp valore della CSP da `estraiCsp`
 * @returns {string[]} gli host scoperti, cioè il rilievo da segnalare
 */
export function hostMancantiDallaCsp({ originProprie, csp }) {
  return originProprie.filter((h) => !csp.includes(h) && !csp.includes("'self'"));
}
