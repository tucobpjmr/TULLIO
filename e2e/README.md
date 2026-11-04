# Test end-to-end (Playwright)

M-8 dell'audit del 4 novembre 2026. Fino a qui ogni test girava in jsdom: duemila
casi su come si comporta ogni pezzo, nessuno che aprisse l'app in un browser.

| File | Quando gira | Cosa verifica |
|---|---|---|
| `avvio.spec.js` | **sempre**, anche senza segreti | la build di produzione si apre sulla schermata di login senza errori; un percorso qualunque torna all'app |
| `flussi.spec.js` | solo con le credenziali dello **staging** | login; una task creata compare in un'altra scheda senza ricaricare (realtime); uscire lascia il dispositivo pulito (niente intenzione push, niente coda offline) |

`flussi.spec.js` usa gli stessi segreti di `src/test/integration/rls.test.js`
(`RLS_TEST_URL`, `RLS_TEST_ANON_KEY`, `RLS_TEST_JUNIOR_EMAIL`,
`RLS_TEST_JUNIOR_PASSWORD`). ⛔ Mai la produzione: crea una task di prova (la
cancella alla fine, anche se il test cade a metà).

## In locale

`@playwright/test` non è nelle devDependencies, di proposito: chi non esegue
gli E2E non scarica un browser.

```bash
npm install --no-save @playwright/test@1.63.0
```

```bash
npx playwright install chromium
```

```bash
npx playwright test
```

Il server lo avvia Playwright (`vite build` + `vite preview` sulla porta 4173,
vedi `playwright.config.js`). Per i flussi la build deve puntare allo staging:
esporta `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` con i valori dello staging
insieme alle variabili `RLS_TEST_*` qui sopra.

## In CI

`.github/workflows/e2e.yml`, su ogni pull request e su `main`. Senza segreti
`flussi.spec.js` risulta «skipped», non verde: la differenza si legge nel log.
