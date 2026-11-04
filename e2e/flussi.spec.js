// e2e/flussi.spec.js — M-8 dell'audit del 4 novembre.
//
// I tre flussi che nessun test in jsdom attraversa per intero, contro lo
// STAGING (mai la produzione): entrare, creare una task e vederla comparire in
// un'altra scheda senza ricaricare, uscire lasciando il dispositivo pulito.
// Usa le stesse credenziali di src/test/integration/rls.test.js e, come
// quel file, senza credenziali si salta.
//
// La build va fatta puntando allo staging: il workflow e2e.yml passa
// VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY presi dagli stessi segreti.
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const URL = process.env.RLS_TEST_URL;
const ANON = process.env.RLS_TEST_ANON_KEY;
const EMAIL = process.env.RLS_TEST_JUNIOR_EMAIL;
const PASSWORD = process.env.RLS_TEST_JUNIOR_PASSWORD;

test.skip(!(URL && ANON && EMAIL && PASSWORD), 'servono le credenziali dello staging (vedi e2e/README.md)');

const TITOLO = `E2E sonda ${Date.now()}`;

async function entra(page) {
  await page.goto('/');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Accedi' }).click();
  await expect(page.getByRole('button', { name: 'Cambia utente loggato' })).toBeVisible({ timeout: 20_000 });
}

test.afterAll(async () => {
  if (!(URL && ANON && EMAIL && PASSWORD)) return;
  // Pulizia sul server, non dalla UI: deve avvenire anche se il test è caduto
  // a metà, e la sonda non deve restare nelle code di chi usa lo staging.
  const client = createClient(URL, ANON, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  await client.from('tasks').delete().eq('title', TITOLO);
});

test('una task creata compare in un\'altra scheda senza ricaricare', async ({ browser }) => {
  const contesto = await browser.newContext();
  const scheda = await contesto.newPage();
  const altra = await contesto.newPage();
  await entra(scheda);
  await entra(altra);

  // «k» apre la creazione rapida (scorciatoia documentata nell'app).
  await scheda.keyboard.press('k');
  await scheda.locator('#qat-title').fill(TITOLO);
  await scheda.getByRole('button', { name: '✓ Crea Task' }).click();
  await expect(scheda.locator('#qat-title')).toBeHidden();

  // L'altra scheda ha un origin_client diverso: l'evento realtime la raggiunge.
  await expect(altra.getByText(TITOLO).first()).toBeVisible({ timeout: 15_000 });
  await contesto.close();
});

test('uscire lascia il dispositivo pulito: niente push, niente coda offline', async ({ page }) => {
  await entra(page);
  await page.evaluate(() => localStorage.setItem('vd:push-intent', 'on'));

  await page.getByRole('button', { name: 'Cambia utente loggato' }).click();
  await page.getByText('Esci', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Accedi' })).toBeVisible({ timeout: 15_000 });

  const intento = await page.evaluate(() => localStorage.getItem('vd:push-intent'));
  expect(intento).toBeNull();
  const vociInCoda = await page.evaluate(() => new Promise((risolvi) => {
    const req = indexedDB.open('voyagedesk');
    req.onerror = () => risolvi(0);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('coda_scritture')) { db.close(); risolvi(0); return; }
      const conta = db.transaction('coda_scritture').objectStore('coda_scritture').count();
      conta.onsuccess = () => { db.close(); risolvi(conta.result); };
      conta.onerror = () => { db.close(); risolvi(0); };
    };
  }));
  expect(vociInCoda).toBe(0);
});
