// src/test/paginazione.test.js
// ST-3 — una lettura che deve arrivare INTERA non può essere una `select`
// nuda.
//
// PERCHÉ ESISTE. PostgREST tronca ogni select a `db-max-rows` (1000 di default
// sui progetti Supabase) rispondendo **HTTP 200 senza errore**. Un difetto di
// questo tipo non fallisce da solo: `Clients.list()` ha convissuto con 818
// righe in produzione senza che nulla lo segnalasse, e il primo sintomo
// sarebbe stato un cliente che "non esiste" — non un errore.
//
// Le asserzioni sono quindi due, e la seconda è quella che conta: che il
// risultato contenga TUTTE le righe anche quando il server le consegna in
// pagine, cioè che il troncamento silenzioso non sia rappresentabile.
import { describe, it, expect, vi, beforeEach } from "vitest";

const CAP = 1000;              // il cap che il finto server applica
const TOTALE = 1500;           // righe oltre il cap: due pagine

// Righe finte con id crescente, così l'ordine è verificabile.
const RIGHE = Array.from({ length: TOTALE }, (_, i) => ({
  id: `c${String(i).padStart(4, "0")}`,
  name: `Cliente ${i}`,
}));

// Registro delle chiamate: serve a distinguere "ha paginato" da "ha chiesto
// tutto in un colpo e il finto server gliene ha dati 1000".
const chiamate = [];

// Finto builder PostgREST: thenable monouso, `.order()` concatenabile,
// `.range(da, a)` che tronca al cap come fa il server vero e restituisce il
// `count` totale nel Content-Range.
const builder = (tabella) => {
  const stato = { ordini: [], conteggio: false };
  const self = {
    select: (_cols, opts) => { stato.conteggio = opts?.count === "exact"; return self; },
    order: (col) => { stato.ordini.push(col); return self; },
    range: (da, a) => {
      const richieste = a - da + 1;
      const consegnate = Math.min(richieste, CAP);
      chiamate.push({ tabella, da, a, ordini: [...stato.ordini], conteggio: stato.conteggio });
      return Promise.resolve({
        data: RIGHE.slice(da, da + consegnate),
        count: stato.conteggio ? TOTALE : null,
        error: null,
      });
    },
    // Una select senza .range(): è la forma che il cap tronca in silenzio.
    then: (risolvi) => risolvi({ data: RIGHE.slice(0, CAP), count: null, error: null }),
  };
  return self;
};

vi.mock("../lib/supabase", () => ({
  supabase: { from: vi.fn((tabella) => builder(tabella)) },
}));

const { Clients } = await import("../lib/api.js");
const { fetchAllRows } = await import("../lib/pagination.js");

beforeEach(() => { chiamate.length = 0; });

describe("Clients.list — non può essere troncata dal cap PostgREST", () => {
  it("pagina con .range() invece di fare una select nuda", async () => {
    await Clients.list();
    expect(chiamate.length).toBeGreaterThan(0);
    expect(chiamate[0].da).toBe(0);
  });

  it("chiede il conteggio esatto: è l'unico modo di sapere quando fermarsi", async () => {
    // Senza `count: 'exact'` l'unico criterio sarebbe la pagina vuota, e una
    // risposta da 1000 righe su una tabella di 1000 righe sarebbe
    // indistinguibile da una troncata.
    await Clients.list();
    expect(chiamate[0].conteggio).toBe(true);
  });

  it("ordina in modo DETERMINISTICO (name non è unico: due omonimi esistono)", async () => {
    // Senza una seconda chiave unica Postgres non garantisce lo stesso ordine
    // fra due query, e due pagine consecutive possono ripetere o saltare una
    // riga — un difetto che si manifesta solo oltre il cap, cioè dove nessuno
    // guarda.
    await Clients.list();
    expect(chiamate[0].ordini).toEqual(["name", "id"]);
  });

  it("restituisce TUTTE le 1500 righe, non le prime 1000", async () => {
    const { data, error } = await Clients.list();
    expect(error).toBeNull();
    expect(data).toHaveLength(TOTALE);
    expect(data[0].id).toBe("c0000");
    expect(data[TOTALE - 1].id).toBe("c1499");
  });
});

describe("fetchAllRows — il contratto della paginazione", () => {
  it("propaga l'errore invece di restituire una lista parziale", async () => {
    const { data, error } = await fetchAllRows(() => ({
      range: () => Promise.resolve({ data: null, count: null, error: { message: "boom" } }),
    }));
    // Mezza tabella con `error: null` sarebbe il difetto che questo modulo
    // esiste per impedire, in un'altra forma.
    expect(data).toBeNull();
    expect(error).toEqual({ message: "boom" });
  });

  it("si ferma su una pagina vuota anche se `count` non arriva", async () => {
    let n = 0;
    const { data, error } = await fetchAllRows(() => ({
      range: () => Promise.resolve({
        data: n++ === 0 ? [{ id: 1 }] : [],
        count: null,          // server che non manda il Content-Range
        error: null,
      }),
    }));
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});
