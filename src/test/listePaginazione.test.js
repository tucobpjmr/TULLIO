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

vi.mock("../lib/supabase", () => ({ supabase: { from: fakeFrom }, default: {} }));

const { ListeAPI } = await import("../lib/listeApi.js");

beforeEach(() => {
  db.tables = {};
  db.cap = 1000;
  db.error = null;
  ranges.length = 0;
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
