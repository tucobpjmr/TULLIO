// M-2 dell'analisi del 14 novembre · Gli allegati scelti in creazione, in un
// punto solo per QuickAddTask e per la tab «Manuale» del BulkTaskCreator.
import { describe, it, expect, vi, beforeEach } from "vitest";

const upload = vi.fn();
vi.mock("../../lib/api.js", () => ({ TaskFiles: { upload: (...a) => upload(...a) } }));

const { separaPerDimensione, testoScartati, caricaAllegati } =
  await import("../../lib/tasks/allegatiInCreazione.js");
const { MAX_TASK_FILE_SIZE } = await import("../../lib/fileUtils.js");

const file = (name, size = 10) => ({ name, size });

beforeEach(() => {
  upload.mockReset();
  upload.mockResolvedValue({ error: null });
});

describe("separaPerDimensione e testoScartati", () => {
  it("tiene i file entro il limite e mette da parte gli altri", () => {
    const { validi, scartati } = separaPerDimensione([file("a.pdf"), file("b.zip", MAX_TASK_FILE_SIZE + 1)]);
    expect(validi.map(f => f.name)).toEqual(["a.pdf"]);
    expect(scartati.map(f => f.name)).toEqual(["b.zip"]);
  });

  it("nomina tutti gli scartati, al singolare e al plurale", () => {
    const grande = MAX_TASK_FILE_SIZE + 1;
    expect(testoScartati([file("b.zip", grande)])).toMatch(/^"b\.zip" supera il limite di/);
    expect(testoScartati([file("b.zip", grande), file("c.mov", grande)])).toMatch(/^"b\.zip", "c\.mov" superano il limite di/);
    expect(testoScartati([])).toBe("");
  });

  it("senza file ritorna due elenchi vuoti", () => {
    expect(separaPerDimensione(null)).toEqual({ validi: [], scartati: [] });
  });
});

describe("caricaAllegati", () => {
  const testo = (f, t) => `manca ${f.name} su ${t.title}`;

  it("carica in ordine, task per task, con l'autore", async () => {
    const preparati = [
      { task: { id: "t1", title: "Uno" }, files: [file("a.pdf"), file("b.pdf")] },
      { task: { id: "t2", title: "Due" }, files: [] },
      { task: { id: "t3", title: "Tre" }, files: [file("c.pdf")] },
    ];
    expect(await caricaAllegati(preparati, "marco", testo)).toEqual({ error: null });
    expect(upload.mock.calls.map(([f, id, o]) => [f.name, id, o.uploadedBy])).toEqual([
      ["a.pdf", "t1", "marco"], ["b.pdf", "t1", "marco"], ["c.pdf", "t3", "marco"],
    ]);
  });

  // `avviso` e non `error`: le task esistono, e un errore farebbe ripartire
  // la creazione (un secondo batch identico).
  it("al primo upload fallito si ferma e ritorna un avviso", async () => {
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: "rete" } });
    const preparati = [
      { task: { id: "t1", title: "Uno" }, files: [file("a.pdf"), file("b.pdf"), file("c.pdf")] },
    ];
    const esito = await caricaAllegati(preparati, "marco", testo);
    expect(esito).toEqual({ avviso: "manca b.pdf su Uno" });
    expect(esito).not.toHaveProperty("error");
    expect(upload).toHaveBeenCalledTimes(2);
  });
});
