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

// M-4 dell'audit sicurezza del 26 agosto, esteso da A-3 dell'audit del 4
// settembre: lunghezza minima E requisiti di composizione, non solo la
// prima. Questi test la inchiodano insieme al fatto che l'unico numero in
// gioco è PASSWORD_MIN — se domani cambiasse per riallinearsi a GoTrue,
// nessuna delle asserzioni qui sotto andrebbe riscritta a mano su un numero
// letterale.
describe("passwordValida", () => {
  it("rifiuta una password più corta del minimo, e lo dice nel messaggio", () => {
    const errore = passwordValida()("Aa1" + "a".repeat(PASSWORD_MIN - 4));
    expect(errore).toBeTruthy();
    expect(errore).toContain(String(PASSWORD_MIN));
  });

  it("accetta una password lunga esattamente il minimo con tutti i requisiti", () => {
    expect(passwordValida()("Aa1" + "a".repeat(PASSWORD_MIN - 3))).toBeNull();
  });

  it("rifiuta ciò che non è una stringa, invece di leggerne la lunghezza", () => {
    // `undefined.length` solleverebbe: il campo non compilato è il caso
    // normale al primo render, non un errore di programmazione.
    expect(passwordValida()(undefined)).toBeTruthy();
    expect(passwordValida()(null)).toBeTruthy();
  });

  it("rifiuta una password lunga abbastanza ma senza composizione, e nomina cosa manca", () => {
    // Lunga il minimo ma di sole minuscole: era il caso che A-3 chiude —
    // "password"/"12345678" passavano prima di questo fix.
    const errore = passwordValida()("a".repeat(PASSWORD_MIN));
    expect(errore).toBeTruthy();
    expect(errore).toContain("maiuscola");
    expect(errore).toContain("cifra");
    // La lunghezza però era già a posto: non ricompare fra ciò che manca.
    expect(errore).not.toContain(`${PASSWORD_MIN} caratteri`);
  });

  it("non fa il trim: gli spazi in una password sono caratteri come gli altri", () => {
    // A differenza di `obbligatorio`/`emailValida`, qui uno spazio conta
    // come carattere ai fini della lunghezza — è GoTrue a decidere, e
    // GoTrue conta i byte. Composizione a parte (una stringa di soli spazi
    // non ha maiuscole/cifre e viene comunque rifiutata per quello).
    const errore = passwordValida()("Aa1" + " ".repeat(PASSWORD_MIN - 3));
    expect(errore).toBeNull();
  });
});
