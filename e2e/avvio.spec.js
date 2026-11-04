// e2e/avvio.spec.js — M-8 dell'audit del 4 novembre.
// Gira SEMPRE, anche senza segreti: la build di produzione deve aprirsi e
// arrivare alla schermata di login senza errori. È il difetto che nessun test
// in jsdom vede — un chunk che non si carica, una CSP che blocca uno script,
// un import che esiste solo nel dev server.
import { test, expect } from '@playwright/test';

test('la build si apre sulla schermata di login, senza errori', async ({ page }) => {
  const errori = [];
  page.on('pageerror', (e) => errori.push(e.message));

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'VoyageDesk' })).toBeVisible();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
  expect(errori).toEqual([]);
});

test('un percorso qualunque torna all\'app (rewrite della SPA)', async ({ page }) => {
  // vercel.json riscrive ogni percorso su `/`, e in preview lo fa vite: un
  // link incollato male non deve dare una pagina bianca.
  await page.goto('/un/percorso/che/non/esiste');
  await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible();
});
