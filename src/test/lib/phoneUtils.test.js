import { describe, it, expect } from "vitest";
import { sanitizePhone, toWhatsAppNumber, firstPhoneIn } from "../../lib/phoneUtils.js";

describe("sanitizePhone", () => {
  it("rimuove spazi e separatori, mantiene il +", () => {
    expect(sanitizePhone("+39 340 123 4567")).toBe("+393401234567");
    expect(sanitizePhone("340-123-4567")).toBe("3401234567");
    expect(sanitizePhone("(011) 555.12.34")).toBe("0115551234");
  });
  it("vuoto se non ci sono cifre", () => {
    expect(sanitizePhone("")).toBe("");
    expect(sanitizePhone(null)).toBe("");
    expect(sanitizePhone("n/d")).toBe("");
  });
});

describe("toWhatsAppNumber", () => {
  it("numero nazionale italiano → antepone 39", () => {
    expect(toWhatsAppNumber("340 123 4567")).toBe("393401234567");
    expect(toWhatsAppNumber("011 5551234")).toBe("39011 5551234".replace(/[^\d]/g, ""));
  });
  it("+ e 00 → country code già presente", () => {
    expect(toWhatsAppNumber("+39 340 1234567")).toBe("393401234567");
    expect(toWhatsAppNumber("0039 340 1234567")).toBe("393401234567");
    expect(toWhatsAppNumber("+44 20 7946 0000")).toBe("442079460000");
  });
  it("vuoto se non ci sono cifre", () => {
    expect(toWhatsAppNumber("")).toBe("");
    expect(toWhatsAppNumber("—")).toBe("");
  });
});

describe("firstPhoneIn", () => {
  it("estrae il numero da testo libero", () => {
    expect(firstPhoneIn("Mario Rossi 340 123 4567")).toBe("340 123 4567");
    expect(firstPhoneIn("tel. +39 011 5551234 / mario@x.it")).toBe("+39 011 5551234");
  });
  it("null se nessun numero plausibile", () => {
    expect(firstPhoneIn("mario@x.it")).toBe(null);
    expect(firstPhoneIn("PR-2026-001")).toBe(null);
    expect(firstPhoneIn("")).toBe(null);
  });
});
