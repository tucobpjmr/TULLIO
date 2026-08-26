import { describe, it, expect, afterEach } from "vitest";
import * as XLSX from "xlsx";
import { withPrototypePollutionGuard, detectHeaderRowIndex, readFirstSheetRowsAutoHeader } from "../../lib/xlsx.js";

const CLIENT_HINTS = [
  "nome", "ragionesociale", "ragione sociale", "nominativo", "titolo",
  "email", "mail", "telefono", "cellulare", "citta", "città", "indirizzo",
  "codicefiscale", "codice fiscale", "cap", "name", "phone", "city", "address",
];

// Simula un export di gestionale legacy: righe di titolo/metadati vuote prima
// della vera intestazione — lo stesso pattern del file allegato dall'utente
// (Anagrafica clienti), qui con dati sintetici, non reali.
const buildLegacyStyleWorkbook = () => {
  const aoa = [
    ["Esportazione del : 01/01/2026"],
    [],
    [],
    ["Titolo", "RagioneSociale", "CodiceFiscale", "Indirizzo", "Citta", "Telefono1", "Cellulare", "Email", "Cliente"],
    ["Egr.Sig.", "MARIO ROSSI", "RSSMRA80A01H501Z", "VIA ROMA 1", "ROMA", "", "3331234567", "mario.rossi@example.com", "Si"],
    ["Gent.Sig.ra", "ANNA VERDI", "VRDNNA85B02F205X", "VIA MILANO 2", "MILANO", "0212345678", "", "", "Si"],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
};

describe("detectHeaderRowIndex", () => {
  it("individua la riga header dopo un blocco di titolo/righe vuote", () => {
    const rows2d = [
      ["Esportazione del : 01/01/2026"],
      [],
      [],
      ["Titolo", "RagioneSociale", "Email", "Telefono1", "Citta"],
      ["Egr.Sig.", "MARIO ROSSI", "mario@example.com", "333", "ROMA"],
    ];
    expect(detectHeaderRowIndex(rows2d, CLIENT_HINTS)).toBe(3);
  });

  it("ripiega sulla riga 0 quando l'intestazione è già in prima posizione", () => {
    const rows2d = [
      ["Nome", "Email", "Telefono"],
      ["Mario Rossi", "mario@example.com", "333"],
    ];
    expect(detectHeaderRowIndex(rows2d, CLIENT_HINTS)).toBe(0);
  });
});

describe("readFirstSheetRowsAutoHeader", () => {
  it("legge le righe dati saltando il blocco di titolo/metadati", async () => {
    const buf = buildLegacyStyleWorkbook();
    const { rows, columns } = await readFirstSheetRowsAutoHeader(buf.buffer ?? buf, CLIENT_HINTS);
    expect(columns).toContain("RagioneSociale");
    expect(rows).toHaveLength(2);
    expect(rows[0].RagioneSociale).toBe("MARIO ROSSI");
    expect(rows[1].RagioneSociale).toBe("ANNA VERDI");
  });
});

// Verifica la mitigazione applicativa per la Prototype Pollution di SheetJS
// 0.18.5 (GHSA-4r6h-8v6p-xvw6), fintanto che non si migra al tarball CDN.
describe("withPrototypePollutionGuard", () => {
  afterEach(() => {
    // pulizia difensiva nel caso un test lasci residui
    delete Object.prototype.__polluted__;
  });

  it("restituisce il valore della callback quando non c'è pollution", () => {
    expect(withPrototypePollutionGuard(() => 42)).toBe(42);
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("__polluted__");
  });

  it("rileva, rimuove e rifiuta se il parse inquina Object.prototype", () => {
    expect(() =>
      withPrototypePollutionGuard(() => {
        // simula ciò che farebbe un file .xlsx malevolo durante il parsing
        Object.prototype.__polluted__ = "pwned";
        return "unreachable";
      })
    ).toThrow(/prototype pollution/i);

    // la proprietà iniettata deve essere stata rimossa da Object.prototype
    expect("__polluted__" in {}).toBe(false);
    expect(Object.getOwnPropertyNames(Object.prototype)).not.toContain("__polluted__");
  });

  it("non segnala come pollution le proprietà legittime pre-esistenti", () => {
    // hasOwnProperty & co. esistono già nel baseline: non devono far fallire
    expect(() =>
      withPrototypePollutionGuard(() => {
        void Object.prototype.hasOwnProperty;
        return "ok";
      })
    ).not.toThrow();
  });

  it("rileva la sovrascrittura di una proprietà esistente (toString)", () => {
    const originale = Object.prototype.toString;
    let errore = null;
    try {
      withPrototypePollutionGuard(() => {
        // il nome "toString" c'era già: un guard che guarda solo l'insieme
        // dei nomi non vede questa mutazione, ma è pollution lo stesso
        Object.prototype.toString = () => "pwned";
        return "unreachable";
      });
    } catch (e) {
      errore = e;
    } finally {
      // il guard non ripristina le sovrascritture (solo le aggiunte): tocca al
      // test riportare il baseline reale allo stato di partenza — PRIMA di
      // qualunque expect(), perché i matcher di Vitest usano internamente
      // Object.prototype.toString.call() e un toString ancora avvelenato li
      // manda fuori strada
      Object.prototype.toString = originale;
    }
    expect(errore).not.toBeNull();
    expect(errore.message).toMatch(/prototype pollution/i);
  });

  it("rileva l'inquinamento di Array.prototype, non solo di Object.prototype", () => {
    expect(() =>
      withPrototypePollutionGuard(() => {
        Array.prototype.__polluted__ = "pwned";
        return "unreachable";
      })
    ).toThrow(/prototype pollution/i);
    expect(Object.getOwnPropertyNames(Array.prototype)).not.toContain("__polluted__");
  });
});
