// src/test/scripts/scrittureInVoloAMeta.test.js
//
// Suggerimento strategico n. 2 dell'audit del 28 agosto · Il presidio delle DUE
// METÀ del contratto delle scritture in volo: il reducer che FONDE
// (`fondiScrittureInVolo` nel `SET_*`) e il registry che MARCA (`entityId`
// nelle entry che mutano quell'entità).
//
// ⚠️ IL DIFETTO CHE ESISTE PER TROVARE non è «manca la protezione»: è che
// ciascuna delle due metà, da sola, FA SEMBRARE FATTA l'altra. Una fusione
// senza marcatura si legge nel reducer, si cita in review, e gira su una mappa
// sempre vuota; una marcatura senza fusione riempie una mappa che nessuno
// consulta. Nessuna delle due produce un errore. Il team ci è rimasto un anno
// con ENTRAMBE mancanti (A-3), che è il modo in cui questa classe si nasconde:
// nessuna metà presente a fare da indizio dell'altra.
//
// I casi qui sotto riproducono le forme esatte del codice PRIMA di A-3 — la
// sostituzione secca di `SET_TEAM` e le cinque entry senza `entityId` — perché
// un presidio che non trova il difetto per cui è nato non presidia niente.
import { describe, it, expect } from 'vitest';
import {
  LetturaFallita, scrittureInVoloAMeta,
} from '../../../scripts/verifica-convenzioni/convenzioni.js';

// Il minimo che rende il controllo non vacuo: un reducer con una fetta fusa,
// un registry che la marca, una sottoscrizione a canale vivo e una senza.
const reducer = (corpoSetTeam) => ({
  path: 'src/state/reducer.js',
  testo: `switch (action.type) {
    case "SET_TASKS": {
      return { ...state, tasks: fondiScrittureInVolo(action.payload, state.tasks, state.pendingWrites) };
    }
    case "UPDATE_TASK": {
      const tasks = state.tasks.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
      return { ...state, tasks, toasts: pushToast(state.toasts, { message: "ok", type: "success" }) };
    }
    case "SET_TEAM": {
      ${corpoSetTeam}
    }
    case "UPDATE_TEAM_MEMBER": {
      const team = state.team.map(m => m.id === action.payload.id ? { ...m, ...action.payload } : m);
      return { ...state, team, toasts: pushToast(state.toasts, { message: "ok", type: "success" }) };
    }
    case "SET_CATEGORIES": {
      return { ...state, categories: action.payload || {} };
    }
  }`,
});

const registry = ({ marcaIlTeam }) => ({
  path: 'src/state/persistence.js',
  testo: `export const PERSISTENCE = {
  UPDATE_TASK: {
    persist: (s, a) => TasksAPI.update(a.payload.id, toDbTask(a.payload)),
    entityId: (a) => a.payload?.id,
  },
  UPDATE_TEAM_MEMBER: {
    persist: (s, a) => UsersAPI.updateProfile(a.payload.id, a.payload),
    ${marcaIlTeam ? 'entityId: (a) => a.payload?.id,' : ''}
  },
};`,
});

const idratazione = (opzioni) => ({
  path: 'src/hooks/useAppHydration.js',
  testo: `useDebouncedTableSubscription(["tasks"], idratazione({
    list: () => TasksAPI.list(), action: "SET_TASKS", dispatch,
  }), { enabled, deps: [enabled] });
  useDebouncedTableSubscription(["users"], async (isCurrent) => {
    const { data } = await UsersAPI.listAll();
    if (!isCurrent()) return;
    dispatch({ type: "SET_TEAM", payload: data });
  }, { enabled, deps: [enabled] });
  useDebouncedTableSubscription(["categories"], async (isCurrent) => {
    dispatch({ type: "SET_CATEGORIES", payload: {} });
  }, { enabled, deps: [enabled]${opzioni.categorieSenzaCanale ? ', senzaCanale: true' : ''} });
  useDebouncedTableSubscription(["message_templates"], idratazione({
    action: "SET_MESSAGE_TEMPLATES", dispatch,
  }), { enabled, deps: [enabled], senzaCanale: true });`,
});

const SET_TEAM_FUSO =
  'return { ...state, team: fondiScrittureInVolo(action.payload, state.team, state.pendingWrites) };';
const SET_TEAM_SECCO = 'const team = action.payload || []; return { ...state, team };';

const sorgenti = ({ setTeam = SET_TEAM_FUSO, marcaIlTeam = true, categorieSenzaCanale = true } = {}) => [
  reducer(setTeam), registry({ marcaIlTeam }), idratazione({ categorieSenzaCanale }),
];

