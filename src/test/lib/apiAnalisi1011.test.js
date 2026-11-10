// Analisi del 10 novembre — B-1 (allegati orfani), B-2 (letture troncate) e la
// pagina di storia di A-2, sul data layer con un finto client Supabase.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

const stato = vi.hoisted(() => ({
  inserimento: { data: { id: "f1" }, error: null },
  rimossi: [], erroreRemove: null,
  elenchi: [],
  query: [],
  righe: [],
}));

vi.mock("../../lib/supabase", () => {
  const builder = (tabella) => {
    const q = { tabella, filtri: [], ordini: [], limite: null, conteggio: false, range: null };
    stato.query.push(q);
    const self = {
      select: (_c, o) => { q.conteggio = o?.count === "exact"; return self; },
      insert: () => self,
      delete: () => self,
      eq: (c, v) => { q.filtri.push(["eq", c, v]); return self; },
      is: (c, v) => { q.filtri.push(["is", c, v]); return self; },
      lte: (c, v) => { q.filtri.push(["lte", c, v]); return self; },
      order: (c, o) => { q.ordini.push([c, o?.ascending ?? true]); return self; },
      limit: (n) => { q.limite = n; return self; },
      single: () => Promise.resolve(stato.inserimento),
      range: (da, a) => {
        q.range = [da, a];
        return Promise.resolve({ data: stato.righe.slice(da, Math.min(a + 1, da + 1000)), count: stato.righe.length, error: null });
      },
      then: (ok) => ok(tabella === "task_files" ? { error: null } : { data: stato.righe.slice(0, q.limite ?? 1000), error: null }),
    };
    return self;
  };
  const storage = {
    from: () => ({
      upload: async (path) => ({ data: { path }, error: null }),
      remove: async (paths) => { stato.rimossi.push(...paths); return { error: stato.erroreRemove }; },
      list: async () => ({ data: stato.elenchi.shift() ?? [], error: null }),
    }),
  };
  const supabase = { from: builder, storage };
  return { supabase, default: supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { TaskFiles } = await import("../../lib/api/allegati.js");
const { Messages } = await import("../../lib/api/chat.js");
const { ListeAPI } = await import("../../lib/api/liste.js");

beforeEach(() => {
  stato.inserimento = { data: { id: "f1" }, error: null };
  stato.rimossi = []; stato.erroreRemove = null; stato.elenchi = []; stato.query = []; stato.righe = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("B-1 · TaskFiles — niente file orfani", () => {
  const file = { name: "doc.pdf", type: "application/pdf", size: 10 };

  it("se la riga non si inserisce, il file appena caricato si toglie", async () => {
    stato.inserimento = { data: null, error: { message: "RLS" } };
    const res = await TaskFiles.upload(file, "t1");
    expect(res.error.message).toBe("RLS");
    expect(stato.rimossi).toHaveLength(1);
    expect(stato.rimossi[0]).toMatch(/^t1\/.+-doc\.pdf$/);
  });

  it("controllo positivo: a inserimento riuscito il file resta", async () => {
    const res = await TaskFiles.upload(file, "t1");
    expect(res.error).toBeNull();
    expect(stato.rimossi).toEqual([]);
  });

  it("remove: un errore dello storage si scrive in console invece di sparire", async () => {
    stato.erroreRemove = { message: "giù" };
    const res = await TaskFiles.remove("f1", "t1/x.pdf");
    expect(res.error).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });
});

describe("B-2 · letture che devono arrivare intere", () => {
  it("movimenti di una lista: 1500 righe tornano tutte, a pagine e con ordine stabile", async () => {
    stato.righe = Array.from({ length: 1500 }, (_, i) => ({ id: i }));
    const { data, error } = await ListeAPI.movimenti("l1");
    expect(error).toBeNull();
    expect(data).toHaveLength(1500);
    const q = stato.query[0];
    expect(q.conteggio).toBe(true);
    expect(q.ordini.map(([c]) => c)).toEqual(["data_movimento", "created_at", "id"]);
  });

  it("pulizia allegati di una conversazione: continua oltre il primo blocco da 1000", async () => {
    const blocco = (n, da) => Array.from({ length: n }, (_, i) => ({ name: `f${da + i}` }));
    stato.elenchi = [blocco(1000, 0), blocco(200, 1000)];
    const { error } = await Messages.removeConversationFiles("c1");
    expect(error).toBeNull();
    expect(stato.rimossi).toHaveLength(1200);
    expect(stato.rimossi[0]).toBe("c1/f0");
  });

  it("pulizia allegati: un errore di rimozione ferma il giro e torna a chi chiama", async () => {
    stato.elenchi = [[{ name: "a" }]];
    stato.erroreRemove = { message: "negato" };
    expect((await Messages.removeConversationFiles("c1")).error.message).toBe("negato");
  });
});

describe("A-2 · Messages.listForConversation — una pagina di storia", () => {
  it("chiede i più recenti fino a `fino` compreso e li rende in ordine di tempo", async () => {
    stato.righe = [{ id: "m3" }, { id: "m2" }, { id: "m1" }]; // come li dà il server: dal più recente
    const { data } = await Messages.listForConversation("c1", { fino: "2026-11-10T10:00:00Z", limit: 50 });
    expect(data.map(r => r.id)).toEqual(["m1", "m2", "m3"]);
    const q = stato.query[0];
    expect(q.filtri).toEqual([["eq", "conversation_id", "c1"], ["lte", "created_at", "2026-11-10T10:00:00Z"]]);
    expect(q.ordini).toEqual([["created_at", false], ["id", false]]);
    expect(q.limite).toBe(50);
  });

  it("senza `fino` parte dai più recenti", async () => {
    await Messages.listForConversation("c1");
    expect(stato.query[0].filtri).toEqual([["eq", "conversation_id", "c1"]]);
  });
});

// B-4 · cablaggio letto dal sorgente: Ctrl+K trova il campo per id.
describe("B-4 · la scorciatoia di ricerca non dipende dal placeholder", () => {
  it("VoyageDeskInner usa l'id esportato da Topbar, che lo mette sull'input", () => {
    const guscio = readFileSync("src/VoyageDeskInner.jsx", "utf8");
    const topbar = readFileSync("src/components/shell/Topbar.jsx", "utf8");
    expect(guscio).toContain("document.getElementById(ID_RICERCA_GLOBALE)");
    expect(guscio).not.toMatch(/querySelector\([^)]*placeholder/);
    expect(topbar).toContain("id={ID_RICERCA_GLOBALE}");
  });
});
