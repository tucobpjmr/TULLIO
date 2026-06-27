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
