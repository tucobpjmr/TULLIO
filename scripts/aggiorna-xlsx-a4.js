#!/usr/bin/env node
// scripts/aggiorna-xlsx-a4.js
//
// Script di supporto al job una tantum `.github/workflows/aggiorna-xlsx-a4.yml`
// (A-4, audit sicurezza del 2 settembre): dopo che il workflow ha installato
// `xlsx` dal tarball CDN, questo script aggiorna il commento in cima a
// `src/lib/xlsxWorker.js`, che documentava il fix come "da fare", perché
// dichiari che è stato applicato.
//
// Uso: node scripts/aggiorna-xlsx-a4.js <versione xlsx installata>
//
// Sia questo file sia il workflow sono da cancellare una volta che A-4 è
// chiuso: non servono a nient'altro.
import { readFileSync, writeFileSync } from 'node:fs';

const versione = process.argv[2];
if (!versione) {
  console.error('uso: node scripts/aggiorna-xlsx-a4.js <versione xlsx installata>');
  process.exit(1);
}

const percorso = 'src/lib/xlsxWorker.js';

const VECCHIO = [
  "// ─── PERCHÉ (A-1 dell'audit sicurezza del 26 agosto) ────────────────────────",
  '//',
  "// `xlsx@0.18.5` è l'ultima versione pubblicata sul registry npm — gli autori",
  '// rilasciano le successive, con i fix, solo sul proprio CDN — e porta due',
  '// vulnerabilità note:',
  '//   • GHSA-4r6h-8v6p-xvw6 (CVE-2023-30533) Prototype Pollution — fix in 0.19.3+',
  '//   • GHSA-5pgg-2g8v-p4x9 (CVE-2024-22363) ReDoS                — fix in 0.20.2+',
  "// L'egress verso `cdn.sheetjs.com` è bloccato da questo ambiente (403,",
  '// riverificato quattro volte fra il 6 e il 26 agosto), quindi la migrazione',
  '// alla 0.20.3 non è applicabile qui: resta il fix DEFINITIVO da eseguire',
  '// appena la rete lo consenta, con `npm install --save',
  '// https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`.',
  '//',
  "// Fino ad allora la difesa era `withPrototypePollutionGuard`, che confronta i",
  '// descrittori dei prototipi prima e dopo il parse. Funziona, ma va',
  "// contabilizzata per ciò che è: una RILEVAZIONE A POSTERIORI. Se un gadget si",
  '// innesca durante il parse, quando il guard se ne accorge è già stato',
  "// eseguito — nel realm che tiene il token di sessione in `localStorage`.",
].join('\n');

const NUOVO = [
  "// ─── PERCHÉ (A-1 dell'audit sicurezza del 26 agosto; A-4 del 2 settembre chiuso) ───",
  '//',
  "// Fino a `xlsx@0.18.5` — l'ultima versione pubblicata sul registry npm, dato",
  '// che SheetJS rilascia le successive, con i fix, solo sul proprio CDN — il',
  '// pacchetto portava due vulnerabilità note:',
  '//   • GHSA-4r6h-8v6p-xvw6 (CVE-2023-30533) Prototype Pollution — fix in 0.19.3+',
  '//   • GHSA-5pgg-2g8v-p4x9 (CVE-2024-22363) ReDoS                — fix in 0.20.2+',
  `// Il fix DEFINITIVO è ora applicato: \`xlsx@${versione}\` installato da`,
  `// \`npm install --save https://cdn.sheetjs.com/xlsx-${versione}/xlsx-${versione}.tgz\``,
  "// (l'unico modo di ottenerlo, dato che SheetJS ha lasciato il registry npm).",
  '// `package-lock.json` pinna l\'URL del tarball, quindi `npm ci` non deve',
  '// ricontattare il CDN.',
  '//',
  '// La difesa resta comunque `withPrototypePollutionGuard`, che confronta i',
  '// descrittori dei prototipi prima e dopo il parse — non un ripiego in attesa',
  '// del fix, ma difesa in profondità valida indipendentemente dalla versione',
  "// installata. Funziona, ma va contabilizzata per ciò che è: una RILEVAZIONE A",
  '// POSTERIORI. Se un gadget si innesca durante il parse, quando il guard se ne',
  "// accorge è già stato eseguito — nel realm che tiene il token di sessione in",
  '// `localStorage`.',
].join('\n');

const testo = readFileSync(percorso, 'utf8');

if (!testo.includes(VECCHIO)) {
  console.error(
    `${percorso}: il commento atteso non è stato trovato — probabilmente qualcuno ` +
    "l'ha già modificato. Aggiornalo a mano; il resto del job continua comunque."
  );
  process.exit(0);
}

writeFileSync(percorso, testo.replace(VECCHIO, NUOVO));
console.log(`${percorso}: commento aggiornato (xlsx@${versione}).`);
