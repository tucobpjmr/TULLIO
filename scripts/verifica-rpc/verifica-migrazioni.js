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
// ⚠️ B-1 dell'audit del 26 agosto: get_migrazioni_applicate() non è più
// concessa ad anon (20260828100000_ping_revoca_anon_migrazioni.sql) — restava
// raggiungibile da chiunque avesse la chiave anon pubblica, cioè da chiunque,
// e l'elenco dei nomi di migrazione è ricognizione gratuita sulla storia di
// sicurezza del progetto. Con la sola chiave anon la RPC risponde "permission
// denied": è trattato come INCONCLUSIVO (esce 0 con un avviso), non come uno
// scarto trovato — stessa scelta di verifica-advisor quando manca il token.
//
// Per tornare a verificare per davvero servono anche VERIFICA_MIGRAZIONI_EMAIL
// / VERIFICA_MIGRAZIONI_PASSWORD: le credenziali di un account già esistente
// (qualunque ruolo va bene — la funzione non applica RLS né richiede
// `is_active_user()`, è un grant di funzione). Quando sono presenti, questo
// script fa il login su GoTrue e chiama la RPC con quel JWT come Bearer
// invece che con la sola chiave anon. Senza, resta sospeso come prima e lo
// dice ad ogni esecuzione.
//
// Uscita: 0 se tutto risolve O se la verifica è inconcludente (manca la
// configurazione, o get_migrazioni_applicate rifiuta la chiave anon perché
// VERIFICA_MIGRAZIONI_EMAIL/PASSWORD non sono configurate), 1 se almeno un
// file locale non risulta applicato né in eccezione, 2 su un errore di rete,
// o se le credenziali sono configurate ma il login fallisce (in quel caso NON
// è inconcludente: qualcuno ha rotto la configurazione, va segnalato rosso).
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analizzaNomeFile, confrontaMigrazioni, trovaNonVersionate, trovaRiapplicate, ECCEZIONI_STORICHE,
  PermessoNegato, leggiMigrazioniApplicate, accediPerVerificaMigrazioni,
} from './migrazioni.js';

const RADICE = fileURLToPath(new URL('../..', import.meta.url));
const DIR_MIGRAZIONI = join(RADICE, 'supabase', 'migrations');

function leggiMigrazioniLocali() {
  return readdirSync(DIR_MIGRAZIONI)
    .filter((f) => f.endsWith('.sql'))
    .map((f) => analizzaNomeFile(f.slice(0, -4)))
    .filter(Boolean);
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

  const email = process.env.VERIFICA_MIGRAZIONI_EMAIL;
  const password = process.env.VERIFICA_MIGRAZIONI_PASSWORD;
  const autenticato = Boolean(email && password);

  let bearer = chiave; // fallback storico: la sola chiave anon, che da B-1 in poi rifiuta.
  if (autenticato) {
    try {
      bearer = await accediPerVerificaMigrazioni(base, chiave, email, password, fetch);
      console.log(`Autenticato come ${email} per la lettura delle migrazioni applicate.\n`);
    } catch (e) {
      // Credenziali CONFIGURATE ma il login fallisce: non è il caso previsto
      // da B-1 (nessuna configurazione), è una configurazione rotta — password
      // ruotata, account disattivato. Va segnalato rosso, non inconcludente.
      console.error(`Impossibile autenticarsi come ${email}: ${e.message}`);
      console.error('VERIFICA_MIGRAZIONI_EMAIL/PASSWORD sono configurate ma il login GoTrue');
      console.error('fallisce: verifica le credenziali (password ruotata? account disattivato?).');
      process.exit(2);
    }
  }

  let applicate;
  try {
    applicate = await leggiMigrazioniApplicate(base, chiave, fetch, bearer);
  } catch (e) {
    if (e instanceof PermessoNegato) {
      // Con VERIFICA_MIGRAZIONI_EMAIL/PASSWORD configurate questo non
      // dovrebbe accadere (la RPC non applica RLS): se accade è una sorpresa
      // vera, non l'assenza di configurazione prevista da B-1 — resta comunque
      // inconcludente (0 con avviso), perché il difetto è nell'accesso alla
      // verifica stessa, non uno scarto di migrazioni trovato.
      console.log(`⚠  ${e.message}`);
      if (autenticato) {
        console.log(`   Autenticato come ${email}, ma get_migrazioni_applicate() rifiuta comunque.`);
        console.log('   Non dovrebbe succedere (la funzione non applica RLS): verifica il grant');
        console.log('   `authenticated` sulla funzione, non solo le credenziali.');
      } else {
        console.log('   get_migrazioni_applicate() non è più raggiungibile con la sola chiave');
        console.log('   anon (B-1 dell\'audit del 26 agosto): questo controllo è sospeso finché');
        console.log('   non riceve VERIFICA_MIGRAZIONI_EMAIL/PASSWORD. Nessun allarme: non ha');
        console.log('   trovato uno scarto, non può più cercarlo.');
      }
      console.log('::warning title=Verifica migrazioni sospesa::get_migrazioni_applicate() ' +
        'rifiuta l\'accesso corrente. Serve un accesso authenticated valido per ripristinare ' +
        'questo controllo.');
      process.exit(0);
    }
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

  // M-2 dell'audit del 15 agosto: un nome applicato più volte è invisibile a
  // confrontaMigrazioni/trovaNonVersionate (entrambe usano Set). Non fa
  // fallire il workflow per la stessa ragione di trovaNonVersionate — una
  // riapplicazione legittima (correggere una migrazione già viva) è la norma,
  // non l'eccezione — ma se il corpo SQL è cambiato fra le due applicazioni,
  // la produzione esegue oggi qualcosa che il repository non ha più: va
  // nominato, e verificato a mano quando compare.
  const riapplicate = trovaRiapplicate(applicate);
  if (riapplicate.length) {
    console.log(`⚠ ${riapplicate.length} migrazioni applicate più di una volta:\n`);
    for (const [nome, versioni] of riapplicate) console.log(`    ${nome}: ${versioni.join(', ')}`);
    console.log('\nSe il corpo SQL non è cambiato fra le applicazioni non serve fare nulla.');
    console.log('Se è cambiato, la produzione esegue una versione diversa da quella nel file');
    console.log('locale: verifica il corpo vivo (pg_get_functiondef o pg_policies) contro il');
    console.log('file corrispondente prima di fidarti di uno dei due.\n');
    console.log(`::warning title=Migrazioni riapplicate::${riapplicate.length} nomi applicati ` +
      `più di una volta: ${riapplicate.map(([nome]) => nome).join(', ')}`);
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
