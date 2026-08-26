// Normalizzazione dei valori importati da CSV/Excel.
//
// Queste funzioni vivevano dentro ImportTab, dove per esercitarle bisognava
// montare la modale e caricare un file finto: erano di fatto senza copertura.
// La regola sulle date italiane in particolare nasce da un bug in produzione —
// "05/03/2026" letto come 3 maggio invece che 5 marzo — e qui è finalmente
// verificabile in modo diretto.
import { describe, it, expect } from "vitest";
import {
  normCat, isRecognizedCat, normPrio, isRecognizedPrio, normStat, isRecognizedStat,
  normAssignee, normDate, detectColumns,
} from "../../lib/bulkImport.js";

const CATEGORIES = {
  booking:  { label: "Prenotazioni" },
  transfer: { label: "Transfer" },
  admin:    { label: "Amministrazione" },
};

const TEAM = [
  { id: "u1", name: "Marco Neri" },
  { id: "u2", name: "Giulia Ferri" },
];

describe("categoria", () => {
  it("accetta la chiave e l'etichetta, senza distinzione di maiuscole", () => {
    expect(normCat(CATEGORIES, "booking")).toBe("booking");
    expect(normCat(CATEGORIES, "Prenotazioni")).toBe("booking");
    expect(normCat(CATEGORIES, "  TRANSFER  ")).toBe("transfer");
  });

  it("un valore ignoto ricade su admin", () => {
    expect(normCat(CATEGORIES, "categoria inventata")).toBe("admin");
  });

  it("cella vuota: default silenzioso, nessuna segnalazione", () => {
    expect(normCat(CATEGORIES, "")).toBe("admin");
    expect(isRecognizedCat(CATEGORIES, "")).toBe(true);
  });

  it("cella piena ma non mappabile: da segnalare all'operatore", () => {
    // È la distinzione che serve all'avviso "N righe con categoria non
    // riconosciuta": senza, il default veniva applicato in silenzio.
    expect(isRecognizedCat(CATEGORIES, "boking")).toBe(false);
    expect(isRecognizedCat(CATEGORIES, "Prenotazioni")).toBe(true);
  });
});

describe("priorità e stato", () => {
  it("priorità: chiave o etichetta, default medium", () => {
    expect(normPrio("high")).toBe("high");
    expect(normPrio("")).toBe("medium");
    expect(normPrio("altissima")).toBe("medium");
    expect(isRecognizedPrio("altissima")).toBe(false);
    expect(isRecognizedPrio("")).toBe(true);
  });

  it("stato: chiave o etichetta, default todo", () => {
    expect(normStat("todo")).toBe("todo");
    expect(normStat("Da Fare")).toBe("todo");
    expect(normStat("boh")).toBe("todo");
    expect(isRecognizedStat("boh")).toBe(false);
  });
});

describe("assegnatario", () => {
  it("riconosce id, nome completo e nome di battesimo", () => {
    expect(normAssignee(TEAM, "u1")).toBe("u1");
    expect(normAssignee(TEAM, "Marco Neri")).toBe("u1");
    expect(normAssignee(TEAM, "Marco")).toBe("u1");
    expect(normAssignee(TEAM, "giulia")).toBe("u2");
  });

  it("sconosciuto o vuoto → nessun assegnatario", () => {
    expect(normAssignee(TEAM, "Sconosciuto")).toBeNull();
    expect(normAssignee(TEAM, "")).toBeNull();
    expect(normAssignee([], "Marco")).toBeNull();
  });
});

describe("scadenza", () => {
  it("gg/mm/aaaa è giorno-mese-anno, non mese-giorno", () => {
    // Il caso che aveva invertito i dati in produzione: Date nativo leggeva
    // "05/03/2026" come 3 maggio.
    expect(normDate("05/03/2026").slice(0, 10)).toBe("2026-03-05");
    expect(normDate("31/12/2026").slice(0, 10)).toBe("2026-12-31");
    expect(normDate("5-3-2026").slice(0, 10)).toBe("2026-03-05");
  });

  it("una data inesistente viene rifiutata, non fatta scivolare al giorno dopo", () => {
    expect(normDate("31/02/2026")).toBeNull();
    expect(normDate("32/01/2026")).toBeNull();
    expect(normDate("05/13/2026")).toBeNull();
  });

  it("anno a due cifre: <70 → 2000, altrimenti 1900", () => {
    expect(normDate("01/01/26").slice(0, 4)).toBe("2026");
    expect(normDate("01/01/85").slice(0, 4)).toBe("1985");
  });

  it("ISO e oggetti Date passano invariati", () => {
    expect(normDate("2026-03-05T10:00:00.000Z")).toBe("2026-03-05T10:00:00.000Z");
    const d = new Date("2026-03-05T10:00:00.000Z");
    expect(normDate(d)).toBe("2026-03-05T10:00:00.000Z");
  });

  it("vuoto o illeggibile → null", () => {
    expect(normDate("")).toBeNull();
    expect(normDate("prossima settimana")).toBeNull();
    expect(normDate(new Date("boh"))).toBeNull();
  });
});

describe("auto-mappatura colonne", () => {
  it("riconosce le intestazioni per sottostringa, senza distinzione di caso", () => {
    const m = detectColumns(["Titolo task", "DATA SCADENZA", "Cliente", "Note interne"]);
    expect(m.title).toBe("Titolo task");
    expect(m.dueDate).toBe("DATA SCADENZA");
    expect(m.client).toBe("Cliente");
    expect(m.description).toBe("Note interne");
  });

  it("i campi senza colonna corrispondente restano stringa vuota", () => {
    const m = detectColumns(["Titolo"]);
    expect(m.title).toBe("Titolo");
    expect(m.priority).toBe("");
    expect(m.assignee).toBe("");
  });

  it("restituisce sempre tutti i campi, anche senza colonne", () => {
    const m = detectColumns([]);
    expect(Object.keys(m).sort()).toEqual([
      "assignee", "category", "client", "contact", "description",
      "dueDate", "estimatedHours", "praticaRef", "priority", "status", "title",
    ]);
    expect(Object.values(m).every(v => v === "")).toBe(true);
  });
});
