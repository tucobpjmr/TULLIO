import { describe, it, expect } from "vitest";
import { notesPreview, parseClientNotes } from "../lib/clientNotes.js";

// Le note "ereditate" sono quelle che ClientImportModal ripiega dalle colonne
// extra dell'export del gestionale legacy: una riga "Etichetta: valore" per
// colonna. Sul database sono 189 clienti su 816, tutti dallo stesso import.
const NOTE_IMPORT = [
  "Codice Fiscale: LBNNTN72T21F027V",
  "Cap: 74016",
  "Provincia: TA",
  "Regione: Puglia",
  "Nazione: Italia",
].join("\n");

describe("parseClientNotes — dati anagrafici vs note vere", () => {
  it("riconosce come campi le righe Etichetta: valore", () => {
    const { fields, text } = parseClientNotes(NOTE_IMPORT);
    expect(fields).toHaveLength(5);
    expect(fields[0]).toEqual({ label: "Codice Fiscale", value: "LBNNTN72T21F027V" });
    expect(fields[2]).toEqual({ label: "Provincia", value: "TA" });
    expect(text).toBe("");
  });

  it("tiene separate le note scritte a mano dai campi importati", () => {
    const { fields, text } = parseClientNotes(`Preferisce volo diretto\n${NOTE_IMPORT}`);
    expect(fields).toHaveLength(5);
    expect(text).toBe("Preferisce volo diretto");
  });

  // Una frase con i due punti non è un campo: l'etichetta dovrebbe essere
  // lunga quanto mezza riga. Senza il limite sulle parole, ogni nota discorsiva
  // finirebbe resa come "campo anagrafico".
  it("non scambia per campo una frase con i due punti", () => {
    const { fields, text } = parseClientNotes("Nota importante per il cliente: richiamare lunedì");
    expect(fields).toHaveLength(0);
    expect(text).toBe("Nota importante per il cliente: richiamare lunedì");
  });

  it("su note vuote non produce nulla", () => {
    expect(parseClientNotes(null)).toEqual({ fields: [], text: "" });
    expect(parseClientNotes("   ")).toEqual({ fields: [], text: "" });
  });
});

describe("notesPreview — anteprima nella card", () => {
  // È il caso che si vede in elenco: la card mostrava "Codice Fiscale: … Cap:
  // … Provincia: … Regione: Puglia Nazion…", cioè un dump troncato a 80
  // caratteri al posto di una nota.
  it("non mostra i dati anagrafici importati", () => {
    expect(notesPreview(NOTE_IMPORT)).toBe("");
  });

  it("mostra le note vere e le tronca", () => {
    expect(notesPreview("Preferisce volo diretto")).toBe("Preferisce volo diretto");
    expect(notesPreview("a".repeat(100))).toBe(`${"a".repeat(80)}…`);
  });
});

// La chiave d'identità e `tasksDelCliente` hanno traslocato in
// lib/chiaveCliente.js (M-4, 25 agosto): i loro test stanno in
// src/test/chiaveCliente.test.js.
