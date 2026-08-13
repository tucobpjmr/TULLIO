#!/usr/bin/env node
// scripts/verifica-advisor/index.js
//
// Esegue periodicamente gli advisor di sicurezza e performance di Supabase
// (la stessa analisi mostrata nella dashboard, via Management API) e fallisce
// se emerge un lint di livello ERROR. A differenza di verifica-rpc/ e
// verifica-migrazioni (chiave anon, dati non sensibili), la Management API
// richiede un token personale con accesso al progetto: non è un dato
// pubblicabile nel bundle, va in un secret di repository.
//
//   npm run verifica:advisor
//
// Legge SUPABASE_ACCESS_TOKEN (repository secret) e, opzionalmente,
// SUPABASE_PROJECT_REF (default: il progetto di produzione di questo
// repository, lo stesso già scritto senza segretezza in verifica-rpc.yml e
// keep-supabase-warm.yml — è l'identificativo nell'URL, non una credenziale).
//
// SUPABASE_ACCESS_TOKEN non esiste ancora come secret finché non lo crea chi
// amministra il repository:
//   1. Supabase → Account → Access Tokens → genera un token (basta lettura).
//   2. GitHub → Settings → Secrets and variables → Actions → New repository
//      secret → nome SUPABASE_ACCESS_TOKEN.
// Finché il secret non c'è questo script si dichiara inconcludente ed esce 0
// — un controllo nuovo non può rendere rosso un workflow che va oltre lo
// scopo di chi lo ha aggiunto (vedi la stessa scelta per get_advisors nel
// caveat su come chi ha review-ato ha già accettato certi WARN).
import { valutaLints } from './advisor.js';

const PROJECT_REF_DEFAULT = 'vmxvnxsqfisucugcpqlc';

async function leggiAdvisor(fetchImpl, ref, token, tipo) {
  const r = await fetchImpl(`https://api.supabase.com/v1/projects/${ref}/advisors/${tipo}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    throw new Error(`advisor/${tipo} ha risposto HTTP ${r.status}: ${await r.text().catch(() => '')}`);
  }
  const corpo = await r.json();
  return corpo.lints || [];
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || PROJECT_REF_DEFAULT;

  if (!token) {
    console.log('⚠  SUPABASE_ACCESS_TOKEN non configurato: controllo advisor saltato.');
    console.log('   Vedi il commento in cima a questo file per come crearlo.');
    // Annotazione GitHub (A-2, audit del 12 agosto): compare in cima al run e
    // nel riepilogo della PR. Senza, "saltato" e "passato" hanno lo stesso
    // aspetto nell'interfaccia — ed è così che questo controllo è rimasto
    // inerte per giorni dopo essere stato aggiunto, senza che nessuno se ne
    // accorgesse: l'exit 0 silenzioso restava indistinguibile da un successo.
    console.log('::warning title=Advisor non verificati::' +
      'SUPABASE_ACCESS_TOKEN assente: gli advisor Supabase non sono stati controllati.');
    process.exit(0);
  }

  const [sicurezza, performance] = await Promise.all([
    leggiAdvisor(fetch, ref, token, 'security'),
    leggiAdvisor(fetch, ref, token, 'performance'),
  ]);
  const lints = [...sicurezza, ...performance];

  const { fallisce, errori, avvisi, nonAccettati } = valutaLints(lints);

  const accettati = avvisi.filter((l) => !nonAccettati.includes(l));
  for (const l of accettati) console.log(`  ⚠ [${l.categories?.join(',')}] ${l.title}: ${l.detail}`);
  // ST-14: gli avvisi che nessuno ha accettato si stampano come i fallimenti,
  // non in mezzo agli altri — è così che `auth_leaked_password_protection` è
  // rimasto invisibile per due audit di fila, prima di essere nominato in
  // AVVISI_ACCETTATI (accettato il 12 agosto: richiede il piano Supabase Pro,
  // il progetto resta sul Free per scelta).
  for (const l of nonAccettati) {
    console.log(`  ✗ AVVISO NON ACCETTATO [${l.name}] ${l.title}: ${l.detail}`);
    console.log(`    ${l.remediation ?? ''}`);
    console.log('    Se è una scelta consapevole, nominala in AVVISI_ACCETTATI ' +
      'con il motivo accanto; altrimenti va chiusa.');
  }
  for (const l of errori) console.log(`  ✗ [${l.categories?.join(',')}] ${l.title}: ${l.detail}\n    ${l.remediation ?? ''}`);

  console.log(`\n${errori.length} errori, ${nonAccettati.length} avvisi non accettati, ` +
    `${accettati.length} avvisi motivati (${lints.length} lint totali).`);

  if (fallisce) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica advisor: ${e.stack || e.message}`);
  process.exit(2);
});
