// scripts/verifica-convenzioni/peso.js
//
// M-4 dell'analisi del 6 novembre: quanto costa leggere il progetto. I
// commenti erano il 35% delle righe di `src/` e `docs/CLAUDE.md` pesava 159 KB,
// letti prima di ogni modifica. Due tetti, dichiarati in CLAUDE.md, che si
// abbassano quando la misura scende. File a sé come colori.js: convenzioni.js
// è al tetto di max-lines.
import { LetturaFallita } from './convenzioni.js';

/**
 * Righe di solo commento: `//`, `/* … *\/`, `{/* … *\/}` e le righe interne di
 * un blocco. Una riga di codice con un commento in coda conta come codice.
 * @param {{ path: string, testo: string }[]} sorgenti
 */
export function quotaCommenti(sorgenti) {
  let righe = 0;
  let commenti = 0;
  for (const { testo } of sorgenti) {
    let dentroBlocco = false;
    for (const riga of testo.split('\n')) {
      righe += 1;
      const t = riga.trim();
      if (dentroBlocco) {
        commenti += 1;
        if (t.includes('*/')) dentroBlocco = false;
        continue;
      }
      if (t.startsWith('//')) { commenti += 1; continue; }
      if (t.startsWith('/*') || t.startsWith('{/*')) {
        commenti += 1;
        if (!t.includes('*/')) dentroBlocco = true;
      }
    }
  }
  return { righe, commenti, percento: righe ? (commenti / righe) * 100 : 0 };
}

const leggi = (testo, re, frase) => {
  const m = re.exec(testo);
  if (!m) {
    throw new LetturaFallita(`docs/CLAUDE.md: non trovo la frase «${frase}». ` +
      'Se è stata riscritta, aggiorna il pattern in scripts/verifica-convenzioni/peso.js.');
  }
  return Number(m[1]);
};

/** Il tetto della quota di commenti, in punti percentuali. */
export const leggiTettoCommenti = (testo) =>
  leggi(testo, /i commenti sono al più il (\d+)% delle righe/, 'i commenti sono al più il N% delle righe');

/** Il tetto di docs/CLAUDE.md, in KB (1 KB = 1024 byte). */
export const leggiTettoClaudeMd = (testo) =>
  leggi(testo, /questo file resta sotto i (\d+) KB/, 'questo file resta sotto i N KB');
