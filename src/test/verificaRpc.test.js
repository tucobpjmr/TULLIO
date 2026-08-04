// Controllo di scarto tra repository e database (scripts/verifica-rpc).
//
// Il caso che ha motivato il controllo: modifica_note_lista era chiamata dal
// frontend ma la sua migrazione non era mai stata applicata, e l'app rispondeva
// "Could not find the function ... in the schema cache" (PGRST202).
//
// Qui si testano le due parti pure — la lettura delle chiamate dal sorgente e
// la classificazione delle risposte — più l'orchestrazione con una fetch finta.
// Niente rete: i test devono girare in CI, che non ha accesso al database.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { estraiChiamateRpc, raggruppaPerNome } from '../../scripts/verifica-rpc/estrai.js';
import {
  classifica, sondaFunzione, verifica, NOME_CONTROLLO,
  PRESENTE, MANCANTE, INDETERMINATO,
} from '../../scripts/verifica-rpc/sonda.js';

describe('estraiChiamateRpc — lettura delle chiamate dal sorgente', () => {
  it('legge nome e argomenti di una chiamata su una riga', () => {
    const src = `supabase.rpc('modifica_note_lista', { p_id: id, p_note: note || null })`;
    expect(estraiChiamateRpc(src)).toEqual([
      { nome: 'modifica_note_lista', argomenti: ['p_id', 'p_note'], argomentiCompleti: true },
    ]);
  });

  it('legge una chiamata distribuita su più righe', () => {
    const src = `
      supabase.rpc('registra_movimento_lista', {
        p_lista_id: listaId,
        p_data: data,
        p_importo: importo,
      }),`;
    expect(estraiChiamateRpc(src)[0]).toEqual({
      nome: 'registra_movimento_lista',
      argomenti: ['p_lista_id', 'p_data', 'p_importo'],
      argomentiCompleti: true,
    });
  });

  it('accetta i nomi senza prefisso p_ e le proprietà abbreviate', () => {
    // Le RPC della chat non usano il prefisso p_, e `emoji` è abbreviato.
    const src = `supabase.rpc('messages_toggle_reaction', { msg_id: id, emoji, origin: getClientId() })`;
    expect(estraiChiamateRpc(src)[0].argomenti).toEqual(['msg_id', 'emoji', 'origin']);
  });

  it('gestisce le chiamate senza argomenti', () => {
    const src = `getVapid: () => supabase.rpc('get_vapid_public_key'),`;
    expect(estraiChiamateRpc(src)[0]).toEqual({
      nome: 'get_vapid_public_key', argomenti: [], argomentiCompleti: true,
    });
  });

  it('non conta gli argomenti annidati come parametri della funzione', () => {
    // p_movimenti è un array di oggetti: descrizione/importo sono dati, non
    // parametri della RPC. Contarli produrrebbe una firma inesistente e quindi
    // un falso "funzione mancante".
    const src = `supabase.rpc('registra_movimenti_lista', {
      p_lista_id: id,
      p_movimenti: [{ descrizione: 'x', importo: 1 }],
      p_metodo: metodo,
    })`;
    expect(estraiChiamateRpc(src)[0].argomenti).toEqual(['p_lista_id', 'p_movimenti', 'p_metodo']);
  });

  it('ignora .rpc( dentro i commenti', () => {
    const src = `
      // vecchia versione: supabase.rpc('funzione_rimossa', { p_id: id })
      /* anche qui: supabase.rpc('altra_rimossa') */
      supabase.rpc('crea_lista', { p_client_id: c });`;
    expect(estraiChiamateRpc(src).map((c) => c.nome)).toEqual(['crea_lista']);
  });

  it('ignora .rpc( dentro le stringhe', () => {
    const src = `
      const msg = "chiama supabase.rpc('inventata') per farlo";
      supabase.rpc('archivia_lista', { p_id: id });`;
    expect(estraiChiamateRpc(src).map((c) => c.nome)).toEqual(['archivia_lista']);
  });

  it('non si perde dopo un letterale regex contenente apici o slash', () => {
    // Una regex scambiata per stringa disallineerebbe tutto il resto del file.
    const src = `
      const re = /['"\\/]+/g;
      supabase.rpc('ripristina_lista', { p_id: id });`;
    expect(estraiChiamateRpc(src).map((c) => c.nome)).toEqual(['ripristina_lista']);
  });

  it('segnala come incompleti gli argomenti non leggibili staticamente', () => {
    const src = `supabase.rpc('crea_lista', { ...argomenti })`;
    expect(estraiChiamateRpc(src)[0].argomentiCompleti).toBe(false);
  });

  it('segnala come incompleti gli argomenti passati per variabile', () => {
    const src = `supabase.rpc('crea_lista', argomenti)`;
    expect(estraiChiamateRpc(src)[0]).toMatchObject({ argomentiCompleti: false, argomenti: [] });
  });

  it('scarta i nomi non letterali invece di inventarli', () => {
    const src = `supabase.rpc(nomeVariabile, { p_id: id })`;
    expect(estraiChiamateRpc(src)).toEqual([]);
  });
});

