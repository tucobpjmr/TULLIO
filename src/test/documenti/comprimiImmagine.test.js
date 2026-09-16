// Il ridimensionamento che tiene l'archivio dentro il piano Free.
//
// `dimensioniRidotte` è la sola parte del modulo su cui si possa sbagliare un
// conto — il resto è canvas, cioè DOM. Se questa funzione sbaglia il fattore,
// mille documenti finiscono caricati alla risoluzione sbagliata e nessuno se
// ne accorge finché lo spazio non finisce.
import { describe, it, expect } from "vitest";
import {
  dimensioniRidotte, ricomprimibile, comprimiSePossibile, LATO_MASSIMO,
} from "../../lib/comprimiImmagine.js";

describe("dimensioniRidotte", () => {
  it("porta il lato lungo alla soglia mantenendo le proporzioni", () => {
    // 4000×3000 (4:3, una foto da smartphone) → 1600×1200
    expect(dimensioniRidotte(4000, 3000)).toEqual({ larghezza: LATO_MASSIMO, altezza: 1200 });
    // Verticale: la soglia si applica all'altezza
    expect(dimensioniRidotte(3000, 4000)).toEqual({ larghezza: 1200, altezza: LATO_MASSIMO });
  });

  // Ingrandire costerebbe byte senza aggiungere un solo pixel di
  // informazione: un'immagine già piccola passa invariata.
  it("non ingrandisce un'immagine già sotto la soglia", () => {
    expect(dimensioniRidotte(800, 600)).toEqual({ larghezza: 800, altezza: 600 });
    expect(dimensioniRidotte(LATO_MASSIMO, 900)).toEqual({ larghezza: LATO_MASSIMO, altezza: 900 });
  });

  // Una scansione a striscia (uno scontrino, la banda MRZ ritagliata)
  // arrotonderebbe il lato corto a 0, e una canvas 1600×0 produce un blob
  // vuoto invece di un errore: il file sarebbe «caricato» e illeggibile.
  it("non azzera il lato corto di un'immagine molto allungata", () => {
    const r = dimensioniRidotte(20000, 5);
    expect(r.larghezza).toBe(LATO_MASSIMO);
    expect(r.altezza).toBeGreaterThanOrEqual(1);
  });

  it("dimensioni non valide danno zero invece di NaN", () => {
    expect(dimensioniRidotte(0, 100)).toEqual({ larghezza: 0, altezza: 0 });
    expect(dimensioniRidotte(undefined, undefined)).toEqual({ larghezza: 0, altezza: 0 });
    expect(dimensioniRidotte(-10, 20)).toEqual({ larghezza: 0, altezza: 0 });
  });
});

describe("ricomprimibile", () => {
  it("riconosce i formati che il browser sa decodificare ovunque", () => {
    expect(ricomprimibile({ type: "image/jpeg" })).toBe(true);
    expect(ricomprimibile({ type: "image/png" })).toBe(true);
    expect(ricomprimibile({ type: "image/webp" })).toBe(true);
  });

  it("ignora il parametro dopo il punto e virgola", () => {
    expect(ricomprimibile({ type: "image/jpeg; charset=binary" })).toBe(true);
  });

  // HEIC lo decodifica solo Safari, e i PDF non si ricomprimono con una
  // canvas senza rasterizzarli: entrambi passano intatti, e il tetto del
  // bucket resta l'ultima parola.
  it("lascia fuori HEIC e PDF", () => {
    expect(ricomprimibile({ type: "image/heic" })).toBe(false);
    expect(ricomprimibile({ type: "application/pdf" })).toBe(false);
    expect(ricomprimibile({ type: "" })).toBe(false);
    expect(ricomprimibile(undefined)).toBe(false);
  });
});

describe("comprimiSePossibile", () => {
  // Il contratto che l'import da mille file poggia su questa funzione: un file
  // che non si può comprimere NON fa fallire la riga, passa com'è.
  it("un formato non ricomprimibile torna intatto invece di sollevare", async () => {
    const file = { type: "application/pdf", size: 900 };
    await expect(comprimiSePossibile(file)).resolves.toEqual({
      blob: file, compresso: false, tipo: "application/pdf",
    });
  });

  it("un file senza tipo riconoscibile ricade su octet-stream", async () => {
    const file = { size: 10 };
    const r = await comprimiSePossibile(file);
    expect(r.compresso).toBe(false);
    expect(r.tipo).toBe("application/octet-stream");
  });

  // In jsdom la canvas non produce un blob: `comprimiImmagine` solleva e la
  // funzione deve restituire l'originale. È lo stesso ramo che copre un
  // browser esotico, e qui si verifica che esista davvero.
  it("una compressione fallita restituisce l'originale", async () => {
    const file = { type: "image/jpeg", size: 1234 };
    const r = await comprimiSePossibile(file);
    expect(r.blob).toBe(file);
    expect(r.compresso).toBe(false);
  });
});
