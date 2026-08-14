#!/usr/bin/env node
// scripts/verifica-rpc/verifica-migrazioni.js
//
// Controlla che ogni file in supabase/migrations/ risulti applicato al
// database — vedi migrazioni.js per il perché e per il funzionamento del
// confronto.
//
//   npm run verifica:migrazioni
//
// Legge l'indirizzo e la chiave anon da SUPABASE_URL / SUPABASE_ANON_KEY (in
// alternativa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY), come index.js.
//
// Uscita: 0 se tutto risolve, 1 se almeno un file locale non risulta
// applicato né in eccezione, 2 su errore di configurazione o di rete.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analizzaNomeFile, confrontaMigrazioni, trovaNonVersionate, ECCEZIONI_STORICHE } from './migrazioni.js';

const RADICE = fileURLToPath(new URL('../..', import.meta.url));
const DIR_MIGRAZIONI = join(RADICE, 'supabase', 'migrations');

function leggiMigrazioniLocali() {
  return readdirSync(DIR_MIGRAZIONI)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => analizzaNomeFile(f.slice(0, -4)))
    .filter(Boolean);
}

async function leggiMigrazioniApplicate(base, chiave, fetchImpl) {
  const url = `${base.replace(/\/$/, '')}/rest/v1/rpc/get_migrazioni_applicate`;
  const r = await fetchImpl(url, { headers: { apikey: chiave, Authorization: `Bearer ${chiave}` } });
  if (!r.ok) {
    throw new Error(`get_migrazioni_applicate ha risposto HTTP ${r.status}: ${await r.text().catch(() => '')}`);
  }
  return r.json();
}

async function main() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const chiave = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !chiave) {
    console.error('Mancano SUPABASE_URL e/o SUPABASE_ANON_KEY (o le equivalenti VITE_).');
    process.exit(2);
  }

  const locali = leggiMigrazioniLocali();
  console.log(`Confronto ${locali.length} migrazioni locali con quelle applicate su ${base}\n`);

  let applicate;
  try {
    applicate = await leggiMigrazioniApplicate(base, chiave, fetch);
  } catch (e) {
    console.error(`Impossibile leggere le migrazioni applicate: ${e.message}`);
    console.error('Nessun allarme: la verifica non può decidere, non ha trovato uno scarto.');
    process.exit(2);
  }

  const { mancanti } = confrontaMigrazioni({ locali, applicate, eccezioni: ECCEZIONI_STORICHE });

  // M-4 dell'audit del 14 agosto: il verso opposto (produzione → repository)
  // non fa fallire il workflow — vedi il commento su trovaNonVersionate in
  // migrazioni.js sul perché — ma va nominato, non lasciato invisibile come
  // prima di questo controllo.
  const nonVersionate = trovaNonVersionate({ locali, applicate });
  if (nonVersionate.length) {
    console.log(`⚠ ${nonVersionate.length} migrazioni applicate al database senza un file locale corrispondente:\n`);
    for (const a of nonVersionate) console.log(`    ${a.version} ${a.name}`);
    console.log('\nSe è una rinomina legittima (lo strumento di applicazione ha generato il');
    console.log('proprio nome o la propria versione) aggiungila a ALIAS_APPLICATE in');
    console.log('migrazioni.js; se è uno scarto vero, committa il file mancante.\n');
    console.log(`::warning title=Migrazioni non versionate::${nonVersionate.length} migrazioni ` +
      `applicate al database non hanno un file locale corrispondente: ` +
      `${nonVersionate.map((a) => a.name).join(', ')}`);
  }

  if (mancanti.length) {
    console.log(`✗ ${mancanti.length} migrazioni presenti nel repository non risultano applicate:\n`);
    for (const m of mancanti) console.log(`    ${m.file}.sql`);
    console.log('\nApplica la migrazione mancante (o, se è già stata applicata con un nome');
    console.log('diverso da quello del file, aggiungila a ECCEZIONI_STORICHE in migrazioni.js');
    console.log('con il motivo) e rilancia con "Run workflow" (workflow_dispatch).');
    process.exit(1);
  }

  console.log(`✓ Tutte le migrazioni locali risultano applicate (${applicate.length} applicate sul database).`);
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica: ${e.stack || e.message}`);
  process.exit(2);
});
