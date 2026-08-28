// Controllo della allow-list dei Redirect URL di Supabase Auth
// (scripts/verifica-redirect) — rilievo C-1 dell'audit del 22 agosto 2026.
//
// Si testa la sola parte pura, `valutaSonde`, che è dove sta il ragionamento:
// index.js non fa altro che due fetch e la stampa. Niente rete, come per
// verificaRpc.test.js — questi test girano in CI, che il progetto Supabase non
// lo raggiunge.
//
// La proprietà che questi test esistono per proteggere non è "il canarino
// viene rifiutato": è che il controllo NON possa diventare verde per il motivo
// sbagliato. GoTrue risponde a un `redirect_to` non consentito ripiegando in
// silenzio sul Site URL — nessun errore, nessuno status diverso — quindi ogni
// esito che non sia esattamente "Location sul Site URL" deve risultare
// inconcludente, mai passato.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  valutaSonde, hostDi, HOST_CANARINO, HOST_PRODUZIONE,
} from '../../../scripts/verifica-redirect/redirect.js';
import { estraiOriginProprie, estraiCsp, hostMancantiDallaCsp } from '../../../scripts/verifica-redirect/csp.js';

const locProd = `https://${HOST_PRODUZIONE}/#error=invalid_token`;

describe('hostDi', () => {
  it('estrae l\'hostname e lo normalizza a minuscolo', () => {
    expect(hostDi('https://Tullio-Seven.VERCEL.app/x#y')).toBe('tullio-seven.vercel.app');
  });

  it('ritorna null su una stringa che non è una URL', () => {
    expect(hostDi('non-una-url')).toBeNull();
    expect(hostDi(null)).toBeNull();
    expect(hostDi(undefined)).toBeNull();
  });
});

describe('valutaSonde — il verdetto sulla allow-list', () => {
  it('passa quando il canarino viene rifiutato e GoTrue ripiega sul Site URL', () => {
    const { stato } = valutaSonde({
      locationProd: locProd,
      locationCanario: `https://${HOST_PRODUZIONE}/#error=invalid_token`,
    });
    expect(stato).toBe('ok');
  });

  it('FALLISCE quando GoTrue accetta di redirigere verso il canarino', () => {
    const { stato, messaggio } = valutaSonde({
      locationProd: locProd,
      locationCanario: `https://${HOST_CANARINO}/#error=invalid_token`,
    });
    expect(stato).toBe('allowlist-larga');
    expect(messaggio).toContain(HOST_CANARINO);
  });

  // ── Il controllo di controllo ───────────────────────────────────────────
  // Questi tre casi sono la ragione per cui le sonde sono due. Senza la sonda
  // positiva ciascuno di essi renderebbe il controllo VERDE, perché in nessuno
  // il canarino risulta accettato — e "il canarino non è stato accettato"
  // significa "la allow-list è stretta" solo se sappiamo che la sonda funziona
  // ancora.

  it('è inconcludente se la sonda positiva non torna sull\'host di produzione', () => {
    const { stato, messaggio } = valutaSonde({
      locationProd: 'https://qualcos-altro.example/',
      locationCanario: `https://${HOST_PRODUZIONE}/`,
    });
    expect(stato).toBe('inconcludente');
    expect(messaggio).toContain('NON è affidabile');
  });

  it('è inconcludente se GoTrue smette di rispondere con un Location', () => {
    const { stato } = valutaSonde({ locationProd: null, locationCanario: null });
    expect(stato).toBe('inconcludente');
  });

  it('è inconcludente se il canarino finisce su un host terzo e inatteso', () => {
    const { stato, messaggio } = valutaSonde({
      locationProd: locProd,
      locationCanario: 'https://host-mai-visto.example/',
    });
    expect(stato).toBe('inconcludente');
    expect(messaggio).toContain('host inatteso');
  });
});

