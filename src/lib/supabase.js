// src/lib/supabase.js
// Client Supabase condiviso. Le variabili sono lette da Vite (.env).
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && key);

if (!isSupabaseConfigured) {
  console.error(
    '[VoyageDesk] Mancano VITE_SUPABASE_URL e/o VITE_SUPABASE_ANON_KEY. ' +
    'Creale in .env (locale) e nelle env vars di Vercel.'
  );
}

// Con env mancanti, createClient(undefined, undefined) lancia all'import:
// usiamo placeholder così il modulo carica e l'app può mostrare un messaggio.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

export default supabase;
