// src/state/istante.js
// L'istante e il seme di un'azione: ciò che il reducer userebbe da
// `Date.now()` e `Math.random()`, fissato UNA volta da chi fa il dispatch.
//
// B-2 dell'analisi del 14 novembre. `applica` (hooks/useSyncedDispatch.js)
// esegue il reducer due volte per azione: una per React, una per far avanzare
// il proprio ref. Con orario e id generati dentro il reducer, le due copie
// dello stato avevano `completedAt`, `deletedAt`, id dei toast e voci del log
// diversi fra loro, fino al render successivo. Lo stesso valeva per il doppio
// giro di StrictMode in sviluppo. Con `meta.ora` e `meta.seme` sull'azione il
// reducer torna puro: stessa azione, stesso stato.
//
// Senza meta (demo, test, dispatch grezzi) si ripiega sull'orologio: il
// comportamento è quello di prima.

/**
 * L'azione con `meta.ora` (ms) e `meta.seme`. Sovrascrive valori già
 * presenti: un oggetto azione rimandato due volte è un secondo dispatch, e i
 * suoi toast devono avere id nuovi.
 * @template {{ meta?: Record<string, any> }} A
 * @param {A} azione
 * @returns {A}
 */
export function conIstante(azione) {
  return {
    ...azione,
    meta: { ...azione.meta, ora: Date.now(), seme: Math.random().toString(36).slice(2, 7) },
  };
}

/** L'istante dell'azione in ISO, o adesso se non ne ha uno. */
export const adessoISO = (azione) => new Date(azione?.meta?.ora ?? Date.now()).toISOString();

/** Il seme dell'azione, o uno nuovo se non ne ha uno. */
export const semeDi = (azione) => azione?.meta?.seme ?? Math.random().toString(36).slice(2, 7);
