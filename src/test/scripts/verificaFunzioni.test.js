// Parte pura del controllo «Edge Function deployate = cartelle del repository».
import { describe, it, expect } from 'vitest';
import { funzioniLocali, confrontaFunzioni } from '../../../scripts/verifica-funzioni/funzioni.js';

describe('funzioniLocali', () => {
  it('esclude il codice condiviso e le cartelle nascoste', () => {
    expect(funzioniLocali(['send-push', '_shared', '.temp', 'delete-user']))
      .toEqual(['delete-user', 'send-push']);
  });
});

describe('confrontaFunzioni', () => {
  it('passa quando i due elenchi coincidono', () => {
    const r = confrontaFunzioni({
      locali: ['delete-user', 'send-push'],
      deployate: [{ slug: 'send-push' }, { slug: 'delete-user' }],
    });
    expect(r).toEqual({ nonVersionate: [], nonDeployate: [], fallisce: false });
  });

  it('fallisce su una funzione in produzione senza cartella (il caso di plan-day)', () => {
    const r = confrontaFunzioni({
      locali: ['send-push'],
      deployate: [{ slug: 'send-push' }, { slug: 'plan-day' }, { slug: 'qa-realtime-typing-check' }],
    });
    expect(r.fallisce).toBe(true);
    expect(r.nonVersionate).toEqual(['plan-day', 'qa-realtime-typing-check']);
    expect(r.nonDeployate).toEqual([]);
  });

  it('fallisce su una cartella mai deployata', () => {
    const r = confrontaFunzioni({ locali: ['send-push', 'nuova'], deployate: [{ slug: 'send-push' }] });
    expect(r.fallisce).toBe(true);
    expect(r.nonDeployate).toEqual(['nuova']);
  });
});
