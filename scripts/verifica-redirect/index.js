#!/usr/bin/env node
// scripts/verifica-redirect/index.js
//
// Due controlli sulla stessa allow-list di host:
//
//   1. che la CSP di vercel.json nomini (o copra con 'self') tutti gli host
//      di ORIGIN_PROPRIE — B-3 dell'audit del 26 agosto, vedi csp.js;
//   2. che i Redirect URL di Supabase Auth NON ammettano domini di terze
//      parti — C-1 dell'audit del 22 agosto 2026, il resto di questo file.
//
//   npm run verifica:redirect
//
// Il primo non serve rete e gira sempre; il secondo richiede SUPABASE_ANON_KEY
// e si limita ad avvisare, senza fallire, quando manca (vedi sotto).
//
// PERCHÉ ESISTE IL SECONDO. Fino a B-3 era l'unico controllo di questo
// repository che guarda un valore che nel repository non c'è. Tutto il resto
// della superficie di sicurezza —
// RLS, grant, RPC, migrazioni, advisor — vive in `supabase/migrations/` e ha
// già uno script che lo confronta con la produzione. La allow-list dei
// Redirect URL vive SOLO nella dashboard Supabase, e infatti è lì che stava il
// buco: `*.vercel.app/**`, cioè un jolly su un dominio dove chiunque può
// prendersi un sottodominio creando un progetto gratuito.
//
// La catena, per intero, non richiedeva alcun privilegio iniziale:
//   1. l'attaccante registra <qualcosa>.vercel.app e vi pubblica una pagina
//      che legge `location.hash`;
//   2. chiama POST /auth/v1/recover con la chiave anon (pubblica: sta nel
//      bundle e, in chiaro, in keep-supabase-warm.yml), l'email della vittima
//      e `redirect_to` verso il proprio host;
//   3. la vittima riceve un'email AUTENTICA, dal progetto vero, e clicca;
//   4. GoTrue verifica il token e redirige all'host dell'attaccante con
//      `#access_token=…&refresh_token=…` nel fragment.
// A quel punto la sessione è vera: CSP, RLS e requireActiveAdmin non vedono
// alcuna differenza, perché non c'è.
//
// COSA FA LA SONDA, E PERCHÉ È INNOCUA. Chiama GET /auth/v1/verify con un
// token deliberatamente INVALIDO. Nessuna email viene inviata (l'invio sta su
// /recover, che qui non si tocca), nessuna sessione viene emessa (il token non
// verifica), e la risposta non viene mai seguita: si legge il solo header
// `Location`, che è dove GoTrue dichiara quale `redirect_to` ha accettato.
//
// ⚠️ GoTrue NON risponde con un errore a un `redirect_to` non consentito:
// ripiega in silenzio sul Site URL. "Nessun errore" non prova quindi niente, e
// il verdetto si legge esclusivamente dall'host del Location — vedi
// valutaSonde() in redirect.js, che è anche il motivo per cui le sonde sono
// due e non una.
//
// Usa la sola chiave anon, che è pubblica per costruzione: stesso ragionamento
// di verifica-rpc.yml e keep-supabase-warm.yml, dove è già scritta in chiaro.
//
// B-3 dell'audit del 26 agosto: oltre alla sonda sui Redirect URL (sopra),
// questo script confronta anche i primi due dei tre posti in cui vive la
// stessa allow-list — ORIGIN_PROPRIE e la CSP di vercel.json — vedi csp.js.
// Non serve rete né la chiave anon: gira comunque anche quando la chiave manca.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HOST_CANARINO, HOST_PRODUZIONE, valutaSonde } from './redirect.js';
import { estraiOriginProprie, estraiCsp, hostMancantiDallaCsp } from './csp.js';

const URL_DEFAULT = 'https://vmxvnxsqfisucugcpqlc.supabase.co';
const RADICE = fileURLToPath(new URL('../..', import.meta.url));

function verificaCspAllineataAOriginProprie() {
  const sorgenteTs = readFileSync(
    join(RADICE, 'supabase', 'functions', '_shared', 'originConsentite.ts'), 'utf8',
  );
  const vercelJson = JSON.parse(readFileSync(join(RADICE, 'vercel.json'), 'utf8'));
  const originProprie = estraiOriginProprie(sorgenteTs);
  const csp = estraiCsp(vercelJson);
  const mancanti = hostMancantiDallaCsp({ originProprie, csp });

  if (mancanti.length) {
    console.log(`✗ CSP e ORIGIN_PROPRIE divergono. Host non coperti: ${mancanti.join(', ')}\n`);
    console.log('::error title=CSP disallineata da ORIGIN_PROPRIE::' +
      `Host non coperti dalla Content-Security-Policy di vercel.json: ${mancanti.join(', ')}`);
    return false;
  }
  console.log(`✓ CSP allineata a ORIGIN_PROPRIE (${originProprie.length} host).\n`);
  return true;
}

