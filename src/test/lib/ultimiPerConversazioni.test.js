// Messages.ultimiPerConversazioni (lib/api/chat.js): l'idratazione della chat
// legge gli ultimi messaggi di OGNI conversazione, non più un corpus unico dei
// 2000 messaggi più recenti di tutte.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../lib/supabase", () => ({ supabase: {}, getSupabase: () => Promise.resolve({}) }));

const { Messages } = await import("../../lib/api.js");

const riga = (conv, i) => ({ id: `${conv}-${i}`, conversation_id: conv });
let spia;

beforeEach(() => {
  spia?.mockRestore();
  spia = vi.spyOn(Messages, "listForConversation");
});

describe("Messages.ultimiPerConversazioni", () => {
  it("una pagina per conversazione; troncate quelle con la pagina piena", async () => {
    spia.mockImplementation(async (conv, { limit }) => ({
      data: Array.from({ length: conv === "piena" ? limit : 1 }, (_, i) => riga(conv, i)),
      error: null,
    }));
    const r = await Messages.ultimiPerConversazioni(["piena", "corta", "piena"], { limit: 3 });

    expect(spia).toHaveBeenCalledTimes(2);
    expect(spia).toHaveBeenCalledWith("piena", { limit: 3 });
    expect(r.error).toBeNull();
    expect(r.troncate).toEqual(["piena"]);
    expect(r.data).toHaveLength(4);
  });

  it("non supera le richieste in parallelo dichiarate", async () => {
    let inCorso = 0;
    let massimo = 0;
    spia.mockImplementation(async () => {
      inCorso++;
      massimo = Math.max(massimo, inCorso);
      await new Promise((r) => setTimeout(r, 5));
      inCorso--;
      return { data: [], error: null };
    });
    await Messages.ultimiPerConversazioni(Array.from({ length: 10 }, (_, i) => `c${i}`), { parallele: 3 });

    expect(spia).toHaveBeenCalledTimes(10);
    expect(massimo).toBe(3);
  });

  it("una sola richiesta fallita fa fallire tutto: niente corpus a buchi", async () => {
    spia.mockImplementation(async (conv) => (conv === "rotta"
      ? { data: null, error: { message: "rete" } }
      : { data: [riga(conv, 1)], error: null }));
    const r = await Messages.ultimiPerConversazioni(["ok", "rotta"]);

    expect(r).toEqual({ data: null, error: { message: "rete" }, troncate: [] });
  });

  it("nessuna conversazione: nessuna richiesta", async () => {
    const r = await Messages.ultimiPerConversazioni([]);
    expect(spia).not.toHaveBeenCalled();
    expect(r).toEqual({ data: [], error: null, troncate: [] });
  });
});
