// ST-7 · Il reducer degli overlay del modulo Liste.
//
// Le asserzioni qui sotto non provano che "il reducer funziona": provano la
// proprietà per cui esiste, cioè che lo stato che il vecchio codice doveva
// tenere impossibile A MANO — due overlay aperti insieme — non sia più
// rappresentabile. È la stessa forma di verifica di reducerPurity.test.js: si
// asserisce sull'invariante, non sul comportamento di superficie.
import { describe, it, expect } from "vitest";
import { overlayIniziale, overlayReducer } from "../components/liste/listeReducers.js";

describe("overlayReducer", () => {
  it("parte con nessun overlay aperto", () => {
    expect(overlayIniziale).toEqual({ tipo: null, dati: null });
  });

  it("APRI porta il tipo e il corredo dell'overlay", () => {
    const s = overlayReducer(overlayIniziale, { type: "APRI", overlay: "nuova" });
    expect(s.tipo).toBe("nuova");
    expect(s.dati).toBeNull();

    const conDati = overlayReducer(overlayIniziale, {
      type: "APRI", overlay: "import", dati: { nL: 3, nM: 12 },
    });
    expect(conDati).toEqual({ tipo: "import", dati: { nL: 3, nM: 12 } });
  });

  it("aprire un overlay mentre un altro è aperto lo SOSTITUISCE", () => {
    // È l'invariante del rilievo: prima erano due setState per una transizione
    // sola (`setStrumentiOpen(false); setResetOpen(true);`) e dimenticare la
    // prima lasciava due finestre aperte.
    const strumenti = overlayReducer(overlayIniziale, { type: "APRI", overlay: "strumenti" });
    const reset = overlayReducer(strumenti, { type: "APRI", overlay: "reset" });
    expect(reset.tipo).toBe("reset");
    // Non "strumenti è false": strumenti non è più un valore che esiste.
    expect(Object.values(reset)).not.toContain("strumenti");
  });

  it("APRI non trascina il corredo dell'overlay precedente", () => {
    const conImport = overlayReducer(overlayIniziale, {
      type: "APRI", overlay: "import", dati: { nL: 3, payload: {} },
    });
    const dopo = overlayReducer(conImport, { type: "APRI", overlay: "nuova" });
    expect(dopo.dati).toBeNull();
  });

  it("CHIUDI torna allo stato iniziale, corredo compreso", () => {
    const aperto = overlayReducer(overlayIniziale, {
      type: "APRI", overlay: "import", dati: { nL: 1 },
    });
    expect(overlayReducer(aperto, { type: "CHIUDI" })).toEqual(overlayIniziale);
  });

  it("PROGRESSO aggiorna i dati dell'import senza chiudere l'overlay", () => {
    const aperto = overlayReducer(overlayIniziale, {
      type: "APRI", overlay: "import", dati: { nL: 2, nM: 9 },
    });
    const avanti = overlayReducer(aperto, { type: "PROGRESSO", progress: { done: 4, total: 9 } });
    expect(avanti.tipo).toBe("import");
    expect(avanti.dati).toEqual({ nL: 2, nM: 9, progress: { done: 4, total: 9 } });
  });

  it("PROGRESSO su un altro overlay è un no-op che ritorna lo STESSO oggetto", () => {
    // L'identità, non solo l'uguaglianza: una risposta tardiva del layer dati
    // arrivata dopo che l'utente ha cambiato finestra non deve nemmeno far
    // ri-renderizzare il modulo.
    const reset = overlayReducer(overlayIniziale, { type: "APRI", overlay: "reset" });
    expect(overlayReducer(reset, { type: "PROGRESSO", progress: { done: 1 } })).toBe(reset);
    expect(overlayReducer(overlayIniziale, { type: "PROGRESSO", progress: null })).toBe(overlayIniziale);
  });

  it("un'azione sconosciuta lascia lo stato intatto, per identità", () => {
    const aperto = overlayReducer(overlayIniziale, { type: "APRI", overlay: "nuova" });
    expect(overlayReducer(aperto, { type: "BOH" })).toBe(aperto);
  });

  it("è puro: non muta lo stato che riceve", () => {
    const aperto = Object.freeze({ tipo: "import", dati: Object.freeze({ nL: 1 }) });
    expect(() => overlayReducer(aperto, { type: "PROGRESSO", progress: { done: 1 } })).not.toThrow();
    expect(aperto.dati).toEqual({ nL: 1 });
  });
});
