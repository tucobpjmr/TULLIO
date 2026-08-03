// Paginazione delle query "prendi tutto" del modulo Liste viaggio.
//
// Contesto del bug che questi test bloccano: PostgREST tronca ogni select a
// `db-max-rows` (1000 sui progetti Supabase) restituendo HTTP 200 e nessun
// errore. Il backup JSON scaricava quindi 1000 movimenti su 5275 senza che
// nulla lo segnalasse — e il toast confermava "1000 movimenti" perché contava
// le righe del file, non quelle del database.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Righe finte: quello che conta è quante sono e che tornino tutte.
const rows = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

// Stato del database finto + cap del server simulato, riassegnabili da ogni test.
const db = { tables: {}, cap: 1000, error: null };
const ranges = []; // [table, from, to] di ogni pagina richiesta

// Chiamate a importa_backup, in ordine. `failAt` fa fallire l'ennesima, per
// coprire l'interruzione a metà ripristino.
const rpc = { calls: [], failAt: null };

const fakeRpc = (name, args) => {
  rpc.calls.push({ name, payload: args.p_data });
  if (rpc.failAt !== null && rpc.calls.length === rpc.failAt) {
    return Promise.resolve({ data: null, error: { message: "statement timeout" } });
  }
  const p = args.p_data;
  return Promise.resolve({
    data: {
      clients_added: (p.clients || []).length,
      liste_added: (p.liste || []).length,
      beneficiari_added: (p.beneficiari || []).length,
      movimenti_added: (p.movimenti || []).length,
    },
    error: null,
  });
};

// Builder PostgREST minimale: incatenabile, e `.range()` chiude la catena
// restituendo la pagina (troncata al cap, come fa il server vero) più il
// conteggio esatto totale quando è stato richiesto con { count: 'exact' }.
const fakeFrom = (table) => {
  let exactCount = false;
  const q = {
    select: (_cols, opts) => { exactCount = opts?.count === "exact"; return q; },
    is: () => q,
    not: () => q,
    eq: () => q,
    order: () => q,
    range: (from, to) => {
      ranges.push([table, from, to]);
      if (db.error) return Promise.resolve({ data: null, count: null, error: db.error });
      const all = db.tables[table] || [];
      const page = all.slice(from, to + 1).slice(0, db.cap);
      return Promise.resolve({ data: page, count: exactCount ? all.length : null, error: null });
    },
  };
  return q;
};

vi.mock("../lib/supabase", () => ({ supabase: { from: fakeFrom, rpc: fakeRpc }, default: {} }));

const { ListeAPI } = await import("../lib/listeApi.js");

beforeEach(() => {
  db.tables = {};
  db.cap = 1000;
  db.error = null;
  ranges.length = 0;
  rpc.calls.length = 0;
  rpc.failAt = null;
});

describe("backupData — il backup non si ferma alla prima pagina", () => {
  it("scarica TUTTI i movimenti anche ben oltre il cap di 1000 righe", async () => {
    db.tables = {
      clients: rows(816, "c"),
      liste_viaggio: rows(614, "l"),
      movimenti_lista: rows(5275, "m"), // i numeri reali del progetto al momento del bug
    };

    const { data, error } = await ListeAPI.backupData();

    expect(error).toBeNull();
    expect(data.clients).toHaveLength(816);
    expect(data.liste).toHaveLength(614);
    expect(data.movimenti).toHaveLength(5275);
  });

  it("non perde né duplica righe tra una pagina e l'altra", async () => {
    db.tables = { clients: [], liste_viaggio: [], movimenti_lista: rows(2500, "m") };

    const { data } = await ListeAPI.backupData();

    const ids = data.movimenti.map((m) => m.id);
    expect(new Set(ids).size).toBe(2500);
    expect(ids[0]).toBe("m-0");
    expect(ids[2499]).toBe("m-2499");
  });

  it("richiede pagine contigue, senza buchi", async () => {
    db.tables = { clients: [], liste_viaggio: [], movimenti_lista: rows(2500, "m") };

    await ListeAPI.backupData();

    expect(ranges.filter(([t]) => t === "movimenti_lista")).toEqual([
      ["movimenti_lista", 0, 999],
      ["movimenti_lista", 1000, 1999],
      ["movimenti_lista", 2000, 2999],
    ]);
  });

  it("resta completo anche se il cap del server fosse più basso di una pagina", async () => {
    // È il motivo per cui la fine della paginazione si decide sul `count`
    // esatto e non sul "ho ricevuto meno di 1000 righe": con un cap a 400
    // quest'ultimo criterio si fermerebbe alla prima pagina.
    db.cap = 400;
    db.tables = { clients: [], liste_viaggio: [], movimenti_lista: rows(1500, "m") };

    const { data } = await ListeAPI.backupData();

    expect(data.movimenti).toHaveLength(1500);
  });

  it("una tabella vuota chiude subito, senza cicli infiniti", async () => {
    db.tables = { clients: [], liste_viaggio: [], movimenti_lista: [] };

    const { data, error } = await ListeAPI.backupData();

    expect(error).toBeNull();
    expect(data.movimenti).toEqual([]);
  });

  it("propaga l'errore invece di restituire un backup a metà", async () => {
    db.tables = { clients: [], liste_viaggio: [], movimenti_lista: rows(2500, "m") };
    db.error = { message: "permission denied" };

    const { data, error } = await ListeAPI.backupData();

    expect(data).toBeNull();
    expect(error.message).toBe("permission denied");
  });
});

