#!/usr/bin/env node
// scripts/verifica-audit/index.js
//
// Gate su `npm audit` con un'allow-list esplicita di advisory NOTE e
// MITIGATE.
//
// Nasce da S-1 dell'audit del 30 agosto: `xlsx@0.18.5` portava due CVE high
// (GHSA-4r6h-8v6p-xvw6, prototype pollution; GHSA-5pgg-2g8v-p4x9, ReDoS) e
// SheetJS ha lasciato il registry npm — le versioni corrette (0.19.3, 0.20.2+)
// esistono solo sul CDN del progetto. `npm audit` era quindi rosso in
// permanenza, e senza questo gate sarebbe restato rosso per SEMPRE: chiunque
// lo lanci impara a ignorarlo, e il giorno in cui comparirà una SECONDA
// vulnerabilità — in una dipendenza senza mitigazione — sarebbe
// indistinguibile dal rumore di fondo.
//
// ─── A-1 dell'audit del 5 settembre · L'ELENCO È VUOTO, E DEVE RESTARLO ────
//
// Le due voci di xlsx ERANO qui e sono state TOLTE. A-4 dell'audit del 4
// settembre ha portato `xlsx` alla 0.20.3, che corregge entrambe le CVE, e da
// quel momento le due righe non descrivevano più niente: `npm audit` sul
// lockfile di oggi riporta `found 0 vulnerabilities` — verificato, non
// dedotto, perché il lockfile registra `"version": "0.20.3"` accanto alla URL
// del CDN e npm la confronta con il database degli advisory esattamente come
// farebbe per un pacchetto del registry.
//
// ⚠️ TOGLIERLE NON È PULIZIA: È IL GATE CHE DIVENTA PIÙ STRETTO. Finché
// restavano, un ritorno a una `xlsx` vulnerabile — un rollback, un merge
// sbagliato, un lockfile rigenerato male — sarebbe passato in silenzio,
// assorbito da un'eccezione scritta per un problema che non esisteva più. Ora
// quel caso fa fallire il controllo, che è ciò per cui esiste.
//
// ⛔ NON RIMETTERLE «per sicurezza». Un'eccezione per una CVE già corretta non
// protegge da nulla e nasconde il caso in cui torna: è la forma che ST-14 ha
// già chiuso una volta su `auth_leaked_password_protection`, dove il difetto
// era l'opposto — un avviso vero trattato come rumore noto. Le due sono la
// stessa cosa vista dai due lati: un elenco di eccezioni dice la verità solo
// se ogni voce corrisponde a un rischio che c'è ADESSO.
//
// Il Worker usa-e-getta (src/lib/xlsxWorker.js) e src/lib/prototypeGuard.js
// restano al loro posto e NON sono la ragione di questa nota: erano difesa in
// profondità quando il parser era vulnerabile, e restano difesa in profondità
// su un parser sano che legge file di terzi.
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

// Ogni voce: il GHSA id, il pacchetto, e perché l'eccezione è accettabile
// ADESSO — non «lo era quando l'ho scritta». Vedi il preambolo: l'elenco è
// vuoto di proposito, e una voce va aggiunta solo per un advisory che esiste,
// non è risolvibile, e ha una mitigazione che vive nel codice.
const ALLOWLIST = {};

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
