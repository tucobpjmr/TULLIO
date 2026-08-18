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

const kb = (bytes) => bytes / 1000;

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

  let fallito = false;
  if (kb(ingressoBytes) > SOGLIA_INGRESSO_KB) {
    console.error(`\nverifica:bundle: chunk d'ingresso ${kb(ingressoBytes).toFixed(2)} kB > soglia ${SOGLIA_INGRESSO_KB} kB.`);
    fallito = true;
  }
  if (kb(totaleBytes) > SOGLIA_FIRST_LOAD_KB) {
    console.error(`\nverifica:bundle: first load ${kb(totaleBytes).toFixed(2)} kB > soglia ${SOGLIA_FIRST_LOAD_KB} kB.`);
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
