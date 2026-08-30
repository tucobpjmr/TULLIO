#!/usr/bin/env node
// scripts/verifica-audit/index.js
//
// Gate su `npm audit` con un'allow-list esplicita di advisory NOTE e
// MITIGATE.
//
// Nasce da S-1 dell'audit del 30 agosto: `xlsx@0.18.5` porta due CVE high
// (GHSA-4r6h-8v6p-xvw6, prototype pollution; GHSA-5pgg-2g8v-p4x9, ReDoS) e
// SheetJS ha lasciato il registry npm — le versioni corrette (0.19.3,
// 0.20.2+) esistono solo sul CDN del progetto, non su npm. `npm audit` è
// quindi rosso in permanenza, e senza questo gate resta rosso per SEMPRE:
// chiunque lo lanci impara a ignorarlo, e il giorno in cui comparirà una
// SECONDA vulnerabilità — in una dipendenza senza mitigazione — sarà
// indistinguibile dal rumore di fondo.
//
// Il rischio di xlsx è già mitigato architetturalmente, non ignorato: il
// parse gira in un Web Worker terminato subito dopo (src/lib/xlsxWorker.js)
// e src/lib/prototypeGuard.js sorveglia il passaggio di confine confrontando
// i descrittori di Object/Array/Function. Questo script codifica quella
// mitigazione come eccezione dichiarata — non come silenzio.
//
//   npm run verifica:audit
//   (compone `npm audit --json` con questo script via pipe — vedi package.json)
//
// Uscita: 0 se ogni advisory high/critical è nell'allow-list qui sotto,
// 1 se ne compare una nuova (fix disponibile o no) o se stdin non è JSON
// valido. Un audit che non può che essere rosso non protegge niente; uno
// che è verde finché non arriva qualcosa di nuovo protegge esattamente ciò
// per cui esiste.
import { readFileSync } from 'node:fs';

// Ogni voce: perché è nell'elenco e dove vive la mitigazione nel codice.
const ALLOWLIST = {
  'GHSA-4R6H-8V6P-XVW6': {
    pacchetto: 'xlsx',
    motivo: 'Prototype Pollution in SheetJS — nessun fix su npm (SheetJS ha ' +
      'lasciato il registry). Mitigata: il parse gira in un Web Worker ' +
      'terminato subito dopo (src/lib/xlsxWorker.js) e ' +
      'src/lib/prototypeGuard.js sorveglia il passaggio di confine.',
  },
  'GHSA-5PGG-2G8V-P4X9': {
    pacchetto: 'xlsx',
    motivo: 'SheetJS ReDoS — stesso stato di fix e stessa mitigazione della ' +
      'voce precedente (Worker + prototypeGuard.js).',
  },
};

function estraiGhsaId(url) {
  if (typeof url !== 'string') return null;
  const m = url.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
  return m ? m[0].toUpperCase() : null;
}

function leggiReport() {
  let testo;
  try {
    testo = readFileSync(0, 'utf8');
  } catch {
    console.error('verifica:audit: impossibile leggere stdin — vedi lo script npm "verifica:audit".');
    process.exit(1);
  }
  try {
    return JSON.parse(testo);
  } catch {
    console.error('verifica:audit: stdin non è JSON valido — atteso l\'output di "npm audit --json".');
    console.error(testo);
    process.exit(1);
  }
}

function main() {
  const report = leggiReport();
  const vulnerabilita = report.vulnerabilities || {};

  const nonElencate = [];
  const elencate = [];

  for (const voce of Object.values(vulnerabilita)) {
    if (voce.severity !== 'high' && voce.severity !== 'critical') continue;
    for (const via of voce.via || []) {
      if (typeof via === 'string') continue; // riferimento a un'altra dipendenza, non un advisory
      const ghsaId = estraiGhsaId(via.url);
      const nota = ghsaId ? ALLOWLIST[ghsaId] : undefined;
      if (nota) {
        elencate.push({ ghsaId, titolo: via.title, ...nota });
      } else {
        nonElencate.push({ ghsaId, titolo: via.title, pacchetto: voce.name, severity: voce.severity, url: via.url });
      }
    }
  }

  if (elencate.length > 0) {
    console.log('verifica:audit — advisory note e mitigate:');
    for (const v of elencate) {
      console.log(`  ${v.ghsaId} (${v.pacchetto}) — ${v.titolo}`);
      console.log(`    ${v.motivo}`);
    }
  }

  if (nonElencate.length > 0) {
    console.error('\nverifica:audit: advisory high/critical NON nell\'allow-list:');
    for (const v of nonElencate) {
      console.error(`  ${v.ghsaId || '(senza GHSA id)'} (${v.pacchetto}, ${v.severity}) — ${v.titolo}`);
      if (v.url) console.error(`    ${v.url}`);
    }
    console.error(
      '\nSe è una nuova CVE su xlsx già nell\'elenco: verificane la mitigazione e ' +
      'aggiungila in scripts/verifica-audit/index.js con il motivo. Se è un\'altra ' +
      'dipendenza: risolvila (npm audit fix, o un aggiornamento) — questo gate esiste ' +
      'perché un\'eccezione dichiarata protegge, un audit rosso in permanenza no.'
    );
    process.exit(1);
  }

  console.log('\nverifica:audit: OK — nessuna advisory high/critical fuori allow-list.');
}

main();
