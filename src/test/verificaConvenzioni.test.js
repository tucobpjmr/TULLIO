// ST-13 · La parte pura della verifica delle convenzioni.
//
// PERCHÉ QUESTI TEST ESISTONO, e quali sono quelli che contano. Uno script che
// confronta un documento con una misura ha un modo di fallire peggiore di
// quello ovvio: non trovare il pattern nel documento e passare lo stesso. Da
// quel momento la CI è verde perché non sta controllando niente, ed è
// esattamente la forma del problema che questo script esiste per chiudere. I
// test sui casi "pattern assente" sono quindi i più importanti del file.
import { describe, it, expect } from 'vitest';
import {
  LetturaFallita, leggiConteggioMultiComp, leggiStatoAudit, leggiStatoIndex,
  leggiStiliInline, montaggiLazySenzaRete, confronta,
} from '../../scripts/verifica-convenzioni/convenzioni.js';

describe('leggiConteggioMultiComp', () => {
  it('legge casi e file dalla frase di CLAUDE.md', () => {
    const testo = '…`react/no-multi-comp` è un **warning**, con 20 casi aperti in 13 file (Sidebar…';
    expect(leggiConteggioMultiComp(testo)).toEqual({ casi: 20, file: 13 });
  });

  it('SOLLEVA se la frase non c\'è più, invece di passare a vuoto', () => {
    expect(() => leggiConteggioMultiComp('un documento riscritto senza quel numero'))
      .toThrow(LetturaFallita);
  });
});

describe('leggiStiliInline', () => {
  it('legge il numero dalla frase di CLAUDE.md', () => {
    const testo = '…1.153 occorrenze sollevate, restano **334 style inline dinamici**, ognuno…';
    expect(leggiStiliInline(testo)).toBe(334);
  });

  it('SOLLEVA se la frase non c\'è più, invece di passare a vuoto', () => {
    expect(() => leggiStiliInline('gli stili inline sono ormai pochi'))
      .toThrow(LetturaFallita);
  });
});

describe('leggiStatoAudit', () => {
  const tabella = [
    '| # | Priorità | Area |',
    '| — | **CRITICI** | — |',
    '| ST-1 | ~~Alta~~ ✔ **risolto** | Render |',
    '| ST-2 | ~~Alta~~ ✔ **risolto** (parte 1 di 2) | Architettura |',
    '| ST-3 | Media | Scalabilità |',
  ].join('\n');

  it('conta i rilievi e quelli chiusi dalla tabella delle priorità', () => {
    expect(leggiStatoAudit(tabella, 'ST')).toEqual({ totale: 3, chiusi: 2 });
  });

  it('ignora le righe che non sono rilievi (l\'intestazione, la riga CRITICI)', () => {
    expect(leggiStatoAudit(tabella, 'ST').totale).toBe(3);
  });

  it('non confonde i prefissi di due audit diversi', () => {
    const misto = tabella + '\n| P2-1 | ~~Alta~~ ✔ **risolto** | Bundle |';
    expect(leggiStatoAudit(misto, 'ST').totale).toBe(3);
    expect(leggiStatoAudit(misto, 'P2')).toEqual({ totale: 1, chiusi: 1 });
  });

  it('conta più prefissi insieme, come nell\'audit con C/A/M/B', () => {
    const misto = [
      '| **C-1** ✔ | letture non paginate | `lib/api.js` | Critica |',
      '| **A-1** ✔ | workflow rosso | `scripts/` | Alta |',
      '| **M-1** ⚙ | stili inline | trasversale | Media |',
    ].join('\n');
    expect(leggiStatoAudit(misto, ['C', 'A', 'M', 'B'])).toEqual({ totale: 3, chiusi: 2 });
  });

  it('conta per identificativo: lo stesso rilievo in due tabelle è UNO', () => {
    // AUDIT_STRUTTURA nomina i suoi rilievi due volte — nella tabella delle
    // priorità e in quella delle correzioni. Contando le righe, quindici
    // rilievi diventavano ventinove.
    const due = [
      '| ST-1 | ~~Alta~~ ✔ **risolto** | Render | … |',
      '| ST-2 | Media | Architettura | … |',
      '| **ST-1** | come è stato corretto |',
      '| **ST-2** | come è stato corretto |',
    ].join('\n');
    expect(leggiStatoAudit(due, 'ST')).toEqual({ totale: 2, chiusi: 1 });
  });

  it('SOLLEVA se il documento non ha una tabella dei rilievi', () => {
    expect(() => leggiStatoAudit('# Un audit senza tabella', 'ST')).toThrow(LetturaFallita);
  });
});