describe('il canarino copre anche A-4', () => {
  // Il prefisso non è un dettaglio: `_shared/cors.ts` e `safeRedirect` in
  // invite-user consideravano fidato QUALUNQUE `tullio-*.vercel.app`, che è un
  // insieme che chiunque può ampliare creando un progetto Vercel con quel
  // nome. A-4 è chiuso (la regola è ora l'elenco esatto di
  // `_shared/originConsentite.ts`, con i propri test), ma il canarino tiene il
  // prefisso: è ciò che rende questa sonda una prova anche del fatto che il
  // lato SERVER — la allow-list di Auth — non accetti quella famiglia di host.
  // Se un giorno qualcuno "semplificasse" il canarino togliendoglielo, la
  // sonda smetterebbe di dimostrarlo, e nessuno se ne accorgerebbe perché
  // continuerebbe a passare.
  it('l\'host canarino inizia per "tullio-" e sta su vercel.app', () => {
    expect(HOST_CANARINO.startsWith('tullio-')).toBe(true);
    expect(HOST_CANARINO.endsWith('.vercel.app')).toBe(true);
  });

  it('l\'host canarino non è l\'host di produzione', () => {
    expect(HOST_CANARINO).not.toBe(HOST_PRODUZIONE);
  });
});

// B-3 dell'audit del 26 agosto: la CSP di vercel.json e ORIGIN_PROPRIE devono
// nominare gli stessi host. estraiOriginProprie/estraiCsp leggono i due file
// come testo (vedi csp.js sul perché), e questo blocco li verifica sia contro
// i file reali del repository — la proprietà che conta davvero — sia con
// input sintetici, per provare che il controllo solleva o segnala quando i
// due divergono invece di passare in silenzio.
describe('csp.js — ORIGIN_PROPRIE e la CSP devono dire la stessa cosa', () => {
  const RADICE = join(process.cwd());

  it('estrae gli host reali di ORIGIN_PROPRIE dal sorgente TypeScript', () => {
    const sorgente = readFileSync(
      join(RADICE, 'supabase', 'functions', '_shared', 'originConsentite.ts'), 'utf8',
    );
    const host = estraiOriginProprie(sorgente);
    expect(host).toEqual([
      'tullio-seven.vercel.app',
      'tullio-tooco-s-projects.vercel.app',
      'tullio-git-main-tooco-s-projects.vercel.app',
    ]);
  });

  it('solleva se il letterale ORIGIN_PROPRIE non c\'è più nel sorgente', () => {
    expect(() => estraiOriginProprie('export const ALTRO = 1;')).toThrow(/non trovo più/);
  });

  it('estrae la CSP reale da vercel.json', () => {
    const vercelJson = JSON.parse(readFileSync(join(RADICE, 'vercel.json'), 'utf8'));
    const csp = estraiCsp(vercelJson);
    expect(csp).toContain("connect-src 'self'");
  });

  it('solleva se vercel.json non ha alcun header Content-Security-Policy', () => {
    expect(() => estraiCsp({ headers: [{ source: '/(.*)', headers: [] }] })).toThrow(/nessun header/);
  });

  it('non segnala nulla quando ogni host di ORIGIN_PROPRIE è coperto da \'self\'', () => {
    const mancanti = hostMancantiDallaCsp({
      originProprie: ['tullio-seven.vercel.app'],
      csp: "default-src 'self'; connect-src 'self' https://esempio.supabase.co",
    });
    expect(mancanti).toEqual([]);
  });

  it('non segnala un host nominato esplicitamente, anche senza \'self\'', () => {
    const mancanti = hostMancantiDallaCsp({
      originProprie: ['esempio.supabase.co'],
      csp: 'connect-src https://esempio.supabase.co',
    });
    expect(mancanti).toEqual([]);
  });

  it('segnala un host che la CSP non nomina e che \'self\' non può coprire', () => {
    const mancanti = hostMancantiDallaCsp({
      originProprie: ['tullio-seven.vercel.app', 'host-dimenticato.vercel.app'],
      csp: 'connect-src https://tullio-seven.vercel.app',
    });
    expect(mancanti).toEqual(['host-dimenticato.vercel.app']);
  });

  it('con i file reali del repository: nessun host di ORIGIN_PROPRIE resta scoperto', () => {
    const sorgente = readFileSync(
      join(RADICE, 'supabase', 'functions', '_shared', 'originConsentite.ts'), 'utf8',
    );
    const vercelJson = JSON.parse(readFileSync(join(RADICE, 'vercel.json'), 'utf8'));
    const mancanti = hostMancantiDallaCsp({
      originProprie: estraiOriginProprie(sorgente),
      csp: estraiCsp(vercelJson),
    });
    expect(mancanti).toEqual([]);
  });
});
