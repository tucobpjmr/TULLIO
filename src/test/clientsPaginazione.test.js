// Paginazione di Clients.list() — anagrafica clienti.
//
// Contesto: PostgREST tronca ogni select a `db-max-rows` (1000 sui progetti
// Supabase) restituendo HTTP 200 e nessun errore. `clients` è l'unica
// anagrafica letta per intero a ogni avvio dell'app (useAppHydration), quindi
// un domani sopra le 1000 righe l'idratazione mostrerebbe una lista
// incompleta senza che nulla lo segnali. Stesso pattern di
// `listePaginazione.test.js` per il modulo Liste, stessa `fetchAllRows`
// condivisa in `lib/fetchAllRows.js`.
import { describe, it, expect, vi, beforeEach } from "vitest";

const rows = (n, prefix) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}-${i}` }));

const db = { tables: {}, cap: 1000, error: null };
const ranges = [];

const fakeFrom = (table) => {
  let exactCount = false;
  const q = {
    select: (_cols, opts) => { exactCount = opts?.count === "exact"; return q; },
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

const { Clients } = await import("../lib/api.js");

beforeEach(() => {
  db.tables = {};
  db.cap = 1000;
  db.error = null;
  ranges.length = 0;
});

describe("Clients.list() — non si ferma alla prima pagina", () => {
  it("scarica tutti i clienti anche oltre il cap di 1000 righe", async () => {
    db.tables = { clients: rows(1400, "c") };

    const { data, error } = await Clients.list();

    expect(error).toBeNull();
    expect(data).toHaveLength(1400);
  });

  it("richiede pagine contigue, senza buchi", async () => {
    db.tables = { clients: rows(2500, "c") };

    await Clients.list();

    expect(ranges).toEqual([
      ["clients", 0, 999],
      ["clients", 1000, 1999],
      ["clients", 2000, 2999],
    ]);
  });

  it("resta completo anche se il cap del server fosse più basso di una pagina", async () => {
    db.cap = 400;
    db.tables = { clients: rows(1500, "c") };

    const { data } = await Clients.list();

    expect(data).toHaveLength(1500);
  });

  it("sotto il cap si ferma alla prima pagina", async () => {
    db.tables = { clients: rows(818, "c") };

    const { data } = await Clients.list();

    expect(data).toHaveLength(818);
    expect(ranges).toEqual([["clients", 0, 999]]);
  });

  it("propaga l'errore invece di restituire un'anagrafica a metà", async () => {
    db.tables = { clients: rows(1500, "c") };
    db.error = { message: "permission denied" };

    const { data, error } = await Clients.list();

    expect(data).toBeNull();
    expect(error.message).toBe("permission denied");
  });
});
