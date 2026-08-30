// src/lib/api/avvisi.js
// Bacheca avvisi.
//
// Parte del data layer, che fino ad A-4 era un file solo da 1001 righe con
// tredici namespace dentro. La PORTA resta `src/lib/api.js`: questo modulo non
// si importa direttamente da fuori — lo impedisce VIETATI_MODULI_API_INTERNI in
// eslint.config.js, perché il confine che protegge le entità dello stato
// (VIETATE_ENTITA_DELLO_STATE) è dichiarato su quel percorso e un import
// diretto qui lo aggirerebbe senza che nulla lo segnali.

import { getSupabase } from '../supabase';
import { fetchAllRows, WITH_COUNT } from '../pagination.js';
import { withOrigin } from '../realtime.js';
import { CONTA_RIGHE } from './comuni.js';

// ----------------- NOTICES (bacheca) -----------------
export const Notices = {
  // B-3 dell'audit del 16 agosto: era una `select` nuda. La bacheca non ha
  // potatura — un avviso resta finché qualcuno non lo cancella — quindi è una
  // delle due letture non paginate su una tabella che CRESCE, e il cap di
  // PostgREST (1000 righe, HTTP 200 senza errore) è esattamente il difetto che
  // non fallisce da solo: gli avvisi oltre la soglia semplicemente non
  // esistono più per la bacheca.
  //
  // `.order('id')` come terza chiave: né `pinned` né `created_at` sono unici
  // (due avvisi fissati nello stesso secondo bastano), e senza una chiave di
  // spareggio due pagine consecutive possono ripetere o saltare una riga —
  // stessa ragione del `.order('name').order('id')` di Clients.list.
  list: async () => {
    const supabase = await getSupabase();
    return fetchAllRows(() => supabase.from('notices').select('*, users(name, color)', WITH_COUNT)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .order('id'));
  },
  create: async (n) => {
    const supabase = await getSupabase();
    return supabase.from('notices').insert(withOrigin(n)).select().single();
  },
  update: async (id, patch) => {
    const supabase = await getSupabase();
    return supabase.from('notices').update(withOrigin(patch)).eq('id', id).select().single();
  },
  togglePin: async (id, pinned) => {
    const supabase = await getSupabase();
    return supabase.from('notices').update(withOrigin({ pinned }), CONTA_RIGHE).eq('id', id);
  },
  remove: async (id) => {
    const supabase = await getSupabase();
    return supabase.from('notices').delete(CONTA_RIGHE).eq('id', id);
  },
};