describe('raggruppaPerNome', () => {
  it('tiene tutte le firme distinte con cui una funzione è chiamata', () => {
    const chiamate = [
      { nome: 'modifica_lista', argomenti: ['p_id', 'p_titolo'], argomentiCompleti: true },
      { nome: 'modifica_lista', argomenti: ['p_id'], argomentiCompleti: true },
      { nome: 'modifica_lista', argomenti: ['p_titolo', 'p_id'], argomentiCompleti: true },
    ];
    const [voce] = raggruppaPerNome(chiamate);
    // La terza è la prima con le chiavi in ordine diverso: stessa firma.
    expect(voce.firme).toHaveLength(2);
  });
});

describe('classifica — lettura della risposta di PostgREST', () => {
  it('PGRST202 significa funzione assente', () => {
    // L'errore esatto mostrato dall'app su modifica_note_lista.
    expect(classifica({
      stato: 404,
      corpo: { code: 'PGRST202', message: 'Could not find the function public.modifica_note_lista(p_id, p_note) in the schema cache' },
    })).toBe(MANCANTE);
  });

  it('42501 significa funzione presente ma non eseguibile da anon', () => {
    expect(classifica({ stato: 403, corpo: { code: '42501', message: 'permission denied for function' } })).toBe(PRESENTE);
  });

  it('405 significa funzione VOLATILE presente, rifiutata in GET', () => {
    expect(classifica({ stato: 405, corpo: null })).toBe(PRESENTE);
  });

  it('una risposta riuscita significa funzione presente', () => {
    expect(classifica({ stato: 200, corpo: 'BKd...' })).toBe(PRESENTE);
  });

  it('un errore con codice Postgres significa comunque funzione presente', () => {
    expect(classifica({ stato: 400, corpo: { code: 'P0001', message: 'Lista non trovata.' } })).toBe(PRESENTE);
  });

  it('una risposta non riconosciuta resta indeterminata', () => {
    expect(classifica({ stato: 502, corpo: null })).toBe(INDETERMINATO);
    expect(classifica({ stato: 401, corpo: { message: 'Invalid API key' } })).toBe(INDETERMINATO);
  });
});

// Fetch finta: mappa nome funzione → risposta.
function finta(risposte, { rest = { ok: true, status: 200 } } = {}) {
  const chiamate = [];
  const impl = async (url) => {
    const u = new URL(url);
    const m = /\/rest\/v1\/rpc\/([^/?]+)/.exec(u.pathname);
    if (!m) return { ok: rest.ok, status: rest.status, json: async () => ({}) };
    const nome = m[1];
    chiamate.push({ nome, argomenti: [...u.searchParams.keys()] });
    const r = risposte[nome] ?? { stato: 404, corpo: { code: 'PGRST202' } };
    return { ok: r.stato < 400, status: r.stato, json: async () => r.corpo };
  };
  impl.chiamate = chiamate;
  return impl;
}

const PERMESSO_NEGATO = { stato: 403, corpo: { code: '42501' } };
const NON_TROVATA = { stato: 404, corpo: { code: 'PGRST202' } };

