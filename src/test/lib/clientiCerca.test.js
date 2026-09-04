// src/test/lib/clientiCerca.test.js
// B-1 dell'audit del 2 settembre (B-2 del 31 agosto). `%` e `_` sono
// caratteri jolly per `ilike`: senza escape, chi cerca «50%» in realtà cerca
// «50» seguito da qualsiasi cosa. Qui si verifica solo la composizione del
// pattern passato a `ilike` — il client Supabase è mockato — non il
// comportamento SQL.
import { describe, it, expect, vi } from "vitest";

function buildQuery(resolved) {
  const query = {
    select: vi.fn(() => query),
    ilike: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => Promise.resolve(resolved)),
  };
  return query;
}

vi.mock("../../lib/supabase", () => {
  const supabase = { from: vi.fn() };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { supabase } = await import("../../lib/supabase");
const { Clients } = await import("../../lib/api.js");

describe("Clients.cerca — escape dei caratteri jolly", () => {
  it("sfugge % e _ prima di comporre il pattern ilike", async () => {
    const query = buildQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);
    await Clients.cerca("50%_x");
    expect(query.ilike).toHaveBeenCalledWith("name", "%50\\%\\_x%");
  });

  it("un termine senza caratteri jolly non cambia", async () => {
    const query = buildQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);
    await Clients.cerca("rossi");
    expect(query.ilike).toHaveBeenCalledWith("name", "%rossi%");
  });

  it("sfugge il backslash per primo, così non intercetta l'escape degli altri due", async () => {
    const query = buildQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);
    await Clients.cerca("a\\b");
    expect(query.ilike).toHaveBeenCalledWith("name", "%a\\\\b%");
  });

  it("più termini: ogni termine è sfuggito nel proprio ilike", async () => {
    const query = buildQuery({ data: [], error: null });
    supabase.from.mockReturnValue(query);
    await Clients.cerca("mario_rossi 50%");
    expect(query.ilike).toHaveBeenNthCalledWith(1, "name", "%mario\\_rossi%");
    expect(query.ilike).toHaveBeenNthCalledWith(2, "name", "%50\\%%");
  });
});
