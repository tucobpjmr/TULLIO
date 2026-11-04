// M-1/M-2 dell'audit del 4 novembre · la forma della UPDATE confrontata.
//
// Il confronto deve stare nella WHERE della stessa UPDATE — è ciò che lo
// rende atomico — e i valori nulli vanno chiesti con `is`, non con `eq`
// (`eq.null` confronterebbe con la stringa "null"). Qui si registra la catena
// di chiamate al builder di supabase-js.
import { describe, it, expect, vi, beforeEach } from "vitest";

const catena = [];
const builder = {
  update: vi.fn((patch) => { catena.push(["update", patch]); return builder; }),
  eq: vi.fn((c, v) => { catena.push(["eq", c, v]); return builder; }),
  is: vi.fn((c, v) => { catena.push(["is", c, v]); return builder; }),
  select: vi.fn(() => { catena.push(["select"]); return builder; }),
  single: vi.fn(() => { catena.push(["single"]); return Promise.resolve({ data: {}, error: null }); }),
  then: undefined,
};

vi.mock("../../lib/supabase", () => {
  const supabase = { from: vi.fn(() => builder) };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});
vi.mock("../../lib/clientId", () => ({ getClientId: () => "origine-test" }));

const { Tasks } = await import("../../lib/api.js");
const { letteraleArray } = await import("../../lib/api/task.js");

beforeEach(() => { catena.length = 0; vi.clearAllMocks(); });

describe("Tasks.update con `attesi`", () => {
  it("mette i valori attesi nella WHERE della stessa UPDATE", async () => {
    await Tasks.update("t1", { status: "done" }, {
      attesi: { status: "todo", assignees: ["u1", "u2"], due_date: null },
    });
    expect(catena).toEqual([
      ["update", { status: "done", origin_client: "origine-test" }],
      ["eq", "id", "t1"],
      ["eq", "status", "todo"],
      ["eq", "assignees", '{"u1","u2"}'],
      ["is", "due_date", null],
      ["select"],
    ]);
  });

  it("senza `attesi` resta la scrittura di sempre", async () => {
    await Tasks.update("t1", { status: "done" });
    expect(catena.map(([op]) => op)).toEqual(["update", "eq", "select", "single"]);
  });
});

describe("letteraleArray", () => {
  it("costruisce il letterale Postgres, vuoto compreso, proteggendo virgolette e barre", () => {
    expect(letteraleArray([])).toBe("{}");
    expect(letteraleArray(["a"])).toBe('{"a"}');
    expect(letteraleArray(['x"y', "a\\b"])).toBe('{"x\\"y","a\\\\b"}');
  });
});
