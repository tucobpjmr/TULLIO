import { describe, it, expect, afterEach } from "vitest";
import { withPrototypePollutionGuard } from "../lib/xlsx.js";

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
});
