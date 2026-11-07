// M-4 dell'analisi del 6 novembre — i due tetti sul costo di lettura.
// Come verificaConvenzioni.test.js: i casi che contano sono quelli in cui la
// frase manca, perché lì lo script passerebbe a vuoto.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { LetturaFallita } from '../../../scripts/verifica-convenzioni/convenzioni.js';
import {
  quotaCommenti, leggiTettoCommenti, leggiTettoClaudeMd,
} from '../../../scripts/verifica-convenzioni/peso.js';

describe('quotaCommenti', () => {
  it('conta le righe di solo commento: //, blocchi, JSX', () => {
    const testo = [
      '// uno',
      'const a = 1; // in coda: è codice',
      '/* due',
      '   tre */',
      '<div>',
      '  {/* quattro */}',
      '</div>',
    ].join('\n');
    expect(quotaCommenti([{ path: 'x.jsx', testo }])).toMatchObject({ righe: 7, commenti: 4 });
  });

  it('un /* dentro un commento // non apre un blocco', () => {
    const testo = '// vedi src/components/**\nconst a = 1;\nconst b = 2;';
    expect(quotaCommenti([{ path: 'x.js', testo }]).commenti).toBe(1);
  });
});

describe('leggiTettoCommenti / leggiTettoClaudeMd', () => {
  it('leggono i due numeri dalle frasi di CLAUDE.md', () => {
    const testo = 'in `src/` i commenti sono al più il 32% delle righe, e questo file resta sotto i 40 KB.';
    expect(leggiTettoCommenti(testo)).toBe(32);
    expect(leggiTettoClaudeMd(testo)).toBe(40);
  });

  it('SOLLEVANO se la frase non c\'è più', () => {
    expect(() => leggiTettoCommenti('niente')).toThrow(LetturaFallita);
    expect(() => leggiTettoClaudeMd('niente')).toThrow(LetturaFallita);
  });

  it('il CLAUDE.md vero porta entrambe le frasi', () => {
    const vero = readFileSync('docs/CLAUDE.md', 'utf8');
    expect(leggiTettoCommenti(vero)).toBeGreaterThan(0);
    expect(leggiTettoClaudeMd(vero)).toBeGreaterThan(0);
  });
});