describe("elenco e saldi — stessa paginazione, stesso cap", () => {
  it("list() restituisce tutte le liste non archiviate oltre le 1000", async () => {
    db.tables = { liste_viaggio: rows(1400, "l") };

    const { data, error } = await ListeAPI.list();

    expect(error).toBeNull();
    expect(data).toHaveLength(1400);
  });

  it("listTrash() pagina come l'elenco principale", async () => {
    db.tables = { liste_viaggio: rows(1200, "l") };

    const { data } = await ListeAPI.listTrash();

    expect(data).toHaveLength(1200);
  });

  it("saldi() copre tutte le liste, così nessuna riga resta senza saldo", async () => {
    // Se i saldi si fermassero a 1000 mentre l'elenco ne mostra di più, le
    // liste in fondo apparirebbero con "0 movimenti · 0,00 €".
    db.tables = { liste_saldi: rows(1400, "s") };

    const { data } = await ListeAPI.saldi();

    expect(data).toHaveLength(1400);
  });
});

// La RPC importa_backup è UNA sola istruzione per PostgREST, quindi ricade
// sotto lo `statement_timeout` del ruolo `authenticated` (8s su questo
// progetto). Misurato sul database reale: 5.275 movimenti in ~760ms, 42.200 in
// ~7,1s — il tetto si tocca poco oltre le 45.000 righe e lì il ripristino
// fallisce in blocco. Spezzarlo toglie il tetto del tutto.
describe("importaBackup — ripristino a blocchi", () => {
  const backup = (nc, nl, nm, nb = 0) => ({
    clients: rows(nc, "c"), liste: rows(nl, "l"), movimenti: rows(nm, "m"), beneficiari: rows(nb, "b"),
  });

  it("spezza il payload in più chiamate invece di mandarne una sola enorme", async () => {
    const { data, error } = await ListeAPI.importaBackup(backup(816, 614, 5275));

    expect(error).toBeNull();
    // 1 blocco clienti + 1 liste + 6 movimenti (5275 → 1000×5 + 275), zero cointestatari
    expect(rpc.calls).toHaveLength(8);
    expect(data).toEqual({ clients_added: 816, liste_added: 614, beneficiari_added: 0, movimenti_added: 5275 });
  });

  it("nessun blocco supera il limite di righe per chiamata, cointestatari inclusi", async () => {
    await ListeAPI.importaBackup(backup(0, 0, 42200, 1500));

    const maxRighe = Math.max(...rpc.calls.map((c) =>
      c.payload.clients.length + c.payload.liste.length + c.payload.beneficiari.length + c.payload.movimenti.length));
    expect(maxRighe).toBeLessThanOrEqual(1000);
    // 43 blocchi movimenti (42200 → 1000×42 + 200) + 2 blocchi cointestatari (1500 → 1000+500)
    expect(rpc.calls).toHaveLength(45);
  });

  it("rispetta l'ordine clienti → liste → cointestatari → movimenti", async () => {
    // La RPC scarta le liste il cui client_id non esiste ancora, i
    // cointestatari la cui lista non esiste e i movimenti la cui lista non
    // esiste: invertire l'ordine perderebbe righe in silenzio.
    await ListeAPI.importaBackup(backup(1500, 1200, 1100, 500));

    const tipo = (c) => (c.payload.clients.length ? "clients"
      : c.payload.liste.length ? "liste"
      : c.payload.beneficiari.length ? "beneficiari" : "movimenti");
    expect(rpc.calls.map(tipo)).toEqual([
      "clients", "clients", "liste", "liste", "beneficiari", "movimenti", "movimenti",
    ]);
  });

  it("manda ogni riga una volta sola, senza perderne né duplicarne", async () => {
    await ListeAPI.importaBackup(backup(0, 0, 2500));

    const inviati = rpc.calls.flatMap((c) => c.payload.movimenti.map((m) => m.id));
    expect(inviati).toHaveLength(2500);
    expect(new Set(inviati).size).toBe(2500);
  });

  it("riporta l'avanzamento mentre scrive", async () => {
    const visti = [];
    await ListeAPI.importaBackup(backup(0, 0, 2500), (p) => visti.push(p));

    expect(visti).toEqual([
      { done: 1000, total: 2500 },
      { done: 2000, total: 2500 },
      { done: 2500, total: 2500 },
    ]);
  });

  it("su errore a metà dice quanto è già entrato e che si può riprendere", async () => {
    // Il merge è per id con ON CONFLICT DO NOTHING e non cancella nulla: i
    // blocchi già scritti restano validi e ricaricare lo stesso file riprende
    // da dove si era interrotto. Se il messaggio non lo dicesse, l'utente
    // crederebbe di dover ripulire a mano.
    rpc.failAt = 3;
    const { data, error } = await ListeAPI.importaBackup(backup(0, 0, 5000));

    expect(data).toBeNull();
    expect(error.message).toContain("statement timeout");
    expect(error.message).toContain("2000 righe su 5000");
    expect(error.message).toContain("riprendere");
  });

  it("un errore al primo blocco resta l'errore originale, senza glosse", async () => {
    rpc.failAt = 1;
    const { error } = await ListeAPI.importaBackup(backup(0, 0, 5000));

    expect(error.message).toBe("statement timeout");
  });

  it("un backup vuoto non chiama la RPC e non inventa conteggi", async () => {
    const { data, error } = await ListeAPI.importaBackup(backup(0, 0, 0));

    expect(error).toBeNull();
    expect(rpc.calls).toHaveLength(0);
    expect(data).toEqual({ clients_added: 0, liste_added: 0, beneficiari_added: 0, movimenti_added: 0 });
  });
});
