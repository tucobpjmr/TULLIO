#!/usr/bin/env node
// scripts/verifica-bundle/index.js
//
// Budget del bundle di produzione: fallisce se il chunk d'ingresso o il
// "first load" (tutto ciò che dist/index.html scarica o precarica prima di
// qualunque interazione) superano una soglia.
//
// Nasce da un guasto ripetuto tre volte, non uno: P2-1/2/3 in
// docs/AUDIT_PERFORMANCE_2026-08.md erano lo stesso difetto — un import
// statico che scavalca un lazy() già deciso altrove (ClienteListePanel via
// ClienteDetailPanel, ArchivedListe via Archive.jsx, mockData.js importato
// fuori dal guard DEV) — misurato a mano decodificando le sourcemap perché
// niente lo segnalava. Un import così passa la review: è codice ragionevole,
// il costo è nel grafo dei chunk, non nella riga. eslint.config.js chiude
// quei tre casi per nome (no-restricted-imports). Questo controllo chiude la
// categoria: qualunque nuovo import che rimetta un chunk lazy nel first load
// fa fallire la build, chiunque sia il modulo.
//
// La fonte di verità è dist/index.html, non le sourcemap: è lì che Vite
// scrive, con <script type="module"> e <link rel="modulepreload">, l'esatto
// insieme di chunk che il browser scarica prima del primo render — la stessa
// analisi del grafo di import (statico vs dinamico) che governa cosa finisce
// in un chunk lazy. Leggerla è quindi precisa quanto la build stessa, non
// un'approssimazione.
//
//   npm run build && npm run verifica:bundle
//
// Uscita: 0 sotto soglia, 1 sopra (o se dist/ manca — build prima).
import { readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RADICE = fileURLToPath(new URL('../..', import.meta.url));
const DIST = join(RADICE, 'dist');
const INDEX_HTML = join(DIST, 'index.html');
// A-1 · Il grafo dei chunk dichiarato dal build (`build.manifest: true`).
const MANIFEST = join(DIST, '.vite', 'manifest.json');

// Soglie in kB gzip (decimale, bytes/1000: la stessa unità che `vite build`
// stampa in console, per poter confrontare a colpo d'occhio). Misurate dopo
// P2-1/2/3: chunk d'ingresso 77.95 kB, first load completo (ingresso + react
// + supabase) 177.90 kB. Margine +6 kB su entrambe: assorbe la normale
// crescita del codice (qualche funzione, una nuova entry), non un chunk lazy
// intero rientrato in eager — il più piccolo dei tre chiusi da P2-1/2/3
// (ClienteListePanel, 1.48 kB da solo) sposta comunque diversi kB una volta
// portato con sé listePersistence.js. Verificato riaprendo a mano
// ClienteDetailPanel.jsx: 77.95→84.60 kB, sopra soglia. Se le tocchi per
// farle passare, prima capisci quale chunk si è spostato.
//
// ─── RIMISURATE DOPO B-1 (audit performance/UX del 16 agosto, secondo
// passaggio) ──────────────────────────────────────────────────────────────
// `auth/AuthGate.jsx` importava VoyageDesk staticamente: l'app intera stava
// nel chunk d'ingresso anche per chi era fermo al login. Con `lazy()` +
// prefetch l'ingresso è sceso da 72.46 a 14.47 kB e il first load da 172.40 a
// 114.41 kB. Le soglie SCENDONO con la misura, altrimenti restano 70 kB di
// margine che non intercettano più niente — una soglia con quel gioco è la
// forma in cui un controllo smette di controllare senza diventare rosso. Il
// margine resta quello dichiarato sopra, +6 kB: un import statico di
// VoyageDesk rimesso per distrazione riporterebbe l'ingresso a ~72 kB, cioè
// molto oltre.
const SOGLIA_INGRESSO_KB = 21;
const SOGLIA_FIRST_LOAD_KB = 121;

// ─── A-1 · IL PERCORSO CHE L'APP PERCORRE DAVVERO ──────────────────────────
// (audit performance/UX del 19 agosto)
//
// Le due soglie qui sopra misurano `dist/index.html`, che è il first load di
// chi arriva al LOGIN. Era tutto finché l'app stava in quel grafo; da B-1
// `auth/AuthGate.jsx` la carica con `lazy()` + prefetch avviato subito, quindi
// il chunk `VoyageDesk-*.js` — reducer, registry di persistenza, data layer,
// idratazione, guscio, Dashboard, ClientiView — NON compare in index.html e
// non aveva alcuna soglia: 60,93 kB gzip su 175,34, il 35% del payload che
// ogni sessione scarica.
//
// ⚠️ E in un gestionale la sessione persiste: l'utente tipico non vede mai il
// login. Il budget stava presidiando il percorso raro e lasciando scoperto
// quello di tutti i giorni.
//
// Verificato, non dedotto: riaprendo a mano ST-12 (`ChatPanel` da `lazy()` a
// import statico in VoyageDeskInner.jsx) il chunk dell'app passa da 60,93 a
// 75,40 kB gzip — 14,47 kB rientrati nel percorso caldo — e questo script,
// prima di queste due soglie, stampava `OK`. Non diventava rosso: continuava a
// passare, che è la forma in cui un controllo smette di controllare.
//
// Misurate sul build del 19 agosto (60,93 e 175,34), stesso margine +6 kB
// delle altre due: assorbe la crescita normale del codice, non un chunk lazy
// intero rientrato in eager — il più piccolo dei nove punti di montaggio ne
// sposta comunque di più.
const SOGLIA_APP_KB = 67;
const SOGLIA_AUTENTICATO_KB = 182;

const kb = (bytes) => bytes / 1000;

// A-1 · Il grafo dichiarato dal build, non dedotto dai nomi dei file.
//
// `imports` sono i chunk che l'entry tira dentro STATICAMENTE (react,
// supabase); `dynamicImports` quelli che un `import()` differisce — per
// l'entry, l'app che AuthGate prefetcha alla valutazione del modulo. Un solo
// livello di profondità è voluto: è ciò che il prefetch avvia davvero, non la
// chiusura transitiva dei nove `lazy()` interni all'app (che è esattamente il
// costo che quei lazy esistono per NON far pagare).
function primoCaricamento(manifest) {
  const entry = Object.values(manifest).find((e) => e.isEntry);
  if (!entry) {
    console.error('verifica:bundle: nessuna entry nel manifest — build cambiata?');
    process.exit(1);
  }
  const anonimo = new Set([entry.file]);
  for (const k of entry.imports || []) anonimo.add(manifest[k].file);
  const app = new Set();
  for (const k of entry.dynamicImports || []) {
    app.add(manifest[k].file);
    // Ciò che il chunk dell'app tira dentro staticamente e che non è già nel
    // first load anonimo: si conta una volta sola.
    for (const i of manifest[k].imports || []) {
      const f = manifest[i].file;
      if (f && !anonimo.has(f)) app.add(f);
    }
  }
  return { anonimo: [...anonimo], app: [...app] };
}

function estraiEager(html) {
  const scriptSrc = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map(m => m[1]);
  const preload = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g)].map(m => m[1]);
  return { scriptSrc, preload };
}

