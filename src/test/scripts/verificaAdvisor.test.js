// Parte pura del controllo periodico sugli advisor Supabase (S-05).
import { describe, it, expect } from 'vitest';
import { valutaLints } from '../../../scripts/verifica-advisor/advisor.js';

describe('valutaLints', () => {
  it('non fallisce se i WARN sono fra quelli nominati come accettati', () => {
    // Questo test diceva «non fallisce se tutti i lint sono WARN o INFO», ed
    // era la codifica della policy vecchia: WARN = accettato, per categoria.
    // Da ST-14 l'accettazione passa dal NOME del lint, quindi il caso va
    // scritto con i nomi veri — altrimenti il test descriverebbe una regola
    // che non esiste più.
    const lints = [
      { level: 'WARN', name: 'authenticated_security_definer_function_executable', title: 'Signed-In Users Can Execute SECURITY DEFINER Function', metadata: { name: 'reset_completo', schema: 'public' } },
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
// rilievo `auth_leaked_password_protection` era indistinguibile dalle nove
// funzioni SECURITY DEFINER esposte di proposito. Un controllo che accetta
// tutto per categoria non è un controllo permissivo: è un controllo che non
// c'è. Il 12 agosto chi amministra il progetto ha deciso esplicitamente di
// NON attivarla: la verifica HaveIBeenPwned è una funzione del piano Supabase
// Pro, e il progetto resta sul piano Free per scelta — non un interruttore
// dimenticato, un costo ricorrente non approvato. Il lint è quindi nominato
// nell'elenco come gli altri, con il motivo scritto accanto in `advisor.js`.
describe('valutaLints — avvisi accettati per nome', () => {
  const HIBP = { level: 'WARN', name: 'auth_leaked_password_protection', title: 'Leaked Password Protection Disabled' };
  const definer = (fnName) => ({
    level: 'WARN',
    name: 'authenticated_security_definer_function_executable',
    title: 'Signed-In Users Can Execute…',
    metadata: { name: fnName, schema: 'public' },
  });
  const DEFINER = definer('reset_completo');

  it('i nove SECURITY DEFINER motivati non fanno fallire', () => {
    const r = valutaLints([DEFINER, definer('send_test_push')]);
    expect(r.fallisce).toBe(false);
    expect(r.nonAccettati).toEqual([]);
  });

  it('la protezione password compromesse è accettata (piano Free, decisione esplicita del 12 agosto)', () => {
    const r = valutaLints([DEFINER, HIBP]);
    expect(r.fallisce).toBe(false);
    expect(r.nonAccettati).toEqual([]);
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

// M-3 dell'audit del 13 agosto: il nome del lint da solo non basta per i due
// lint SECURITY DEFINER — si applicano a qualunque funzione futura, non solo
// alle otto già verificate in docs/SICUREZZA.md §1.
describe('valutaLints — M-3: il lint SECURITY DEFINER si accetta per funzione, non per nome', () => {
  const definer = (fnName) => ({
    level: 'WARN',
    name: 'anon_security_definer_function_executable',
    title: 'Anonymous Users Can Execute SECURITY DEFINER Function',
    metadata: fnName ? { name: fnName, schema: 'public' } : undefined,
  });

  it('una funzione SECURITY DEFINER già verificata non fa fallire', () => {
    const r = valutaLints([definer('get_migrazioni_applicate')]);
    expect(r.fallisce).toBe(false);
    expect(r.nonAccettati).toEqual([]);
  });

  it('una funzione SECURITY DEFINER nuova, mai verificata, con lo STESSO nome di lint fa fallire', () => {
    // Il caso che il rilievo descrive: una futura funzione esposta ad anon,
    // mai passata in rassegna, che l'elenco per-nome avrebbe accettato muta.
    const r = valutaLints([definer('sgancia_pagamento_senza_controlli')]);
    expect(r.fallisce).toBe(true);
    expect(r.nonAccettati).toHaveLength(1);
  });

  it('un lint senza metadata.name (formato inatteso) non viene accettato al buio', () => {
    const r = valutaLints([definer(undefined)]);
    expect(r.fallisce).toBe(true);
    expect(r.nonAccettati).toHaveLength(1);
  });

  it('gli altri lint accettati per nome (unused_index) restano insensibili a metadata', () => {
    const r = valutaLints([{ level: 'WARN', name: 'unused_index', title: 'Unused Index' }]);
    expect(r.fallisce).toBe(false);
  });
});
