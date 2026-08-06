// Controllo di scarto tra i file di migrazione e quelli applicati (S-05).
//
// Il caso che ha motivato questo controllo diretto (oltre a quello indiretto
// via RPC in verificaRpc.test.js): 20260804230000_set_updated_at_search_path
// e 20260806090000_liste_realtime erano nel repository ma non erano mai
// state applicate — nessuna delle due introduce una RPC nuova, quindi
// verifica-rpc non se ne sarebbe mai accorto.
import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { analizzaNomeFile, confrontaMigrazioni } from '../../scripts/verifica-rpc/migrazioni.js';

describe('analizzaNomeFile', () => {
  it('separa il prefisso dallo slug al primo underscore', () => {
    expect(analizzaNomeFile('20260806140000_get_migrazioni_applicate')).toEqual({
      file: '20260806140000_get_migrazioni_applicate',
      prefix: '20260806140000',
      slug: 'get_migrazioni_applicate',
    });
  });

  it('funziona anche con un prefisso non a 14 cifre (le due eccezioni storiche)', () => {
    expect(analizzaNomeFile('20260610_step_j_fix')).toEqual({
      file: '20260610_step_j_fix',
      prefix: '20260610',
      slug: 'step_j_fix',
    });
  });

  it('ritorna null per un nome senza underscore', () => {
    expect(analizzaNomeFile('senzaunderscore')).toBeNull();
  });
});

describe('confrontaMigrazioni', () => {
  it('trova corrispondenza per versione anche quando il nome applicato differisce', () => {
    // Caso reale: 20260610192442_origin_tagging applicata come
    // "20260611_origin_tagging" (stessa versione, nome diverso).
    const locali = [{ file: '20260610192442_origin_tagging', prefix: '20260610192442', slug: 'origin_tagging' }];
    const applicate = [{ version: '20260610192442', name: '20260611_origin_tagging' }];
    expect(confrontaMigrazioni({ locali, applicate, eccezioni: new Set() }).mancanti).toEqual([]);
  });

  it('trova corrispondenza per nome anche quando la versione applicata differisce', () => {
    // Caso reale: le migrazioni applicate via apply_migration MCP ricevono una
    // versione generata al momento dell'applicazione, non il timestamp scelto
    // per il nome del file.
    const locali = [{ file: '20260806120000_users_seniority', prefix: '20260806120000', slug: 'users_seniority' }];
    const applicate = [{ version: '20260806075829', name: 'users_seniority' }];
    expect(confrontaMigrazioni({ locali, applicate, eccezioni: new Set() }).mancanti).toEqual([]);
  });

  it('segnala una migrazione locale senza corrispondenza né in versione né in nome', () => {
    const locali = [{ file: '20260806150000_nuova_tabella', prefix: '20260806150000', slug: 'nuova_tabella' }];
    const applicate = [{ version: '20260806140000', name: 'get_migrazioni_applicate' }];
    const { mancanti } = confrontaMigrazioni({ locali, applicate, eccezioni: new Set() });
    expect(mancanti).toEqual([locali[0]]);
  });

  it('non segnala un file elencato tra le eccezioni', () => {
    const locali = [{ file: '20260610_step_j_fix', prefix: '20260610', slug: 'step_j_fix' }];
    const applicate = []; // per davvero non tracciato in supabase_migrations
    const { mancanti } = confrontaMigrazioni({ locali, applicate, eccezioni: new Set(['20260610_step_j_fix']) });
    expect(mancanti).toEqual([]);
  });

  it('non nasconde uno scarto vero dietro un\'eccezione per un altro file', () => {
    const locali = [
      { file: '20260610_step_j_fix', prefix: '20260610', slug: 'step_j_fix' },
      { file: '20260806150000_scarto_vero', prefix: '20260806150000', slug: 'scarto_vero' },
    ];
    const applicate = [];
    const { mancanti } = confrontaMigrazioni({ locali, applicate, eccezioni: new Set(['20260610_step_j_fix']) });
    expect(mancanti).toEqual([locali[1]]);
  });

  it('riporta il conteggio delle migrazioni applicate', () => {
    const applicate = [{ version: 'a', name: 'x' }, { version: 'b', name: 'y' }];
    expect(confrontaMigrazioni({ locali: [], applicate, eccezioni: new Set() }).applicate).toBe(2);
  });
});

describe('analizzaNomeFile sui file reali del repository', () => {
  // Non una lista campione: se un domani un file venisse aggiunto senza
  // underscore nel nome (o con un'altra convenzione), il controllo lo
  // scarterebbe silenziosamente invece di confrontarlo — proprio lo scarto
  // che questo controllo esiste per trovare.
  it('sa leggere prefisso e slug di ogni migrazione presente nel repository', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const file = readdirSync(dir).filter((f) => f.endsWith('.sql'));
    expect(file.length).toBeGreaterThan(0);
    for (const f of file) {
      const analisi = analizzaNomeFile(f.slice(0, -4));
      expect(analisi, `${f} non è nella forma <prefisso>_<slug>`).not.toBeNull();
    }
  });
});
