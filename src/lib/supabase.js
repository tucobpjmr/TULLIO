// src/lib/supabase.js
// Client Supabase condiviso. Le variabili sono lette da Vite (.env).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '[VoyageDesk] Mancano VITE_SUPABASE_URL e/o VITE_SUPABASE_ANON_KEY. ' +
    'Creale in .env (locale) e nelle env vars di Vercel.'
  );
}

export const supabase = createClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export default supabase;
