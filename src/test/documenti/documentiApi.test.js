// Il data layer dell'archivio documenti: l'ORDINE delle operazioni.
//
// Upload e delete toccano due depositi — la tabella dei metadati e il bucket —
// e in entrambi i casi l'ordine è la parte che si può sbagliare. Sono le due
// invarianti che questo file fissa:
//
//   • UPLOAD: prima il file, poi la riga. Se la riga viene rifiutata, il file
//     appena caricato si rimuove — altrimenti un import da 1000 documenti che
//     incontra 50 rifiuti lascia 50 oggetti pagati e mai referenziati.
//   • DELETE: prima la riga, poi il file. L'operazione IRREVERSIBILE va per
//     ultima (M-3 del 14 agosto, terzo passaggio, pagata sulla chat):
//     cancellare il file e poi scoprire che la RLS rifiuta la riga significa
//     aver distrutto il documento lasciando in archivio la scheda che lo
//     promette.
import { describe, it, expect, vi, beforeEach } from "vitest";

const stato = {
  upload: { data: { path: "uuid/LEPORE_PAOLO.jpg" }, error: null },
  insert: { data: null, error: null },
  delete: { data: null, error: null, count: 1 },
  storageRemove: { data: null, error: null },
};
let chiamate = [];

const uploadMock = vi.fn((path) => {
  chiamate.push({ op: "storage.upload", path });
  return Promise.resolve(stato.upload);
});
const removeMock = vi.fn((paths) => {
  chiamate.push({ op: "storage.remove", paths });
  return Promise.resolve(stato.storageRemove);
});
const insertMock = vi.fn((riga) => {
  chiamate.push({ op: "insert", riga });
  return {
    select: () => ({ single: () => Promise.resolve(stato.insert) }),
  };
});
const deleteMock = vi.fn(() => {
  chiamate.push({ op: "delete" });
  return { eq: () => Promise.resolve(stato.delete) };
});

vi.mock("../../lib/supabase", () => {
  const supabase = {
    from: vi.fn((tabella) => {
      if (tabella !== "documenti_identita") throw new Error(`tabella inattesa: ${tabella}`);
      return { insert: insertMock, delete: deleteMock };
    }),
    storage: {
      from: vi.fn((bucket) => {
        if (bucket !== "documenti-identita") throw new Error(`bucket inatteso: ${bucket}`);
        return { upload: uploadMock, remove: removeMock };
      }),
    },
  };
  return { supabase, getSupabase: () => Promise.resolve(supabase) };
});

const { DocumentiIdentita } = await import("../../lib/api.js");

const blob = { size: 300_000, type: "image/jpeg" };
const meta = { passeggero: "LEPORE PAOLO", tipo: "passaporto" };

beforeEach(() => {
  chiamate = [];
  vi.clearAllMocks();
  stato.upload = { data: { path: "uuid/LEPORE_PAOLO.jpg" }, error: null };
  stato.insert = { data: { id: "d1", passeggero: "LEPORE PAOLO" }, error: null };
  stato.delete = { data: null, error: null, count: 1 };
  stato.storageRemove = { data: null, error: null };
});

describe("DocumentiIdentita.upload", () => {
  it("carica il file e POI scrive la riga", async () => {
    await DocumentiIdentita.upload(blob, "LEPORE_PAOLO.jpg", meta, "u1");
    expect(chiamate.map((c) => c.op)).toEqual(["storage.upload", "insert"]);
  });

  // Il path porta un uuid davanti al nome: due passeggeri omonimi non devono
  // poter sovrascrivere il documento l'uno dell'altro.
  it("il path è <uuid>/<nome sanificato>, non il solo nome", async () => {
    await DocumentiIdentita.upload(blob, "LEPORE PAOLO.jpg", meta, "u1");
    const { path } = chiamate.find((c) => c.op === "storage.upload");
    expect(path).toMatch(/^[0-9a-f-]{36}\/LEPORE_PAOLO\.jpg$/);
  });

  it("registra chi ha caricato: la policy di INSERT esige il proprio id", async () => {
    await DocumentiIdentita.upload(blob, "LEPORE_PAOLO.jpg", meta, "u1");
    expect(chiamate.find((c) => c.op === "insert").riga).toMatchObject({
      passeggero: "LEPORE PAOLO",
      uploaded_by: "u1",
      file_size: 300_000,
      file_type: "image/jpeg",
    });
  });

  it("un upload fallito non prova nemmeno a scrivere la riga", async () => {
    stato.upload = { data: null, error: { message: "MIME non ammesso" } };
    const r = await DocumentiIdentita.upload(blob, "x.jpg", meta, "u1");

    expect(r.error.message).toBe("MIME non ammesso");
    expect(chiamate.map((c) => c.op)).toEqual(["storage.upload"]);
  });

  // La compensazione: senza, ogni riga rifiutata lascia un file orfano nel
  // bucket — invisibile nell'app e pagato lo stesso.
  it("se la riga viene rifiutata, il file appena caricato viene rimosso", async () => {
    stato.insert = { data: null, error: { message: "RLS" } };
    const r = await DocumentiIdentita.upload(blob, "LEPORE_PAOLO.jpg", meta, "u1");

    expect(chiamate.map((c) => c.op)).toEqual(["storage.upload", "insert", "storage.remove"]);
    // L'errore restituito resta quello VERO, non quello della compensazione.
    expect(r.error.message).toBe("RLS");
  });

  it("se anche la rimozione fallisce, l'errore riportato resta quello della riga", async () => {
    stato.insert = { data: null, error: { message: "RLS" } };
    removeMock.mockImplementationOnce(() => Promise.reject(new Error("rete")));
    const r = await DocumentiIdentita.upload(blob, "LEPORE_PAOLO.jpg", meta, "u1");
    expect(r.error.message).toBe("RLS");
  });
});

describe("DocumentiIdentita.remove", () => {
  it("elimina prima la riga e poi il file", async () => {
    await DocumentiIdentita.remove("d1", "uuid/LEPORE_PAOLO.jpg");
    expect(chiamate.map((c) => c.op)).toEqual(["delete", "storage.remove"]);
  });

  // `count === 0` è un rifiuto della RLS travestito da successo: la clausola
  // USING non solleva, rende le righe invisibili (C-1 del 14 agosto, secondo
  // passaggio). Distruggere il file a quel punto sarebbe il caso peggiore.
  it("una riga che la RLS non lascia toccare non fa cancellare il file", async () => {
    stato.delete = { data: null, error: null, count: 0 };
    const r = await DocumentiIdentita.remove("d1", "uuid/LEPORE_PAOLO.jpg");

    expect(chiamate.map((c) => c.op)).toEqual(["delete"]);
    expect(r.count).toBe(0);
  });

  it("un errore sulla riga non fa cancellare il file", async () => {
    stato.delete = { data: null, error: { message: "boom" }, count: null };
    await DocumentiIdentita.remove("d1", "uuid/LEPORE_PAOLO.jpg");
    expect(chiamate.map((c) => c.op)).toEqual(["delete"]);
  });
});