describe('sondaFunzione', () => {
  it('interroga usando i nomi degli argomenti letti dal sorgente', async () => {
    const f = finta({ modifica_note_lista: PERMESSO_NEGATO });
    const voce = { nome: 'modifica_note_lista', firme: [{ argomenti: ['p_id', 'p_note'], completo: true }] };
    const r = await sondaFunzione(f, 'https://x.supabase.co', 'k', voce);
    expect(r.esito).toBe(PRESENTE);
    expect(f.chiamate[0].argomenti).toEqual(['p_id', 'p_note']);
  });

  it('riprova senza argomenti quando la firma letta è incompleta', async () => {
    // Con argomenti risulta assente, senza risulta presente: la funzione c'è,
    // era la firma dedotta a essere sbagliata. Non deve diventare un allarme.
    const impl = async (url) => {
      const u = new URL(url);
      const conArgomenti = [...u.searchParams.keys()].length > 0;
      const r = conArgomenti ? NON_TROVATA : PERMESSO_NEGATO;
      return { ok: false, status: r.stato, json: async () => r.corpo };
    };
    const voce = { nome: 'crea_lista', firme: [{ argomenti: ['sbagliato'], completo: false }] };
    const r = await sondaFunzione(impl, 'https://x.supabase.co', 'k', voce);
    expect(r.esito).toBe(PRESENTE);
  });

  it('non ripiega su una sonda senza argomenti quando la firma è completa', async () => {
    // Il caso crea_lista: sul database ha tre parametri e tre DEFAULT, quindi
    // una GET senza parametri la risolve sempre. Se la sonda ci ripiegasse,
    // un rename degli argomenti — che per l'app è lo stesso PGRST202 di una
    // funzione sparita — passerebbe inosservato.
    const impl = async (url) => {
      const conArgomenti = [...new URL(url).searchParams.keys()].length > 0;
      const r = conArgomenti ? NON_TROVATA : PERMESSO_NEGATO;
      return { ok: false, status: r.stato, json: async () => r.corpo };
    };
    const voce = { nome: 'crea_lista', firme: [{ argomenti: ['p_client_id', 'p_titolo'], completo: true }] };
    const r = await sondaFunzione(impl, 'https://x.supabase.co', 'k', voce);
    expect(r.esito).toBe(MANCANTE);
    expect(r.risposte.map((x) => x.argomenti)).toEqual([['p_client_id', 'p_titolo']]);
  });

  it('dichiara mancante solo se nessun tentativo la trova', async () => {
    const f = finta({});
    const voce = { nome: 'sparita', firme: [{ argomenti: ['p_id'], completo: true }] };
    const r = await sondaFunzione(f, 'https://x.supabase.co', 'k', voce);
    expect(r.esito).toBe(MANCANTE);
  });
});