function gzipDi(href) {
  const percorso = join(DIST, href.replace(/^\//, ''));
  return gzipSync(readFileSync(percorso)).length;
}

function main() {
  if (!existsSync(INDEX_HTML)) {
    console.error(`verifica:bundle: ${INDEX_HTML} non esiste — esegui "npm run build" prima.`);
    process.exit(1);
  }
  const html = readFileSync(INDEX_HTML, 'utf8');
  const { scriptSrc, preload } = estraiEager(html);
  if (scriptSrc.length === 0) {
    console.error('verifica:bundle: nessuno <script type="module"> trovato in dist/index.html — build cambiata?');
    process.exit(1);
  }

  const ingressoBytes = scriptSrc.reduce((tot, href) => tot + gzipDi(href), 0);
  const preloadBytes = preload.reduce((tot, href) => tot + gzipDi(href), 0);
  const totaleBytes = ingressoBytes + preloadBytes;

  console.log('verifica:bundle — first load (script + modulepreload di dist/index.html):');
  for (const href of scriptSrc) {
    console.log(`  ${href.replace(/^\/assets\//, '')}: ${kb(gzipDi(href)).toFixed(2)} kB gzip (ingresso)`);
  }
  for (const href of preload) {
    console.log(`  ${href.replace(/^\/assets\//, '')}: ${kb(gzipDi(href)).toFixed(2)} kB gzip (modulepreload)`);
  }
  console.log(`  chunk d'ingresso: ${kb(ingressoBytes).toFixed(2)} kB gzip (soglia ${SOGLIA_INGRESSO_KB} kB)`);
  console.log(`  totale first load: ${kb(totaleBytes).toFixed(2)} kB gzip (soglia ${SOGLIA_FIRST_LOAD_KB} kB)`);

  // A-1 · Il second load di chi è già dentro, cioè il first load di quasi
  // tutte le sessioni.
  if (!existsSync(MANIFEST)) {
    console.error(
      `\nverifica:bundle: ${MANIFEST} non esiste. Serve \`build.manifest: true\` ` +
      'in vite.config.js: senza, il chunk dell\'app resta senza soglia (A-1).');
    process.exit(1);
  }
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const { app } = primoCaricamento(manifest);
  const appBytes = app.reduce((tot, f) => tot + gzipDi(f), 0);
  const autenticatoBytes = totaleBytes + appBytes;

  console.log('\nverifica:bundle — first load AUTENTICATO (quello di ogni sessione:');
  console.log('la sessione persiste, quindi il login lo si vede una volta):');
  for (const f of app) {
    console.log(`  ${f.replace(/^assets\//, '')}: ${kb(gzipDi(f)).toFixed(2)} kB gzip (import dinamico dell'entry)`);
  }
  console.log(`  chunk dell'app: ${kb(appBytes).toFixed(2)} kB gzip (soglia ${SOGLIA_APP_KB} kB)`);
  console.log(`  totale autenticato: ${kb(autenticatoBytes).toFixed(2)} kB gzip (soglia ${SOGLIA_AUTENTICATO_KB} kB)`);

  let fallito = false;
  if (kb(ingressoBytes) > SOGLIA_INGRESSO_KB) {
    console.error(`\nverifica:bundle: chunk d'ingresso ${kb(ingressoBytes).toFixed(2)} kB > soglia ${SOGLIA_INGRESSO_KB} kB.`);
    fallito = true;
  }
  if (kb(totaleBytes) > SOGLIA_FIRST_LOAD_KB) {
    console.error(`\nverifica:bundle: first load ${kb(totaleBytes).toFixed(2)} kB > soglia ${SOGLIA_FIRST_LOAD_KB} kB.`);
    fallito = true;
  }
  if (kb(appBytes) > SOGLIA_APP_KB) {
    console.error(`\nverifica:bundle: chunk dell'app ${kb(appBytes).toFixed(2)} kB > soglia ${SOGLIA_APP_KB} kB.`);
    fallito = true;
  }
  if (kb(autenticatoBytes) > SOGLIA_AUTENTICATO_KB) {
    console.error(`\nverifica:bundle: first load autenticato ${kb(autenticatoBytes).toFixed(2)} kB > soglia ${SOGLIA_AUTENTICATO_KB} kB.`);
    fallito = true;
  }
  if (fallito) {
    console.error(
      '\nUn chunk è rientrato nel first load: probabile import statico che ' +
      'attraversa un confine lazy() (vedi no-restricted-imports in eslint.config.js), ' +
      'o un modulo nuovo importato eager per errore. Confronta dist/index.html col ' +
      "build precedente per capire quale <script>/modulepreload è nuovo o cresciuto."
    );
    process.exit(1);
  }
  console.log('\nverifica:bundle: OK.');
}

main();
