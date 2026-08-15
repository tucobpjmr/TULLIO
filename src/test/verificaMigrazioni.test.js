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
import {
  analizzaNomeFile, confrontaMigrazioni, trovaNonVersionate, trovaRiapplicate, ALIAS_APPLICATE,
} from '../../scripts/verifica-rpc/migrazioni.js';

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

describe('trovaNonVersionate — il verso opposto, produzione → repository', () => {
  it('non segnala una voce applicata che matcha un file locale per versione', () => {
    const locali = [{ file: '20260609174842_step_j_fix3', prefix: '20260609174842', slug: 'step_j_fix3' }];
    const applicate = [{ version: '20260609174842', name: 'step_j_fix3_tasks_set_created_by' }];
    expect(trovaNonVersionate({ locali, applicate, alias: new Map() })).toEqual([]);
  });

  it('non segnala una voce applicata che matcha un file locale per nome', () => {
    const locali = [{ file: '20260806150000_notifications_origin_client', prefix: '20260806150000', slug: 'notifications_origin_client' }];
    const applicate = [{ version: '99999999999999', name: 'notifications_origin_client' }];
    expect(trovaNonVersionate({ locali, applicate, alias: new Map() })).toEqual([]);
  });

  it('non segnala una voce coperta da un alias esplicito', () => {
    const locali = [{ file: '20260614_mention_composite_names', prefix: '20260614', slug: 'mention_composite_names' }];
    const applicate = [{ version: '20260614173005', name: 'mention_find_users_function' }];
    const alias = new Map([['mention_find_users_function', '20260614_mention_composite_names']]);
    expect(trovaNonVersionate({ locali, applicate, alias })).toEqual([]);
  });

  it('segnala una voce applicata senza corrispondenza né per versione né per nome né in alias', () => {
    const locali = [{ file: '20260806150000_altro', prefix: '20260806150000', slug: 'altro' }];
    const applicate = [{ version: '20260101000000', name: 'qualcosa_mai_committato' }];
    expect(trovaNonVersionate({ locali, applicate, alias: new Map() })).toEqual(applicate);
  });

  it('con i dati reali: ogni alias dichiarato punta a un file davvero presente nel repository', () => {
    const dir = join(process.cwd(), 'supabase', 'migrations');
    const slugFile = new Set(readdirSync(dir).filter((f) => f.endsWith('.sql')).map((f) => f.slice(0, -4)));
    for (const [applicato, fileLocale] of ALIAS_APPLICATE) {
      expect(slugFile, `alias "${applicato}" punta a ${fileLocale}, che non esiste nel repository`).toContain(fileLocale);
    }
  });
});

// M-2 dell'audit del 15 agosto: confrontaMigrazioni e trovaNonVersionate
// costruiscono entrambe un Set dei nomi applicati, quindi un nome che
// compare due volte nel ledger collassa nello stesso elemento e sparisce.
describe('trovaRiapplicate — nomi applicati più di una volta, invisibili ai due controlli sopra', () => {
  it('non segnala nulla quando ogni nome compare una sola volta', () => {
    const applicate = [
      { version: '20260806140000', name: 'get_migrazioni_applicate' },
      { version: '20260806150000', name: 'storage_allowed_mime_types' },
    ];
    expect(trovaRiapplicate(applicate)).toEqual([]);
  });

  it('segnala un nome applicato due volte, con entrambe le versioni in ordine', () => {
    // Caso reale: chat_files_delete_orfani applicata il 14 e riapplicata il
    // 15 agosto con una versione diversa.
    const applicate = [
      { version: '20260814220000', name: 'chat_files_delete_orfani' },
      { version: '20260815155307', name: 'chat_files_delete_orfani' },
    ];
    expect(trovaRiapplicate(applicate)).toEqual([
      ['chat_files_delete_orfani', ['20260814220000', '20260815155307']],
    ]);
  });

  it('non confonde due nomi diversi con lo stesso prefisso', () => {
    const applicate = [
      { version: '20260806093134', name: 'messages_solo_mittente_modifica_contenuto' },
      { version: '20260806093254', name: 'messages_blocca_modifiche_altrui_fix_sender_anchor' },
    ];
    expect(trovaRiapplicate(applicate)).toEqual([]);
  });

  it('con i dati reali del ledger di produzione: tre nomi risultano applicati due volte', () => {
    // Fotografia presa il 15 agosto durante l'audit — non un invariante che
    // debba restare vero per sempre (una futura pulizia del ledger, se mai
    // avvenisse, lo cambierebbe), ma il fatto concreto che ha motivato
    // questa funzione: senza di lei, questi tre nomi non comparivano in
    // NESSUN controllo di scarto.
    const applicate = [
      { version: '20260702084658', name: '20260702_notifications_origin_client' },
      { version: '20260702084720', name: '20260702_notifications_origin_client' },
      { version: '20260730120000', name: 'queue_stale_notif_direct_task' },
      { version: '20260730194136', name: 'queue_stale_notif_direct_task' },
      { version: '20260814220000', name: 'chat_files_delete_orfani' },
      { version: '20260815155307', name: 'chat_files_delete_orfani' },
    ];
    expect(trovaRiapplicate(applicate).map(([nome]) => nome)).toEqual([
      '20260702_notifications_origin_client',
      'queue_stale_notif_direct_task',
      'chat_files_delete_orfani',
    ]);
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
