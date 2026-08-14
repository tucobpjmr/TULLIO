// RESTORE_BACKUP — M-1 dell'audit del 14 agosto (secondo passaggio).
//
// IL DIFETTO CHE QUESTI TEST BLOCCANO. Prima `persist` era un `Promise.all`
// con UNA richiesta per riga del file di backup — su un backup completo
// (289 task in produzione) centinaia di richieste concorrenti in un colpo
// solo — e NESSUN rollback, mentre il reducer aveva già fuso l'intero backup
// nello stato: un fallimento parziale mostrava "ripristino completo" a
// schermo con una parte non arrivata sul server.
//
// Qui si verifica: (1) i job vengono eseguiti a BLOCCHI e non tutti insieme,
// (2) un fallimento su una riga non impedisce alle altre di procedere,
// (3) `res.falliti` porta l'informazione esatta (tipo/chiave/se esisteva) che
// `rollback` usa per compensare — la parte simmetrica (cosa fa il reducer con
// quel payload) è in src/test/reducer.test.js.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/api.js", () => {
  const ok = () => Promise.resolve({ data: null, error: null });
  return {
    Tasks: { update: vi.fn(ok), create: vi.fn(ok) },
    Categories: { update: vi.fn(ok), create: vi.fn(ok) },
    Notices: { update: vi.fn(ok), create: vi.fn(ok) },
  };
});

const { PERSISTENCE } = await import("../state/persistence.js");
const { Tasks: TasksAPI } = await import("../lib/api.js");

const task = (over = {}) => ({
  id: "t1", title: "Volo Roma", category: "booking", priority: "high",
  status: "todo", assignees: [], comments: [], ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("persistence — RESTORE_BACKUP: esecuzione a blocchi", () => {
  it("esegue i job in blocchi di 50, non tutti in un colpo solo", async () => {
    // Ogni chiamata registra il numero di richieste TasksAPI.update già in
    // volo insieme: se l'implementazione tornasse a Promise.all su TUTTI i
    // job, il picco sarebbe pari al numero totale di righe (120 qui), non
    // limitato a 50.
    let inVolo = 0;
    let piccoMassimo = 0;
    TasksAPI.update.mockImplementation(async () => {
      inVolo++;
      piccoMassimo = Math.max(piccoMassimo, inVolo);
      await new Promise(r => setTimeout(r, 5));
      inVolo--;
      return { data: null, error: null };
    });

    const tasks = Array.from({ length: 120 }, (_, i) => task({ id: `t${i}` }));
    const s = { tasks, categories: {}, notices: [] };
    await PERSISTENCE.RESTORE_BACKUP.persist(s, { payload: { tasks } });

    expect(TasksAPI.update).toHaveBeenCalledTimes(120);
    expect(piccoMassimo).toBeLessThanOrEqual(50);
  });

  it("un job fallito non impedisce ai successivi di procedere", async () => {
    TasksAPI.update.mockImplementation(async () => ({ data: null, error: null }));
    TasksAPI.update.mockImplementationOnce(async () => ({ data: null, error: { message: "RLS negata" } }));

    const tasks = [task({ id: "t1" }), task({ id: "t2" }), task({ id: "t3" })];
    const s = { tasks, categories: {}, notices: [] };
    const res = await PERSISTENCE.RESTORE_BACKUP.persist(s, { payload: { tasks } });

    expect(TasksAPI.update).toHaveBeenCalledTimes(3); // tutte e tre tentate
    expect(res.error).toBeTruthy();
    expect(res.falliti).toHaveLength(1);
    expect(res.falliti[0].key).toBe("t1");
  });

  it("falliti riporta tipo/chiave/esisteva per ogni riga fallita, righe di tipo diverso comprese", async () => {
    const { Categories: CategoriesAPI, Notices: NoticesAPI } = await import("../lib/api.js");
    TasksAPI.update.mockResolvedValue({ data: null, error: { message: "boom task" } });
    CategoriesAPI.create.mockResolvedValue({ data: null, error: { message: "boom cat" } });
    NoticesAPI.update.mockResolvedValue({ data: null, error: null });

    const s = {
      tasks: [task({ id: "t1" })],
      categories: {}, // "nuovacat" non esiste ancora → create
      notices: [{ id: "n1", text: "vecchio" }],
    };
    const payload = {
      tasks: [task({ id: "t1", title: "Aggiornato" })],
      categories: { nuovacat: { label: "Nuova" } },
      notices: [{ id: "n1", text: "aggiornato" }],
    };
    const res = await PERSISTENCE.RESTORE_BACKUP.persist(s, { payload });

    expect(res.falliti).toHaveLength(2);
    const daTask = res.falliti.find(f => f.tipo === "tasks");
    expect(daTask).toMatchObject({ key: "t1", esisteva: true });
    const daCat = res.falliti.find(f => f.tipo === "categories");
    expect(daCat).toMatchObject({ key: "nuovacat", esisteva: false });
    // la notice, riuscita, non compare fra i falliti
    expect(res.falliti.some(f => f.tipo === "notices")).toBe(false);
  });

  it("nessun job (payload vuoto) è un NOOP, non una chiamata a vuoto", async () => {
    const res = await PERSISTENCE.RESTORE_BACKUP.persist({ tasks: [], categories: {}, notices: [] }, { payload: {} });
    expect(res).toEqual({ error: null });
    expect(TasksAPI.update).not.toHaveBeenCalled();
  });
});

describe("persistence — RESTORE_BACKUP: rollback costruisce il payload di compensazione", () => {
  it("una riga ESISTENTE fallita → va in daRipristinare con lo snapshot pre-dispatch", () => {
    const s = { tasks: [task({ id: "t1", title: "Originale" })], categories: {}, notices: [] };
    const res = { falliti: [{ tipo: "tasks", key: "t1", esisteva: true }] };
    const undo = PERSISTENCE.RESTORE_BACKUP.rollback(s, {}, res);
    expect(undo).toEqual({
      type: "ROLLBACK_RESTORE_BACKUP",
      payload: {
        daRipristinare: { tasks: [task({ id: "t1", title: "Originale" })], categories: {}, notices: [] },
        daRimuovere: { tasks: [], categories: [], notices: [] },
      },
    });
  });

  it("una riga CREATA (non esisteva) e fallita → va in daRimuovere, non in daRipristinare", () => {
    const s = { tasks: [], categories: {}, notices: [] };
    const res = { falliti: [{ tipo: "tasks", key: "t-nuovo", esisteva: false }] };
    const undo = PERSISTENCE.RESTORE_BACKUP.rollback(s, {}, res);
    expect(undo.payload.daRimuovere.tasks).toEqual(["t-nuovo"]);
    expect(undo.payload.daRipristinare.tasks).toEqual([]);
  });

  it("senza righe fallite non produce alcuna compensazione", () => {
    const s = { tasks: [], categories: {}, notices: [] };
    expect(PERSISTENCE.RESTORE_BACKUP.rollback(s, {}, { falliti: [] })).toBeNull();
    expect(PERSISTENCE.RESTORE_BACKUP.rollback(s, {}, undefined)).toBeNull();
  });
});
