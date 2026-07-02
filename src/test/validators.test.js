import { describe, it, expect } from "vitest";
import { EMAIL_RX, isValidEmail } from "../lib/validators.js";

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
