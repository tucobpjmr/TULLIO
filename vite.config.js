import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.js"],
    // ─── B-3 (audit del 10 settembre) · LA COPERTURA, MISURATA ────────────
    //
    // Duemila test e nessun numero: «tanti test» è una quantità, non una
    // misura, e non dice mai quale parte del prodotto nessuno esercita. È lo
    // stesso argomento che jsconfig.json usa contro se stesso e che A-3 del
    // 22 agosto ha usato per portare `verifica:tipi` in CI — un controllo che
    // nessuno esegue passa perché non ha trovato niente da verificare.
    //
    // Le soglie sono un RATCHET, come i numeri di verifica:convenzioni e di
    // verifica:bundle: partono dal valore MISURATO oggi, arrotondato per
    // difetto, e servono a impedire che scenda — non a promettere un numero
    // tondo. Alzarle è un atto deliberato, con la misura accanto.
    coverage: {
      provider: "v8",
      // `text-summary` è ciò che si legge nel log della CI; `json-summary`
      // lascia il numero su disco per chi volesse confrontarlo fra due run.
      reporter: ["text-summary", "json-summary"],
      reportsDirectory: "./coverage",
      // Tutto `src/`, anche i file che nessun test importa: sono proprio
      // quelli che la misura deve far vedere. Senza `include` esplicito la
      // copertura descriverebbe solo ciò che è già coperto.
      include: ["src/**/*.{js,jsx}"],
      exclude: [
        // I test stessi e i loro helper: misurare quanto sono coperti i test
        // è un numero che non risponde a nessuna domanda.
        "src/test/**",
        "src/**/*.test.{js,jsx}",
        // Il punto d'ingresso: monta l'app su un DOM reale e registra il
        // service worker. Non è non-testato, è non-testabile in jsdom.
        "src/main.jsx",
        // Il worker xlsx gira in un Worker vero (VIETATO_XLSX_FUORI_DAL_WORKER
        // in eslint.config.js esiste per tenercelo): il suo contratto è
        // verificato dai test del chiamante, non da dentro.
        "src/lib/xlsxWorker.js",
      ],
      // MISURATO il 10 settembre su 2.248 test, DUE volte a pochi minuti di
      // distanza e sullo stesso albero:
      //
      //     righe        74,02%  →  73,99%
      //     istruzioni   70,71%  →  70,68%
      //     funzioni     62,72%  →  62,66%
      //     rami         60,40%  →  60,32%
      //
      // ⚠️ Le due colonne sono la ragione per cui le soglie stanno un punto
      // SOTTO la misura invece che al valore arrotondato per difetto. Una
      // percentuale non è un conteggio deterministico come i ratchet di
      // `verifica:convenzioni`: un test che dipende da un timer o dall'ordine
      // dei worker esercita un ramo in più o in meno fra due esecuzioni. Una
      // soglia a 74 sarebbe passata alla prima esecuzione e fallita alla
      // seconda, senza che nessuno avesse toccato una riga — e un gate che
      // lampeggia smette di essere un gate nel giro di due settimane.
      //
      // Un punto è ~93 righe: molto meno di qualunque regressione vera — una
      // suite cancellata, una funzionalità nuova senza test — e molto più
      // dello 0,08 di rumore misurato qui sopra.
      //
      // La misura è stata presa in un ambiente in cui gli 8 test di `xlsx`
      // NON girano (`cdn.sheetjs.com` è irraggiungibile dalla rete di
      // sviluppo, A-1 del 5 settembre): in CI, dove girano, la copertura è
      // quindi un filo PIÙ ALTA di così. Il margine è dalla parte giusta.
      thresholds: {
        lines: 73,
        statements: 69,
        functions: 61,
        branches: 59,
      },
    },
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
