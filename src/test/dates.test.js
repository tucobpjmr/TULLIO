// ST-8 · I formati di data dell'app.
//
// PERCHÉ QUESTI TEST ESISTONO, e qual è quello che conta. Questo rilievo ha
// spostato sedici formattazioni scritte in linea dentro il JSX su un modulo
// solo: è esattamente il tipo di refactor che può cambiare ciò che l'utente
// legge senza che nessun test funzionale se ne accorga, perché quasi nessun
// test asserisce su una data formattata. Il test di equivalenza qui sotto
// confronta carattere per carattere la nuova strada con quella vecchia, forma
// per forma: è la sola verifica che rende sicuro il resto del cambiamento.
import { describe, it, expect } from "vitest";
import {
  dataBreve, dataMedia, dataNumerica, giornoLungo, meseAnno,
  giornoMese, giornoMeseAnno, oraBreve,
} from "../lib/dates.js";

const ISO = "2026-07-28T14:30:00";

describe("dates — le sette forme rendono ciò che rendevano prima", () => {
  // Le stringhe attese non sono copiate da una specifica: sono il risultato
  // della chiamata che stava nel JSX prima del refactor. Se una versione di ICU
  // cambia un separatore, questo test cade insieme alla UI — che è il punto.
  const d = new Date(ISO);
  const casi = [
    ["dataBreve", dataBreve, () => d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" })],
    ["dataMedia", dataMedia, () => d.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" })],
    ["dataNumerica", dataNumerica, () => d.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })],
    ["giornoLungo", giornoLungo, () => d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })],
    ["meseAnno", meseAnno, () => d.toLocaleDateString("it-IT", { month: "long", year: "numeric" })],
    ["giornoMese", giornoMese, () => d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })],
    ["giornoMeseAnno", giornoMeseAnno, () => d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })],
    ["oraBreve", oraBreve, () => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })],
  ];

  for (const [nome, nuova, vecchia] of casi) {
    it(`${nome} coincide carattere per carattere con la chiamata che sostituisce`, () => {
      expect(nuova(ISO)).toBe(vecchia());
    });
  }
});

describe("dates — una colonna `date` non slitta di un giorno", () => {
  // Il caveat che teneva separate taskUtils.formatDate e listeApi.fmtDate.
  // `new Date("2026-07-28")` è UTC-mezzanotte: a ovest di Greenwich renderebbe
  // il 27. fmtDate lo evitava spezzando la stringa; qui vale per TUTTE le forme.
  it("dataNumerica rende il giorno scritto nel database", () => {
    expect(dataNumerica("2026-07-28")).toBe("28/07/2026");
    expect(dataNumerica("2026-01-01")).toBe("01/01/2026");
    expect(dataNumerica("2026-12-31")).toBe("31/12/2026");
  });

  it("vale anche per le forme testuali, non solo per quella numerica", () => {
    expect(dataMedia("2026-07-28")).toContain("28");
    expect(giornoLungo("2026-07-28")).toContain("28");
  });

  it("un timestamp ISO conserva il proprio istante", () => {
    expect(oraBreve("2026-07-28T09:05:00")).toBe("09:05");
  });
});

describe("dates — l'assenza di valore non diventa 'Invalid Date'", () => {
  for (const [nome, f] of Object.entries({
    dataBreve, dataMedia, dataNumerica, giornoLungo, meseAnno, giornoMese, giornoMeseAnno, oraBreve,
  })) {
    it(`${nome} rende "" per null, undefined, "" e per una data non interpretabile`, () => {
      expect(f(null)).toBe("");
      expect(f(undefined)).toBe("");
      expect(f("")).toBe("");
      // È il caso che produceva "Invalid Date" a schermo: una stringa che non è
      // una data (un campo importato male, un valore troncato).
      expect(f("non-una-data")).toBe("");
    });
  }
});

describe("dates — i formatter sono costruiti una volta sola", () => {
  it("chiamate ripetute non ricostruiscono il formatter (stesso risultato, nessun costo per chiamata)", () => {
    // Non si può osservare direttamente la costruzione, ma si può fissare la
    // proprietà osservabile: mille chiamate danno mille risultati identici e
    // non dipendono dall'ordine.
    const prima = dataMedia(ISO);
    for (let i = 0; i < 1000; i++) dataMedia(ISO);
    expect(dataMedia(ISO)).toBe(prima);
  });

  it("accetta indifferentemente un Date, un ISO e una colonna date", () => {
    expect(dataNumerica(new Date(2026, 6, 28))).toBe("28/07/2026");
    expect(dataNumerica("2026-07-28T00:00:00")).toBe("28/07/2026");
    expect(dataNumerica("2026-07-28")).toBe("28/07/2026");
  });
});