describe('verifica — verdetto complessivo', () => {
  const funzioni = [
    { nome: 'crea_lista', firme: [{ argomenti: ['p_client_id'], completo: true }] },
    { nome: 'archivia_lista', firme: [{ argomenti: ['p_id'], completo: true }] },
    { nome: 'modifica_note_lista', firme: [{ argomenti: ['p_id', 'p_note'], completo: true }] },
  ];

  it('riconosce lo scarto reale: una sola RPC mancante fra tante presenti', async () => {
    // Esattamente lo stato del database prima della correzione.
    const f = finta({ crea_lista: PERMESSO_NEGATO, archivia_lista: PERMESSO_NEGATO });
    const r = await verifica({ fetchImpl: f, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(r.verdetto).toBe('drift');
    expect(r.mancanti).toEqual(['modifica_note_lista']);
  });

  it('dà ok quando tutte risolvono', async () => {
    const f = finta({
      crea_lista: PERMESSO_NEGATO, archivia_lista: PERMESSO_NEGATO, modifica_note_lista: PERMESSO_NEGATO,
    });
    const r = await verifica({ fetchImpl: f, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(r.verdetto).toBe('ok');
    expect(r.mancanti).toEqual([]);
  });

  it('nomina le RPC che non ha saputo classificare invece di darle per buone', async () => {
    // 502 su una sola funzione: le altre due risolvono, quindi il verdetto
    // resta 'ok' e il controllo non fallisce — ma quella funzione non è stata
    // verificata, e chi legge l'esito deve saperlo.
    const f = finta({
      crea_lista: PERMESSO_NEGATO,
      archivia_lista: PERMESSO_NEGATO,
      modifica_note_lista: { stato: 502, corpo: null },
    });
    const r = await verifica({ fetchImpl: f, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(r.verdetto).toBe('ok');
    expect(r.mancanti).toEqual([]);
    expect(r.indeterminati).toEqual(['modifica_note_lista']);
  });

  it('sonda una funzione inesistente prima di dare un verdetto', async () => {
    const f = finta({ crea_lista: PERMESSO_NEGATO, archivia_lista: PERMESSO_NEGATO, modifica_note_lista: PERMESSO_NEGATO });
    await verifica({ fetchImpl: f, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(f.chiamate[0].nome).toBe(NOME_CONTROLLO);
  });

  it('si dichiara inconcludente se una funzione inesistente non risulta mancante', async () => {
    // PostgREST che cambia comportamento: ogni /rpc/ risponde 405, anche i
    // nomi inventati. Senza questo controllo la sonda direbbe "tutto a posto".
    // L'API di base risponde bene: è il discriminante ad essersi rotto, non la
    // connettività.
    const impl = async (url) => (
      new URL(url).pathname.includes('/rpc/')
        ? { ok: false, status: 405, json: async () => null }
        : { ok: true, status: 200, json: async () => ({}) }
    );
    const r = await verifica({ fetchImpl: impl, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(r.verdetto).toBe(INDETERMINATO);
    expect(r.motivo).toMatch(/non risponde come atteso/);
  });

  it('non interroga la radice /rest/v1/, che il gateway nega ad anon', async () => {
    // Il guasto vero: la sonda apriva con una GET sulla radice (l'OpenAPI di
    // PostgREST), su questo progetto negata ad anon con 401. Si dichiarava
    // inconcludente a ogni esecuzione e usciva 0 — workflow verde, nessuna
    // verifica. Qui la radice risponde 401 come in produzione: la sonda non
    // deve nemmeno chiamarla, e deve arrivare a un verdetto vero.
    const percorsi = [];
    const impl = async (url) => {
      const u = new URL(url);
      percorsi.push(u.pathname);
      if (!u.pathname.includes('/rpc/')) {
        return { ok: false, status: 401, json: async () => ({ message: 'Invalid API key' }) };
      }
      const nome = /\/rpc\/([^/?]+)/.exec(u.pathname)[1];
      const r = nome === NOME_CONTROLLO ? NON_TROVATA : PERMESSO_NEGATO;
      return { ok: false, status: r.stato, json: async () => r.corpo };
    };
    const r = await verifica({ fetchImpl: impl, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(percorsi.every((p) => p.includes('/rpc/'))).toBe(true);
    expect(r.verdetto).toBe('ok');
    expect(r.indeterminati).toEqual([]);
  });

  it('si dichiara inconcludente se nessuna funzione risulta presente', async () => {
    // Progetto sbagliato o schema non esposto: non è il database che ha perso
    // tutte le RPC insieme.
    const f = finta({});
    const r = await verifica({ fetchImpl: f, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(r.verdetto).toBe(INDETERMINATO);
    expect(r.mancanti).toEqual([]);
  });

  it('si dichiara inconcludente se l\'API REST non risponde', async () => {
    const impl = async () => { throw new Error('ENOTFOUND'); };
    const r = await verifica({ fetchImpl: impl, base: 'https://x.supabase.co', chiave: 'k', funzioni });
    expect(r.verdetto).toBe(INDETERMINATO);
    expect(r.motivo).toMatch(/irraggiungibile/);
  });
});

describe('estrazione sul codice vero', () => {
  // Sorgente vero, non un campione: se un domani il client cambiasse il modo
  // di chiamare le RPC e l'estrattore non lo seguisse, la sonda comincerebbe a
  // interrogare firme sbagliate senza che nessun test se ne accorga.
  const listeApi = () => readFileSync(join(process.cwd(), 'src/lib/listeApi.js'), 'utf8');

  it('trova le RPC realmente chiamate da listeApi.js', () => {
    const nomi = raggruppaPerNome(estraiChiamateRpc(listeApi())).map((v) => v.nome);
    expect(nomi).toContain('modifica_note_lista');
    expect(nomi).toContain('crea_lista');
    expect(nomi).toContain('aggiungi_beneficiario_lista');
  });

  it('legge la firma di modifica_note_lista come la manda il client', () => {
    const voce = raggruppaPerNome(estraiChiamateRpc(listeApi())).find((v) => v.nome === 'modifica_note_lista');
    expect(voce.firme[0].argomenti).toEqual(['p_id', 'p_note']);
  });
});
