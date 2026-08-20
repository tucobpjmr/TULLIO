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
        manualChunks: {
          react: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
});
