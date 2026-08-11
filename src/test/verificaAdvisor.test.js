// Parte pura del controllo periodico sugli advisor Supabase (S-05).
import { describe, it, expect } from 'vitest';
import { valutaLints } from '../../scripts/verifica-advisor/advisor.js';

describe('valutaLints', () => {
  it('non fallisce se i WARN sono fra quelli nominati come accettati', () => {
    // Questo test diceva «non fallisce se tutti i lint sono WARN o INFO», ed
    // era la codifica della policy vecchia: WARN = accettato, per categoria.
    // Da ST-14 l'accettazione passa dal NOME del lint, quindi il caso va
    // scritto con i nomi veri — altrimenti il test descriverebbe una regola
    // che non esiste più.
    const lints = [
      { level: 'WARN', name: 'authenticated_security_definer_function_executable', title: 'Signed-In Users Can Execute SECURITY DEFINER Function' },
      { level: 'INFO', name: 'unused_index', title: 'Unused Index' },
    ];
    const r = valutaLints(lints);
    expect(r.fallisce).toBe(false);
    expect(r.errori).toEqual([]);
    expect(r.avvisi).toHaveLength(1);
  });

  it('fallisce se emerge almeno un lint ERROR', () => {
    const lints = [
      { level: 'WARN', name: 'unused_index', title: 'irrilevante' },
      { level: 'ERROR', title: 'RLS Disabled in Public' },
    ];
    const r = valutaLints(lints);
    expect(r.fallisce).toBe(true);
    expect(r.errori).toHaveLength(1);
    expect(r.errori[0].title).toBe('RLS Disabled in Public');
  });

  it('nessun lint significa nessun fallimento', () => {
    expect(valutaLints([]).fallisce).toBe(false);
  });
});

// ST-14 · Gli avvisi accettati sono un ELENCO, non una categoria.
//
// PERCHÉ QUESTI TEST ESISTONO. Finché "WARN" significava "accettato", il
// rilievo `auth_leaked_password_protection` — che nessuno ha mai deciso di
// accettare, e che è aperto da agosto — era indistinguibile dalle nove funzioni
// SECURITY DEFINER esposte di proposito. Un controllo che accetta tutto per
// categoria non è un controllo permissivo: è un controllo che non c'è.
describe('valutaLints — avvisi accettati per nome', () => {
  const HIBP = { level: 'WARN', name: 'auth_leaked_password_protection', title: 'Leaked Password Protection Disabled' };
  const DEFINER = { level: 'WARN', name: 'authenticated_security_definer_function_executable', title: 'Signed-In Users Can Execute…' };

  it('i nove SECURITY DEFINER motivati non fanno fallire', () => {
    const r = valutaLints([DEFINER, DEFINER]);
    expect(r.fallisce).toBe(false);
    expect(r.nonAccettati).toEqual([]);
  });

  it('la protezione password compromesse fa fallire: nessuno l\'ha accettata', () => {
    const r = valutaLints([DEFINER, HIBP]);
    expect(r.fallisce).toBe(true);
    expect(r.nonAccettati).toHaveLength(1);
    expect(r.nonAccettati[0].name).toBe('auth_leaked_password_protection');
  });

  it('un avviso NUOVO, mai visto prima, fa fallire', () => {
    // È il caso che conta più di tutti: un WARN su una tabella aggiunta domani
    // oggi si perderebbe in mezzo ai nove noti.
    const r = valutaLints([{ level: 'WARN', name: 'rls_disabled_in_public_ma_solo_warn', title: 'Qualcosa di nuovo' }]);
    expect(r.fallisce).toBe(true);
  });

  it('un ERROR continua a far fallire, e resta negli errori', () => {
    const r = valutaLints([{ level: 'ERROR', name: 'rls_disabled_in_public', title: 'RLS Disabled in Public' }]);
    expect(r.fallisce).toBe(true);
    expect(r.errori).toHaveLength(1);
  });
});
