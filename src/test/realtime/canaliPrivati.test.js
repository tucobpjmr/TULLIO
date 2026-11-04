// M-3 dell'audit del 4 novembre · presenza e «sta scrivendo» viaggiano su
// canali PRIVATI.
//
// Su un canale pubblico Realtime non valuta alcuna policy: con la sola chiave
// anon (nel bundle) si leggeva chi è collegato e si poteva pubblicare un «sta
// scrivendo» a nome di altri. Le policy su `realtime.messages` (migrazione
// 20261104181351) valgono solo se il client apre il canale con
// `private: true`: è la metà che questo file tiene ferma. L'altra metà —
// cosa le policy concedono — sta in src/test/integration/realtimeCanali.test.js.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/clientId.js", () => ({ getClientId: () => "origine" }));

const canali = [];
vi.mock("../../lib/supabase", () => {
  const supabase = {
    channel: vi.fn((topic, opzioni) => {
      const ch = {
        on: vi.fn(() => ch),
        subscribe: vi.fn(() => ch),
        track: vi.fn(), send: vi.fn(), presenceState: () => ({}),
      };
      canali.push({ topic, opzioni });
      return ch;
    }),
    removeChannel: vi.fn(),
  };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { subscribeToPresence, subscribeToTyping, subscribeToTable } = await import("../../lib/api.js");
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { canali.length = 0; });

describe("canali Realtime — chi è privato e chi no", () => {
  it("la presenza dell'agenzia è un canale privato", async () => {
    subscribeToPresence({ key: "u1", payload: () => ({}), onSync: () => {} });
    await flush();
    expect(canali[0].topic).toBe("presenza:agenzia");
    expect(canali[0].opzioni.config).toMatchObject({ private: true, presence: { key: "u1" } });
  });

  it("il «sta scrivendo» di una conversazione è un canale privato", async () => {
    subscribeToTyping("c1", () => {});
    await flush();
    expect(canali[0].topic).toBe("typing:c1");
    expect(canali[0].opzioni.config).toMatchObject({ private: true, broadcast: { self: false } });
  });

  it("i canali postgres_changes restano come sono: li protegge la RLS delle tabelle", async () => {
    // Controprova: se diventassero privati senza una policy sul loro topic,
    // smetterebbero di agganciarsi — è il motivo per cui «Allow public access»
    // resta acceso (vedi la migrazione).
    subscribeToTable("tasks", () => {});
    await flush();
    expect(canali[0].opzioni).toBeUndefined();
  });
});
