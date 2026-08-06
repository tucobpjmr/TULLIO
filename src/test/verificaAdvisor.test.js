// Parte pura del controllo periodico sugli advisor Supabase (S-05).
import { describe, it, expect } from 'vitest';
import { valutaLints } from '../../scripts/verifica-advisor/advisor.js';

describe('valutaLints', () => {
  it('non fallisce se tutti i lint sono WARN o INFO', () => {
    const lints = [
      { level: 'WARN', title: 'Signed-In Users Can Execute SECURITY DEFINER Function' },
      { level: 'INFO', title: 'Unused Index' },
    ];
    const r = valutaLints(lints);
    expect(r.fallisce).toBe(false);
    expect(r.errori).toEqual([]);
    expect(r.avvisi).toHaveLength(1);
  });

  it('fallisce se emerge almeno un lint ERROR', () => {
    const lints = [
      { level: 'WARN', title: 'irrilevante' },
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
