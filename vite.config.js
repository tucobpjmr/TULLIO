import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    // A-1 (audit performance/UX del 19 agosto). Il budget di
    // `verifica:bundle` leggeva solo `dist/index.html`, cioè il first load
    // dell'utente ANONIMO. Da B-1 l'app è un chunk DINAMICO prefetchato da
    // AuthGate: non compare lì, e quindi non aveva alcuna soglia — 60,93 kB
    // gzip su 175,34, il 35% di ciò che ogni sessione scarica. Il manifest
    // porta il grafo dichiarato dal build (import statici e dinamici dell'entry)
    // con cui il controllo ricostruisce anche il first load AUTENTICATO, che in
    // un gestionale — dove la sessione persiste — è quello di quasi tutte le
    // sessioni. Non cambia nulla di ciò che il browser scarica: aggiunge un
    // `.vite/manifest.json` in dist/, letto solo dallo script.
    manifest: true,
    rollupOptions: {
      output: {
        // Step N (caveat #15): separa le dipendenze vendor in chunk dedicati.
        // Cambiano di rado → restano in cache del browser tra i deploy mentre
        // il codice app (chunk principale) si aggiorna. xlsx non è qui perché
        // ora è caricato via import() dinamico (chunk async a sé).
        //
        // `supabase: ['@supabase/supabase-js']` C'ERA ed è stato tolto — B-2
        // dell'audit del 30 agosto, terzo passo. @supabase/supabase-js importa
        // staticamente i suoi sotto-pacchetti (auth-js, postgrest-js,
        // realtime-js, storage-js, functions-js: vedi il suo dist/index.mjs).
        // Da quando lib/supabaseAuth.js importa @supabase/auth-js DIRETTAMENTE
        // per il client di sola autenticazione — un secondo punto d'ingresso
        // allo STESSO pacchetto — nominare `@supabase/supabase-js` come chunk
        // forzava Rollup a mettere anche auth-js nello stesso chunk: qualunque
        // nome esplicito dato a "il resto di supabase-js" (postgrest/realtime/
        // storage/functions) finiva comunque per reclamare auth-js insieme,
        // perché è supabase-js STESSO a importarla — provato tentando di
        // nominare solo il resto e lasciando auth-js senza nome: Rollup
        // l'attaccava comunque al chunk nominato, non all'entry.
        //
        // Senza ALCUN nome forzato per l'area supabase, l'euristica automatica
        // di Rollup fa lo split giusto da sola: auth-js — l'unica parte che
        // l'entry usa davvero — resta nell'entry (insieme a
        // lib/supabaseAuth.js, che la richiede eager per il login); il resto
        // di supabase-js finisce in un chunk automatico a sé, caricato via
        // import() solo da lib/supabase.js quando serve davvero una query. Il
        // nome del chunk non è più "supabase-*" ma un hash generico
        // (index-*.js, come gli altri chunk senza manualChunks): è il prezzo
        // di correttezza — verifica:bundle non dipende dai nomi, solo dal
        // grafo del manifest.
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
});