describe('leggiStatoIndex', () => {
  const riga = '| [`AUDIT_X.md`](AUDIT_X.md) | perimetro | ST-14 — gli altri sono chiusi. ⟦stato: 14/15 chiusi⟧ |';

  it('legge il marcatore machine-readable sulla riga del documento', () => {
    expect(leggiStatoIndex(riga, 'AUDIT_X.md')).toEqual({ chiusi: 14, totale: 15 });
  });

  it('SOLLEVA se il marcatore manca del tutto', () => {
    expect(() => leggiStatoIndex('| [`AUDIT_X.md`](AUDIT_X.md) | perimetro | prosa |', 'AUDIT_X.md'))
      .toThrow(LetturaFallita);
  });

  it('SOLLEVA se il marcatore c\'è ma non è nella forma attesa', () => {
    expect(() => leggiStatoIndex('| AUDIT_X.md | ⟦stato: quasi tutti chiusi⟧ |', 'AUDIT_X.md'))
      .toThrow(LetturaFallita);
  });

  it('non prende il marcatore della riga di un ALTRO audit', () => {
    const due = [
      '| [`AUDIT_A.md`](AUDIT_A.md) | … | ⟦stato: 3/3 chiusi⟧ |',
      '| [`AUDIT_B.md`](AUDIT_B.md) | … | ⟦stato: 1/9 chiusi⟧ |',
    ].join('\n');
    expect(leggiStatoIndex(due, 'AUDIT_B.md')).toEqual({ chiusi: 1, totale: 9 });
  });
});

describe('confronta', () => {
  it('non riporta nulla quando dichiarato e misurato coincidono', () => {
    expect(confronta([{ nome: 'x', dove: 'd', dichiarato: 3, misurato: 3, rimedio: 'r' }])).toEqual([]);
  });

  it('lo scarto dice ENTRAMBI i numeri e cosa fare', () => {
    // Il messaggio è il prodotto di questo script: chi lo legge deve poter
    // decidere se ha sbagliato il documento o il codice, senza aprirli.
    const [msg] = confronta([{
      nome: 'no-multi-comp (file)', dove: 'docs/CLAUDE.md',
      dichiarato: 10, misurato: 13, rimedio: 'Aggiorna la frase.',
    }]);
    expect(msg).toContain('dice 10');
    expect(msg).toContain('misurato 13');
    expect(msg).toContain('Aggiorna la frase.');
  });
});

describe('montaggiLazySenzaRete', () => {
  const IMPORT_LAZY = 'import { useState, lazy } from "react";';

  it('segnala il file che monta un lazy senza nominare alcuna rete di sicurezza', () => {
    const sorgenti = [
      { path: 'src/components/shell/Topbar.jsx', testo: `${IMPORT_LAZY}\n<Suspense fallback={<LazyFallback />}>` },
    ];
    expect(montaggiLazySenzaRete(sorgenti)).toEqual(['src/components/shell/Topbar.jsx']);
  });

  it('accetta il file che monta con LazyPanel', () => {
    const sorgenti = [
      { path: 'src/components/shell/Topbar.jsx', testo: `${IMPORT_LAZY}\n<LazyPanel resetKey="notifiche">` },
    ];
    expect(montaggiLazySenzaRete(sorgenti)).toEqual([]);
  });

  it('accetta anche i due boundary usati direttamente (la vista, gli overlay)', () => {
    const conVista = { path: 'a.jsx', testo: `${IMPORT_LAZY}\n<ViewErrorBoundary viewKey={v}>` };
    const conOverlay = { path: 'b.jsx', testo: `${IMPORT_LAZY}\n<OverlayErrorBoundary resetKey="x">` };
    expect(montaggiLazySenzaRete([conVista, conOverlay])).toEqual([]);
  });

  it('ignora i file che NOMINANO lazy in un commento senza importarlo', () => {
    // Il primo giro di questo controllo segnalava ui/LazyFallback.jsx, che
    // dice «mentre un chunk lazy (AdminView, …) viene scaricato» ed è il file
    // del fallback: non monta niente. È la ragione per cui il segnale è
    // l'import e non la chiamata.
    const sorgenti = [
      { path: 'src/components/ui/LazyFallback.jsx', testo: '// spinner per un chunk lazy (AdminView) in arrivo\nexport const LazyFallback = () => null;' },
      { path: 'src/components/shell/Topbar.jsx', testo: `${IMPORT_LAZY}\n<LazyPanel />` },
    ];
    expect(montaggiLazySenzaRete(sorgenti)).toEqual([]);
  });

  it('SOLLEVA se nessun file importa lazy, invece di passare a vuoto', () => {
    // Il modo peggiore di fallire: verde perché non ha controllato niente.
    expect(() => montaggiLazySenzaRete([{ path: 'a.js', testo: 'export const x = 1;' }]))
      .toThrow(LetturaFallita);
  });
});
