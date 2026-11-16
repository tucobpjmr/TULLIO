#!/usr/bin/env node
// scripts/verifica-funzioni/index.js
//
// Confronta le Edge Function deployate in produzione con le cartelle di
// supabase/functions/, e fallisce se i due elenchi non coincidono.
//
//   npm run verifica:funzioni
//
// PERCHÉ (C-1 dell'analisi del 15 novembre). In produzione giravano due
// funzioni assenti dal repository: `plan-day`, un proxy verso un'API AI a
// pagamento con CORS `*` e nessun controllo di ruolo — bastava la chiave anon,
// che è pubblica — e `qa-realtime-typing-check`, una prova dismessa. Le
// migrazioni avevano già chi le confrontava con la produzione; le funzioni no.
//
// ⛔ Nessuna lista di eccezioni: una funzione in produzione o ha la sua
// cartella qui, o va eliminata (`supabase functions delete <nome>`).
//
// Usa lo stesso SUPABASE_ACCESS_TOKEN di verifica:advisor (Management API).
// Senza token il controllo si dichiara inconcludente ed esce 0, con
// un'annotazione visibile nel run — stessa scelta di verifica-advisor.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { funzioniLocali, confrontaFunzioni } from './funzioni.js';

const PROJECT_REF_DEFAULT = 'vmxvnxsqfisucugcpqlc';
const RADICE = fileURLToPath(new URL('../..', import.meta.url));
const DIR_FUNZIONI = join(RADICE, 'supabase', 'functions');

function leggiLocali() {
  const cartelle = readdirSync(DIR_FUNZIONI, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  return funzioniLocali(cartelle);
}

async function leggiDeployate(ref, token) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    throw new Error(`functions ha risposto HTTP ${r.status}: ${await r.text().catch(() => '')}`);
  }
  return r.json();
}

async function main() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.SUPABASE_PROJECT_REF || PROJECT_REF_DEFAULT;

  if (!token) {
    console.log('⚠  SUPABASE_ACCESS_TOKEN non configurato: controllo Edge Function saltato.');
    console.log('::warning title=Edge Function non verificate::' +
      'SUPABASE_ACCESS_TOKEN assente: le funzioni deployate non sono state confrontate col repository.');
    process.exit(0);
  }

  const locali = leggiLocali();
  const deployate = await leggiDeployate(ref, token);
  console.log(`Repository: ${locali.join(', ')}`);
  console.log(`Produzione: ${deployate.map((f) => f.slug).sort().join(', ')}\n`);

  const { nonVersionate, nonDeployate, fallisce } = confrontaFunzioni({ locali, deployate });

  for (const s of nonVersionate) {
    console.log(`  ✗ IN PRODUZIONE SENZA CARTELLA: ${s}`);
    console.log(`    Gira con i segreti del progetto e nessuna review l'ha vista.`);
    console.log(`    Se serve, versionala in supabase/functions/${s}/; altrimenti:`);
    console.log(`      supabase functions delete ${s} --project-ref ${ref}`);
  }
  for (const s of nonDeployate) {
    console.log(`  ✗ NEL REPOSITORY MA NON DEPLOYATA: ${s}`);
    console.log(`      supabase functions deploy ${s} --project-ref ${ref}`);
  }

  if (fallisce) {
    console.log(`\n${nonVersionate.length} non versionate, ${nonDeployate.length} non deployate.`);
    process.exit(1);
  }
  console.log(`✓ ${locali.length} funzioni, repository e produzione coincidono.`);
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica delle Edge Function: ${e.stack || e.message}`);
  process.exit(2);
});
