// scripts/verifica-funzioni/funzioni.js
//
// Parte pura del controllo «Edge Function deployate = cartelle in
// supabase/functions/». Il motivo è nel preambolo di index.js.

/**
 * Le cartelle di supabase/functions/ che sono una funzione. `_shared` e ogni
 * altra cartella che inizia con `_` sono codice condiviso, non deployabile:
 * è la stessa convenzione della CLI Supabase.
 * @param {string[]} cartelle nomi delle sottocartelle
 * @returns {string[]}
 */
export function funzioniLocali(cartelle) {
  return cartelle.filter((nome) => !nome.startsWith('_') && !nome.startsWith('.')).sort();
}

/**
 * @param {{ locali: string[], deployate: { slug: string, status?: string }[] }} p
 * @returns {{ nonVersionate: string[], nonDeployate: string[], fallisce: boolean }}
 *   nonVersionate: in produzione ma senza cartella nel repository — il caso
 *     di sicurezza: codice che gira con i segreti del progetto e che nessuna
 *     review ha visto.
 *   nonDeployate: nel repository ma non in produzione — il codice c'è, la
 *     funzione no: chi la chiama riceve 404.
 */
export function confrontaFunzioni({ locali, deployate }) {
  const inRepo = new Set(locali);
  const inProd = new Set(deployate.map((f) => f.slug));
  const nonVersionate = [...inProd].filter((s) => !inRepo.has(s)).sort();
  const nonDeployate = [...inRepo].filter((s) => !inProd.has(s)).sort();
  return { nonVersionate, nonDeployate, fallisce: nonVersionate.length > 0 || nonDeployate.length > 0 };
}
