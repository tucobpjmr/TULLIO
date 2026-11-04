// playwright.config.js
// M-8 dell'audit del 4 novembre · test end-to-end nel browser vero.
//
// Fino a qui ogni verifica girava in jsdom: duemila test che dicono come si
// comporta ogni pezzo, e nessuno che apra l'app in un browser e ci entri.
// Le specifiche sono due famiglie (vedi e2e/README.md):
//   - `avvio.spec.js` gira SEMPRE, senza segreti: la build di produzione si
//     apre, arriva alla schermata di login e non solleva errori;
//   - `flussi.spec.js` gira solo con le credenziali dello staging (le stesse
//     di src/test/integration/rls.test.js) e altrimenti si salta, come quel file.
//
// Il server è `vite preview` sulla build: si prova ciò che va in produzione,
// non il dev server. `@playwright/test` non è nelle devDependencies di
// proposito — si installa con `--no-save` nel workflow e in locale (vedi
// e2e/README.md), così chi non esegue gli E2E non scarica un browser.
import { defineConfig, devices } from '@playwright/test';

const PORTA = 4173;

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORTA}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npx vite build && npx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