// Un token che non può verificare. Il valore non conta: conta che GoTrue
// arrivi comunque alla fase di redirect, che è quella che si sta misurando.
const TOKEN_INVALIDO = 'sonda-allowlist-token-non-valido';

/**
 * Chiede a GoTrue di verificare un token invalido con un dato `redirect_to` e
 * restituisce l'header Location della risposta, senza seguirlo.
 */
async function sonda(base, anonKey, redirectTo) {
  const url = new URL('/auth/v1/verify', base);
  url.searchParams.set('token', TOKEN_INVALIDO);
  url.searchParams.set('type', 'recovery');
  url.searchParams.set('redirect_to', redirectTo);

  const r = await fetch(url, {
    // `manual`: la risposta NON va seguita. Non vogliamo emettere una
    // richiesta verso l'host canarino, e non ce n'è bisogno — l'informazione
    // che serve è tutta nell'header.
    redirect: 'manual',
    headers: { apikey: anonKey },
  });
  return { status: r.status, location: r.headers.get('location') };
}

async function main() {
  // Non serve rete né credenziali: gira sempre, anche se SUPABASE_ANON_KEY
  // manca — è il primo dei due controlli di questo script, l'altro (sotto)
  // guarda un valore che il repository non ha.
  const cspOk = verificaCspAllineataAOriginProprie();

  const base = process.env.SUPABASE_URL || URL_DEFAULT;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!anonKey) {
    // Stessa scelta di verifica-advisor quando manca il token: un controllo
    // che non ha potuto girare non deve avere lo stesso aspetto di uno
    // passato, ma nemmeno rendere rosso un workflow per una credenziale
    // assente. L'annotazione è ciò che rende visibile la differenza
    // nell'interfaccia (A-2, audit del 12 agosto).
    console.log('⚠  SUPABASE_ANON_KEY non impostata: controllo redirect saltato.');
    console.log('::warning title=Allow-list redirect non verificata::' +
      'SUPABASE_ANON_KEY assente: la allow-list dei Redirect URL non è stata controllata.');
    process.exit(cspOk ? 0 : 1);
  }

  console.log(`verifica:redirect — allow-list dei Redirect URL su ${base}\n`);

  const [prod, canario] = await Promise.all([
    sonda(base, anonKey, `https://${HOST_PRODUZIONE}/`),
    sonda(base, anonKey, `https://${HOST_CANARINO}/`),
  ]);

  console.log(`  sonda positiva  → HTTP ${prod.status}  Location: ${prod.location ?? '—'}`);
  console.log(`  sonda canarino  → HTTP ${canario.status}  Location: ${canario.location ?? '—'}\n`);

  const { stato, messaggio } = valutaSonde({
    locationProd: prod.location,
    locationCanario: canario.location,
  });

  if (stato === 'ok') {
    console.log(`✓ verifica:redirect: ${messaggio}`);
    process.exit(cspOk ? 0 : 1);
  }

  if (stato === 'inconcludente') {
    console.log(`⚠ verifica:redirect INCONCLUSIVO: ${messaggio}`);
    console.log('::warning title=Allow-list redirect non verificabile::' + messaggio);
    // Esce 0: un controllo che non sa non deve rendere rosso il workflow, ma
    // deve dirlo forte. Rosso è riservato al caso in cui il difetto c'è —
    // qui o nella CSP, verificata sopra indipendentemente dalla rete.
    process.exit(cspOk ? 0 : 1);
  }

  console.log(`✗ verifica:redirect: ${messaggio}\n`);
  console.log('  Correzione — Supabase → Authentication → URL Configuration → Redirect URLs:');
  console.log('    https://tullio-seven.vercel.app/**');
  console.log('    https://tullio-tooco-s-projects.vercel.app/**');
  console.log('    https://tullio-git-main-tooco-s-projects.vercel.app/**');
  console.log('    http://localhost:5173/**            (solo se serve in sviluppo)');
  console.log('  e RIMUOVERE qualunque voce con un jolly su vercel.app.');
  console.log('::error title=Allow-list dei Redirect URL troppo larga::' + messaggio);
  process.exit(1);
}

main().catch((e) => {
  console.error(`Errore imprevisto durante la verifica redirect: ${e.stack || e.message}`);
  process.exit(2);
});
