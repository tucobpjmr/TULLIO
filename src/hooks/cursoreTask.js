// src/hooks/cursoreTask.js
// Il cursore della ripresa per differenza (hooks/sincronizzaTask.js). Sta in
// un file suo perché useAppHydration lo usa a ogni lettura intera, mentre
// sincronizzaTask.js si carica con `import()` solo alla ripresa.

/**
 * Il più recente `updated_at` fra le righe lette, o `precedente` se nessuna
 * è più recente. Il cursore viene dal SERVER: l'orologio del client non conta.
 * @param {Array<{ updated_at?: string }>|null|undefined} righe
 * @param {string|null} [precedente]
 * @returns {string|null}
 */
export const cursoreDa = (righe, precedente = null) => {
  let max = precedente ? Date.parse(precedente) : -Infinity;
  for (const r of righe || []) {
    const t = Date.parse(r?.updated_at ?? "");
    if (t > max) max = t;
  }
  return Number.isFinite(max) ? new Date(max).toISOString() : precedente;
};

