import { describe, it, expect } from "vitest";
import { EMAIL_RX, PASSWORD_MIN, isValidEmail, passwordValida } from "../../lib/validators.js";

describe("isValidEmail", () => {
  it("accepts well-formed emails", () => {
    expect(isValidEmail("anna@agenzia.it")).toBe(true);
    expect(isValidEmail("anna.bianchi@sub.agenzia.co")).toBe(true);
    expect(isValidEmail("  anna@agenzia.it  ")).toBe(true); // trims before testing
  });

  it("rejects malformed emails", () => {
    expect(isValidEmail("mario@")).toBe(false);
    expect(isValidEmail("mario")).toBe(false);
    expect(isValidEmail("mario@agenzia")).toBe(false); // no TLD/dot
    expect(isValidEmail("mario @agenzia.it")).toBe(false); // embedded space
    expect(isValidEmail("mario,luca@agenzia.it")).toBe(false); // comma not allowed
    expect(isValidEmail("@agenzia.it")).toBe(false);
  });

  it("rejects empty/non-string input", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("   ")).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(undefined)).toBe(false);
  });
});

describe("EMAIL_RX", () => {
  it("is exported for callers that need the raw regex", () => {
    expect(EMAIL_RX.test("anna@agenzia.it")).toBe(true);
    expect(EMAIL_RX.test("not-an-email")).toBe(false);
  });
});

// M-4 dell'audit sicurezza del 26 agosto. La regola stava scritta a mano in due
// componenti; ora c'è una definizione sola, e questi test la inchiodano insieme
// al fatto che l'unico numero in gioco è PASSWORD_MIN — se domani diventasse 12
// per allinearsi a GoTrue, nessuna delle asserzioni qui sotto andrebbe riscritta
// a mano su un numero letterale.
describe("passwordValida", () => {
  it("rifiuta una password più corta del minimo, e lo dice nel messaggio", () => {
    const errore = passwordValida()("a".repeat(PASSWORD_MIN - 1));
    expect(errore).toBeTruthy();
    expect(errore).toContain(String(PASSWORD_MIN));
  });

  it("accetta una password lunga esattamente il minimo", () => {
    expect(passwordValida()("a".repeat(PASSWORD_MIN))).toBeNull();
  });

  it("rifiuta ciò che non è una stringa, invece di leggerne la lunghezza", () => {
    // `undefined.length` solleverebbe: il campo non compilato è il caso
    // normale al primo render, non un errore di programmazione.
    expect(passwordValida()(undefined)).toBeTruthy();
    expect(passwordValida()(null)).toBeTruthy();
  });

  it("non fa il trim: gli spazi in una password sono caratteri come gli altri", () => {
    // A differenza di `obbligatorio`/`emailValida`, qui una stringa di soli
    // spazi lunga abbastanza è una password legittima — è GoTrue a decidere,
    // e GoTrue conta i byte.
    expect(passwordValida()(" ".repeat(PASSWORD_MIN))).toBeNull();
  });

  it("usa il messaggio del chiamante quando ne passa uno", () => {
    expect(passwordValida("troppo corta")("abc")).toBe("troppo corta");
  });
});
