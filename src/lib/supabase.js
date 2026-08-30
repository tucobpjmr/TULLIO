// src/lib/supabase.js
// Client Supabase pieno (postgrest + realtime + storage + functions) — B-2
// dell'audit del 30 agosto, secondo passo.
//
// PERCHÉ getSupabase() E NON PIÙ `export const supabase = createClient(...)`.
// Il primo passo di B-2 aveva tolto l'auth di questo file dal percorso
// anonimo (vedi lib/supabaseAuth.js), ma non era bastato: `AuthGate.jsx`
// avvia il download di VoyageDesk.jsx INCONDIZIONATAMENTE a ogni caricamento
// (B-1 dell'audit del 16 agosto — per non far attendere l'utente già
// autenticato, il caso più comune), e VoyageDesk arriva fino a `lib/api.js`,
// che fino a qui importava `{ supabase }` da QUESTO file in cima a dieci
// moduli. Un `import { createClient } from '@supabase/supabase-js'` STATICO
// qui dentro — anche se `createClient()` non viene mai chiamato da chi legge
// solo il nome — basta perché Rollup lo includa nel grafo statico
// dell'entry, e da lì nel `modulepreload` che il browser scarica per OGNI
// visitatore, autenticato o no. Misurato: lo split di lib/supabaseAuth.js da
// solo non spostava questo numero di un byte.
//
// `@supabase/supabase-js` è ora dietro un `import()` DINAMICO, innescato solo
// dalla prima chiamata reale a una funzione del data layer (che richiede
// comunque una sessione valida per avere senso — nessuna query passa le
// policy RLS senza). Chi resta sulla schermata di login non la scarica mai.
//
// COSA RESTA UGUALE PER CHI CHIAMA. `lib/api/*.js` (e lib/realtime.js,
// components/liste/listeApi.js) fanno `const supabase = await getSupabase();`
// una volta per funzione esportata, poi usano `supabase` esattamente come
// prima — sincrono per il resto del corpo. Nessun cambiamento nella FORMA
// delle query, solo in COME si ottiene il client con cui farle.
//
// Singleton memoizzato: la prima chiamata innesca `import()` + `createClient()`,
// tutte le chiamate concorrenti successive (anche prima che la prima sia
// risolta) condividono la STESSA promise — mai due client costruiti.
let clientPromise = null;

async function creaClient() {
  const { createClient } = await import('@supabase/supabase-js');

  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error(
      '[VoyageDesk] Mancano VITE_SUPABASE_URL e/o VITE_SUPABASE_ANON_KEY. ' +
      'Creale in .env (locale) e nelle env vars di Vercel.'
    );
  }

  // `persistSession: true` resta: questo client deve leggere la sessione che
  // lib/supabaseAuth.js scrive nella stessa storageKey, per autorizzare le
  // sue query postgrest/realtime/storage. `autoRefreshToken` e
  // `detectSessionInUrl` sono invece spenti apposta: senza, avremmo DUE
  // GoTrueClient che provano entrambi a rinfrescare il token in proattivo e a
  // leggere l'hash dell'URL — coordinati da gotrue via navigator.locks (vedi
  // lib/supabaseAuth.js), ma non un rischio da raddoppiare quando può restare
  // a zero. lib/supabaseAuth.js è l'UNICA istanza che fa refresh proattivo e
  // URL detection; questo client legge solo ciò che quella tiene aggiornato.
  return createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

export function getSupabase() {
  if (!clientPromise) clientPromise = creaClient();
  return clientPromise;
}
