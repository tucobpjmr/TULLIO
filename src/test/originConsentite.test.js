// Quali host appartengono al progetto (supabase/functions/_shared/originConsentite.ts)
// — A-4 dell'audit del 22 agosto.
//
// Stesso schema di edgeFunctionAdminGate.test.js, e per la stessa ragione: il
// modulo è PURO e senza import, quindi eseguibile da Vitest che gira su Node e
// non saprebbe risolvere gli specificatori `jsr:`/`npm:` del runtime Deno. È
// ciò che rende questa regola verificabile senza deployare una Edge Function.
//
// La proprietà che questi test proteggono NON è «l'elenco contiene questi tre
// host»: è che la regola resti un ELENCO e non torni a essere un PATTERN. Il
// difetto che A-4 chiude non era un host sbagliato in lista — era
// `label.startsWith("tullio-")`, cioè una regola che descrive un insieme che
// chiunque può ampliare creando un progetto Vercel con quel nome. I casi
// "claimable" qui sotto sono scritti per fallire se qualcuno reintroducesse un
// prefisso credendo di allargare l'elenco.
import { describe, it, expect } from 'vitest';
import {
  originConsentita, redirectConsentito, ORIGIN_PROPRIE, PROD_ORIGIN,
} from '../../supabase/functions/_shared/originConsentite.ts';

const PROD = 'https://tullio-seven.vercel.app';

describe('originConsentita — l\'Origin per l\'header CORS', () => {
  it('accetta i tre host che il progetto possiede', () => {
    expect(originConsentita(PROD)).toBe(true);
    expect(originConsentita('https://tullio-tooco-s-projects.vercel.app')).toBe(true);
    expect(originConsentita('https://tullio-git-main-tooco-s-projects.vercel.app')).toBe(true);
  });

  it('normalizza il case dell\'hostname', () => {
    expect(originConsentita('https://Tullio-Seven.VERCEL.app')).toBe(true);
  });

  it('ignora path, query e porta implicita', () => {
    expect(originConsentita('https://tullio-seven.vercel.app/qualsiasi?x=1')).toBe(true);
  });

  // ── I casi che A-4 esiste per chiudere ────────────────────────────────────
  // Ognuno di questi hostname è REGISTRABILE da un terzo: basta creare un
  // progetto Vercel gratuito con quel nome. Passavano tutti con la vecchia
  // regola a prefisso.
  it.each([
    ['prefisso nudo',            'https://tullio-qualsiasi-cosa.vercel.app'],
    ['finto branch',             'https://tullio-git-main.vercel.app'],
    ['scope imitato nel nome',   'https://tullio-git-x-y-tooco-s-projects.vercel.app'],
    ['deployment effimero',      'https://tullio-pdrepf5ju-tooco-s-projects.vercel.app'],
    ['omografo del prod',        'https://tullio-seven-evil.vercel.app'],
  ])('RIFIUTA un hostname claimable da terzi: %s', (_nome, origin) => {
    expect(originConsentita(origin)).toBe(false);
  });

  it('rifiuta un dominio del tutto estraneo', () => {
    expect(originConsentita('https://esempio.example')).toBe(false);
  });

  it('rifiuta http, anche sull\'host giusto', () => {
    expect(originConsentita('http://tullio-seven.vercel.app')).toBe(false);
  });

  it('rifiuta ciò che non è una URL, senza sollevare', () => {
    for (const v of ['', 'non-una-url', null, undefined, 42, {}]) {
      expect(originConsentita(v)).toBe(false);
    }
  });

  // Un sottodominio di un host consentito NON è quell'host: `evil.` davanti
  // basta a cambiare proprietario, e su vercel.app quel nome è registrabile.
  it('rifiuta un sottodominio di un host consentito', () => {
    expect(originConsentita('https://evil.tullio-seven.vercel.app')).toBe(false);
  });
});

describe('redirectConsentito — dove può atterrare una sessione', () => {
  it('ritorna la stringa ORIGINALE, non normalizzata', () => {
    // È ciò che va passato a inviteUserByEmail, che vuole la URL completa di
    // path: normalizzarla qui cambierebbe la destinazione del link.
    const url = 'https://tullio-seven.vercel.app/benvenuto?ref=1';
    expect(redirectConsentito(url)).toBe(url);
  });

  it('ritorna undefined — non null, non "" — quando l\'host non è nostro', () => {
    // `undefined` significa «non passare redirectTo», e GoTrue ripiega sul
    // Site URL. Una stringa vuota sarebbe invece un redirect a "" .
    expect(redirectConsentito('https://tullio-canarino.vercel.app/')).toBeUndefined();
    expect(redirectConsentito('https://esempio.example/')).toBeUndefined();
    expect(redirectConsentito(undefined)).toBeUndefined();
  });

  it('rifiuta gli stessi hostname claimable di originConsentita', () => {
    for (const h of [
      'https://tullio-qualsiasi-cosa.vercel.app/',
      'https://tullio-git-x-y-tooco-s-projects.vercel.app/',
      'https://evil.tullio-seven.vercel.app/',
    ]) {
      expect(redirectConsentito(h)).toBeUndefined();
    }
  });
});

describe('le due funzioni non possono divergere in silenzio', () => {
  // Sono separate per leggibilità (due domande diverse), non per comportamento.
  // Se un domani una delle due si allargasse, questo caso lo dice.
  it('decidono sullo stesso insieme di host', () => {
    const campione = [
      PROD,
      'https://tullio-tooco-s-projects.vercel.app',
      'https://tullio-git-main-tooco-s-projects.vercel.app',
      'https://tullio-qualsiasi-cosa.vercel.app',
      'https://tullio-git-x-y-tooco-s-projects.vercel.app',
      'https://evil.tullio-seven.vercel.app',
      'https://esempio.example',
      'http://tullio-seven.vercel.app',
    ];
    for (const u of campione) {
      expect(redirectConsentito(u) !== undefined).toBe(originConsentita(u));
    }
  });
});

describe('la forma dell\'elenco', () => {
  it('PROD_ORIGIN è uno degli host consentiti', () => {
    // È il fallback dell'header CORS: se non fosse in elenco, la risposta di
    // ripiego punterebbe a un host che il progetto stesso non riconosce.
    expect(originConsentita(PROD_ORIGIN)).toBe(true);
  });

  it('è un insieme di hostname nudi, non di URL né di pattern', () => {
    for (const h of ORIGIN_PROPRIE) {
      expect(h).not.toContain('://');
      expect(h).not.toContain('*');
      expect(h).not.toContain('/');
      expect(h).toBe(h.toLowerCase());
    }
  });
});