describe('scrittureInVoloAMeta — le due metà del contratto', () => {
  it('non segnala nulla quando entrambe le metà ci sono', () => {
    expect(scrittureInVoloAMeta(sorgenti())).toEqual([]);
  });

  it('segnala la MARCATURA senza fusione: id in volo che nessun SET_* consulta', () => {
    // La forma di `SET_TEAM` prima di A-3, con `entityId` già aggiunto: è
    // l'errore che si fa aggiungendo una metà per volta, e non protegge nulla.
    const guasti = scrittureInVoloAMeta(sorgenti({ setTeam: SET_TEAM_SECCO }));
    expect(guasti.some(g => g.startsWith('UPDATE_TEAM_MEMBER:'))).toBe(true);
    expect(guasti.some(g => /SET_TEAM.*senza fondere/.test(g))).toBe(true);
  });

  it('segnala la FUSIONE senza marcatura: una mappa dei pendenti sempre vuota', () => {
    // L'altra metà per prima: `fondiScrittureInVolo` in SET_TEAM e nessuna
    // entry che marchi. Si legge nel reducer come una protezione e non lo è —
    // è il caso che rende questo controllo diverso da una semplice ricerca di
    // `fondiScrittureInVolo`.
    expect(scrittureInVoloAMeta(sorgenti({ marcaIlTeam: false }))).toEqual([
      'state.team: il reducer la fonde con le scritture in volo, ma nessuna entry '
      + 'del registry dichiara entityId per una mutazione che la scrive — la fusione '
      + 'gira su una mappa sempre vuota',
    ]);
  });

  it('segnala lo stato SCOPERTO di A-3: nessuna delle due metà', () => {
    const guasti = scrittureInVoloAMeta(sorgenti({ setTeam: SET_TEAM_SECCO, marcaIlTeam: false }));
    // Nessun rilievo su `state.team` — non è più fusa, quindi non c'è alcuna
    // fusione vuota da segnalare — ma la finestra sì: la sottoscrizione su
    // `users` ha un canale vivo e SET_TEAM sostituisce secco. È il modo in cui
    // il difetto vero si presenta, e l'unico dei tre che lo vede.
    expect(guasti).toEqual([
      'src/hooks/useAppHydration.js: la sottoscrizione ha un canale vivo e dispatcha '
      + 'SET_TEAM, che sostituisce in blocco senza fondere le scritture in volo',
    ]);
  });

  it('una fetta senza fusione NON è un rilievo se nessun canale vivo la rilegge', () => {
    // `categories` e `message_templates` sono `senzaCanale`: nessun evento
    // altrui fa ripartire il loro refetch, quindi la finestra non esiste. È il
    // perimetro del controllo, ed è DERIVATO dal codice invece di essere una
    // riga in una lista di eccezioni.
    expect(scrittureInVoloAMeta(sorgenti())).toEqual([]);
  });

  it('la stessa fetta diventa un rilievo appena la sottoscrizione prende un canale', () => {
    expect(scrittureInVoloAMeta(sorgenti({ categorieSenzaCanale: false }))).toEqual([
      'src/hooks/useAppHydration.js: la sottoscrizione ha un canale vivo e dispatcha '
      + 'SET_CATEGORIES, che sostituisce in blocco senza fondere le scritture in volo',
    ]);
  });

  it('segnala un entityId su un\'azione che il reducer non conosce', () => {
    // Un `case` rinominato senza toccare il registry: la marcatura resta, non
    // marca più niente, e nulla lo direbbe.
    const rotto = sorgenti().map(f => (f.path === 'src/state/reducer.js'
      ? { ...f, testo: f.testo.replace('case "UPDATE_TASK"', 'case "MODIFICA_TASK"') }
      : f));
    expect(scrittureInVoloAMeta(rotto)).toContain(
      'UPDATE_TASK: dichiara entityId ma il reducer non ha un case con questo nome',
    );
  });
});

// ─── I controlli positivi di sé stesso ──────────────────────────────────────
// «Un atteso di 0 protegge dal debito che CRESCE, non dal perimetro che si
// RESTRINGE» (docs/CLAUDE.md). Qui i modi di restringersi sono tre: perdere i
// soggetti, perdere la vista su di essi, o perdere la DISTINZIONE fra canale
// vivo e `senzaCanale` — che è ciò su cui si regge l'assenza di eccezioni.
describe('scrittureInVoloAMeta — non può passare su un insieme vuoto', () => {
  it('solleva se il reducer o il registry non ci sono più', () => {
    expect(() => scrittureInVoloAMeta([reducer(SET_TEAM_FUSO)])).toThrow(LetturaFallita);
    expect(() => scrittureInVoloAMeta([])).toThrow(LetturaFallita);
  });

  it('solleva se il parser dei `case` diventa cieco', () => {
    const rotto = sorgenti().map(f => (f.path === 'src/state/reducer.js'
      ? { ...f, testo: f.testo.replace(/case\s+"/g, 'caso "') }
      : f));
    expect(() => scrittureInVoloAMeta(rotto)).toThrow(/lettura vuota/);
  });

  it('solleva se nessuna entry dichiara più `entityId`', () => {
    const rotto = sorgenti().map(f => (f.path === 'src/state/persistence.js'
      ? { ...f, testo: f.testo.replace(/entityId: .*$/gm, '') }
      : f));
    expect(() => scrittureInVoloAMeta(rotto)).toThrow(/lettura vuota/);
  });

  it('solleva se le due classi di sottoscrizione non si distinguono più', () => {
    // Nessuna `senzaCanale`: o la forma dell'opzione è cambiata, o il perimetro
    // si è svuotato. In entrambi i casi la distinzione su cui si regge l'assenza
    // di eccezioni non è più misurata da niente, e va riletta a mano invece che
    // dedotta da un elenco di rilievi improvvisamente più lungo.
    const tutteVive = sorgenti().map(f => (f.path === 'src/hooks/useAppHydration.js'
      ? { ...f, testo: f.testo.replace(/,\s*senzaCanale: true/g, '') }
      : f));
    expect(() => scrittureInVoloAMeta(tutteVive)).toThrow(LetturaFallita);
  });
});
