#!/usr/bin/env node
// scripts/verifica-rpc/index.js
//
// Controlla che ogni RPC chiamata dal frontend esista sul database.
//
// Nasce da un guasto reale: la migrazione 20260729200000 (note interne delle
// liste) era nel repository ma non era mai stata applicata al progetto
// Supabase. Il codice era corretto, i test passavano, il build passava — e
// salvare una nota rispondeva "Could not find the function
// public.modifica_note_lista(p_id, p_note) in the schema cache". Nessun
// controllo esistente poteva accorgersene, perché lo scarto non era dentro il
// repository ma tra il repository e il database. Le migrazioni qui si
// applicano a mano, quindi lo scarto è una possibilità permanente.
//
//   npm run verifica:rpc
//
// Legge l'indirizzo e la chiave anon da SUPABASE_URL / SUPABASE_ANON_KEY
// (in alternativa VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
//
// Uscita: 0 se tutto risolve o se la verifica è inconcludente, 1 se almeno una
// RPC manca davvero. L'inconcludenza non fa fallire di proposito — vedi la
// nota sui controlli in sonda.js.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { estraiChiamateRpc, raggruppaPerNome } from './estrai.js';
import { verifica, MANCANTE, INDETERMINATO } from './sonda.js';

const RADICE = fileURLToPath(new URL('../..', import.meta.url));
const SORGENTI = join(RADICE, 'src');
const ESTENSIONI = /\.(js|jsx)$/;

function* fileSorgente(dir) {
  for (const voce of readdirSync(dir)) {
    const percorso = join(dir, voce);
    if (statSync(percorso).isDirectory()) yield* fileSorgente(percorso);
    else if (ESTENSIONI.test(voce)) yield percorso;
  }
}

function raccogliChiamate() {
  const tutte = [];
  const origini = new Map();
  for (const percorso of fileSorgente(SORGENTI)) {
    // I test montano client finti: le loro `.rpc()` non sono chiamate reali.
    if (percorso.includes(`${join('src', 'test')}`)) continue;
    for (const c of estraiChiamateRpc(readFileSync(percorso, 'utf8'))) {
      tutte.push(c);
      if (!origini.has(c.nome)) origini.set(c.nome, relative(RADICE, percorso));
    }
  }
  return { funzioni: raggruppaPerNome(tutte), origini };
}

async function main() {
  const base = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const chiave = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!base || !chiave) {
    console.error('Mancano SUPABASE_URL e/o SUPABASE_ANON_KEY (o le equivalenti VITE_).');
    process.exit(2);
  }

  const { funzioni, origini } = raccogliChiamate();
  if (!funzioni.length) {
    console.error('Nessuna chiamata .rpc() trovata in src/: il controllo non ha nulla da verificare.');
    process.exit(2);
  }

  console.log(`Verifico ${funzioni.length} RPC chiamate dal frontend su ${base}\n`);
  const esito = await verifica({ base, chiave, funzioni });

  if (esito.verdetto === INDETERMINATO) {
    console.log(`⚠  Verifica inconcludente: ${esito.motivo}.`);
    console.log('   Nessun allarme: il controllo non è in grado di decidere, non ha trovato problemi.');
    process.exit(0);
  }

  for (const d of esito.dettagli) {
    const segno = d.esito === MANCANTE ? '✗' : d.esito === INDETERMINATO ? '?' : '✓';
    console.log(`  ${segno} ${d.nome}`);
  }

  if (esito.verdetto === 'drift') {
    console.log(`\n✗ ${esito.mancanti.length} RPC chiamate dal codice non esistono sul database:\n`);
    for (const nome of esito.mancanti) {
      console.log(`    ${nome}  —  chiamata da ${origini.get(nome)}`);
    }
    console.log('\nProbabile causa: una migrazione presente in supabase/migrations/ non è');
    console.log('stata applicata al progetto. Confronta le migrazioni locali con quelle');
    console.log('applicate e applica le mancanti.');
    process.exit(1);
  }

  console.log('\n✓ Tutte le RPC chiamate dal codice esistono sul database.');
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica: ${e.stack || e.message}`);
  process.exit(2);
});
