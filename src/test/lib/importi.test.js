// src/test/lib/importi.test.js
//
// C-1 e M-1 dell'audit di codebase del 31 agosto.
//
// PERCHÉ QUESTO FILE ESISTE, E NON BASTAVA ALLARGARE QUELLO DI PRIMA.
// `parseImporto` era già testata — `src/test/liste/listeApi.test.js`, sei
// asserzioni — e i test passavano tutti mentre la funzione leggeva `1.250,00`
// come 1,25. Non erano test sbagliati: erano test su un solo ordine di
// grandezza. `"12,50"`, `"12.50"`, `"0"`, `""`, `"abc"`, `null`: **nessun
// valore sopra le mille unità**, cioè nessuno in cui il separatore delle
// migliaia possa comparire. Il difetto viveva esattamente nello spazio che
// nessuna asserzione occupava.
//
// La lezione, e il criterio con cui questo file è scritto: per una funzione
// che interpreta testo, il caso da coprire non è «un valore valido e un valore
// non valido» ma **ogni forma in cui la stessa cifra può essere scritta**. Le
// tabelle qui sotto sono organizzate così — per FORMA, non per esito.
import { describe, it, expect } from "vitest";
import { aNumero, parseImporto } from "../../lib/importi.js";

describe("aNumero — il punto come separatore delle migliaia", () => {
  // ⚠️ Questa è la tabella che C-1 avrebbe fatto fallire: prima della
  // correzione la colonna «atteso» conteneva 1.25, 12.345 e 1.234.
  it.each([
    ["1.250,00", 1250],
    ["12.345,67", 12345.67],
    ["1.234.567,89", 1234567.89],
    ["999.999,99", 999999.99],
    ["1.250", 1250],
    ["1.234.567", 1234567],
  ])("legge %j come %d", (grezzo, atteso) => {
    expect(aNumero(grezzo)).toBe(atteso);
  });
});

describe("aNumero — il punto come separatore decimale", () => {
  // Il criterio è QUANTE cifre il punto raggruppa: tre = migliaia, una o due =
  // decimale all'inglese. Senza questa metà, unificare sul parser dello script
  // avrebbe rotto "12.50" — che il modulo Liste leggeva già bene.
  it.each([
    ["12.50", 12.5],
    ["0.99", 0.99],
    ["1.5", 1.5],
    ["1250", 1250],
    ["1250,5", 1250.5],
    ["100,50", 100.5],
  ])("legge %j come %d", (grezzo, atteso) => {
    expect(aNumero(grezzo)).toBe(atteso);
  });
});

describe("aNumero — spazi e segno digitato", () => {
  it("ignora gli spazi ovunque siano", () => {
    // "1 250,00" valeva 1 prima della correzione: parseFloat si fermava allo
    // spazio.
    expect(aNumero("1 250,00")).toBe(1250);
    expect(aNumero("  1.250,00  ")).toBe(1250);
  });

  it("conserva il segno digitato (è parseImporto a decidere che farne)", () => {
    expect(aNumero("-1.250,00")).toBe(-1250);
    expect(aNumero("-12.50")).toBe(-12.5);
  });
});

describe("aNumero — rifiuta invece di leggere il prefisso", () => {
  // B-1 dello stesso audit. `parseFloat("12abc")` vale 12: una battitura
  // sbagliata diventava un movimento valido. `Number` è un rifiuto.
  it.each([
    ["12abc"], ["abc"], ["€100"], ["1,2,3"], ["1.2.3"], ["--5"], [""], ["   "],
    [null], [undefined], [{}],
  ])("rifiuta %j", (grezzo) => {
    expect(aNumero(grezzo)).toBeNull();
  });

  it("rifiuta le forme non finite", () => {
    expect(aNumero("Infinity")).toBeNull();
    expect(aNumero("NaN")).toBeNull();
  });
});

describe("parseImporto — il segno lo decide il form", () => {
  it("applica il segno passato, ignorando quello digitato", () => {
    expect(parseImporto("1.250,00", -1)).toBe(-1250);
    expect(parseImporto("-1.250,00", 1)).toBe(1250);
    expect(parseImporto("12,50", -1)).toBe(-12.5);
  });

  it("tratta come entrata qualunque segno non negativo", () => {
    expect(parseImporto("12,50")).toBe(12.5);
    expect(parseImporto("12,50", 0)).toBe(12.5);
  });
});

describe("parseImporto — zero e centesimi", () => {
  it("rifiuta lo zero, comunque scritto", () => {
    // Lo rifiuta anche il database (check (importo <> 0)): qui si evita il
    // round-trip e si dà un messaggio in italiano sotto il campo.
    expect(parseImporto("0")).toBeNull();
    expect(parseImporto("0,00")).toBeNull();
    expect(parseImporto("0.000")).toBeNull();
  });

  it("arrotonda ai centesimi PRIMA di confrontare con zero", () => {
    // 0,004 a database diventerebbe 0.00 e violerebbe il check: se qui
    // passasse, il rifiuto arriverebbe come check_violation invece che come
    // errore di campo.
    expect(parseImporto("0,004")).toBeNull();
    expect(parseImporto("0,005")).toBe(0.01);
  });

  it("arrotonda ai due decimali di numeric(12,2)", () => {
    // Senza, a schermo resterebbe la cifra digitata e a database un'altra —
    // la stessa classe di difetto di C-1, in scala ridotta.
    expect(parseImporto("1,239")).toBe(1.24);
    expect(parseImporto("1.250,004")).toBe(1250);
  });
});

describe("parseImporto — la cifra che il messaggio di errore suggerisce", () => {
  it("legge «1.250,00» come milleduecentocinquanta euro", () => {
    // regoleMovimento.js dice, alla lettera: «Importo non valido: usa una
    // cifra come 1.250,00.» Prima della correzione quella cifra passava la
    // validazione e diventava 1,25. Questo test è quel messaggio, verificato.
    expect(parseImporto("1.250,00")).toBe(1250);
    expect(parseImporto("1.250,00")).not.toBe(1.25);
  });
});
