// L'orchestrazione dell'import massivo.
//
// Le tre proprietà che l'import deve avere su mille file, e che nessuna prova
// manuale verificherebbe: che lavori A BLOCCHI (non mille richieste insieme),
// che un file rifiutato NON fermi gli altri, e che l'interruzione si fermi al
// confine di un blocco invece che a metà di un caricamento in volo.
import { describe, it, expect, vi } from "vitest";
import { importaDocumenti, aBlocchi, DIMENSIONE_BLOCCO } from "../../components/documenti/importaDocumenti.js";

const riga = (nome, size = 1000) => ({ file: { name: nome, size }, passeggero: nome.replace(/_/g, " ").replace(/\.\w+$/, "") });
const righe = (n) => Array.from({ length: n }, (_, i) => riga(`ROSSI_${i}.jpg`));

// Comprime dimezzando: il risparmio atteso è quindi metà del peso originale,
// che è ciò che il riepilogo mostra all'utente.
const comprimiFinto = async (file) => ({ blob: { size: Math.floor(file.size / 2) }, compresso: true });

describe("aBlocchi", () => {
  it("divide in blocchi della dimensione richiesta, l'ultimo più corto", () => {
    expect(aBlocchi([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("regge un elenco vuoto o assente", () => {
    expect(aBlocchi([], 4)).toEqual([]);
    expect(aBlocchi(undefined, 4)).toEqual([]);
  });
});

describe("importaDocumenti", () => {
  it("carica tutti i file e riporta lo spazio risparmiato", async () => {
    const carica = vi.fn(async () => ({ error: null }));
    const esito = await importaDocumenti(righe(6), { comprimi: comprimiFinto, carica });

    expect(esito.caricati).toBe(6);
    expect(esito.falliti).toEqual([]);
    expect(esito.byteRisparmiati).toBe(6 * 500);
    expect(carica).toHaveBeenCalledTimes(6);
  });

  it("passa a ogni riga il proprio passeggero e i metadati comuni", async () => {
    const carica = vi.fn(async () => ({ error: null }));
    await importaDocumenti([riga("LEPORE_PAOLO.jpg")], {
      comprimi: comprimiFinto, carica, metaComuni: { tipo: "carta_identita" },
    });

    expect(carica).toHaveBeenCalledWith(
      expect.anything(),
      "LEPORE_PAOLO.jpg",
      { tipo: "carta_identita", passeggero: "LEPORE PAOLO" },
    );
  });

  // Il cuore della cosa: mille upload lanciati insieme accodano le richieste,
  // tengono mille blob in memoria e fanno arrivare il primo errore quando
  // ormai sono tutte partite.
  it("non tiene in volo più di un blocco alla volta", async () => {
    let inVolo = 0;
    let massimo = 0;
    const carica = async () => {
      inVolo += 1;
      massimo = Math.max(massimo, inVolo);
      await Promise.resolve();
      inVolo -= 1;
      return { error: null };
    };

    await importaDocumenti(righe(20), { comprimi: comprimiFinto, carica });
    expect(massimo).toBeLessThanOrEqual(DIMENSIONE_BLOCCO);
  });

  // Su mille file un rifiuto è normale (MIME non ammesso, file troppo
  // grande): interrompere lì perderebbe i 999 restanti.
  it("un file rifiutato non ferma gli altri", async () => {
    const carica = vi.fn(async (_blob, nomeFile) =>
      (nomeFile === "ROSSI_3.jpg" ? { error: { message: "MIME non ammesso" } } : { error: null }));

    const esito = await importaDocumenti(righe(6), { comprimi: comprimiFinto, carica });

    expect(esito.caricati).toBe(5);
    expect(esito.falliti).toEqual([
      { nomeFile: "ROSSI_3.jpg", passeggero: "ROSSI 3", motivo: "MIME non ammesso" },
    ]);
  });

  it("riporta anche l'eccezione sollevata dalla compressione", async () => {
    const comprimi = async (file) => {
      if (file.name === "ROSSI_1.jpg") throw new Error("immagine non decodificabile");
      return { blob: { size: 500 }, compresso: true };
    };
    const esito = await importaDocumenti(righe(3), { comprimi, carica: async () => ({ error: null }) });

    expect(esito.caricati).toBe(2);
    expect(esito.falliti[0].motivo).toBe("immagine non decodificabile");
  });

  it("riporta l'avanzamento a ogni blocco", async () => {
    const avanzamenti = [];
    await importaDocumenti(righe(10), {
      comprimi: comprimiFinto,
      carica: async () => ({ error: null }),
      onProgresso: (fatti, totale) => avanzamenti.push([fatti, totale]),
    });

    expect(avanzamenti).toEqual([[4, 10], [8, 10], [10, 10]]);
  });

  // L'interruzione si valuta FRA un blocco e l'altro: fermare un blocco già
  // partito lascerebbe oggetti caricati senza la loro riga di metadati.
  it("interrompe al confine del blocco, non a metà", async () => {
    let annulla = false;
    const carica = vi.fn(async () => ({ error: null }));
    const esito = await importaDocumenti(righe(12), {
      comprimi: comprimiFinto,
      carica,
      onProgresso: () => { annulla = true; },
      annullato: () => annulla,
    });

    expect(esito.interrotto).toBe(true);
    // Il primo blocco è andato per intero; il secondo non è partito.
    expect(esito.caricati).toBe(DIMENSIONE_BLOCCO);
    expect(carica).toHaveBeenCalledTimes(DIMENSIONE_BLOCCO);
  });

  it("un elenco vuoto è un import riuscito da zero file", async () => {
    const esito = await importaDocumenti([], { comprimi: comprimiFinto, carica: vi.fn() });
    expect(esito).toEqual({ caricati: 0, falliti: [], byteRisparmiati: 0, interrotto: false });
  });
});
